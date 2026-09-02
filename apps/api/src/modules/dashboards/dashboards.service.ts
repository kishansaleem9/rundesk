import { Injectable, Inject, NotFoundException, ForbiddenException } from '@nestjs/common'
import { eq, and, or, ne, inArray, sql } from 'drizzle-orm'
import { dashboardPresets, userDockConfigs, workspaceMembers, objectShares, users } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { CreateDashboardPresetDto, UpdateDashboardPresetDto } from './dto/dashboard-preset.dto'

/** The acting user as attached to the request by JwtAuthGuard. */
export type DashboardActor = { id: string; role?: string | null }

@Injectable()
export class DashboardsService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  // --- Dashboard Presets ---------------------------------------------------
  /**
   * A member sees their own presets plus the admin-set workspace-default preset
   * (which another user may own), so the UI can show and manage it. §5.7
   *
   * A5.11 — plus anything shared with them via `object_shares`, and every row
   * carries the owner and its share count so the hub can render an index with
   * Owner / Sharing columns instead of a bare name dropdown.
   */
  async listPresets(userId: string, workspaceId: string) {
    const sharedIds = await this.presetIdsSharedWith(workspaceId, userId)
    const rows = await this.db
      .select({
        id: dashboardPresets.id,
        userId: dashboardPresets.userId,
        workspaceId: dashboardPresets.workspaceId,
        name: dashboardPresets.name,
        layout: dashboardPresets.layout,
        isDefault: dashboardPresets.isDefault,
        isWorkspaceDefault: dashboardPresets.isWorkspaceDefault,
        createdAt: dashboardPresets.createdAt,
        updatedAt: dashboardPresets.updatedAt,
        ownerName: users.displayName,
        ownerEmail: users.email,
        shareCount: sql<number>`(
          select count(*)::int from object_shares os
          where os.object_type = 'dashboard' and os.object_id = dashboard_presets.id
        )`,
      })
      .from(dashboardPresets)
      .leftJoin(users, eq(users.id, dashboardPresets.userId))
      .where(
        and(
          eq(dashboardPresets.workspaceId, workspaceId),
          or(
            eq(dashboardPresets.userId, userId),
            eq(dashboardPresets.isWorkspaceDefault, true),
            sharedIds.length > 0 ? inArray(dashboardPresets.id, sharedIds) : undefined,
          )
        )
      )
    return rows.map((row) => ({
      ...row,
      isOwner: row.userId === userId,
      isSharedWithMe: row.userId !== userId && sharedIds.includes(row.id),
    }))
  }

  /** Preset ids in this workspace explicitly granted to `userId` (A5.11). */
  private async presetIdsSharedWith(workspaceId: string, userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ objectId: objectShares.objectId })
      .from(objectShares)
      .where(
        and(
          eq(objectShares.workspaceId, workspaceId),
          eq(objectShares.objectType, 'dashboard'),
          eq(objectShares.userId, userId),
        ),
      )
    return rows.map((r) => r.objectId)
  }

  /**
   * Resolve the dashboard preset a user should land on. Their own default wins;
   * otherwise fall back to the admin-set workspace-default preset (§5.7).
   * Returns null when neither exists.
   */
  async getDefaultPreset(userId: string, workspaceId: string) {
    const [personal] = await this.db
      .select()
      .from(dashboardPresets)
      .where(
        and(
          eq(dashboardPresets.userId, userId),
          eq(dashboardPresets.workspaceId, workspaceId),
          eq(dashboardPresets.isDefault, true)
        )
      )
      .limit(1)
    if (personal) return personal

    const [workspaceDefault] = await this.db
      .select()
      .from(dashboardPresets)
      .where(
        and(
          eq(dashboardPresets.workspaceId, workspaceId),
          eq(dashboardPresets.isWorkspaceDefault, true)
        )
      )
      .limit(1)
    return workspaceDefault ?? null
  }

  async createPreset(userId: string, dto: CreateDashboardPresetDto) {
    if (dto.isDefault) {
      await this.clearDefaultPreset(userId, dto.workspaceId)
    }

    const [preset] = await this.db
      .insert(dashboardPresets)
      .values({
        userId,
        workspaceId: dto.workspaceId,
        name: dto.name,
        layout: dto.layout,
        isDefault: dto.isDefault ?? false,
      })
      .returning()
    return preset
  }

  async updatePreset(userId: string, id: string, dto: UpdateDashboardPresetDto) {
    const [existing] = await this.db
      .select()
      .from(dashboardPresets)
      .where(and(eq(dashboardPresets.id, id), eq(dashboardPresets.userId, userId)))
    
    if (!existing) throw new NotFoundException('Preset not found')

    if (dto.isDefault && !existing.isDefault) {
      await this.clearDefaultPreset(userId, existing.workspaceId)
    }

    const [updated] = await this.db
      .update(dashboardPresets)
      .set({
        ...dto,
        updatedAt: new Date(),
      })
      .where(eq(dashboardPresets.id, id))
      .returning()
    return updated
  }

  async deletePreset(userId: string, id: string) {
    const [existing] = await this.db
      .select()
      .from(dashboardPresets)
      .where(and(eq(dashboardPresets.id, id), eq(dashboardPresets.userId, userId)))
    
    if (!existing) throw new NotFoundException('Preset not found')

    await this.db.delete(dashboardPresets).where(eq(dashboardPresets.id, id))
    return { ok: true }
  }

  private async clearDefaultPreset(userId: string, workspaceId: string) {
    await this.db
      .update(dashboardPresets)
      .set({ isDefault: false })
      .where(
        and(
          eq(dashboardPresets.userId, userId),
          eq(dashboardPresets.workspaceId, workspaceId)
        )
      )
  }

  // --- Workspace-default dashboard (admin) — §5.7 --------------------------
  /**
   * Mark `presetId` as the workspace-wide default and clear the flag on every
   * other preset, keeping at most one workspace-default per workspace. Only a
   * workspace_admin (or super_admin) may do this.
   */
  async setWorkspaceDefault(workspaceId: string, presetId: string, actor: DashboardActor) {
    await this.assertWorkspaceAdmin(workspaceId, actor)

    const [preset] = await this.db
      .select()
      .from(dashboardPresets)
      .where(
        and(
          eq(dashboardPresets.id, presetId),
          eq(dashboardPresets.workspaceId, workspaceId)
        )
      )
      .limit(1)
    if (!preset) throw new NotFoundException('Preset not found')

    // Clear the flag on whichever other preset currently holds it, so the
    // "at most one workspace-default per workspace" invariant is preserved.
    await this.db
      .update(dashboardPresets)
      .set({ isWorkspaceDefault: false })
      .where(
        and(
          eq(dashboardPresets.workspaceId, workspaceId),
          eq(dashboardPresets.isWorkspaceDefault, true),
          ne(dashboardPresets.id, presetId)
        )
      )

    const [updated] = await this.db
      .update(dashboardPresets)
      .set({ isWorkspaceDefault: true, updatedAt: new Date() })
      .where(eq(dashboardPresets.id, presetId))
      .returning()
    return updated
  }

  /** Remove the workspace-default flag from every preset in the workspace. §5.7 */
  async clearWorkspaceDefault(workspaceId: string) {
    await this.db
      .update(dashboardPresets)
      .set({ isWorkspaceDefault: false })
      .where(
        and(
          eq(dashboardPresets.workspaceId, workspaceId),
          eq(dashboardPresets.isWorkspaceDefault, true)
        )
      )
    return { ok: true }
  }

  /**
   * Authorize a workspace-default mutation. A global super_admin bypasses the
   * per-workspace lookup (matching the guards); otherwise the actor must be a
   * workspace_admin (or workspace-level super_admin) member. §5.7
   */
  private async assertWorkspaceAdmin(workspaceId: string, actor: DashboardActor) {
    if (actor.role === 'super_admin') return

    const [member] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, actor.id)
        )
      )
      .limit(1)

    if (!member || !['workspace_admin', 'super_admin'].includes(member.role)) {
      throw new ForbiddenException('Only workspace admins can manage the workspace-default dashboard')
    }
  }

  // --- User Dock Config ----------------------------------------------------
  async getDockConfig(userId: string, workspaceId: string) {
    const [config] = await this.db
      .select()
      .from(userDockConfigs)
      .where(
        and(
          eq(userDockConfigs.userId, userId),
          eq(userDockConfigs.workspaceId, workspaceId)
        )
      )
    return config ?? null
  }

  /**
   * G04-7 / G07-6 — the nav lists are capped here, not only in the client.
   *
   * They arrive as jsonb straight from a browser, so a caller could otherwise
   * store an unbounded array and make every later read of this row expensive
   * for everybody who shares the workspace.
   */
  private static readonly NAV_LIMIT = { favorites: 12, recents: 8 }

  private static navList(value: unknown, limit: number) {
    if (!Array.isArray(value)) return []
    return value
      .filter(
        (entry): entry is { label: string; path: string } =>
          !!entry &&
          typeof entry === 'object' &&
          typeof (entry as { label?: unknown }).label === 'string' &&
          typeof (entry as { path?: unknown }).path === 'string',
      )
      // Only the fields this feature stores. A row is user-supplied jsonb, and
      // echoing back whatever arrived is how a sidebar starts carrying data
      // nothing put there on purpose.
      .map((entry) => {
        const kind = (entry as { kind?: unknown }).kind
        return {
          label: String(entry.label).slice(0, 80),
          path: String(entry.path).slice(0, 300),
          ...(typeof kind === 'string' ? { kind: kind.slice(0, 40) } : {}),
        }
      })
      .slice(0, limit)
  }

  async updateDockConfig(
    userId: string,
    workspaceId: string,
    patch: { pinnedLinks?: any[]; appearance?: any; navFavorites?: unknown; navRecents?: unknown },
  ) {
    const existing = await this.getDockConfig(userId, workspaceId)
    // Whitelist the jsonb columns; never spread the raw body onto the row.
    const set: Record<string, unknown> = { updatedAt: new Date() }
    if (patch.pinnedLinks !== undefined) set.pinnedLinks = Array.isArray(patch.pinnedLinks) ? patch.pinnedLinks : []
    if (patch.appearance !== undefined) set.appearance = patch.appearance
    /*
     * Three states, and they are all different answers:
     *
     *   undefined → not part of this patch, leave the column alone
     *   null      → "clear it", back to never-arranged, so the defaults return
     *   an array  → that exact list, even when empty ("I want none")
     *
     * `navList(null)` returns `[]`, so folding null in with the array case made
     * clearing IMPOSSIBLE: it stored a deliberate empty list instead. That is a
     * product bug — nothing could reset the sidebar to its defaults — and it
     * showed up first as a cross-suite failure, because a teardown that passed
     * null left the next suite with an empty sidebar and Docs and Dashboards
     * missing from the nav.
     */
    if (patch.navFavorites !== undefined) {
      set.navFavorites =
        patch.navFavorites === null
          ? null
          : DashboardsService.navList(patch.navFavorites, DashboardsService.NAV_LIMIT.favorites)
    }
    if (patch.navRecents !== undefined) {
      set.navRecents =
        patch.navRecents === null
          ? null
          : DashboardsService.navList(patch.navRecents, DashboardsService.NAV_LIMIT.recents)
    }

    if (existing) {
      const [updated] = await this.db
        .update(userDockConfigs)
        .set(set)
        .where(eq(userDockConfigs.id, existing.id))
        .returning()
      return updated
    } else {
      const [created] = await this.db
        .insert(userDockConfigs)
        .values({
          userId,
          workspaceId,
          pinnedLinks: patch.pinnedLinks ?? [],
          appearance: patch.appearance ?? { size: 'md', opacity: 0.8, theme: 'system' },
          // Left null when absent: "never arranged it" earns the defaults,
          // "arranged it to be empty" does not.
          navFavorites:
            patch.navFavorites === undefined
              ? null
              : DashboardsService.navList(patch.navFavorites, DashboardsService.NAV_LIMIT.favorites),
          navRecents:
            patch.navRecents === undefined
              ? null
              : DashboardsService.navList(patch.navRecents, DashboardsService.NAV_LIMIT.recents),
        })
        .returning()
      return created
    }
  }
}

import { Injectable, Inject, NotFoundException, ForbiddenException } from '@nestjs/common'
import { eq, and, or, ne } from 'drizzle-orm'
import { dashboardPresets, userDockConfigs, workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { CreateDashboardPresetDto, UpdateDashboardPresetDto } from './dto/dashboard-preset.dto'

/** The acting user as attached to the request by JwtAuthGuard. */
export type DashboardActor = { id: string; role?: string | null }

@Injectable()
export class DashboardsService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  // --- Dashboard Presets ---------------------------------------------------
  async listPresets(userId: string, workspaceId: string) {
    // A member sees their own presets plus the admin-set workspace-default
    // preset (which another user may own), so the UI can show and manage it. §5.7
    return this.db
      .select()
      .from(dashboardPresets)
      .where(
        and(
          eq(dashboardPresets.workspaceId, workspaceId),
          or(
            eq(dashboardPresets.userId, userId),
            eq(dashboardPresets.isWorkspaceDefault, true)
          )
        )
      )
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

  async updateDockConfig(userId: string, workspaceId: string, patch: { pinnedLinks?: any[], appearance?: any }) {
    const existing = await this.getDockConfig(userId, workspaceId)

    if (existing) {
      const [updated] = await this.db
        .update(userDockConfigs)
        .set({
          ...patch,
          updatedAt: new Date(),
        })
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
        })
        .returning()
      return created
    }
  }
}

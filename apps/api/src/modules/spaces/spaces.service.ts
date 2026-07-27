import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common'
import { eq, and, or, ne, inArray } from 'drizzle-orm'
import { spaces, spaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { assertCanManageContainer } from '../../common/permissions/container-access'
import { isWorkspaceManager } from '../../common/permissions/container-access.guard-helper'
import { SecurityService } from '../security/security.service'

// §5 per-space view config. The five task views a list can render.
export const SPACE_VIEW_KEYS = ['list', 'board', 'table', 'calendar', 'gantt'] as const
type SpaceViewKey = (typeof SPACE_VIEW_KEYS)[number]

/**
 * Validate + normalise a space's view config so a bad body can never reach the
 * jsonb column. Drops unknown view keys; guarantees the default view is one of
 * the enabled views. `null` clears it (revert to all-views / list default).
 */
function normalizeViewConfig(
  vc: { defaultView?: string; enabledViews?: string[] } | null,
): { defaultView?: string; enabledViews?: string[] } | null {
  if (vc === null) return null
  if (typeof vc !== 'object' || Array.isArray(vc)) {
    throw new BadRequestException('viewConfig must be an object or null')
  }
  const out: { defaultView?: string; enabledViews?: string[] } = {}
  if (vc.enabledViews !== undefined) {
    if (!Array.isArray(vc.enabledViews)) throw new BadRequestException('enabledViews must be an array')
    const enabled = vc.enabledViews.filter((v): v is SpaceViewKey => SPACE_VIEW_KEYS.includes(v as SpaceViewKey))
    // Never let a space end up with zero views — fall back to all.
    out.enabledViews = enabled.length ? Array.from(new Set(enabled)) : [...SPACE_VIEW_KEYS]
  }
  if (vc.defaultView !== undefined) {
    if (!SPACE_VIEW_KEYS.includes(vc.defaultView as SpaceViewKey)) {
      throw new BadRequestException('invalid defaultView')
    }
    out.defaultView = vc.defaultView
    // The default must be selectable, so ensure it's within the enabled set.
    if (out.enabledViews && !out.enabledViews.includes(vc.defaultView)) out.enabledViews.push(vc.defaultView)
  }
  return out
}

@Injectable()
export class SpacesService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private security: SecurityService,
  ) {}

  async createSpace(
    workspaceId: string,
    data: { name: string; description?: string; color?: string; icon?: string },
    actorId?: string,
  ) {
    const result = await this.db
      .insert(spaces)
      .values({
        workspaceId,
        name: data.name,
        description: data.description,
        color: data.color || '#354fb0',
        icon: data.icon,
        createdById: actorId ?? null,
      })
      .returning()

    const space = result[0]
    // Seed the creator as an admin member so private-conversion never orphans
    // the space (mirrors the 0035 backfill for existing spaces).
    if (actorId && space) {
      await this.db
        .insert(spaceMembers)
        .values({ spaceId: space.id, userId: actorId, role: 'admin', addedById: actorId })
        .onConflictDoNothing()
    }
    return space
  }

  async getSpacesByWorkspace(workspaceId: string, actorId?: string) {
    const base = and(eq(spaces.workspaceId, workspaceId), eq(spaces.isArchived, false))
    // Managers (and internal callers with no actor) see every space.
    if (!actorId || (await isWorkspaceManager(this.db, workspaceId, actorId))) {
      return this.db.select().from(spaces).where(base)
    }
    // Everyone else sees public spaces plus the private ones they belong to.
    return this.db
      .select()
      .from(spaces)
      .where(
        and(
          base,
          or(
            ne(spaces.visibility, 'private'),
            inArray(
              spaces.id,
              this.db.select({ id: spaceMembers.spaceId }).from(spaceMembers).where(eq(spaceMembers.userId, actorId)),
            ),
          ),
        ),
      )
  }

  async getSpace(spaceId: string) {
    const [space] = await this.db
      .select()
      .from(spaces)
      .where(eq(spaces.id, spaceId))
    return space ?? null
  }

  async updateSpace(
    spaceId: string,
    data: Partial<{
      name: string
      description: string
      color: string
      icon: string
      viewConfig: { defaultView?: string; enabledViews?: string[] } | null
    }>,
    actorId?: string,
  ) {
    if (actorId) await this.assertManageable(spaceId, actorId)
    // Whitelist updatable columns instead of spreading the untyped request body
    // (prevents stray/wrong-typed fields reaching the row — crash + mass-assign).
    const set: Record<string, unknown> = { updatedAt: new Date() }
    for (const key of ['name', 'description', 'color', 'icon'] as const) {
      if (data[key] !== undefined) set[key] = data[key]
    }
    if (data.viewConfig !== undefined) set.viewConfig = normalizeViewConfig(data.viewConfig)
    const result = await this.db
      .update(spaces)
      .set(set)
      .where(eq(spaces.id, spaceId))
      .returning()

    return result[0]
  }

  async deleteSpace(spaceId: string, actorId?: string, ipAddress?: string) {
    const space = actorId ? await this.assertManageable(spaceId, actorId, 'delete') : null
    await this.db
      .update(spaces)
      .set({ isArchived: true, archivedAt: new Date(), archivedById: actorId ?? null, updatedAt: new Date() })
      .where(eq(spaces.id, spaceId))
    if (actorId && space) {
      // §13.3 — audit the container deletion (space archival).
      await this.security.logAuditEvent({
        workspaceId: space.workspaceId,
        actorId,
        action: 'space.deleted',
        resourceType: 'space',
        resourceId: spaceId,
        description: `Archived space "${space.name}"`,
        ipAddress,
      })
    }
  }

  private async assertManageable(spaceId: string, actorId: string, action: 'manage' | 'delete' = 'manage') {
    const space = await this.getSpace(spaceId)
    if (!space) throw new NotFoundException('Space not found')
    await assertCanManageContainer(this.db, {
      workspaceId: space.workspaceId,
      createdById: space.createdById,
      actorId,
      kind: 'space',
      action,
      // Deleting an entire space is admin-only (space.delete not in MANAGER_DELTA).
      adminOnlyDelete: true,
    })
    return space
  }
}

import { Injectable, Inject, NotFoundException } from '@nestjs/common'
import { eq, and, or, ne, inArray } from 'drizzle-orm'
import { spaces, spaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { assertCanManageContainer } from '../../common/permissions/container-access'
import { isWorkspaceManager } from '../../common/permissions/container-access.guard-helper'
import { SecurityService } from '../security/security.service'

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
    data: Partial<{ name: string; description: string; color: string; icon: string }>,
    actorId?: string,
  ) {
    if (actorId) await this.assertManageable(spaceId, actorId)
    const result = await this.db
      .update(spaces)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(spaces.id, spaceId))
      .returning()

    return result[0]
  }

  async deleteSpace(spaceId: string, actorId?: string, ipAddress?: string) {
    const space = actorId ? await this.assertManageable(spaceId, actorId, 'delete') : null
    await this.db.update(spaces).set({ isArchived: true }).where(eq(spaces.id, spaceId))
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

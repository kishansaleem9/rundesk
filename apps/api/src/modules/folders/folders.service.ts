import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common'
import { and, asc, eq, type SQL } from 'drizzle-orm'
import { folders, spaces } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { SecurityService } from '../security/security.service'
import { resolveIsManager, folderVisibilityFilter } from '../../common/permissions/item-visibility'

@Injectable()
export class FoldersService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private security: SecurityService,
  ) {}

  async listBySpace(spaceId: string, actor?: { id: string; role?: string }) {
    // §2 per-item privacy: hide private folders the actor may not see.
    let visFilter: SQL | undefined
    if (actor) {
      const [ctx] = await this.db
        .select({ workspaceId: spaces.workspaceId })
        .from(spaces)
        .where(eq(spaces.id, spaceId))
        .limit(1)
      if (ctx) {
        const isManager = await resolveIsManager(this.db, ctx.workspaceId, actor.id, actor.role)
        visFilter = folderVisibilityFilter(actor.id, isManager)
      }
    }
    return this.db
      .select()
      .from(folders)
      .where(and(eq(folders.spaceId, spaceId), eq(folders.isArchived, false), visFilter))
      .orderBy(asc(folders.position), asc(folders.name))
  }

  async create(spaceId: string, data: { name: string; color?: string }, actorId?: string) {
    const [row] = await this.db
      .insert(folders)
      .values({
        spaceId,
        name: data.name,
        color: data.color || '#354fb0',
        createdById: actorId ?? null,
      })
      .returning()
    return row
  }

  async update(
    spaceId: string,
    folderId: string,
    patch: { name?: string; color?: string; position?: number; visibility?: 'public' | 'private' },
  ) {
    if (patch.visibility !== undefined && patch.visibility !== 'public' && patch.visibility !== 'private') {
      throw new BadRequestException('visibility must be public or private')
    }
    const set: Record<string, unknown> = { updatedAt: new Date() }
    if (patch.name !== undefined) set.name = patch.name
    if (patch.color !== undefined) set.color = patch.color
    if (patch.position !== undefined) set.position = patch.position
    if (patch.visibility !== undefined) set.visibility = patch.visibility
    const [row] = await this.db
      .update(folders)
      .set(set)
      .where(and(eq(folders.id, folderId), eq(folders.spaceId, spaceId)))
      .returning()
    if (!row) throw new NotFoundException('Folder not found')
    return row
  }

  /**
   * §13.4 — deleting a folder ARCHIVES it (soft delete) so it can be restored
   * from the workspace Trash. It used to be hard-deleted, which made a folder
   * the one container that could never be recovered.
   *
   * The folder's projects keep their `folderId`, so restoring the folder brings
   * its contents back grouped exactly as before; while the folder is archived
   * every read path treats those projects as sitting directly under the space.
   */
  async remove(spaceId: string, folderId: string, actorId?: string, ipAddress?: string) {
    // Resolve name + owning workspace up-front for the §13.3 audit event.
    const [ctx] = await this.db
      .select({ name: folders.name, workspaceId: spaces.workspaceId })
      .from(folders)
      .innerJoin(spaces, eq(spaces.id, folders.spaceId))
      .where(and(eq(folders.id, folderId), eq(folders.spaceId, spaceId)))
      .limit(1)
    if (!ctx) throw new NotFoundException('Folder not found')

    await this.db
      .update(folders)
      .set({ isArchived: true, archivedAt: new Date(), archivedById: actorId ?? null, updatedAt: new Date() })
      .where(and(eq(folders.id, folderId), eq(folders.spaceId, spaceId)))

    if (actorId) {
      // §13.3 — audit the container deletion (mirrors space/project/list).
      await this.security.logAuditEvent({
        workspaceId: ctx.workspaceId,
        actorId,
        action: 'folder.deleted',
        resourceType: 'folder',
        resourceId: folderId,
        description: `Deleted folder "${ctx.name}"`,
        ipAddress,
      })
    }

    return { ok: true }
  }
}

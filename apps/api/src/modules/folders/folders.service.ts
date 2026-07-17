import { Injectable, Inject, NotFoundException } from '@nestjs/common'
import { and, asc, eq } from 'drizzle-orm'
import { folders, spaces } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { SecurityService } from '../security/security.service'

@Injectable()
export class FoldersService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private security: SecurityService,
  ) {}

  async listBySpace(spaceId: string) {
    return this.db
      .select()
      .from(folders)
      .where(and(eq(folders.spaceId, spaceId), eq(folders.isArchived, false)))
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
    patch: { name?: string; color?: string; position?: number },
  ) {
    const set: Record<string, unknown> = { updatedAt: new Date() }
    if (patch.name !== undefined) set.name = patch.name
    if (patch.color !== undefined) set.color = patch.color
    if (patch.position !== undefined) set.position = patch.position
    const [row] = await this.db
      .update(folders)
      .set(set)
      .where(and(eq(folders.id, folderId), eq(folders.spaceId, spaceId)))
      .returning()
    if (!row) throw new NotFoundException('Folder not found')
    return row
  }

  /** Deleting a folder leaves its projects intact (FK is ON DELETE SET NULL),
   *  so they fall back to sitting directly under the space. */
  async remove(spaceId: string, folderId: string, actorId?: string, ipAddress?: string) {
    // Resolve name + owning workspace up-front so the §13.3 container-deletion
    // audit event can be written even though the row is hard-deleted below.
    const [ctx] = await this.db
      .select({ name: folders.name, workspaceId: spaces.workspaceId })
      .from(folders)
      .innerJoin(spaces, eq(spaces.id, folders.spaceId))
      .where(and(eq(folders.id, folderId), eq(folders.spaceId, spaceId)))
      .limit(1)
    if (!ctx) throw new NotFoundException('Folder not found')

    await this.db.delete(folders).where(and(eq(folders.id, folderId), eq(folders.spaceId, spaceId)))

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

import { Injectable, Inject, NotFoundException } from '@nestjs/common'
import { and, asc, eq } from 'drizzle-orm'
import { folders } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

@Injectable()
export class FoldersService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

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
  async remove(spaceId: string, folderId: string) {
    const [row] = await this.db
      .delete(folders)
      .where(and(eq(folders.id, folderId), eq(folders.spaceId, spaceId)))
      .returning()
    if (!row) throw new NotFoundException('Folder not found')
    return { ok: true }
  }
}

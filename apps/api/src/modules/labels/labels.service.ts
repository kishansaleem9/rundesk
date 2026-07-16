import { Injectable, Inject, NotFoundException } from '@nestjs/common'
import { eq, asc } from 'drizzle-orm'
import { labels } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

@Injectable()
export class LabelsService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  list(workspaceId: string) {
    return this.db
      .select()
      .from(labels)
      .where(eq(labels.workspaceId, workspaceId))
      .orderBy(asc(labels.name))
  }

  async create(workspaceId: string, data: { name: string; color: string }) {
    const [row] = await this.db
      .insert(labels)
      .values({ workspaceId, name: data.name.trim(), color: data.color })
      .returning()
    return row
  }

  async update(labelId: string, data: { name?: string; color?: string }) {
    const [row] = await this.db
      .update(labels)
      .set({ ...(data.name ? { name: data.name.trim() } : {}), ...(data.color ? { color: data.color } : {}) })
      .where(eq(labels.id, labelId))
      .returning()
    if (!row) throw new NotFoundException('Label not found')
    return row
  }

  async delete(labelId: string) {
    const [row] = await this.db.delete(labels).where(eq(labels.id, labelId)).returning()
    if (!row) throw new NotFoundException('Label not found')
    return { ok: true }
  }
}

import { Injectable, Inject, NotFoundException } from '@nestjs/common'
import { eq, asc } from 'drizzle-orm'
import { taskViews } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

type ViewType = 'list' | 'board' | 'calendar' | 'gantt' | 'table'

@Injectable()
export class ViewsService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  listByList(listId: string) {
    return this.db
      .select()
      .from(taskViews)
      .where(eq(taskViews.listId, listId))
      .orderBy(asc(taskViews.position))
  }

  async create(data: { listId: string; name: string; type: ViewType; config?: Record<string, unknown>; createdById: string }) {
    const [row] = await this.db
      .insert(taskViews)
      .values({
        listId: data.listId,
        name: data.name,
        type: data.type,
        config: data.config ?? {},
        createdById: data.createdById,
      })
      .returning()
    return row
  }

  async update(viewId: string, patch: { name?: string; config?: Record<string, unknown>; position?: number; isDefault?: boolean }) {
    const [row] = await this.db
      .update(taskViews)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(taskViews.id, viewId))
      .returning()
    if (!row) throw new NotFoundException('View not found')
    return row
  }

  async delete(viewId: string) {
    const [row] = await this.db.delete(taskViews).where(eq(taskViews.id, viewId)).returning()
    if (!row) throw new NotFoundException('View not found')
    return { ok: true }
  }
}

import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common'
import { eq, asc } from 'drizzle-orm'
import { taskViews } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

type ViewType = 'list' | 'board' | 'calendar' | 'gantt' | 'table'

/** A view `config` is a keyed object — reject a string/array/primitive so a
 *  reader that reaches into `config.columns` etc. never meets a wrong type. */
function assertConfigObject(config: unknown) {
  if (config != null && (typeof config !== 'object' || Array.isArray(config))) {
    throw new BadRequestException('View "config" must be an object')
  }
}

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
    assertConfigObject(data.config)
    const existing = await this.listByList(data.listId)
    const [row] = await this.db
      .insert(taskViews)
      .values({
        listId: data.listId,
        name: data.name,
        type: data.type,
        config: data.config ?? {},
        isDefault: existing.length === 0,
        createdById: data.createdById,
      })
      .returning()
    return row
  }

  async update(viewId: string, patch: { name?: string; config?: Record<string, unknown>; position?: number; isDefault?: boolean }) {
    assertConfigObject(patch.config)
    const [existing] = await this.db.select().from(taskViews).where(eq(taskViews.id, viewId)).limit(1)
    if (!existing) throw new NotFoundException('View not found')
    if (patch.isDefault === true) {
      await this.db
        .update(taskViews)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(eq(taskViews.listId, existing.listId))
    }
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

import { Injectable, Inject } from '@nestjs/common'
import { eq, and } from 'drizzle-orm'
import { lists, listStatuses } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

/**
 * Default status pipeline seeded on every new list. Existing lists were
 * back-filled with the same rows in migration `0020_custom_list_statuses.sql`.
 */
const DEFAULT_LIST_STATUSES = [
  { key: 'backlog',     name: 'Backlog',     color: '#94a3b8', category: 'open' as const,         position: 0 },
  { key: 'todo',        name: 'To do',       color: '#64748b', category: 'open' as const,         position: 1 },
  { key: 'in_progress', name: 'In progress', color: '#3b82f6', category: 'in_progress' as const,  position: 2 },
  { key: 'in_review',   name: 'In review',   color: '#a855f7', category: 'in_progress' as const,  position: 3 },
  { key: 'done',        name: 'Done',        color: '#10b981', category: 'closed' as const,       position: 4 },
  { key: 'cancelled',   name: 'Cancelled',   color: '#f43f5e', category: 'closed' as const,       position: 5 },
]

@Injectable()
export class ListsService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  async createList(projectId: string, data: { name: string; description?: string }) {
    const result = await this.db
      .insert(lists)
      .values({
        projectId,
        name: data.name,
        description: data.description,
      })
      .returning()

    const list = result[0]
    // Seed the default status pipeline so the list is immediately usable.
    await this.db
      .insert(listStatuses)
      .values(DEFAULT_LIST_STATUSES.map((s) => ({ listId: list.id, ...s })))
      .onConflictDoNothing()

    return list
  }

  async getListsByProject(projectId: string) {
    return this.db
      .select()
      .from(lists)
      .where(and(eq(lists.projectId, projectId), eq(lists.isArchived, false)))
  }

  async getList(listId: string) {
    const [list] = await this.db
      .select()
      .from(lists)
      .where(eq(lists.id, listId))
    return list ?? null
  }

  async updateList(listId: string, data: Partial<{ name: string; description: string }>) {
    const result = await this.db
      .update(lists)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(lists.id, listId))
      .returning()

    return result[0]
  }

  async deleteList(listId: string) {
    await this.db.update(lists).set({ isArchived: true }).where(eq(lists.id, listId))
  }
}

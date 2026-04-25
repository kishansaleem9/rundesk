import { Injectable, Inject } from '@nestjs/common'
import { eq, and } from 'drizzle-orm'
import { lists } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

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

    return result[0]
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

import { Injectable, Inject, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common'
import { and, eq, asc, desc } from 'drizzle-orm'
import { personalTasks } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

@Injectable()
export class PersonalTasksService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  list(workspaceId: string, userId: string) {
    return this.db
      .select()
      .from(personalTasks)
      .where(and(eq(personalTasks.workspaceId, workspaceId), eq(personalTasks.userId, userId)))
      .orderBy(asc(personalTasks.done), asc(personalTasks.position), desc(personalTasks.createdAt))
  }

  async create(workspaceId: string, userId: string, title: string) {
    const trimmed = (title ?? '').trim()
    if (!trimmed) throw new BadRequestException('Title is required')
    const [row] = await this.db
      .insert(personalTasks)
      .values({ workspaceId, userId, title: trimmed })
      .returning()
    return row
  }

  private async assertOwned(id: string, userId: string) {
    const [row] = await this.db.select().from(personalTasks).where(eq(personalTasks.id, id)).limit(1)
    if (!row) throw new NotFoundException('Personal task not found')
    if (row.userId !== userId) throw new ForbiddenException('Not your task')
    return row
  }

  async update(id: string, userId: string, patch: { title?: string; done?: boolean }) {
    await this.assertOwned(id, userId)
    const set: Record<string, unknown> = { updatedAt: new Date() }
    if (patch.title !== undefined) {
      const trimmed = patch.title.trim()
      if (!trimmed) throw new BadRequestException('Title cannot be empty')
      set.title = trimmed
    }
    if (patch.done !== undefined) set.done = patch.done
    const [row] = await this.db.update(personalTasks).set(set).where(eq(personalTasks.id, id)).returning()
    return row
  }

  async remove(id: string, userId: string) {
    await this.assertOwned(id, userId)
    await this.db.delete(personalTasks).where(eq(personalTasks.id, id))
    return { ok: true }
  }
}

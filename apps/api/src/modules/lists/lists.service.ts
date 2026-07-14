import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common'
import { eq, and, asc } from 'drizzle-orm'
import { lists, listStatuses, projects, spaces } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { assertCanManageContainer } from '../../common/permissions/container-access'

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

  async createList(projectId: string, data: { name: string; description?: string }, actorId?: string) {
    const result = await this.db
      .insert(lists)
      .values({
        projectId,
        name: data.name,
        description: data.description,
        createdById: actorId ?? null,
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
      .orderBy(asc(lists.position), asc(lists.createdAt))
  }

  /** Reorder lists within a project; writes each list's position to its index. */
  async reorderLists(projectId: string, orderedIds: string[], actorId?: string) {
    const all = await this.getListsByProject(projectId)
    const validIds = new Set(all.map((l) => l.id))
    const missing = orderedIds.filter((id) => !validIds.has(id))
    if (missing.length > 0) {
      throw new BadRequestException(`These ids are not lists of this project: ${missing.join(', ')}`)
    }
    if (orderedIds.length !== all.length) {
      throw new BadRequestException('orderedIds must contain every list of the project exactly once')
    }
    if (actorId && all[0]) await this.assertManageable(all[0].id, actorId)
    await Promise.all(
      orderedIds.map((id, position) =>
        this.db.update(lists).set({ position, updatedAt: new Date() }).where(eq(lists.id, id)),
      ),
    )
    return this.getListsByProject(projectId)
  }

  async getList(listId: string) {
    const [list] = await this.db
      .select()
      .from(lists)
      .where(eq(lists.id, listId))
    return list ?? null
  }

  async updateList(listId: string, data: Partial<{ name: string; description: string }>, actorId?: string) {
    if (actorId) await this.assertManageable(listId, actorId)
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

  async deleteList(listId: string, actorId?: string) {
    if (actorId) await this.assertManageable(listId, actorId)
    await this.db.update(lists).set({ isArchived: true }).where(eq(lists.id, listId))
  }

  private async assertManageable(listId: string, actorId: string) {
    const [row] = await this.db
      .select({ createdById: lists.createdById, workspaceId: spaces.workspaceId })
      .from(lists)
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(lists.id, listId))
      .limit(1)
    if (!row) throw new NotFoundException('List not found')
    await assertCanManageContainer(this.db, {
      workspaceId: row.workspaceId,
      createdById: row.createdById,
      actorId,
      kind: 'list',
    })
  }
}

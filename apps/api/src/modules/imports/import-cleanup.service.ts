import { Inject, Injectable } from '@nestjs/common'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { folders, importJobItems, labels, lists, projects, spaces, taskTypes, tasks } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { SearchService } from '../search/search.service'
import { batches } from './import-plan'

export type CleanupCounts = {
  tasks: number
  lists: number
  projects: number
  folders: number
  spaces: number
  tags: number
  taskTypes: number
}

/**
 * §7 Delete: "When you delete an import, all items created by the import will
 * be deleted." Deleted here means MOVED TO TRASH, restorable for 30 days, with
 * the same columns each entity's own delete writes — a task's `deleted_at`
 * (`TasksService.binTask`), a container's `is_archived` (`ListsService.deleteList`
 * and its siblings) — so the Trash lists and restores them as any other.
 *
 * Tags and task types have no Trash. One the import made is removed only
 * while nothing outside the import uses it. Statuses and Custom Fields the
 * import made go to Trash with a container the import made; in a container
 * that was already there they stay, because the import's tasks may be
 * restored from Trash and need them.
 */
@Injectable()
export class ImportCleanupService {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly search: SearchService,
  ) {}

  async trashImport(jobId: string, actorId: string): Promise<CleanupCounts> {
    const made = await this.db
      .select({ type: importJobItems.entityType, id: importJobItems.entityId })
      .from(importJobItems)
      .where(and(eq(importJobItems.jobId, jobId), eq(importJobItems.action, 'created')))
    const ids = (...types: string[]) =>
      made.filter((m) => types.includes(m.type) && m.id).map((m) => m.id as string)
    const now = new Date()
    const counts: CleanupCounts = { tasks: 0, lists: 0, projects: 0, folders: 0, spaces: 0, tags: 0, taskTypes: 0 }

    for (const chunk of batches(ids('task', 'subtask'), 500)) {
      const binned = await this.db
        .update(tasks)
        .set({ isArchived: true, deletedAt: now, deletedById: actorId, updatedAt: now })
        .where(and(inArray(tasks.id, chunk), isNull(tasks.deletedAt)))
        .returning({ id: tasks.id })
      counts.tasks += binned.length
      for (const t of binned) void this.search.removeTask(t.id).catch(() => undefined)
    }

    const archive = { isArchived: true, archivedAt: now, archivedById: actorId, updatedAt: now }
    for (const chunk of batches(ids('list'), 500)) {
      counts.lists += (await this.db.update(lists).set(archive).where(and(inArray(lists.id, chunk), eq(lists.isArchived, false))).returning({ id: lists.id })).length
    }
    for (const chunk of batches(ids('project'), 500)) {
      counts.projects += (
        await this.db.update(projects).set(archive).where(and(inArray(projects.id, chunk), eq(projects.isArchived, false))).returning({ id: projects.id })
      ).length
    }
    for (const chunk of batches(ids('folder'), 500)) {
      counts.folders += (
        await this.db.update(folders).set(archive).where(and(inArray(folders.id, chunk), eq(folders.isArchived, false))).returning({ id: folders.id })
      ).length
    }
    for (const chunk of batches(ids('space'), 500)) {
      counts.spaces += (await this.db.update(spaces).set(archive).where(and(inArray(spaces.id, chunk), eq(spaces.isArchived, false))).returning({ id: spaces.id })).length
    }

    const tagIds = ids('tag')
    if (tagIds.length) {
      const removed = await this.db
        .delete(labels)
        .where(
          and(
            inArray(labels.id, tagIds),
            sql`not exists (select 1 from task_label_assignments tla join tasks t on t.id = tla.task_id
                            where tla.label_id = ${labels.id} and t.import_id is distinct from ${jobId})`,
          ),
        )
        .returning({ id: labels.id })
      counts.tags = removed.length
    }
    const typeIds = ids('task_type')
    if (typeIds.length) {
      const removed = await this.db
        .delete(taskTypes)
        .where(
          and(
            inArray(taskTypes.id, typeIds),
            sql`not exists (select 1 from tasks t where t.task_type_id = ${taskTypes.id} and t.import_id is distinct from ${jobId})`,
          ),
        )
        .returning({ id: taskTypes.id })
      counts.taskTypes = removed.length
    }
    return counts
  }
}

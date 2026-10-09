import { Injectable, Inject, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common'
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm'
import { lists, listStatuses, tasks } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { ensurePersonalList } from '../lists/personal-list'
import { TasksService } from '../tasks/tasks.service'

/**
 * HOME'S PERSONAL LIST IS THE PERSONAL LIST (`found-24-sep/planner-default-list-read-by-nothing`).
 *
 * Its to-dos were rows of their own (`personal_tasks`): a title and a tick, in
 * a list beside the real ones that nothing else could reach — no task opened
 * from it, no date, no assignee, and `/task`, a message or the AI could not put
 * anything in it. They are the tasks of the person's Personal List now
 * (`ensurePersonalList`, which moves the old rows in the first time), and these
 * routes read and write those tasks for Home's card and the sidebar's count,
 * through `TasksService`, as any route that makes or changes a task does.
 */
@Injectable()
export class PersonalTasksService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private tasksService: TasksService,
  ) {}

  private async personalListOf(workspaceId: string, userId: string) {
    const personal = await ensurePersonalList(this.db, workspaceId, userId)
    if (!personal) throw new ForbiddenException('Guests have no Personal List')
    return personal
  }

  /** Its tasks, the open ones first, as Home's card lists them. A guest's is empty: they have none. */
  async list(workspaceId: string, userId: string) {
    const personal = await ensurePersonalList(this.db, workspaceId, userId)
    if (!personal) return []
    const rows = await this.db
      .select({ id: tasks.id, title: tasks.title, category: tasks.statusCategory, position: tasks.position, createdAt: tasks.createdAt, dueDate: tasks.dueDate })
      .from(tasks)
      .where(and(eq(tasks.listId, personal.id), eq(tasks.isArchived, false), isNull(tasks.parentTaskId)))
      .orderBy(asc(sql`${tasks.statusCategory} = 'closed'`), asc(tasks.position), desc(tasks.createdAt))
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      done: r.category === 'closed',
      position: r.position,
      createdAt: r.createdAt,
      dueDate: r.dueDate,
      listId: personal.id,
    }))
  }

  async create(workspaceId: string, userId: string, title: string) {
    const trimmed = (title ?? '').trim()
    if (!trimmed) throw new BadRequestException('Title is required')
    const personal = await this.personalListOf(workspaceId, userId)
    const task = await this.tasksService.createTask({ listId: personal.id, title: trimmed, createdById: userId })
    if (!task) throw new BadRequestException('The task could not be made')
    return { id: task.id, title: task.title, done: false, position: task.position, createdAt: task.createdAt, dueDate: task.dueDate, listId: personal.id }
  }

  /** A task of the caller's own Personal List, and its list; any other is not one of theirs to change here. */
  private async ownTask(id: string, userId: string) {
    const [row] = await this.db
      .select({ id: tasks.id, listId: tasks.listId, personalOf: lists.personalOf })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .where(eq(tasks.id, id))
      .limit(1)
    if (!row || row.personalOf !== userId) throw new NotFoundException('Personal task not found')
    return row
  }

  /** The status a tick sets, or takes away: the list's first closed one, or its "To do" (else its first open one). */
  private async statusFor(listId: string, done: boolean): Promise<string> {
    const rows = await this.db
      .select({ key: listStatuses.key, category: listStatuses.category })
      .from(listStatuses)
      .where(eq(listStatuses.listId, listId))
      .orderBy(asc(listStatuses.position))
    const pick = done
      ? rows.find((r) => r.category === 'closed')
      : rows.find((r) => r.key === 'todo') ?? rows.find((r) => r.category === 'open')
    if (!pick) throw new BadRequestException('This list has no status to set')
    return pick.key
  }

  async update(id: string, userId: string, patch: { title?: string; done?: boolean }) {
    const own = await this.ownTask(id, userId)
    const change: { title?: string; status?: string } = {}
    if (patch.title !== undefined) {
      const trimmed = patch.title.trim()
      if (!trimmed) throw new BadRequestException('Title cannot be empty')
      change.title = trimmed
    }
    if (patch.done !== undefined) change.status = await this.statusFor(own.listId, patch.done)
    if (Object.keys(change).length > 0) await this.tasksService.updateTask(id, userId, change as never)
    const [row] = await this.db
      .select({ id: tasks.id, title: tasks.title, category: tasks.statusCategory, position: tasks.position, createdAt: tasks.createdAt, dueDate: tasks.dueDate })
      .from(tasks)
      .where(eq(tasks.id, id))
      .limit(1)
    return { id: row.id, title: row.title, done: row.category === 'closed', position: row.position, createdAt: row.createdAt, dueDate: row.dueDate, listId: own.listId }
  }

  /** Deleted as a task is deleted from its sheet: into the Trash, where its owner restores it (`binTask`), not archived. */
  async remove(id: string, userId: string) {
    await this.ownTask(id, userId)
    await this.tasksService.binTask(id, userId)
    return { ok: true }
  }

  /** The Personal List itself: where Home's "Open as a list" goes, and what `/task` and the rest default to. */
  async personalList(workspaceId: string, userId: string) {
    // A guest has none, and is told so by an empty answer, as Home's list of it is empty.
    const personal = await ensurePersonalList(this.db, workspaceId, userId)
    if (!personal) return null
    const [{ open }] = await this.db
      .select({ open: sql<number>`count(*)::int` })
      .from(tasks)
      .where(and(eq(tasks.listId, personal.id), eq(tasks.isArchived, false), sql`${tasks.statusCategory} <> 'closed'`))
    return { ...personal, name: 'Personal List', openCount: open }
  }
}

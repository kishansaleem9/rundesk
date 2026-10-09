import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { lists, projects, taskLists, tasks, workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { FLAGS } from '@rundesk/feature-flags'
import { DB_TOKEN } from '../../common/database/database.module'
import { readableList } from '../../common/permissions/read-access'
import { isUuid } from '../../common/validation/uuid'
import { FeatureFlagsService } from '../feature-flags/feature-flags.service'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { TasksService } from './tasks.service'

/** What a refusal says, in the words the sheet shows (`task-lists.mjs` reads them). */
export const TASK_LISTS_REFUSALS = {
  off: 'Tasks in Multiple Lists is off in this workspace: an owner or admin turns it on in Settings → ClickApps',
  guest: 'Guests cannot add a task to another list, or take it out of one',
  subtask: 'A subtask is in the lists its parent is in',
  home: 'This is the task’s home list: a task is moved out of it, not taken out',
  homeAgain: 'This is the task’s home list already',
  already: 'The task is in this list already',
  notIn: 'The task is not in this list',
} as const

type Actor = { id: string; role?: string }

/**
 * TASKS IN MULTIPLE LISTS (`commit-log/log-713a611-1`), as ClickUp's ClickApp.
 *
 * ClickUp (help centre, "Tasks in Multiple Lists" and its FAQ, through search
 * excerpts, 9 October): an owner or admin turns the ClickApp on, and turning
 * it off takes every task out of the lists it was added to, for good. A task
 * keeps its home list — where it was made, or moved — and is added to other
 * lists of the workspace from its ⋯ menu (Add to › Another List) or beside its
 * location; it is the same task in each, its status always its home list's.
 * "Remove task from this List" takes it out of one; never out of its home
 * (the API answers that with a refusal). Guests neither add nor remove. Anyone
 * who may see one of its lists sees it there (`readsThroughAddedList`).
 *
 * WHO MAY: whoever may change the task (its home list's write rule), and add a
 * task to the list it goes into (that list's create gate) — not a guest.
 */
@Injectable()
export class TaskListsService {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly tasks: TasksService,
    private readonly flags: FeatureFlagsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  private async context(taskId: string, actor: Actor) {
    if (!isUuid(taskId)) throw new NotFoundException('Task not found')
    const [task] = await this.db
      .select({ id: tasks.id, listId: tasks.listId, parentTaskId: tasks.parentTaskId })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1)
    if (!task) throw new NotFoundException('Task not found')
    const workspaceId = await this.tasks.workspaceIdForList(task.listId)
    if (!workspaceId) throw new NotFoundException('Task not found')
    const [member] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, actor.id)))
      .limit(1)
    const on = await this.flags.isEnabled(FLAGS.TASKS_IN_MULTIPLE_LISTS, { workspaceId, userId: actor.id, role: actor.role ?? '' })
    return { task, workspaceId, role: (member?.role as string | undefined) ?? null, on }
  }

  /** Why this person may not add the task to a list, or take it out of one: null when they may. */
  private async refusal(ctx: Awaited<ReturnType<TaskListsService['context']>>, actor: Actor): Promise<string | null> {
    if (!ctx.on) return TASK_LISTS_REFUSALS.off
    if (ctx.role === 'guest') return TASK_LISTS_REFUSALS.guest
    if (ctx.task.parentTaskId) return TASK_LISTS_REFUSALS.subtask
    try {
      await this.tasks.assertMayEditTask(ctx.task.id, actor.id)
    } catch (err) {
      if (err instanceof HttpException && err.getStatus() === 403) {
        return String((err.getResponse() as { message?: string })?.message ?? err.message)
      }
      throw err
    }
    return null
  }

  private refuse(message: string): never {
    if (message === TASK_LISTS_REFUSALS.subtask) throw new BadRequestException(message)
    throw new ForbiddenException(message)
  }

  /**
   * The task's lists, as this reader may see them: its home first, then the
   * lists it was added to, in the order they were added — each one named only
   * to whoever may open it — and whether they may change them, or why not.
   */
  async listsOf(taskId: string, actor: Actor) {
    const ctx = await this.context(taskId, actor)
    const added = await this.db
      .select({ listId: taskLists.listId })
      .from(taskLists)
      .where(eq(taskLists.taskId, taskId))
      .orderBy(asc(taskLists.createdAt))
    const ids = [ctx.task.listId, ...added.map((a) => a.listId)]
    const rows = await this.db
      .select({ id: lists.id, name: lists.name, projectId: lists.projectId, spaceId: projects.spaceId, personalOf: lists.personalOf })
      .from(lists)
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .where(inArray(lists.id, ids))
    const out: Array<{ id: string; name: string; projectId: string; spaceId: string; home: boolean }> = []
    for (const id of ids) {
      const r = rows.find((x) => x.id === id)
      if (!r) continue
      const home = id === ctx.task.listId
      // A list this reader may not open is not named to them, though the task is in it.
      if (!home && !(await readableList(this.db, ctx.workspaceId, id, actor))) continue
      out.push({ id, name: r.personalOf ? 'Personal List' : r.name, projectId: r.projectId, spaceId: r.spaceId, home })
    }
    const reason = await this.refusal(ctx, actor)
    return { on: ctx.on, canChange: reason === null, reason, lists: out }
  }

  /** Add to › Another List. */
  async add(taskId: string, listId: string, actor: Actor) {
    const ctx = await this.context(taskId, actor)
    const reason = await this.refusal(ctx, actor)
    if (reason) this.refuse(reason)
    if (!isUuid(listId)) throw new NotFoundException('List not found')
    if (listId === ctx.task.listId) throw new BadRequestException(TASK_LISTS_REFUSALS.homeAgain)
    // A list of this workspace the person may open, and add a task to: not a guest, Full edit there, not in the trash.
    if (!(await readableList(this.db, ctx.workspaceId, listId, actor))) throw new NotFoundException('List not found')
    await this.tasks.assertCanCreateTaskIn(listId, actor.id)
    const [made] = await this.db
      .insert(taskLists)
      .values({ taskId, listId, addedById: actor.id })
      .onConflictDoNothing()
      .returning({ listId: taskLists.listId })
    if (!made) throw new ConflictException(TASK_LISTS_REFUSALS.already)
    await this.tasks.logTaskActivity({ taskId, actorId: actor.id, action: 'list_added', meta: { listId } })
    // The list's page draws it from now: told, as it is told of a task made there.
    this.realtime.emitToList(listId, { type: 'task.updated', listId, taskId, patch: {} })
    return this.listsOf(taskId, actor)
  }

  /** "Remove task from this List": any list it was added to, never its home. */
  async remove(taskId: string, listId: string, actor: Actor) {
    const ctx = await this.context(taskId, actor)
    const reason = await this.refusal(ctx, actor)
    if (reason) this.refuse(reason)
    if (listId === ctx.task.listId) throw new ForbiddenException(TASK_LISTS_REFUSALS.home)
    if (!isUuid(listId)) throw new NotFoundException(TASK_LISTS_REFUSALS.notIn)
    const gone = await this.db
      .delete(taskLists)
      .where(and(eq(taskLists.taskId, taskId), eq(taskLists.listId, listId)))
      .returning({ listId: taskLists.listId })
    if (gone.length === 0) throw new NotFoundException(TASK_LISTS_REFUSALS.notIn)
    await this.tasks.logTaskActivity({ taskId, actorId: actor.id, action: 'list_removed', meta: { listId } })
    this.realtime.emitToList(listId, { type: 'task.deleted', listId, taskId })
    return this.listsOf(taskId, actor)
  }
}

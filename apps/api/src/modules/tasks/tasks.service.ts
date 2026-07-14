import { Injectable, Inject, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common'
import { eq, and, asc, desc, inArray, isNull, sql } from 'drizzle-orm'
import {
  tasks,
  taskAssignees,
  taskWatchers,
  taskActivity,
  taskLabelAssignments,
  labels,
  taskChecklists,
  taskChecklistItems,
  taskDependencies,
  taskComments,
  taskCommentReactions,
  taskAttachments,
  timeEntries,
  users,
  lists,
  projects,
  spaces,
  workspaces,
  workspaceMembers,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { resolveEffectiveStatuses } from '../../common/statuses/status-resolution'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { SearchService } from '../search/search.service'
import { AutomationsService } from '../automations/automations.service'
import { WebhooksService } from '../webhooks/webhooks.service'
import { SlackService } from '../integrations/slack/slack.service'
import { NotificationsService } from '../notifications/notifications.service'
import { R2Service } from '../../common/storage/r2.service'
import { CalendarSyncService } from '../calendar-sync/calendar-sync.service'

type TaskPriority = 'urgent' | 'high' | 'normal' | 'low'
// Custom statuses per List replaced the fixed enum, so we accept any string
// key. The service validates the key against `list_statuses` for the task's
// list and looks up the canonical `category` (open/in_progress/closed) to
// drive completion semantics, blocker checks, and reports.
type TaskStatus = string
type StatusCategory = 'open' | 'in_progress' | 'closed'

type ActivityAction =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'archived'
  | 'restored'
  | 'status_changed'
  | 'priority_changed'
  | 'assigned'
  | 'unassigned'
  | 'commented'
  | 'label_added'
  | 'label_removed'
  | 'due_date_changed'
  | 'dependency_added'
  | 'dependency_removed'
  | 'checklist_item_toggled'
  | 'attachment_added'
  | 'attachment_removed'
  | 'subtask_added'
  | 'moved'

type DependencyType = 'blocks' | 'blocked_by' | 'related_to'

/** Hard cap on a single task/comment attachment (Plan §4). */
export const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024 // 100 MB

type RecurrenceRule = {
  mode: 'daily' | 'weekly' | 'monthly'
  interval?: number
  weekdays?: number[]
  dayOfMonth?: number
  skipWeekends?: boolean
}

@Injectable()
export class TasksService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private realtime: RealtimeGateway,
    private search: SearchService,
    private automations: AutomationsService,
    private webhooks: WebhooksService,
    private slack: SlackService,
    private notifications: NotificationsService,
    private r2: R2Service,
    private calendarSync: CalendarSyncService,
  ) {}

  /**
   * Best-effort push of a task to every connected calendar in its workspace.
   * Swallowed errors keep task writes fast; failures surface via the
   * connection's status field on the next sync poll.
   */
  private fireCalendarPush(taskId: string): void {
    void this.calendarSync.pushTask(taskId).catch(() => undefined)
  }

  /**
   * Best-effort fan-out of a task event to automations + webhooks.
   * Errors are logged but never propagated — task ops must not break
   * because a webhook URL is down.
   */
  private async fireTaskEvent(
    eventType: string,
    workspaceId: string,
    payload: Record<string, unknown>,
    triggerCtx: {
      taskId?: string
      userId?: string
      projectId?: string
      listId?: string
      oldValue?: string
      newValue?: string
      changedField?: string
    } = {},
  ) {
    try {
      await this.automations.fire(eventType, { workspaceId, ...triggerCtx })
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`[automations.fire] ${eventType} failed:`, e)
    }
    try {
      await this.webhooks.fire(workspaceId, eventType, payload)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`[webhooks.fire] ${eventType} failed:`, e)
    }
    try {
      await this.slack.notify(workspaceId, eventType, this.formatSlackMessage(eventType, payload))
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`[slack.notify] ${eventType} failed:`, e)
    }
  }

  private formatSlackMessage(eventType: string, payload: Record<string, unknown>): string {
    const task = (payload.task as { title?: string; id?: string } | undefined) ?? null
    const title = task?.title ?? 'a task'
    switch (eventType) {
      case 'task.created':
        return `:sparkles: New task created: *${title}*`
      case 'task.status_changed':
        return `:arrows_counterclockwise: *${title}* → ${payload.to ?? '?'}`
      case 'task.assigned':
        return `:bust_in_silhouette: *${title}* was assigned to a teammate`
      case 'task.deleted':
        return `:wastebasket: Task archived: *${title}*`
      default:
        return `:bell: ${eventType} — ${title}`
    }
  }

  private async resolveWorkspaceForList(listId: string): Promise<{
    workspaceId: string
    spaceId: string
    projectId: string
  } | null> {
    const [row] = await this.db
      .select({ workspaceId: spaces.workspaceId, spaceId: spaces.id, projectId: lists.projectId })
      .from(lists)
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(lists.id, listId))
      .limit(1)
    return row ?? null
  }

  private async resolveWorkspaceName(workspaceId: string): Promise<string> {
    const [row] = await this.db
      .select({ name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1)
    return row?.name ?? 'Rundesk'
  }

  private buildTaskUrl(workspaceId: string, spaceId: string, projectId: string, listId: string, taskId: string): string {
    return `/app/${workspaceId}/${spaceId}/${projectId}/${listId}?task=${taskId}`
  }

  private async notifyTaskUpdate(params: {
    taskId: string
    actorId: string
    workspaceId: string
    workspaceName: string
    taskTitle: string
    taskUrl: string
    patch: Partial<{
      title: string
      description: string | null
      priority: TaskPriority
      status: TaskStatus
      startDate: Date | null
      dueDate: Date | null
      position: number
      timeEstimate: number | null
      isArchived: boolean
    }>
    before: {
      status: TaskStatus
      priority: TaskPriority
      title: string
      dueDate: Date | null
      description: string | null
    }
  }) {
    const watcherRows = await this.db
      .select({ userId: taskWatchers.userId })
      .from(taskWatchers)
      .where(eq(taskWatchers.taskId, params.taskId))

    const watcherIds = [...new Set(watcherRows.map((w) => w.userId))]
      .filter((id) => id !== params.actorId)

    if (watcherIds.length === 0) return

    const changedBits: string[] = []
    if (params.patch.status && params.patch.status !== params.before.status) changedBits.push(`status to ${params.patch.status}`)
    if (params.patch.priority && params.patch.priority !== params.before.priority) changedBits.push(`priority to ${params.patch.priority}`)
    if ('dueDate' in params.patch && (params.patch.dueDate?.getTime() ?? null) !== (params.before.dueDate?.getTime() ?? null)) {
      changedBits.push(params.patch.dueDate ? 'due date' : 'due date cleared')
    }
    if (params.patch.title && params.patch.title !== params.before.title) changedBits.push('title')
    if ('description' in params.patch && params.patch.description !== params.before.description) changedBits.push('description')

    if (changedBits.length === 0) return

    const notificationType = params.patch.status && params.patch.status !== params.before.status
      ? 'task_status_changed' as const
      : 'task_updated' as const

    const body = changedBits.length === 1
      ? `Updated ${changedBits[0]}.`
      : `Updated ${changedBits.slice(0, 3).join(', ')}${changedBits.length > 3 ? ', and more' : ''}.`

    for (const userId of watcherIds) {
      void this.notifications.create({
        userId,
        workspaceId: params.workspaceId,
        actorId: params.actorId,
        type: notificationType,
        title: `"${params.taskTitle}" was updated`,
        body,
        target: { entityType: 'task', entityId: params.taskId, url: params.taskUrl },
        emailContext: { taskTitle: params.taskTitle, workspaceName: params.workspaceName },
      })
    }
  }

  private async indexTaskInSearch(taskId: string) {
    try {
      const ctx = await this.resolveTaskContext(taskId)
      if (!ctx) return
      await this.search.indexTask(
        {
          id: ctx.task.id,
          title: ctx.task.title,
          description: ctx.task.description,
          listId: ctx.task.listId,
          createdAt: ctx.task.createdAt,
        },
        ctx.space.workspaceId,
        ctx.space.id,
        ctx.project.id,
      )
    } catch {
      // Search is best-effort; never fail a write because of it.
    }
  }

  private extractMentionIds(body: string): string[] {
    const ids = new Set<string>()
    const patterns = [
      /<@([0-9a-fA-F-]{36})>/g,
      /@\[([0-9a-fA-F-]{36})\]/g,
    ]
    for (const pattern of patterns) {
      let match: RegExpExecArray | null
      while ((match = pattern.exec(body)) !== null) ids.add(match[1])
    }
    return [...ids]
  }

  // --- Helpers -------------------------------------------------------------
  private async logActivity(params: {
    taskId: string
    actorId?: string | null
    action: ActivityAction
    meta?: Record<string, unknown>
  }) {
    const [entry] = await this.db
      .insert(taskActivity)
      .values({
        taskId: params.taskId,
        actorId: params.actorId ?? null,
        action: params.action,
        meta: params.meta,
      })
      .returning()
    this.realtime.emitToTask(params.taskId, { type: 'activity.created', taskId: params.taskId, activity: entry })
    return entry
  }

  private async getListIdOrThrow(taskId: string): Promise<string> {
    const [row] = await this.db.select({ listId: tasks.listId }).from(tasks).where(eq(tasks.id, taskId))
    if (!row) throw new NotFoundException('Task not found')
    return row.listId
  }

  private async assertTaskWriteAccess(taskId: string, actorId: string) {
    const [ctx] = await this.db
      .select({
        taskId: tasks.id,
        listId: tasks.listId,
        createdById: tasks.createdById,
        workspaceId: spaces.workspaceId,
      })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(tasks.id, taskId))
      .limit(1)
    if (!ctx) throw new NotFoundException('Task not found')

    const [membership] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, ctx.workspaceId), eq(workspaceMembers.userId, actorId)))
      .limit(1)
    if (!membership) throw new NotFoundException('Workspace not found')

    if (['workspace_admin', 'manager', 'super_admin'].includes(membership.role)) return ctx
    if (membership.role === 'guest') throw new ForbiddenException('Guests cannot edit tasks')

    if (ctx.createdById === actorId) return ctx
    const [assignee] = await this.db
      .select({ userId: taskAssignees.userId })
      .from(taskAssignees)
      .where(and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.userId, actorId)))
      .limit(1)
    if (assignee) return ctx
    throw new ForbiddenException('Only assignees, creators, managers, and workspace admins can edit this task')
  }

  private sanitizeFileName(input: string): string {
    return input.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'file'
  }

  /** Reject attachments over the hard cap (Plan §4). Undefined size is allowed. */
  private assertAttachmentSize(sizeBytes?: number): void {
    if (sizeBytes != null && Number.isFinite(sizeBytes) && sizeBytes > MAX_ATTACHMENT_BYTES) {
      const mb = Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))
      throw new BadRequestException(`Attachment exceeds the ${mb} MB limit`)
    }
  }

  private clampRecurrenceInterval(interval?: number): number {
    if (!interval || !Number.isFinite(interval)) return 1
    return Math.min(Math.max(Math.floor(interval), 1), 52)
  }

  private shiftByRecurrenceRule(input: Date | null | undefined, rule: RecurrenceRule): Date | undefined {
    if (!input) return undefined
    const source = new Date(input)
    const interval = this.clampRecurrenceInterval(rule.interval)

    if (rule.mode === 'daily') {
      const next = new Date(source)
      next.setDate(next.getDate() + interval)
      if (rule.skipWeekends) {
        while (next.getDay() === 0 || next.getDay() === 6) next.setDate(next.getDate() + 1)
      }
      return next
    }

    if (rule.mode === 'weekly') {
      const allowed = (rule.weekdays ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      const weekdays = allowed.length > 0 ? allowed : [source.getDay()]
      const next = new Date(source)
      for (let i = 0; i < 370; i++) {
        next.setDate(next.getDate() + 1)
        const diffDays = Math.floor((next.getTime() - source.getTime()) / (24 * 60 * 60 * 1000))
        const weekIndex = Math.floor(diffDays / 7)
        if ((weekIndex % interval) === 0 && weekdays.includes(next.getDay())) return next
      }
      return undefined
    }

    // monthly
    const targetDay = Math.min(Math.max(Math.floor(rule.dayOfMonth ?? source.getDate()), 1), 31)
    const next = new Date(source)
    next.setDate(1)
    next.setMonth(next.getMonth() + interval)
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
    next.setDate(Math.min(targetDay, lastDay))
    return next
  }

  private async getOpenBlockers(taskId: string) {
    const directBlockedBy = await this.db
      .select({ blockerTaskId: taskDependencies.relatedTaskId })
      .from(taskDependencies)
      .where(and(eq(taskDependencies.taskId, taskId), eq(taskDependencies.type, 'blocked_by')))
    const reverseBlocks = await this.db
      .select({ blockerTaskId: taskDependencies.taskId })
      .from(taskDependencies)
      .where(and(eq(taskDependencies.relatedTaskId, taskId), eq(taskDependencies.type, 'blocks')))
    const blockerIds = [...new Set([...directBlockedBy, ...reverseBlocks].map((r) => r.blockerTaskId))]
    if (blockerIds.length === 0) return []
    const blockerTasks = await this.db
      .select({ id: tasks.id, status: tasks.status, title: tasks.title })
      .from(tasks)
      .where(inArray(tasks.id, blockerIds))
    return blockerTasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled')
  }

  private async hasBlockingPath(fromTaskId: string, toTaskId: string): Promise<boolean> {
    if (fromTaskId === toTaskId) return true
    const visited = new Set<string>()
    let frontier = [fromTaskId]
    while (frontier.length > 0) {
      const current = frontier.filter((id) => !visited.has(id))
      frontier = []
      if (current.length === 0) break
      for (const node of current) visited.add(node)

      const forwardBlocks = await this.db
        .select({ nextId: taskDependencies.relatedTaskId })
        .from(taskDependencies)
        .where(and(inArray(taskDependencies.taskId, current), eq(taskDependencies.type, 'blocks')))
      const reverseBlockedBy = await this.db
        .select({ nextId: taskDependencies.taskId })
        .from(taskDependencies)
        .where(and(inArray(taskDependencies.relatedTaskId, current), eq(taskDependencies.type, 'blocked_by')))
      const nextNodes = [...forwardBlocks, ...reverseBlockedBy].map((r) => r.nextId)
      if (nextNodes.includes(toTaskId)) return true
      frontier = nextNodes
    }
    return false
  }

  async createAttachmentUploadUrl(
    taskId: string,
    actorId: string,
    body: { fileName: string; contentType: string; sizeBytes?: number },
  ) {
    const ctx = await this.assertTaskWriteAccess(taskId, actorId)
    if (!this.r2.configured) throw new BadRequestException('R2 storage is not configured')
    this.assertAttachmentSize(body.sizeBytes)
    const fileName = this.sanitizeFileName(body.fileName)
    const key = `workspaces/${ctx.workspaceId}/tasks/${taskId}/attachments/${Date.now()}-${fileName}`
    const uploadUrl = await this.r2.presignPutObject(key, body.contentType || 'application/octet-stream', {
      uploadedby: actorId,
      taskid: taskId,
    })
    return { uploadUrl, storageKey: key }
  }

  // --- Task CRUD -----------------------------------------------------------
  /**
   * Resolve a status key against the list's `list_statuses` rows and return
   * the canonical key + category bucket. Falls back to the list's first
   * "open" status if no key is provided and to the very first status if
   * none are marked open. Throws BadRequest if the caller passed a key
   * that isn't defined for the list.
   */
  private async resolveStatusForList(
    listId: string,
    requestedKey: string | undefined,
  ): Promise<{ key: string; category: StatusCategory }> {
    // Resolve against the list's effective status set, honouring its
    // status_scope (own list_statuses, or the project/space template).
    const rows = await resolveEffectiveStatuses(this.db, listId)

    if (rows.length === 0) {
      // Lists migrated from before custom-statuses always have seeded rows,
      // so falling back to the legacy enum value keeps newly-created lists
      // (whose statuses haven't been seeded yet) usable.
      return { key: requestedKey ?? 'todo', category: 'open' }
    }

    if (requestedKey) {
      const match = rows.find((r) => r.key === requestedKey)
      if (match) return { key: match.key, category: match.category as StatusCategory }
      // Fallback: map common/legacy keys to a category and pick the list's first
      // status in that category, so callers passing 'done'/'todo' still work on
      // lists whose statuses were renamed (instead of a hard 400).
      const closedKeys = new Set(['done', 'complete', 'completed', 'closed', 'cancelled'])
      const inferred: StatusCategory = closedKeys.has(requestedKey.toLowerCase()) ? 'closed' : 'open'
      const byCategory =
        rows.find((r) => (r.category as StatusCategory) === inferred) ??
        (inferred === 'closed' ? rows[rows.length - 1] : rows[0])
      if (byCategory) return { key: byCategory.key, category: byCategory.category as StatusCategory }
      throw new BadRequestException(
        `Status "${requestedKey}" is not defined for this list. ` +
          `Available statuses: ${rows.map((r) => r.key).join(', ')}`,
      )
    }

    const firstOpen = rows.find((r) => r.category === 'open')
    const fallback = firstOpen ?? rows[0]
    return { key: fallback.key, category: fallback.category as StatusCategory }
  }

  /** Guests may view/comment but not create tasks (Plan §3.3). */
  private async assertNotGuestInList(listId: string, actorId: string) {
    const ctx = await this.resolveWorkspaceForList(listId)
    if (!ctx) return
    const [m] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, ctx.workspaceId), eq(workspaceMembers.userId, actorId)))
      .limit(1)
    if (m?.role === 'guest') throw new ForbiddenException('Guests cannot create tasks')
  }

  async createTask(data: {
    listId: string
    title: string
    description?: string
    priority?: TaskPriority
    status?: TaskStatus
    position?: number
    startDate?: Date
    dueDate?: Date
    timeEstimate?: number
    parentTaskId?: string
    assigneeIds?: string[]
    labelIds?: string[]
    createdById: string
  }) {
    await this.assertNotGuestInList(data.listId, data.createdById)
    // Cap nesting at two levels (parent → subtask). A subtask cannot itself have
    // subtasks, so reject a parent that is already a subtask (Plan §4).
    if (data.parentTaskId) {
      const [parent] = await this.db
        .select({ parentTaskId: tasks.parentTaskId })
        .from(tasks)
        .where(eq(tasks.id, data.parentTaskId))
        .limit(1)
      if (!parent) throw new NotFoundException('Parent task not found')
      if (parent.parentTaskId) {
        throw new BadRequestException('Subtasks can only be nested one level deep')
      }
    }
    const resolved = await this.resolveStatusForList(data.listId, data.status)

    const [task] = await this.db
      .insert(tasks)
      .values({
        listId: data.listId,
        parentTaskId: data.parentTaskId,
        createdById: data.createdById,
        title: data.title,
        description: data.description,
        priority: data.priority ?? 'normal',
        status: resolved.key,
        statusCategory: resolved.category,
        position: data.position ?? 0,
        startDate: data.startDate,
        dueDate: data.dueDate,
        timeEstimate: data.timeEstimate,
      })
      .returning()

    if (data.assigneeIds?.length) {
      await this.db.insert(taskAssignees).values(
        data.assigneeIds.map((userId) => ({ taskId: task.id, userId })),
      )
    }
    if (data.labelIds?.length) {
      await this.db
        .insert(taskLabelAssignments)
        .values(data.labelIds.map((labelId) => ({ taskId: task.id, labelId })))
        .onConflictDoNothing()
    }
    // Creator is auto-subscribed as a watcher so they hear about replies/activity.
    await this.db.insert(taskWatchers).values({ taskId: task.id, userId: data.createdById }).onConflictDoNothing()

    await this.logActivity({ taskId: task.id, actorId: data.createdById, action: 'created' })

    if (data.parentTaskId) {
      await this.logActivity({
        taskId: data.parentTaskId,
        actorId: data.createdById,
        action: 'subtask_added',
        meta: { subtaskId: task.id, title: task.title },
      })
    }

    const hydrated = await this.getTask(task.id)
    this.realtime.emitToList(data.listId, { type: 'task.created', listId: data.listId, task: hydrated })
    void this.indexTaskInSearch(task.id)

    // Fire automations + webhooks (best effort)
    const ctx = await this.resolveWorkspaceForList(data.listId)
    if (ctx) {
      void this.fireTaskEvent('task.created', ctx.workspaceId, { task: hydrated }, {
        taskId: task.id,
        userId: data.createdById,
        projectId: ctx.projectId,
        listId: data.listId,
      })
    }

    // Push to connected calendars if the task has a due date.
    if (task.dueDate) this.fireCalendarPush(task.id)

    return hydrated
  }

  /**
   * All tasks across the workspace that have a start or due date — used by
   * the Gantt / timeline view. Returns shape suitable for direct render.
   */
  async getTimelineForWorkspace(
    workspaceId: string,
    opts: { from?: Date; to?: Date; projectId?: string } = {},
  ) {
    const rows = await this.db
      .select({
        id: tasks.id,
        title: tasks.title,
        startDate: tasks.startDate,
        dueDate: tasks.dueDate,
        status: tasks.status,
        priority: tasks.priority,
        listId: tasks.listId,
        listName: lists.name,
        projectId: lists.projectId,
        projectName: projects.name,
        spaceId: projects.spaceId,
        spaceName: spaces.name,
      })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(
        and(
          eq(spaces.workspaceId, workspaceId),
          eq(tasks.isArchived, false),
          ...(opts.projectId ? [eq(lists.projectId, opts.projectId)] : []),
        ),
      )
      .orderBy(asc(tasks.startDate), asc(tasks.dueDate))

    // Only return tasks with at least a due date — the rest can't be plotted.
    return rows.filter((r) => r.startDate || r.dueDate)
  }

  async getTasksForMember(workspaceId: string, userId: string) {
    return this.db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        updatedAt: tasks.updatedAt,
        listId: lists.id,
        listName: lists.name,
        projectId: projects.id,
        projectName: projects.name,
        spaceId: spaces.id,
        spaceName: spaces.name,
      })
      .from(taskAssignees)
      .innerJoin(tasks, eq(tasks.id, taskAssignees.taskId))
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(eq(taskAssignees.userId, userId), eq(spaces.workspaceId, workspaceId), eq(tasks.isArchived, false)))
      .orderBy(desc(tasks.updatedAt))
      .limit(100)
  }

  /**
   * Flat list of every task in a workspace with denormalised
   * space/project/list context. Used by the dashboard, timeline, and
   * any other view that previously had to fan out
   * spaces → projects → lists → tasks (N+1+N+M+L+T HTTP requests).
   *
   * Returns up to `limit` rows ordered by updatedAt desc. When
   * `includeAssignees` is true (default true), each row carries a
   * compact `assignees` array — fetched in one extra batched query
   * keyed on the returned task ids — so the client can filter
   * "tasks assigned to me" without another round trip.
   */
  async getTasksForWorkspace(
    workspaceId: string,
    limit = 500,
    opts: { includeAssignees?: boolean } = {},
  ) {
    const { includeAssignees = true } = opts
    const safeLimit = Math.min(Math.max(limit, 1), 1000)

    const rows = await this.db
      .select({
        id:             tasks.id,
        title:          tasks.title,
        status:         tasks.status,
        statusCategory: tasks.statusCategory,
        priority:       tasks.priority,
        listId:         lists.id,
        listName:       lists.name,
        projectId:      projects.id,
        projectName:    projects.name,
        spaceId:        spaces.id,
        spaceName:      spaces.name,
        startDate:      tasks.startDate,
        dueDate:        tasks.dueDate,
        completedAt:    tasks.completedAt,
        createdAt:      tasks.createdAt,
        updatedAt:      tasks.updatedAt,
      })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(eq(spaces.workspaceId, workspaceId), eq(tasks.isArchived, false)))
      .orderBy(desc(tasks.updatedAt))
      .limit(safeLimit)

    type AssigneeRef = {
      userId: string
      displayName: string | null
      avatarUrl: string | null
    }
    const empty: AssigneeRef[] = []

    if (!includeAssignees || rows.length === 0) {
      return rows.map((r) => ({ ...r, assignees: empty }))
    }

    const assigneeRows = await this.db
      .select({
        taskId:      taskAssignees.taskId,
        userId:      taskAssignees.userId,
        displayName: users.displayName,
        avatarUrl:   users.avatarUrl,
      })
      .from(taskAssignees)
      .innerJoin(users, eq(users.id, taskAssignees.userId))
      .where(inArray(taskAssignees.taskId, rows.map((r) => r.id)))

    const byTask = new Map<string, AssigneeRef[]>()
    for (const a of assigneeRows) {
      const list = byTask.get(a.taskId) ?? []
      list.push({ userId: a.userId, displayName: a.displayName, avatarUrl: a.avatarUrl })
      byTask.set(a.taskId, list)
    }
    return rows.map((r) => ({ ...r, assignees: byTask.get(r.id) ?? empty }))
  }

  async getTasksByList(
    listId: string,
    opts: { includeSubtasks?: boolean; includeArchived?: boolean } = {},
  ) {
    const { includeSubtasks = false, includeArchived = false } = opts
    const rows = await this.db.query.tasks.findMany({
      where: and(
        eq(tasks.listId, listId),
        includeSubtasks ? undefined : isNull(tasks.parentTaskId),
        includeArchived ? undefined : eq(tasks.isArchived, false),
      ),
      orderBy: [asc(tasks.position), asc(tasks.createdAt)],
      with: {
        assignees: { with: { user: true } },
        subtasks:  { where: eq(tasks.isArchived, false) },
      },
    })
    // Attach labels (drizzle's with doesn't follow the join-table->label shape cleanly)
    const taskIds = rows.map((r) => r.id)
    const labelRows = taskIds.length
      ? await this.db
          .select({
            taskId: taskLabelAssignments.taskId,
            label: labels,
          })
          .from(taskLabelAssignments)
          .innerJoin(labels, eq(labels.id, taskLabelAssignments.labelId))
          .where(inArray(taskLabelAssignments.taskId, taskIds))
      : []
    const byTask = new Map<string, typeof labelRows[number]['label'][]>()
    for (const lr of labelRows) {
      const arr = byTask.get(lr.taskId) ?? []
      arr.push(lr.label)
      byTask.set(lr.taskId, arr)
    }
    const dependencyRows = taskIds.length
      ? await this.db
          .select({
            taskId: taskDependencies.taskId,
            relatedTaskId: taskDependencies.relatedTaskId,
            type: taskDependencies.type,
            relatedStatus: tasks.status,
            relatedArchived: tasks.isArchived,
          })
          .from(taskDependencies)
          .innerJoin(tasks, eq(tasks.id, taskDependencies.relatedTaskId))
          .where(inArray(taskDependencies.taskId, taskIds))
      : []
    const reverseDependencyRows = taskIds.length
      ? await this.db
          .select({
            taskId: taskDependencies.relatedTaskId,
            relatedTaskId: taskDependencies.taskId,
            type: taskDependencies.type,
            relatedStatus: tasks.status,
            relatedArchived: tasks.isArchived,
          })
          .from(taskDependencies)
          .innerJoin(tasks, eq(tasks.id, taskDependencies.taskId))
          .where(inArray(taskDependencies.relatedTaskId, taskIds))
      : []

    const openBlockerCount = new Map<string, number>()
    const blocksOpenCount = new Map<string, number>()
    const isOpenRelated = (status: TaskStatus, archived: boolean) =>
      !archived && status !== 'done' && status !== 'cancelled'
    for (const dep of dependencyRows) {
      if (!isOpenRelated(dep.relatedStatus as TaskStatus, dep.relatedArchived)) continue
      if (dep.type === 'blocked_by') {
        openBlockerCount.set(dep.taskId, (openBlockerCount.get(dep.taskId) ?? 0) + 1)
      }
      if (dep.type === 'blocks') {
        blocksOpenCount.set(dep.taskId, (blocksOpenCount.get(dep.taskId) ?? 0) + 1)
      }
    }
    for (const dep of reverseDependencyRows) {
      if (!isOpenRelated(dep.relatedStatus as TaskStatus, dep.relatedArchived)) continue
      if (dep.type === 'blocks') {
        openBlockerCount.set(dep.taskId, (openBlockerCount.get(dep.taskId) ?? 0) + 1)
      }
      if (dep.type === 'blocked_by') {
        blocksOpenCount.set(dep.taskId, (blocksOpenCount.get(dep.taskId) ?? 0) + 1)
      }
    }

    return rows.map((r) => ({
      ...r,
      labels: byTask.get(r.id) ?? [],
      openBlockerCount: openBlockerCount.get(r.id) ?? 0,
      blocksOpenCount: blocksOpenCount.get(r.id) ?? 0,
    }))
  }

  // Direct children (subtasks) of a task, for the task detail Subtasks tab.
  // Each subtask is a full task row plus its own assignees so the panel can
  // edit assignee/due-date inline, independent of the parent (Plan §4).
  async listSubtasks(taskId: string) {
    const rows = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.parentTaskId, taskId), eq(tasks.isArchived, false)))
      .orderBy(asc(tasks.position))
    if (rows.length === 0) return []
    const ids = rows.map((r) => r.id)
    const assigneeRows = await this.db
      .select({ taskId: taskAssignees.taskId, userId: users.id, displayName: users.displayName, email: users.email })
      .from(taskAssignees)
      .innerJoin(users, eq(users.id, taskAssignees.userId))
      .where(inArray(taskAssignees.taskId, ids))
    const byTask = new Map<string, Array<{ userId: string; displayName: string | null; email: string | null }>>()
    for (const a of assigneeRows) {
      const list = byTask.get(a.taskId) ?? []
      list.push({ userId: a.userId, displayName: a.displayName, email: a.email })
      byTask.set(a.taskId, list)
    }
    return rows.map((r) => ({ ...r, assignees: byTask.get(r.id) ?? [] }))
  }

  async getTask(taskId: string) {
    const row = await this.db.query.tasks.findFirst({
      where: eq(tasks.id, taskId),
      with: {
        assignees: { with: { user: true } },
        subtasks:  { where: eq(tasks.isArchived, false), orderBy: asc(tasks.position) },
        creator:   true,
      },
    })
    if (!row) return null

    const [labelRows, watcherRows, checklistRows, dependencyRows, attachmentRows] = await Promise.all([
      this.db
        .select({ label: labels })
        .from(taskLabelAssignments)
        .innerJoin(labels, eq(labels.id, taskLabelAssignments.labelId))
        .where(eq(taskLabelAssignments.taskId, taskId)),
      this.db
        .select({ watcher: taskWatchers, user: users })
        .from(taskWatchers)
        .innerJoin(users, eq(users.id, taskWatchers.userId))
        .where(eq(taskWatchers.taskId, taskId)),
      this.db.query.taskChecklists.findMany({
        where: eq(taskChecklists.taskId, taskId),
        orderBy: asc(taskChecklists.position),
        with: { items: { orderBy: asc(taskChecklistItems.position) } },
      }),
      this.db
        .select({
          dep: taskDependencies,
          related: tasks,
        })
        .from(taskDependencies)
        .innerJoin(tasks, eq(tasks.id, taskDependencies.relatedTaskId))
        .where(eq(taskDependencies.taskId, taskId)),
      this.db.select().from(taskAttachments).where(eq(taskAttachments.taskId, taskId)),
    ])

    return {
      ...row,
      labels: labelRows.map((l) => l.label),
      watchers: watcherRows.map((w) => ({ ...w.watcher, user: w.user })),
      checklists: checklistRows,
      dependencies: dependencyRows,
      attachments: attachmentRows,
    }
  }

  async listAttachments(taskId: string) {
    const rows = await this.db.select().from(taskAttachments).where(eq(taskAttachments.taskId, taskId))
    return Promise.all(rows.map(async (row) => ({
      id: row.id,
      fileName: row.fileName,
      fileSize: row.sizeBytes,
      mimeType: row.contentType,
      uploadedBy: row.uploadedById,
      createdAt: row.createdAt,
      storageKey: row.storageKey,
      url: this.r2.configured ? await this.r2.getObjectUrl(row.storageKey) : row.storageKey,
    })))
  }

  async addAttachment(
    taskId: string,
    actorId: string,
    data: { fileName: string; url?: string; storageKey?: string; contentType?: string; sizeBytes?: number },
  ) {
    await this.assertTaskWriteAccess(taskId, actorId)
    this.assertAttachmentSize(data.sizeBytes)
    const [task] = await this.db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
    if (!task) throw new NotFoundException('Task not found')
    const storageKey = data.storageKey ?? data.url
    if (!storageKey) throw new BadRequestException('storageKey is required')
    const [row] = await this.db
      .insert(taskAttachments)
      .values({
        taskId,
        uploadedById: actorId,
        fileName: data.fileName,
        contentType: data.contentType ?? 'application/octet-stream',
        sizeBytes: data.sizeBytes ?? 0,
        storageKey,
      })
      .returning()
    await this.logActivity({
      taskId,
      actorId,
      action: 'attachment_added',
      meta: { attachmentId: row.id, fileName: row.fileName },
    })
    return {
      id: row.id,
      fileName: row.fileName,
      fileSize: row.sizeBytes,
      mimeType: row.contentType,
      uploadedBy: row.uploadedById,
      createdAt: row.createdAt,
      storageKey: row.storageKey,
      url: this.r2.configured ? await this.r2.getObjectUrl(row.storageKey) : row.storageKey,
    }
  }

  async removeAttachment(taskId: string, attachmentId: string, actorId: string) {
    await this.assertTaskWriteAccess(taskId, actorId)
    const [row] = await this.db
      .delete(taskAttachments)
      .where(and(eq(taskAttachments.id, attachmentId), eq(taskAttachments.taskId, taskId)))
      .returning()
    if (!row) throw new NotFoundException('Attachment not found')
    if (this.r2.configured) {
      try {
        await this.r2.deleteObject(row.storageKey)
      } catch {
        // best-effort cleanup
      }
    }
    await this.logActivity({
      taskId,
      actorId,
      action: 'attachment_removed',
      meta: { attachmentId },
    })
    return { ok: true }
  }

  async updateTask(
    taskId: string,
    actorId: string,
    patch: Partial<{
      title: string
      description: string | null
      priority: TaskPriority
      status: TaskStatus
      startDate: Date | null
      dueDate: Date | null
      position: number
      timeEstimate: number | null
      coverColor: string | null
      isArchived: boolean
    }>,
  ) {
    await this.assertTaskWriteAccess(taskId, actorId)
    const [before] = await this.db.select().from(tasks).where(eq(tasks.id, taskId))
    if (!before) throw new NotFoundException('Task not found')

    // Resolve the requested status to its canonical key + category bucket
    // so we can drive completion / blocker semantics off `category` rather
    // than hard-coded enum values.
    let nextCategory: StatusCategory | undefined
    if (patch.status !== undefined) {
      const resolved = await this.resolveStatusForList(before.listId, patch.status)
      patch.status = resolved.key
      nextCategory = resolved.category
      if (nextCategory !== 'open') {
        const blockers = await this.getOpenBlockers(taskId)
        if (blockers.length > 0) {
          throw new BadRequestException(
            `Task is blocked by open dependencies: ${blockers.map((b) => `${b.title} (${b.id})`).join(', ')}`,
          )
        }
      }
    }

    const set: Record<string, unknown> = { ...patch, updatedAt: new Date() }
    if (nextCategory) {
      set.statusCategory = nextCategory
      const wasClosed = (before.statusCategory as StatusCategory) === 'closed'
      if (nextCategory === 'closed' && !wasClosed) set.completedAt = new Date()
      if (nextCategory !== 'closed' && wasClosed) set.completedAt = null
    }

    const [after] = await this.db.update(tasks).set(set).where(eq(tasks.id, taskId)).returning()

    // Auto-materialise the next occurrence when a recurring task is completed,
    // handing the recurrence forward to it. Guarded so any hiccup never blocks
    // the status change itself. No-op for the (vast majority) non-recurring tasks.
    if (
      nextCategory === 'closed' &&
      (before.statusCategory as StatusCategory) !== 'closed' &&
      before.recurrence
    ) {
      try {
        const rec = before.recurrence as { cadenceDays?: number | null; rule?: RecurrenceRule | null }
        const next = await this.createNextRecurringOccurrence(
          taskId,
          actorId,
          rec.cadenceDays ?? null,
          rec.rule ?? null,
        )
        await this.db.update(tasks).set({ recurrence: before.recurrence }).where(eq(tasks.id, next.nextTaskId))
        await this.db.update(tasks).set({ recurrence: null }).where(eq(tasks.id, taskId))
      } catch {
        // Recurrence is best-effort; the completion still stands.
      }
    }

    // Emit activity log entries for the interesting transitions.
    if (patch.status && patch.status !== before.status) {
      await this.logActivity({
        taskId,
        actorId,
        action: 'status_changed',
        meta: { from: before.status, to: patch.status },
      })
    }
    if (patch.priority && patch.priority !== before.priority) {
      await this.logActivity({
        taskId,
        actorId,
        action: 'priority_changed',
        meta: { from: before.priority, to: patch.priority },
      })
    }
    if ('dueDate' in patch && (patch.dueDate?.getTime() ?? null) !== (before.dueDate?.getTime() ?? null)) {
      await this.logActivity({
        taskId,
        actorId,
        action: 'due_date_changed',
        meta: { from: before.dueDate, to: patch.dueDate ?? null },
      })
    }
    if (
      (patch.title && patch.title !== before.title) ||
      ('description' in patch && patch.description !== before.description) ||
      'timeEstimate' in patch
    ) {
      await this.logActivity({ taskId, actorId, action: 'updated', meta: { fields: Object.keys(patch) } })
    }

    this.realtime.emitToList(after.listId, {
      type: 'task.updated',
      listId: after.listId,
      taskId,
      patch: set as Record<string, unknown>,
    })
    this.realtime.emitToTask(taskId, {
      type: 'task.updated',
      listId: after.listId,
      taskId,
      patch: set as Record<string, unknown>,
    })
    if ('title' in patch || 'description' in patch) void this.indexTaskInSearch(taskId)

    // Fire automation/webhook events
    const ctx = await this.resolveWorkspaceForList(after.listId)
    if (ctx) {
      const hydrated = await this.getTask(taskId)
      if (!hydrated) throw new NotFoundException('Task not found')
      if (patch.status && patch.status !== before.status) {
        void this.fireTaskEvent('task.status_changed', ctx.workspaceId, {
          task: hydrated,
          from: before.status,
          to: patch.status,
        }, {
          taskId,
          userId: actorId,
          projectId: ctx.projectId,
          listId: after.listId,
          changedField: 'status',
          oldValue: before.status,
          newValue: patch.status,
        })
      }
      const workspaceName = await this.resolveWorkspaceName(ctx.workspaceId)
      const taskUrl = this.buildTaskUrl(ctx.workspaceId, ctx.spaceId, ctx.projectId, after.listId, taskId)
      void this.notifyTaskUpdate({
        taskId,
        actorId,
        workspaceId: ctx.workspaceId,
        workspaceName,
        taskTitle: hydrated.title,
        taskUrl,
        patch,
        before: {
          status: before.status,
          priority: before.priority,
          title: before.title,
          dueDate: before.dueDate,
          description: before.description,
        },
      })
      void this.fireTaskEvent('task.updated', ctx.workspaceId, { task: hydrated, patch }, {
        taskId,
        userId: actorId,
        projectId: ctx.projectId,
        listId: after.listId,
      })

      // Sync to connected calendars when any field that drives an event
      // surface (date / archive / title / description) changed.
      const calendarRelevant =
        'dueDate' in patch ||
        'startDate' in patch ||
        'isArchived' in patch ||
        'title' in patch ||
        'description' in patch
      if (calendarRelevant) this.fireCalendarPush(taskId)

      return hydrated
    }

    return this.getTask(taskId)
  }

  async bulkUpdateTasks(
    taskIds: string[],
    actorId: string,
    patch: Partial<{
      priority: TaskPriority
      status: TaskStatus
      startDate: Date | null
      dueDate: Date | null
      timeEstimate: number | null
      isArchived: boolean
      assigneeIdsAdd: string[]
      assigneeIdsRemove: string[]
      labelIdsAdd: string[]
      labelIdsRemove: string[]
      dependenciesAdd: Array<{
        relatedTaskId: string
        type: DependencyType
      }>
      dependenciesRemove: Array<{
        relatedTaskId: string
        type: DependencyType
      }>
    }>,
  ) {
    const uniqueTaskIds = [...new Set(taskIds)].filter(Boolean)
    if (uniqueTaskIds.length === 0) {
      throw new BadRequestException('taskIds are required')
    }
    if (uniqueTaskIds.length > 200) {
      throw new BadRequestException('Bulk updates are limited to 200 tasks at a time')
    }
    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('patch is required')
    }

    const fieldPatch: Partial<{
      priority: TaskPriority
      status: TaskStatus
      startDate: Date | null
      dueDate: Date | null
      timeEstimate: number | null
      isArchived: boolean
    }> = {}
    if ('priority' in patch) fieldPatch.priority = patch.priority
    if ('status' in patch) fieldPatch.status = patch.status
    if ('startDate' in patch) fieldPatch.startDate = patch.startDate
    if ('dueDate' in patch) fieldPatch.dueDate = patch.dueDate
    if ('timeEstimate' in patch) fieldPatch.timeEstimate = patch.timeEstimate
    if ('isArchived' in patch) fieldPatch.isArchived = patch.isArchived
    const assigneeIdsAdd = [...new Set(patch.assigneeIdsAdd ?? [])].filter(Boolean)
    const assigneeIdsRemove = [...new Set(patch.assigneeIdsRemove ?? [])].filter(Boolean)
    const labelIdsAdd = [...new Set(patch.labelIdsAdd ?? [])].filter(Boolean)
    const labelIdsRemove = [...new Set(patch.labelIdsRemove ?? [])].filter(Boolean)
    const dependenciesAdd = patch.dependenciesAdd ?? []
    const dependenciesRemove = patch.dependenciesRemove ?? []
    const hasRelationshipOps =
      assigneeIdsAdd.length > 0 ||
      assigneeIdsRemove.length > 0 ||
      labelIdsAdd.length > 0 ||
      labelIdsRemove.length > 0 ||
      dependenciesAdd.length > 0 ||
      dependenciesRemove.length > 0
    if (Object.keys(fieldPatch).length === 0 && !hasRelationshipOps) {
      throw new BadRequestException('patch did not include any supported bulk operation')
    }

    const updated = []
    const failed: Array<{ taskId: string; reason: string }> = []
    for (const taskId of uniqueTaskIds) {
      try {
        let next = null
        if (Object.keys(fieldPatch).length > 0) {
          next = await this.updateTask(taskId, actorId, fieldPatch)
        } else {
          await this.assertTaskWriteAccess(taskId, actorId)
        }
        for (const userId of assigneeIdsAdd) {
          await this.addAssignee(taskId, userId, actorId)
        }
        for (const userId of assigneeIdsRemove) {
          await this.removeAssignee(taskId, userId, actorId)
        }
        for (const labelId of labelIdsAdd) {
          await this.addLabel(taskId, labelId, actorId)
        }
        for (const labelId of labelIdsRemove) {
          await this.removeLabel(taskId, labelId, actorId)
        }
        for (const dep of dependenciesAdd) {
          await this.addDependency(taskId, dep.relatedTaskId, dep.type, actorId)
        }
        for (const dep of dependenciesRemove) {
          const [existing] = await this.db
            .select({ id: taskDependencies.id })
            .from(taskDependencies)
            .where(
              and(
                eq(taskDependencies.taskId, taskId),
                eq(taskDependencies.relatedTaskId, dep.relatedTaskId),
                eq(taskDependencies.type, dep.type),
              ),
            )
            .limit(1)
          if (existing) {
            await this.removeDependency(existing.id, actorId)
          }
        }
        if (!next || hasRelationshipOps) {
          next = await this.getTask(taskId)
        }
        updated.push(next)
      } catch (err) {
        failed.push({
          taskId,
          reason: err instanceof Error ? err.message : 'unknown error',
        })
      }
    }

    return {
      requested: uniqueTaskIds.length,
      updatedCount: updated.length,
      failedCount: failed.length,
      updated,
      failed,
    }
  }

  /**
   * Persist (or clear) a task's recurrence config. Once set, completing the
   * task auto-creates the next occurrence (see updateTask). Pass null to stop
   * the task recurring.
   */
  async setRecurrence(
    taskId: string,
    actorId: string,
    config: { cadenceDays?: number | null; rule?: RecurrenceRule | null } | null,
  ) {
    await this.assertTaskWriteAccess(taskId, actorId)
    const task = await this.getTask(taskId)
    if (!task) throw new NotFoundException('Task not found')

    let value: { cadenceDays?: number; rule?: RecurrenceRule } | null = null
    if (config) {
      if (config.rule) {
        if (!['daily', 'weekly', 'monthly'].includes(config.rule.mode)) {
          throw new BadRequestException('Recurrence rule mode must be daily, weekly, or monthly')
        }
        value = { rule: config.rule }
      } else if (config.cadenceDays != null) {
        const n = config.cadenceDays
        if (!Number.isFinite(n) || n <= 0 || n > 365) {
          throw new BadRequestException('cadenceDays must be between 1 and 365')
        }
        value = { cadenceDays: n }
      } else {
        throw new BadRequestException('Provide cadenceDays or rule, or null to clear recurrence')
      }
    }

    const [row] = await this.db
      .update(tasks)
      .set({ recurrence: value, updatedAt: new Date() })
      .where(eq(tasks.id, taskId))
      .returning()
    return row
  }

  async createNextRecurringOccurrence(
    taskId: string,
    actorId: string,
    cadenceDays: number | null,
    recurrenceRule: RecurrenceRule | null = null,
    preserveAssignees = true,
  ) {
    if (!recurrenceRule && (!Number.isFinite(cadenceDays) || (cadenceDays ?? 0) <= 0 || (cadenceDays ?? 0) > 365)) {
      throw new BadRequestException('cadenceDays must be between 1 and 365 when recurrenceRule is not provided')
    }

    await this.assertTaskWriteAccess(taskId, actorId)
    const source = await this.getTask(taskId)
    if (!source) throw new NotFoundException('Task not found')

    const shift = (input: Date | null | undefined) =>
      recurrenceRule
        ? this.shiftByRecurrenceRule(input, recurrenceRule)
        : (() => {
            if (!input || !cadenceDays) return undefined
            const date = new Date(input)
            date.setDate(date.getDate() + cadenceDays)
            return date
          })()

    let assigneeIds: string[] | undefined
    if (preserveAssignees) {
      assigneeIds = (source.assignees ?? []).map((assignee) => assignee.userId)
    }

    const created = await this.createTask({
      listId: source.listId,
      title: source.title,
      description: source.description ?? undefined,
      priority: source.priority,
      // If the source was already closed, fall back to the list's default
      // open status; otherwise preserve. resolveStatusForList runs again
      // inside createTask so the value is validated/normalised.
      status:
        (source.statusCategory as StatusCategory) === 'closed'
          ? undefined
          : source.status,
      startDate: shift(source.startDate),
      dueDate: shift(source.dueDate),
      timeEstimate: source.timeEstimate ?? undefined,
      createdById: actorId,
      assigneeIds,
      parentTaskId: source.parentTaskId ?? undefined,
    })
    if (!created) throw new NotFoundException('Failed to create recurring task')

    await this.logActivity({
      taskId,
      actorId,
      action: 'updated',
      meta: {
        recurringNextTaskId: created.id,
        cadenceDays: cadenceDays ?? null,
        recurrenceRule,
      },
    })

    return {
      sourceTaskId: taskId,
      nextTaskId: created.id,
      cadenceDays: cadenceDays ?? null,
      recurrenceRule,
      task: created,
    }
  }

  async deleteTask(taskId: string, actorId: string) {
    await this.assertTaskWriteAccess(taskId, actorId)
    const [before] = await this.db.select().from(tasks).where(eq(tasks.id, taskId))
    if (!before) throw new NotFoundException('Task not found')
    await this.db.update(tasks).set({ isArchived: true, updatedAt: new Date() }).where(eq(tasks.id, taskId))
    await this.logActivity({ taskId, actorId, action: 'archived' })
    this.realtime.emitToList(before.listId, { type: 'task.deleted', listId: before.listId, taskId })

    // Fire delete event
    const ctx = await this.resolveWorkspaceForList(before.listId)
    if (ctx) {
      void this.fireTaskEvent('task.deleted', ctx.workspaceId, { taskId, listId: before.listId }, {
        taskId,
        userId: actorId,
        projectId: ctx.projectId,
        listId: before.listId,
      })
    }
    // Remove from every connected calendar — fire-and-forget.
    void this.calendarSync.deleteEverywhere(taskId).catch(() => undefined)
    return { ok: true }
  }

  /** Restore an archived (soft-deleted) task (Plan §13.4). */
  async restoreTask(taskId: string, actorId: string) {
    await this.assertTaskWriteAccess(taskId, actorId)
    const [before] = await this.db.select().from(tasks).where(eq(tasks.id, taskId))
    if (!before) throw new NotFoundException('Task not found')
    if (!before.isArchived) return before
    const [row] = await this.db
      .update(tasks)
      .set({ isArchived: false, updatedAt: new Date() })
      .where(eq(tasks.id, taskId))
      .returning()
    await this.logActivity({ taskId, actorId, action: 'restored' })
    this.realtime.emitToList(before.listId, {
      type: 'task.updated',
      listId: before.listId,
      taskId,
      patch: { isArchived: false },
    })
    return row
  }

  async moveTask(taskId: string, actorId: string, targetListId: string, position: number) {
    await this.assertTaskWriteAccess(taskId, actorId)
    const [before] = await this.db.select().from(tasks).where(eq(tasks.id, taskId))
    if (!before) throw new NotFoundException('Task not found')
    await this.db
      .update(tasks)
      .set({ listId: targetListId, position, updatedAt: new Date() })
      .where(eq(tasks.id, taskId))
    await this.logActivity({
      taskId,
      actorId,
      action: 'moved',
      meta: { fromListId: before.listId, toListId: targetListId, position },
    })
    this.realtime.emitToList(before.listId,  { type: 'task.moved', listId: before.listId,  taskId, toListId: targetListId })
    this.realtime.emitToList(targetListId,   { type: 'task.moved', listId: targetListId,   taskId, toListId: targetListId })
    return this.getTask(taskId)
  }

  // --- Assignees -----------------------------------------------------------
  async addAssignee(taskId: string, userId: string, actorId: string) {
    await this.assertTaskWriteAccess(taskId, actorId)
    await this.db.insert(taskAssignees).values({ taskId, userId }).onConflictDoNothing()
    await this.db.insert(taskWatchers).values({ taskId, userId }).onConflictDoNothing()
    await this.logActivity({ taskId, actorId, action: 'assigned', meta: { userId } })

    const [taskRow] = await this.db.select().from(tasks).where(eq(tasks.id, taskId))
    if (taskRow) {
      const ctx = await this.resolveWorkspaceForList(taskRow.listId)
      if (ctx) {
        void this.fireTaskEvent('task.assigned', ctx.workspaceId, { taskId, assigneeId: userId }, {
          taskId,
          userId: actorId,
          projectId: ctx.projectId,
          listId: taskRow.listId,
          newValue: userId,
        })
        // The automations UI exposes this as the "Task assignee changes" trigger.
        // Fire it directly (not via fireTaskEvent) to avoid a duplicate webhook.
        void this.automations
          .fire('task.assignee_changed', {
            workspaceId: ctx.workspaceId,
            taskId,
            userId: actorId,
            projectId: ctx.projectId,
            listId: taskRow.listId,
            newValue: userId,
          })
          .catch(() => {})

        // Don't notify someone they assigned themselves
        if (userId !== actorId) {
          const workspaceName = await this.resolveWorkspaceName(ctx.workspaceId)
          void this.notifications.create({
            userId,
            workspaceId: ctx.workspaceId,
            actorId,
            type: 'task_assigned',
            title: `You were assigned "${taskRow.title}"`,
            target: { entityType: 'task', entityId: taskId, url: this.buildTaskUrl(ctx.workspaceId, ctx.spaceId, ctx.projectId, taskRow.listId, taskId) },
            emailContext: { taskTitle: taskRow.title, workspaceName },
          })
        }
      }
    }

    return this.getTask(taskId)
  }

  async removeAssignee(taskId: string, userId: string, actorId: string) {
    await this.assertTaskWriteAccess(taskId, actorId)
    await this.db.delete(taskAssignees).where(and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.userId, userId)))
    await this.logActivity({ taskId, actorId, action: 'unassigned', meta: { userId } })
    return this.getTask(taskId)
  }

  // --- Labels --------------------------------------------------------------
  async addLabel(taskId: string, labelId: string, actorId: string) {
    await this.assertTaskWriteAccess(taskId, actorId)
    await this.db.insert(taskLabelAssignments).values({ taskId, labelId }).onConflictDoNothing()
    await this.logActivity({ taskId, actorId, action: 'label_added', meta: { labelId } })
    return this.getTask(taskId)
  }

  async removeLabel(taskId: string, labelId: string, actorId: string) {
    await this.assertTaskWriteAccess(taskId, actorId)
    await this.db
      .delete(taskLabelAssignments)
      .where(and(eq(taskLabelAssignments.taskId, taskId), eq(taskLabelAssignments.labelId, labelId)))
    await this.logActivity({ taskId, actorId, action: 'label_removed', meta: { labelId } })
    return this.getTask(taskId)
  }

  // --- Watchers ------------------------------------------------------------
  async addWatcher(taskId: string, userId: string) {
    await this.db.insert(taskWatchers).values({ taskId, userId }).onConflictDoNothing()
    this.realtime.emitToTask(taskId, { type: 'watchers.updated', taskId })
    return this.getTask(taskId)
  }

  async removeWatcher(taskId: string, userId: string) {
    await this.db.delete(taskWatchers).where(and(eq(taskWatchers.taskId, taskId), eq(taskWatchers.userId, userId)))
    this.realtime.emitToTask(taskId, { type: 'watchers.updated', taskId })
    return this.getTask(taskId)
  }

  // --- Comments ------------------------------------------------------------
  async listComments(taskId: string) {
    const rows = await this.db.query.taskComments.findMany({
      where: eq(taskComments.taskId, taskId),
      orderBy: asc(taskComments.createdAt),
      with: { author: true, reactions: true, assignee: true, resolver: true },
    })
    // Hydrate per-comment attachments (Plan §4). Kept as a separate query to
    // avoid a schema import cycle between comments and attachments.
    const commentIds = rows.map((r: { id: string }) => r.id)
    if (commentIds.length === 0) return rows
    const files = await this.db
      .select()
      .from(taskAttachments)
      .where(and(eq(taskAttachments.taskId, taskId), inArray(taskAttachments.commentId, commentIds)))
    const byComment = new Map<string, Array<Record<string, unknown>>>()
    for (const f of files) {
      const list = byComment.get(f.commentId as string) ?? []
      list.push({
        id: f.id,
        fileName: f.fileName,
        fileSize: f.sizeBytes,
        mimeType: f.contentType,
        url: this.r2.configured ? await this.r2.getObjectUrl(f.storageKey) : f.storageKey,
      })
      byComment.set(f.commentId as string, list)
    }
    return rows.map((r: { id: string }) => ({ ...r, attachments: byComment.get(r.id) ?? [] }))
  }

  async createComment(taskId: string, authorId: string, body: string, parentCommentId?: string, mentions?: Array<{ userId: string; offset: number; length: number }>, attachmentIds?: string[]) {
    if (!body.trim()) throw new BadRequestException('Comment body cannot be empty')
    const extracted = this.extractMentionIds(body).map((userId) => ({ userId, offset: 0, length: 0 }))
    const finalMentions = mentions && mentions.length > 0 ? mentions : extracted
    const [comment] = await this.db
      .insert(taskComments)
      .values({ taskId, authorId, body, parentCommentId, mentions: finalMentions.length > 0 ? finalMentions : null })
      .returning()
    // Link any pre-uploaded attachments to this comment. Only rows belonging to
    // the same task are linked, so a caller can't attach files from elsewhere.
    if (attachmentIds && attachmentIds.length > 0) {
      await this.db
        .update(taskAttachments)
        .set({ commentId: comment.id })
        .where(and(eq(taskAttachments.taskId, taskId), inArray(taskAttachments.id, attachmentIds)))
    }
    // Auto-subscribe the author as a watcher
    await this.db.insert(taskWatchers).values({ taskId, userId: authorId }).onConflictDoNothing()

    await this.logActivity({ taskId, actorId: authorId, action: 'commented', meta: { commentId: comment.id } })
    const hydrated = await this.db.query.taskComments.findFirst({
      where: eq(taskComments.id, comment.id),
      with: { author: true, reactions: true, assignee: true, resolver: true },
    })
    this.realtime.emitToTask(taskId, { type: 'comment.created', taskId, comment: hydrated })

    // Fire comment + mention notifications (best-effort)
    void this.notifyComment(taskId, authorId, body, finalMentions)

    // Fire the "Comment is added to task" automation trigger (best-effort).
    void (async () => {
      try {
        const [taskRow] = await this.db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
        if (!taskRow) return
        const ctx = await this.resolveWorkspaceForList(taskRow.listId)
        if (!ctx) return
        await this.automations.fire('task.comment_added', {
          workspaceId: ctx.workspaceId,
          taskId,
          userId: authorId,
          projectId: ctx.projectId,
          listId: taskRow.listId,
        })
      } catch {
        /* best-effort */
      }
    })()

    return hydrated
  }

  private async notifyComment(
    taskId: string,
    authorId: string,
    body: string,
    mentions: Array<{ userId: string }>,
  ) {
    try {
      const [taskRow] = await this.db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
      if (!taskRow) return

      const ctx = await this.resolveWorkspaceForList(taskRow.listId)
      if (!ctx) return

      const workspaceName = await this.resolveWorkspaceName(ctx.workspaceId)
      const taskUrl = this.buildTaskUrl(ctx.workspaceId, ctx.spaceId, ctx.projectId, taskRow.listId, taskId)
      // Trim to 200 chars for the email snippet
      const commentSnippet = body.replace(/<[^>]+>/g, '').slice(0, 200)

      // Notify watchers (excluding the commenter)
      const watcherRows = await this.db
        .select({ userId: taskWatchers.userId })
        .from(taskWatchers)
        .where(eq(taskWatchers.taskId, taskId))

      const mentionedIds = new Set(mentions.map((m) => m.userId))

      for (const { userId } of watcherRows) {
        if (userId === authorId) continue

        if (mentionedIds.has(userId)) {
          // Mentioned → higher-priority mention notification
          void this.notifications.create({
            userId,
            workspaceId: ctx.workspaceId,
            actorId: authorId,
            type: 'task_mentioned',
            title: `You were mentioned in "${taskRow.title}"`,
            target: { entityType: 'task', entityId: taskId, url: taskUrl },
            emailContext: { taskTitle: taskRow.title, workspaceName },
          })
        } else {
          void this.notifications.create({
            userId,
            workspaceId: ctx.workspaceId,
            actorId: authorId,
            type: 'task_commented',
            title: `New comment on "${taskRow.title}"`,
            target: { entityType: 'task', entityId: taskId, url: taskUrl },
            emailContext: { taskTitle: taskRow.title, workspaceName, commentSnippet },
          })
        }
      }

      // Also notify non-watcher mentioned users (they may not be watching yet)
      for (const { userId } of mentions) {
        if (userId === authorId) continue
        const alreadyNotified = watcherRows.some((w) => w.userId === userId)
        if (!alreadyNotified) {
          void this.notifications.create({
            userId,
            workspaceId: ctx.workspaceId,
            actorId: authorId,
            type: 'task_mentioned',
            title: `You were mentioned in "${taskRow.title}"`,
            target: { entityType: 'task', entityId: taskId, url: taskUrl },
            emailContext: { taskTitle: taskRow.title, workspaceName },
          })
        }
      }
    } catch {
      // Best-effort — swallow errors
    }
  }

  async updateComment(commentId: string, authorId: string, body: string) {
    const [existing] = await this.db.select().from(taskComments).where(eq(taskComments.id, commentId))
    if (!existing) throw new NotFoundException('Comment not found')
    if (existing.authorId !== authorId) throw new BadRequestException('Cannot edit another user\'s comment')
    const [updated] = await this.db
      .update(taskComments)
      .set({ body, editedAt: new Date() })
      .where(eq(taskComments.id, commentId))
      .returning()
    this.realtime.emitToTask(existing.taskId, {
      type: 'comment.updated',
      taskId: existing.taskId,
      commentId,
      patch: { body, editedAt: updated.editedAt },
    })
    return updated
  }

  async assignComment(commentId: string, actorId: string, userId: string | null) {
    const [existing] = await this.db.select().from(taskComments).where(eq(taskComments.id, commentId))
    if (!existing) throw new NotFoundException('Comment not found')

    const [taskRow] = await this.db.select().from(tasks).where(eq(tasks.id, existing.taskId)).limit(1)
    if (!taskRow) throw new NotFoundException('Task not found')
    await this.assertTaskWriteAccess(taskRow.id, actorId)

    const [updated] = await this.db
      .update(taskComments)
      .set({ assignedToUserId: userId, editedAt: new Date() })
      .where(eq(taskComments.id, commentId))
      .returning()
    this.realtime.emitToTask(existing.taskId, {
      type: 'comment.updated',
      taskId: existing.taskId,
      commentId,
      patch: { assignedToUserId: updated.assignedToUserId, editedAt: updated.editedAt },
    })

    if (userId && userId !== actorId) {
      const ctx = await this.resolveWorkspaceForList(taskRow.listId)
      if (ctx) {
        const workspaceName = await this.resolveWorkspaceName(ctx.workspaceId)
        void this.notifications.create({
          userId,
          workspaceId: ctx.workspaceId,
          actorId,
          type: 'task_assigned',
          title: `You were assigned a comment in "${taskRow.title}"`,
          target: {
            entityType: 'task',
            entityId: taskRow.id,
            url: this.buildTaskUrl(ctx.workspaceId, ctx.spaceId, ctx.projectId, taskRow.listId, taskRow.id),
          },
          emailContext: { taskTitle: taskRow.title, workspaceName },
        })
      }
    }

    return updated
  }

  async resolveComment(commentId: string, actorId: string, resolved: boolean) {
    const [existing] = await this.db.select().from(taskComments).where(eq(taskComments.id, commentId))
    if (!existing) throw new NotFoundException('Comment not found')

    const [taskRow] = await this.db.select().from(tasks).where(eq(tasks.id, existing.taskId)).limit(1)
    if (!taskRow) throw new NotFoundException('Task not found')
    await this.assertTaskWriteAccess(taskRow.id, actorId)

    const [updated] = await this.db
      .update(taskComments)
      .set({
        resolvedAt: resolved ? new Date() : null,
        resolvedByUserId: resolved ? actorId : null,
        editedAt: new Date(),
      })
      .where(eq(taskComments.id, commentId))
      .returning()

    this.realtime.emitToTask(existing.taskId, {
      type: 'comment.updated',
      taskId: existing.taskId,
      commentId,
      patch: {
        resolvedAt: updated.resolvedAt,
        resolvedByUserId: updated.resolvedByUserId,
        editedAt: updated.editedAt,
      },
    })

    if (resolved) {
      void this.notifyCommentResolved(taskRow, existing, actorId)
    }

    return updated
  }

  private async notifyCommentResolved(
    taskRow: { id: string; title: string; listId: string },
    comment: { id: string; authorId: string; body: string; assignedToUserId?: string | null },
    actorId: string,
  ) {
    try {
      const ctx = await this.resolveWorkspaceForList(taskRow.listId)
      if (!ctx) return

      const workspaceName = await this.resolveWorkspaceName(ctx.workspaceId)
      const taskUrl = this.buildTaskUrl(
        ctx.workspaceId,
        ctx.spaceId,
        ctx.projectId,
        taskRow.listId,
        taskRow.id,
      )
      const snippet = comment.body.replace(/<[^>]+>/g, '').slice(0, 200)
      const recipientIds = new Set<string>()
      if (comment.authorId && comment.authorId !== actorId) recipientIds.add(comment.authorId)
      if (comment.assignedToUserId && comment.assignedToUserId !== actorId) {
        recipientIds.add(comment.assignedToUserId)
      }

      for (const userId of recipientIds) {
        void this.notifications.create({
          userId,
          workspaceId: ctx.workspaceId,
          actorId,
          type: 'task_commented',
          title: `Your comment was resolved on "${taskRow.title}"`,
          body: snippet,
          target: { entityType: 'task', entityId: taskRow.id, url: taskUrl },
          emailContext: {
            taskTitle: taskRow.title,
            workspaceName,
            commentSnippet: snippet,
            commentVariant: 'resolved',
          },
        })
      }
    } catch {
      // Best-effort — never block resolve
    }
  }

  async deleteComment(commentId: string, actorId: string) {
    const [existing] = await this.db.select().from(taskComments).where(eq(taskComments.id, commentId))
    if (!existing) throw new NotFoundException('Comment not found')
    // The author can always delete their own comment; workspace admins/managers
    // may delete anyone's (Plan §4 — moderation).
    if (existing.authorId !== actorId && !(await this.isTaskWorkspaceModerator(existing.taskId, actorId))) {
      throw new ForbiddenException("Only the author or a workspace admin can delete this comment")
    }
    await this.db.delete(taskComments).where(eq(taskComments.id, commentId))
    this.realtime.emitToTask(existing.taskId, { type: 'comment.deleted', taskId: existing.taskId, commentId })
    return { ok: true }
  }

  /** True if the actor is a workspace_admin / manager / super_admin over the task's workspace. */
  private async isTaskWorkspaceModerator(taskId: string, actorId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ role: workspaceMembers.role })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .innerJoin(
        workspaceMembers,
        and(eq(workspaceMembers.workspaceId, spaces.workspaceId), eq(workspaceMembers.userId, actorId)),
      )
      .where(eq(tasks.id, taskId))
      .limit(1)
    return row?.role === 'workspace_admin' || row?.role === 'manager' || row?.role === 'super_admin'
  }

  async toggleReaction(commentId: string, userId: string, emoji: string) {
    const [existing] = await this.db
      .select()
      .from(taskCommentReactions)
      .where(and(
        eq(taskCommentReactions.commentId, commentId),
        eq(taskCommentReactions.userId, userId),
        eq(taskCommentReactions.emoji, emoji),
      ))
    if (existing) {
      await this.db.delete(taskCommentReactions).where(eq(taskCommentReactions.id, existing.id))
      return { removed: true }
    }
    const [created] = await this.db
      .insert(taskCommentReactions)
      .values({ commentId, userId, emoji })
      .returning()
    return { added: true, reaction: created }
  }

  // --- Checklists ----------------------------------------------------------
  async createChecklist(taskId: string, title: string, actorId: string) {
    const [existing] = await this.db
      .select({ maxPos: sql<number>`coalesce(max(${taskChecklists.position}), -1)` })
      .from(taskChecklists)
      .where(eq(taskChecklists.taskId, taskId))
    const [checklist] = await this.db
      .insert(taskChecklists)
      .values({ taskId, title, position: (existing?.maxPos ?? -1) + 1 })
      .returning()
    await this.logActivity({ taskId, actorId, action: 'updated', meta: { fields: ['checklists'] } })
    this.realtime.emitToTask(taskId, { type: 'checklist.updated', taskId })
    return { ...checklist, items: [] }
  }

  async updateChecklist(checklistId: string, patch: { title?: string; position?: number }) {
    const [updated] = await this.db
      .update(taskChecklists)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(taskChecklists.id, checklistId))
      .returning()
    if (!updated) throw new NotFoundException('Checklist not found')
    this.realtime.emitToTask(updated.taskId, { type: 'checklist.updated', taskId: updated.taskId })
    return updated
  }

  async deleteChecklist(checklistId: string) {
    const [existing] = await this.db.select().from(taskChecklists).where(eq(taskChecklists.id, checklistId))
    if (!existing) throw new NotFoundException('Checklist not found')
    await this.db.delete(taskChecklists).where(eq(taskChecklists.id, checklistId))
    this.realtime.emitToTask(existing.taskId, { type: 'checklist.updated', taskId: existing.taskId })
    return { ok: true }
  }

  async addChecklistItem(checklistId: string, content: string, assigneeId?: string | null, dueDate?: Date | null) {
    const [parent] = await this.db.select().from(taskChecklists).where(eq(taskChecklists.id, checklistId))
    if (!parent) throw new NotFoundException('Checklist not found')
    const [existing] = await this.db
      .select({ maxPos: sql<number>`coalesce(max(${taskChecklistItems.position}), -1)` })
      .from(taskChecklistItems)
      .where(eq(taskChecklistItems.checklistId, checklistId))
    const [item] = await this.db
      .insert(taskChecklistItems)
      .values({
        checklistId,
        content,
        assigneeId: assigneeId ?? null,
        dueDate: dueDate ?? null,
        position: (existing?.maxPos ?? -1) + 1,
      })
      .returning()
    this.realtime.emitToTask(parent.taskId, { type: 'checklist.updated', taskId: parent.taskId })
    return item
  }

  async updateChecklistItem(
    itemId: string,
    actorId: string,
    patch: { content?: string; isDone?: boolean; position?: number; dueDate?: Date | null; assigneeId?: string | null },
  ) {
    const [existing] = await this.db.select().from(taskChecklistItems).where(eq(taskChecklistItems.id, itemId))
    if (!existing) throw new NotFoundException('Checklist item not found')

    const set: Record<string, unknown> = { ...patch, updatedAt: new Date() }
    if (patch.isDone === true && !existing.isDone) set.completedAt = new Date()
    if (patch.isDone === false && existing.isDone) set.completedAt = null

    const [updated] = await this.db
      .update(taskChecklistItems)
      .set(set)
      .where(eq(taskChecklistItems.id, itemId))
      .returning()

    const [parent] = await this.db.select().from(taskChecklists).where(eq(taskChecklists.id, existing.checklistId))
    if (parent) {
      if (typeof patch.isDone === 'boolean' && patch.isDone !== existing.isDone) {
        await this.logActivity({
          taskId: parent.taskId,
          actorId,
          action: 'checklist_item_toggled',
          meta: { itemId, content: updated.content, isDone: updated.isDone },
        })
      }
      this.realtime.emitToTask(parent.taskId, { type: 'checklist.updated', taskId: parent.taskId })
    }
    return updated
  }

  async deleteChecklistItem(itemId: string) {
    const [existing] = await this.db.select().from(taskChecklistItems).where(eq(taskChecklistItems.id, itemId))
    if (!existing) throw new NotFoundException('Checklist item not found')
    await this.db.delete(taskChecklistItems).where(eq(taskChecklistItems.id, itemId))
    const [parent] = await this.db.select().from(taskChecklists).where(eq(taskChecklists.id, existing.checklistId))
    if (parent) this.realtime.emitToTask(parent.taskId, { type: 'checklist.updated', taskId: parent.taskId })
    return { ok: true }
  }

  // --- Dependencies --------------------------------------------------------
  async getDependencyGraph(taskId: string, depth = 2) {
    const normalizedDepth = Math.min(Math.max(Math.floor(depth || 1), 1), 6)
    const visited = new Set<string>([taskId])
    const edges = new Map<string, { taskId: string; relatedTaskId: string; type: DependencyType }>()
    let frontier = [taskId]

    for (let i = 0; i < normalizedDepth && frontier.length > 0; i++) {
      const outgoing = await this.db
        .select({ taskId: taskDependencies.taskId, relatedTaskId: taskDependencies.relatedTaskId, type: taskDependencies.type })
        .from(taskDependencies)
        .where(inArray(taskDependencies.taskId, frontier))
      const incoming = await this.db
        .select({ taskId: taskDependencies.taskId, relatedTaskId: taskDependencies.relatedTaskId, type: taskDependencies.type })
        .from(taskDependencies)
        .where(inArray(taskDependencies.relatedTaskId, frontier))
      const combined = [...outgoing, ...incoming]
      const nextFrontier: string[] = []
      for (const edge of combined) {
        edges.set(`${edge.taskId}:${edge.relatedTaskId}:${edge.type}`, edge)
        if (!visited.has(edge.taskId)) {
          visited.add(edge.taskId)
          nextFrontier.push(edge.taskId)
        }
        if (!visited.has(edge.relatedTaskId)) {
          visited.add(edge.relatedTaskId)
          nextFrontier.push(edge.relatedTaskId)
        }
      }
      frontier = nextFrontier
    }

    const nodeIds = [...visited]
    const rows = await this.db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        isArchived: tasks.isArchived,
      })
      .from(tasks)
      .where(inArray(tasks.id, nodeIds))

    const byId = new Map(rows.map((r) => [r.id, r]))
    const isOpen = (id: string) => {
      const node = byId.get(id)
      if (!node) return false
      return !node.isArchived && node.status !== 'done' && node.status !== 'cancelled'
    }

    const blocksAdj = new Map<string, string[]>() // blocker -> blocked
    const blockedByAdj = new Map<string, string[]>() // blocked -> blocker
    for (const edge of edges.values()) {
      const pair =
        edge.type === 'blocks'
          ? { blocker: edge.taskId, blocked: edge.relatedTaskId }
          : edge.type === 'blocked_by'
          ? { blocker: edge.relatedTaskId, blocked: edge.taskId }
          : null
      if (!pair) continue
      blocksAdj.set(pair.blocker, [...(blocksAdj.get(pair.blocker) ?? []), pair.blocked])
      blockedByAdj.set(pair.blocked, [...(blockedByAdj.get(pair.blocked) ?? []), pair.blocker])
    }

    const rootBlockedByOpen = (blockedByAdj.get(taskId) ?? []).filter(isOpen).length
    const rootBlocksOpen = (blocksAdj.get(taskId) ?? []).filter(isOpen).length
    const dfsDepth = (startId: string, adj: Map<string, string[]>, seen: Set<string>): number => {
      if (seen.has(startId)) return 0
      seen.add(startId)
      let best = 0
      for (const nextId of adj.get(startId) ?? []) {
        if (!isOpen(nextId)) continue
        best = Math.max(best, 1 + dfsDepth(nextId, adj, new Set(seen)))
      }
      return best
    }

    return {
      rootTaskId: taskId,
      depth: normalizedDepth,
      metrics: {
        nodeCount: rows.length,
        edgeCount: edges.size,
        blockedByOpenCount: rootBlockedByOpen,
        blocksOpenCount: rootBlocksOpen,
        longestBlockedByChainDepth: dfsDepth(taskId, blockedByAdj, new Set<string>()),
        longestBlocksChainDepth: dfsDepth(taskId, blocksAdj, new Set<string>()),
      },
      nodes: rows,
      edges: [...edges.values()],
    }
  }

  async addDependency(taskId: string, relatedTaskId: string, type: DependencyType, actorId: string) {
    if (taskId === relatedTaskId) throw new BadRequestException('A task cannot depend on itself')
    if (type === 'blocks' || type === 'blocked_by') {
      const blocker = type === 'blocks' ? taskId : relatedTaskId
      const blocked = type === 'blocks' ? relatedTaskId : taskId
      const cycle = await this.hasBlockingPath(blocked, blocker)
      if (cycle) throw new BadRequestException('Dependency would create a blocking cycle')
    }
    const [created] = await this.db
      .insert(taskDependencies)
      .values({ taskId, relatedTaskId, type, createdById: actorId })
      .onConflictDoNothing()
      .returning()
    await this.logActivity({ taskId, actorId, action: 'dependency_added', meta: { relatedTaskId, type } })
    return created
  }

  async removeDependency(depId: string, actorId: string) {
    const [existing] = await this.db.select().from(taskDependencies).where(eq(taskDependencies.id, depId))
    if (!existing) throw new NotFoundException('Dependency not found')
    await this.db.delete(taskDependencies).where(eq(taskDependencies.id, depId))
    await this.logActivity({
      taskId: existing.taskId,
      actorId,
      action: 'dependency_removed',
      meta: { relatedTaskId: existing.relatedTaskId, type: existing.type },
    })
    return { ok: true }
  }

  // --- Activity ------------------------------------------------------------
  async listActivity(taskId: string, limit = 100) {
    return this.db.query.taskActivity.findMany({
      where: eq(taskActivity.taskId, taskId),
      orderBy: desc(taskActivity.createdAt),
      limit,
      with: { actor: true },
    })
  }

  /** Aggregated activity across every task in a project (Plan §4 timeline). */
  async listProjectActivity(projectId: string, limit = 100) {
    const rows = await this.db
      .select({
        id: taskActivity.id,
        action: taskActivity.action,
        meta: taskActivity.meta,
        createdAt: taskActivity.createdAt,
        taskId: taskActivity.taskId,
        taskTitle: tasks.title,
        actorId: users.id,
        actorName: users.displayName,
        actorEmail: users.email,
      })
      .from(taskActivity)
      .innerJoin(tasks, eq(tasks.id, taskActivity.taskId))
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .leftJoin(users, eq(users.id, taskActivity.actorId))
      .where(eq(lists.projectId, projectId))
      .orderBy(desc(taskActivity.createdAt))
      .limit(limit)
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      meta: r.meta,
      createdAt: r.createdAt,
      taskId: r.taskId,
      taskTitle: r.taskTitle,
      actor: r.actorId ? { id: r.actorId, displayName: r.actorName, email: r.actorEmail } : null,
    }))
  }

  // --- Time entries --------------------------------------------------------
  async startTimer(taskId: string, userId: string, description?: string) {
    // If there's an already-running timer for this user, stop it first.
    const [running] = await this.db
      .select()
      .from(timeEntries)
      .where(and(eq(timeEntries.userId, userId), isNull(timeEntries.endedAt)))
    if (running) {
      await this.stopTimer(running.id, userId)
    }
    const [entry] = await this.db
      .insert(timeEntries)
      .values({ taskId, userId, startedAt: new Date(), description })
      .returning()
    return entry
  }

  async stopTimer(entryId: string, userId: string) {
    const [existing] = await this.db.select().from(timeEntries).where(eq(timeEntries.id, entryId))
    if (!existing) throw new NotFoundException('Time entry not found')
    if (existing.userId !== userId) throw new BadRequestException('Cannot stop another user\'s timer')
    if (existing.endedAt) return existing
    const endedAt = new Date()
    const durationSec = Math.max(0, Math.floor((endedAt.getTime() - new Date(existing.startedAt).getTime()) / 1000))
    const [updated] = await this.db
      .update(timeEntries)
      .set({ endedAt, durationSec, updatedAt: new Date() })
      .where(eq(timeEntries.id, entryId))
      .returning()
    return updated
  }

  async addManualTimeEntry(data: {
    taskId: string
    userId: string
    startedAt: Date
    endedAt: Date
    description?: string
    isBillable?: boolean
  }) {
    const durationSec = Math.max(0, Math.floor((data.endedAt.getTime() - data.startedAt.getTime()) / 1000))
    const [entry] = await this.db
      .insert(timeEntries)
      .values({ ...data, durationSec })
      .returning()
    return entry
  }

  async listTimeEntries(taskId: string) {
    return this.db.query.timeEntries.findMany({
      where: eq(timeEntries.taskId, taskId),
      orderBy: desc(timeEntries.startedAt),
      with: { user: true },
    })
  }

  async getActiveTimer(userId: string) {
    const [active] = await this.db
      .select({
        id: timeEntries.id,
        taskId: timeEntries.taskId,
        userId: timeEntries.userId,
        description: timeEntries.description,
        startedAt: timeEntries.startedAt,
        isBillable: timeEntries.isBillable,
        taskTitle: tasks.title,
        workspaceId: spaces.workspaceId,
        spaceId: spaces.id,
        projectId: projects.id,
        listId: lists.id,
      })
      .from(timeEntries)
      .innerJoin(tasks, eq(tasks.id, timeEntries.taskId))
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(eq(timeEntries.userId, userId), isNull(timeEntries.endedAt)))
      .orderBy(desc(timeEntries.startedAt))
      .limit(1)
    return active ?? null
  }

  // --- Helpers for front end / search --------------------------------------
  async resolveTaskContext(taskId: string) {
    const row = await this.db
      .select({
        task: tasks,
        list: lists,
        project: projects,
        space: spaces,
      })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(tasks.id, taskId))
    return row[0] ?? null
  }

  async getTaskNavigation(taskId: string) {
    const ctx = await this.resolveTaskContext(taskId)
    if (!ctx) throw new NotFoundException('Task not found')
    return {
      workspaceId: ctx.space.workspaceId,
      spaceId: ctx.space.id,
      projectId: ctx.project.id,
      listId: ctx.list.id,
      taskId: ctx.task.id,
      url: this.buildTaskUrl(
        ctx.space.workspaceId,
        ctx.space.id,
        ctx.project.id,
        ctx.list.id,
        ctx.task.id,
      ),
    }
  }
}

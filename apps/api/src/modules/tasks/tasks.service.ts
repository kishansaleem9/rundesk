import { Injectable, Inject, Optional, NotFoundException, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { eq, and, or, asc, desc, ilike, inArray, isNull, notInArray, sql, type SQL } from 'drizzle-orm'
import {
  taskTypes,
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
  taskDescriptionRevisions,
  taskTimeBlocks,
  reminders,
  sprintTasks,
  customFieldValues,
  taskCommentReactions,
  taskCommentSaves,
  taskAttachments,
  timeEntries,
  taskDocLinks,
  taskExternalLinks,
  workspaceIntegrationConnections,
  docs,
  users,
  lists,
  projects,
  spaces,
  spaceMembers,
  projectMembers,
  workspaces,
  workspaceMembers,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
// One source of truth for "how long the bin keeps things". The task delete
// below reports it to the caller so the confirmation can say thirty days
// without a second copy of the number drifting away from the purge job's.
import { TRASH_RETENTION_DAYS } from '../trash/trash.service'
import { toCsv } from '../../common/export/csv'
import { toXlsx } from '../../common/export/xlsx'
import {
  asDateFormat,
  asTimeFormat,
  formatDate,
  type DateFormat,
  type TimeFormat,
} from '../../common/export/datetime'

/** `[10:57]` "CSV chahiye, Excel chahiye" — frame `10:58` shows exactly these two. */
export type ExportFormat = 'csv' | 'xlsx'
import {
  parseExternalLinkUrl,
  isHttpUrl,
  type ExternalLinkKind,
  type ExternalLinkProvider,
  type ExternalLinkRef,
} from './external-links.util'
import { describeAttachments } from './comment-summary'
import { canReachTask } from './mention-access'
import {
  MERGE_REFUSAL_MESSAGE,
  emptyMergeTally,
  mergeRefusal,
  mergedDescription,
} from './task-merge'
import { resolveEffectiveStatuses } from '../../common/statuses/status-resolution'
import {
  resolveIsManager,
  taskVisibilityFilter,
  canSeePrivateItem,
  isManagerRole,
} from '../../common/permissions/item-visibility'
import { PUBLIC_USER_COLUMNS, PUBLIC_USER_WITH } from '../../common/permissions/public-user'
import { canReadDoc, hiddenDocIds } from '../../common/permissions/doc-access'
import { readableTask, readableTaskIds } from '../../common/permissions/read-access'
import { listVisibilityFilter } from '../../common/permissions/item-visibility'
import { safeFetch } from '../../common/http/safe-fetch'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { SearchService } from '../search/search.service'
import { AutomationsService } from '../automations/automations.service'
import { WebhooksService } from '../webhooks/webhooks.service'
import { SlackService } from '../integrations/slack/slack.service'
import { NotificationsService } from '../notifications/notifications.service'
import { R2Service } from '../../common/storage/r2.service'
import { safeFileName } from '../../common/storage/file-name'
import { CalendarSyncService } from '../calendar-sync/calendar-sync.service'
import { SecurityService } from '../security/security.service'
import { assertCanCreateInSpace } from '../../common/permissions/container-access'
import { assertSpaceLevel, resolveSpaceLevel, spaceLevelReaches } from '../../common/permissions/space-default-permission'
import { assertTaskNotInBin, assertTaskWritable, taskCommentAllowed } from '../../common/permissions/task-write'
import { assertCanCreateTaskIn, canCreateTaskIn } from '../../common/permissions/task-create'
import { assertMayShapeStatuses } from '../../common/permissions/status-access'
import { assertMayDefineFields } from '../../common/permissions/field-access'
import { checkContainerAccess, containerRefusal, containerVisibilityFilter, taskInReachFilter } from '../../common/permissions/container-access.guard-helper'
import { attachmentKind, isLinkAttachmentKey, isTaskOwnObjectKey, isTaskUploadKey } from './task-object-keys'
import { isWorkspaceClipKey } from '../clips/clip-keys'
import { pickUpdatable } from './task-update-fields'
import { CustomFieldsService } from '../custom-fields/custom-fields.service'
import { guestMayRead } from '../../common/permissions/guest-reach'

type TaskPriority = 'urgent' | 'high' | 'normal' | 'low'
// Custom statuses per List replaced the fixed enum, so we accept any string
// key. The service validates the key against `list_statuses` for the task's
// list and looks up the canonical `category` (open/in_progress/closed) to
// drive completion semantics, blocker checks, and reports.
type TaskStatus = string
type StatusCategory = 'open' | 'in_progress' | 'closed'

/**
 * §A2.8 — render a status/priority key for a notification body. Status keys are
 * per-list slugs (`in_review`), so there is no catalogue to look them up in;
 * de-slugging is what the rest of the product does with them too.
 */
export function humanizeFieldValue(value: string): string {
  const spaced = value.replace(/[_-]+/g, ' ').trim()
  if (!spaced) return value
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

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
  // §V2-S03 frame `02:47` — the feed reads "You added item task required to
  // checklist Checklist". Ticking an item was logged; adding one was not, so
  // a checklist could grow by ten lines and the activity feed stayed silent.
  | 'checklist_item_added'
  | 'attachment_added'
  | 'attachment_removed'
  | 'subtask_added'
  | 'moved'
  // §V2-08 — merging. Two entries, not one: the survivor's log has to say what
  // arrived, and the binned task's has to say where its work went, or a person
  // who opens the old task sees it archived with no explanation.
  | 'merged_in'
  | 'merged_away'

type DependencyType = 'blocks' | 'blocked_by' | 'related_to'

/** Hard cap on a single task/comment attachment (Plan §4). */
export const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024 // 100 MB

/**
 * How many of a member's open tasks one read returns (`getTasksForMember`).
 * Home asks for one more than it shows, so it knows when the list was cut and
 * can say "500+" rather than a confident 500.
 */
export const MEMBER_TASKS_DEFAULT_LIMIT = 500
export const MEMBER_TASKS_MAX_LIMIT = 1000

/**
 * §V2-08 — how long consecutive edits by one person collapse into one entry of
 * description history.
 *
 * Two minutes, matching `doc_revisions`. Somebody fixing a typo, then a second
 * typo, then reordering a sentence is doing one thing, and a history that
 * records it as three is a history nobody scrolls. Longer than this and two
 * genuinely separate visits to the same task get merged, which loses the
 * intermediate text for real.
 */
const DESCRIPTION_REVISION_WINDOW_MS = 2 * 60 * 1000

/**
 * What category a status key means, when the list cannot tell us.
 *
 * Written once because it was needed in two places that had drifted apart:
 * the branch that resolves a renamed status on a populated list inferred the
 * category from the key, and the branch for a list with NO statuses returned
 * `'open'` unconditionally. So the same word, `done`, meant closed on one list
 * and open on another — and the second was the one nobody could see, because
 * the UI renders the key and everything that matters reads the category.
 */
const CLOSED_STATUS_KEYS = new Set(['done', 'complete', 'completed', 'closed', 'cancelled'])

/**
 * Why a person cannot be put on a task — see `assertPersonCanSeeTask`. One
 * sentence per role, so the assignee picker and the follower picker each say
 * what happened in the words of what was tried.
 */
const PERSON_CANNOT_SEE = {
  assignee: "That person can't see this task, so it can't be assigned to them",
  follower: "That person can't see this task, so they can't follow it",
} as const
function inferCategoryFromKey(key: string): StatusCategory {
  return CLOSED_STATUS_KEYS.has(key.toLowerCase()) ? 'closed' : 'open'
}

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
    private security: SecurityService,
    // The export's custom-field columns read through the same method as the
    // task's own field panel. Optional so a service built by hand in a unit
    // test, which never exports, needs no eleventh argument.
    @Optional() private customFields?: CustomFieldsService,
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
      await this.slack.notify(workspaceId, eventType, this.formatSlackMessage(eventType, payload), {
        projectId: triggerCtx.projectId,
      })
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
    folderId: string | null
  } | null> {
    const [row] = await this.db
      .select({ workspaceId: spaces.workspaceId, spaceId: spaces.id, projectId: lists.projectId, folderId: projects.folderId })
      .from(lists)
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(lists.id, listId))
      .limit(1)
    return row ?? null
  }

  /**
   * §V2-13 — the workspace a list belongs to, for callers outside this service.
   *
   * The paywall is enforced in the controller (where PlansService is injected,
   * so the ten unit tests that construct this service positionally keep
   * working), and a plan is a property of the WORKSPACE, not of the list. This
   * is the one fact the controller is missing.
   */
  async workspaceIdForList(listId: string): Promise<string | null> {
    const ctx = await this.resolveWorkspaceForList(listId)
    return ctx?.workspaceId ?? null
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

  /**
   * G10-11 [12:38–12:41] — a subtask appeared under a task you are on.
   *
   * The audience is the PARENT's watchers and assignees, which is the only
   * honest one available: her list pairs this with "Task created", which fires
   * to people following a List, and there is no list-follow concept here. So
   * this ships and that one waits, rather than adding a notification kind with
   * nothing behind it.
   *
   * Off by default (see DEFAULT_PRIMARY_TYPES) — worth being able to turn on,
   * not worth interrupting anybody who did not ask.
   */
  private async notifySubtaskCreated(
    parentTaskId: string,
    subtaskId: string,
    subtaskTitle: string,
    actorId: string,
  ) {
    const [parent] = await this.db
      .select({ id: tasks.id, title: tasks.title, listId: tasks.listId })
      .from(tasks)
      .where(eq(tasks.id, parentTaskId))
      .limit(1)
    if (!parent) return
    const ctx = await this.resolveWorkspaceForList(parent.listId)
    if (!ctx) return

    const [watchers, assignees] = await Promise.all([
      this.db.select({ userId: taskWatchers.userId }).from(taskWatchers).where(eq(taskWatchers.taskId, parentTaskId)),
      this.db.select({ userId: taskAssignees.userId }).from(taskAssignees).where(eq(taskAssignees.taskId, parentTaskId)),
    ])
    // Not the person who just made it: they know.
    const recipients = [...new Set([...watchers, ...assignees].map((r) => r.userId))].filter(
      (id) => id !== actorId,
    )
    if (recipients.length === 0) return

    const workspaceName = await this.resolveWorkspaceName(ctx.workspaceId)
    // The link opens the SUBTASK — the thing that is new — not the parent the
    // reader already knows about.
    const url = this.buildTaskUrl(ctx.workspaceId, ctx.spaceId, ctx.projectId, parent.listId, subtaskId)
    for (const userId of recipients) {
      void this.notifications.create({
        userId,
        workspaceId: ctx.workspaceId,
        actorId,
        type: 'subtask_created',
        title: `New subtask in "${parent.title}"`,
        body: subtaskTitle,
        target: { entityType: 'task', entityId: subtaskId, url },
        emailContext: { taskTitle: parent.title, workspaceName },
      })
    }
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
    // §A2.8 — name both ends of a transition. The activity log already records
    // { from, to }; a watcher reading "Updated status to In review" still has to
    // open the task to learn what it moved off.
    if (params.patch.status && params.patch.status !== params.before.status) {
      changedBits.push(`status from ${humanizeFieldValue(params.before.status)} to ${humanizeFieldValue(params.patch.status)}`)
    }
    if (params.patch.priority && params.patch.priority !== params.before.priority) {
      changedBits.push(`priority from ${humanizeFieldValue(params.before.priority)} to ${humanizeFieldValue(params.patch.priority)}`)
    }
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

  /** Whether this person may open this task (`readableTaskIds`); a seam the notice's tests answer. */
  private async canUserSeeTask(workspaceId: string, userId: string, taskId: string): Promise<boolean> {
    return (await readableTaskIds(this.db, workspaceId, userId, [taskId])).has(taskId)
  }

  /**
   * §4.4 — notify a task's assignees + watchers (minus the actor) when a newly
   * added blocking dependency leaves it blocked. Best-effort: swallows errors so
   * a notification failure never breaks the dependency write.
   */
  private async notifyTaskBlocked(blockedTaskId: string, blockerTaskId: string, actorId: string) {
    try {
      // Only notify when the blocker is genuinely open — i.e. this dependency
      // actually leaves the task blocked. A done/cancelled blocker doesn't block.
      const openBlockers = await this.getOpenBlockers(blockedTaskId)
      const blocker = openBlockers.find((b) => b.id === blockerTaskId)
      if (!blocker) return

      const [blockedTask] = await this.db
        .select({ id: tasks.id, title: tasks.title, listId: tasks.listId })
        .from(tasks)
        .where(eq(tasks.id, blockedTaskId))
        .limit(1)
      if (!blockedTask) return

      const ctx = await this.resolveWorkspaceForList(blockedTask.listId)
      if (!ctx) return
      const workspaceName = await this.resolveWorkspaceName(ctx.workspaceId)
      const taskUrl = this.buildTaskUrl(
        ctx.workspaceId,
        ctx.spaceId,
        ctx.projectId,
        blockedTask.listId,
        blockedTaskId,
      )

      const [assigneeRows, watcherRows] = await Promise.all([
        this.db
          .select({ userId: taskAssignees.userId })
          .from(taskAssignees)
          .where(eq(taskAssignees.taskId, blockedTaskId)),
        this.db
          .select({ userId: taskWatchers.userId })
          .from(taskWatchers)
          .where(eq(taskWatchers.taskId, blockedTaskId)),
      ])

      const recipientIds = [...new Set([...assigneeRows, ...watcherRows].map((r) => r.userId))].filter(
        (id) => id !== actorId,
      )
      if (recipientIds.length === 0) return

      for (const userId of recipientIds) {
        // Named only to a recipient who may open the blocker: this said
        // `Blocked by "<title>"` to every assignee and watcher, one of a space
        // they were refused included (measured on lane 1).
        const seesBlocker = await this.canUserSeeTask(ctx.workspaceId, userId, blockerTaskId)
        void this.notifications.create({
          userId,
          workspaceId: ctx.workspaceId,
          actorId,
          type: 'task_blocked',
          title: `"${blockedTask.title}" is blocked`,
          body: seesBlocker ? `Blocked by "${blocker.title}".` : 'Blocked by a task you cannot open.',
          target: { entityType: 'task', entityId: blockedTaskId, url: taskUrl },
          emailContext: { taskTitle: blockedTask.title, workspaceName },
        })
      }
    } catch {
      // Best-effort — never fail the dependency write on a notification error.
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
          // Without this the index keeps the creation time forever, and an
          // edited task never moves under a "last updated" sort.
          updatedAt: ctx.task.updatedAt,
        },
        ctx.space.workspaceId,
        ctx.space.id,
        ctx.project.id,
      )
    } catch {
      // Search is best-effort; never fail a write because of it.
    }
  }

  private async indexAttachmentInSearch(
    attachment: { id: string; fileName: string; contentType: string; createdAt: Date },
    taskId: string,
  ) {
    try {
      const ctx = await this.resolveTaskContext(taskId)
      if (!ctx) return
      await this.search.indexTaskAttachment(
        {
          id: attachment.id,
          fileName: attachment.fileName,
          contentType: attachment.contentType,
          createdAt: attachment.createdAt,
        },
        { id: ctx.task.id, listId: ctx.task.listId },
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

  /** A task in the bin is not an editable task (`assertTaskNotInBin`, where the reason is written). */
  private assertNotInBin(isArchived: boolean | null | undefined) {
    assertTaskNotInBin(isArchived)
  }

  private async getListIdOrThrow(taskId: string): Promise<string> {
    const [row] = await this.db.select({ listId: tasks.listId }).from(tasks).where(eq(tasks.id, taskId))
    if (!row) throw new NotFoundException('Task not found')
    return row.listId
  }

  /** The task write rule (`common/permissions/task-write.ts`, where it is written). */
  private async assertTaskWriteAccess(
    taskId: string,
    actorId: string,
    opts: { allowArchived?: boolean; level?: 'comment' | 'edit' | 'full' } = {},
  ) {
    return assertTaskWritable(this.db, taskId, actorId, opts)
  }

  /**
   * The write rule, for this module's other services: a checklist from a
   * template, a task's type (`found-25-sep/task-rows-changed-by-id-anywhere`).
   */
  async assertMayEditTask(taskId: string, actorId: string) {
    await this.assertTaskWriteAccess(taskId, actorId)
  }

  /** A comment needs the space's "comment" level: "view only" means view (see `task-write.ts`). */
  private async assertSpaceAllowsComments(taskId: string, actorId: string) {
    const [row] = await this.db
      .select({ spaceId: spaces.id, listId: lists.id, projectId: projects.id, folderId: projects.folderId })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(tasks.id, taskId))
      .limit(1)
    if (!row) throw new NotFoundException('Task not found')
    await assertSpaceLevel(this.db, {
      spaceId: row.spaceId,
      actorId,
      required: 'comment',
      kind: 'comments',
      // A guest comments where the task, or a container above it, is shared with them to comment.
      within: [
        { type: 'task', id: taskId },
        { type: 'list', id: row.listId },
        { type: 'project', id: row.projectId },
        ...(row.folderId ? [{ type: 'folder' as const, id: row.folderId }] : []),
      ],
    })
  }

  /**
   * Read-access gate for a task. Unlike assertTaskWriteAccess this does NOT
   * require the caller to be a creator/assignee: ANY workspace member who can
   * reach the task's container may view it (comment-/view-only roles and guests
   * included), matching how the GET routes are authorized by ResourceMemberGuard
   * (workspace membership + `checkContainerAccess`). It still blocks
   * cross-workspace / non-member callers and outsiders to a private space or
   * project. Used by read paths that hand back sensitive data (e.g. signed R2
   * attachment URLs) as a service-layer defense-in-depth behind the route guard.
   */
  private async assertTaskReadAccess(taskId: string, actorId: string, opts: { asAssignee?: boolean } = {}) {
    const [ctx] = await this.db
      .select({
        taskId: tasks.id,
        listId: tasks.listId,
        createdById: tasks.createdById,
        workspaceId: spaces.workspaceId,
        spaceId: spaces.id,
        spaceVisibility: spaces.visibility,
        projectId: projects.id,
        projectVisibility: projects.visibility,
        listVisibility: lists.visibility,
        listCreatedById: lists.createdById,
        taskVisibility: tasks.visibility,
      })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(tasks.id, taskId))
      .limit(1)
    if (!ctx) throw new NotFoundException('Task not found')
    const access = await this.assertContainerReadAccess(ctx, actorId)
    // A guest reads only the tasks in their reach (`guest-reach.ts`), assigned or not.
    if (access.workspaceRole === 'guest' && !(await guestMayRead(this.db, actorId, 'task', taskId))) {
      throw new ForbiddenException('This task is not shared with you')
    }
    /*
     * PER-ITEM PRIVACY, as `ResourceMemberGuard` enforces it on the routes that
     * carry it: a private list is its creator's and the managers'; a private
     * task is its creator's, its assignees' and the managers'. This check did
     * not look, so every service path asking "can this person see the task" —
     * a parent, a dependency, a follower, a saved comment — said yes for a
     * private one the task's own GET refuses.
     */
    if (ctx.listVisibility === 'private' || ctx.taskVisibility === 'private') {
      const isManager = isManagerRole(access.workspaceRole)
      if (!canSeePrivateItem({ visibility: ctx.listVisibility, createdById: ctx.listCreatedById }, { userId: actorId, isManager })) {
        throw new ForbiddenException('This list is private')
      }
      if (ctx.taskVisibility === 'private') {
        // `asAssignee`: the question is whether they could see it ONCE
        // assigned — see assertPersonCanSeeTask.
        const [assigned] = opts.asAssignee
          ? [{ userId: actorId }]
          : await this.db
              .select({ userId: taskAssignees.userId })
              .from(taskAssignees)
              .where(and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.userId, actorId)))
              .limit(1)
        if (
          !canSeePrivateItem(
            { visibility: ctx.taskVisibility, createdById: ctx.createdById },
            { userId: actorId, isManager, isAssignee: Boolean(assigned) },
          )
        ) {
          throw new ForbiddenException('This task is private')
        }
      }
    }
    return access
  }

  /**
   * Whether `actorId` may read what sits in this container — the workspace, a
   * private space, a private project. Split out of `assertTaskReadAccess` so
   * the same rule answers for a task that does not exist YET: `createTask`
   * checks its assignees against the list before it writes anything.
   */
  private async assertContainerReadAccess<
    C extends {
      workspaceId: string
      spaceId: string
      spaceVisibility: string | null
      projectId: string | null
      projectVisibility: string | null
    },
  >(ctx: C, actorId: string): Promise<C & { workspaceRole: string }> {
    const [membership] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, ctx.workspaceId), eq(workspaceMembers.userId, actorId)))
      .limit(1)
    if (!membership) throw new NotFoundException('Workspace not found')

    // The shared rule (`containerRefusal`), answered in the words of whichever
    // container refused; managers pass it. This restated the rule to keep its
    // messages, and missed a private folder the day the rule learnt one.
    const withRole = { ...ctx, workspaceRole: membership.role as string }
    const refusal = await containerRefusal(this.db, ctx, { userId: actorId, workspaceRole: membership.role as string })
    if (refusal === 'space') throw new ForbiddenException('This space is private')
    if (refusal === 'folder') throw new ForbiddenException('This folder is private')
    if (refusal === 'project') throw new ForbiddenException('This project is private')

    return withRole
  }

  /**
   * A subtask's parent: in the SAME WORKSPACE, and one the caller can see.
   *
   * Both subtask paths checked that the parent existed and was not itself a
   * subtask, and neither asked where it lived. So `parentTaskId` could name a
   * task in another tenant's workspace, and the link ran both ways at once:
   * `getTask` returns the parent's details (`parent: …`), so the caller could
   * read a task in a workspace they do not belong to, and the other workspace
   * gained a subtask it never created.
   *
   * A parent in another workspace answers NOT FOUND rather than "must be in
   * the same workspace". The distinct message would tell a caller probing ids
   * that the one they guessed exists somewhere else, which is the enumeration
   * this check is closing.
   *
   * AND ONE THEY MAY ADD A SUBTASK TO — Full edit where the parent lives, the
   * level the sheet already asks before it offers "Add subtask" (`caps.full`),
   * as ClickUp's Full edit "creates tasks and subtasks"
   * (`found-25-sep/read-only-tasks-blocked-and-parented`). This asked the read
   * rule alone, reasoning that a subtask edits none of the parent's own
   * fields; measured on lane 3, a member made a subtask under the admin's task
   * in a view-only space (201), and moved their own task there (200). A
   * subtask counts toward its parent's progress and closes with it: it is
   * part of the parent, and the parent's rule decides it.
   */
  private async assertParentInWorkspace(parentTaskId: string, workspaceId: string, actorId: string) {
    await this.assertTaskReference(parentTaskId, workspaceId, actorId, 'Parent task not found')
    await this.assertTaskWriteAccess(parentTaskId, actorId, { level: 'full' })
  }

  /**
   * ANY task a caller points at from another task obeys the parent's rule: the
   * same workspace, and one the caller can read. A dependency is the parent
   * defect in its sibling — `getTask` hands back each dependency's `related`
   * task row whole, so a dependency on a task in another workspace was a way
   * to read it, and that task's own dependency list then showed work from a
   * tenant it has never heard of.
   */
  private async assertTaskReference(otherTaskId: string, workspaceId: string, actorId: string, notFound: string) {
    const [other] = await this.db
      .select({ workspaceId: spaces.workspaceId })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(tasks.id, otherTaskId))
      .limit(1)
    if (!other || other.workspaceId !== workspaceId) throw new NotFoundException(notFound)
    await this.assertTaskReadAccess(otherTaskId, actorId)
  }

  /**
   * The people a caller ATTACHES to a task — an assignee, a follower — must be
   * able to see it. Each is told about the task from then on, so one outside
   * the workspace was told another tenant's work, and one outside a private
   * space or project was told the titles that container exists to keep from
   * them. And being assigned something you cannot open is simply broken.
   *
   * `POST /tasks/:id/watchers` had no access check at all, in the route or
   * here: an account that shared no workspace with the task could follow it by
   * id — and the answer was the whole task, title and description, from a
   * route whose GET twin refuses the same account with 403.
   *
   * 400 with the reason, not 404: the caller can see the task, and what they
   * need to know is why this person cannot be put on it.
   *
   * AN ASSIGNEE IS JUDGED AS AN ASSIGNEE. A PRIVATE task is its creator's, its
   * assignees' and the managers' — so assigning somebody is exactly how a
   * private task is shared, and `comment-recording` draws that flow: mention
   * somebody who cannot open the task, the picker warns, assign them, the
   * warning goes. The first version of this check asked whether they could
   * see the task BEFORE being assigned, refused, and broke it; the regression
   * run caught it. The workspace, its private spaces and projects and a
   * private list still have to let them in — assignment grants none of those.
   * A follower gets no such grant, so a follower must see the task already.
   */
  private async assertPersonCanSeeTask(taskId: string, userId: string, as: 'assignee' | 'follower') {
    try {
      await this.assertTaskReadAccess(taskId, userId, { asAssignee: as === 'assignee' })
    } catch {
      throw new BadRequestException(PERSON_CANNOT_SEE[as])
    }
  }

  /** The same rule for a task that does not exist yet: judged by the list it will be created in. */
  private async assertPeopleCanSeeList(listId: string, userIds: string[], as: 'assignee' | 'follower') {
    if (userIds.length === 0) return
    const [ctx] = await this.db
      .select({
        workspaceId: spaces.workspaceId,
        spaceId: spaces.id,
        spaceVisibility: spaces.visibility,
        projectId: projects.id,
        projectVisibility: projects.visibility,
        listVisibility: lists.visibility,
        listCreatedById: lists.createdById,
      })
      .from(lists)
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(lists.id, listId))
      .limit(1)
    if (!ctx) throw new NotFoundException('List not found')
    for (const userId of userIds) {
      // A private list is its creator's and the managers' — the list half of
      // the item rule in `assertTaskReadAccess`. The task's own privacy does
      // not apply: somebody it is born assigned to is one of its assignees.
      const visible = await this.assertContainerReadAccess(ctx, userId).then(
        (access) =>
          canSeePrivateItem(
            { visibility: ctx.listVisibility, createdById: ctx.listCreatedById },
            { userId, isManager: isManagerRole(access.workspaceRole) },
          ),
        () => false,
      )
      if (!visible) throw new BadRequestException(PERSON_CANNOT_SEE[as])
    }
  }

  /**
   * §3.3 Delete Items — a workspace `manager` (not workspace_admin/super_admin)
   * may only archive/delete a task whose Space they belong to (space_members).
   * Admins & super_admins keep delete-any; plain members are already limited to
   * their own tasks by assertTaskWriteAccess. This is deliberately scoped to the
   * DELETE path (it does NOT loosen or touch assertTaskWriteAccess's other
   * callers) so a manager's non-delete writes stay unrestricted.
   */
  private async assertManagerDeleteScope(taskId: string, actorId: string) {
    const [ctx] = await this.db
      .select({ spaceId: spaces.id, workspaceId: spaces.workspaceId })
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
    // Only managers are further restricted here. workspace_admin / super_admin
    // keep delete-any; members/guests were already gated by the write-access
    // check the caller ran first.
    if (membership?.role !== 'manager') return

    const [member] = await this.db
      .select({ userId: spaceMembers.userId })
      .from(spaceMembers)
      .where(and(eq(spaceMembers.spaceId, ctx.spaceId), eq(spaceMembers.userId, actorId)))
      .limit(1)
    if (!member) throw new ForbiddenException('Managers can only delete tasks in their own spaces')
  }

  /**
   * §4.5 — enforce the declared attachment size on the presign/create paths.
   * A valid, positive `sizeBytes` is now MANDATORY: reject when it is missing,
   * non-finite, ≤ 0, or over the hard cap. This turns the client-declared size
   * into a real gate instead of an advisory value that silently stored 0.
   *
   * NOTE: R2 presigned PUT URLs (see R2Service.presignPutObject) sign only the
   * object key + content-type — they cannot express a content-length-range
   * condition the way a presigned POST policy can. Byte-exact enforcement of the
   * *actual* uploaded bytes therefore requires a storage-side upload policy;
   * until that exists this declared-size gate is the mandatory guard.
   */
  private assertAttachmentSize(sizeBytes?: number): void {
    if (sizeBytes == null || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      throw new BadRequestException('A valid attachment sizeBytes is required')
    }
    if (sizeBytes > MAX_ATTACHMENT_BYTES) {
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

  // Public so the AI module can assemble enriched task-summary input (Plan §7.5).
  async getOpenBlockers(taskId: string) {
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
    const fileName = safeFileName(body.fileName)
    const key = `workspaces/${ctx.workspaceId}/tasks/${taskId}/attachments/${Date.now()}-${fileName}`
    const uploadUrl = await this.r2.presignPutObject(key, body.contentType || 'application/octet-stream', {
      uploadedby: actorId,
      taskid: taskId,
    })
    return { uploadUrl, storageKey: key }
  }

  // --- Linked docs (Plan §4 relationships) ---------------------------------

  /**
   * Docs linked to a task, most-recent first, to anybody who may open the task.
   * This asked the WRITE rule (creator, assignee, manager) under a comment that
   * said read, so a member who could open the task was refused, and its
   * References tab said "No linked docs." (`found-24-sep/linked-docs-read-needs-write-access`).
   */
  async listLinkedDocs(taskId: string, userId: string) {
    const ctx = await this.assertTaskReadAccess(taskId, userId)
    // Each link names its doc, so it lists only docs the reader may open
    // (`doc-access.ts`); measured, a member read the title of a doc in a space
    // they were refused off a task in an open one.
    const hidden = await hiddenDocIds(this.db, ctx.workspaceId, userId, await resolveIsManager(this.db, ctx.workspaceId, userId))
    return this.db
      .select({
        id: taskDocLinks.id,
        docId: docs.id,
        title: docs.title,
        icon: docs.icon,
        isArchived: docs.isArchived,
        linkedAt: taskDocLinks.createdAt,
      })
      .from(taskDocLinks)
      .innerJoin(docs, eq(docs.id, taskDocLinks.docId))
      .where(and(eq(taskDocLinks.taskId, taskId), hidden.length ? notInArray(docs.id, hidden) : undefined))
      .orderBy(desc(taskDocLinks.createdAt))
  }

  /** Link a doc to a task. Both must live in the same workspace, and the doc must be one the linker may open. */
  async linkDoc(taskId: string, docId: string, userId: string) {
    const ctx = await this.assertTaskWriteAccess(taskId, userId)
    const [doc] = await this.db
      .select({ id: docs.id, workspaceId: docs.workspaceId, spaceId: docs.spaceId, parentDocId: docs.parentDocId })
      .from(docs)
      .where(eq(docs.id, docId))
      .limit(1)
    if (!doc) throw new NotFoundException('Doc not found')
    if (doc.workspaceId !== ctx.workspaceId) throw new BadRequestException('Doc belongs to a different workspace')
    // Not found, as for a doc that does not exist: linking one you may not open
    // was a way to read its title back off the task.
    if (!(await canReadDoc(this.db, doc, userId, await resolveIsManager(this.db, ctx.workspaceId, userId)))) {
      throw new NotFoundException('Doc not found')
    }
    const [row] = await this.db
      .insert(taskDocLinks)
      .values({ taskId, docId, createdById: userId })
      .onConflictDoNothing()
      .returning()
    // onConflictDoNothing returns nothing when the link already exists.
    return row ?? { id: null, taskId, docId, alreadyLinked: true }
  }

  /** Remove a task↔doc link. */
  async unlinkDoc(taskId: string, docId: string, userId: string) {
    await this.assertTaskWriteAccess(taskId, userId)
    await this.db
      .delete(taskDocLinks)
      .where(and(eq(taskDocLinks.taskId, taskId), eq(taskDocLinks.docId, docId)))
    return { ok: true }
  }

  // --- External-service links (Plan §12.8 GitHub/GitLab, §12.2 Google Drive) -
  //
  // A link is created by pasting a URL. The URL is parsed (see
  // external-links.util) to detect provider + kind + external_id. When the
  // workspace has a matching integration connection with a stored token, the
  // live PR/issue state (or Drive file metadata) is fetched and persisted;
  // otherwise the link is kept with status null — graceful, never an error.

  /** External links attached to a task, most-recent first. Requires task access. */
  async listExternalLinks(taskId: string, userId: string) {
    await this.assertTaskWriteAccess(taskId, userId)
    return this.db
      .select({
        id:         taskExternalLinks.id,
        provider:   taskExternalLinks.provider,
        kind:       taskExternalLinks.kind,
        url:        taskExternalLinks.url,
        externalId: taskExternalLinks.externalId,
        title:      taskExternalLinks.title,
        status:     taskExternalLinks.status,
        metadata:   taskExternalLinks.metadata,
        commentId:  taskExternalLinks.commentId,
        createdAt:  taskExternalLinks.createdAt,
      })
      .from(taskExternalLinks)
      .where(eq(taskExternalLinks.taskId, taskId))
      .orderBy(desc(taskExternalLinks.createdAt))
  }

  /**
   * §12.6 — external links attached to one specific comment on a task
   * (e.g. Dropbox files shared in a comment), most-recent first. Requires task
   * access. Task-level links (comment_id null) are excluded.
   */
  async listExternalLinksForComment(taskId: string, commentId: string, userId: string) {
    await this.assertTaskWriteAccess(taskId, userId)
    return this.db
      .select({
        id:         taskExternalLinks.id,
        provider:   taskExternalLinks.provider,
        kind:       taskExternalLinks.kind,
        url:        taskExternalLinks.url,
        externalId: taskExternalLinks.externalId,
        title:      taskExternalLinks.title,
        status:     taskExternalLinks.status,
        metadata:   taskExternalLinks.metadata,
        commentId:  taskExternalLinks.commentId,
        createdAt:  taskExternalLinks.createdAt,
      })
      .from(taskExternalLinks)
      .where(and(eq(taskExternalLinks.taskId, taskId), eq(taskExternalLinks.commentId, commentId)))
      .orderBy(desc(taskExternalLinks.createdAt))
  }

  /** Link an external URL (GitHub/GitLab commit·PR·issue, Drive file, or plain link). */
  async addExternalLink(
    taskId: string,
    userId: string,
    input: { url: string; provider?: string; commentId?: string | null },
  ) {
    const ctx = await this.assertTaskWriteAccess(taskId, userId)
    const url = (input.url ?? '').trim()
    if (!isHttpUrl(url)) throw new BadRequestException('A valid http(s) URL is required')

    // §12.6 — a link may be scoped to a specific comment (e.g. a Dropbox file
    // shared in a comment). It still belongs to the task; validate the comment
    // is on this task so a link can't be pinned onto another task's comment.
    const commentId = input.commentId ?? null
    if (commentId) {
      const [comment] = await this.db
        .select({ taskId: taskComments.taskId })
        .from(taskComments)
        .where(eq(taskComments.id, commentId))
        .limit(1)
      if (!comment || comment.taskId !== taskId) {
        throw new BadRequestException('Comment does not belong to this task')
      }
    }

    const parsed = parseExternalLinkUrl(url, input.provider)
    // Best-effort live enrichment; falls back to null status when the provider
    // isn't connected/configured (env-gated) or the fetch fails.
    const enriched = await this.fetchProviderState(parsed.provider, parsed.kind, parsed.ref, ctx.workspaceId)

    const metadata: Record<string, unknown> = { ref: parsed.ref }
    if (enriched?.metadata) Object.assign(metadata, enriched.metadata)

    const [row] = await this.db
      .insert(taskExternalLinks)
      .values({
        taskId,
        commentId,
        workspaceId: ctx.workspaceId,
        provider: parsed.provider,
        kind: parsed.kind,
        url,
        externalId: parsed.externalId,
        title: enriched?.title ?? parsed.title,
        status: enriched?.status ?? null,
        metadata,
        createdById: userId,
      })
      .returning()
    return row
  }

  /** Re-fetch live state for one link (env-gated behind the provider connection). */
  async refreshExternalLink(taskId: string, linkId: string, userId: string) {
    const ctx = await this.assertTaskWriteAccess(taskId, userId)
    const [link] = await this.db
      .select()
      .from(taskExternalLinks)
      .where(and(eq(taskExternalLinks.id, linkId), eq(taskExternalLinks.taskId, taskId)))
      .limit(1)
    if (!link) throw new NotFoundException('Link not found')

    const ref = (link.metadata?.ref as ExternalLinkRef | undefined) ?? {}
    const enriched = await this.fetchProviderState(
      link.provider as ExternalLinkProvider,
      link.kind as ExternalLinkKind,
      ref,
      ctx.workspaceId,
    )
    if (!enriched) return link // Not configured / nothing to update — graceful.

    const metadata: Record<string, unknown> = { ...(link.metadata ?? {}), ref }
    if (enriched.metadata) Object.assign(metadata, enriched.metadata)
    const [updated] = await this.db
      .update(taskExternalLinks)
      .set({
        status: enriched.status ?? link.status,
        title: enriched.title ?? link.title,
        metadata,
      })
      .where(eq(taskExternalLinks.id, linkId))
      .returning()
    return updated
  }

  /** Remove a task↔external link. */
  async removeExternalLink(taskId: string, linkId: string, userId: string) {
    await this.assertTaskWriteAccess(taskId, userId)
    await this.db
      .delete(taskExternalLinks)
      .where(and(eq(taskExternalLinks.id, linkId), eq(taskExternalLinks.taskId, taskId)))
    return { ok: true }
  }

  /**
   * Read-only reuse of `integration-connections`: the stored OAuth token for a
   * provider in a workspace, or null when the provider isn't connected. Kept
   * minimal (single token lookup) rather than pulling in the whole service.
   */
  private async getProviderToken(
    workspaceId: string,
    connectionProvider: 'github' | 'gitlab' | 'google-drive' | 'dropbox',
  ): Promise<string | null> {
    const [conn] = await this.db
      .select({ status: workspaceIntegrationConnections.status, accessToken: workspaceIntegrationConnections.accessToken })
      .from(workspaceIntegrationConnections)
      .where(
        and(
          eq(workspaceIntegrationConnections.workspaceId, workspaceId),
          eq(workspaceIntegrationConnections.provider, connectionProvider),
        ),
      )
      .limit(1)
    if (!conn || conn.status !== 'connected' || !conn.accessToken) return null
    return conn.accessToken
  }

  /**
   * Env-gated live provider fetch. Returns the fields to persist (status/title/
   * metadata) or null when the provider isn't connected, the kind is
   * un-fetchable, or the remote call fails — so linking always degrades to a
   * plain "linked" badge instead of erroring.
   */
  private async fetchProviderState(
    provider: ExternalLinkProvider,
    kind: ExternalLinkKind,
    ref: ExternalLinkRef,
    workspaceId: string,
  ): Promise<{ status: string | null; title: string | null; metadata?: Record<string, unknown> } | null> {
    try {
      if (provider === 'github' && (kind === 'pull_request' || kind === 'issue')) {
        const token = await this.getProviderToken(workspaceId, 'github')
        if (!token) return null
        return await this.fetchGithubState(kind, ref, token)
      }
      if (provider === 'gitlab' && (kind === 'pull_request' || kind === 'issue')) {
        const token = await this.getProviderToken(workspaceId, 'gitlab')
        if (!token) return null
        return await this.fetchGitlabState(kind, ref, token)
      }
      if (provider === 'google_drive' && kind === 'file') {
        const token = await this.getProviderToken(workspaceId, 'google-drive')
        if (!token) return null
        return await this.fetchDriveFile(ref, token)
      }
      if (provider === 'dropbox' && kind === 'file') {
        const token = await this.getProviderToken(workspaceId, 'dropbox')
        if (!token) return null
        return await this.fetchDropboxFile(ref, token)
      }
    } catch {
      // Network / auth / rate-limit failure — degrade gracefully.
      return null
    }
    return null
  }

  private async fetchGithubState(
    kind: ExternalLinkKind,
    ref: ExternalLinkRef,
    token: string,
  ): Promise<{ status: string | null; title: string | null; metadata?: Record<string, unknown> } | null> {
    if (!ref.owner || !ref.repo || !ref.number) return null
    const base = process.env.GITHUB_API_URL ?? 'https://api.github.com'
    const path = kind === 'pull_request' ? 'pulls' : 'issues'
    // Fixed/operator host (not user-derived), but routed through safeFetch for
    // defense-in-depth: blocks private/reserved IPs + DNS rebinding on the sink.
    const res = await safeFetch(`${base}/repos/${ref.owner}/${ref.repo}/${path}/${ref.number}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      timeoutMs: 15_000,
    })
    if (res.status < 200 || res.status >= 300) return null
    const body = JSON.parse(res.text()) as { state?: string; merged?: boolean; merged_at?: string | null; title?: string }
    const status =
      kind === 'pull_request'
        ? body.merged || body.merged_at
          ? 'merged'
          : body.state === 'closed'
            ? 'closed'
            : 'open'
        : body.state === 'closed'
          ? 'closed'
          : 'open'
    return { status, title: body.title ?? null, metadata: { state: body.state ?? null } }
  }

  /**
   * Hosts the GitLab refresh may send the workspace OAuth token to: gitlab.com
   * plus any operator-approved self-hosted hosts from GITLAB_ALLOWED_HOSTS
   * (comma-separated, default none). Read per-call so operators can change the
   * allowlist without a code change; lowercased for case-insensitive matching.
   */
  private gitlabAllowedHosts(): Set<string> {
    const hosts = new Set<string>(['gitlab.com'])
    for (const raw of (process.env.GITLAB_ALLOWED_HOSTS ?? '').split(',')) {
      const h = raw.trim().toLowerCase()
      if (h) hosts.add(h)
    }
    return hosts
  }

  private async fetchGitlabState(
    kind: ExternalLinkKind,
    ref: ExternalLinkRef,
    token: string,
  ): Promise<{ status: string | null; title: string | null; metadata?: Record<string, unknown> } | null> {
    if (!ref.projectPath || !ref.number) return null
    // SSRF / token-exfiltration guard: `ref.host` is derived from the pasted URL,
    // so it must NEVER be used verbatim as the target of an authenticated request
    // (a member could paste https://gitlab.evil.com/... and receive the workspace
    // token). Only reach gitlab.com or an operator-approved host; anything else is
    // skipped WITHOUT sending the token. safeFetch additionally pins DNS and blocks
    // private/reserved IPs (incl. cloud metadata) on every redirect hop.
    const allowedHostnames = this.gitlabAllowedHosts()
    const host = (ref.host ?? 'gitlab.com').toLowerCase()
    if (!allowedHostnames.has(host)) return null
    const apiBase =
      host === 'gitlab.com'
        ? process.env.GITLAB_API_URL ?? 'https://gitlab.com/api/v4'
        : `https://${host}/api/v4`
    const encoded = encodeURIComponent(ref.projectPath)
    const path = kind === 'pull_request' ? 'merge_requests' : 'issues'
    const res = await safeFetch(`${apiBase}/projects/${encoded}/${path}/${ref.number}`, {
      headers: { Authorization: `Bearer ${token}` },
      allowedHostnames,
      timeoutMs: 15_000,
    })
    if (res.status < 200 || res.status >= 300) return null
    const body = JSON.parse(res.text()) as { state?: string; title?: string }
    // GitLab states: opened | closed | merged | locked.
    const status =
      body.state === 'merged'
        ? 'merged'
        : body.state === 'closed' || body.state === 'locked'
          ? 'closed'
          : 'open'
    return { status, title: body.title ?? null, metadata: { state: body.state ?? null } }
  }

  private async fetchDriveFile(
    ref: ExternalLinkRef,
    token: string,
  ): Promise<{ status: string | null; title: string | null; metadata?: Record<string, unknown> } | null> {
    if (!ref.fileId) return null
    const base = process.env.GOOGLE_DRIVE_API_URL ?? 'https://www.googleapis.com/drive/v3'
    // Fixed/operator host; routed through safeFetch for defense-in-depth.
    const res = await safeFetch(
      `${base}/files/${ref.fileId}?fields=id,name,mimeType,thumbnailLink,webViewLink,iconLink`,
      {
        headers: { Authorization: `Bearer ${token}` },
        timeoutMs: 15_000,
      },
    )
    if (res.status < 200 || res.status >= 300) return null
    const body = JSON.parse(res.text()) as {
      name?: string
      mimeType?: string
      thumbnailLink?: string
      iconLink?: string
    }
    return {
      status: null, // Files have no open/merged/closed state.
      title: body.name ?? null,
      metadata: {
        mimeType: body.mimeType ?? null,
        thumbnailLink: body.thumbnailLink ?? null,
        iconLink: body.iconLink ?? null,
      },
    }
  }

  private async fetchDropboxFile(
    ref: ExternalLinkRef,
    token: string,
  ): Promise<{ status: string | null; title: string | null; metadata?: Record<string, unknown> } | null> {
    if (!ref.sharedUrl) return null
    const base = process.env.DROPBOX_API_URL ?? 'https://api.dropboxapi.com/2'
    // Fixed/operator host; routed through safeFetch for defense-in-depth.
    const res = await safeFetch(`${base}/sharing/get_shared_link_metadata`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: ref.sharedUrl }),
      timeoutMs: 15_000,
    })
    if (res.status < 200 || res.status >= 300) return null
    const body = JSON.parse(res.text()) as { name?: string; '.tag'?: string; size?: number }
    return {
      status: null, // Files have no open/merged/closed state.
      title: body.name ?? null,
      metadata: {
        dropboxType: body['.tag'] ?? null,
        size: body.size ?? null,
      },
    }
  }

  // --- Meetings (Plan §12.9 Zoom / Google Meet) ----------------------------
  //
  // One-click meeting creation from a task. When the provider is connected we
  // create a real meeting (Zoom `POST /users/me/meetings`; Google Meet via a
  // Google Calendar event with `conferenceData.createRequest` reusing the gcal
  // connection), seed its start time from the task's due date, and persist the
  // join URL as a `task_external_links` row (kind 'meeting'). Not connected →
  // a clean "connect {provider} first" 400.

  /** Create a Zoom or Google Meet meeting for a task and store the join link. */
  async createTaskMeeting(taskId: string, userId: string, provider: 'zoom' | 'google_meet') {
    const ctx = await this.assertTaskWriteAccess(taskId, userId)
    const [task] = await this.db
      .select({ title: tasks.title, dueDate: tasks.dueDate })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1)
    if (!task) throw new NotFoundException('Task not found')

    // Google Meet reuses the workspace's Google Calendar connection; Zoom has
    // its own OAuth connection.
    const connectionProvider = provider === 'zoom' ? 'zoom' : 'gcal'
    const conn = await this.loadIntegrationConnection(ctx.workspaceId, connectionProvider)
    if (!conn) {
      const label = provider === 'zoom' ? 'Zoom' : 'Google Meet'
      throw new BadRequestException(`Connect ${label} first`)
    }

    const created =
      provider === 'zoom'
        ? await this.createZoomMeeting(conn, task.title, task.dueDate)
        : await this.createGoogleMeet(conn, task.title, task.dueDate)

    const [row] = await this.db
      .insert(taskExternalLinks)
      .values({
        taskId,
        workspaceId: ctx.workspaceId,
        provider,
        kind: 'meeting',
        url: created.joinUrl,
        externalId: created.meetingId,
        title: created.title ?? task.title,
        status: null,
        metadata: {
          meeting: { id: created.meetingId, startTime: created.startTime },
          ...(created.metadata ?? {}),
        },
        createdById: userId,
      })
      .returning()
    return row
  }

  /** Attach a post-meeting recording link to an existing meeting link. */
  async attachMeetingRecording(taskId: string, linkId: string, userId: string, url: string) {
    await this.assertTaskWriteAccess(taskId, userId)
    const recordingUrl = (url ?? '').trim()
    if (!isHttpUrl(recordingUrl)) throw new BadRequestException('A valid http(s) URL is required')

    const [link] = await this.db
      .select()
      .from(taskExternalLinks)
      .where(and(eq(taskExternalLinks.id, linkId), eq(taskExternalLinks.taskId, taskId)))
      .limit(1)
    if (!link) throw new NotFoundException('Meeting link not found')
    if (link.kind !== 'meeting') throw new BadRequestException('This link is not a meeting')

    const metadata: Record<string, unknown> = { ...(link.metadata ?? {}), recordingUrl }
    const [updated] = await this.db
      .update(taskExternalLinks)
      .set({ metadata })
      .where(eq(taskExternalLinks.id, linkId))
      .returning()
    return updated
  }

  /**
   * Load a connected integration connection (with tokens) for a provider, or
   * null when the provider isn't connected / has no stored access token.
   */
  private async loadIntegrationConnection(
    workspaceId: string,
    provider: 'zoom' | 'gcal',
  ): Promise<{
    id: string
    accessToken: string
    refreshToken: string | null
    tokenExpiresAt: Date | null
  } | null> {
    const [conn] = await this.db
      .select({
        id: workspaceIntegrationConnections.id,
        status: workspaceIntegrationConnections.status,
        accessToken: workspaceIntegrationConnections.accessToken,
        refreshToken: workspaceIntegrationConnections.refreshToken,
        tokenExpiresAt: workspaceIntegrationConnections.tokenExpiresAt,
      })
      .from(workspaceIntegrationConnections)
      .where(
        and(
          eq(workspaceIntegrationConnections.workspaceId, workspaceId),
          eq(workspaceIntegrationConnections.provider, provider),
        ),
      )
      .limit(1)
    if (!conn || conn.status !== 'connected' || !conn.accessToken) return null
    return {
      id: conn.id,
      accessToken: conn.accessToken,
      refreshToken: conn.refreshToken,
      tokenExpiresAt: conn.tokenExpiresAt,
    }
  }

  private async createZoomMeeting(
    conn: { id: string; accessToken: string; refreshToken: string | null; tokenExpiresAt: Date | null },
    title: string,
    dueDate: Date | null,
  ): Promise<{ joinUrl: string; meetingId: string | null; title: string | null; startTime: string | null; metadata?: Record<string, unknown> }> {
    const token = await this.ensureMeetingToken(conn, 'zoom')
    const base = process.env.ZOOM_API_URL ?? 'https://api.zoom.us/v2'
    const res = await fetch(`${base}/users/me/meetings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: title,
        // 2 = scheduled (with a start_time), 1 = instant.
        type: dueDate ? 2 : 1,
        ...(dueDate ? { start_time: dueDate.toISOString() } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw new BadRequestException(`Zoom meeting creation failed (${res.status})`)
    const body = (await res.json()) as {
      id?: number | string
      join_url?: string
      start_time?: string
      topic?: string
    }
    if (!body.join_url) throw new BadRequestException('Zoom did not return a join URL')
    return {
      joinUrl: body.join_url,
      meetingId: body.id != null ? String(body.id) : null,
      title: body.topic ?? title,
      startTime: body.start_time ?? dueDate?.toISOString() ?? null,
    }
  }

  private async createGoogleMeet(
    conn: { id: string; accessToken: string; refreshToken: string | null; tokenExpiresAt: Date | null },
    title: string,
    dueDate: Date | null,
  ): Promise<{ joinUrl: string; meetingId: string | null; title: string | null; startTime: string | null; metadata?: Record<string, unknown> }> {
    const token = await this.ensureMeetingToken(conn, 'gcal')
    const start = dueDate ?? new Date(Date.now() + 60 * 60 * 1000)
    const end = new Date(start.getTime() + 30 * 60 * 1000)
    const base = process.env.GOOGLE_CALENDAR_API_URL ?? 'https://www.googleapis.com/calendar/v3'
    const res = await fetch(`${base}/calendars/primary/events?conferenceDataVersion=1`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: title,
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
        conferenceData: {
          createRequest: {
            requestId: `rundesk-${randomUUID()}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw new BadRequestException(`Google Meet creation failed (${res.status})`)
    const body = (await res.json()) as {
      id?: string
      hangoutLink?: string
      htmlLink?: string
      conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> }
    }
    const meetUrl =
      body.hangoutLink ??
      body.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri ??
      null
    if (!meetUrl) throw new BadRequestException('Google did not return a Meet link')
    return {
      joinUrl: meetUrl,
      meetingId: body.id ?? null,
      title,
      startTime: start.toISOString(),
      metadata: { eventUrl: body.htmlLink ?? null },
    }
  }

  /**
   * Return a usable access token for a meeting-provider connection, refreshing
   * via the refresh_token grant when expired/near-expiry (60s buffer). Zoom
   * authenticates the refresh via HTTP Basic; Google via body params. Failures
   * fall back to the stored token so a flaky refresh doesn't block creation.
   */
  private async ensureMeetingToken(
    conn: { id: string; accessToken: string; refreshToken: string | null; tokenExpiresAt: Date | null },
    provider: 'zoom' | 'gcal',
  ): Promise<string> {
    const remaining = conn.tokenExpiresAt ? conn.tokenExpiresAt.getTime() - Date.now() : Infinity
    if (remaining > 60_000 || !conn.refreshToken) return conn.accessToken

    const cfg =
      provider === 'zoom'
        ? {
            tokenUrl: process.env.ZOOM_TOKEN_URL ?? 'https://zoom.us/oauth/token',
            clientId: process.env.ZOOM_CLIENT_ID ?? '',
            clientSecret: process.env.ZOOM_CLIENT_SECRET ?? '',
            basic: true,
          }
        : {
            tokenUrl: 'https://oauth2.googleapis.com/token',
            clientId: process.env.GOOGLE_CLIENT_ID ?? '',
            clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
            basic: false,
          }
    const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: conn.refreshToken })
    const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' }
    if (cfg.basic) {
      headers.Authorization = `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')}`
    } else {
      body.set('client_id', cfg.clientId)
      body.set('client_secret', cfg.clientSecret)
    }
    const res = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers,
      body: body.toString(),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return conn.accessToken
    const tok = (await res.json()) as { access_token?: string; expires_in?: number; refresh_token?: string }
    if (!tok.access_token) return conn.accessToken
    const newExpiry = tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000) : null
    await this.db
      .update(workspaceIntegrationConnections)
      .set({
        accessToken: tok.access_token,
        refreshToken: tok.refresh_token ?? conn.refreshToken,
        tokenExpiresAt: newExpiry,
        updatedAt: new Date(),
      })
      .where(eq(workspaceIntegrationConnections.id, conn.id))
    return tok.access_token
  }

  // --- Task CRUD -----------------------------------------------------------
  /**
   * Resolve a status key against the list's `list_statuses` rows and return
   * the canonical key + category bucket. Falls back to the list's first
   * "open" status if no key is provided and to the very first status if
   * none are marked open. Throws BadRequest if the caller passed a key
   * that isn't defined for the list.
   */
  /**
   * The workspace's nominated default task type, if it has one. Returns null
   * when types are not in use, which is the state every existing workspace
   * starts in — so this stays a no-op until someone opts in.
   */
  /**
   * Is this type one the list's own workspace defines?
   *
   * The PATCH path has always checked (task-types.service.ts:169 —
   * `byId(workspaceId, typeId)`), but when taskTypeId was opened up on create
   * it was passed straight through, so a caller could type a task with an id
   * belonging to somebody else's workspace. Same question, asked the same way,
   * on both paths.
   */
  private async taskTypeBelongsToList(listId: string, taskTypeId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: taskTypes.id })
      .from(lists)
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .innerJoin(
        taskTypes,
        and(eq(taskTypes.workspaceId, spaces.workspaceId), eq(taskTypes.id, taskTypeId)),
      )
      .where(eq(lists.id, listId))
      .limit(1)
    return !!row
  }

  /**
   * §1.1 — does this type make its tasks milestones?
   *
   * tasks.isMilestone is what the timeline, list badges, subtask rows and the
   * client portal all render from, and the type is what a person now sets. This
   * is the one question that keeps the two from contradicting each other.
   */
  private async typeIsMilestone(taskTypeId: string | null): Promise<boolean> {
    if (!taskTypeId) return false
    const [row] = await this.db
      .select({ isMilestone: taskTypes.isMilestone })
      .from(taskTypes)
      .where(eq(taskTypes.id, taskTypeId))
      .limit(1)
    return !!row?.isMilestone
  }

  /** The milestone type of the workspace this list belongs to, if it has one. */
  private async milestoneTypeForList(listId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: taskTypes.id })
      .from(lists)
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .innerJoin(
        taskTypes,
        and(eq(taskTypes.workspaceId, spaces.workspaceId), eq(taskTypes.isMilestone, true)),
      )
      .where(eq(lists.id, listId))
      .limit(1)
    return row?.id ?? null
  }

  private async defaultTaskTypeForList(listId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: taskTypes.id })
      .from(lists)
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .innerJoin(taskTypes, and(eq(taskTypes.workspaceId, spaces.workspaceId), eq(taskTypes.isDefault, true)))
      .where(eq(lists.id, listId))
      .limit(1)
    return row?.id ?? null
  }

  private async resolveStatusForList(
    listId: string,
    requestedKey: string | undefined,
  ): Promise<{ key: string; category: StatusCategory }> {
    // Resolve against the list's effective status set, honouring its
    // status_scope (own list_statuses, or the project/space template).
    const rows = await resolveEffectiveStatuses(this.db, listId)

    if (rows.length === 0) {
      /*
       * A list with no statuses at all.
       *
       * THE COMMENT THAT USED TO BE HERE WAS A STALE REASON. It said the
       * fallback "keeps newly-created lists (whose statuses haven't been
       * seeded yet) usable", which assumes an unseeded list is a transient
       * state. It is not: `ListsService.create` seeds the pipeline, but three
       * other paths that insert into `lists` did not, so a workspace's starter
       * list, a list from a template and a list from a ClickUp import were
       * PERMANENTLY status-less.
       *
       * And the old answer was `category: 'open'` for ANY key. So a task on
       * such a list could be set to `done`, store `status = 'done'`, and read
       * back `statusCategory = 'open'` — accepted, no 400, no warning. The UI
       * showed the status the person picked; lists, reports, the planner,
       * Workload and the teams work preview all reason on the CATEGORY. They
       * disagreed permanently, and work completed there never counted as
       * completed anywhere.
       *
       * The creation paths are fixed and `0153` backfills the lists that
       * already exist. This stays as the last line of defence, and it now
       * infers the category the same way the populated branch below does —
       * so even on a list that somehow has no statuses, "done" means closed.
       */
      const key = requestedKey ?? 'todo'
      return { key, category: inferCategoryFromKey(key) }
    }

    if (requestedKey) {
      const match = rows.find((r) => r.key === requestedKey)
      if (match) return { key: match.key, category: match.category as StatusCategory }
      // Fallback: map common/legacy keys to a category and pick the list's first
      // status in that category, so callers passing 'done'/'todo' still work on
      // lists whose statuses were renamed (instead of a hard 400).
      const inferred: StatusCategory = inferCategoryFromKey(requestedKey)
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
  /** MAY THIS PERSON MAKE A TASK IN THIS LIST — the create gate (`common/permissions/task-create.ts`). */
  async assertCanCreateTaskIn(listId: string, actorId: string): Promise<{ workspaceId: string; spaceId: string; projectId: string }> {
    return assertCanCreateTaskIn(this.db, listId, actorId)
  }

  /** The create gate as a yes or no, for a caller choosing among lists. A failure that is not a refusal is not a no. */
  async canCreateTaskIn(listId: string, actorId: string): Promise<boolean> {
    return canCreateTaskIn(this.db, listId, actorId)
  }

  /**
   * The list a task goes to when the person making it named none — chat's
   * `/task`, "create task from this" on an AI answer: the oldest live list in
   * the workspace THAT THEY MAY MAKE A TASK IN.
   *
   * Two copies of this picked the oldest list, whoever asked. A member refused
   * that list had their task filed where they could not see it (or, now that
   * making it is checked, refused). One picker, asking the rule above.
   */
  async defaultListFor(workspaceId: string, actorId: string): Promise<string | null> {
    /*
     * FIRST, THE LIST THE PERSON CHOSE: the planner's "Default list for new
     * tasks" (frame `14:20`), when it is in this workspace and they may still
     * add to it. It was saved and read by nothing, so `/task` and the AI's
     * "Create task from this" took the oldest list whatever it said
     * (`found-24-sep/planner-default-list-read-by-nothing`).
     */
    const [person] = await this.db
      .select({ settings: users.plannerSettings })
      .from(users)
      .where(eq(users.id, actorId))
      .limit(1)
    const chosen = (person?.settings as { defaultListId?: string | null } | null)?.defaultListId ?? null
    if (chosen) {
      const home = await this.resolveWorkspaceForList(chosen)
      if (home?.workspaceId === workspaceId && (await this.canCreateTaskIn(chosen, actorId))) return chosen
    }
    const candidates = await this.db
      .select({ id: lists.id })
      .from(lists)
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(
        and(
          eq(spaces.workspaceId, workspaceId),
          eq(lists.isArchived, false),
          containerVisibilityFilter(this.db, actorId, false),
          listVisibilityFilter(actorId, false),
        ),
      )
      .orderBy(asc(lists.createdAt))
      .limit(25)
    for (const c of candidates) {
      if (await this.canCreateTaskIn(c.id, actorId)) return c.id
    }
    return null
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
    isMilestone?: boolean
    taskTypeId?: string | null
    createdById: string
  }) {
    await this.assertCanCreateTaskIn(data.listId, data.createdById)
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
      // …and it has to live where the new task will. See assertParentInWorkspace.
      const home = await this.resolveWorkspaceForList(data.listId)
      if (!home) throw new NotFoundException('List not found')
      await this.assertParentInWorkspace(data.parentTaskId, home.workspaceId, data.createdById)
    }
    // The people and labels a task is BORN with obey the rules their own routes
    // enforce: an assignee must be able to see the task (assertPersonCanSeeTask)
    // and a label must be this workspace's own (addLabel). Checked before
    // anything is written, so a refused create leaves no half-made task behind.
    const bornAssignees = [...new Set(data.assigneeIds ?? [])].filter(Boolean)
    await this.assertPeopleCanSeeList(data.listId, bornAssignees, 'assignee')
    const bornLabels = [...new Set(data.labelIds ?? [])].filter(Boolean)
    if (bornLabels.length > 0) {
      const home = await this.resolveWorkspaceForList(data.listId)
      if (!home) throw new NotFoundException('List not found')
      const own = await this.db
        .select({ id: labels.id })
        .from(labels)
        .where(and(inArray(labels.id, bornLabels), eq(labels.workspaceId, home.workspaceId)))
      if (own.length !== bornLabels.length) throw new NotFoundException('Label not found')
    }
    const resolved = await this.resolveStatusForList(data.listId, data.status)
    // A workspace that has nominated a default type gets it applied here, so
    // every task created through any surface — quick-add, board, import — is
    // typed without each of them having to know types exist.
    if (data.taskTypeId && !(await this.taskTypeBelongsToList(data.listId, data.taskTypeId))) {
      throw new BadRequestException('That task type does not belong to this workspace')
    }
    const taskTypeId = data.taskTypeId ?? (await this.defaultTaskTypeForList(data.listId))
    // §1.1 — keep the two in step from the first write. Asking for a milestone
    // type makes the task render as one; asking for a milestone without naming
    // a type picks up the workspace's milestone type, so the type filter can
    // find it. Either way there is one answer, not two.
    let resolvedTypeId = taskTypeId
    let isMilestone = data.isMilestone ?? false
    if (await this.typeIsMilestone(resolvedTypeId)) {
      isMilestone = true
    } else if (isMilestone && !data.taskTypeId) {
      resolvedTypeId = (await this.milestoneTypeForList(data.listId)) ?? resolvedTypeId
    }

    const [task] = await this.db
      .insert(tasks)
      .values({
        listId: data.listId,
        parentTaskId: data.parentTaskId,
        taskTypeId: resolvedTypeId,
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
        isMilestone,
      })
      .returning()

    // The assignees a task is BORN with are announced exactly as the ones added
    // later are — see `announceAssignment`. Writing the rows and stopping there
    // is what this used to do, and it meant the create modal could put your
    // name on a task without telling you.
    if (bornAssignees.length) {
      await this.db.insert(taskAssignees).values(
        bornAssignees.map((userId) => ({ taskId: task.id, userId })),
      )
    }
    if (bornLabels.length) {
      await this.db
        .insert(taskLabelAssignments)
        .values(bornLabels.map((labelId) => ({ taskId: task.id, labelId })))
        .onConflictDoNothing()
    }
    // Creator is auto-subscribed as a watcher so they hear about replies/activity
    // — unless they turned auto-follow off (§A4.7).
    if (await this.notifications.autoFollowEnabled(data.createdById)) {
      await this.db.insert(taskWatchers).values({ taskId: task.id, userId: data.createdById }).onConflictDoNothing()
    }

    await this.logActivity({ taskId: task.id, actorId: data.createdById, action: 'created' })

    if (data.parentTaskId) {
      await this.logActivity({
        taskId: data.parentTaskId,
        actorId: data.createdById,
        action: 'subtask_added',
        meta: { subtaskId: task.id, title: task.title },
      })
      void this.notifySubtaskCreated(data.parentTaskId, task.id, task.title, data.createdById)
    }

    const hydrated = await this.getTask(task.id, { id: data.createdById })
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

    // Announced here rather than beside the insert above, so the task is fully
    // hydrated, indexed and on the realtime channel before anyone is told to go
    // and look at it.
    for (const userId of bornAssignees) {
      await this.announceAssignment({ taskId: task.id, assigneeId: userId, actorId: data.createdById })
    }

    return hydrated
  }

  /**
   * All tasks across the workspace that have a start or due date — used by
   * the Gantt / timeline view. Returns shape suitable for direct render.
   */
  async getTimelineForWorkspace(
    workspaceId: string,
    opts: { from?: Date; to?: Date; projectId?: string; actor?: { id: string; role?: string } } = {},
  ) {
    /*
     * READ AS THE CALLER, BY BOTH RULES. The route is guarded by workspace
     * membership alone, and this applied only the private-item rule, so a
     * member refused a private space's list (403) read its dated tasks on the
     * timeline; measured on lane 1, and so did a guest. The container rule
     * (`containerVisibilityFilter`, the guard's twin) applies too now, in SQL.
     * No actor is an internal caller, unfiltered as before.
     */
    const isManager = opts.actor
      ? await resolveIsManager(this.db, workspaceId, opts.actor.id, opts.actor.role)
      : true
    const visFilter = opts.actor
      ? and(
          taskInReachFilter(this.db, workspaceId, opts.actor.id, isManager),
          taskVisibilityFilter(this.db, opts.actor.id, isManager),
        )
      : undefined
    const rows = await this.db
      .select({
        id: tasks.id,
        title: tasks.title,
        startDate: tasks.startDate,
        dueDate: tasks.dueDate,
        status: tasks.status,
        priority: tasks.priority,
        isMilestone: tasks.isMilestone,
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
          visFilter,
        ),
      )
      .orderBy(asc(tasks.startDate), asc(tasks.dueDate))

    // Only return tasks with at least a due date — the rest can't be plotted.
    return rows.filter((r) => r.startDate || r.dueDate)
  }

  /**
   * One member's OPEN assigned tasks: Home's "Assigned to me" and "Today &
   * overdue", and the planner's Backlog rail.
   *
   * READ AS THE CALLER. The route is guarded by workspace membership alone,
   * `userId` can be anybody's, and this applied no visibility at all. Measured
   * on lane 1: a member refused a private space's list (403) read its task
   * through "the admin's assigned tasks", title and the space's and list's
   * names, and so did a guest. The container rule (`containerVisibilityFilter`,
   * the guard's own twin) and the private-item rule now apply, in SQL, so the
   * limit counts only what the caller may see.
   *
   * OPEN, IN SQL, BEFORE THE LIMIT. Both screens leave finished work out, and
   * did it in the browser: Home by status KEY (`done`, `cancelled`, both
   * renamable), the planner by category. Today & overdue did not do it at
   * all, so every finished task with a past due date was counted overdue.
   * Closed tasks also took places under a limit of 100 by last update, so a
   * busy person's older open tasks fell off both lists. (Binned tasks were
   * never listed: `binTask` archives as well as setting `deletedAt`. The
   * `deletedAt` condition is the list reads' own, kept for the same reason
   * they keep it.) The soonest due come first, so when the limit cuts, it
   * cuts the least urgent.
   */
  async getTasksForMember(
    workspaceId: string,
    userId: string,
    actor: { id: string; role?: string },
    limit = MEMBER_TASKS_DEFAULT_LIMIT,
  ) {
    const isManager = await resolveIsManager(this.db, workspaceId, actor.id, actor.role)
    return this.db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        // §V2-S14 — the planner rail needs to leave finished work out of
        // "Assigned to me" and "Today & overdue". `status` is a per-list key
        // that a workspace can rename, so the client cannot tell closed from
        // open by reading it; the category can.
        statusCategory: tasks.statusCategory,
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
      .where(
        and(
          eq(taskAssignees.userId, userId),
          eq(spaces.workspaceId, workspaceId),
          eq(tasks.isArchived, false),
          isNull(tasks.deletedAt),
          or(isNull(tasks.statusCategory), sql`${tasks.statusCategory} <> 'closed'`),
          taskInReachFilter(this.db, workspaceId, actor.id, isManager),
          taskVisibilityFilter(this.db, actor.id, isManager),
        ),
      )
      .orderBy(sql`${tasks.dueDate} asc nulls last`, desc(tasks.updatedAt))
      .limit(Math.min(Math.max(Math.floor(limit) || MEMBER_TASKS_DEFAULT_LIMIT, 1), MEMBER_TASKS_MAX_LIMIT))
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
    opts: {
      includeAssignees?: boolean
      actorId?: string
      actorRole?: string
      /**
       * Narrow to one person's tasks IN SQL, before the limit.
       *
       * The dashboard used to ask for 500 workspace rows and then keep the
       * viewer's in JavaScript. Those 500 are everyone's, ordered by
       * `updatedAt desc`, so in a busy workspace one person's slice of them is
       * a handful of rows or none — and overdue work is hit hardest, because a
       * task is overdue precisely when nobody has touched it, which is what
       * sorts it out of a recently-updated window. The card then reported
       * "Overdue: 0" as a fact.
       */
      assigneeId?: string
      /**
       * Words the person typed, matched IN SQL against the task's title and
       * the names of its list and project — before the limit.
       *
       * Every task picker (the @ Tasks tab, chat mentions, merge, convert,
       * dependencies) asked for the newest 200 and filtered those in the
       * browser, so task 201 answered "no matches" however exactly it was
       * typed. Filtering here means the limit applies to what matched.
       */
      q?: string
    } = {},
  ) {
    const { includeAssignees = true, actorId, actorRole, assigneeId } = opts
    const safeLimit = Math.min(Math.max(limit, 1), 1000)
    /*
     * WHO MAY SEE WHICH ROWS, IN SQL AND BEFORE THE LIMIT: a task's reach — its
     * space, project and list (`taskInReachFilter`) — and the private-item rule
     * (`taskVisibilityFilter`), the rules the task's own GET applies. This read
     * filtered in JavaScript with its own copy of them, which had no private-list
     * rule and hid a private task from the member it was assigned to
     * (`found-24-sep/private-lists-skipped-by-task-reads`), after a limit it
     * over-fetched to allow for. The route asks only for membership. No actor is
     * an internal caller: every row.
     */
    let readable: SQL | undefined
    if (actorId && actorRole !== 'super_admin') {
      const [member] = await this.db
        .select({ role: workspaceMembers.role })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, actorId)))
        .limit(1)
      if (!member) return [] // not in the workspace: nothing (the route guard refuses first)
      if (!isManagerRole(member.role as string)) {
        readable = and(taskInReachFilter(this.db, workspaceId, actorId, false), taskVisibilityFilter(this.db, actorId, false))
      }
    }
    const words = (opts.q ?? '').trim().slice(0, 200)
    // `%`, `_` and `\` are LIKE's own syntax; a title containing them is text.
    const like = words ? `%${words.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null

    const rawRows = await this.db
      .select({
        id:                tasks.id,
        title:             tasks.title,
        status:            tasks.status,
        statusCategory:    tasks.statusCategory,
        priority:          tasks.priority,
        isMilestone:       tasks.isMilestone,
        // The convert-to-subtask picker leaves subtasks out (a subtask cannot
        // be a parent) by this field — which was never sent, so it offered them.
        parentTaskId:      tasks.parentTaskId,
        listId:            lists.id,
        listName:          lists.name,
        projectId:         projects.id,
        projectName:       projects.name,
        spaceId:           spaces.id,
        spaceName:         spaces.name,
        startDate:         tasks.startDate,
        dueDate:           tasks.dueDate,
        completedAt:       tasks.completedAt,
        createdAt:         tasks.createdAt,
        updatedAt:         tasks.updatedAt,
      })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(
        and(
          eq(spaces.workspaceId, workspaceId),
          eq(tasks.isArchived, false),
          assigneeId
            ? sql`exists (select 1 from ${taskAssignees} where ${taskAssignees.taskId} = ${tasks.id} and ${taskAssignees.userId} = ${assigneeId})`
            : undefined,
          like
            ? or(ilike(tasks.title, like), ilike(lists.name, like), ilike(projects.name, like))
            : undefined,
          readable,
        ),
      )
      .orderBy(desc(tasks.updatedAt))
      // The rule is in the WHERE, so the limit counts only rows the caller may
      // see; the JavaScript copy ran after it, and over-fetched to make up.
      .limit(safeLimit)
    const rows = rawRows

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

  /** §2 per-item task-visibility WHERE fragment for reads scoped to one list.
   *  undefined = no restriction (manager, or internal/system call). */
  private async taskVisibilityFilterForList(
    listId: string,
    actor?: { id: string; role?: string },
  ): Promise<SQL | undefined> {
    if (!actor) return undefined
    const [ctx] = await this.db
      .select({ workspaceId: spaces.workspaceId })
      .from(lists)
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(lists.id, listId))
      .limit(1)
    if (!ctx) return undefined
    const isManager = await resolveIsManager(this.db, ctx.workspaceId, actor.id, actor.role)
    return taskVisibilityFilter(this.db, actor.id, isManager)
  }

  /**
   * §V2-07 frame `11:30` — "Tasks where I have assigned": Comments · Subtasks ·
   * Checklists.
   *
   * WHY THIS IS A SERVER QUESTION AT ALL. The three switches EXTEND the
   * assignee filter: with "Me" chosen and Comments on, a task must also appear
   * when the only thing assigned to you on it is a comment. `GET
   * /tasks/list/:id` carries `assignees` and `subtasks` and nothing about
   * comment or checklist assignment, so two of the three cannot be answered in
   * the browser at all — a client-side version of this feature could only ever
   * be two switches that work and one that is decoration.
   *
   * THE THREE SOURCES ARE RETURNED SEPARATELY, not merged into one array. A
   * merged list cannot tell "Comments found it" from "Checklists found it"
   * when both are on and both match the same task, so a check written against
   * a merged list would pass with one of the three branches deleted. The
   * caller unions them; the shape is what makes each switch falsifiable.
   *
   * EVERY MATCH IS RESOLVED TO THE ROW THE LIST ACTUALLY DRAWS. A comment or a
   * checklist item can hang off a SUBTASK, and the list view draws top-level
   * tasks, so a match on a child is reported as its parent. That is also the
   * whole of the Subtasks source: an assignment on the child, surfaced as the
   * parent it is nested under.
   */
  async assignedViaForList(
    listId: string,
    opts: { userId: string; comments: boolean; subtasks: boolean; checklists: boolean },
    actor?: { id: string; role?: string },
  ): Promise<{
    userId: string
    comments: string[]
    subtasks: string[]
    checklists: string[]
    taskIds: string[]
  }> {
    const empty = { userId: opts.userId, comments: [], subtasks: [], checklists: [], taskIds: [] }
    if (!opts.userId) throw new BadRequestException('userId is required')
    /*
     * The same visibility filter `getTasksByList` uses. Without it this
     * endpoint would be a side door: "which tasks in this list have a comment
     * assigned to X" is a fact about tasks the caller may not be allowed to
     * see, and answering it by id is still answering it.
     */
    const visFilter = await this.taskVisibilityFilterForList(listId, actor)
    const rows = await this.db
      .select({ id: tasks.id, parentTaskId: tasks.parentTaskId })
      .from(tasks)
      .where(
        and(
          eq(tasks.listId, listId),
          eq(tasks.isArchived, false),
          isNull(tasks.deletedAt),
          visFilter,
        ),
      )
    if (rows.length === 0) return empty
    const inList = rows.map((r) => r.id)
    /** id → the top-level row that would be drawn for it. */
    const topOf = new Map(rows.map((r) => [r.id, r.parentTaskId ?? r.id]))
    const topLevel = new Set(rows.filter((r) => !r.parentTaskId).map((r) => r.id))
    /*
     * A match whose parent is in another list (or is itself hidden) has no row
     * on this screen, so it is dropped rather than returned as an id nothing
     * can draw — the caller would union it into a set that never matches and
     * the switch would look as if it had found nothing.
     */
    const surface = (ids: string[]) => {
      const out = new Set<string>()
      for (const id of ids) {
        const top = topOf.get(id)
        if (top && topLevel.has(top)) out.add(top)
      }
      return [...out].sort()
    }

    const comments = opts.comments
      ? surface(
          (
            await this.db
              .selectDistinct({ taskId: taskComments.taskId })
              .from(taskComments)
              .where(
                and(
                  eq(taskComments.assignedToUserId, opts.userId),
                  inArray(taskComments.taskId, inList),
                ),
              )
          ).map((r) => r.taskId),
        )
      : []

    /*
     * A CHILD that is assigned to this person, reported as its parent. The
     * `parentTaskId` test is what keeps this source distinct from the direct
     * assignee match the client already does — without it every directly
     * assigned task would come back here too, and the Subtasks switch would
     * look as if it worked while changing nothing.
     */
    const subtasks = opts.subtasks
      ? surface(
          (
            await this.db
              .selectDistinct({ taskId: taskAssignees.taskId })
              .from(taskAssignees)
              .innerJoin(tasks, eq(tasks.id, taskAssignees.taskId))
              .where(
                and(
                  eq(taskAssignees.userId, opts.userId),
                  inArray(taskAssignees.taskId, inList),
                  sql`${tasks.parentTaskId} is not null`,
                ),
              )
          ).map((r) => r.taskId),
        )
      : []

    const checklists = opts.checklists
      ? surface(
          (
            await this.db
              .selectDistinct({ taskId: taskChecklists.taskId })
              .from(taskChecklistItems)
              .innerJoin(taskChecklists, eq(taskChecklists.id, taskChecklistItems.checklistId))
              .where(
                and(
                  eq(taskChecklistItems.assigneeId, opts.userId),
                  inArray(taskChecklists.taskId, inList),
                ),
              )
          ).map((r) => r.taskId),
        )
      : []

    return {
      userId: opts.userId,
      comments,
      subtasks,
      checklists,
      taskIds: [...new Set([...comments, ...subtasks, ...checklists])].sort(),
    }
  }

  async getTasksByList(
    listId: string,
    opts: { includeSubtasks?: boolean; includeArchived?: boolean } = {},
    actor?: { id: string; role?: string },
  ) {
    const { includeSubtasks = false, includeArchived = false } = opts
    // §2 per-item privacy: hide private tasks the actor may not see. Resolve the
    // owning workspace to determine manager status, then filter in SQL.
    const visFilter = await this.taskVisibilityFilterForList(listId, actor)
    const rows = await this.db.query.tasks.findMany({
      where: and(
        eq(tasks.listId, listId),
        includeSubtasks ? undefined : isNull(tasks.parentTaskId),
        /*
         * A bare `undefined` sat here and `includeArchived` was destructured
         * and never used, so this endpoint returned archived AND binned tasks
         * to everyone, unconditionally — a parameter accepted, documented and
         * dropped. It was `includeArchived ? undefined : eq(isArchived, false)`
         * before the delete work and was lost in the edit.
         *
         * The two flags are not one flag any more. Archive and delete BOTH set
         * `isArchived` (about forty read paths hide a task on that one flag),
         * so a task in the bin must never come back just because someone asked
         * to see archived ones: the bin has its own surface, with its own
         * restore, and a task appearing in both is how you get a row that one
         * screen offers to restore while another offers to destroy it.
         */
        includeArchived ? undefined : eq(tasks.isArchived, false),
        isNull(tasks.deletedAt),
        visFilter,
      ),
      orderBy: [asc(tasks.position), asc(tasks.createdAt)],
      with: {
        assignees: { with: { user: PUBLIC_USER_WITH } },
        subtasks:  { where: and(eq(tasks.isArchived, false), visFilter) },
        // §1.1 — carried so a row can show what kind of task it is. Without it
        // the type was something you could set and filter by but never see
        // without opening the task.
        taskType:  true,
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

    // Per-task "blocked by" edges (which in-list tasks must finish first),
    // for the Gantt view's dependency arrows + critical path (Plan §5).
    const idSet = new Set(taskIds)
    const blockedBy = new Map<string, Set<string>>()
    const addEdge = (taskId: string, blockerId: string) => {
      if (!idSet.has(blockerId) || blockerId === taskId) return
      const set = blockedBy.get(taskId) ?? new Set<string>()
      set.add(blockerId)
      blockedBy.set(taskId, set)
    }
    for (const dep of dependencyRows) {
      if (dep.type === 'blocked_by') addEdge(dep.taskId, dep.relatedTaskId)
    }
    for (const dep of reverseDependencyRows) {
      if (dep.type === 'blocks') addEdge(dep.taskId, dep.relatedTaskId)
    }

    /*
     * §V2-S13 frame `10:35` — "Card cover  Image ›". THE COVER HAS TO REACH THE
     * LIST, or the control above it configures something nothing can draw.
     *
     * `cover_storage_key` and `cover_image_url` were written by a shipped,
     * tested picker (`cover-image-picker.tsx`, suite `task-cover.mjs`) and
     * resolved into one renderable `coverUrl` in exactly ONE place: `getTask`,
     * the single-task read behind the detail sheet. Every other surface — the
     * board card, the list row, the export — got the raw columns and could do
     * nothing with them, because a storage key is not an image address. A
     * stored value no reader honours is *its mirror*, and worse than a missing
     * feature: the database is evidence the cover exists.
     *
     * Resolved here rather than at each call site so the two kinds cannot drift
     * apart again — a stored image is a KEY and needs presigning, a linked one
     * is already a URL and must be passed through untouched (`${CDN}/https://…`
     * is the bug task attachments still have). Only rows that carry a key are
     * signed, so a list of five hundred coverless tasks does no extra work.
     */
    const coverUrlByTask = new Map<string, string | null>()
    await Promise.all(
      rows.map(async (r) => {
        if (!r.coverStorageKey) {
          coverUrlByTask.set(r.id, r.coverImageUrl ?? null)
          return
        }
        // Only ever sign this task's OWN object. The write path refuses any
        // other key now, but a row that took one before it did — or from any
        // path added later — must not become a signed URL to somebody else's
        // file on read. Bound by the task id; see isTaskOwnObjectKey.
        if (!this.r2.configured || !isTaskOwnObjectKey(r.coverStorageKey, r.id)) {
          coverUrlByTask.set(r.id, null)
          return
        }
        // One unsignable key must not take the whole list down with it.
        const signed = await this.r2.getObjectUrl(r.coverStorageKey).catch(() => null)
        coverUrlByTask.set(r.id, signed)
      }),
    )

    return rows.map((r) => ({
      ...r,
      labels: byTask.get(r.id) ?? [],
      openBlockerCount: openBlockerCount.get(r.id) ?? 0,
      blocksOpenCount: blocksOpenCount.get(r.id) ?? 0,
      blockedBy: [...(blockedBy.get(r.id) ?? [])],
      coverUrl: coverUrlByTask.get(r.id) ?? null,
    }))
  }

  // Direct children (subtasks) of a task, for the task detail Subtasks tab.
  // Each subtask is a full task row plus its own assignees so the panel can
  // edit assignee/due-date inline, independent of the parent (Plan §4).
  async listSubtasks(taskId: string, actor?: { id: string; role?: string }) {
    const [parent] = await this.db
      .select({ listId: tasks.listId })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1)
    // §2 per-item privacy: hide private subtasks the actor may not see.
    const visFilter = parent ? await this.taskVisibilityFilterForList(parent.listId, actor) : undefined
    const rows = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.parentTaskId, taskId), eq(tasks.isArchived, false), visFilter))
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

  /**
   * §V2-07 — download the list you are looking at.
   *
   * `[10:53]`–`[11:09]` "Customize pe aap click karoge — ab yeh dekh rahe ho:
   * EXPORT VIEW … aur aap is ko download kar lo … woh aap ko COLUMN mein list
   * de dega, har cheez." Frame `10:57` shows the panel: a file format, a "What
   * to export" choice of Visible columns / Task Names only / All columns, and
   * Download.
   *
   * What existed was `GET /export/csv/tasks`: the WHOLE WORKSPACE, seven fixed
   * columns, behind `WorkspaceAdminGuard`. A member standing on a list could
   * not download it at all, and an admin who did got every task in every list
   * regardless of the view, its filters, or its sort.
   *
   * Built on `getTasksByList` rather than its own query, deliberately: the
   * export is then the same read the list itself performs, including the
   * per-item visibility filter. A separate query would be free to drift, and
   * the way it would drift is by exporting rows the person cannot see on
   * screen.
   *
   * `includeArchived` and `includeClosed` are here for the same reason. The
   * toolbar has an "Archived" filter and a "Closed" toggle (`[11:32]`, `[11:37]`),
   * and an export that ignored them would hand back a different set of rows
   * than the screen it was launched from — which is the one thing this endpoint
   * exists not to do.
   */
  async exportListView(
    listId: string,
    actor: { id: string; role?: string },
    opts: {
      columns?: 'names' | 'visible' | 'all'
      fields?: string[]
      includeSubtasks?: boolean
      includeArchived?: boolean
      includeClosed?: boolean
      format?: ExportFormat
      dateFormat?: DateFormat
      timeFormat?: TimeFormat
      /**
       * §V2-07 / §V2-13 `[10:42]`–`[10:49]` — WHICH view is being downloaded.
       *
       * `'board'` is a different artifact, not the same rows with a different
       * name on the button: the sheet leads with the board column each task is
       * sitting in and the rows come out column by column, which is what makes
       * "board view download" worth having and worth paying for. `'list'` (the
       * default, and anything unrecognised) is the free export that has always
       * been here and must keep working untouched.
       */
      view?: 'list' | 'board'
    } = {},
  ) {
    const all = await this.getTasksByList(
      listId,
      { includeSubtasks: opts.includeSubtasks ?? false, includeArchived: opts.includeArchived ?? false },
      actor,
    )
    /*
     * "Closed" is the status CATEGORY, not the archive flag — a task can be
     * complete without being archived, and the list hides the two separately.
     * `includeClosed` defaults to true so a plain `?columns=all` with no other
     * parameters still exports the whole list: the caller has to ask to lose
     * rows, never the other way round.
     */
    const rows =
      opts.includeClosed === false
        ? all.filter((t: Record<string, any>) => t.statusCategory !== 'closed')
        : all
    const [list] = await this.db.select({ name: lists.name }).from(lists).where(eq(lists.id, listId)).limit(1)

    const dateFormat = asDateFormat(opts.dateFormat)
    const timeFormat = asTimeFormat(opts.timeFormat)
    const date = (v: unknown) => formatDate(v, dateFormat, timeFormat)

    const COLUMNS: Array<{ key: string; header: string; read: (t: Record<string, any>) => unknown }> = [
      { key: 'title', header: 'Name', read: (t) => t.title },
      { key: 'status', header: 'Status', read: (t) => t.status },
      { key: 'assignees', header: 'Assignees', read: (t) => (t.assignees ?? []).map((a: any) => a.user?.displayName ?? a.user?.email).filter(Boolean).join(', ') },
      { key: 'priority', header: 'Priority', read: (t) => t.priority },
      { key: 'startDate', header: 'Start date', read: (t) => date(t.startDate) },
      { key: 'dueDate', header: 'Due date', read: (t) => date(t.dueDate) },
      { key: 'timeEstimate', header: 'Time estimate', read: (t) => t.timeEstimate },
      { key: 'labels', header: 'Tags', read: (t) => (t.labels ?? []).map((l: any) => l.name).filter(Boolean).join(', ') },
      { key: 'description', header: 'Description', read: (t) => t.description },
      { key: 'createdAt', header: 'Created', read: (t) => date(t.createdAt) },
      { key: 'id', header: 'ID', read: (t) => t.id },
    ]

    const mode = opts.columns ?? 'visible'
    const chosen =
      mode === 'names'
        ? COLUMNS.filter((c) => c.key === 'title')
        : mode === 'all'
          ? COLUMNS
          : // "Visible columns" is the view's own set, IN THE VIEW'S ORDER, when
            // the caller names one, and the list's default shape when it does not.
            opts.fields?.length
            ? opts.fields.map((k) => COLUMNS.find((c) => c.key === k)).filter((c): c is (typeof COLUMNS)[number] => Boolean(c))
            : COLUMNS.filter((c) => ['title', 'status', 'assignees', 'priority', 'dueDate'].includes(c.key))

    /*
     * CUSTOM FIELDS — `cf:<definition id>` in `fields`, or every one of the
     * list's in "All columns". Neither was ever exported: the view's own
     * columns never reached this method (the web sent no `fields`), and
     * `COLUMNS` has no custom field in it.
     */
    const custom = await this.exportCustomColumns(
      listId,
      rows as Array<Record<string, any>>,
      mode === 'all' ? null : mode === 'visible' ? (opts.fields ?? []).filter((k) => k.startsWith('cf:')).map((k) => k.slice(3)) : [],
      date,
    )

    // A `fields` list naming nothing we know would export an empty row per
    // task, which reads as "the list is empty" rather than "you asked for
    // columns that do not exist".
    const columns = chosen.length + custom.length > 0 ? [...chosen, ...custom] : COLUMNS.filter((c) => c.key === 'title')

    const name = list?.name ?? 'list'
    const format: ExportFormat = opts.format === 'xlsx' ? 'xlsx' : 'csv'

    /*
     * §V2-13 `[11:06]` — "agar yeh download karega to same layout mein jo hai
     * na, woh aap ko COLUMN mein list de dega". The board download is the board
     * flattened: the column a card is sitting in comes first, the rows arrive
     * grouped by column in the board's own left-to-right order, and only then
     * do the ordinary task columns follow.
     *
     * Sorted by the status's POSITION, not alphabetically and not by whatever
     * order the rows came back in — a board read out of order is a different
     * board, and "Complete" ahead of "In progress" is the kind of wrong that
     * still photographs correctly.
     */
    if (opts.view === 'board') {
      const statuses = await resolveEffectiveStatuses(this.db, listId)
      const byKey = new Map(statuses.map((s) => [s.key, s]))
      const rank = (t: Record<string, any>) => byKey.get(t.status)?.position ?? Number.MAX_SAFE_INTEGER
      const label = (t: Record<string, any>) => byKey.get(t.status)?.name ?? String(t.status ?? '')
      const ordered = [...rows].sort((a, b) => rank(a as any) - rank(b as any))
      const boardHeaders = ['Board column', ...columns.map((c) => c.header)]
      const boardCells = ordered.map((task) => [
        label(task as Record<string, any>),
        ...columns.map((c) => c.read(task as Record<string, any>)),
      ])
      return {
        name,
        count: ordered.length,
        format,
        extension: format === 'xlsx' ? 'xlsx' : 'csv',
        contentType:
          format === 'xlsx'
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : 'text/csv; charset=utf-8',
        body: format === 'xlsx' ? toXlsx(name, boardHeaders, boardCells) : toCsv(boardHeaders, boardCells),
      }
    }

    const headers = columns.map((c) => c.header)
    const cells = rows.map((task) => columns.map((c) => c.read(task as Record<string, any>)))

    return {
      name,
      count: rows.length,
      format,
      extension: format === 'xlsx' ? 'xlsx' : 'csv',
      contentType:
        format === 'xlsx'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'text/csv; charset=utf-8',
      body: format === 'xlsx' ? toXlsx(name, headers, cells) : toCsv(headers, cells),
    }
  }

  /**
   * The export's custom-field columns: each asked-for definition (all of the
   * list's when `ids` is null), in the order asked, read per task through
   * `CustomFieldsService.getValuesForTask` — the method the task's own field
   * panel uses — so a formula or an automatic progress exports the number the
   * screen shows, not a second computation of it.
   */
  private async exportCustomColumns(
    listId: string,
    rows: Array<Record<string, any>>,
    ids: string[] | null,
    date: (v: unknown) => string | null,
  ): Promise<Array<{ key: string; header: string; read: (t: Record<string, any>) => unknown }>> {
    if (!this.customFields || rows.length === 0 || (ids && ids.length === 0)) return []
    const ctx = await this.resolveWorkspaceForList(listId)
    if (!ctx) return []
    type Read = Awaited<ReturnType<CustomFieldsService['getValuesForTask']>>
    const perTask = new Map<string, Read>()
    for (let i = 0; i < rows.length; i += 10) {
      const chunk = rows.slice(i, i + 10)
      const reads = await Promise.all(chunk.map((t) => this.customFields!.getValuesForTask(ctx.workspaceId, t.id as string)))
      chunk.forEach((t, j) => perTask.set(t.id as string, reads[j]))
    }
    const defsById = new Map<string, Read[number]['definition']>()
    for (const read of perTask.values()) for (const { definition } of read) defsById.set(definition.id, definition)
    const defs = ids
      ? ids.map((id) => defsById.get(id)).filter((d): d is Read[number]['definition'] => Boolean(d))
      : [...defsById.values()].sort((a, b) => a.position - b.position)
    if (defs.length === 0) return []

    // Names for the ids that people, tasks and files fields hold — one query each.
    const idsOf = (type: string) =>
      [...new Set([...perTask.values()].flatMap((read) =>
        read.filter((r) => r.definition.type === type && defs.some((d) => d.id === r.definition.id)).flatMap((r) => (Array.isArray(r.value) ? (r.value as string[]) : [])),
      ))]
    const peopleIds = idsOf('people')
    const taskIds = idsOf('tasks')
    const fileIds = idsOf('files')
    const people = peopleIds.length
      ? await this.db.select({ id: users.id, name: users.displayName, email: users.email }).from(users).where(inArray(users.id, peopleIds))
      : []
    const titles = taskIds.length ? await this.db.select({ id: tasks.id, title: tasks.title }).from(tasks).where(inArray(tasks.id, taskIds)) : []
    const files = fileIds.length
      ? await this.db.select({ id: taskAttachments.id, name: taskAttachments.fileName }).from(taskAttachments).where(inArray(taskAttachments.id, fileIds))
      : []
    const personName = new Map(people.map((p) => [p.id, p.name || p.email]))
    const taskTitle = new Map(titles.map((t) => [t.id, t.title]))
    const fileName = new Map(files.map((f) => [f.id, f.name]))

    const show = (def: Read[number]['definition'], value: unknown): unknown => {
      if (value === null || value === undefined) return ''
      const options = (def.options as Array<{ label: string; value: string }> | null) ?? []
      const label = (v: string) => options.find((o) => o.value === v)?.label ?? v
      const list = Array.isArray(value) ? (value as string[]) : []
      switch (def.type) {
        case 'date':
          return date(value)
        case 'checkbox':
          return value === true ? 'Yes' : 'No'
        case 'dropdown':
          return label(String(value))
        case 'labels':
          return list.map(label).join(', ')
        case 'people':
          return list.map((id) => personName.get(id) ?? id).join(', ')
        case 'tasks':
          return list.map((id) => taskTitle.get(id) ?? id).join(', ')
        case 'files':
          return list.map((id) => fileName.get(id) ?? id).join(', ')
        case 'voting':
          return list.length
        case 'signature':
          return value ? 'Signed' : ''
        default:
          // text, long text, url, email, phone, location, t-shirt size — and the
          // numbers: number, money, rating, progress (either kind), formula.
          return value
      }
    }
    return defs.map((def) => ({
      key: `cf:${def.id}`,
      header: def.name,
      read: (t: Record<string, any>) => show(def, perTask.get(t.id as string)?.find((r) => r.definition.id === def.id)?.value),
    }))
  }

  /**
   * §V2-13, frame `09:26` — TEAM VIEW's rollup, computed on the SERVER.
   *
   *   `[09:26]` "Is ke baad TEAM VIEW — yeh cheez ke liye humein of course BUY
   *   karna parega."
   *
   * This exists so the paywall is a paywall. Team View used to be arithmetic
   * the browser did over rows it already had, which means every possible gate
   * on it was a gate on a `<div>` — switch the flag off in devtools and the
   * feature is back. A blocked workspace now gets a 403 from here and there is
   * nothing on the client to un-hide.
   *
   * A task with several assignees is on EACH of their plates, so the rows
   * deliberately do not sum to the list: the question a workload board answers
   * is "what is on this person's plate", and shared work is on both.
   */
  async getTeamRollup(
    listId: string,
    actor: { id: string; role?: string },
    opts: { includeArchived?: boolean; unassignedLabel?: string } = {},
  ) {
    const tasksInList = await this.getTasksByList(
      listId,
      { includeSubtasks: false, includeArchived: opts.includeArchived ?? false },
      actor,
    )
    const unassigned = opts.unassignedLabel || 'Nobody yet'
    const by = new Map<string, { name: string; tasks: Array<{ id: string; title: string; statusCategory: string }> }>()
    for (const task of tasksInList as Array<Record<string, any>>) {
      const owners: Array<{ id: string; name: string }> = (task.assignees ?? []).length
        ? (task.assignees as Array<any>).map((a) => ({
            id: a.userId,
            name: a.user?.displayName || a.user?.email || unassigned,
          }))
        : [{ id: '__none__', name: unassigned }]
      for (const owner of owners) {
        const row = by.get(owner.id) ?? { name: owner.name, tasks: [] }
        row.tasks.push({ id: task.id, title: task.title, statusCategory: task.statusCategory })
        by.set(owner.id, row)
      }
    }
    return [...by.entries()]
      .map(([id, row]) => {
        const done = row.tasks.filter((x) => x.statusCategory === 'closed').length
        return {
          id,
          name: row.name,
          done,
          total: row.tasks.length,
          // Rounded once, here, so a bar and its caption cannot disagree.
          pct: row.tasks.length ? Math.round((done / row.tasks.length) * 100) : 0,
          tasks: row.tasks.map((x) => ({ id: x.id, title: x.title })),
        }
      })
      // Busiest first, but nobody-in-particular last whatever its size: it is a
      // gap to close, not a colleague to compare against.
      .sort((a, b) => (a.id === '__none__' ? 1 : b.id === '__none__' ? -1 : b.total - a.total))
  }

  async getTask(taskId: string, reader?: { id: string; role?: string | null }) {
    const row = await this.db.query.tasks.findFirst({
      where: eq(tasks.id, taskId),
      with: {
        assignees: { with: { user: PUBLIC_USER_WITH } },
        subtasks:  { where: eq(tasks.isArchived, false), orderBy: asc(tasks.position) },
        creator:   PUBLIC_USER_WITH,
      },
    })
    if (!row) return null

    /*
     * WHAT THIS TASK MAY SHOW FROM ELSEWHERE: only rows in its own workspace.
     * Its parent, subtasks, dependencies and labels are all other rows, and
     * until the write paths checked, any of them could be another tenant's —
     * so a task was a window into a workspace its reader never joined. The
     * writes refuse that now; this is their read-side twin, for rows that took
     * a foreign reference before they did, as the cover's signing check is.
     */
    const home = await this.resolveWorkspaceForList(row.listId)
    if (!home) return null
    const homeWorkspaceId = home.workspaceId
    if (row.subtasks.length > 0) {
      const own = await this.db
        .select({ id: tasks.id })
        .from(tasks)
        .innerJoin(lists, eq(lists.id, tasks.listId))
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(and(eq(tasks.parentTaskId, taskId), eq(spaces.workspaceId, homeWorkspaceId)))
      const ownIds = new Set(own.map((r) => r.id))
      row.subtasks = row.subtasks.filter((st) => ownIds.has(st.id))
    }

    const [labelRows, watcherRows, checklistRows, dependencyRows, attachmentRows] = await Promise.all([
      this.db
        .select({ label: labels })
        .from(taskLabelAssignments)
        .innerJoin(labels, eq(labels.id, taskLabelAssignments.labelId))
        .where(and(eq(taskLabelAssignments.taskId, taskId), eq(labels.workspaceId, homeWorkspaceId))),
      this.db
        .select({ watcher: taskWatchers, user: PUBLIC_USER_COLUMNS })
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
        .innerJoin(lists, eq(lists.id, tasks.listId))
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(and(eq(taskDependencies.taskId, taskId), eq(spaces.workspaceId, homeWorkspaceId))),
      this.db.select().from(taskAttachments).where(eq(taskAttachments.taskId, taskId)),
    ])

    /*
     * A related task is shown only to a reader who may open it. The row joined
     * here is the related task's WHOLE row, and it went to whoever read this
     * task: measured, a member's own task handed them the title and the
     * description of a task in a space they are refused, in each dependency
     * that named it (`found-23-sep/related-tasks-ignore-private-containers`).
     * The ones left out are counted, so a dependency they cannot see is still
     * known to be there. No reader — an internal caller — keeps them all.
     */
    const readableRelated = reader
      ? await readableTaskIds(this.db, homeWorkspaceId, reader.id, dependencyRows.map((d) => d.related.id), reader.role)
      : null
    const visibleDependencies = readableRelated ? dependencyRows.filter((d) => readableRelated.has(d.related.id)) : dependencyRows

    // "Subtask of <parent>" needs a name to show, and getTask only carries the id.
    const [parent] = row.parentTaskId
      ? await this.db
          .select({ id: tasks.id, title: tasks.title })
          .from(tasks)
          .innerJoin(lists, eq(lists.id, tasks.listId))
          .innerJoin(projects, eq(projects.id, lists.projectId))
          .innerJoin(spaces, eq(spaces.id, projects.spaceId))
          .where(and(eq(tasks.id, row.parentTaskId), eq(spaces.workspaceId, homeWorkspaceId)))
          .limit(1)
      : []

    // The type's label and icon, not just its id — the header renders it inline
    // and should not need a second round trip to know what it says.
    const [taskType] = row.taskTypeId
      ? await this.db
          .select({ id: taskTypes.id, name: taskTypes.name, icon: taskTypes.icon, color: taskTypes.color })
          .from(taskTypes)
          .where(eq(taskTypes.id, row.taskTypeId))
          .limit(1)
      : []

    return {
      ...row,
      /*
       * §V2-09 — one field the banner can actually render, resolved here so
       * every caller does not have to know the difference.
       *
       * A stored image is a KEY and needs presigning; a linked one is already a
       * URL and must be passed through untouched. Task attachments conflate the
       * two — a hyperlink is written into `storage_key` and read back through
       * `getObjectUrl`, which produces `${CDN}/https://…` — and this is the
       * shape that avoids repeating it. Null when the cover is a colour, or
       * when there is none.
       */
      // Signed only when the key is this task's own object — the read-side twin
      // of the check in updateTask, for rows written before it existed.
      coverUrl: row.coverStorageKey
        ? this.r2.configured && isTaskOwnObjectKey(row.coverStorageKey, row.id)
          ? await this.r2.getObjectUrl(row.coverStorageKey)
          : null
        : row.coverImageUrl ?? null,
      parent: parent ?? null,
      taskType: taskType ?? null,
      defaultBillable: await this.projectDefaultBillable(taskId),
      labels: labelRows.map((l) => l.label),
      watchers: watcherRows.map((w) => ({ ...w.watcher, user: w.user })),
      checklists: checklistRows,
      dependencies: visibleDependencies,
      hiddenDependencies: dependencyRows.length - visibleDependencies.length,
      attachments: attachmentRows,
    }
  }

  async listAttachments(taskId: string, actorId: string) {
    // Returns working signed R2 download URLs — gate on task read access so a
    // caller can't enumerate another workspace's / private container's files by
    // guessing task ids (IDOR).
    await this.assertTaskReadAccess(taskId, actorId)
    const rows = await this.db.select().from(taskAttachments).where(eq(taskAttachments.taskId, taskId))
    return Promise.all(rows.map(async (row) => ({
      id: row.id,
      fileName: row.fileName,
      fileSize: row.sizeBytes,
      mimeType: row.contentType,
      uploadedBy: row.uploadedById,
      createdAt: row.createdAt,
      storageKey: row.storageKey,
      kind: attachmentKind(row.storageKey),
      url: await this.attachmentUrl(row.storageKey),
    })))
  }

  /**
   * The URL an attachment row is fetched from — ONE rule, for the three places
   * a row is turned into a link (this list, the row `addAttachment` returns,
   * and the files on comments).
   *
   * NO KEY, NO URL — and the store is what made this visible. A row exists from
   * the moment the upload is recorded, and a file still arriving has an EMPTY
   * `storage_key`. With a store configured, `getObjectUrl('')` mints a perfectly
   * good presigned URL for an object that does not exist, so the card stopped
   * saying the clip was on its way and started offering a link to nothing — a
   * signed URL to a missing object looks live until it is pressed.
   * `clip-created-card` caught it the day the lanes got an object store.
   *
   * A LINK IS HANDED BACK AS IT IS. "Attach by link" stores the URL in
   * `storage_key`, and signing it produced `${CDN}/https://…` or a presigned GET
   * for a key that does not exist: every linked attachment's href was dead. See
   * `isLinkAttachmentKey`.
   *
   * These were three copies of one ternary; a fourth rule added to one of them
   * would have been the duplicated list again.
   */
  private async attachmentUrl(storageKey: string | null | undefined): Promise<string | null> {
    if (!storageKey) return null
    if (isLinkAttachmentKey(storageKey)) return storageKey
    return this.r2.configured ? this.r2.getObjectUrl(storageKey) : storageKey
  }

  async addAttachment(
    taskId: string,
    actorId: string,
    data: { fileName: string; url?: string; storageKey?: string; contentType?: string; sizeBytes?: number },
  ) {
    const ctx = await this.assertTaskWriteAccess(taskId, actorId)
    // Only an uploaded file carries a mandatory declared byte size. An external
    // hyperlink attachment (url present, no storageKey) has no size to validate,
    // so requiring one here wrongly 400'd every "attach by link".
    if (data.storageKey != null || data.url == null) {
      this.assertAttachmentSize(data.sizeBytes)
    }

    // Cross-tenant object-reference guard. A client-supplied `storageKey` must
    // sit under THIS task's own R2 upload prefix (exactly what
    // createAttachmentUploadUrl signs) — otherwise a caller could register an
    // attachment pointing at another workspace's object and get a signed URL for
    // it. The `url` path stays open for genuine external hyperlinks but must be a
    // real http(s) URL, so it can't smuggle a raw storage key past this check.
    //
    // THE SHAPE, NOT THE PREFIX. This was `startsWith(prefix)`, and a prefix
    // check does not hold on a public-CDN deployment: `getObjectUrl` returns
    // `${publicUrl}/${key}` unencoded, a browser collapses `..` in a URL path,
    // and `<prefix>../../../../workspaces/<other>/…` passes `startsWith` and
    // fetches another workspace's object. See task-object-keys.ts.
    if (data.storageKey != null) {
      if (!isTaskUploadKey(data.storageKey, ctx.workspaceId, taskId)) {
        throw new BadRequestException('storageKey must reference this task’s own upload prefix')
      }
    } else if (data.url != null && !isHttpUrl(data.url)) {
      throw new BadRequestException('A file attachment requires a storageKey from the presign step')
    }

    const [task] = await this.db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
    if (!task) throw new NotFoundException('Task not found')
    const storageKey = data.storageKey ?? data.url
    if (!storageKey) throw new BadRequestException('storageKey is required')
    return this.recordAttachment(taskId, actorId, {
      fileName: data.fileName,
      contentType: data.contentType ?? 'application/octet-stream',
      sizeBytes: data.sizeBytes ?? 0,
      storageKey,
    })
  }

  /**
   * §V2-S05 frame `05:25`: **Create a task** on the "Clip created!" card.
   * ClickUp's help says it creates "a new task and attach[es] the Clip".
   *
   * THE CARD USED TO PASTE A LINK INTO THE DESCRIPTION: a URL signed for 24
   * hours, with no key kept. The next day the task pointed at nothing and had
   * no way back to the recording.
   *
   * SO THE TASK GETS THE CLIP ITSELF, as an attachment it owns: a copy of one
   * of this workspace's clips, made inside the bucket, under the task's own
   * upload prefix. From there it is every other attachment. It is signed when
   * the task is read, it goes wherever the task's access rules let it, and
   * deleting it deletes the task's copy and never the library's. A reference
   * to the library key would have given the object two owners: removing the
   * attachment would have deleted the clip from the library, and deleting the
   * clip would have left the task signing a key with nothing behind it.
   *
   * Nothing new is trusted. The key is one of this workspace's clips by shape
   * (`clip-keys.ts`), the caller must be able to write to the task, and the
   * size is the stored object's, so the attachment limit holds as it does for
   * an upload.
   */
  async attachClip(taskId: string, actorId: string, data: { storageKey: string; fileName?: string }) {
    const ctx = await this.assertTaskWriteAccess(taskId, actorId)
    if (!this.r2.configured) throw new BadRequestException('R2 storage is not configured')
    if (!isWorkspaceClipKey(data.storageKey, ctx.workspaceId)) {
      throw new BadRequestException('storageKey must be one of this workspace’s clips')
    }
    let head: Awaited<ReturnType<R2Service['headObject']>>
    try {
      head = await this.r2.headObject(data.storageKey)
    } catch (err) {
      const name = (err as { name?: string } | null)?.name
      if (name === 'NotFound' || name === 'NoSuchKey') throw new NotFoundException('Clip not found')
      throw err
    }
    const sizeBytes = Number(head.ContentLength ?? 0)
    this.assertAttachmentSize(sizeBytes)
    const contentType = head.ContentType || 'video/webm'
    const fileName =
      (data.fileName?.trim() || head.Metadata?.title || data.storageKey.split('/').pop() || 'clip.webm').slice(0, 255)
    const storageKey = `workspaces/${ctx.workspaceId}/tasks/${taskId}/attachments/${Date.now()}-${safeFileName(fileName)}`
    await this.r2.copyObject(data.storageKey, storageKey, {
      contentType,
      metadata: { uploadedby: actorId, taskid: taskId },
    })
    return this.recordAttachment(taskId, actorId, { fileName, contentType, sizeBytes, storageKey })
  }

  /**
   * The row, its activity entry and its search entry, however the object got
   * there. `addAttachment` records what a client uploaded or linked;
   * `attachClip` records a copy it made itself.
   */
  private async recordAttachment(
    taskId: string,
    actorId: string,
    data: { fileName: string; contentType: string; sizeBytes: number; storageKey: string },
  ) {
    const [row] = await this.db
      .insert(taskAttachments)
      .values({
        taskId,
        uploadedById: actorId,
        fileName: data.fileName,
        contentType: data.contentType,
        sizeBytes: data.sizeBytes,
        storageKey: data.storageKey,
      })
      .returning()
    await this.logActivity({
      taskId,
      actorId,
      action: 'attachment_added',
      meta: { attachmentId: row.id, fileName: row.fileName },
    })
    // Make the uploaded file searchable under the `file` entity type (Plan §11.1).
    void this.indexAttachmentInSearch(row, taskId)
    return {
      id: row.id,
      fileName: row.fileName,
      fileSize: row.sizeBytes,
      mimeType: row.contentType,
      uploadedBy: row.uploadedById,
      createdAt: row.createdAt,
      storageKey: row.storageKey,
      kind: attachmentKind(row.storageKey),
      url: await this.attachmentUrl(row.storageKey),
    }
  }

  async removeAttachment(taskId: string, attachmentId: string, actorId: string) {
    await this.assertTaskWriteAccess(taskId, actorId)
    const [attachment] = await this.db
      .select({
        id: taskAttachments.id,
        uploadedById: taskAttachments.uploadedById,
        storageKey: taskAttachments.storageKey,
      })
      .from(taskAttachments)
      .where(and(eq(taskAttachments.id, attachmentId), eq(taskAttachments.taskId, taskId)))
      .limit(1)
    if (!attachment) throw new NotFoundException('Attachment not found')
    // §4.5 — deletion is restricted to the uploader OR a workspace moderator
    // (mirrors deleteComment). A plain task-writer must not be able to remove
    // another member's attachment.
    if (
      attachment.uploadedById !== actorId &&
      !(await this.isTaskWorkspaceModerator(taskId, actorId))
    ) {
      throw new ForbiddenException('Only the uploader or a workspace admin can delete this attachment')
    }
    await this.db
      .delete(taskAttachments)
      .where(and(eq(taskAttachments.id, attachmentId), eq(taskAttachments.taskId, taskId)))
    /*
     * A COVER PICKED FROM THIS ATTACHMENT GOES WITH IT. The cover picker's
     * Attachments tab makes an image attachment the cover by its key, and this
     * method deletes the object below. It used to leave the key on the task, so
     * the banner and the board card went on signing a key with nothing behind
     * it: a broken image behind a live-looking URL. In ClickUp a card's cover is
     * the first image attached or one pinned from the attachments, so it IS the
     * attachment, and deleting the attachment takes the cover with it.
     *
     * Only a stored key. A LINK cover is its own column, pointing at an image
     * that deleting the attachment does not remove.
     */
    if (attachment.storageKey && !isLinkAttachmentKey(attachment.storageKey)) {
      const uncovered = await this.db
        .update(tasks)
        .set({ coverStorageKey: null, updatedAt: new Date() })
        .where(and(eq(tasks.id, taskId), eq(tasks.coverStorageKey, attachment.storageKey)))
        .returning({ listId: tasks.listId })
      // The board draws the list, and refetches it on the list's events; a
      // card left holding the old URL is the same broken image, one step later.
      if (uncovered[0]) {
        const { listId } = uncovered[0]
        this.realtime.emitToList(listId, { type: 'task.updated', listId, taskId, patch: { coverStorageKey: null } })
        this.realtime.emitToTask(taskId, { type: 'task.updated', listId, taskId, patch: { coverStorageKey: null } })
      }
    }
    // A link has no object behind it, and a file still arriving has no key:
    // neither is anything to delete from the bucket.
    if (this.r2.configured && attachment.storageKey && !isLinkAttachmentKey(attachment.storageKey)) {
      try {
        await this.r2.deleteObject(attachment.storageKey)
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
      coverStorageKey: string | null
      coverImageUrl: string | null
      coverOffsetY: number
      isArchived: boolean
      isMilestone: boolean
      visibility: 'public' | 'private'
      parentTaskId: string | null
    }>,
  ) {
    // FIRST, before anything reads it: only fields this update may write. The
    // parameter's type is a promise the runtime never kept — both the route and
    // this method spread what arrived, so every column of the row was writable.
    // See task-update-fields.ts. Everything below, including the activity log,
    // the webhook payload and the realtime event, now sees the filtered patch.
    patch = pickUpdatable(patch)
    // A change of status — with the position a board drag carries — is what a
    // "comment" space lets an assignee make; anything else needs "edit".
    const statusOnly = Object.keys(patch).every((k) => k === 'status' || k === 'position')
    const access = await this.assertTaskWriteAccess(taskId, actorId, { level: statusOnly ? 'comment' : 'edit' })

    /*
     * §V2-09 — the cover fields are spread into the update unchecked, so they
     * are checked here.
     *
     * `coverImageUrl` is the picker's Link tab: an image somewhere else on the
     * web, stored as given and rendered as given. Anything that is not an
     * http(s) URL would either render as a broken image or, worse, run — a
     * `javascript:` cover is a stored XSS on every viewer of the task.
     */
    if (patch.coverImageUrl != null && !/^https?:\/\//i.test(patch.coverImageUrl)) {
      throw new BadRequestException('A cover link must be an http(s) image URL')
    }
    // Reposition is a percentage for `object-position`; outside 0–100 it would
    // silently push the image out of its own banner.
    if (patch.coverOffsetY != null && (!Number.isFinite(patch.coverOffsetY) || patch.coverOffsetY < 0 || patch.coverOffsetY > 100)) {
      throw new BadRequestException('Cover position must be between 0 and 100')
    }
    /*
     * A STORED cover is one of this task's own objects — and this was the one
     * cover field nothing checked. `getTask` and the list rows sign
     * `coverStorageKey` for whoever reads the task, so accepting any key here
     * made this route a signing oracle: point your cover at another workspace's
     * attachment and read back a working URL to it. The Upload tab presigns
     * through the task's own attachment route and the Attachments tab offers
     * the task's own attachments, so every key a real client sends passes.
     *
     * A shape match, not `startsWith` — see task-object-keys.ts for the `..`
     * that walks a prefix check straight into another workspace.
     */
    if (patch.coverStorageKey != null && !isTaskOwnObjectKey(patch.coverStorageKey, taskId, access.workspaceId)) {
      throw new BadRequestException('A cover image must be one of this task’s own attachments')
    }
    const [before] = await this.db.select().from(tasks).where(eq(tasks.id, taskId))
    if (!before) throw new NotFoundException('Task not found')

    // Re-parenting: null promotes a subtask to a task of its own. Anything else
    // has to keep the one-level rule that createTask enforces, and must not
    // make the task its own ancestor.
    if (patch.parentTaskId !== undefined && patch.parentTaskId !== null) {
      if (patch.parentTaskId === taskId) {
        throw new BadRequestException('A task cannot be its own parent')
      }
      const [parent] = await this.db
        .select({ id: tasks.id, parentTaskId: tasks.parentTaskId })
        .from(tasks)
        .where(eq(tasks.id, patch.parentTaskId))
        .limit(1)
      if (!parent) throw new NotFoundException('Parent task not found')
      if (parent.parentTaskId) {
        throw new BadRequestException('Subtasks can only be nested one level deep')
      }
      // Moving a task that already has children under a parent would create a
      // second level, so refuse it rather than silently orphaning them.
      const [child] = await this.db
        .select({ id: tasks.id })
        .from(tasks)
        .where(eq(tasks.parentTaskId, taskId))
        .limit(1)
      if (child) {
        throw new BadRequestException('A task with subtasks cannot become a subtask itself')
      }
      await this.assertParentInWorkspace(patch.parentTaskId, access.workspaceId, actorId)
    }

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
          // The task IS blocked, so the refusal stands whoever the blockers
          // are; but it named each one by title and id, and for a member that
          // was a way to read a task of a space they are refused (measured).
          // Named where the actor may open them, counted where not.
          const seen = await readableTaskIds(this.db, access.workspaceId, actorId, blockers.map((b) => b.id))
          const named = blockers.filter((b) => seen.has(b.id)).map((b) => `${b.title} (${b.id})`)
          const unseen = blockers.length - named.length
          if (unseen > 0) named.push(`${unseen} ${unseen === 1 ? 'task' : 'tasks'} you cannot open`)
          throw new BadRequestException(`Task is blocked by open dependencies: ${named.join(', ')}`)
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

    // §1.1 — the third way these two can be changed. The task sheet has a
    // diamond toggle that PATCHes isMilestone directly, and the type picker
    // sits next to it: without this, using one leaves the other stale and the
    // Milestone type filter cannot find a task the app is drawing as a
    // milestone. Only fills in a *missing* type — a task deliberately typed as
    // something else keeps that type and just carries the marker.
    // (This path cannot set the type itself — that is PATCH /tasks/:id/task-type
    //  — so there is no caller intent to preserve here, only consistency.)
    if (set.isMilestone === true && !before.taskTypeId) {
      const milestoneType = await this.milestoneTypeForList(before.listId)
      if (milestoneType) set.taskTypeId = milestoneType
    }
    if (set.isMilestone === false && before.taskTypeId) {
      if (await this.typeIsMilestone(before.taskTypeId)) set.taskTypeId = null
    }

    /*
     * §V2-08 `[15:27]` — description history, recorded BEFORE the row changes.
     *
     * It has to happen here, between reading `before` and writing `set`,
     * because what history keeps is the text that is about to be lost. A
     * moment later it is unrecoverable.
     */
    if ('description' in patch && patch.description !== before.description) {
      await this.recordDescriptionRevision(taskId, actorId, before.description ?? null)
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
      const hydrated = await this.getTask(taskId, { id: actorId })
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

    return this.getTask(taskId, { id: actorId })
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
      // Cross-list move: relocate every selected task into this list
      // (Plan §5.1 bulk "Move to list").
      listId: string
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

    // Optional cross-list move (Plan §5.1 bulk "Move to list"). Validate the
    // target list exists and capture its workspace up front so we can reject
    // moves that would cross a workspace boundary, and append moved tasks after
    // whatever's already in the destination list.
    const moveListId = typeof patch.listId === 'string' && patch.listId ? patch.listId : undefined
    let moveTargetWorkspaceId: string | null = null
    let movePosition = 0
    if (moveListId) {
      const target = await this.resolveWorkspaceForList(moveListId)
      if (!target) throw new NotFoundException('Target list not found')
      moveTargetWorkspaceId = target.workspaceId
      const [maxRow] = await this.db
        .select({ maxPos: sql<number>`coalesce(max(${tasks.position}), -1)` })
        .from(tasks)
        .where(eq(tasks.listId, moveListId))
      movePosition = (maxRow?.maxPos ?? -1) + 1
    }

    if (Object.keys(fieldPatch).length === 0 && !hasRelationshipOps && !moveListId) {
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
            await this.removeDependency(taskId, existing.id, actorId)
          }
        }
        if (moveListId) {
          const moveCtx = await this.assertTaskWriteAccess(taskId, actorId)
          if (moveTargetWorkspaceId && moveCtx.workspaceId !== moveTargetWorkspaceId) {
            throw new BadRequestException('Cannot move a task to a list in a different workspace')
          }
          // moveTask logs a 'moved' activity + emits realtime events, so the
          // bulk move stays audit-aware exactly like the single-task move.
          if (moveCtx.listId !== moveListId) {
            next = await this.moveTask(taskId, actorId, moveListId, movePosition++)
          }
        }
        /*
         * READ AS THE CALLER. This re-read had no reader, which is how an
         * internal caller reads a task, so every related task came back whole:
         * measured on lane 1, a member assigning the admin to their own task
         * was answered with a private space's task, its title and its
         * description (`found-24-sep/bulk-edit-answers-unfiltered`).
         */
        if (!next || hasRelationshipOps) {
          next = await this.getTask(taskId, { id: actorId })
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

  /**
   * ARCHIVE. The name is `deleteTask` and the route is `DELETE /tasks/:id`
   * because that is what they have always been; what the method does is archive
   * — `isArchived`, `archivedAt`, activity `archived`, listed under
   * `GET /workspaces/:id/archived-tasks`, restored by `POST /tasks/:id/restore`,
   * and kept for good. The frame's other row, Delete, is `binTask` below.
   */
  async deleteTask(taskId: string, actorId: string, ipAddress?: string) {
    // allowArchived: deleting something already binned is a no-op, not a 409.
    await this.assertTaskWriteAccess(taskId, actorId, { allowArchived: true })
    // Managers can only delete within their own spaces (§3.3). Layered after the
    // general write-access check so admins/members keep their existing rights.
    await this.assertManagerDeleteScope(taskId, actorId)
    const [before] = await this.db.select().from(tasks).where(eq(tasks.id, taskId))
    if (!before) throw new NotFoundException('Task not found')
    /*
     * Archiving a task that is already in the bin would stamp `archivedAt` on
     * top of `deletedAt` and the row would then be listed under BOTH Archived
     * tasks and Trash — one deletion showing up as two. The bin is the stronger
     * state; leave it alone.
     */
    if (before.deletedAt) return { ok: true }
    await this.db
      .update(tasks)
      .set({ isArchived: true, archivedAt: new Date(), archivedById: actorId ?? null, updatedAt: new Date() })
      .where(eq(tasks.id, taskId))
    await this.logActivity({ taskId, actorId, action: 'archived' })
    this.realtime.emitToList(before.listId, { type: 'task.deleted', listId: before.listId, taskId })

    // Fire delete event
    const ctx = await this.resolveWorkspaceForList(before.listId)
    if (ctx) {
      // §13.3 — audit the container deletion (task archival) with actor + IP.
      await this.security.logAuditEvent({
        workspaceId: ctx.workspaceId,
        actorId,
        action: 'task.deleted',
        resourceType: 'task',
        resourceId: taskId,
        description: `Archived task "${before.title}"`,
        ipAddress,
      })
      void this.fireTaskEvent('task.deleted', ctx.workspaceId, { taskId, listId: before.listId }, {
        taskId,
        userId: actorId,
        projectId: ctx.projectId,
        listId: before.listId,
      })
    }
    // Remove from every connected calendar — fire-and-forget.
    void this.calendarSync.deleteEverywhere(taskId).catch(() => undefined)
    // …and out of the search index, for the same reason: a binned task is not
    // something anyone should find by searching, and leaving it there made the
    // index fill up with work that had been thrown away.
    void this.search.removeTask(taskId).catch(() => undefined)
    return { ok: true }
  }

  /**
   * §V2-08 frame `15:32` — **DELETE**, the red row under Archive.
   *
   * Not `deleteTask` with a different label. `deleteTask` archives: the task
   * keeps living under Settings → Archived tasks, for good, and nothing ever
   * removes it. This puts the task in the workspace **Trash**, the same surface
   * that already holds deleted spaces, folders, projects, lists and docs, where
   * it can be restored for `TRASH_RETENTION_DAYS` and is then hard-deleted by
   * the same nightly purge — or at once with "Delete forever".
   *
   * The two states are told apart by `deletedAt` and nothing else: the Trash
   * selects tasks on `deletedAt IS NOT NULL`, so archiving can never put a task
   * there and can never get one purged.
   *
   * `isArchived` goes true for both, deliberately. Every read path in the
   * product — lists, search, reports, planner, AI, calendar sync — hides a task
   * on that one flag, so a delete that left it false would take the task out of
   * nothing. What stays empty here is `archivedAt`/`archivedById`: those belong
   * to the other action, and the Trash's "Deleted by" column reads
   * `deletedById`, so filling both would make one deletion look like two.
   */
  async binTask(taskId: string, actorId: string, ipAddress?: string) {
    // allowArchived: an archived task can still be deleted — that is the whole
    // point of two states — and re-deleting a binned one is a no-op, not a 409.
    // Full edit: Edit archives and does not delete (`found-25-sep/full-edit-enforced-nowhere`).
    await this.assertTaskWriteAccess(taskId, actorId, { allowArchived: true, level: 'full' })
    // Managers can only delete within their own spaces (§3.3), exactly as for
    // archiving; a weaker check here would be a way around that one.
    await this.assertManagerDeleteScope(taskId, actorId)
    const [before] = await this.db.select().from(tasks).where(eq(tasks.id, taskId))
    if (!before) throw new NotFoundException('Task not found')
    // Idempotent: a second delete must not re-stamp the clock and hand the task
    // another thirty days in the bin.
    if (before.deletedAt) {
      return { ok: true, deletedAt: before.deletedAt.toISOString(), retentionDays: TRASH_RETENTION_DAYS }
    }

    const now = new Date()
    await this.db
      .update(tasks)
      .set({ isArchived: true, deletedAt: now, deletedById: actorId ?? null, updatedAt: now })
      .where(eq(tasks.id, taskId))
    await this.logActivity({ taskId, actorId, action: 'deleted' })
    this.realtime.emitToList(before.listId, { type: 'task.deleted', listId: before.listId, taskId })

    const ctx = await this.resolveWorkspaceForList(before.listId)
    if (ctx) {
      // §13.3 — audited apart from `task.deleted` (which archiving raises), so
      // the audit log can tell a reversible archive from a binning that has a
      // clock on it.
      await this.security.logAuditEvent({
        workspaceId: ctx.workspaceId,
        actorId,
        action: 'task.trashed',
        resourceType: 'task',
        resourceId: taskId,
        description: `Moved task "${before.title}" to the trash`,
        ipAddress,
      })
      void this.fireTaskEvent('task.deleted', ctx.workspaceId, { taskId, listId: before.listId }, {
        taskId,
        userId: actorId,
        projectId: ctx.projectId,
        listId: before.listId,
      })
    }
    // Same clean-up as archiving: off every connected calendar and out of the
    // search index. A task in the bin is not something anyone should find.
    void this.calendarSync.deleteEverywhere(taskId).catch(() => undefined)
    void this.search.removeTask(taskId).catch(() => undefined)
    return { ok: true, deletedAt: now.toISOString(), retentionDays: TRASH_RETENTION_DAYS }
  }

  /** Restore an archived (soft-deleted) task (Plan §13.4). */
  async restoreTask(taskId: string, actorId: string) {
    // allowArchived: this is the one operation that exists for binned tasks.
    await this.assertTaskWriteAccess(taskId, actorId, { allowArchived: true })
    // §3.3 — restore is the inverse of delete, so a manager must be scoped to
    // their own spaces here too; otherwise they could un-archive a task outside
    // their space that they were correctly blocked from deleting.
    await this.assertManagerDeleteScope(taskId, actorId)
    const [before] = await this.db.select().from(tasks).where(eq(tasks.id, taskId))
    if (!before) throw new NotFoundException('Task not found')
    /*
     * This un-archives. A task in the Trash is archived too (`binTask` sets
     * both), but it is also DELETED, with a purge date, and `deletedAt` is what
     * tells the two apart. Un-archiving it here would put it back in every
     * list while the Trash still offered to delete it forever: live and binned
     * at once. Restoring from the Trash is a different door, and it is the one
     * that clears `deletedAt`.
     */
    if (before.deletedAt) {
      throw new ConflictException('This task is in the trash. Restore it from Trash instead.')
    }
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
    // Binning took it out of the index, so restoring has to put it back —
    // otherwise a restored task would look fine everywhere except search,
    // where it would be permanently unfindable.
    void this.indexTaskInSearch(taskId)
    return row
  }

  /**
   * Move a task to another list.
   *
   * THIS CHECKED ONE SIDE OF THE MOVE. Write access to the task being moved,
   * then `listId: targetListId` with nothing asked about the target: not that
   * it existed, not that it was in the same workspace, not that the caller
   * could see it or make tasks in it. Any assignee could move their task into
   * a list in another tenant's workspace — one they do not belong to — or into
   * a space whose default permission is view-only, the door
   * `assertCanCreateInSpace` was put on the create path to shut. The bulk path
   * two hundred lines up already refused "moves that would cross a workspace
   * boundary"; this is the one-at-a-time route the Move dialog uses, and it had
   * none of that.
   *
   * So the target faces what creating a task in it would face:
   *   · the SAME workspace — a list elsewhere answers NOT FOUND rather than
   *     "different workspace", which would confirm a guessed id exists;
   *   · the space's create gate — `edit` or above, like any new task there;
   *   · private-container visibility — a list in a private space or project
   *     the caller cannot see is not a destination they can name.
   */
  async moveTask(taskId: string, actorId: string, targetListId: string, position: number) {
    if (typeof targetListId !== 'string' || !targetListId) {
      throw new BadRequestException('listId is required')
    }
    const access = await this.assertTaskWriteAccess(taskId, actorId)
    const [target] = await this.db
      .select({
        workspaceId: spaces.workspaceId,
        spaceId: spaces.id,
        spaceVisibility: spaces.visibility,
        projectId: projects.id,
        projectVisibility: projects.visibility,
      })
      .from(lists)
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(lists.id, targetListId))
      .limit(1)
    if (!target || target.workspaceId !== access.workspaceId) {
      throw new NotFoundException('Target list not found')
    }
    await assertCanCreateInSpace(this.db, { spaceId: target.spaceId, actorId, kind: 'task' })
    const [membership] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, target.workspaceId), eq(workspaceMembers.userId, actorId)))
      .limit(1)
    const canSee = await checkContainerAccess(this.db, target, { userId: actorId, workspaceRole: membership?.role })
    if (!canSee) throw new ForbiddenException('You do not have access to that list')

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
    return this.getTask(taskId, { id: actorId })
  }

  // --- Assignees -----------------------------------------------------------
  async addAssignee(taskId: string, userId: string, actorId: string) {
    await this.assertTaskWriteAccess(taskId, actorId, { level: 'comment' })
    await this.assertPersonCanSeeTask(taskId, userId, 'assignee')
    await this.db.insert(taskAssignees).values({ taskId, userId }).onConflictDoNothing()
    if (await this.notifications.autoFollowEnabled(userId)) {
      await this.db.insert(taskWatchers).values({ taskId, userId }).onConflictDoNothing()
    }
    await this.logActivity({ taskId, actorId, action: 'assigned', meta: { userId } })

    await this.announceAssignment({ taskId, assigneeId: userId, actorId })

    return this.getTask(taskId, { id: actorId })
  }

  /**
   * Tell everyone who should hear that a task now has an assignee.
   *
   * WHY THIS IS A METHOD AND NOT THE TAIL OF `addAssignee`. It used to be the
   * tail of `addAssignee`, which meant only the PATCH path did any of it.
   * `createTask` takes `assigneeIds` too, and it inserted the `task_assignees`
   * rows and stopped:
   *
   *     if (data.assigneeIds?.length) {
   *       await this.db.insert(taskAssignees).values(…)
   *     }
   *
   * No notification, no `task.assigned` event, no `task.assignee_changed`
   * automation. So assigning somebody from the create modal — which is the
   * ordinary way a task gets an assignee, not an edge case — put their name on
   * a task and never told them, left the "Task assignee changes" trigger
   * silent, and gave the realtime layer nothing to emit. The row in
   * `task_assignees` stood as evidence for an event that never happened, which
   * is the mirror defect exactly.
   *
   * Found by `video1-acceptance.mjs` while it was being taught to seed its own
   * inbox: the peer created a task assigned to the signed-in account, the API
   * answered 201, and `GET /notifications` stayed empty for fifteen seconds.
   *
   * Extracted rather than copied, because two assignment announcements that
   * have to be kept in step is the duplicated-list defect waiting to happen —
   * and this audit has already found six of those.
   */
  private async announceAssignment(params: {
    taskId: string
    assigneeId: string
    actorId: string
  }) {
    const { taskId, assigneeId, actorId } = params
    const [taskRow] = await this.db.select().from(tasks).where(eq(tasks.id, taskId))
    if (!taskRow) return
    const ctx = await this.resolveWorkspaceForList(taskRow.listId)
    if (!ctx) return

    void this.fireTaskEvent('task.assigned', ctx.workspaceId, { taskId, assigneeId }, {
      taskId,
      userId: actorId,
      projectId: ctx.projectId,
      listId: taskRow.listId,
      newValue: assigneeId,
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
        newValue: assigneeId,
      })
      .catch(() => {})

    // Don't notify someone they assigned themselves
    if (assigneeId !== actorId) {
      const workspaceName = await this.resolveWorkspaceName(ctx.workspaceId)
      void this.notifications.create({
        userId: assigneeId,
        workspaceId: ctx.workspaceId,
        actorId,
        type: 'task_assigned',
        title: `You were assigned "${taskRow.title}"`,
        target: { entityType: 'task', entityId: taskId, url: this.buildTaskUrl(ctx.workspaceId, ctx.spaceId, ctx.projectId, taskRow.listId, taskId) },
        emailContext: { taskTitle: taskRow.title, workspaceName },
      })
    }
    // §G10-6 — and everybody watching hears who it moved to.
    void this.notifyWatchersOfAssigneeChange({ taskId, actorId, subjectId: assigneeId, added: true })
  }

  /**
   * §G10-6 [12:21] — watchers learn WHO a task moved to, or off.
   *
   * `notifyTaskUpdate` covers status, priority, due date, title and
   * description, and never had an assignee branch — so the single most
   * consequential change on a task, the one that decides whose problem it is,
   * was the one nobody watching was told about. Being assigned notified you;
   * being removed notified you; everybody else found out by noticing.
   *
   * Deliberately NOT folded into `notifyTaskUpdate`: that reads a `before`
   * snapshot of scalar columns, and assignees are rows in another table. Wiring
   * them through it would mean loading assignees on every patch that touches a
   * title.
   *
   * The assignee and the actor are both excluded — each already has a
   * notification of their own, and two for one event reads as a bug.
   */
  private async notifyWatchersOfAssigneeChange(params: {
    taskId: string
    actorId: string
    subjectId: string
    added: boolean
  }) {
    try {
      const watcherRows = await this.db
        .select({ userId: taskWatchers.userId })
        .from(taskWatchers)
        .where(eq(taskWatchers.taskId, params.taskId))
      const watcherIds = [...new Set(watcherRows.map((w) => w.userId))].filter(
        (id) => id !== params.actorId && id !== params.subjectId,
      )
      if (watcherIds.length === 0) return

      const [taskRow] = await this.db
        .select({ id: tasks.id, title: tasks.title, listId: tasks.listId })
        .from(tasks)
        .where(eq(tasks.id, params.taskId))
        .limit(1)
      if (!taskRow) return
      const ctx = await this.resolveWorkspaceForList(taskRow.listId)
      if (!ctx) return

      const [subject] = await this.db
        .select({ displayName: users.displayName })
        .from(users)
        .where(eq(users.id, params.subjectId))
        .limit(1)
      const who = subject?.displayName ?? 'someone'
      const workspaceName = await this.resolveWorkspaceName(ctx.workspaceId)
      const url = this.buildTaskUrl(ctx.workspaceId, ctx.spaceId, ctx.projectId, taskRow.listId, taskRow.id)

      for (const userId of watcherIds) {
        void this.notifications.create({
          userId,
          workspaceId: ctx.workspaceId,
          actorId: params.actorId,
          type: 'task_updated',
          title: `"${taskRow.title}" was updated`,
          body: params.added ? `Assigned to ${who}.` : `${who} was removed.`,
          target: { entityType: 'task', entityId: taskRow.id, url },
          emailContext: { taskTitle: taskRow.title, workspaceName },
        })
      }
    } catch {
      // Best-effort, like every other fan-out here: a failed notification must
      // never undo the assignment that caused it.
    }
  }

  async removeAssignee(taskId: string, userId: string, actorId: string) {
    await this.assertTaskWriteAccess(taskId, actorId, { level: 'comment' })
    await this.db.delete(taskAssignees).where(and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.userId, userId)))
    await this.logActivity({ taskId, actorId, action: 'unassigned', meta: { userId } })

    // §2.2 — "kisi ne mera hi task kisi aur ko de diya aur mujhe REMOVE kar
    // diya to mujhe woh cheez show ho." Being taken off a task is otherwise
    // something you find out by noticing it is gone.
    if (userId !== actorId) {
      const [taskRow] = await this.db.select().from(tasks).where(eq(tasks.id, taskId))
      const ctx = taskRow ? await this.resolveWorkspaceForList(taskRow.listId) : null
      if (taskRow && ctx) {
        await this.notifications
          .create({
            userId,
            workspaceId: ctx.workspaceId,
            actorId,
            type: 'task_unassigned',
            title: taskRow.title,
            target: { entityType: 'task', entityId: taskId },
          })
          .catch(() => undefined)
      }
    }
    // §G10-6 — outside the `userId !== actorId` guard above: taking YOURSELF
    // off a task is still news to whoever is watching it.
    void this.notifyWatchersOfAssigneeChange({ taskId, actorId, subjectId: userId, added: false })
    return this.getTask(taskId, { id: actorId })
  }

  // --- Labels --------------------------------------------------------------
  async addLabel(taskId: string, labelId: string, actorId: string) {
    const access = await this.assertTaskWriteAccess(taskId, actorId)
    // A label is the workspace's own, and `getTask` hands back its name and
    // colour with the task — so another workspace's label id put that tenant's
    // label on this task, and on the screen of everybody who opens it.
    const [label] = await this.db.select({ workspaceId: labels.workspaceId }).from(labels).where(eq(labels.id, labelId)).limit(1)
    if (!label || label.workspaceId !== access.workspaceId) throw new NotFoundException('Label not found')
    await this.db.insert(taskLabelAssignments).values({ taskId, labelId }).onConflictDoNothing()
    await this.logActivity({ taskId, actorId, action: 'label_added', meta: { labelId } })
    return this.getTask(taskId, { id: actorId })
  }

  async removeLabel(taskId: string, labelId: string, actorId: string) {
    await this.assertTaskWriteAccess(taskId, actorId)
    await this.db
      .delete(taskLabelAssignments)
      .where(and(eq(taskLabelAssignments.taskId, taskId), eq(taskLabelAssignments.labelId, labelId)))
    await this.logActivity({ taskId, actorId, action: 'label_removed', meta: { labelId } })
    return this.getTask(taskId, { id: actorId })
  }

  // --- Watchers ------------------------------------------------------------
  async addWatcher(taskId: string, userId: string, actorId?: string) {
    await this.assertMayChangeFollowers(taskId, userId, actorId)
    await this.assertPersonCanSeeTask(taskId, userId, 'follower')
    await this.db.insert(taskWatchers).values({ taskId, userId }).onConflictDoNothing()
    this.realtime.emitToTask(taskId, { type: 'watchers.updated', taskId })
    // §2.2 — "FOLLOWER CHANGE — yaani ke agar mere hi task pe koi follower add
    // ho." Told to the people already on the task: it is their task whose
    // roster changed.
    await this.notifyFollowerChanged(taskId, userId, actorId).catch(() => undefined)
    return this.getTask(taskId, actorId ? { id: actorId } : undefined)
  }

  /**
   * Who may change a task's followers. Following it yourself, or stopping, is
   * open to anyone who can SEE the task — it changes nothing but your own
   * inbox. Putting somebody else on it, or taking them off, is an edit to the
   * task and needs write access. Both routes answered anyone before this.
   */
  private async assertMayChangeFollowers(taskId: string, userId: string, actorId?: string) {
    if (!actorId) return
    await this.assertTaskReadAccess(taskId, actorId)
    if (userId !== actorId) await this.assertTaskWriteAccess(taskId, actorId)
  }

  /** §2.2 — tell a task's assignees that its follower list moved. */
  private async notifyFollowerChanged(taskId: string, subjectId: string, actorId?: string) {
    const [taskRow] = await this.db.select().from(tasks).where(eq(tasks.id, taskId))
    if (!taskRow) return
    const ctx = await this.resolveWorkspaceForList(taskRow.listId)
    if (!ctx) return
    const assignees = await this.db
      .select({ userId: taskAssignees.userId })
      .from(taskAssignees)
      .where(eq(taskAssignees.taskId, taskId))
    // Not the person who did it, and not the person it was about — neither
    // needs telling what they already know.
    const recipients = new Set(assignees.map((a) => a.userId))
    recipients.delete(subjectId)
    if (actorId) recipients.delete(actorId)
    for (const recipient of recipients) {
      await this.notifications
        .create({
          userId: recipient,
          workspaceId: ctx.workspaceId,
          actorId: actorId ?? null,
          type: 'task_follower_changed',
          title: taskRow.title,
          target: { entityType: 'task', entityId: taskId },
        })
        .catch(() => undefined)
    }
  }

  async removeWatcher(taskId: string, userId: string, actorId?: string) {
    await this.assertMayChangeFollowers(taskId, userId, actorId)
    await this.db.delete(taskWatchers).where(and(eq(taskWatchers.taskId, taskId), eq(taskWatchers.userId, userId)))
    this.realtime.emitToTask(taskId, { type: 'watchers.updated', taskId })
    // The type is task_follower_changed, not task_follower_added: a follower
    // leaving is the same change to the same roster, and she named the event
    // "FOLLOWER CHANGE".
    await this.notifyFollowerChanged(taskId, userId, actorId).catch(() => undefined)
    return this.getTask(taskId, actorId ? { id: actorId } : undefined)
  }

  // --- Comments ------------------------------------------------------------
  /**
   * §V2-05, frame `04:00` — who can be @-mentioned on this task, and who would
   * be notified about something they cannot open.
   *
   * The workspace's members, each carrying `hasAccess`. The rule is evaluated by
   * `canReachTask`, which mirrors `ResourceMemberGuard` step for step; the
   * memberships it needs are fetched here once as sets rather than once per
   * candidate, so a fifty-person workspace costs a handful of queries and not a
   * hundred.
   *
   * `hasAccess` is only ever FALSE for a real reason, never as a default: a
   * picker that greys people out when it is merely unsure teaches everyone to
   * ignore the warning, which loses the one case it was built for.
   */
  async listMentionCandidates(taskId: string) {
    const [row] = await this.db
      .select({
        listId: tasks.listId,
        taskVisibility: tasks.visibility,
        taskCreatedById: tasks.createdById,
        listVisibility: lists.visibility,
        listCreatedById: lists.createdById,
        projectId: projects.id,
        projectVisibility: projects.visibility,
        spaceId: spaces.id,
        spaceVisibility: spaces.visibility,
        workspaceId: spaces.workspaceId,
      })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .leftJoin(projects, eq(projects.id, lists.projectId))
      .leftJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(tasks.id, taskId))
      .limit(1)
    if (!row) throw new NotFoundException('Task not found')

    const members = row.workspaceId
      ? await this.db
          .select({
            userId: workspaceMembers.userId,
            role: workspaceMembers.role,
            email: users.email,
            displayName: users.displayName,
            avatarUrl: users.avatarUrl,
          })
          .from(workspaceMembers)
          .innerJoin(users, eq(users.id, workspaceMembers.userId))
          .where(eq(workspaceMembers.workspaceId, row.workspaceId))
      : []

    /*
     * Only fetched when they can change the answer. A workspace whose spaces
     * are public — which is most of them — pays for one assignee query and
     * nothing else.
     */
    const assigneeRows = await this.db
      .select({ userId: taskAssignees.userId })
      .from(taskAssignees)
      .where(eq(taskAssignees.taskId, taskId))
    const spaceRows =
      row.spaceId && (row.spaceVisibility === 'private' || row.projectVisibility === 'private')
        ? await this.db
            .select({ userId: spaceMembers.userId, role: spaceMembers.role })
            .from(spaceMembers)
            .where(eq(spaceMembers.spaceId, row.spaceId))
        : []
    const projectRows =
      row.projectId && row.projectVisibility === 'private'
        ? await this.db
            .select({ userId: projectMembers.userId })
            .from(projectMembers)
            .where(eq(projectMembers.projectId, row.projectId))
        : []

    const ctx = {
      spaceVisibility: row.spaceVisibility,
      projectId: row.projectId,
      projectVisibility: row.projectVisibility,
      listVisibility: row.listVisibility,
      listCreatedById: row.listCreatedById,
      taskVisibility: row.taskVisibility,
      taskCreatedById: row.taskCreatedById,
      spaceMemberIds: new Set(spaceRows.map((s) => s.userId)),
      spaceAdminIds: new Set(spaceRows.filter((s) => s.role === 'admin').map((s) => s.userId)),
      projectMemberIds: new Set(projectRows.map((p) => p.userId)),
      assigneeIds: new Set(assigneeRows.map((a) => a.userId)),
    }

    return members.map((m) => ({
      userId: m.userId,
      email: m.email,
      displayName: m.displayName,
      avatarUrl: m.avatarUrl,
      role: m.role,
      hasAccess: canReachTask(ctx, { userId: m.userId, workspaceRole: m.role }),
    }))
  }

  /**
   * §V2-08 — merge this task into another one.
   *
   * The task named by `taskId` is the one being merged AWAY; `targetTaskId`
   * survives. See `task-merge.ts` for which tables move and which deliberately
   * do not.
   *
   * NOT WRAPPED IN A TRANSACTION, and that is a compromise worth naming. The
   * moves are `UPDATE ... SET task_id` statements against a dozen tables; a
   * failure part-way leaves work split across two tasks, both of which are
   * still readable and neither of which has lost anything, because nothing is
   * deleted here. The source is binned LAST, so a failure before that leaves a
   * merge that can simply be run again. If this file ever gains a delete, it
   * gains a transaction on the same commit.
   *
   * Every move is counted and returned. A merge that reports what it moved is a
   * merge somebody can check; `{ ok: true }` is a merge you have to take on
   * faith, and this is the operation where faith is least warranted.
   */
  async mergeTask(taskId: string, targetTaskId: string, actorId: string) {
    const [source] = await this.db
      .select({ id: tasks.id, listId: tasks.listId, parentTaskId: tasks.parentTaskId, title: tasks.title, description: tasks.description, isArchived: tasks.isArchived })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1)
    const [target] = await this.db
      .select({ id: tasks.id, listId: tasks.listId, parentTaskId: tasks.parentTaskId, title: tasks.title, description: tasks.description, isArchived: tasks.isArchived })
      .from(tasks)
      .where(eq(tasks.id, targetTaskId))
      .limit(1)

    const sourceChildren = source
      ? await this.db.select({ id: tasks.id }).from(tasks).where(eq(tasks.parentTaskId, taskId))
      : []
    const targetChildren = target
      ? await this.db.select({ id: tasks.id }).from(tasks).where(eq(tasks.parentTaskId, targetTaskId))
      : []

    const refusal = mergeRefusal(
      source ?? null,
      target ?? null,
      sourceChildren.length > 0,
      new Set(targetChildren.map((c) => c.id)),
    )
    if (refusal === 'source-missing' || refusal === 'target-missing') {
      throw new NotFoundException(MERGE_REFUSAL_MESSAGE[refusal])
    }
    if (refusal) throw new BadRequestException(MERGE_REFUSAL_MESSAGE[refusal])

    // Both tasks must be somewhere this person may write. Checked for the
    // target too: merging is a write to it, and a task you cannot edit is not a
    // task you may pour another one into.
    await this.assertTaskWriteAccess(taskId, actorId)
    await this.assertTaskWriteAccess(targetTaskId, actorId)

    const moved = emptyMergeTally()
    const count = (rows: unknown) => (Array.isArray(rows) ? rows.length : 0)

    /*
     * The plain moves: one owner, no uniqueness to collide with.
     */
    moved.comments = count(
      await this.db.update(taskComments).set({ taskId: targetTaskId }).where(eq(taskComments.taskId, taskId)).returning({ id: taskComments.id }),
    )
    moved.attachments = count(
      await this.db.update(taskAttachments).set({ taskId: targetTaskId }).where(eq(taskAttachments.taskId, taskId)).returning({ id: taskAttachments.id }),
    )
    moved.checklists = count(
      await this.db.update(taskChecklists).set({ taskId: targetTaskId }).where(eq(taskChecklists.taskId, taskId)).returning({ id: taskChecklists.id }),
    )
    moved.timeEntries = count(
      await this.db.update(timeEntries).set({ taskId: targetTaskId }).where(eq(timeEntries.taskId, taskId)).returning({ id: timeEntries.id }),
    )
    moved.externalLinks = count(
      await this.db.update(taskExternalLinks).set({ taskId: targetTaskId }).where(eq(taskExternalLinks.taskId, taskId)).returning({ id: taskExternalLinks.id }),
    )
    moved.reminders = count(
      await this.db.update(reminders).set({ taskId: targetTaskId }).where(eq(reminders.taskId, taskId)).returning({ id: reminders.id }),
    )
    moved.timeBlocks = count(
      await this.db.update(taskTimeBlocks).set({ taskId: targetTaskId }).where(eq(taskTimeBlocks.taskId, taskId)).returning({ id: taskTimeBlocks.id }),
    )
    // The source's own subtasks become the survivor's.
    moved.subtasks = count(
      await this.db.update(tasks).set({ parentTaskId: targetTaskId }).where(eq(tasks.parentTaskId, taskId)).returning({ id: tasks.id }),
    )

    /*
     * The moves that can collide. Every one of these tables is unique on
     * (task, other thing), so a straight UPDATE throws the moment both tasks
     * share an assignee, a label or a watcher — which duplicates being merged
     * almost always do. Each row is moved on its own and a collision is
     * DROPPED, because the target already has what the row was carrying.
     */
    moved.assignees = await this.moveOrDrop(
      taskAssignees, taskId, targetTaskId,
      (r) => and(eq(taskAssignees.taskId, targetTaskId), eq(taskAssignees.userId, r.userId)),
      { taskId: taskAssignees.taskId, id: taskAssignees.id, userId: taskAssignees.userId },
    )
    moved.watchers = await this.moveOrDrop(
      taskWatchers, taskId, targetTaskId,
      (r) => and(eq(taskWatchers.taskId, targetTaskId), eq(taskWatchers.userId, r.userId)),
      { taskId: taskWatchers.taskId, id: taskWatchers.id, userId: taskWatchers.userId },
    )
    moved.labels = await this.moveOrDrop(
      taskLabelAssignments, taskId, targetTaskId,
      (r) => and(eq(taskLabelAssignments.taskId, targetTaskId), eq(taskLabelAssignments.labelId, r.labelId)),
      { taskId: taskLabelAssignments.taskId, id: taskLabelAssignments.id, labelId: taskLabelAssignments.labelId },
    )
    moved.docLinks = await this.moveOrDrop(
      taskDocLinks, taskId, targetTaskId,
      (r) => and(eq(taskDocLinks.taskId, targetTaskId), eq(taskDocLinks.docId, r.docId)),
      { taskId: taskDocLinks.taskId, id: taskDocLinks.id, docId: taskDocLinks.docId },
    )
    moved.sprints = await this.moveOrDrop(
      sprintTasks, taskId, targetTaskId,
      (r) => and(eq(sprintTasks.taskId, targetTaskId), eq(sprintTasks.sprintId, r.sprintId)),
      { taskId: sprintTasks.taskId, id: sprintTasks.id, sprintId: sprintTasks.sprintId },
    )
    /*
     * Custom fields collide on (task, field), and here a collision means the
     * two tasks disagree about the same field. The TARGET's value is kept: it
     * describes the task that continues, and silently overwriting it with the
     * binned task's answer would change data nobody asked to change.
     */
    moved.customFields = await this.moveOrDrop(
      customFieldValues, taskId, targetTaskId,
      (r) => and(eq(customFieldValues.taskId, targetTaskId), eq(customFieldValues.fieldId, r.fieldId)),
      { taskId: customFieldValues.taskId, id: customFieldValues.id, fieldId: customFieldValues.fieldId },
    )

    /*
     * Dependencies point both ways and can turn into self-links. "A blocks B",
     * merged into B, would become "B blocks B" — which every dependency reader
     * in the product would then treat as a task blocking itself.
     */
    moved.dependencies = await this.moveDependencies(taskId, targetTaskId)

    /*
     * The description. Appended rather than replaced, and written through
     * `updateTask` so the change lands in the target's description history and
     * can be undone from there like any other edit.
     */
    const nextDescription = mergedDescription(target.description, source.description, source.title)
    if (nextDescription !== null) {
      await this.updateTask(targetTaskId, actorId, { description: nextDescription })
    }

    // Binned LAST: everything above is re-runnable, and this is the step that
    // makes the merge visible.
    await this.db.update(tasks).set({ isArchived: true, updatedAt: new Date() }).where(eq(tasks.id, taskId))

    await this.logActivity({ taskId: targetTaskId, actorId, action: 'merged_in', meta: { from: taskId, fromTitle: source.title, moved } })
    await this.logActivity({ taskId, actorId, action: 'merged_away', meta: { into: targetTaskId, intoTitle: target.title } })
    this.realtime.emitToTask(targetTaskId, { type: 'task.updated', listId: target.listId, taskId: targetTaskId, patch: {} })
    this.realtime.emitToList(source.listId, { type: 'task.updated', listId: source.listId, taskId, patch: { isArchived: true } })

    return { ok: true, targetTaskId, moved }
  }

  /**
   * Move rows one at a time, dropping any the target already has.
   *
   * Every join table here is unique on (task, something), so a bulk UPDATE
   * throws as soon as the two tasks share a label or an assignee — which is
   * the normal case for duplicates, not an edge case. Dropping rather than
   * failing is right because the row carried nothing the target lacks.
   */
  private async moveOrDrop<T extends { taskId: unknown }>(
    table: T,
    fromTaskId: string,
    toTaskId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    existing: (row: any) => any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    columns: any,
  ): Promise<number> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = table as any
    const rows = await this.db.select(columns).from(t).where(eq(t.taskId, fromTaskId))
    let movedCount = 0
    for (const row of rows) {
      const [clash] = await this.db.select({ id: t.id }).from(t).where(existing(row)).limit(1)
      if (clash) continue
      await this.db.update(t).set({ taskId: toTaskId }).where(eq(t.id, row.id))
      movedCount += 1
    }
    return movedCount
  }

  /**
   * Dependencies, in both directions, without creating self-links.
   *
   * A dependency row names two tasks, and the merged task can be on either
   * side. Rewriting it blindly turns "A blocks B" into "B blocks B" when B is
   * the survivor. Those rows are dropped: a task cannot block itself, and a
   * reader that finds one has to invent a meaning for it.
   */
  private async moveDependencies(fromTaskId: string, toTaskId: string): Promise<number> {
    const rows = await this.db
      .select()
      .from(taskDependencies)
      .where(or(eq(taskDependencies.taskId, fromTaskId), eq(taskDependencies.relatedTaskId, fromTaskId)))
    let movedCount = 0
    for (const row of rows) {
      const nextTask = row.taskId === fromTaskId ? toTaskId : row.taskId
      const nextRelated = row.relatedTaskId === fromTaskId ? toTaskId : row.relatedTaskId
      if (nextTask === nextRelated) continue
      const [clash] = await this.db
        .select({ id: taskDependencies.id })
        .from(taskDependencies)
        .where(and(
          eq(taskDependencies.taskId, nextTask),
          eq(taskDependencies.relatedTaskId, nextRelated),
          eq(taskDependencies.type, row.type),
        ))
        .limit(1)
      if (clash) continue
      await this.db
        .update(taskDependencies)
        .set({ taskId: nextTask, relatedTaskId: nextRelated })
        .where(eq(taskDependencies.id, row.id))
      movedCount += 1
    }
    return movedCount
  }

  /**
   * §V2-08 — keep what the description said until now.
   *
   * COALESCED, so a person tidying a paragraph does not leave eight rows. If
   * the same editor already replaced this description inside the window, the
   * row they wrote is the OLDER text and therefore the better one — so this
   * does nothing rather than overwriting it. `doc_revisions` overwrites in the
   * same situation, which is right for it: it stores the NEW text, where newer
   * is better. Here newer is worse.
   */
  private async recordDescriptionRevision(taskId: string, editorId: string, previous: string | null) {
    const [latest] = await this.db
      .select({ id: taskDescriptionRevisions.id, editorId: taskDescriptionRevisions.editorId, replacedAt: taskDescriptionRevisions.replacedAt })
      .from(taskDescriptionRevisions)
      .where(eq(taskDescriptionRevisions.taskId, taskId))
      .orderBy(desc(taskDescriptionRevisions.replacedAt))
      .limit(1)
    const withinWindow = latest?.replacedAt
      ? Date.now() - new Date(latest.replacedAt).getTime() < DESCRIPTION_REVISION_WINDOW_MS
      : false
    if (latest && latest.editorId === editorId && withinWindow) return
    await this.db.insert(taskDescriptionRevisions).values({ taskId, editorId, description: previous })
  }

  /**
   * What this description used to say, newest first.
   *
   * The task's CURRENT description is deliberately not in here — it is on the
   * task, and listing it as a revision would offer somebody a "restore" that
   * changes nothing.
   */
  async listDescriptionRevisions(taskId: string) {
    return this.db.query.taskDescriptionRevisions.findMany({
      where: eq(taskDescriptionRevisions.taskId, taskId),
      orderBy: desc(taskDescriptionRevisions.replacedAt),
      limit: 100,
      with: { editor: PUBLIC_USER_WITH },
    })
  }

  /**
   * Put an old description back.
   *
   * Routed through `updateTask` rather than writing the column directly, so
   * restoring is itself an edit: it records what the description said before
   * the restore, fires the same activity and realtime events, and can be undone
   * by restoring again. A restore that bypassed all that would be the one
   * description change in the product with no history — in the history feature.
   */
  async restoreDescriptionRevision(taskId: string, revisionId: string, actorId: string) {
    const [revision] = await this.db
      .select()
      .from(taskDescriptionRevisions)
      .where(eq(taskDescriptionRevisions.id, revisionId))
      .limit(1)
    if (!revision || revision.taskId !== taskId) throw new NotFoundException('Revision not found')
    return this.updateTask(taskId, actorId, { description: revision.description })
  }

  /**
   * `viewerId` is only for the per-person bits of a comment — right now that is
   * §V2-S06's `savedByMe`. It is optional so the handful of internal callers
   * that just want the bodies keep working; a missing viewer means "nobody has
   * saved anything", never "everything is saved".
   */
  async listComments(taskId: string, viewerId?: string) {
    const rows = await this.db.query.taskComments.findMany({
      where: eq(taskComments.taskId, taskId),
      orderBy: asc(taskComments.createdAt),
      with: { author: PUBLIC_USER_WITH, reactions: true, assignee: PUBLIC_USER_WITH, resolver: PUBLIC_USER_WITH },
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
        // The third site of `attachmentUrl`'s rule. This is the one the comment
        // cards read, so it is the one a clip still arriving is drawn from.
        kind: attachmentKind(f.storageKey),
        url: await this.attachmentUrl(f.storageKey as string | null),
      })
      byComment.set(f.commentId as string, list)
    }
    /*
     * §V2-S06 frame `05:55` — which of these I have saved, so the bookmark
     * renders filled on arrival rather than only after I press it. Without this
     * the button would forget every reload, which is the same as not storing it.
     */
    const savedIds = new Set<string>()
    if (viewerId) {
      const saves = await this.db
        .select({ commentId: taskCommentSaves.commentId })
        .from(taskCommentSaves)
        .where(and(
          eq(taskCommentSaves.userId, viewerId),
          inArray(taskCommentSaves.commentId, commentIds),
        ))
      for (const s of saves) savedIds.add(s.commentId)
    }
    return rows.map((r: { id: string }) => ({
      ...r,
      attachments: byComment.get(r.id) ?? [],
      savedByMe: savedIds.has(r.id),
    }))
  }

  /**
   * §V2-S06 frame `05:55` — "reply/thread, assign, save — same like messages".
   *
   * A private bookmark on somebody else's sentence. Deliberately NOT gated on
   * `assertTaskWriteAccess` the way resolve and assign are: saving is a reading
   * act, and a viewer who can open the task can put one of its comments aside.
   * `assertTaskReadAccess` is the gate, and it is the same one the task itself
   * uses — one implementation, not a second copy of the visibility rules.
   *
   * THE COMMENT IS CHECKED AGAINST THE TASK IN THE PATH. A comment id is not a
   * capability: without this, `/tasks/<a task I can read>/comments/<a comment
   * on a task I cannot>/save` would sail past the route guard.
   */
  async setCommentSaved(taskId: string, commentId: string, userId: string, saved: boolean) {
    await this.assertTaskReadAccess(taskId, userId)
    const [comment] = await this.db
      .select({ id: taskComments.id, taskId: taskComments.taskId })
      .from(taskComments)
      .where(eq(taskComments.id, commentId))
      .limit(1)
    if (!comment || comment.taskId !== taskId) throw new NotFoundException('Comment not found')

    if (saved) {
      // The unique index makes this the toggle: saving twice is one bookmark.
      await this.db
        .insert(taskCommentSaves)
        .values({ commentId, userId })
        .onConflictDoNothing({ target: [taskCommentSaves.commentId, taskCommentSaves.userId] })
      return { commentId, saved: true }
    }
    await this.db
      .delete(taskCommentSaves)
      .where(and(eq(taskCommentSaves.commentId, commentId), eq(taskCommentSaves.userId, userId)))
    return { commentId, saved: false }
  }

  /**
   * The saved comments the Inbox's Later tab lists, newest save first.
   *
   * Where they surface is not a free choice: §2.2 already put saved chat
   * messages in Later ("Later mein SAVED messages show hote hain"), and
   * ClickUp's own answer for a saved comment is the same tab. So this is the
   * second section of a bucket that already exists rather than a new panel.
   *
   * ACCESS IS RE-CHECKED, not assumed from the save. You saved a comment you
   * could read; being removed from a private Space afterwards must drop it out
   * of your Later tab, not keep serving you its body. `assertTaskReadAccess` is
   * reused per distinct task — a handful of queries for a list of this size,
   * and no second copy of the rules to drift.
   *
   * Archived tasks are left out: a row that opens the bin is a dead end.
   */
  async listSavedComments(workspaceId: string, userId: string) {
    const rows = await this.db
      .select({
        id: taskComments.id,
        body: taskComments.body,
        mentions: taskComments.mentions,
        createdAt: taskComments.createdAt,
        savedAt: taskCommentSaves.createdAt,
        taskId: tasks.id,
        taskTitle: tasks.title,
        listId: tasks.listId,
        projectId: lists.projectId,
        spaceId: spaces.id,
        authorId: taskComments.authorId,
        authorName: users.displayName,
        authorAvatarUrl: users.avatarUrl,
      })
      .from(taskCommentSaves)
      .innerJoin(taskComments, eq(taskComments.id, taskCommentSaves.commentId))
      .innerJoin(tasks, eq(tasks.id, taskComments.taskId))
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .leftJoin(users, eq(users.id, taskComments.authorId))
      .where(and(
        eq(taskCommentSaves.userId, userId),
        eq(spaces.workspaceId, workspaceId),
        eq(tasks.isArchived, false),
      ))
      .orderBy(desc(taskCommentSaves.createdAt))
    if (rows.length === 0) return []

    const taskIds = [...new Set(rows.map((r) => r.taskId))]
    const readable = new Set<string>()
    await Promise.all(taskIds.map(async (id) => {
      const ok = await this.assertTaskReadAccess(id, userId).then(() => true, () => false)
      if (ok) readable.add(id)
    }))
    return rows
      .filter((r) => readable.has(r.taskId))
      .map((r) => ({
        ...r,
        // `&comment=` is what makes the row land on the sentence rather than on
        // the task and good luck. The list route reads it, opens the Comments
        // tab and highlights that one.
        url: `${this.buildTaskUrl(workspaceId, r.spaceId, r.projectId, r.listId, r.taskId)}&comment=${r.id}`,
      }))
  }

  /**
   * WHO MAY COMMENT ON A TASK — the one statement of it, for the route and for
   * the sheet's capabilities. No write access by design: commenting is open to
   * whoever may open the task, at the space's "comment" level or above (or a
   * share of it), so the bin is checked here directly.
   */
  private async assertMayComment(taskId: string, authorId: string) {
    const [target] = await this.db
      .select({ isArchived: tasks.isArchived })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1)
    if (!target) throw new NotFoundException('Task not found')
    this.assertNotInBin(target.isArchived)
    await this.assertSpaceAllowsComments(taskId, authorId)
  }

  /**
   * WHAT THIS PERSON MAY DO IN THIS LIST — the answers its routes give, once
   * for the list page (`found-25-sep/list-page-offers-refused-edits`). The page
   * drew Add task, each group's add row, a row's done circle, priority and due
   * date, the board's drag and column names, Statuses and Create field for
   * anybody who could open the list, and each was refused after it was used.
   *
   *   add      — a new task here (`assertCanCreateTaskIn`: Full edit, no guest);
   *   edit     — changes to its tasks: the level the write rule reads, at the list;
   *   comment  — comments, and on a task assigned to them its status and
   *              assignees (the page asks the row's assignees for that half);
   *   statuses — its statuses, as the status routes ask (`assertMayShapeStatuses`);
   *   fields   — its project's custom fields, as the field routes ask
   *              (`assertMayDefineFields`).
   *
   * A task's own share can say more than its list does; the sheet asks the
   * task for that (`taskCapabilities`).
   */
  async listCapabilities(listId: string, actor: { id: string; role?: string | null }) {
    const home = await this.resolveWorkspaceForList(listId)
    if (!home) throw new NotFoundException('List not found')
    const allowed = (check: Promise<unknown>): Promise<boolean> =>
      check.then(
        () => true,
        (e) => {
          if (e instanceof ForbiddenException || e instanceof NotFoundException) return false
          throw e
        },
      )
    const [add, resolved, statuses, fields] = await Promise.all([
      this.canCreateTaskIn(listId, actor.id),
      resolveSpaceLevel(this.db, {
        spaceId: home.spaceId,
        actorId: actor.id,
        within: [
          { type: 'list', id: listId },
          { type: 'project', id: home.projectId },
          ...(home.folderId ? [{ type: 'folder' as const, id: home.folderId }] : []),
        ],
      }),
      allowed(assertMayShapeStatuses(this.db, { owner: 'list', ownerId: listId, actorId: actor.id })),
      allowed(assertMayDefineFields(this.db, { workspaceId: home.workspaceId, projectId: home.projectId, reader: actor })),
    ])
    // Nothing resolved is somebody no space setting narrows (a super-admin
    // acting across workspaces), as every rule reads it.
    const level = resolved?.level ?? 'admin'
    return { add, edit: spaceLevelReaches(level, 'edit'), comment: spaceLevelReaches(level, 'comment'), statuses, fields }
  }

  /**
   * WHAT THIS PERSON MAY DO TO THIS TASK — each answer the routes themselves
   * give (`found-25-sep/task-sheet-offers-refused-edits`). The task sheet drew
   * every control for anybody who could open the task, and a comment-only or
   * view-only reader was refused each one after pressing it.
   *
   *   edit     — any change, the write rule at "edit";
   *   progress — its status and assignees, the write rule at "comment", which
   *              an assignee passes in a comment-only space;
   *   comment  — a comment, as the comment route asks;
   *   full     — Full edit: deleting it, and adding a subtask to it (the
   *              write rule at "full"; `found-25-sep/full-edit-enforced-nowhere`).
   *
   * A refusal is an answer (false); anything else is thrown.
   */
  async taskCapabilities(taskId: string, actorId: string) {
    const allowed = (check: Promise<unknown>): Promise<boolean> =>
      check.then(
        () => true,
        (e) => {
          if (e instanceof ForbiddenException || e instanceof NotFoundException || e instanceof ConflictException) return false
          throw e
        },
      )
    const [edit, progress, comment, full] = await Promise.all([
      allowed(this.assertTaskWriteAccess(taskId, actorId)),
      allowed(this.assertTaskWriteAccess(taskId, actorId, { level: 'comment' })),
      allowed(this.assertMayComment(taskId, actorId)),
      allowed(this.assertTaskWriteAccess(taskId, actorId, { level: 'full' })),
    ])
    return { edit, progress, comment, full }
  }

  async createComment(taskId: string, authorId: string, body: string, parentCommentId?: string, mentions?: Array<{ userId: string; offset: number; length: number }>, attachmentIds?: string[]) {
    await this.assertMayComment(taskId, authorId)

    /*
     * §V2-05 — a comment with no words is allowed IF it carries a file.
     *
     * Frame `04:45` is a voice note posted on its own, and `05:35` a recorded
     * clip posted on its own. Keeping the old "body cannot be empty" rule would
     * have left the composer's mic able to record something it could never
     * post — a control named after a thing it cannot do.
     *
     * The attachments are RESOLVED here rather than trusted, and resolved
     * against this task: an empty body is only accepted once at least one of
     * the given ids is a real row on this task. Otherwise any caller could post
     * an empty comment by naming ids that link nothing, and the emptiness check
     * would be decoration.
     */
    const requestedIds = attachmentIds ?? []
    const linkable = requestedIds.length > 0
      ? await this.db
          .select({ id: taskAttachments.id, fileName: taskAttachments.fileName, contentType: taskAttachments.contentType })
          .from(taskAttachments)
          .where(and(eq(taskAttachments.taskId, taskId), inArray(taskAttachments.id, requestedIds)))
      : []
    if (!body.trim() && linkable.length === 0) {
      throw new BadRequestException('A comment needs words or a file')
    }

    const extracted = this.extractMentionIds(body).map((userId) => ({ userId, offset: 0, length: 0 }))
    const finalMentions = mentions && mentions.length > 0 ? mentions : extracted
    const [comment] = await this.db
      .insert(taskComments)
      .values({ taskId, authorId, body, parentCommentId, mentions: finalMentions.length > 0 ? finalMentions : null })
      .returning()
    // Link the resolved attachments to this comment. Only rows belonging to the
    // same task are linked, so a caller can't attach files from elsewhere.
    if (linkable.length > 0) {
      await this.db
        .update(taskAttachments)
        .set({ commentId: comment.id })
        .where(and(eq(taskAttachments.taskId, taskId), inArray(taskAttachments.id, linkable.map((a) => a.id))))
    }
    // Auto-subscribe the author as a watcher (§A4.7 — opt-out).
    if (await this.notifications.autoFollowEnabled(authorId)) {
      await this.db.insert(taskWatchers).values({ taskId, userId: authorId }).onConflictDoNothing()
    }

    await this.logActivity({ taskId, actorId: authorId, action: 'commented', meta: { commentId: comment.id } })
    const hydrated = await this.db.query.taskComments.findFirst({
      where: eq(taskComments.id, comment.id),
      with: { author: PUBLIC_USER_WITH, reactions: true, assignee: PUBLIC_USER_WITH, resolver: PUBLIC_USER_WITH },
    })
    this.realtime.emitToTask(taskId, { type: 'comment.created', taskId, comment: hydrated })

    // Fire comment + mention notifications (best-effort). A wordless voice note
    // gets described by what it is rather than emailed as a blank quote.
    void this.notifyComment(taskId, authorId, body.trim() ? body : describeAttachments(linkable), finalMentions)

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
        // Outgoing webhook (Plan §12): comment.created now actually dispatches.
        await this.webhooks.fire(ctx.workspaceId, 'comment.created', {
          comment: { id: comment.id, taskId, authorId, body: body.slice(0, 2000) },
          projectId: ctx.projectId,
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
    await this.assertSpaceAllowsComments(existing.taskId, authorId)
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
          // G10-10 [12:21–12:24] — its own kind. As `task_assigned` this was
          // indistinguishable in the Inbox from being given a task, and could
          // not be toggled apart from one in the Primary customiser.
          type: 'comment_assigned',
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
          // G10-10 — routine by comparison, and now separately mutable: as
          // `task_commented` it looked exactly like a new comment arriving.
          type: 'comment_resolved',
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

  /**
   * A REACTION IS TO A COMMENT ON THE TASK IN THE URL, BY SOMEBODY WHO MAY
   * COMMENT THERE (`found-25-sep/task-rows-changed-by-id-anywhere`). The route's
   * guard asked that the caller could open the task in the URL, and the comment
   * id was never matched to it: measured on lane 5, somebody from another
   * organisation, naming a task of their own, reacted to an admin's comment
   * (201), and its author was told. ClickUp counts a like with the comment
   * level: "View" can't comment.
   */
  async toggleReaction(taskId: string, commentId: string, userId: string, emoji: string) {
    const [onTask] = await this.db
      .select({ id: taskComments.id })
      .from(taskComments)
      .where(and(eq(taskComments.id, commentId), eq(taskComments.taskId, taskId)))
      .limit(1)
    if (!onTask) throw new NotFoundException('Comment not found')
    await this.assertMayComment(taskId, userId)
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

    /*
     * §G10-7 [12:21] — reactions are one of the kinds she goes through in the
     * Primary customiser, and she turns them off for herself. A kind that is
     * never emitted cannot be turned off, and more to the point: reacting to a
     * chat message told its author, and reacting to a task comment told nobody.
     * The same gesture, in two places, with two different meanings.
     *
     * Best-effort and un-awaited, exactly as the chat side is: a notification
     * that fails must not undo the reaction the person just made.
     */
    const [comment] = await this.db
      .select({ id: taskComments.id, taskId: taskComments.taskId, authorId: taskComments.authorId, body: taskComments.body })
      .from(taskComments)
      .where(eq(taskComments.id, commentId))
      .limit(1)
    // Reacting to your own comment tells you nothing.
    if (comment?.authorId && comment.authorId !== userId) {
      const [taskRow] = await this.db
        .select({ id: tasks.id, title: tasks.title, listId: tasks.listId })
        .from(tasks)
        .where(eq(tasks.id, comment.taskId))
        .limit(1)
      const ctx = taskRow ? await this.resolveWorkspaceForList(taskRow.listId) : null
      if (taskRow && ctx) {
        void this.notifications
          .create({
            userId: comment.authorId,
            workspaceId: ctx.workspaceId,
            actorId: userId,
            type: 'message_reaction',
            title: emoji,
            body: comment.body ?? undefined,
            target: {
              entityType: 'task',
              entityId: taskRow.id,
              url: this.buildTaskUrl(ctx.workspaceId, ctx.spaceId, ctx.projectId, taskRow.listId, taskRow.id),
            },
          })
          .catch(() => undefined)
      }
    }
    return { added: true, reaction: created }
  }

  // --- Checklists ----------------------------------------------------------
  /*
   * A CHECKLIST IS ITS TASK'S, AND CHANGED AS ITS TASK IS
   * (`found-25-sep/task-rows-changed-by-id-anywhere`). The routes sit under
   * `tasks/:taskId/checklists`; the guard asked that the caller could open the
   * task in the URL, and the service then wrote whatever checklist or item id
   * it was handed. Measured on lane 5: somebody from another organisation,
   * naming a task of their own, renamed an admin's checklist, added, edited,
   * ticked and deleted its items, moved one into a checklist of their own (the
   * item's update took the raw body, `checklistId` included) and deleted a
   * checklist — 200 or 201 each. Nor was the task's write rule asked: a member
   * in a view-only space made checklists on its tasks.
   *
   * So a checklist or an item is found through the task in the URL — one on
   * another task is not found — and every change asks the write rule, as a
   * change to the task's other parts does.
   */
  private async checklistOf(taskId: string, checklistId: string) {
    const [row] = await this.db
      .select()
      .from(taskChecklists)
      .where(and(eq(taskChecklists.id, checklistId), eq(taskChecklists.taskId, taskId)))
      .limit(1)
    if (!row) throw new NotFoundException('Checklist not found')
    return row
  }

  private async checklistItemOf(taskId: string, itemId: string) {
    const [row] = await this.db
      .select({ item: taskChecklistItems, checklist: taskChecklists })
      .from(taskChecklistItems)
      .innerJoin(taskChecklists, eq(taskChecklists.id, taskChecklistItems.checklistId))
      .where(and(eq(taskChecklistItems.id, itemId), eq(taskChecklists.taskId, taskId)))
      .limit(1)
    if (!row) throw new NotFoundException('Checklist item not found')
    return row
  }

  async createChecklist(taskId: string, title: string, actorId: string) {
    await this.assertTaskWriteAccess(taskId, actorId)
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

  async updateChecklist(taskId: string, checklistId: string, actorId: string, patch: { title?: string; position?: number }) {
    if (patch.position !== undefined && (typeof patch.position !== 'number' || !Number.isInteger(patch.position))) {
      throw new BadRequestException('Checklist position must be an integer')
    }
    await this.assertTaskWriteAccess(taskId, actorId)
    await this.checklistOf(taskId, checklistId)
    const set: Record<string, unknown> = { updatedAt: new Date() }
    if (patch.title !== undefined) set.title = patch.title
    if (patch.position !== undefined) set.position = patch.position
    const [updated] = await this.db
      .update(taskChecklists)
      .set(set)
      .where(eq(taskChecklists.id, checklistId))
      .returning()
    if (!updated) throw new NotFoundException('Checklist not found')
    this.realtime.emitToTask(updated.taskId, { type: 'checklist.updated', taskId: updated.taskId })
    return updated
  }

  async deleteChecklist(taskId: string, checklistId: string, actorId: string) {
    await this.assertTaskWriteAccess(taskId, actorId)
    const existing = await this.checklistOf(taskId, checklistId)
    await this.db.delete(taskChecklists).where(eq(taskChecklists.id, checklistId))
    this.realtime.emitToTask(existing.taskId, { type: 'checklist.updated', taskId: existing.taskId })
    return { ok: true }
  }

  async addChecklistItem(
    taskId: string,
    checklistId: string,
    content: string,
    assigneeId: string | null | undefined,
    dueDate: Date | null | undefined,
    actorId: string,
  ) {
    await this.assertTaskWriteAccess(taskId, actorId)
    const parent = await this.checklistOf(taskId, checklistId)
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
    // Frame `02:47`: the feed names both the item and the list it went into.
    // With more than one named checklist per task that is not decoration —
    // "added an item" tells you nothing about which list grew.
    await this.logActivity({
      taskId: parent.taskId,
      actorId,
      action: 'checklist_item_added',
      meta: { itemId: item.id, content: item.content, checklist: parent.title },
    })
    this.realtime.emitToTask(parent.taskId, { type: 'checklist.updated', taskId: parent.taskId })
    return item
  }

  async updateChecklistItem(
    taskId: string,
    itemId: string,
    actorId: string,
    patch: { content?: string; isDone?: boolean; position?: number; dueDate?: Date | null; assigneeId?: string | null },
  ) {
    const { item: existing } = await this.checklistItemOf(taskId, itemId)
    /*
     * TICKING AN ITEM ASSIGNED TO YOU IS A COMMENTER'S — ClickUp's Comment may
     * "complete or mark complete assigned checklist items"
     * (`found-25-sep/assigned-checklist-items-need-edit`). The tick alone, on
     * one's own item, asks the comment rule; every other change, and a tick of
     * somebody else's item, asks Edit, as it did.
     */
    const tickOfTheirOwn =
      Object.keys(patch).length === 1 && typeof patch.isDone === 'boolean' && existing.assigneeId === actorId
    if (!(tickOfTheirOwn && (await taskCommentAllowed(this.db, taskId, actorId)))) {
      await this.assertTaskWriteAccess(taskId, actorId)
    }

    // What an item's update may change, named: the body is not the row, and a
    // `checklistId` in it moved the item into somebody else's checklist.
    const set: Record<string, unknown> = { updatedAt: new Date() }
    for (const key of ['content', 'isDone', 'position', 'dueDate', 'assigneeId'] as const) {
      if (key in patch) set[key] = patch[key]
    }
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
          meta: { itemId, content: updated.content, isDone: updated.isDone, checklist: parent.title },
        })
      }
      this.realtime.emitToTask(parent.taskId, { type: 'checklist.updated', taskId: parent.taskId })
    }
    return updated
  }

  async deleteChecklistItem(taskId: string, itemId: string, actorId: string) {
    await this.assertTaskWriteAccess(taskId, actorId)
    const { item: existing } = await this.checklistItemOf(taskId, itemId)
    await this.db.delete(taskChecklistItems).where(eq(taskChecklistItems.id, itemId))
    const [parent] = await this.db.select().from(taskChecklists).where(eq(taskChecklists.id, existing.checklistId))
    if (parent) this.realtime.emitToTask(parent.taskId, { type: 'checklist.updated', taskId: parent.taskId })
    return { ok: true }
  }

  // --- Dependencies --------------------------------------------------------
  async getDependencyGraph(taskId: string, depth = 2, reader?: { id: string; role?: string | null }) {
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

    // Nodes from the root's own workspace only — the read-side twin of
    // addDependency's check, for edges written before it existed. A node from
    // elsewhere is dropped with every edge that touches it, so the graph never
    // names another tenant's task, and its metrics count only what it shows.
    const [root] = await this.db
      .select({ workspaceId: spaces.workspaceId })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(tasks.id, taskId))
      .limit(1)
    if (!root) throw new NotFoundException('Task not found')
    const nodeIds = [...visited]
    // And, for a reader, only tasks they may open: a node they may not is
    // dropped the same way, edges and all. Measured on lane 1, the graph of a
    // member's own task named a blocker in a space they were refused.
    const isManager = reader ? await resolveIsManager(this.db, root.workspaceId, reader.id, reader.role) : true
    const found = await this.db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        isArchived: tasks.isArchived,
      })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(
        and(
          inArray(tasks.id, nodeIds),
          eq(spaces.workspaceId, root.workspaceId),
          reader ? taskInReachFilter(this.db, root.workspaceId, reader.id, isManager) : undefined,
          reader ? taskVisibilityFilter(this.db, reader.id, isManager) : undefined,
        ),
      )

    const kept = new Map(found.map((r) => [r.id, r]))
    for (const [key, edge] of edges) {
      if (!kept.has(edge.taskId) || !kept.has(edge.relatedTaskId)) edges.delete(key)
    }
    // Then only what still joins the root: a task reached THROUGH a dropped
    // one would stand alone in the graph and tell of the link it came by.
    const reach = new Set<string>(kept.has(taskId) ? [taskId] : [])
    for (let grew = true; grew; ) {
      grew = false
      for (const edge of edges.values()) {
        if (reach.has(edge.taskId) !== reach.has(edge.relatedTaskId)) {
          reach.add(edge.taskId)
          reach.add(edge.relatedTaskId)
          grew = true
        }
      }
    }
    for (const [key, edge] of edges) {
      if (!reach.has(edge.taskId)) edges.delete(key)
    }
    const rows = found.filter((r) => reach.has(r.id))
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
    // An edit to this task, so write access — the route's guard only proves
    // membership — and the other end obeys the parent's rule. See
    // assertTaskReference.
    const access = await this.assertTaskWriteAccess(taskId, actorId)
    await this.assertTaskReference(relatedTaskId, access.workspaceId, actorId, 'Related task not found')
    /*
     * BLOCKING ANOTHER TASK IS A CHANGE TO IT: it cannot be closed while its
     * blocker is open. So the task this blocks asks its own write rule
     * (`found-25-sep/read-only-tasks-blocked-and-parented`); measured on lane
     * 3, a member blocked the admin's task in a view-only space (201), and the
     * admin then could not close it (400). A task of theirs may still wait on
     * one they only read — `blocked_by` and `related_to` bind nobody else's.
     */
    if (type === 'blocks') await this.assertTaskWriteAccess(relatedTaskId, actorId)
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
    // §4.4 — a new blocking edge may leave a task blocked; notify its
    // assignees + watchers. Only for a freshly-created blocking dependency.
    if (created && (type === 'blocks' || type === 'blocked_by')) {
      const blocked = type === 'blocks' ? relatedTaskId : taskId
      void this.notifyTaskBlocked(blocked, /* blocker */ type === 'blocks' ? taskId : relatedTaskId, actorId)
    }
    return created
  }

  /**
   * Removed through the task the route names, and only a dependency that
   * touches it. This took the dependency's id alone: the route's guard proved
   * membership of `:taskId`'s workspace and nothing tied `:depId` to that task,
   * so any member of any workspace could delete any dependency by id.
   */
  async removeDependency(taskId: string, depId: string, actorId: string) {
    await this.assertTaskWriteAccess(taskId, actorId)
    const [existing] = await this.db
      .select()
      .from(taskDependencies)
      .where(
        and(
          eq(taskDependencies.id, depId),
          or(eq(taskDependencies.taskId, taskId), eq(taskDependencies.relatedTaskId, taskId)),
        ),
      )
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
      // The public columns, never `true`: the whole row carried every actor's
      // password hash, lockout counters and preferences to anyone who could
      // open the task — guests included. See `public-user.ts`.
      with: { actor: PUBLIC_USER_WITH },
    })
  }

  /** Aggregated activity across every task in a project (Plan §4 timeline). */
  async listProjectActivity(projectId: string, limit = 100, actor?: { id: string; role?: string }) {
    // §2 per-item privacy: don't surface activity for private tasks the actor
    // can't see (the feed carries task titles).
    let visFilter: SQL | undefined
    if (actor) {
      const [ctx] = await this.db
        .select({ workspaceId: spaces.workspaceId })
        .from(projects)
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(eq(projects.id, projectId))
        .limit(1)
      if (ctx) {
        const isManager = await resolveIsManager(this.db, ctx.workspaceId, actor.id, actor.role)
        visFilter = taskVisibilityFilter(this.db, actor.id, isManager)
      }
    }
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
      .where(and(eq(lists.projectId, projectId), visFilter))
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
  /**
   * Resolve the billable default for a task's project (§8.3 "set billable
   * default per project"). New timer/manual entries inherit this when the
   * caller doesn't set `isBillable` explicitly.
   */
  private async projectDefaultBillable(taskId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ def: projects.defaultBillable })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .where(eq(tasks.id, taskId))
      .limit(1)
    return row?.def ?? false
  }

  async startTimer(taskId: string, userId: string, description?: string, isBillable?: boolean) {
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
      .values({
        taskId,
        userId,
        startedAt: new Date(),
        description,
        isBillable: isBillable ?? (await this.projectDefaultBillable(taskId)),
      })
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
    this.fireTimeLogged(updated)
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
      .values({
        ...data,
        durationSec,
        isBillable: data.isBillable ?? (await this.projectDefaultBillable(data.taskId)),
      })
      .returning()
    this.fireTimeLogged(entry)
    return entry
  }

  /** Fire the outgoing 'time.logged' webhook (Plan §12), best-effort. */
  private fireTimeLogged(entry: {
    id: string
    taskId: string
    userId: string
    durationSec: number | null
    isBillable: boolean
  }): void {
    void (async () => {
      try {
        const ctx = await this.resolveTaskContext(entry.taskId)
        if (!ctx) return
        await this.webhooks.fire(ctx.space.workspaceId, 'time.logged', {
          timeEntry: {
            id: entry.id,
            taskId: entry.taskId,
            userId: entry.userId,
            durationSec: entry.durationSec ?? 0,
            isBillable: entry.isBillable,
          },
          task: { id: ctx.task.id, title: ctx.task.title },
          projectId: ctx.project.id,
        })
      } catch {
        // best-effort
      }
    })()
  }

  async listTimeEntries(taskId: string) {
    return this.db.query.timeEntries.findMany({
      where: eq(timeEntries.taskId, taskId),
      orderBy: desc(timeEntries.startedAt),
      with: { user: PUBLIC_USER_WITH },
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

import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common'
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
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { SearchService } from '../search/search.service'

type TaskPriority = 'urgent' | 'high' | 'normal' | 'low'
type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled'

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

@Injectable()
export class TasksService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private realtime: RealtimeGateway,
    private search: SearchService,
  ) {}

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
      )
    } catch {
      // Search is best-effort; never fail a write because of it.
    }
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

  // --- Task CRUD -----------------------------------------------------------
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
    const [task] = await this.db
      .insert(tasks)
      .values({
        listId: data.listId,
        parentTaskId: data.parentTaskId,
        createdById: data.createdById,
        title: data.title,
        description: data.description,
        priority: data.priority ?? 'normal',
        status: data.status ?? 'todo',
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
    return hydrated
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
    return rows.map((r) => ({ ...r, labels: byTask.get(r.id) ?? [] }))
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
      isArchived: boolean
    }>,
  ) {
    const [before] = await this.db.select().from(tasks).where(eq(tasks.id, taskId))
    if (!before) throw new NotFoundException('Task not found')

    const set: Record<string, unknown> = { ...patch, updatedAt: new Date() }
    if (patch.status === 'done' && before.status !== 'done') set.completedAt = new Date()
    if (patch.status && patch.status !== 'done' && before.status === 'done') set.completedAt = null

    const [after] = await this.db.update(tasks).set(set).where(eq(tasks.id, taskId)).returning()

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
    return this.getTask(taskId)
  }

  async deleteTask(taskId: string, actorId: string) {
    const [before] = await this.db.select().from(tasks).where(eq(tasks.id, taskId))
    if (!before) throw new NotFoundException('Task not found')
    await this.db.update(tasks).set({ isArchived: true, updatedAt: new Date() }).where(eq(tasks.id, taskId))
    await this.logActivity({ taskId, actorId, action: 'archived' })
    this.realtime.emitToList(before.listId, { type: 'task.deleted', listId: before.listId, taskId })
    return { ok: true }
  }

  async moveTask(taskId: string, actorId: string, targetListId: string, position: number) {
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
    await this.db.insert(taskAssignees).values({ taskId, userId }).onConflictDoNothing()
    await this.db.insert(taskWatchers).values({ taskId, userId }).onConflictDoNothing()
    await this.logActivity({ taskId, actorId, action: 'assigned', meta: { userId } })
    return this.getTask(taskId)
  }

  async removeAssignee(taskId: string, userId: string, actorId: string) {
    await this.db.delete(taskAssignees).where(and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.userId, userId)))
    await this.logActivity({ taskId, actorId, action: 'unassigned', meta: { userId } })
    return this.getTask(taskId)
  }

  // --- Labels --------------------------------------------------------------
  async addLabel(taskId: string, labelId: string, actorId: string) {
    await this.db.insert(taskLabelAssignments).values({ taskId, labelId }).onConflictDoNothing()
    await this.logActivity({ taskId, actorId, action: 'label_added', meta: { labelId } })
    return this.getTask(taskId)
  }

  async removeLabel(taskId: string, labelId: string, actorId: string) {
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
      with: { author: true, reactions: true },
    })
    return rows
  }

  async createComment(taskId: string, authorId: string, body: string, parentCommentId?: string, mentions?: Array<{ userId: string; offset: number; length: number }>) {
    if (!body.trim()) throw new BadRequestException('Comment body cannot be empty')
    const [comment] = await this.db
      .insert(taskComments)
      .values({ taskId, authorId, body, parentCommentId, mentions: mentions ?? null })
      .returning()
    // Auto-subscribe the author as a watcher
    await this.db.insert(taskWatchers).values({ taskId, userId: authorId }).onConflictDoNothing()

    await this.logActivity({ taskId, actorId: authorId, action: 'commented', meta: { commentId: comment.id } })
    const hydrated = await this.db.query.taskComments.findFirst({
      where: eq(taskComments.id, comment.id),
      with: { author: true, reactions: true },
    })
    this.realtime.emitToTask(taskId, { type: 'comment.created', taskId, comment: hydrated })
    return hydrated
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

  async deleteComment(commentId: string, authorId: string) {
    const [existing] = await this.db.select().from(taskComments).where(eq(taskComments.id, commentId))
    if (!existing) throw new NotFoundException('Comment not found')
    if (existing.authorId !== authorId) throw new BadRequestException('Cannot delete another user\'s comment')
    await this.db.delete(taskComments).where(eq(taskComments.id, commentId))
    this.realtime.emitToTask(existing.taskId, { type: 'comment.deleted', taskId: existing.taskId, commentId })
    return { ok: true }
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
  async addDependency(taskId: string, relatedTaskId: string, type: DependencyType, actorId: string) {
    if (taskId === relatedTaskId) throw new BadRequestException('A task cannot depend on itself')
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
      .select()
      .from(timeEntries)
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
}

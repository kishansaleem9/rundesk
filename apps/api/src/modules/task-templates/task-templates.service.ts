import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import {
  taskTemplates,
  tasks,
  lists,
  projects,
  spaces,
  taskAssignees,
  taskLabelAssignments,
  taskChecklists,
  taskChecklistItems,
  labels,
  customFieldDefinitions,
  customFieldValues,
  type TaskTemplatePayload,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { TasksService } from '../tasks/tasks.service'
import { SecurityService } from '../security/security.service'

const NAME_MAX = 120
const DESCRIPTION_MAX = 1000
const MAX_SUBTASKS = 100
const MAX_CHECKLISTS = 20
const MAX_CHECKLIST_ITEMS = 100
const MAX_LABELS = 50
const MAX_CUSTOM_FIELDS = 100

type TaskPriority = 'urgent' | 'high' | 'normal' | 'low'

export interface TaskTemplateView {
  id: string
  workspaceId: string
  name: string
  description: string | null
  icon: string | null
  payload: TaskTemplatePayload
  usageCount: number
  createdById: string | null
  createdAt: Date
  updatedAt: Date
}

/**
 * Empty payload returned when callers ask for a "blank" template
 * (e.g. building one manually via the UI). Kept here so the shape
 * stays in sync if `TaskTemplatePayload` grows new fields.
 */
const EMPTY_PAYLOAD: TaskTemplatePayload = {
  title: '',
  description: null,
  priority: 'normal',
  timeEstimate: null,
  startDateOffsetDays: null,
  dueDateOffsetDays: null,
  labels: [],
  checklists: [],
  subtasks: [],
  customFieldValues: [],
}

@Injectable()
export class TaskTemplatesService {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly tasksService: TasksService,
    private readonly security: SecurityService,
  ) {}

  // -------------------------------------------------------------- CRUD

  async list(workspaceId: string): Promise<TaskTemplateView[]> {
    const rows = await this.db
      .select()
      .from(taskTemplates)
      .where(eq(taskTemplates.workspaceId, workspaceId))
      .orderBy(desc(taskTemplates.usageCount), desc(taskTemplates.updatedAt))
    return rows.map((r) => this.toView(r))
  }

  async getById(workspaceId: string, id: string): Promise<TaskTemplateView> {
    const row = await this.requireTemplate(workspaceId, id)
    return this.toView(row)
  }

  async create(
    workspaceId: string,
    actor: { id: string; email?: string },
    dto: {
      name: string
      description?: string | null
      icon?: string | null
      payload?: Partial<TaskTemplatePayload>
    },
  ): Promise<TaskTemplateView> {
    const name = this.normaliseName(dto.name)
    const description = this.normaliseDescription(dto.description ?? null)
    const payload = this.normalisePayload({ ...EMPTY_PAYLOAD, ...(dto.payload ?? {}) })

    const [row] = await this.db
      .insert(taskTemplates)
      .values({
        workspaceId,
        name,
        description,
        icon: dto.icon ?? null,
        payload,
        createdById: actor.id,
      })
      .returning()
    if (!row) throw new Error('Failed to create template')

    await this.security.logAuditEvent({
      workspaceId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'task_template.created',
      resourceType: 'task_template',
      resourceId: row.id,
      description: `Task template "${name}" created`,
    })

    return this.toView(row)
  }

  async update(
    workspaceId: string,
    id: string,
    actor: { id: string; email?: string },
    patch: {
      name?: string
      description?: string | null
      icon?: string | null
      payload?: Partial<TaskTemplatePayload>
    },
  ): Promise<TaskTemplateView> {
    const existing = await this.requireTemplate(workspaceId, id)
    const next: Partial<typeof taskTemplates.$inferInsert> = {}
    if (patch.name !== undefined) next.name = this.normaliseName(patch.name)
    if (patch.description !== undefined) next.description = this.normaliseDescription(patch.description)
    if (patch.icon !== undefined) next.icon = patch.icon
    if (patch.payload !== undefined) {
      next.payload = this.normalisePayload({ ...existing.payload, ...patch.payload })
    }

    if (Object.keys(next).length === 0) return this.toView(existing)
    next.updatedAt = new Date()
    const [row] = await this.db
      .update(taskTemplates)
      .set(next)
      .where(eq(taskTemplates.id, id))
      .returning()

    await this.security.logAuditEvent({
      workspaceId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'task_template.updated',
      resourceType: 'task_template',
      resourceId: id,
      description: `Task template "${row?.name ?? existing.name}" updated`,
    })

    return this.toView(row ?? existing)
  }

  async remove(workspaceId: string, id: string, actor: { id: string; email?: string }) {
    const existing = await this.requireTemplate(workspaceId, id)
    await this.db.delete(taskTemplates).where(eq(taskTemplates.id, id))
    await this.security.logAuditEvent({
      workspaceId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'task_template.deleted',
      resourceType: 'task_template',
      resourceId: id,
      description: `Task template "${existing.name}" deleted`,
    })
  }

  // ------------------------------------------------- snapshot from task

  /**
   * Snapshot an existing task into a reusable template owned by this
   * workspace. Captures: title, description, priority, time estimate,
   * date offsets (computed relative to "today" at save time), labels,
   * checklists with items, one level of subtasks, and custom-field
   * values keyed by definition name.
   *
   * Status is intentionally NOT captured because each list has its
   * own custom-status pipeline — see TaskTemplatePayload docstring.
   */
  async saveFromTask(
    workspaceId: string,
    taskId: string,
    actor: { id: string; email?: string },
    dto: { name: string; description?: string | null; icon?: string | null },
  ): Promise<TaskTemplateView> {
    const ctx = await this.resolveTaskContext(taskId)
    if (!ctx) throw new NotFoundException('Task not found')
    if (ctx.workspaceId !== workspaceId) throw new NotFoundException('Task not found in this workspace')

    const payload = await this.snapshotTask(taskId)
    return this.create(workspaceId, actor, {
      name: dto.name,
      description: dto.description ?? null,
      icon: dto.icon ?? null,
      payload,
    })
  }

  // ----------------------------------------------------- instantiation

  /**
   * Materialize a template into a real task under the target list.
   * Subtasks, checklists, labels (resolved by name within the
   * workspace — missing ones are auto-created with a neutral color),
   * and custom-field values (resolved by definition name within the
   * target project) are all reconstructed.
   *
   * Date offsets are interpreted as days from `now` so a template
   * with `dueDateOffsetDays: 7` always produces a task due in a week.
   */
  async instantiate(
    workspaceId: string,
    templateId: string,
    actor: { id: string; email?: string },
    dto: { listId: string; titleOverride?: string; assigneeIds?: string[] },
  ) {
    const template = await this.requireTemplate(workspaceId, templateId)
    const listCtx = await this.resolveListContext(dto.listId)
    if (!listCtx) throw new NotFoundException('Target list not found')
    if (listCtx.workspaceId !== workspaceId) {
      throw new BadRequestException('Target list belongs to a different workspace')
    }

    const payload = template.payload
    const now = new Date()
    const labelIds = await this.resolveLabelIds(workspaceId, payload.labels, actor.id)

    const startDate = offsetToDate(now, payload.startDateOffsetDays)
    const dueDate = offsetToDate(now, payload.dueDateOffsetDays)

    const task = await this.tasksService.createTask({
      listId: dto.listId,
      title: dto.titleOverride?.trim() || payload.title || template.name,
      description: payload.description ?? undefined,
      priority: payload.priority,
      timeEstimate: payload.timeEstimate ?? undefined,
      startDate: startDate ?? undefined,
      dueDate: dueDate ?? undefined,
      labelIds: labelIds.length ? labelIds : undefined,
      assigneeIds: dto.assigneeIds?.length ? dto.assigneeIds : undefined,
      createdById: actor.id,
    })
    if (!task) throw new Error('Task creation returned no row')

    await this.materialiseChecklists(task.id, payload.checklists)
    await this.materialiseCustomFieldValues(task.id, listCtx.projectId, payload.customFieldValues)
    await this.materialiseSubtasks(dto.listId, task.id, payload.subtasks, actor.id, now)

    // Bump usage count for ordering/discovery.
    await this.db
      .update(taskTemplates)
      .set({ usageCount: sql`${taskTemplates.usageCount} + 1`, updatedAt: now })
      .where(eq(taskTemplates.id, templateId))

    await this.security.logAuditEvent({
      workspaceId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'task_template.applied',
      resourceType: 'task',
      resourceId: task.id,
      description: `Task created from template "${template.name}"`,
      metadata: { templateId },
    })

    return { taskId: task.id, templateId, task }
  }

  /**
   * Duplicate an existing task: clone its core fields, assignees, labels,
   * checklists, custom-field values and one level of subtasks into the SAME
   * list, with "(copy)" appended to the title. Dates are copied verbatim from
   * the source (not shifted like template offsets). The copy starts open.
   */
  async duplicateTask(workspaceId: string, taskId: string, actor: { id: string; email?: string }) {
    const ctx = await this.resolveTaskContext(taskId)
    if (!ctx) throw new NotFoundException('Task not found')
    if (ctx.workspaceId !== workspaceId) throw new NotFoundException('Task not found in this workspace')

    const [src] = await this.db
      .select({ startDate: tasks.startDate, dueDate: tasks.dueDate })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1)
    const assignees = await this.db
      .select({ userId: taskAssignees.userId })
      .from(taskAssignees)
      .where(eq(taskAssignees.taskId, taskId))
    const assigneeIds = assignees.map((a) => a.userId)

    const payload = await this.snapshotTask(taskId)
    const now = new Date()
    const labelIds = await this.resolveLabelIds(workspaceId, payload.labels, actor.id)

    const task = await this.tasksService.createTask({
      listId: ctx.listId,
      title: `${payload.title || 'Task'} (copy)`,
      description: payload.description ?? undefined,
      priority: payload.priority,
      timeEstimate: payload.timeEstimate ?? undefined,
      startDate: src?.startDate ?? undefined,
      dueDate: src?.dueDate ?? undefined,
      labelIds: labelIds.length ? labelIds : undefined,
      assigneeIds: assigneeIds.length ? assigneeIds : undefined,
      createdById: actor.id,
    })
    if (!task) throw new Error('Task creation returned no row')

    await this.materialiseChecklists(task.id, payload.checklists)
    await this.materialiseCustomFieldValues(task.id, ctx.projectId, payload.customFieldValues)
    await this.materialiseSubtasks(ctx.listId, task.id, payload.subtasks, actor.id, now)

    await this.security.logAuditEvent({
      workspaceId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'task.duplicated',
      resourceType: 'task',
      resourceId: task.id,
      description: 'Duplicated a task',
      metadata: { sourceTaskId: taskId },
    })

    return { taskId: task.id, task }
  }

  // ----------------------------------------------------------- helpers

  private async requireTemplate(workspaceId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(taskTemplates)
      .where(and(eq(taskTemplates.id, id), eq(taskTemplates.workspaceId, workspaceId)))
      .limit(1)
    if (!row) throw new NotFoundException('Template not found')
    return row
  }

  private async snapshotTask(taskId: string): Promise<TaskTemplatePayload> {
    const [task] = await this.db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1)
    if (!task) throw new NotFoundException('Task not found')

    const now = new Date()

    const labelRows = await this.db
      .select({ name: labels.name })
      .from(taskLabelAssignments)
      .innerJoin(labels, eq(labels.id, taskLabelAssignments.labelId))
      .where(eq(taskLabelAssignments.taskId, taskId))

    const checklistRows = await this.db
      .select()
      .from(taskChecklists)
      .where(eq(taskChecklists.taskId, taskId))
      .orderBy(asc(taskChecklists.position))

    const checklistItems = checklistRows.length
      ? await this.db
          .select()
          .from(taskChecklistItems)
          .where(inArray(taskChecklistItems.checklistId, checklistRows.map((c) => c.id)))
          .orderBy(asc(taskChecklistItems.position))
      : []

    const itemsByChecklist = new Map<string, typeof checklistItems>()
    for (const item of checklistItems) {
      const list = itemsByChecklist.get(item.checklistId) ?? []
      list.push(item)
      itemsByChecklist.set(item.checklistId, list)
    }

    const subtaskRows = await this.db
      .select()
      .from(tasks)
      .where(eq(tasks.parentTaskId, taskId))
      .orderBy(asc(tasks.position))

    const valueRows = await this.db
      .select({
        name: customFieldDefinitions.name,
        type: customFieldDefinitions.type,
        value: customFieldValues.value,
      })
      .from(customFieldValues)
      .innerJoin(
        customFieldDefinitions,
        eq(customFieldDefinitions.id, customFieldValues.fieldId),
      )
      .where(eq(customFieldValues.taskId, taskId))

    return {
      title: task.title,
      description: task.description,
      priority: task.priority as TaskPriority,
      timeEstimate: task.timeEstimate ?? null,
      startDateOffsetDays: dateToOffsetDays(now, task.startDate),
      dueDateOffsetDays: dateToOffsetDays(now, task.dueDate),
      labels: labelRows.map((l) => l.name),
      checklists: checklistRows.map((c) => ({
        title: c.title,
        items: (itemsByChecklist.get(c.id) ?? []).map((i) => ({ content: i.content })),
      })),
      subtasks: subtaskRows.map((s) => ({
        title: s.title,
        description: s.description,
        priority: s.priority as TaskPriority,
        timeEstimate: s.timeEstimate ?? null,
        dueDateOffsetDays: dateToOffsetDays(now, s.dueDate),
      })),
      customFieldValues: valueRows
        .filter((r) => r.value && r.value.v !== null && r.value.v !== undefined)
        .map((r) => ({ fieldName: r.name, value: r.value.v ?? null })),
    }
  }

  private async resolveLabelIds(
    workspaceId: string,
    names: string[],
    _creatorId: string,
  ): Promise<string[]> {
    if (!names?.length) return []
    const unique = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)))
    if (unique.length === 0) return []

    const existing = await this.db
      .select({ id: labels.id, name: labels.name })
      .from(labels)
      .where(and(eq(labels.workspaceId, workspaceId), inArray(labels.name, unique)))

    const existingByName = new Map(existing.map((l) => [l.name, l.id]))
    const missing = unique.filter((n) => !existingByName.has(n))
    if (missing.length) {
      const created = await this.db
        .insert(labels)
        .values(missing.map((name) => ({ workspaceId, name, color: '#94a3b8' })))
        .returning({ id: labels.id, name: labels.name })
      for (const l of created) existingByName.set(l.name, l.id)
    }

    return unique
      .map((n) => existingByName.get(n))
      .filter((id): id is string => !!id)
  }

  private async materialiseChecklists(
    taskId: string,
    checklists: TaskTemplatePayload['checklists'],
  ) {
    if (!checklists?.length) return
    for (let i = 0; i < checklists.length; i++) {
      const cl = checklists[i]
      const [row] = await this.db
        .insert(taskChecklists)
        .values({ taskId, title: cl.title || `Checklist ${i + 1}`, position: i })
        .returning()
      if (!row || !cl.items?.length) continue
      await this.db.insert(taskChecklistItems).values(
        cl.items.map((it, idx) => ({
          checklistId: row.id,
          content: it.content,
          position: idx,
        })),
      )
    }
  }

  private async materialiseCustomFieldValues(
    taskId: string,
    projectId: string,
    values: TaskTemplatePayload['customFieldValues'],
  ) {
    if (!values?.length) return
    const defs = await this.db
      .select({ id: customFieldDefinitions.id, name: customFieldDefinitions.name })
      .from(customFieldDefinitions)
      .where(eq(customFieldDefinitions.projectId, projectId))
    const byName = new Map(defs.map((d) => [d.name, d.id]))

    const rows = values
      .map((v) => {
        const fieldId = byName.get(v.fieldName)
        if (!fieldId) return null
        return { taskId, fieldId, value: { v: v.value ?? null } as any }
      })
      .filter((r): r is { taskId: string; fieldId: string; value: any } => !!r)

    if (rows.length === 0) return
    await this.db.insert(customFieldValues).values(rows)
  }

  private async materialiseSubtasks(
    listId: string,
    parentTaskId: string,
    subtasks: TaskTemplatePayload['subtasks'],
    actorId: string,
    now: Date,
  ) {
    if (!subtasks?.length) return
    for (const st of subtasks) {
      await this.tasksService.createTask({
        listId,
        parentTaskId,
        title: st.title,
        description: st.description ?? undefined,
        priority: st.priority,
        timeEstimate: st.timeEstimate ?? undefined,
        dueDate: offsetToDate(now, st.dueDateOffsetDays) ?? undefined,
        createdById: actorId,
      })
    }
  }

  private async resolveTaskContext(taskId: string) {
    const [row] = await this.db
      .select({
        workspaceId: spaces.workspaceId,
        spaceId:     spaces.id,
        projectId:   lists.projectId,
        listId:      tasks.listId,
      })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(tasks.id, taskId))
      .limit(1)
    return row ?? null
  }

  private async resolveListContext(listId: string) {
    const [row] = await this.db
      .select({
        workspaceId: spaces.workspaceId,
        projectId:   lists.projectId,
      })
      .from(lists)
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(lists.id, listId))
      .limit(1)
    return row ?? null
  }

  // -------------------------------------------------------- validation

  private normaliseName(raw: string): string {
    // Non-string names (number/object/array) threw on `.trim()` → 500; coerce to
    // '' so the "Name is required" 400 fires instead.
    const trimmed = (typeof raw === 'string' ? raw : '').trim()
    if (!trimmed) throw new BadRequestException('Name is required')
    if (trimmed.length > NAME_MAX) {
      throw new BadRequestException(`Name must be ${NAME_MAX} characters or fewer`)
    }
    return trimmed
  }

  private normaliseDescription(raw: string | null): string | null {
    if (raw === null || raw === undefined) return null
    const trimmed = String(raw).trim()
    if (!trimmed) return null
    if (trimmed.length > DESCRIPTION_MAX) {
      throw new BadRequestException(`Description must be ${DESCRIPTION_MAX} characters or fewer`)
    }
    return trimmed
  }

  /**
   * Defence-in-depth shaping for `payload`. We accept JSON from the
   * client so this drops unknown keys, clamps array lengths, coerces
   * priority/numbers, and forbids nested subtasks (the schema supports
   * only one level).
   */
  private normalisePayload(raw: Partial<TaskTemplatePayload>): TaskTemplatePayload {
    const priority = clampPriority(raw.priority)
    return {
      title: String(raw.title ?? '').slice(0, 500),
      description:
        raw.description == null
          ? null
          : String(raw.description).slice(0, 10_000),
      priority,
      timeEstimate: clampNumber(raw.timeEstimate, 0),
      startDateOffsetDays: clampNumber(raw.startDateOffsetDays, -3650, 3650),
      dueDateOffsetDays: clampNumber(raw.dueDateOffsetDays, -3650, 3650),
      labels: (raw.labels ?? [])
        .filter((s): s is string => typeof s === 'string')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, MAX_LABELS),
      checklists: (raw.checklists ?? [])
        .slice(0, MAX_CHECKLISTS)
        .map((c) => ({
          title: String(c?.title ?? '').slice(0, 200),
          items: (c?.items ?? [])
            .filter((i: any) => i && typeof i.content === 'string')
            .slice(0, MAX_CHECKLIST_ITEMS)
            .map((i: any) => ({ content: String(i.content).slice(0, 500) })),
        })),
      subtasks: (raw.subtasks ?? [])
        .slice(0, MAX_SUBTASKS)
        .map((s) => ({
          title: String(s?.title ?? '').slice(0, 500),
          description: s?.description == null ? null : String(s.description).slice(0, 10_000),
          priority: clampPriority(s?.priority),
          timeEstimate: clampNumber(s?.timeEstimate, 0),
          dueDateOffsetDays: clampNumber(s?.dueDateOffsetDays, -3650, 3650),
        })),
      customFieldValues: (raw.customFieldValues ?? [])
        .filter((v: any) => v && typeof v.fieldName === 'string')
        .slice(0, MAX_CUSTOM_FIELDS)
        .map((v: any) => ({
          fieldName: String(v.fieldName).slice(0, 200),
          value:
            typeof v.value === 'string' ||
            typeof v.value === 'number' ||
            typeof v.value === 'boolean'
              ? v.value
              : null,
        })),
    }
  }

  private toView(row: typeof taskTemplates.$inferSelect): TaskTemplateView {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      name: row.name,
      description: row.description,
      icon: row.icon,
      payload: row.payload,
      usageCount: row.usageCount,
      createdById: row.createdById,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }
}

function clampPriority(value: unknown): TaskPriority {
  return value === 'urgent' || value === 'high' || value === 'normal' || value === 'low'
    ? value
    : 'normal'
}

function clampNumber(value: unknown, min: number, max?: number): number | null {
  if (value === null || value === undefined) return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  if (n < min) return min
  if (max !== undefined && n > max) return max
  return Math.round(n)
}

function offsetToDate(base: Date, offsetDays: number | null): Date | null {
  if (offsetDays === null || offsetDays === undefined) return null
  const d = new Date(base)
  d.setDate(d.getDate() + offsetDays)
  return d
}

function dateToOffsetDays(now: Date, value: Date | null): number | null {
  if (!value) return null
  const ms = value.getTime() - now.getTime()
  if (!Number.isFinite(ms)) return null
  return Math.round(ms / (24 * 60 * 60 * 1000))
}

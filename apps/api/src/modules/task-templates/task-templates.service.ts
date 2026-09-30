import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common'
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
  workspaceMembers,
  type TaskTemplatePayload,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { isUuid } from '../../common/validation/uuid'
import { TasksService } from '../tasks/tasks.service'
import { SecurityService } from '../security/security.service'
import { CustomFieldsService } from '../custom-fields/custom-fields.service'
import { readableTask } from '../../common/permissions/read-access'

const NAME_MAX = 120
const DESCRIPTION_MAX = 1000
const MAX_SUBTASKS = 100
const MAX_CHECKLISTS = 20
const MAX_CHECKLIST_ITEMS = 100
const MAX_LABELS = 50
const MAX_CUSTOM_FIELDS = 100

type TaskPriority = 'urgent' | 'high' | 'normal' | 'low'

/** One custom-field value as a template holds it (`TaskTemplatePayload`). */
export type TemplateFieldValue = TaskTemplatePayload['customFieldValues'][number]['value']

/**
 * `found-30-sep/templates-null-array-field-values` — what a template may hold
 * as a custom-field value: one text, number or yes/no, or a LIST OF TEXTS,
 * which is how a People, Labels or Tasks field holds its value (§V2-01c, 0158).
 * The payload's type was widened to `string[]` so that a template would not
 * drop a task's people field, and this kept only the one-value shapes, so
 * every write — create, save from a task, each PATCH with a payload — stored
 * the list as null. Anything else (an object, a list holding anything but
 * text) is still null.
 */
export function templateFieldValue(value: unknown): TemplateFieldValue {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) return [...value]
  return null
}

/**
 * THE FIELDS A TEMPLATE NEVER WRITES ONTO A TASK, and so never takes from one —
 * nor a duplicate onto its copy (`found-30-sep/duplicate-copies-votes-and-files`).
 *
 *   · `voting` — a vote is its voter's own: the field's route toggles the
 *     caller's vote and nobody else's (`CustomFieldsService.setValue`). Copied
 *     from a template, it would be cast on every task made from it, by people
 *     who never saw that task; copied by a duplicate, on a task its voters
 *     never saw either.
 *   · `files` — the ids are attachments of the task the template was saved
 *     from, or the task duplicated, and the new task has none of them: the
 *     route takes only files attached to the task itself.
 *   · `progress_auto` and `formula` — worked out on read; no value is stored.
 */
const NOT_FROM_TEMPLATES: ReadonlySet<string> = new Set(['voting', 'files', 'progress_auto', 'formula'])

/** The fields whose value is a list a template may write: people, options, tasks. */
const LIST_FIELDS: ReadonlySet<string> = new Set(['people', 'labels', 'tasks'])

/**
 * `found-30-sep/templates-null-array-field-values` — a template's value, as
 * the field of that name in the new task's project can hold it, or `undefined`
 * when it cannot and nothing is written.
 *
 * A LIST IS CHECKED AS THE FIELD'S OWN ROUTE CHECKS IT, because this write goes
 * round that route (`CustomFieldsService.setValue`): people who are members of
 * the workspace NOW, options the field defines, tasks in the workspace. What is
 * not is left out, each entry once, and a list with nothing left is not
 * written. A template is saved from one project and used in any, where a field
 * of the same name has its own options; and somebody named in it may have left
 * since. A list is never written into a one-value field, nor one value into a
 * list field.
 *
 * What this answers is then asked of the field's own rules, list or one value,
 * before it is written (`materialiseTemplateValues`, which asks
 * `CustomFieldsService.checkValue`): one value into a one-value field was
 * written as it came, text into a Number field and an option a Dropdown does
 * not define among it (`found-30-sep/template-values-written-unchecked`).
 */
export function fitTemplateValue(
  field: { type: string; options?: Array<{ value: string }> | null },
  value: TemplateFieldValue | undefined,
  known: { members: ReadonlySet<string>; tasks: ReadonlySet<string> },
): TemplateFieldValue | undefined {
  if (value === null || value === undefined) return undefined
  if (NOT_FROM_TEMPLATES.has(field.type)) return undefined
  const listField = LIST_FIELDS.has(field.type)
  if (!Array.isArray(value)) return listField ? undefined : value
  if (!listField) return undefined
  const options = new Set((field.options ?? []).map((o) => o.value))
  const allowed =
    field.type === 'people' ? known.members
    : field.type === 'tasks' ? known.tasks
    : options
  const kept = [...new Set(value)].filter((v) => allowed.has(v))
  return kept.length ? kept : undefined
}

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
  /**
   * THE FIELD ROUTE'S OWN RULES for a value (`CustomFieldsService.checkValue`),
   * which every value this service writes onto a task passes
   * (`found-30-sep/template-values-written-unchecked`).
   */
  private readonly customFields: CustomFieldsService

  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly tasksService: TasksService,
    private readonly security: SecurityService,
    // Optional so a service built by hand in a unit test needs no fourth
    // argument: it then asks the same rules of the same database.
    @Optional() customFields?: CustomFieldsService,
  ) {
    this.customFields = customFields ?? new CustomFieldsService(db)
  }

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
   * values keyed by definition name — a People, Labels or Tasks field's
   * list among them, and no votes or files (`NOT_FROM_TEMPLATES`).
   *
   * Status is intentionally NOT captured because each list has its
   * own custom-status pipeline — see TaskTemplatePayload docstring.
   */
  async saveFromTask(
    workspaceId: string,
    taskId: string,
    actor: { id: string; email?: string; role?: string | null },
    dto: { name: string; description?: string | null; icon?: string | null },
  ): Promise<TaskTemplateView> {
    const ctx = await this.resolveTaskContext(taskId)
    if (!ctx) throw new NotFoundException('Task not found')
    if (ctx.workspaceId !== workspaceId) throw new NotFoundException('Task not found in this workspace')
    await this.assertTaskOpenTo(workspaceId, taskId, actor)

    const payload = await this.snapshotTask(taskId, { forTemplate: true })
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
   * target project, each as far as that field can hold it —
   * `fitTemplateValue`, then the field route's own rules) are all
   * reconstructed.
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
    await this.materialiseTemplateValues(task.id, listCtx.projectId, workspaceId, payload.customFieldValues)
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
   *
   * ITS CUSTOM-FIELD VALUES ARE WRITTEN AS A TEMPLATE'S ARE
   * (`materialiseTemplateValues`), and were written unchecked, every one the
   * task held (`found-30-sep/duplicate-copies-votes-and-files`): the copy carried
   * the original's votes, cast by people who never saw it, and its Files value,
   * naming attachments of the original that the copy does not have. ClickUp's
   * help centre says a duplicate carries what you choose to include of the task,
   * and says nothing of a Voting or a Files field; the rules those fields' own
   * route keeps decide it. The copy carries no votes and no files, and each
   * other value as far as the field's route would take it now.
   */
  async duplicateTask(workspaceId: string, taskId: string, actor: { id: string; email?: string; role?: string | null }) {
    const ctx = await this.resolveTaskContext(taskId)
    if (!ctx) throw new NotFoundException('Task not found')
    if (ctx.workspaceId !== workspaceId) throw new NotFoundException('Task not found in this workspace')
    await this.assertTaskOpenTo(workspaceId, taskId, actor)

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
    await this.materialiseTemplateValues(task.id, ctx.projectId, workspaceId, payload.customFieldValues)
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

  /*
   * THE TASK IS COPIED ONLY FOR SOMEBODY WHO MAY OPEN IT
   * (`found-30-sep/duplicate-reads-what-its-caller-cannot`). Duplicate asked
   * membership and the right to add to the list, and Save as template asked
   * the template key; neither asked the task's read rule. A member refused a
   * private task duplicated it and read its words from the copy, and a member
   * holding the key saved it as a template. Refused as a task that is not
   * there, as every read of a task its reader may not open is.
   */
  private async assertTaskOpenTo(workspaceId: string, taskId: string, actor: { id: string; role?: string | null }) {
    if (!(await readableTask(this.db, workspaceId, taskId, { id: actor.id, role: actor.role ?? null }))) {
      throw new NotFoundException('Task not found in this workspace')
    }
  }

  private async requireTemplate(workspaceId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(taskTemplates)
      .where(and(eq(taskTemplates.id, id), eq(taskTemplates.workspaceId, workspaceId)))
      .limit(1)
    if (!row) throw new NotFoundException('Template not found')
    return row
  }

  /**
   * The task as a payload. `forTemplate` leaves out the fields a template never
   * writes (`NOT_FROM_TEMPLATES`); a duplicate takes the task as it is, and what
   * of it is written onto the copy is decided as a template's values are
   * (`materialiseTemplateValues`).
   */
  private async snapshotTask(
    taskId: string,
    { forTemplate = false }: { forTemplate?: boolean } = {},
  ): Promise<TaskTemplatePayload> {
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
        .filter((r) => !forTemplate || !NOT_FROM_TEMPLATES.has(r.type))
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

  /**
   * A TEMPLATE's custom-field values, onto the task made from it — or a
   * DUPLICATED task's, onto its copy: each to the field of that name in the
   * task's project, as far as `fitTemplateValue` says that field can hold it.
   * The people and tasks a list names are asked of the database once each, and
   * only ids shaped like ids are asked: an id that is not one would have
   * Postgres refuse the whole query (`isUuid`).
   *
   * AND EACH AS THE FIELD'S OWN ROUTE WOULD TAKE IT, by that route's rules
   * (`CustomFieldsService.checkValue`), not a copy of them: a value the route
   * refuses (400) is not written, and the rest are. One value went into a
   * one-value field unchecked, so a template saved in one project wrote text
   * into another's Number field, an option its Dropdown does not define, or
   * words into an Email field (`found-30-sep/template-values-written-unchecked`),
   * and a duplicate wrote every value its original held, votes and files among
   * them (`found-30-sep/duplicate-copies-votes-and-files`). ClickUp's help centre
   * says nothing of a template applied where a field of its name takes another
   * kind of value; nothing is written that the field itself would refuse.
   */
  private async materialiseTemplateValues(
    taskId: string,
    projectId: string,
    workspaceId: string,
    values: TaskTemplatePayload['customFieldValues'],
  ) {
    if (!values?.length) return
    const defs = await this.db
      .select({
        id: customFieldDefinitions.id,
        name: customFieldDefinitions.name,
        type: customFieldDefinitions.type,
        options: customFieldDefinitions.options,
      })
      .from(customFieldDefinitions)
      .where(eq(customFieldDefinitions.projectId, projectId))
    const byName = new Map(defs.map((d) => [d.name, d]))

    const named = (type: string) =>
      Array.from(
        new Set(
          values.flatMap((v) =>
            byName.get(v.fieldName)?.type === type && Array.isArray(v.value) ? v.value.filter(isUuid) : [],
          ),
        ),
      )
    const people = named('people')
    const taskIds = named('tasks')
    const members = people.length
      ? await this.db
          .select({ id: workspaceMembers.userId })
          .from(workspaceMembers)
          .where(and(eq(workspaceMembers.workspaceId, workspaceId), inArray(workspaceMembers.userId, people)))
      : []
    const tasksHere = taskIds.length
      ? await this.db
          .select({ id: tasks.id })
          .from(tasks)
          .innerJoin(lists, eq(lists.id, tasks.listId))
          .innerJoin(projects, eq(projects.id, lists.projectId))
          .innerJoin(spaces, eq(spaces.id, projects.spaceId))
          .where(and(eq(spaces.workspaceId, workspaceId), inArray(tasks.id, taskIds)))
      : []
    const known = { members: new Set(members.map((m) => m.id)), tasks: new Set(tasksHere.map((t) => t.id)) }

    const rows: Array<typeof customFieldValues.$inferInsert> = []
    for (const v of values) {
      const def = byName.get(v.fieldName)
      if (!def) continue
      const value = fitTemplateValue(def, v.value, known)
      if (value === undefined) continue
      const taken = await this.customFields.checkValue(workspaceId, taskId, def, value).then(
        (checked) => ({ checked }),
        (err: unknown) => {
          if (err instanceof BadRequestException) return null
          throw err
        },
      )
      if (!taken) continue
      rows.push({ taskId, fieldId: def.id, value: { v: taken.checked } })
    }
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
          value: templateFieldValue(v.value),
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

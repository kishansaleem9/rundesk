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
import { CustomFieldsService, fieldIsOnList, fieldIsOnTask } from '../custom-fields/custom-fields.service'
import { readableTask } from '../../common/permissions/read-access'
import { DEFAULT_LABEL_COLOR, type LabelByName } from '../tasks/task-values'

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

/**
 * `found-30-sep/template-values-find-fields-by-name-alone` — WHICH FIELD EACH
 * VALUE GOES INTO, among the fields the new task has (`fieldIsOnList`: its
 * project's, less those scoped to another list). Values were mapped by name
 * over every field of the project, so one went into a field scoped to another
 * list, which the task does not have and no reader shows, or into whichever of
 * two fields of one name the query returned last; and two values meant for two
 * fields of one name went into one, which the table refuses (a task holds one
 * value per field), so the task was made with none of them (409, measured).
 *
 *   · BY FIELD FIRST. A value taken from a task names the field it came from
 *     (`fieldId`), and goes back into that field wherever the new task has it:
 *     a duplicate's always, in its own list, and a template's where it is
 *     applied in the list it was saved from.
 *   · BY NAME OTHERWISE — another project, another list, a template written
 *     by hand — and only into a field no value has taken: the one field of
 *     that name the task has; of two, the one scoped to the task's own list
 *     over the project's, being made for this list; of two at the same reach,
 *     neither, since nothing says which was meant (`checkedFormulaConfig`
 *     refuses a formula over such a name for the same reason).
 *   · EACH FIELD ONCE, the value taken by field before any taken by name.
 *
 * ClickUp's templates carry their fields themselves, and its own API takes a
 * value only for a field "applicable" to the task; it lets two fields share a
 * name. What a value written by name should do when two do is not said
 * anywhere, so the rule above is this product's.
 */
export function fieldsForTemplateValues<F extends { id: string; name: string; listId?: string | null }>(
  fields: readonly F[],
  values: TaskTemplatePayload['customFieldValues'],
  listId: string,
): Array<{ field: F; value: TemplateFieldValue }> {
  const onTask = fields.filter((f) => fieldIsOnList(f, listId))
  const byId = new Map(onTask.map((f) => [f.id, f]))
  const planned = new Map<string, { field: F; value: TemplateFieldValue }>()
  const byName: TaskTemplatePayload['customFieldValues'] = []
  for (const v of values) {
    const same = v.fieldId ? byId.get(v.fieldId) : undefined
    if (!same) byName.push(v)
    else if (!planned.has(same.id)) planned.set(same.id, { field: same, value: v.value })
  }
  for (const v of byName) {
    const named = onTask.filter((f) => f.name === v.fieldName)
    const own = named.filter((f) => f.listId === listId)
    const field = named.length === 1 ? named[0] : own.length === 1 ? own[0] : undefined
    if (field && !planned.has(field.id)) planned.set(field.id, { field, value: v.value })
  }
  return [...planned.values()]
}

/**
 * What the person set in the create modal beside the template they chose
 * (`InstantiateTemplateDto`, checked as `POST /tasks` checks the same fields).
 * A field they left alone is absent.
 */
export interface TemplateFormValues {
  priority?: TaskPriority
  taskTypeId?: string
  description?: string
  /** ISO strings, as `POST /tasks` takes them. */
  startDate?: string
  dueDate?: string
  /**
   * Whether each carries a time of day (`found-6-oct/a-time-on-utc-midnight-reads-as-no-time`):
   * 17:00 typed in Los Angeles is UTC midnight, and only the flag says it is a time.
   */
  startDateHasTime?: boolean
  dueDateHasTime?: boolean
  /** Seconds. */
  timeEstimate?: number
  assigneeIds?: string[]
  labelIds?: string[]
  /** Tags typed beside the template, by name (`found-30-sep/refused-create-leaves-tags`). */
  labelsByName?: LabelByName[]
}

/**
 * `found-30-sep/template-submit-ignores-the-form` — THE TASK A TEMPLATE MAKES,
 * WITH WHAT THE PERSON SET BESIDE IT. The create modal sent the route the list
 * and the title alone, and the priority, description, dates, estimate, tags,
 * task type and assignees typed into the same form were dropped without a word.
 *
 * ClickUp's help centre (read through search excerpts, the site being blocked
 * here) says templates "are merged when applied to an existing task", and its
 * own merge of one task into another keeps the target's "tags, priorities,
 * dates … and estimated time", adds the other's description "to the bottom" of
 * the target's, and adds its assignees ("Merge tasks"). Its feedback board
 * records the description rule for a template in so many words: "When you
 * append a template that adds to the description, it gets added to the end of
 * the description". The form is the task here, and the template is what is
 * merged into it:
 *
 *   · ONE VALUE — priority, task type, start and due dates, estimate: what the
 *     person set wins. What they left alone is the template's, as before.
 *   · A DESCRIPTION typed comes first, and the template's follows it after a
 *     blank line; either alone is the description.
 *   · TAGS AND ASSIGNEES are the template's and the form's together, each once.
 *     A template holds no assignees, so those are the form's. The template's
 *     tags go BY NAME, with the tags typed beside it, and `createTask` finds
 *     them or makes them only once the task is made
 *     (`found-30-sep/refused-create-leaves-tags`): they were made here first,
 *     so a create refused for its type or its people left them behind.
 *
 * Checklists, subtasks and custom-field values have no place in the form and
 * come from the template, as they did (`instantiate`).
 */
export function templateWithForm(
  payload: Pick<TaskTemplatePayload, 'description' | 'priority' | 'timeEstimate' | 'startDateOffsetDays' | 'dueDateOffsetDays' | 'labels'>,
  form: TemplateFormValues,
  now: Date,
) {
  const typed = (form.description ?? '').trim()
  const own = (payload.description ?? '').trim()
  const description = !typed ? payload.description ?? undefined : own ? `${typed}\n\n${own}` : typed
  const labelIds = [...new Set(form.labelIds ?? [])]
  const labelsByName: LabelByName[] = [
    ...(payload.labels ?? []).map((name) => ({ name, color: DEFAULT_LABEL_COLOR })),
    ...(form.labelsByName ?? []),
  ]
  const assigneeIds = [...new Set(form.assigneeIds ?? [])]
  return {
    description,
    priority: form.priority ?? payload.priority,
    taskTypeId: form.taskTypeId || undefined,
    timeEstimate: form.timeEstimate ?? payload.timeEstimate ?? undefined,
    startDate: form.startDate ? new Date(form.startDate) : offsetToDate(now, payload.startDateOffsetDays) ?? undefined,
    dueDate: form.dueDate ? new Date(form.dueDate) : offsetToDate(now, payload.dueDateOffsetDays) ?? undefined,
    // A date set in the form goes with its time flag; the template's own is read from its instant (`taskDateTimeFlags`).
    startDateHasTime: form.startDate ? form.startDateHasTime : undefined,
    dueDateHasTime: form.dueDate ? form.dueDateHasTime : undefined,
    labelIds: labelIds.length ? labelIds : undefined,
    labelsByName: labelsByName.length ? labelsByName : undefined,
    assigneeIds: assigneeIds.length ? assigneeIds : undefined,
  }
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
   * values keyed by definition name and by the field itself — a People,
   * Labels or Tasks field's list among them, and no votes or files
   * (`NOT_FROM_TEMPLATES`).
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

    const payload = await this.snapshotTask(taskId, ctx, { forTemplate: true })
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
   * and custom-field values (each into a field the new task has, by the
   * field it was taken from or else by name — `fieldsForTemplateValues` —
   * and as far as that field can hold it — `fitTemplateValue`, then the
   * field route's own rules) are all reconstructed.
   *
   * Date offsets are interpreted as days from `now` so a template
   * with `dueDateOffsetDays: 7` always produces a task due in a week.
   *
   * What the person set in the create modal beside the template (`form`) wins
   * over the template's one values, or adds to its description, tags and
   * assignees (`templateWithForm`). Create instantly sends none of it.
   */
  async instantiate(
    workspaceId: string,
    templateId: string,
    actor: { id: string; email?: string },
    dto: { listId: string; titleOverride?: string } & TemplateFormValues,
  ) {
    const template = await this.requireTemplate(workspaceId, templateId)
    const listCtx = await this.resolveListContext(dto.listId)
    if (!listCtx) throw new NotFoundException('Target list not found')
    if (listCtx.workspaceId !== workspaceId) {
      throw new BadRequestException('Target list belongs to a different workspace')
    }

    const payload = template.payload
    const now = new Date()

    // The form's task type, people and labels are asked by `createTask` as
    // `POST /tasks` asks them — a type of the list's, people who can see it,
    // labels of this workspace — before anything is written; and the tags it
    // is given by name (the template's, and those typed beside it) are made
    // there, only once the task is (`found-30-sep/refused-create-leaves-tags`).
    const task = await this.tasksService.createTask({
      listId: dto.listId,
      title: dto.titleOverride?.trim() || payload.title || template.name,
      ...templateWithForm(payload, dto, now),
      createdById: actor.id,
    })
    if (!task) throw new Error('Task creation returned no row')

    await this.materialiseChecklists(task.id, payload.checklists)
    await this.materialiseTemplateValues(task.id, { projectId: listCtx.projectId, listId: dto.listId }, workspaceId, payload.customFieldValues)
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
   *
   * AND EACH INTO THE FIELD IT CAME FROM, the copy being in the same list with
   * the same fields (`found-30-sep/template-values-find-fields-by-name-alone`).
   * It copied by name, so two fields of one name, a project's and a list's,
   * both set, put both values into one field, which the table refuses: 409,
   * after the copy was made, with none of its values (measured). Every value
   * copied is one of a field the task has (`snapshotTask`), so each finds its
   * field and none falls to a name: a value the task still held for a field it
   * no longer had went into another field of that name on the copy.
   */
  async duplicateTask(workspaceId: string, taskId: string, actor: { id: string; email?: string; role?: string | null }) {
    const ctx = await this.resolveTaskContext(taskId)
    if (!ctx) throw new NotFoundException('Task not found')
    if (ctx.workspaceId !== workspaceId) throw new NotFoundException('Task not found in this workspace')
    await this.assertTaskOpenTo(workspaceId, taskId, actor)

    const [src] = await this.db
      .select({
        startDate: tasks.startDate,
        dueDate: tasks.dueDate,
        startDateHasTime: tasks.startDateHasTime,
        dueDateHasTime: tasks.dueDateHasTime,
      })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1)
    const assignees = await this.db
      .select({ userId: taskAssignees.userId })
      .from(taskAssignees)
      .where(eq(taskAssignees.taskId, taskId))
    const assigneeIds = assignees.map((a) => a.userId)
    /*
     * The original's own tags, by id: they are this workspace's, and a copy
     * needs none made (`found-30-sep/refused-create-leaves-tags` — they were
     * looked up by name here, and any not found made, before the copy was
     * asked about).
     */
    const tagged = await this.db
      .select({ labelId: taskLabelAssignments.labelId })
      .from(taskLabelAssignments)
      .where(eq(taskLabelAssignments.taskId, taskId))
    const labelIds = tagged.map((t) => t.labelId)

    const payload = await this.snapshotTask(taskId, ctx)
    const now = new Date()

    const task = await this.tasksService.createTask({
      listId: ctx.listId,
      title: `${payload.title || 'Task'} (copy)`,
      description: payload.description ?? undefined,
      priority: payload.priority,
      timeEstimate: payload.timeEstimate ?? undefined,
      startDate: src?.startDate ?? undefined,
      dueDate: src?.dueDate ?? undefined,
      // The copy's dates carry a time where the task's did (`taskDateTimeFlags`).
      startDateHasTime: src?.startDateHasTime,
      dueDateHasTime: src?.dueDateHasTime,
      labelIds: labelIds.length ? labelIds : undefined,
      assigneeIds: assigneeIds.length ? assigneeIds : undefined,
      createdById: actor.id,
    })
    if (!task) throw new Error('Task creation returned no row')

    await this.materialiseChecklists(task.id, payload.checklists)
    await this.materialiseTemplateValues(task.id, { projectId: ctx.projectId, listId: ctx.listId }, workspaceId, payload.customFieldValues)
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
   *
   * ITS VALUES ARE THOSE OF THE FIELDS IT HAS, where it is now (`place`, its
   * project and list: `fieldIsOnTask`), as its reader shows them
   * (`CustomFieldsService.getValuesForTask`). A task keeps its value rows when
   * it is moved (`moveTask` changes its list alone), so a task moved out of a
   * field's list, or in from another project, still holds values for fields it
   * no longer has, which nobody sees on it. The snapshot took every row, and a
   * value whose field the new task lacks is written by name
   * (`fieldsForTemplateValues`): a duplicate showed the project's field of that
   * name holding the hidden value while the original showed it empty, and a
   * template saved from the task carried it too (measured on lane 7; review of
   * `found-30-sep/template-values-find-fields-by-name-alone`).
   */
  private async snapshotTask(
    taskId: string,
    place: { projectId: string; listId: string },
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
        // The field each value came from, so it goes back into that field
        // (`fieldsForTemplateValues`), not into whichever shares its name.
        fieldId: customFieldValues.fieldId,
        name: customFieldDefinitions.name,
        type: customFieldDefinitions.type,
        value: customFieldValues.value,
        // The field's own place, to ask whether the task has it (`fieldIsOnTask`).
        projectId: customFieldDefinitions.projectId,
        listId: customFieldDefinitions.listId,
      })
      .from(customFieldValues)
      .innerJoin(
        customFieldDefinitions,
        eq(customFieldDefinitions.id, customFieldValues.fieldId),
      )
      .where(eq(customFieldValues.taskId, taskId))
      // IN THE ORDER THE TASK SHOWS ITS FIELDS, not the order the rows happen to
      // come back in: where two values fall to one field by name, the first is
      // written (`fieldsForTemplateValues`), and which one that was changed
      // from run to run (measured, `found-30-sep/template-values-find-fields-by-name-alone`).
      .orderBy(asc(customFieldDefinitions.position), asc(customFieldDefinitions.createdAt))

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
        .filter((r) => fieldIsOnTask(r, place))
        .filter((r) => r.value && r.value.v !== null && r.value.v !== undefined)
        .filter((r) => !forTemplate || !NOT_FROM_TEMPLATES.has(r.type))
        .map((r) => ({ ...(r.fieldId ? { fieldId: r.fieldId } : {}), fieldName: r.name, value: r.value.v ?? null })),
    }
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
   * DUPLICATED task's, onto its copy: each to a field the task has, by the
   * field it came from or else by name (`fieldsForTemplateValues`), as far as
   * `fitTemplateValue` says that field can hold it.
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
    target: { projectId: string; listId: string },
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
        listId: customFieldDefinitions.listId,
      })
      .from(customFieldDefinitions)
      .where(eq(customFieldDefinitions.projectId, target.projectId))
    // Only the fields the new task has, each value into one of them at most
    // (`found-30-sep/template-values-find-fields-by-name-alone`).
    const planned = fieldsForTemplateValues(defs, values, target.listId)

    const named = (type: string) =>
      Array.from(
        new Set(
          planned.flatMap(({ field, value }) =>
            field.type === type && Array.isArray(value) ? value.filter(isUuid) : [],
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
    for (const { field: def, value: held } of planned) {
      const value = fitTemplateValue(def, held, known)
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
          // The field it was taken from, kept only when it is shaped like an id:
          // it is compared with the new task's fields, never trusted beyond them.
          ...(typeof v.fieldId === 'string' && isUuid(v.fieldId) ? { fieldId: v.fieldId } : {}),
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

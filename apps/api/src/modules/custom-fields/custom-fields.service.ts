import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common'
import { and, eq, or, asc, isNull, isNotNull, inArray } from 'drizzle-orm'
import {
  customFieldDefinitions,
  customFieldValues,
  projects,
  spaces,
  tasks,
  lists,
  taskChecklists,
  taskChecklistItems,
  taskComments,
  workspaceMembers,
  taskAttachments,
  customFieldTypeEnum,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { computeProgress, toProgressConfig, type ProgressInputs } from './progress'
import {
  evaluateFormula,
  parseFormula,
  toFormulaConfig,
  FormulaError,
  FORMULA_NUMERIC_TYPES,
} from './formula'

/**
 * THE ONE LIST OF FIELD TYPES, taken from the column that stores them.
 *
 * It used to be written out here as a union and again, ten of the nineteen, in
 * the controller. That is this audit's *duplicated list* defect: each copy is
 * individually plausible, and the short one had already drifted. `type` is a
 * Postgres enum, so the column already holds the canonical set — and deriving
 * from it means a type added to the schema cannot be missing here.
 */
export const CUSTOM_FIELD_TYPES = customFieldTypeEnum.enumValues
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number]
const CUSTOM_FIELD_TYPE_SET: ReadonlySet<string> = new Set(CUSTOM_FIELD_TYPES)

/** `string[]` is §V2-01c's: `labels` and `people` hold several at once. */
type FieldValue = string | number | boolean | string[] | null

/**
 * §V2-01c — T-shirt Size is a FIXED set, not a per-field one.
 *
 * `dropdown` already covers "pick one of the options this field defines". The
 * whole point of a separate type is that everybody's sizes are the same, so
 * they are defined here rather than typed in again on every field.
 */
export const TSHIRT_SIZES = ['xs', 's', 'm', 'l', 'xl'] as const

/** The types that hold a list rather than one value. */
const MULTI_TYPES: ReadonlySet<string> = new Set(['labels', 'people', 'files', 'voting', 'tasks'])

/**
 * 0146 — a SIGNATURE is the strokes that were drawn, and nothing else.
 *
 * `stroke;stroke;…`, each stroke `x,y x,y …`, each coordinate an integer in a
 * 0–1000 box so the drawing scales to whatever it is rendered in. A stroke
 * needs two points, because one point is not a line and would render as
 * nothing at all — a value that stores as valid and draws as empty is the
 * quietest kind of lie a field can tell.
 */
const SIGNATURE_MAX_LENGTH = 20_000
const SIGNATURE_GRID = 1000

function assertSignature(value: unknown): asserts value is string {
  if (typeof value !== 'string') {
    throw new BadRequestException('A signature is the strokes that were drawn, given as a string')
  }
  if (value.length > SIGNATURE_MAX_LENGTH) {
    throw new BadRequestException(`A signature cannot be longer than ${SIGNATURE_MAX_LENGTH} characters`)
  }
  const strokes = value.split(';').filter((s) => s !== '')
  if (strokes.length === 0) {
    throw new BadRequestException('A signature needs at least one stroke — clear it instead of storing an empty one')
  }
  for (const stroke of strokes) {
    const points = stroke.trim().split(/\s+/).filter(Boolean)
    if (points.length < 2) {
      throw new BadRequestException('Every stroke needs at least two points — a single point draws nothing')
    }
    for (const point of points) {
      const parts = point.split(',')
      if (parts.length !== 2) {
        throw new BadRequestException(`"${point}" is not an x,y point`)
      }
      for (const n of parts) {
        if (!/^\d{1,4}$/.test(n) || Number(n) > SIGNATURE_GRID) {
          throw new BadRequestException(
            `"${point}" is outside the 0–${SIGNATURE_GRID} box a signature is drawn in`,
          )
        }
      }
    }
  }
}

@Injectable()
export class CustomFieldsService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  // ── Definition ownership guard ──────────────────────────────────────────────
  private async assertProjectInWorkspace(workspaceId: string, projectId: string) {
    const [row] = await this.db
      .select({ id: projects.id })
      .from(projects)
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(eq(projects.id, projectId), eq(spaces.workspaceId, workspaceId)))
      .limit(1)
    if (!row) throw new NotFoundException('Project not found in this workspace')
  }

  private async assertTaskInWorkspace(workspaceId: string, taskId: string) {
    const [row] = await this.db
      .select({ taskId: tasks.id, projectId: lists.projectId, listId: tasks.listId })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(eq(tasks.id, taskId), eq(spaces.workspaceId, workspaceId)))
      .limit(1)
    if (!row) throw new NotFoundException('Task not found in this workspace')
    return row
  }

  // ── Definitions ─────────────────────────────────────────────────────────────
  async listForProject(workspaceId: string, projectId: string) {
    await this.assertProjectInWorkspace(workspaceId, projectId)
    return this.db
      .select()
      .from(customFieldDefinitions)
      .where(eq(customFieldDefinitions.projectId, projectId))
      .orderBy(asc(customFieldDefinitions.position), asc(customFieldDefinitions.createdAt))
  }

  async createDefinition(
    workspaceId: string,
    projectId: string,
    dto: {
      name: string
      type: CustomFieldType
      isRequired?: boolean
      listId?: string
      options?: Array<{ label: string; value: string; color?: string }>
      config?: unknown
    },
  ) {
    await this.assertProjectInWorkspace(workspaceId, projectId)
    /*
     * The TYPE is validated here, and it was not before.
     *
     * `type` is a Postgres enum, so an unknown one reached the insert and came
     * back as a 22P02 cast error — a 500 that reads like the server is broken
     * rather than a 400 that says which types exist. Cheap to get wrong now
     * that a task can open this door as well as a project.
     */
    if (!CUSTOM_FIELD_TYPE_SET.has(dto.type as string)) {
      throw new BadRequestException(
        `Unknown custom field type "${dto.type}". One of: ${CUSTOM_FIELD_TYPES.join(', ')}`,
      )
    }
    // `options` must be an array when present — a non-array (e.g. {} or a bare
    // string) passes the length check below (undefined === 0 is false) and gets
    // stored, then crashes every reader that does `options.map(...)`.
    if (dto.options != null && !Array.isArray(dto.options)) {
      throw new BadRequestException('Custom field "options" must be an array')
    }
    // `labels` is a dropdown you can pick several of, so it needs options for
    // the same reason and the message names the type rather than assuming one.
    if ((dto.type === 'dropdown' || dto.type === 'labels') && (!dto.options || dto.options.length === 0)) {
      throw new BadRequestException(`${dto.type === 'labels' ? 'Labels' : 'Dropdown'} fields require at least one option`)
    }
    /*
     * 0146 — A FORMULA IS CHECKED BEFORE IT IS STORED, not when somebody reads
     * it. An expression that cannot be evaluated is a field that draws a blank
     * on every task forever, and the person who could have fixed it is the one
     * typing it in now. The references are resolved against the project's real
     * fields for the same reason: `{Budgte}` is a typo, and a typo that saves
     * is a field nobody can tell from an empty one.
     */
    const formulaConfig =
      dto.type === 'formula' ? await this.checkedFormulaConfig(projectId, dto.config) : null

    // Position = current max + 1
    const existing = await this.db
      .select({ position: customFieldDefinitions.position })
      .from(customFieldDefinitions)
      .where(eq(customFieldDefinitions.projectId, projectId))
    const nextPos = existing.length === 0 ? 0 : Math.max(...existing.map((r) => r.position)) + 1

    const [row] = await this.db
      .insert(customFieldDefinitions)
      .values({
        projectId,
        listId: dto.listId,
        name: dto.name,
        type: dto.type,
        isRequired: dto.isRequired ?? false,
        options: dto.options ?? null,
        // Normalised on the way in, so a half-written config cannot make the
        // percentage depend on which fields somebody happened to send.
        config:
          dto.type === 'progress_auto'
            ? toProgressConfig(dto.config)
            : dto.type === 'formula'
              ? formulaConfig
              : null,
        position: nextPos,
      })
      .returning()
    return row
  }

  /**
   * §V2-S16 frames `15:20` ("Add fields") and `15:30` ("Custom Fields" in the
   * task's `···` menu) — DEFINE a field from an open task, not just fill in the
   * ones somebody defined elsewhere.
   *
   * It resolves the task's project and delegates to `createDefinition`. It does
   * NOT re-implement it. Three creation paths already existed — the create
   * modal, the project shell and the list route — and this audit's *duplicated
   * list* defect is exactly what a fourth copy of the validation would be: the
   * list route's picker already offers six of the nineteen types, and nobody
   * noticed because each picker is individually plausible.
   *
   * `scope` decides which container the new field belongs to:
   *   · `project` (the default) — every task in the project gets it, which is
   *     what the panel's own empty-state hint has always promised.
   *   · `list` — only this task's list, stored as `listId` and honoured by
   *     `getValuesForTask`. Creating from a task is the first place where
   *     "just this list" is the obvious thing to want, and the narrowing was
   *     already built; until now nothing offered it.
   */
  async createDefinitionForTask(
    workspaceId: string,
    taskId: string,
    dto: {
      name: string
      type: CustomFieldType
      isRequired?: boolean
      scope?: 'project' | 'list'
      options?: Array<{ label: string; value: string; color?: string }>
      config?: unknown
    },
  ) {
    const task = await this.assertTaskInWorkspace(workspaceId, taskId)
    if (dto.scope !== undefined && dto.scope !== 'project' && dto.scope !== 'list') {
      throw new BadRequestException('scope must be "project" or "list"')
    }
    const { scope, ...rest } = dto
    return this.createDefinition(workspaceId, task.projectId, {
      ...rest,
      listId: scope === 'list' ? task.listId : undefined,
    })
  }

  /**
   * 0146 — the expression, checked against the fields it claims to read.
   *
   * Three separate refusals, and each one names the thing that is wrong,
   * because "invalid formula" tells the person typing it nothing they can act
   * on. `excludeFieldId` is the field being edited: a formula that refers to
   * itself would recurse, and a formula that refers to another formula would
   * make the answer depend on the order the definitions came back in.
   */
  private async checkedFormulaConfig(
    projectId: string,
    rawConfig: unknown,
    excludeFieldId?: string,
  ): Promise<{ expression: string }> {
    const expressionInput = (rawConfig as { expression?: unknown } | null | undefined)?.expression
    let parsed: { expression: string; refs: string[] }
    try {
      parsed = parseFormula(expressionInput)
    } catch (err) {
      if (err instanceof FormulaError) throw new BadRequestException(`Formula: ${err.message}`)
      throw err
    }

    const siblings = await this.db
      .select({
        id: customFieldDefinitions.id,
        name: customFieldDefinitions.name,
        type: customFieldDefinitions.type,
      })
      .from(customFieldDefinitions)
      .where(eq(customFieldDefinitions.projectId, projectId))

    const numeric: ReadonlySet<string> = new Set(FORMULA_NUMERIC_TYPES)
    for (const ref of parsed.refs) {
      const hits = siblings.filter((s) => s.name === ref && s.id !== excludeFieldId)
      if (hits.length === 0) {
        throw new BadRequestException(`Formula: there is no field called "${ref}" on this project`)
      }
      /*
       * TWO FIELDS OF THE SAME NAME make `{Budget}` ambiguous, and picking the
       * first would make the number depend on which row was inserted first.
       * Nothing stops two fields sharing a name today, so this is reachable.
       */
      if (hits.length > 1) {
        throw new BadRequestException(
          `Formula: "${ref}" names ${hits.length} fields on this project, so it is ambiguous`,
        )
      }
      const hit = hits[0]!
      if (!numeric.has(hit.type)) {
        throw new BadRequestException(
          `Formula: "${ref}" is a ${hit.type} field, and a formula can only read ` +
            `${FORMULA_NUMERIC_TYPES.join(', ')}`,
        )
      }
    }
    return { expression: parsed.expression }
  }

  async updateDefinition(
    workspaceId: string,
    fieldId: string,
    patch: {
      name?: string
      isRequired?: boolean
      options?: Array<{ label: string; value: string; color?: string }>
      position?: number
      config?: unknown
    },
  ) {
    const def = await this.getDefOwnedBy(workspaceId, fieldId)
    if (patch.options != null && !Array.isArray(patch.options)) {
      throw new BadRequestException('Custom field "options" must be an array')
    }
    const set: Record<string, unknown> = { updatedAt: new Date() }
    for (const key of ['name', 'isRequired', 'options', 'position'] as const) {
      if (patch[key] !== undefined) set[key] = patch[key]
    }
    /*
     * §V2-01b — reconfiguring which sources a Progress field tracks. Normalised
     * through the same reader the computation uses, so turning a source off in
     * the UI and turning it off in the database cannot mean different things.
     */
    if (patch.config !== undefined && def.type === 'progress_auto') {
      set.config = toProgressConfig(patch.config)
    }
    /* 0146 — the same check the create path runs, so an expression cannot be
     * edited into one that create would have refused. */
    if (patch.config !== undefined && def.type === 'formula') {
      set.config = await this.checkedFormulaConfig(def.projectId, patch.config, def.id)
    }
    /*
     * 0146 — A RENAME THAT WOULD ORPHAN A FORMULA IS REFUSED.
     *
     * A formula stores the NAME it reads, because a name is what somebody
     * types. Rename "Budget" to "Budget (USD)" and every `{Budget}` stops
     * resolving — and it stops quietly, drawing a dash where a number was. The
     * refusal names the formula, so the fix is obvious: edit it first.
     */
    if (patch.name !== undefined && patch.name !== def.name) {
      const formulas = await this.db
        .select({ name: customFieldDefinitions.name, config: customFieldDefinitions.config })
        .from(customFieldDefinitions)
        .where(
          and(
            eq(customFieldDefinitions.projectId, def.projectId),
            eq(customFieldDefinitions.type, 'formula'),
          ),
        )
      const users = formulas.filter((f) => {
        try {
          return parseFormula(toFormulaConfig(f.config).expression).refs.includes(def.name)
        } catch {
          return false
        }
      })
      if (users.length > 0) {
        throw new BadRequestException(
          `"${def.name}" cannot be renamed while ${users.map((f) => `"${f.name}"`).join(', ')} ` +
            'reads it — change the formula first',
        )
      }
    }
    const [row] = await this.db
      .update(customFieldDefinitions)
      .set(set)
      .where(eq(customFieldDefinitions.id, def.id))
      .returning()
    return row
  }

  async deleteDefinition(workspaceId: string, fieldId: string) {
    const def = await this.getDefOwnedBy(workspaceId, fieldId)
    // Cascade deletes the values automatically via FK.
    await this.db.delete(customFieldDefinitions).where(eq(customFieldDefinitions.id, def.id))
    return { ok: true }
  }

  private async getDefOwnedBy(workspaceId: string, fieldId: string) {
    const [row] = await this.db
      .select({
        id: customFieldDefinitions.id,
        projectId: customFieldDefinitions.projectId,
        // 0146 — the rename guard needs the name it is replacing.
        name: customFieldDefinitions.name,
        type: customFieldDefinitions.type,
        options: customFieldDefinitions.options,
        config: customFieldDefinitions.config,
      })
      .from(customFieldDefinitions)
      .innerJoin(projects, eq(projects.id, customFieldDefinitions.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(eq(customFieldDefinitions.id, fieldId), eq(spaces.workspaceId, workspaceId)))
      .limit(1)
    if (!row) throw new NotFoundException('Custom field not found')
    return row
  }

  // ── Values ──────────────────────────────────────────────────────────────────
  async getValuesForTask(workspaceId: string, taskId: string) {
    const task = await this.assertTaskInWorkspace(workspaceId, taskId)
    /*
     * §V2-S01c — `listId` NARROWS THE FIELD, and until now it did not.
     *
     * `createDefinition` has accepted and STORED `listId` since custom fields
     * shipped — the column means "this field applies to one list, not the whole
     * project". Every reader filtered on `projectId` alone, so a field scoped to
     * a single list appeared on every task in the project anyway. A setting the
     * server records and no reader honours is the same defect as a switch that
     * changes nothing, seen from the other side; this codebase has now found it
     * in both directions.
     *
     * NULL means project-wide, which is what every existing row is.
     */
    const defs = await this.db
      .select()
      .from(customFieldDefinitions)
      .where(
        and(
          eq(customFieldDefinitions.projectId, task.projectId),
          or(
            isNull(customFieldDefinitions.listId),
            eq(customFieldDefinitions.listId, task.listId),
          ),
        ),
      )
      .orderBy(asc(customFieldDefinitions.position))

    const values = await this.db
      .select()
      .from(customFieldValues)
      .where(eq(customFieldValues.taskId, taskId))

    const byField = new Map(values.map((v) => [v.fieldId, v]))

    /*
     * §V2-01b — Progress (Auto) is COMPUTED HERE, not read.
     *
     * The tallies are gathered once, and only when some field on this project
     * actually asks for them: most projects have no Progress field and should
     * not pay three extra queries per task read for one that does not exist.
     */
    const wantsProgress = defs.some((d) => d.type === 'progress_auto')
    const progress = wantsProgress ? await this.progressFor(taskId) : null

    /*
     * 0146 — WHAT A FORMULA CAN SEE, built once for the whole task.
     *
     * Only the fields THIS task has: `defs` is already narrowed by list scope,
     * so a formula that reads a field scoped to a different list resolves to
     * nothing here and the result is null — which is the honest answer, since
     * the field it wants does not apply to this task.
     *
     * `progress_auto` is readable by a formula and is itself derived, so it is
     * taken from the computed number rather than from a row that never exists.
     */
    const numericByName = new Map<string, number | null>()
    if (defs.some((d) => d.type === 'formula')) {
      for (const d of defs) {
        if (!(FORMULA_NUMERIC_TYPES as readonly string[]).includes(d.type)) continue
        if (d.type === 'progress_auto') {
          numericByName.set(
            d.name,
            progress
              ? computeProgress(toProgressConfig(d.config), progress.inputs, progress.taskIsDone)
              : null,
          )
          continue
        }
        const stored = byField.get(d.id)?.value.v
        numericByName.set(d.name, typeof stored === 'number' ? stored : null)
      }
    }

    return defs.map((d) => {
      if (d.type === 'progress_auto') {
        return {
          definition: d,
          value: computeProgress(toProgressConfig(d.config), progress!.inputs, progress!.taskIsDone),
        }
      }
      if (d.type === 'formula') {
        return {
          definition: d,
          value: evaluateFormula(toFormulaConfig(d.config).expression, (name) =>
            numericByName.has(name) ? numericByName.get(name)! : null,
          ),
        }
      }
      const stored = byField.get(d.id)?.value.v ?? null
      /*
       * §V2-01c — an unset list comes back as [], not null.
       *
       * Otherwise every renderer and every caller has to treat "no labels yet"
       * and "labels cleared" as two states that mean the same thing, and one of
       * them eventually gets forgotten. One shape, decided here.
       */
      return {
        definition: d,
        value: MULTI_TYPES.has(d.type) ? (Array.isArray(stored) ? stored : []) : stored,
      }
    })
  }

  /**
   * What there is to count on this task, for §V2-01b.
   *
   * The three sources are exactly the three the frame names, and each one's
   * notion of "done" is that source's own: a subtask is done when its status is
   * in the closed category, a checklist item when it is ticked, an assigned
   * comment when it has been resolved. Only comments that were ASSIGNED to
   * somebody count — an ordinary comment is not a piece of work.
   */
  private async progressFor(taskId: string): Promise<{ inputs: ProgressInputs; taskIsDone: boolean }> {
    const [subs, checks, comments, self] = await Promise.all([
      this.db
        .select({ done: tasks.statusCategory })
        .from(tasks)
        .where(eq(tasks.parentTaskId, taskId)),
      this.db
        .select({ done: taskChecklistItems.isDone })
        .from(taskChecklistItems)
        .innerJoin(taskChecklists, eq(taskChecklists.id, taskChecklistItems.checklistId))
        .where(eq(taskChecklists.taskId, taskId)),
      this.db
        .select({ resolvedAt: taskComments.resolvedAt })
        .from(taskComments)
        .where(and(eq(taskComments.taskId, taskId), isNotNull(taskComments.assignedToUserId))),
      this.db
        .select({ statusCategory: tasks.statusCategory })
        .from(tasks)
        .where(eq(tasks.id, taskId))
        .limit(1),
    ])

    return {
      inputs: {
        subtasks: { total: subs.length, done: subs.filter((r) => r.done === 'closed').length },
        checklists: { total: checks.length, done: checks.filter((r) => r.done).length },
        assignedComments: {
          total: comments.length,
          done: comments.filter((r) => r.resolvedAt != null).length,
        },
      },
      taskIsDone: self[0]?.statusCategory === 'closed',
    }
  }

  /**
   * @param actorId who is writing. Only `voting` uses it, and that is the whole
   *   reason it exists: a vote you can cast on somebody else's behalf is not a
   *   vote. Every other type's value is the same whoever sets it.
   */
  async setValue(
    workspaceId: string,
    taskId: string,
    fieldId: string,
    value: FieldValue,
    actorId?: string,
  ) {
    await this.assertTaskInWorkspace(workspaceId, taskId)
    const def = await this.getDefOwnedBy(workspaceId, fieldId)

    /*
     * §V2-01b — a Progress (Auto) value cannot be written, and refusing is the
     * point rather than a limitation. The whole meaning of Auto is that the
     * number follows the work; a stored one would be right until the next
     * checklist item was ticked and silently wrong afterwards. Accepting the
     * write and ignoring it would be worse still — the caller would believe it.
     */
    if (def.type === 'progress_auto') {
      throw new BadRequestException(
        'Progress (Auto) is calculated from subtasks, checklists and assigned comments — it cannot be set directly',
      )
    }
    /*
     * 0146 — and a Formula for the same reason, said in its own words. A
     * shared "this field is derived" message would be cheaper and would tell
     * the caller nothing about which fields to change instead.
     */
    if (def.type === 'formula') {
      throw new BadRequestException(
        'Formula is calculated from the other fields on this task — it cannot be set directly',
      )
    }

    /*
     * VOTING IGNORES THE SUBMITTED VALUE, on purpose.
     *
     * The obvious design — accept a list of voter ids — lets anyone rewrite the
     * tally, adding colleagues who never voted or removing ones who did. So the
     * body is not read at all: this toggles the CALLER's own vote and nothing
     * else. The endpoint is therefore "vote" rather than "set the votes", which
     * is what the control on screen actually means.
     */
    if (def.type === 'voting') {
      if (!actorId) {
        throw new BadRequestException('Voting needs to know who is voting')
      }
      const [row] = await this.db
        .select()
        .from(customFieldValues)
        .where(and(eq(customFieldValues.taskId, taskId), eq(customFieldValues.fieldId, fieldId)))
        .limit(1)
      const current = Array.isArray(row?.value?.v) ? (row!.value.v as string[]) : []
      const next = current.includes(actorId)
        ? current.filter((id) => id !== actorId)
        : [...current, actorId]
      if (row) {
        const [updated] = await this.db
          .update(customFieldValues)
          .set({ value: { v: next }, updatedAt: new Date() })
          .where(eq(customFieldValues.id, row.id))
          .returning()
        return updated
      }
      const [inserted] = await this.db
        .insert(customFieldValues)
        .values({ taskId, fieldId, value: { v: next } })
        .returning()
      return inserted
    }

    // Type validation
    if (value !== null) {
      switch (def.type) {
        case 'text':
        case 'url':
        case 'date':
        case 'email':
        case 'phone':
          if (typeof value !== 'string') {
            throw new BadRequestException(`Field expects a string value`)
          }
          if (def.type === 'url' && !/^https?:\/\//.test(value as string)) {
            throw new BadRequestException('URL must start with http:// or https://')
          }
          if (def.type === 'date' && Number.isNaN(Date.parse(value as string))) {
            throw new BadRequestException('Invalid date value')
          }
          if (def.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value as string)) {
            throw new BadRequestException('Invalid email address')
          }
          if (def.type === 'phone' && !/^[+]?[0-9().\-\s]{5,}$/.test(value as string)) {
            throw new BadRequestException('Invalid phone number')
          }
          break
        case 'number':
        case 'money':
          if (typeof value !== 'number' || !Number.isFinite(value)) {
            throw new BadRequestException('Field expects a number value')
          }
          break
        case 'rating':
          if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 5) {
            throw new BadRequestException('Rating must be an integer from 0 to 5')
          }
          break
        case 'checkbox':
          if (typeof value !== 'boolean') {
            throw new BadRequestException('Field expects a boolean value')
          }
          break
        case 'dropdown': {
          const opts = (def.options as Array<{ value: string }> | null) ?? []
          if (typeof value !== 'string' || !opts.some((o) => o.value === value)) {
            throw new BadRequestException('Value must match a defined option')
          }
          break
        }
        // ── §V2-01c ────────────────────────────────────────────────────────
        case 'long_text':
        case 'location':
          if (typeof value !== 'string') {
            throw new BadRequestException('Field expects a string value')
          }
          break
        case 'tshirt_size':
          // A FIXED set, which is the only thing separating this from a
          // dropdown. Accepting anything else would make every field's sizes
          // different and the type pointless.
          if (typeof value !== 'string' || !(TSHIRT_SIZES as readonly string[]).includes(value)) {
            throw new BadRequestException(`Size must be one of ${TSHIRT_SIZES.join(', ')}`)
          }
          break
        case 'progress_manual':
          if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
            throw new BadRequestException('Progress must be a number from 0 to 100')
          }
          break
        case 'labels': {
          const opts = (def.options as Array<{ value: string }> | null) ?? []
          if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
            throw new BadRequestException('Labels expects a list of option values')
          }
          const unknown = value.filter((v) => !opts.some((o) => o.value === v))
          if (unknown.length) {
            throw new BadRequestException(`Not a defined option: ${unknown.join(', ')}`)
          }
          // Duplicates are a caller bug, and storing them would draw the same
          // chip twice; de-duplicating silently would hide it. Refuse.
          if (new Set(value).size !== value.length) {
            throw new BadRequestException('The same label was given twice')
          }
          break
        }
        case 'files': {
          if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
            throw new BadRequestException('Files expects a list of attachment ids')
          }
          if (new Set(value).size !== value.length) {
            throw new BadRequestException('The same file was given twice')
          }
          /*
           * THE IDS MUST BE FILES ON THIS TASK. Without this the field stores
           * any attachment id at all — including one on a task the reader
           * cannot open — and the renderer would then link to somebody else's
           * document. The same shape of rule as `people`, for the same reason.
           */
          if (value.length) {
            const rows = await this.db
              .select({ id: taskAttachments.id })
              .from(taskAttachments)
              .where(
                and(
                  eq(taskAttachments.taskId, taskId),
                  inArray(taskAttachments.id, value as string[]),
                ),
              )
            const known = new Set(rows.map((r) => r.id))
            if ((value as string[]).some((v) => !known.has(v))) {
              throw new BadRequestException('Those files are not attached to this task')
            }
          }
          break
        }
        /*
         * 0146 — TASKS, frame `00:42`'s picker.
         *
         * The same shape of rule as `people` and `files`, for the same reason:
         * an id that is not a task in this workspace would render as a link to
         * something the reader cannot open, or as nothing at all. A task
         * cannot point at itself either — a self-reference draws a row that
         * navigates to the page you are on.
         */
        case 'tasks': {
          if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
            throw new BadRequestException('Tasks expects a list of task ids')
          }
          if (new Set(value).size !== value.length) {
            throw new BadRequestException('The same task was given twice')
          }
          if ((value as string[]).includes(taskId)) {
            throw new BadRequestException('A task cannot be related to itself')
          }
          if (value.length) {
            const rows = await this.db
              .select({ id: tasks.id })
              .from(tasks)
              .innerJoin(lists, eq(lists.id, tasks.listId))
              .innerJoin(projects, eq(projects.id, lists.projectId))
              .innerJoin(spaces, eq(spaces.id, projects.spaceId))
              .where(
                and(
                  eq(spaces.workspaceId, workspaceId),
                  inArray(tasks.id, value as string[]),
                ),
              )
            const known = new Set(rows.map((r) => r.id))
            if ((value as string[]).some((v) => !known.has(v))) {
              throw new BadRequestException('Those tasks are not in this workspace')
            }
          }
          break
        }
        /* 0146 — the strokes, checked against the grammar the column documents. */
        case 'signature':
          assertSignature(value)
          break
        case 'people': {
          if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
            throw new BadRequestException('People expects a list of user ids')
          }
          if (new Set(value).size !== value.length) {
            throw new BadRequestException('The same person was given twice')
          }
          /*
           * THE IDS MUST BE PEOPLE IN THIS WORKSPACE. Without this the field
           * would happily store any uuid — including a member of a workspace
           * this one cannot see — and the renderer would then either draw a
           * stranger or a blank. A field that can name somebody who is not
           * here is a small information leak wearing a text box.
           */
          if (value.length) {
            const members = await this.db
              .select({ userId: workspaceMembers.userId })
              .from(workspaceMembers)
              .where(
                and(
                  eq(workspaceMembers.workspaceId, workspaceId),
                  inArray(workspaceMembers.userId, value as string[]),
                ),
              )
            const known = new Set(members.map((m) => m.userId))
            const strangers = (value as string[]).filter((v) => !known.has(v))
            if (strangers.length) {
              throw new BadRequestException('Those people are not members of this workspace')
            }
          }
          break
        }
      }
    }

    // Upsert (taskId, fieldId) is unique
    const existing = await this.db
      .select()
      .from(customFieldValues)
      .where(and(eq(customFieldValues.taskId, taskId), eq(customFieldValues.fieldId, fieldId)))
      .limit(1)

    if (existing[0]) {
      const [row] = await this.db
        .update(customFieldValues)
        .set({ value: { v: value }, updatedAt: new Date() })
        .where(eq(customFieldValues.id, existing[0].id))
        .returning()
      return row
    }
    const [row] = await this.db
      .insert(customFieldValues)
      .values({ taskId, fieldId, value: { v: value } })
      .returning()
    return row
  }
}

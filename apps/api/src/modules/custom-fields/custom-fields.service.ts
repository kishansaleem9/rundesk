import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common'
import { and, eq, asc, isNotNull } from 'drizzle-orm'
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
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { computeProgress, toProgressConfig, type ProgressInputs } from './progress'

type CustomFieldType =
  | 'text' | 'number' | 'dropdown' | 'date' | 'checkbox'
  | 'url' | 'email' | 'phone' | 'money' | 'rating'
  // §V2-01b — derived, never stored. See progress.ts.
  | 'progress_auto'
type FieldValue = string | number | boolean | null

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
      .select({ taskId: tasks.id, projectId: lists.projectId })
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
    // `options` must be an array when present — a non-array (e.g. {} or a bare
    // string) passes the length check below (undefined === 0 is false) and gets
    // stored, then crashes every reader that does `options.map(...)`.
    if (dto.options != null && !Array.isArray(dto.options)) {
      throw new BadRequestException('Custom field "options" must be an array')
    }
    if (dto.type === 'dropdown' && (!dto.options || dto.options.length === 0)) {
      throw new BadRequestException('Dropdown fields require at least one option')
    }

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
        config: dto.type === 'progress_auto' ? toProgressConfig(dto.config) : null,
        position: nextPos,
      })
      .returning()
    return row
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
        type: customFieldDefinitions.type,
        options: customFieldDefinitions.options,
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
    const defs = await this.db
      .select()
      .from(customFieldDefinitions)
      .where(eq(customFieldDefinitions.projectId, task.projectId))
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

    return defs.map((d) => ({
      definition: d,
      value:
        d.type === 'progress_auto'
          ? computeProgress(toProgressConfig(d.config), progress!.inputs, progress!.taskIsDone)
          : byField.get(d.id)?.value.v ?? null,
    }))
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

  async setValue(
    workspaceId: string,
    taskId: string,
    fieldId: string,
    value: FieldValue,
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

import { Injectable, Inject, BadRequestException, NotFoundException } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import {
  spaces,
  projects,
  lists,
  tasks,
  taskAssignees,
  labels,
  taskLabelAssignments,
  workspaceMembers,
  users,
  customFieldDefinitions,
  customFieldValues,
  clickupImportJobs,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../../common/database/database.module'
import {
  parseClickUpCsv,
  dupKey,
  splitList,
  mapStatus,
  mapPriority,
  safeDate,
  coerceCustomValue,
  type ParsedTask,
  type CustomFieldColumn,
} from './clickup-csv.util'

/** How to handle a row that duplicates an existing / already-seen task. */
export type ConflictStrategy = 'skip' | 'create' | 'merge'

export type ImportDto = {
  csv: string
  targetSpaceId?: string
  targetProjectName?: string
  strategy?: ConflictStrategy
}

/**
 * ClickUp CSV export does NOT contain comments or file attachments — those live
 * only behind the ClickUp API (an OAuth/personal token). We never fabricate
 * them; the report states plainly that they are not part of the CSV. If a token
 * is later wired up (CLICKUP_API_TOKEN), an API path would fetch them — that is
 * out of scope for the CSV importer.
 */
const NOT_IMPORTED = {
  comments:
    'ClickUp CSV exports do not include comments. Importing them requires the ClickUp API (a token) — not available from a CSV, so no comments were imported.',
  attachments:
    'ClickUp CSV exports do not include file attachments. Importing them requires the ClickUp API (a token) — not available from a CSV, so no attachments were imported.',
} as const

export type ImportSummary = {
  spacesCreated: number
  projectsCreated: number
  listsCreated: number
  tasksCreated: number
  tasksUpdated: number
  tasksSkipped: number
  labelsCreated: number
  assigneesLinked: number
  subtasksLinked: number
  customFieldsCreated: number
  customFieldValuesSet: number
  duplicatesDetected: number
  errors: string[]
  notImported: typeof NOT_IMPORTED
}

@Injectable()
export class ClickUpImportService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  // ── Preview ─────────────────────────────────────────────────────────────────
  /**
   * Parse without writing: row/list counts, a small sample, the detected
   * custom-field columns (name + inferred type), and a duplicate scan against
   * the target scope so the UI can offer a conflict strategy.
   */
  async preview(workspaceId: string, dto: { csv: string; targetSpaceId?: string }) {
    const { rows, customFieldColumns } = parseClickUpCsv(dto.csv ?? '')

    const existing = await this.loadExistingTaskIndex(workspaceId, dto.targetSpaceId)
    const seen = new Set<string>()
    const seenIds = new Set<string>()
    const dupSample: Array<{ title: string; list: string; reason: string }> = []
    let duplicates = 0
    for (const r of rows) {
      const listName = r.list?.trim() || 'Imported Tasks'
      const key = dupKey(listName, r.title)
      const byId = r.taskId ? seenIds.has(r.taskId) : false
      const isDup = existing.has(key) || seen.has(key) || byId
      if (isDup) {
        duplicates++
        if (dupSample.length < 10) {
          dupSample.push({
            title: r.title,
            list: listName,
            reason: existing.has(key) ? 'exists-in-target' : byId ? 'duplicate-clickup-id' : 'duplicate-in-file',
          })
        }
      }
      seen.add(key)
      if (r.taskId) seenIds.add(r.taskId)
    }

    return {
      totalRows: rows.length,
      sample: rows.slice(0, 5).map((r) => ({
        title: r.title,
        status: r.status,
        priority: r.priority,
        list: r.list,
      })),
      uniqueLists: Array.from(new Set(rows.map((r) => r.list?.trim()).filter(Boolean))) as string[],
      customFields: customFieldColumns.map((c) => ({ name: c.name, type: c.type })),
      duplicates: { count: duplicates, sample: dupSample },
      notImported: NOT_IMPORTED,
    }
  }

  // ── Job lifecycle ─────────────────────────────────────────────────────────────
  /**
   * Create a progress row and kick off the import asynchronously. Returns the
   * job id immediately; the client polls `getJob` for a real progress bar.
   */
  async startImport(workspaceId: string, userId: string, dto: ImportDto): Promise<{ jobId: string }> {
    if (!dto.csv?.trim()) throw new BadRequestException('CSV body is empty')
    const { rows } = parseClickUpCsv(dto.csv)
    if (rows.length === 0) throw new BadRequestException('CSV contained no data rows')

    const [job] = await this.db
      .insert(clickupImportJobs)
      .values({ workspaceId, createdById: userId, status: 'pending', total: rows.length })
      .returning({ id: clickupImportJobs.id })

    // Fire-and-forget: the worker updates the job row as it processes.
    void this.processImport(job.id, workspaceId, userId, dto).catch(() => undefined)
    return { jobId: job.id }
  }

  async getJob(workspaceId: string, jobId: string) {
    const [job] = await this.db
      .select()
      .from(clickupImportJobs)
      .where(and(eq(clickupImportJobs.id, jobId), eq(clickupImportJobs.workspaceId, workspaceId)))
      .limit(1)
    if (!job) throw new NotFoundException('Import job not found')
    return job
  }

  /**
   * The awaitable worker. Parses the CSV, recreates the hierarchy, creates
   * custom-field definitions + values, applies the conflict strategy per row,
   * and streams progress into the job row. Also callable directly (tests /
   * verification) — resolves with the final summary.
   */
  async processImport(
    jobId: string,
    workspaceId: string,
    userId: string,
    dto: ImportDto,
  ): Promise<ImportSummary> {
    const strategy: ConflictStrategy = dto.strategy ?? 'create'
    const summary: ImportSummary = {
      spacesCreated: 0,
      projectsCreated: 0,
      listsCreated: 0,
      tasksCreated: 0,
      tasksUpdated: 0,
      tasksSkipped: 0,
      labelsCreated: 0,
      assigneesLinked: 0,
      subtasksLinked: 0,
      customFieldsCreated: 0,
      customFieldValuesSet: 0,
      duplicatesDetected: 0,
      errors: [],
      notImported: NOT_IMPORTED,
    }

    try {
      const { rows, customFieldColumns } = parseClickUpCsv(dto.csv)
      if (rows.length === 0) throw new BadRequestException('CSV contained no data rows')

      await this.db
        .update(clickupImportJobs)
        .set({ status: 'processing', total: rows.length, updatedAt: new Date() })
        .where(eq(clickupImportJobs.id, jobId))

      // Resolve / create space
      let spaceId = dto.targetSpaceId
      if (!spaceId) {
        const [space] = await this.db
          .insert(spaces)
          .values({
            workspaceId,
            name: dto.targetProjectName ?? 'Imported from ClickUp',
            icon: '📥',
            color: '#354fb0',
          })
          .returning()
        spaceId = space.id
        summary.spacesCreated++
      }

      const [project] = await this.db
        .insert(projects)
        .values({
          spaceId,
          name: dto.targetProjectName ?? 'ClickUp Import',
          description: `Imported on ${new Date().toISOString()} by user ${userId}`,
        })
        .returning()
      summary.projectsCreated++

      // Custom-field definitions on the new project (name → def id + type + option map).
      const fieldDefs = await this.createCustomFieldDefinitions(project.id, customFieldColumns, summary)

      // Group rows by list.
      const byList = new Map<string, ParsedTask[]>()
      for (const r of rows) {
        const listName = r.list?.trim() || 'Imported Tasks'
        const arr = byList.get(listName) ?? []
        arr.push(r)
        byList.set(listName, arr)
      }

      // Members for assignee mapping.
      const memberByKey = await this.loadMemberIndex(workspaceId)
      // Existing tasks in the target scope for duplicate detection.
      const existing = await this.loadExistingTaskIndex(workspaceId, dto.targetSpaceId)

      const labelCache = new Map<string, string>()
      const ensureLabel = (name: string) => this.ensureLabel(workspaceId, name, labelCache, summary)

      // dupKey / clickup id → our task id, so merge + subtask linking can target it.
      const seenByKey = new Map<string, string>()
      const created = new Map<string, { ourId: string; parentId?: string }>()
      const updateEvery = Math.max(1, Math.ceil(rows.length / 200))

      let processed = 0
      let listPosition = 0
      for (const [listName, listRows] of byList) {
        let list: { id: string }
        try {
          ;[list] = await this.db
            .insert(lists)
            .values({ projectId: project.id, name: listName, position: listPosition++ })
            .returning()
          summary.listsCreated++
        } catch (e: any) {
          summary.errors.push(`List "${listName}": ${e?.message ?? 'unknown error'}`)
          // Still advance progress for the rows we won't process.
          processed += listRows.length
          await this.updateProgress(jobId, processed, summary)
          continue
        }

        for (const t of listRows) {
          try {
            const key = dupKey(listName, t.title)
            const existingId = existing.get(key)
            const seenId = seenByKey.get(key)
            const isDup = !!existingId || !!seenId
            if (isDup) summary.duplicatesDetected++

            if (isDup && strategy === 'skip') {
              summary.tasksSkipped++
            } else if (isDup && strategy === 'merge') {
              const targetId = existingId ?? seenId!
              await this.mergeTask(targetId, t)
              summary.tasksUpdated++
              if (t.taskId) created.set(t.taskId, { ourId: targetId, parentId: t.parentId })
              seenByKey.set(key, targetId)
              await this.applyAssigneesTagsFields(targetId, t, memberByKey, ensureLabel, fieldDefs, summary)
            } else {
              // create (either not a duplicate, or "import anyway")
              const [task] = await this.db
                .insert(tasks)
                .values({
                  listId: list.id,
                  createdById: userId,
                  title: t.title.slice(0, 500),
                  description: t.description ?? null,
                  status: mapStatus(t.status),
                  priority: mapPriority(t.priority),
                  dueDate: t.dueDate ? safeDate(t.dueDate) : undefined,
                })
                .returning()
              summary.tasksCreated++
              if (t.taskId) created.set(t.taskId, { ourId: task.id, parentId: t.parentId })
              if (!seenByKey.has(key)) seenByKey.set(key, task.id)
              await this.applyAssigneesTagsFields(task.id, t, memberByKey, ensureLabel, fieldDefs, summary)
            }
          } catch (e: any) {
            summary.errors.push(`Task "${t.title}": ${e?.message ?? 'unknown error'}`)
          } finally {
            processed++
            if (processed % updateEvery === 0) await this.updateProgress(jobId, processed, summary)
          }
        }
      }

      // Second pass: link subtasks to their parent, one level only.
      for (const [, entry] of created) {
        if (!entry.parentId) continue
        const parent = created.get(entry.parentId)
        if (!parent || parent.parentId) continue
        try {
          await this.db.update(tasks).set({ parentTaskId: parent.ourId }).where(eq(tasks.id, entry.ourId))
          summary.subtasksLinked++
        } catch {
          // leave top-level
        }
      }

      await this.db
        .update(clickupImportJobs)
        .set({
          status: 'completed',
          processed: rows.length,
          createdCount: summary.tasksCreated,
          updatedCount: summary.tasksUpdated,
          skippedCount: summary.tasksSkipped,
          result: summary as unknown as Record<string, unknown>,
          updatedAt: new Date(),
        })
        .where(eq(clickupImportJobs.id, jobId))

      return summary
    } catch (e: any) {
      await this.db
        .update(clickupImportJobs)
        .set({ status: 'failed', error: e?.message ?? 'Import failed', updatedAt: new Date() })
        .where(eq(clickupImportJobs.id, jobId))
        .catch(() => undefined)
      throw e
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  private async updateProgress(jobId: string, processed: number, summary: ImportSummary) {
    await this.db
      .update(clickupImportJobs)
      .set({
        processed,
        createdCount: summary.tasksCreated,
        updatedCount: summary.tasksUpdated,
        skippedCount: summary.tasksSkipped,
        updatedAt: new Date(),
      })
      .where(eq(clickupImportJobs.id, jobId))
      .catch(() => undefined)
  }

  private async loadMemberIndex(workspaceId: string): Promise<Map<string, string>> {
    const memberRows = await this.db
      .select({ userId: users.id, displayName: users.displayName, email: users.email })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, workspaceId))
    const byKey = new Map<string, string>()
    for (const m of memberRows) {
      if (m.displayName) byKey.set(m.displayName.trim().toLowerCase(), m.userId)
      if (m.email) byKey.set(m.email.trim().toLowerCase(), m.userId)
    }
    return byKey
  }

  /** Existing tasks in the target scope, keyed by dupKey(listName, title). */
  private async loadExistingTaskIndex(
    workspaceId: string,
    targetSpaceId?: string,
  ): Promise<Map<string, string>> {
    const where = targetSpaceId
      ? and(eq(spaces.workspaceId, workspaceId), eq(spaces.id, targetSpaceId))
      : eq(spaces.workspaceId, workspaceId)
    const rows = await this.db
      .select({ id: tasks.id, listName: lists.name, title: tasks.title })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(where)
    const index = new Map<string, string>()
    for (const r of rows) {
      const key = dupKey(r.listName, r.title)
      if (!index.has(key)) index.set(key, r.id)
    }
    return index
  }

  private async ensureLabel(
    workspaceId: string,
    name: string,
    cache: Map<string, string>,
    summary: ImportSummary,
  ): Promise<string | null> {
    const key = name.trim().toLowerCase()
    if (!key) return null
    if (cache.has(key)) return cache.get(key)!
    const [existing] = await this.db
      .select({ id: labels.id })
      .from(labels)
      .where(and(eq(labels.workspaceId, workspaceId), eq(labels.name, name.trim())))
      .limit(1)
    if (existing) {
      cache.set(key, existing.id)
      return existing.id
    }
    const [row] = await this.db
      .insert(labels)
      .values({ workspaceId, name: name.trim().slice(0, 60), color: '#8b5cf6' })
      .onConflictDoNothing()
      .returning()
    const id =
      row?.id ??
      (
        await this.db
          .select({ id: labels.id })
          .from(labels)
          .where(and(eq(labels.workspaceId, workspaceId), eq(labels.name, name.trim())))
          .limit(1)
      )[0]?.id
    if (id) {
      if (row) summary.labelsCreated++
      cache.set(key, id)
      return id
    }
    return null
  }

  /**
   * Create a custom-field definition per detected column. Returns a map from the
   * (original-case) column name to its definition id, type, and a lowercase →
   * canonical option-value map (so stored dropdown values match an option).
   */
  private async createCustomFieldDefinitions(
    projectId: string,
    columns: CustomFieldColumn[],
    summary: ImportSummary,
  ): Promise<Map<string, { id: string; type: CustomFieldColumn['type']; optionByLower?: Map<string, string> }>> {
    const map = new Map<string, { id: string; type: CustomFieldColumn['type']; optionByLower?: Map<string, string> }>()
    let position = 0
    for (const col of columns) {
      try {
        const [def] = await this.db
          .insert(customFieldDefinitions)
          .values({
            projectId,
            name: col.name.slice(0, 200),
            type: col.type,
            options: col.type === 'dropdown' ? col.options ?? [] : null,
            position: position++,
          })
          .returning({ id: customFieldDefinitions.id })
        summary.customFieldsCreated++
        const optionByLower =
          col.type === 'dropdown'
            ? new Map((col.options ?? []).map((o) => [o.value.toLowerCase(), o.value]))
            : undefined
        map.set(col.name, { id: def.id, type: col.type, optionByLower })
      } catch (e: any) {
        summary.errors.push(`Custom field "${col.name}": ${e?.message ?? 'unknown error'}`)
      }
    }
    return map
  }

  private async applyAssigneesTagsFields(
    taskId: string,
    t: ParsedTask,
    memberByKey: Map<string, string>,
    ensureLabel: (name: string) => Promise<string | null>,
    fieldDefs: Map<string, { id: string; type: CustomFieldColumn['type']; optionByLower?: Map<string, string> }>,
    summary: ImportSummary,
  ) {
    for (const who of splitList(t.assignees)) {
      const uid = memberByKey.get(who.toLowerCase())
      if (uid) {
        await this.db.insert(taskAssignees).values({ taskId, userId: uid }).onConflictDoNothing()
        summary.assigneesLinked++
      }
    }
    for (const tag of splitList(t.tags)) {
      const labelId = await ensureLabel(tag)
      if (labelId) {
        await this.db.insert(taskLabelAssignments).values({ taskId, labelId }).onConflictDoNothing()
      }
    }
    // Custom-field values — reuse the { v } value-write shape.
    for (const [colName, rawValue] of Object.entries(t.custom)) {
      const def = fieldDefs.get(colName)
      if (!def) continue
      let v = coerceCustomValue(def.type, rawValue)
      if (v === null) continue
      if (def.type === 'dropdown' && def.optionByLower) {
        v = def.optionByLower.get(String(v).toLowerCase()) ?? v
      }
      try {
        await this.setCustomValue(taskId, def.id, v)
        summary.customFieldValuesSet++
      } catch (e: any) {
        summary.errors.push(`Custom value "${colName}" on "${t.title}": ${e?.message ?? 'unknown error'}`)
      }
    }
  }

  /** Upsert into custom_field_values (task_id, field_id) — the value-write path. */
  private async setCustomValue(taskId: string, fieldId: string, v: string | number | boolean) {
    await this.db
      .insert(customFieldValues)
      .values({ taskId, fieldId, value: { v } })
      .onConflictDoUpdate({
        target: [customFieldValues.taskId, customFieldValues.fieldId],
        set: { value: { v }, updatedAt: new Date() },
      })
  }

  /** Merge = update the existing task's mapped fields from the CSV row. */
  private async mergeTask(taskId: string, t: ParsedTask) {
    await this.db
      .update(tasks)
      .set({
        description: t.description ?? undefined,
        status: mapStatus(t.status),
        priority: mapPriority(t.priority),
        dueDate: t.dueDate ? safeDate(t.dueDate) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId))
  }
}

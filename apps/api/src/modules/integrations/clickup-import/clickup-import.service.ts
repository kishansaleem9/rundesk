import { Injectable, Inject, Optional, BadRequestException, NotFoundException } from '@nestjs/common'
import { and, eq, inArray, sql } from 'drizzle-orm'
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
  taskComments,
  taskAttachments,
  clickupImportJobs,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../../common/database/database.module'
import { R2Service } from '../../../common/storage/r2.service'
import {
  parseClickUpCsv,
  dupKey,
  splitList,
  mapStatus,
  mapPriority,
  mergeSetOf,
  safeDate,
  coerceCustomValue,
  type CsvCarries,
  type ParsedTask,
  type CustomFieldColumn,
} from './clickup-csv.util'
import { assertImportTarget } from './import-target'
import {
  ClickUpApiClient,
  extractCommentText,
  clickupDate,
  safeAttachmentName,
  type ClickUpClientLike,
  type ClickUpComment,
  type ClickUpAttachment,
} from './clickup-api.util'
import { seedListStatuses, categoryForDefaultKey } from '../../lists/list-statuses.defaults'

/** How to handle a row that duplicates an existing / already-seen task. */
export type ConflictStrategy = 'skip' | 'create' | 'merge'

export type ImportDto = {
  csv: string
  targetSpaceId?: string
  targetProjectName?: string
  strategy?: ConflictStrategy
  /**
   * Optional ClickUp personal/OAuth API token. When supplied, the import ALSO
   * pulls each task's comments + attachments (which the CSV cannot carry) via
   * the ClickUp REST API and imports them. Omit it and the CSV-only path runs
   * exactly as before.
   */
  apiToken?: string
}

/** ClickUp task id → our task id, so the API enrichment can target our rows. */
export type TaskIdMapping = Array<{ clickupTaskId: string; taskId: string }>

/**
 * ClickUp CSV export does NOT contain comments or file attachments — those live
 * only behind the ClickUp API (an OAuth/personal token). We never fabricate
 * them from a CSV; this note states plainly that they are not part of the CSV.
 * When a token IS supplied, the API enrichment path fetches + imports them and
 * this note is replaced with the real imported counts (see `enrichTasks`).
 */
const NOT_IMPORTED = {
  comments:
    'ClickUp CSV exports do not include comments. Importing them requires the ClickUp API (a token) — not available from a CSV, so no comments were imported.',
  attachments:
    'ClickUp CSV exports do not include file attachments. Importing them requires the ClickUp API (a token) — not available from a CSV, so no attachments were imported.',
} as const

/** Per-run report for the optional ClickUp API comment + attachment enrichment. */
export type EnrichmentReport = {
  attempted: boolean
  tasksEnriched: number
  commentsImported: number
  attachmentsImported: number
  attachmentsSkipped: number
  r2Configured: boolean
  /** Set when attachment bytes were skipped wholesale (e.g. R2 not configured). */
  attachmentsSkippedReason?: string
}

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
  /** ClickUp-API-only: comments imported (0 unless an apiToken was supplied). */
  commentsImported: number
  /** ClickUp-API-only: attachments re-uploaded to R2 + rowed. */
  attachmentsImported: number
  /** ClickUp-API-only: attachments skipped (R2 off, download failed, etc.). */
  attachmentsSkipped: number
  errors: string[]
  notImported: { comments: string; attachments: string }
  /** Present only when the API enrichment path ran. */
  enrichment?: EnrichmentReport
}

@Injectable()
export class ClickUpImportService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    // Optional so unit tests can construct the service with just a db stand-in.
    // At runtime R2Service is provided by the global StorageModule.
    @Optional() private r2?: R2Service,
  ) {}

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

    // Where it goes, before anything is written — the job row included
    // (`found-5-oct/import-writes-into-another-workspace`, see `assertImportTarget`).
    if (dto.targetSpaceId) await assertImportTarget(this.db, { workspaceId, spaceId: dto.targetSpaceId, actorId: userId })

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
    const summary = this.emptySummary()

    try {
      const { rows, customFieldColumns, carries } = parseClickUpCsv(dto.csv)
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
            // `spaceId` was left null here, against the invariant `lists.ts:25`
            // states. Every other creation path sets it.
            .values({ projectId: project.id, spaceId, name: listName, position: listPosition++ })
            .returning()
          /*
           * An imported list needs its status pipeline, or everything in it
           * arrives in a list that cannot express "done". `resolveStatusForList`
           * used to answer `category: 'open'` for any key on a status-less
           * list, so an imported "Done" task stored `status='done'` with
           * `statusCategory='open'` — and Board view drew no columns at all
           * for a list full of tasks.
           */
          await seedListStatuses(this.db, list.id)
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
              await this.mergeTask(targetId, t, carries)
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
                  /*
                   * The CATEGORY, not just the key. It was never set here, so
                   * an imported "Done" task stored `status='done'` and kept
                   * `statusCategory='open'` — and `tasks.service.ts:2424`, the
                   * progress ring, reports, the planner and Workload all read
                   * the category. Every imported completed task counted as
                   * outstanding, with database rows standing as evidence for it.
                   */
                  statusCategory: categoryForDefaultKey(mapStatus(t.status)),
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

      // Optional third pass: if an API token was supplied, ALSO pull the two
      // things the CSV cannot carry — comments + attachments — for every task
      // we could map back to its ClickUp id. Reuses the in-memory id-mapping
      // the CSV import just built. Errors are collected, never thrown.
      if (dto.apiToken?.trim()) {
        const mapping: TaskIdMapping = Array.from(created.entries()).map(([clickupTaskId, entry]) => ({
          clickupTaskId,
          taskId: entry.ourId,
        }))
        try {
          await this.enrichTasks(workspaceId, userId, dto.apiToken, mapping, { summary })
        } catch (e: any) {
          summary.errors.push(`ClickUp API enrichment failed: ${e?.message ?? 'unknown error'}`)
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

  // ── ClickUp API enrichment (comments + attachments — Plan §12.5 gap) ──────────

  /**
   * Follow-up path for an already-finished CSV job: import the comments +
   * attachments the CSV omitted, given an API token and a ClickUp→our task-id
   * mapping. Validates each target task belongs to the workspace, runs the same
   * `enrichTasks` core, and folds the result back into the stored job report.
   */
  async enrichJob(
    workspaceId: string,
    jobId: string,
    userId: string,
    input: { apiToken: string; mapping: TaskIdMapping },
  ): Promise<ImportSummary> {
    const job = await this.getJob(workspaceId, jobId)
    if (!input.apiToken?.trim()) {
      throw new BadRequestException('apiToken is required to import ClickUp comments + attachments')
    }
    const mapping = Array.isArray(input.mapping) ? input.mapping : []
    const summary = await this.enrichTasks(workspaceId, userId, input.apiToken, mapping)

    const prevResult = (job.result ?? {}) as Record<string, unknown>
    await this.db
      .update(clickupImportJobs)
      .set({
        result: {
          ...prevResult,
          enrichment: summary.enrichment,
          commentsImported: summary.commentsImported,
          attachmentsImported: summary.attachmentsImported,
          attachmentsSkipped: summary.attachmentsSkipped,
        } as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(clickupImportJobs.id, jobId))
      .catch(() => undefined)

    return summary
  }

  /**
   * Import each mapped task's ClickUp comments + attachments. Shared by the
   * in-job token path (via `processImport`) and the follow-up `enrichJob`
   * endpoint. Per-item failures are collected into `summary.errors`, never
   * thrown, so one bad comment/file can't sink the batch.
   */
  async enrichTasks(
    workspaceId: string,
    userId: string,
    apiToken: string,
    mapping: TaskIdMapping,
    opts: { client?: ClickUpClientLike; summary?: ImportSummary } = {},
  ): Promise<ImportSummary> {
    const summary = opts.summary ?? this.emptySummary()
    if (!apiToken?.trim()) {
      summary.errors.push('ClickUp API enrichment skipped: no API token provided')
      return summary
    }

    const pairs = mapping.filter((m) => m?.clickupTaskId && m?.taskId)
    const r2Ready = !!this.r2?.configured
    if (pairs.length === 0) {
      summary.enrichment = {
        attempted: true,
        tasksEnriched: 0,
        commentsImported: 0,
        attachmentsImported: 0,
        attachmentsSkipped: 0,
        r2Configured: r2Ready,
      }
      return summary
    }

    // Guard against a crafted mapping: only touch tasks in this workspace.
    const validIds = await this.loadWorkspaceTaskIds(
      workspaceId,
      pairs.map((p) => p.taskId),
    )
    const memberByKey = await this.loadMemberIndex(workspaceId)
    const client: ClickUpClientLike = opts.client ?? new ClickUpApiClient({ apiToken })

    let tasksEnriched = 0
    for (const { clickupTaskId, taskId } of pairs) {
      if (!validIds.has(taskId)) {
        summary.errors.push(`Enrich: task ${taskId} is not in this workspace — skipped`)
        continue
      }
      tasksEnriched++

      // Comments — a whole-task fetch failure is recorded, then we move on.
      try {
        const comments = await client.getTaskComments(clickupTaskId)
        for (const c of comments) {
          try {
            await this.importComment(taskId, userId, c, memberByKey)
            summary.commentsImported++
          } catch (e: any) {
            summary.errors.push(`Comment ${c?.id} on ClickUp task ${clickupTaskId}: ${e?.message ?? 'error'}`)
          }
        }
      } catch (e: any) {
        summary.errors.push(`Comments for ClickUp task ${clickupTaskId}: ${e?.message ?? 'error'}`)
      }

      // Attachments — re-upload bytes to R2, then row the metadata.
      try {
        const attachments = await client.getTaskAttachments(clickupTaskId)
        for (const att of attachments) {
          try {
            const outcome = await this.importAttachment(workspaceId, taskId, userId, att, client, r2Ready)
            if (outcome === 'imported') summary.attachmentsImported++
            else summary.attachmentsSkipped++
          } catch (e: any) {
            summary.attachmentsSkipped++
            summary.errors.push(`Attachment ${att?.id} on ClickUp task ${clickupTaskId}: ${e?.message ?? 'error'}`)
          }
        }
      } catch (e: any) {
        summary.errors.push(`Attachments for ClickUp task ${clickupTaskId}: ${e?.message ?? 'error'}`)
      }
    }

    summary.enrichment = {
      attempted: true,
      tasksEnriched,
      commentsImported: summary.commentsImported,
      attachmentsImported: summary.attachmentsImported,
      attachmentsSkipped: summary.attachmentsSkipped,
      r2Configured: r2Ready,
      ...(r2Ready
        ? {}
        : {
            attachmentsSkippedReason:
              'R2 storage is not configured — attachment bytes were not downloaded or stored.',
          }),
    }

    // Replace the CSV "not imported" note with the honest imported counts.
    summary.notImported = {
      comments:
        summary.commentsImported > 0
          ? `Imported ${summary.commentsImported} comment(s) from the ClickUp API.`
          : NOT_IMPORTED.comments,
      attachments:
        summary.attachmentsImported > 0
          ? `Imported ${summary.attachmentsImported} attachment(s) from the ClickUp API.`
          : r2Ready
            ? NOT_IMPORTED.attachments
            : 'R2 storage is not configured — ClickUp attachments were skipped.',
    }

    return summary
  }

  /**
   * Insert one ClickUp comment as a `task_comments` row. When the ClickUp author
   * can't be resolved to a workspace user, we fall back to the importing user
   * for `author_id` (a NOT NULL FK) and preserve the original author + timestamp
   * as text at the head of the body. The original timestamp is also mirrored
   * into `created_at` when ClickUp provided one.
   */
  private async importComment(
    taskId: string,
    userId: string,
    c: ClickUpComment,
    memberByKey: Map<string, string>,
  ): Promise<void> {
    const text = extractCommentText(c)
    const emailKey = c.user?.email?.trim().toLowerCase()
    const nameKey = c.user?.username?.trim().toLowerCase()
    const resolvedAuthor =
      (emailKey ? memberByKey.get(emailKey) : undefined) ??
      (nameKey ? memberByKey.get(nameKey) : undefined) ??
      null
    const createdAt = clickupDate(c.date)

    let body = text
    if (!resolvedAuthor) {
      const who = c.user?.username || c.user?.email || 'Unknown ClickUp user'
      const when = createdAt ? createdAt.toISOString() : (c.date ?? 'unknown date')
      body = `**${who}** _(ClickUp comment · ${when})_\n\n${text}`.trim()
    }

    await this.db.insert(taskComments).values({
      taskId,
      authorId: resolvedAuthor ?? userId,
      body: body || '(empty ClickUp comment)',
      ...(createdAt ? { createdAt } : {}),
    })
  }

  /**
   * Stream one ClickUp attachment to R2 and create a `task_attachments` row,
   * reusing the exact task-attachment storage-key convention + R2 upload path.
   * Returns 'skipped' (not an error) when R2 is off or the bytes can't be
   * fetched, so a missing file degrades gracefully.
   */
  private async importAttachment(
    workspaceId: string,
    taskId: string,
    userId: string,
    att: ClickUpAttachment,
    client: ClickUpClientLike,
    r2Ready: boolean,
  ): Promise<'imported' | 'skipped'> {
    if (!r2Ready || !this.r2) return 'skipped'
    const dl = await client.downloadAttachment(att)
    if (!dl) return 'skipped'

    const fileName = att.title || safeAttachmentName(att.id)
    const key = `workspaces/${workspaceId}/tasks/${taskId}/attachments/${Date.now()}-${safeAttachmentName(fileName)}`
    await this.r2.putObject(key, dl.buffer, dl.contentType, {
      source: 'clickup-import',
      clickupattachmentid: String(att.id).slice(0, 200),
    })
    await this.db.insert(taskAttachments).values({
      taskId,
      uploadedById: userId,
      fileName,
      contentType: dl.contentType,
      sizeBytes: att.size ?? dl.buffer.length,
      storageKey: key,
    })
    return 'imported'
  }

  /** Subset of `ids` that are tasks inside `workspaceId` (crafted-mapping guard). */
  private async loadWorkspaceTaskIds(workspaceId: string, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set()
    const rows = await this.db
      .select({ id: tasks.id })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(eq(spaces.workspaceId, workspaceId), inArray(tasks.id, ids)))
    return new Set(rows.map((r) => r.id))
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  /** A zeroed summary. Comments/attachments stay 0 unless enrichment runs. */
  private emptySummary(): ImportSummary {
    return {
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
      commentsImported: 0,
      attachmentsImported: 0,
      attachmentsSkipped: 0,
      errors: [],
      notImported: { ...NOT_IMPORTED },
    }
  }

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
    // WHATEVER ITS CASE, as the tags route and a task's `labelsByName` find a
    // tag (`found-30-sep/spreadsheet-import-skips-task-rules`): an exact match
    // made "urgent-X" beside the workspace's "Urgent-X" — the unique
    // constraint is case-sensitive — measured on lane 3 and again on lane 4.
    //
    // AND BY THE NAME IT IS STORED UNDER as well as the name in the file: a
    // tag is made cut to 60 characters, so a longer one was looked up by a
    // name no tag has — a second import of it in another case made a twin
    // differing only in case, and in the same case found nothing, struck the
    // twin's conflict and dropped the tag (measured on lane 4).
    const full = name.trim()
    const stored = full.slice(0, 60)
    const named = and(
      eq(labels.workspaceId, workspaceId),
      sql`lower(${labels.name}) in (lower(${full}), lower(${stored}))`,
    )
    const [existing] = await this.db.select({ id: labels.id }).from(labels).where(named).limit(1)
    if (existing) {
      cache.set(key, existing.id)
      return existing.id
    }
    const [row] = await this.db
      .insert(labels)
      .values({ workspaceId, name: stored, color: '#8b5cf6' })
      .onConflictDoNothing()
      .returning()
    const id = row?.id ?? (await this.db.select({ id: labels.id }).from(labels).where(named).limit(1))[0]?.id
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

  /** Merge = update the existing task's fields the CSV carries (`mergeSetOf`), and no other. */
  private async mergeTask(taskId: string, t: ParsedTask, carries: CsvCarries) {
    await this.db
      .update(tasks)
      .set({ ...mergeSetOf(t, carries), updatedAt: new Date() })
      .where(eq(tasks.id, taskId))
  }
}

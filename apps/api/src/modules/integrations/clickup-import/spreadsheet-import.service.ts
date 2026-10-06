/**
 * §V2-S13 frame `12:08` — the generic **Spreadsheet files** importer.
 *
 * One parser, one writer, and per-source column presets on top (see
 * `spreadsheet-import.util.ts`). The presets are why several of the frame's
 * named tools are genuinely covered without ten half-built code paths: Asana,
 * Jira Software, Monday, Notion, Todoist, Trello and Wrike all export a
 * task-shaped delimited file, and a mapping over one real importer is a real
 * importer for each of them.
 *
 * Three things this does that the ClickUp path does not, each of which was a
 * live defect there:
 *
 *  1. **Seeds the list's status pipeline.** `db.insert(lists)` does not; only
 *     `ListsService.createList` seeds `list_statuses`. A list imported without
 *     one has no columns to group by, so Board view renders nothing.
 *  2. **Sets `lists.space_id`.** Left null by the ClickUp path, so every
 *     "which space is this list in?" read has to join back through the project.
 *  3. **Stamps `tasks.status_category`.** Every rollup, the Closed toggle and
 *     the progress ring read that column and not `status`; an imported "Done"
 *     task with the default `open` category counts as open everywhere — a
 *     confident zero with a database row behind it.
 *
 * REJECTED ROWS ARE NEVER WRITTEN, and each one is reported by file line
 * number with the reason and the offending column.
 */

import { Injectable, Inject, BadRequestException, NotFoundException } from '@nestjs/common'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import {
  spaces,
  projects,
  lists,
  listStatuses,
  tasks,
  taskAssignees,
  labels,
  taskLabelAssignments,
  workspaceMembers,
  users,
  clickupImportJobs,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../../common/database/database.module'
import { dupKey } from './clickup-csv.util'
import { assertImportTarget } from './import-target'
import {
  ACCEPTED_SHEET_EXTENSIONS,
  DEFAULT_STATUSES,
  DEFAULT_LIST_NAME,
  NOT_DELIMITED_TEXT,
  SHEET_SOURCES,
  UNSUPPORTED_SOURCES,
  autoMap,
  headerHoldsNul,
  isZipContent,
  mapSheet,
  mappingError,
  mergeSet,
  parseSheet,
  sourceByKey,
  storable,
  type ColumnMapping,
  type MappedRow,
  type RowRejection,
  type SheetDelimiter,
} from './spreadsheet-import.util'

/** What the writers below need of a handle: the database, or a transaction in it. */
type Writer = Pick<Db, 'select' | 'insert' | 'update'>

/**
 * What one row wrote beside its task — people and tags — counted into the
 * summary only once the row's transaction commits, so a row that fails
 * counts nothing and leaves no tag it made in the cache.
 */
type RowTally = {
  assigneesLinked: number
  assigneesUnmatched: number
  labelsCreated: number
  labelKeys: string[]
  labelIds: string[]
}

/** What a run has made so far — what `undoRun` takes away if it fails. */
type RunMade = { spaceId?: string; projectId?: string; labelIds: string[] }

export type SheetConflictStrategy = 'skip' | 'create' | 'merge'

/** `source` values written to `clickup_import_jobs.source`. */
export const SHEET_SOURCE = 'spreadsheet'
export const CLICKUP_SOURCE = 'clickup_csv'

/** At most this many rejections are stored on the job row. */
const MAX_STORED_ROW_ERRORS = 200

export type SheetImportDto = {
  content: string
  delimiter?: SheetDelimiter
  preset?: string
  /** Explicit header → field mapping. Omitted → the preset's auto-mapping. */
  mapping?: ColumnMapping
  targetSpaceId?: string
  targetProjectName?: string
  strategy?: SheetConflictStrategy
  /** List name for rows whose file has no list/section column. */
  defaultListName?: string
}

export type SheetImportSummary = {
  source: string
  sourcePreset: string
  spacesCreated: number
  projectsCreated: number
  listsCreated: number
  tasksCreated: number
  tasksUpdated: number
  tasksSkipped: number
  /** Rows the importer refused. Distinct from `tasksSkipped` (a duplicate). */
  tasksRejected: number
  labelsCreated: number
  assigneesLinked: number
  /** Names in the file that match nobody in the workspace — said, not hidden. */
  assigneesUnmatched: number
  duplicatesDetected: number
  rowErrors: RowRejection[]
  rowErrorsTruncated: boolean
  errors: string[]
}

@Injectable()
export class SpreadsheetImportService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  /** The picker's catalogue — served so the UI cannot drift from the parser. */
  sources() {
    return {
      sources: SHEET_SOURCES.map((s) => ({
        key: s.key,
        label: s.label,
        exportHint: s.exportHint,
        columns: Object.keys(s.columns).length,
      })),
      /*
       * Listed as TEXT for the report, never as a control. A tile that opens a
       * dialog which cannot import is the facade defect; a sentence saying why
       * there is no tile is the opposite of one.
       */
      unsupported: UNSUPPORTED_SOURCES.map((u) => ({ key: u.key, label: u.label, reason: u.reason })),
      /*
       * No XLSX parser ships in this repo and none was added for this row, so
       * the UI says "save it as CSV" — and refuses an .xlsx put in anyway, by
       * its name and by its first bytes, as preview and import refuse its
       * content here (`assertDelimitedText`).
       */
      acceptedExtensions: [...ACCEPTED_SHEET_EXTENSIONS],
    }
  }

  /**
   * THE ROUTE RECEIVES CONTENT ONLY, SO IT ASKS THE CONTENT'S FIRST BYTES
   * (`found-5-oct/xlsx-read-as-text`). A zip, or a first line holding a NUL
   * (a legacy .xls, or any other binary file), is not delimited text, whatever
   * the page or a client called it: refused in the page's own words, before
   * anything is parsed or written.
   */
  private assertDelimitedText(content: unknown) {
    if (isZipContent(content)) throw new BadRequestException(NOT_DELIMITED_TEXT)
    if (headerHoldsNul(content)) throw new BadRequestException(NOT_DELIMITED_TEXT)
  }

  // ── preview ────────────────────────────────────────────────────────────────
  /**
   * Parse without writing. Returns the headers, the delimiter it found, the
   * starting mapping for the chosen preset, a small sample of what the rows
   * would become, and — importantly — the rows that WOULD be rejected, so the
   * refusals are visible before anything is created.
   */
  async previewSheet(
    workspaceId: string,
    dto: { content: string; delimiter?: SheetDelimiter; preset?: string; mapping?: ColumnMapping; defaultListName?: string },
  ) {
    const source = sourceByKey(dto.preset)
    this.assertDelimitedText(dto.content)
    const table = parseSheet(dto.content ?? '', dto.delimiter)
    if (table.headers.length === 0) {
      throw new BadRequestException('The file has no header row.')
    }
    const mapping = this.resolveMapping(table.headers, dto.mapping, dto.preset)
    const problem = mappingError(mapping)

    const { rows, rejections } = problem
      ? { rows: [] as MappedRow[], rejections: [] as RowRejection[] }
      : mapSheet(table, mapping, {
          priorityScale: source.priorityScale,
          defaultListName: dto.defaultListName,
        })

    // Duplicate scan against the target scope, same key the writer uses.
    const existing = problem ? new Map<string, string>() : await this.loadExistingTaskIndex(workspaceId)
    const seen = new Set<string>()
    let duplicates = 0
    for (const r of rows) {
      const key = dupKey(r.listName, r.title)
      if (existing.has(key) || seen.has(key)) duplicates++
      seen.add(key)
    }

    return {
      preset: source.key,
      presetLabel: source.label,
      delimiter: table.delimiter,
      headers: table.headers,
      mapping,
      mappingError: problem,
      totalRows: table.rows.length,
      importableRows: rows.length,
      rejectedRows: rejections.length,
      rowErrors: rejections.slice(0, MAX_STORED_ROW_ERRORS),
      uniqueLists: Array.from(new Set(rows.map((r) => r.listName))),
      duplicates,
      sample: rows.slice(0, 5).map((r) => ({
        row: r.row,
        title: r.title,
        status: r.status,
        priority: r.priority,
        list: r.listName,
        dueDate: r.dueDate?.toISOString() ?? null,
        assignees: r.assignees,
        tags: r.tags,
      })),
    }
  }

  // ── job lifecycle ──────────────────────────────────────────────────────────

  async startSheetImport(workspaceId: string, userId: string, dto: SheetImportDto): Promise<{ jobId: string }> {
    if (!dto.content?.trim()) throw new BadRequestException('The uploaded file is empty.')
    this.assertDelimitedText(dto.content)
    const table = parseSheet(dto.content, dto.delimiter)
    if (table.headers.length === 0) throw new BadRequestException('The file has no header row.')
    if (table.rows.length === 0) throw new BadRequestException('The file has a header but no data rows.')

    const mapping = this.resolveMapping(table.headers, dto.mapping, dto.preset)
    const problem = mappingError(mapping)
    if (problem) throw new BadRequestException(problem)

    // Where it goes, before anything is written — the job row included.
    if (dto.targetSpaceId) await assertImportTarget(this.db, { workspaceId, spaceId: dto.targetSpaceId, actorId: userId })

    const source = sourceByKey(dto.preset)
    const [job] = await this.db
      .insert(clickupImportJobs)
      .values({
        workspaceId,
        createdById: userId,
        status: 'pending',
        total: table.rows.length,
        source: SHEET_SOURCE,
        sourcePreset: source.key,
      })
      .returning({ id: clickupImportJobs.id })

    void this.processSheetImport(job.id, workspaceId, userId, dto).catch(() => undefined)
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
   * The import history. THE READER OF `source`: without the filter this would
   * mix the ClickUp runs into the spreadsheet importer's history and the column
   * would be a stored value nobody honours.
   */
  async listJobs(workspaceId: string, opts: { source?: string; limit?: number } = {}) {
    const where = opts.source
      ? and(eq(clickupImportJobs.workspaceId, workspaceId), eq(clickupImportJobs.source, opts.source))
      : eq(clickupImportJobs.workspaceId, workspaceId)
    return this.db
      .select({
        id: clickupImportJobs.id,
        source: clickupImportJobs.source,
        sourcePreset: clickupImportJobs.sourcePreset,
        status: clickupImportJobs.status,
        total: clickupImportJobs.total,
        processed: clickupImportJobs.processed,
        createdCount: clickupImportJobs.createdCount,
        updatedCount: clickupImportJobs.updatedCount,
        skippedCount: clickupImportJobs.skippedCount,
        rejectedCount: clickupImportJobs.rejectedCount,
        createdAt: clickupImportJobs.createdAt,
      })
      .from(clickupImportJobs)
      .where(where)
      .orderBy(desc(clickupImportJobs.createdAt))
      .limit(Math.min(Math.max(opts.limit ?? 20, 1), 100))
  }

  // ── the worker ─────────────────────────────────────────────────────────────
  /**
   * Awaitable so tests and verification can run it directly and read the
   * summary rather than poll. Streams progress into the job row as it goes.
   */
  async processSheetImport(
    jobId: string,
    workspaceId: string,
    userId: string,
    dto: SheetImportDto,
  ): Promise<SheetImportSummary> {
    const source = sourceByKey(dto.preset)
    const strategy: SheetConflictStrategy = dto.strategy ?? 'skip'
    const summary = this.emptySummary(source.key)
    const made: RunMade = { labelIds: [] }

    try {
      const table = parseSheet(dto.content, dto.delimiter)
      const mapping = this.resolveMapping(table.headers, dto.mapping, dto.preset)
      const problem = mappingError(mapping)
      if (problem) throw new BadRequestException(problem)

      const { rows, rejections } = mapSheet(table, mapping, {
        priorityScale: source.priorityScale,
        defaultListName: dto.defaultListName,
      })
      summary.tasksRejected = rejections.length
      summary.rowErrors = rejections.slice(0, MAX_STORED_ROW_ERRORS)
      summary.rowErrorsTruncated = rejections.length > MAX_STORED_ROW_ERRORS

      await this.db
        .update(clickupImportJobs)
        .set({
          status: 'processing',
          total: table.rows.length,
          rejectedCount: summary.tasksRejected,
          rowErrors: storable(summary.rowErrors),
          updatedAt: new Date(),
        })
        .where(eq(clickupImportJobs.id, jobId))

      /*
       * A RUN THAT FAILS TAKES AWAY WHAT IT MADE (`found-5-oct/xlsx-read-as-text`),
       * AND HOLDS NO TRANSACTION OPEN WHILE IT RUNS.
       *
       * The space and the project were written first and on their own, so a
       * run that then failed left them behind: an .xlsx read as text ended
       * "failed" with a new space, project and empty "Imported Tasks" list,
       * and a file with one row holding a NUL ended "failed" with its other
       * rows imported (measured on lane 4). Now what a run makes is noted as
       * it is made (`made`), and a run that fails takes it away (`undoRun`).
       *
       * NOT ONE TRANSACTION FOR THE WHOLE RUN, which was tried first and
       * measured on lane 4: it held one of the API's pooled connections for
       * the run while each progress write waited for another, so twelve
       * imports at once held all ten and every route of the API stopped
       * answering until it was restarted; a task the run merged stayed locked
       * until the run ended, and nine edits of it did the same with one
       * import; and a tag the run made was invisible to the tags route until
       * then, which made the same tag in another case beside it.
       *
       * So each list, and each row with its people and tags, is written in a
       * transaction of its own that waits on nothing but its own writes. A row
       * that fails fails alone, as it always did: its error is reported, it
       * leaves nothing half-written, and the rest of the file goes on.
       */
      let spaceId = dto.targetSpaceId
      if (!spaceId) {
        const [space] = await this.db
          .insert(spaces)
          .values({
            workspaceId,
            name: dto.targetProjectName?.trim() || `Imported from ${source.label}`,
            icon: '📥',
            color: '#354fb0',
          })
          .returning({ id: spaces.id })
        spaceId = made.spaceId = space.id
        summary.spacesCreated++
      }
      const inSpace = spaceId

      const [project] = await this.db
        .insert(projects)
        .values({
          spaceId: inSpace,
          name: dto.targetProjectName?.trim() || `${source.label} import`,
          description: `Imported from a ${source.label} export on ${new Date().toISOString()}`,
        })
        .returning({ id: projects.id })
      made.projectId = project.id
      summary.projectsCreated++

      const memberByKey = await this.loadMemberIndex(this.db, workspaceId)
      const existing = await this.loadExistingTaskIndex(workspaceId, dto.targetSpaceId)
      const labelCache = new Map<string, string>()

      const byList = new Map<string, MappedRow[]>()
      for (const r of rows) {
        const name = r.listName || DEFAULT_LIST_NAME
        const arr = byList.get(name) ?? []
        arr.push(r)
        byList.set(name, arr)
      }

      const seenByKey = new Map<string, string>()
      const updateEvery = Math.max(1, Math.ceil(Math.max(rows.length, 1) / 100))
      // Rejected rows are already accounted for; progress starts past them so
      // the bar reaches 100% on a file where some rows were refused.
      let processed = rejections.length
      let position = 0

      for (const [listName, listRows] of byList) {
        let listId: string
        try {
          const at = position++
          listId = await this.db.transaction((tx) => this.createList(tx, project.id, inSpace, listName, at, userId))
          summary.listsCreated++
        } catch (e: any) {
          summary.errors.push(`List "${listName}": ${e?.message ?? 'unknown error'}`)
          processed += listRows.length
          await this.updateProgress(jobId, processed, summary)
          continue
        }

        for (const r of listRows) {
          const tally: RowTally = { assigneesLinked: 0, assigneesUnmatched: 0, labelsCreated: 0, labelKeys: [], labelIds: [] }
          try {
            const key = dupKey(listName, r.title)
            const targetId = existing.get(key) ?? seenByKey.get(key)
            if (targetId) summary.duplicatesDetected++

            if (targetId && strategy === 'skip') {
              summary.tasksSkipped++
            } else if (targetId && strategy === 'merge') {
              await this.db.transaction(async (tx) => {
                // Only what the file maps (`mergeSet`): a column the file
                // lacks leaves its field as the task has it.
                await tx
                  .update(tasks)
                  .set({ ...mergeSet(r, mapping), updatedAt: new Date() })
                  .where(eq(tasks.id, targetId))
                await this.applyPeopleAndTags(tx, workspaceId, targetId, r, memberByKey, labelCache, tally)
              })
              summary.tasksUpdated++
              this.count(summary, tally, made)
            } else {
              const taskId = await this.db.transaction(async (tx) => {
                const [task] = await tx
                  .insert(tasks)
                  .values({
                    listId,
                    createdById: userId,
                    title: r.title,
                    description: r.description ?? null,
                    status: r.status,
                    // The column every rollup reads. See the header note.
                    statusCategory: r.statusCategory,
                    priority: r.priority,
                    dueDate: r.dueDate,
                    startDate: r.startDate,
                  })
                  .returning({ id: tasks.id })
                await this.applyPeopleAndTags(tx, workspaceId, task.id, r, memberByKey, labelCache, tally)
                return task.id
              })
              summary.tasksCreated++
              if (!seenByKey.has(key)) seenByKey.set(key, taskId)
              this.count(summary, tally, made)
            }
          } catch (e: any) {
            // Its transaction is rolled back: a tag it made is not there to find.
            for (const k of tally.labelKeys) labelCache.delete(k)
            summary.errors.push(`Row ${r.row} ("${r.title}"): ${e?.message ?? 'unknown error'}`)
          } finally {
            processed++
            if (processed % updateEvery === 0) await this.updateProgress(jobId, processed, summary)
          }
        }
      }

      await this.db
        .update(clickupImportJobs)
        .set({
          status: 'completed',
          processed: table.rows.length,
          createdCount: summary.tasksCreated,
          updatedCount: summary.tasksUpdated,
          skippedCount: summary.tasksSkipped,
          rejectedCount: summary.tasksRejected,
          rowErrors: storable(summary.rowErrors),
          result: storable(summary) as unknown as Record<string, unknown>,
          updatedAt: new Date(),
        })
        .where(eq(clickupImportJobs.id, jobId))

      return summary
    } catch (e: any) {
      const left = await this.undoRun(made)
      // What it made is gone, so it created nothing; a merge into a task that
      // was already there stays, and is counted.
      await this.db
        .update(clickupImportJobs)
        .set({
          status: 'failed',
          error: storable([e?.message ?? 'Import failed', left].filter(Boolean).join(' ')),
          createdCount: left ? summary.tasksCreated : 0,
          updatedCount: summary.tasksUpdated,
          skippedCount: summary.tasksSkipped,
          updatedAt: new Date(),
        })
        .where(eq(clickupImportJobs.id, jobId))
        .catch(() => undefined)
      throw e
    }
  }

  /**
   * WHAT A RUN THAT FAILED MADE, TAKEN AWAY AGAIN: its project — and with it
   * every list, status and task in it, by the foreign keys' cascade — its
   * space when it made one, and the tags it made that label nothing once
   * those are gone. A merge it wrote into a task that was already there
   * stays: that task is not the run's to remove. `null` when all of it went,
   * or the sentence the job's error carries when some could not.
   */
  private async undoRun(made: RunMade): Promise<string | null> {
    try {
      if (made.projectId) await this.db.delete(projects).where(eq(projects.id, made.projectId))
      if (made.spaceId) await this.db.delete(spaces).where(eq(spaces.id, made.spaceId))
      if (made.labelIds.length > 0) {
        await this.db
          .delete(labels)
          .where(
            and(
              inArray(labels.id, made.labelIds),
              sql`not exists (select 1 from ${taskLabelAssignments} where ${taskLabelAssignments.labelId} = ${labels.id})`,
            ),
          )
      }
      return null
    } catch (e: any) {
      return `What it made could not all be removed: ${e?.message ?? 'unknown error'}`
    }
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  /** An explicit mapping wins; otherwise the preset's auto-mapping. */
  private resolveMapping(headers: string[], supplied: ColumnMapping | undefined, preset?: string): ColumnMapping {
    if (!supplied || Object.keys(supplied).length === 0) return autoMap(headers, preset)
    // Only headers the file actually has; an unknown key would silently do
    // nothing and make the mapping look richer than it is.
    const mapping: ColumnMapping = {}
    for (const h of headers) mapping[h] = supplied[h] ?? 'ignore'
    return mapping
  }

  /**
   * Create a list AND its default status pipeline, the way `ListsService` does
   * — `db.insert(lists)` alone leaves a list with no statuses to group by.
   * `space_id` is set here too; the ClickUp path leaves it null.
   */
  private async createList(
    db: Writer,
    projectId: string,
    spaceId: string,
    name: string,
    position: number,
    userId: string,
  ): Promise<string> {
    const [list] = await db
      .insert(lists)
      .values({ projectId, spaceId, name: name.slice(0, 200), position, createdById: userId })
      .returning({ id: lists.id })
    await db
      .insert(listStatuses)
      .values(DEFAULT_STATUSES.map((s) => ({ listId: list.id, ...s })))
      .onConflictDoNothing()
    return list.id
  }

  private async applyPeopleAndTags(
    db: Writer,
    workspaceId: string,
    taskId: string,
    row: MappedRow,
    memberByKey: Map<string, string>,
    labelCache: Map<string, string>,
    tally: RowTally,
  ) {
    for (const who of row.assignees) {
      const userId = memberByKey.get(who.toLowerCase())
      if (!userId) {
        tally.assigneesUnmatched++
        continue
      }
      await db.insert(taskAssignees).values({ taskId, userId }).onConflictDoNothing()
      tally.assigneesLinked++
    }
    for (const tag of row.tags) {
      const labelId = await this.ensureLabel(db, workspaceId, tag, labelCache, tally)
      if (labelId) {
        await db.insert(taskLabelAssignments).values({ taskId, labelId }).onConflictDoNothing()
      }
    }
  }

  /** A row's people and tags, into the run's summary — and its new tags into what it made — once the row is written. */
  private count(summary: SheetImportSummary, tally: RowTally, made: RunMade) {
    summary.assigneesLinked += tally.assigneesLinked
    summary.assigneesUnmatched += tally.assigneesUnmatched
    summary.labelsCreated += tally.labelsCreated
    made.labelIds.push(...tally.labelIds)
  }

  /**
   * The workspace's tag of this name, WHATEVER ITS CASE, or a new one
   * (`found-30-sep/spreadsheet-import-skips-task-rules`). The lookup matched
   * the exact spelling while only its cache key was lower-cased, and the
   * unique constraint is case-sensitive: a row tagged "urgent-X" in a
   * workspace holding "Urgent-X" made a second tag beside it, where the tags
   * route (`LabelsService.create`) and a task's `labelsByName` find the one
   * there. ClickUp has no such pair: its tags are lower-case whatever is typed.
   */
  private async ensureLabel(
    db: Writer,
    workspaceId: string,
    name: string,
    cache: Map<string, string>,
    tally: RowTally,
  ): Promise<string | null> {
    const trimmed = name.trim().slice(0, 60)
    const key = trimmed.toLowerCase()
    if (!key) return null
    if (cache.has(key)) return cache.get(key)!

    const named = and(eq(labels.workspaceId, workspaceId), sql`lower(${labels.name}) = lower(${trimmed})`)
    const [found] = await db.select({ id: labels.id }).from(labels).where(named).limit(1)
    if (found) {
      cache.set(key, found.id)
      return found.id
    }
    const [row] = await db
      .insert(labels)
      .values({ workspaceId, name: trimmed, color: '#8b5cf6' })
      .onConflictDoNothing()
      .returning({ id: labels.id })
    const id = row?.id ?? (await db.select({ id: labels.id }).from(labels).where(named).limit(1))[0]?.id
    if (!id) return null
    if (row) {
      tally.labelsCreated++
      tally.labelKeys.push(key)
      tally.labelIds.push(id)
    }
    cache.set(key, id)
    return id
  }

  private async loadMemberIndex(db: Writer, workspaceId: string): Promise<Map<string, string>> {
    const rows = await db
      .select({ userId: users.id, displayName: users.displayName, email: users.email })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, workspaceId))
    const byKey = new Map<string, string>()
    for (const m of rows) {
      if (m.displayName) byKey.set(m.displayName.trim().toLowerCase(), m.userId)
      if (m.email) byKey.set(m.email.trim().toLowerCase(), m.userId)
    }
    return byKey
  }

  private async loadExistingTaskIndex(
    workspaceId: string,
    targetSpaceId?: string,
    db: Writer = this.db,
  ): Promise<Map<string, string>> {
    const where = targetSpaceId
      ? and(eq(spaces.workspaceId, workspaceId), eq(spaces.id, targetSpaceId))
      : eq(spaces.workspaceId, workspaceId)
    const rows = await db
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

  private async updateProgress(jobId: string, processed: number, summary: SheetImportSummary) {
    await this.db
      .update(clickupImportJobs)
      .set({
        processed,
        createdCount: summary.tasksCreated,
        updatedCount: summary.tasksUpdated,
        skippedCount: summary.tasksSkipped,
        rejectedCount: summary.tasksRejected,
        updatedAt: new Date(),
      })
      .where(eq(clickupImportJobs.id, jobId))
      .catch(() => undefined)
  }

  private emptySummary(preset: string): SheetImportSummary {
    return {
      source: SHEET_SOURCE,
      sourcePreset: preset,
      spacesCreated: 0,
      projectsCreated: 0,
      listsCreated: 0,
      tasksCreated: 0,
      tasksUpdated: 0,
      tasksSkipped: 0,
      tasksRejected: 0,
      labelsCreated: 0,
      assigneesLinked: 0,
      assigneesUnmatched: 0,
      duplicatesDetected: 0,
      rowErrors: [],
      rowErrorsTruncated: false,
      errors: [],
    }
  }
}

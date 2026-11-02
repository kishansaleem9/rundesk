/**
 * Settings › Imports / Exports — the import jobs' lifecycle (§7, §9.7).
 *
 *   POST   /imports              a DRAFT job: source, destination, date format, delimiter
 *   POST   /imports/:id/upload   the reviewed rows, in chunks (a 100,000-row sheet is
 *                                larger than one request may be)
 *   GET    /imports/:id/preview  what the mapping screens need of the destination
 *   PUT    /imports/:id/mapping  the grid's columns and the value maps
 *   POST   /imports/:id/start    queued ("Import Queued"), and the runner is kicked
 *   POST   /imports/:id/cancel   honoured between batches
 *   DELETE /imports/:id          everything it made, to Trash, within 10 days
 *   GET    /imports              the history (imports and exports together)
 *   GET    /imports/:id          View details
 *
 * Every route asks `workspace.import` (an admin's by default, grantable by a
 * custom role) and refuses a guest whatever a role grants (`assertMayImport`).
 * The history and reports ask the same: they used to answer any member
 * (`found-6-oct/import-history-read-by-anyone`).
 */

import { BadRequestException, ConflictException, ForbiddenException, HttpException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, asc, desc, eq, gte, ilike, ne, sql } from 'drizzle-orm'
import {
  clickupImportJobs,
  customFieldDefinitions,
  exportJobs,
  importErrors,
  importJobItems,
  importMappingMemory,
  importStagedRows,
  taskTypes,
  users,
  workspaceMembers,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import {
  DATE_FORMAT_OPTIONS,
  IMPORTABLE_FIELD_TYPES,
  isCsvSource,
  mappingProblem,
  normaliseHeader,
  tooManyRows,
  type ColumnMapping,
  type GridColumn,
  type ValueMaps,
} from '@rundesk/imports'
import { DB_TOKEN } from '../../common/database/database.module'
import { toCsv } from '../../common/export/csv'
import type { ReadActor } from '../../common/permissions/read-access'
import { resolveEffectiveStatuses } from '../../common/statuses/status-resolution'
import { isUuid } from '../../common/validation/uuid'
import { DEFAULT_LIST_STATUSES } from '../lists/list-statuses.defaults'
import { assertMayImport } from '../integrations/clickup-import/import-access'
import { PlansService } from '../plans/plans.service'
import { SecurityService } from '../security/security.service'
import { ImportCleanupService } from './import-cleanup.service'
import { resolveDestination } from './import-destination'
import { importLimitsFor } from './import-limits'
import { sourceLabel, supportReference } from './import-plan'
import { ImportRunnerService } from './import-runner.service'
import { IMPORT_STATUS_LABELS, type ImportDestination, type SpreadsheetImportMapping, type SpreadsheetImportOptions, type StagedRow } from './imports.types'

export type Actor = ReadActor & { id: string }

const SPREADSHEET = 'spreadsheet'
/** The largest chunk one upload may carry, in rows; the wizard sends ~512 KB at a time. */
const MAX_ROWS_PER_CHUNK = 5_000

@Injectable()
export class ImportsService {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly runner: ImportRunnerService,
    private readonly cleanup: ImportCleanupService,
    private readonly plans: PlansService,
    private readonly security: SecurityService,
  ) {}

  private async limits(workspaceId: string) {
    return importLimitsFor((await this.plans.getWorkspacePlan(workspaceId)).id)
  }

  private async job(workspaceId: string, jobId: string) {
    // An id that is no uuid names no import — not a Postgres error.
    if (!isUuid(jobId)) throw new NotFoundException('Import not found')
    const [job] = await this.db
      .select()
      .from(clickupImportJobs)
      .where(and(eq(clickupImportJobs.id, jobId), eq(clickupImportJobs.workspaceId, workspaceId)))
      .limit(1)
    if (!job) throw new NotFoundException('Import not found')
    return job
  }

  /** A draft is its maker's until it starts: nobody else uploads rows into it or starts it. */
  private async draft(workspaceId: string, jobId: string, actor: Actor) {
    const job = await this.job(workspaceId, jobId)
    if (job.status !== 'draft') throw new ConflictException('This import has already started.')
    if (job.createdById !== actor.id) throw new ForbiddenException('Only the person who began this import can continue it.')
    return job
  }

  private checkOptions(options: Partial<SpreadsheetImportOptions> | undefined): SpreadsheetImportOptions {
    if (!options?.destination) throw new BadRequestException('Choose where to import your tasks.')
    const dateFormat = options.dateFormat ?? 'ymd'
    if (!DATE_FORMAT_OPTIONS.some((o) => o.value === dateFormat)) throw new BadRequestException('Choose the format of your dates.')
    const delimiter = options.delimiter ?? ','
    if (typeof delimiter !== 'string' || [...delimiter].length !== 1 || /\s/.test(delimiter)) {
      throw new BadRequestException('The delimiter for multi-value fields must be one character.')
    }
    return {
      destination: { type: options.destination.type, id: options.destination.id } as ImportDestination,
      dateFormat,
      delimiter,
      valueMaps: options.valueMaps,
      invite: Array.isArray(options.invite) ? options.invite.filter((e) => typeof e === 'string').slice(0, 500) : undefined,
    }
  }

  // ── draft → queued ─────────────────────────────────────────────────────────

  async create(
    workspaceId: string,
    actor: Actor,
    body: { source?: string; preset?: string; options?: Partial<SpreadsheetImportOptions>; fileName?: string },
  ) {
    await assertMayImport(this.db, { workspaceId, actorId: actor.id })
    if ((body.source ?? SPREADSHEET) !== SPREADSHEET) throw new BadRequestException('This source cannot be imported yet.')
    const options = this.checkOptions(body.options)
    const dest = await resolveDestination(this.db, workspaceId, options.destination, actor)
    const [job] = await this.db
      .insert(clickupImportJobs)
      .values({
        workspaceId,
        createdById: actor.id,
        status: 'draft',
        source: SPREADSHEET,
        // An app's CSV export (Asana, Jira, …) is the spreadsheet importer with that app's columns.
        sourcePreset: isCsvSource(body.preset) ? body.preset : 'generic',
        options: options as unknown as Record<string, unknown>,
        fileName: typeof body.fileName === 'string' ? body.fileName.slice(0, 255) : null,
        supportReference: supportReference(),
      })
      .returning({ id: clickupImportJobs.id, supportReference: clickupImportJobs.supportReference })
    return { id: job.id, supportReference: job.supportReference, destination: { type: dest.type, id: dest.id, name: dest.name, path: dest.path } }
  }

  async upload(workspaceId: string, jobId: string, actor: Actor, body: { chunkIndex?: number; rows?: unknown }) {
    await assertMayImport(this.db, { workspaceId, actorId: actor.id })
    await this.draft(workspaceId, jobId, actor)
    const chunkIndex = Number(body.chunkIndex)
    if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex > 10_000) throw new BadRequestException('chunkIndex must be a whole number from 0.')
    if (!Array.isArray(body.rows) || body.rows.length === 0 || body.rows.length > MAX_ROWS_PER_CHUNK) {
      throw new BadRequestException(`A chunk carries 1 to ${MAX_ROWS_PER_CHUNK} rows.`)
    }
    const rows: StagedRow[] = body.rows.map((r, i) => {
      const row = r as { key?: unknown; line?: unknown; values?: unknown }
      if (typeof row?.key !== 'string' || !row.values || typeof row.values !== 'object' || Array.isArray(row.values)) {
        throw new BadRequestException(`Row ${i + 1} of chunk ${chunkIndex} is not a grid row.`)
      }
      const values: Record<string, string> = {}
      for (const [k, v] of Object.entries(row.values as Record<string, unknown>)) {
        // Postgres refuses U+0000 in jsonb; a NUL says one stood there.
        values[k] = String(v ?? '').split('\u0000').join('�')
      }
      return { key: row.key.slice(0, 64), line: typeof row.line === 'number' ? row.line : undefined, values }
    })
    const limits = await this.limits(workspaceId)
    const [held] = await this.db
      .select({ n: sql<number>`coalesce(sum(jsonb_array_length(${importStagedRows.rows})), 0)::int` })
      .from(importStagedRows)
      .where(and(eq(importStagedRows.jobId, jobId), ne(importStagedRows.chunkIndex, chunkIndex)))
    if ((held?.n ?? 0) + rows.length > limits.maxRows) {
      throw new BadRequestException(tooManyRows(limits.maxRows))
    }
    await this.db
      .insert(importStagedRows)
      .values({ jobId, chunkIndex, rows })
      .onConflictDoUpdate({ target: [importStagedRows.jobId, importStagedRows.chunkIndex], set: { rows, createdAt: new Date() } })
    return { ok: true, rows: (held?.n ?? 0) + rows.length }
  }

  /**
   * §2.4–§2.5 — what Map fields needs of the destination: the Custom Fields
   * available THERE (not every field in the workspace), its statuses, the
   * workspace's task types and members, the field types offered, and this
   * workspace's remembered mapping.
   */
  async preview(workspaceId: string, jobId: string, actor: Actor) {
    await assertMayImport(this.db, { workspaceId, actorId: actor.id })
    const job = await this.job(workspaceId, jobId)
    const options = job.options as unknown as SpreadsheetImportOptions
    const dest = await resolveDestination(this.db, workspaceId, options.destination, actor)
    const fields = dest.projectId
      ? await this.db
          .select({ id: customFieldDefinitions.id, name: customFieldDefinitions.name, type: customFieldDefinitions.type, listId: customFieldDefinitions.listId })
          .from(customFieldDefinitions)
          .where(eq(customFieldDefinitions.projectId, dest.projectId))
          .orderBy(asc(customFieldDefinitions.position))
      : []
    const statuses = dest.listId
      ? await resolveEffectiveStatuses(this.db, dest.listId)
      : DEFAULT_LIST_STATUSES.map((s) => ({ key: s.key, name: s.name, color: s.color, category: s.category, position: s.position }))
    const types = await this.db
      .select({ id: taskTypes.id, name: taskTypes.name })
      .from(taskTypes)
      .where(eq(taskTypes.workspaceId, workspaceId))
      .orderBy(asc(taskTypes.position))
    const members = await this.db
      .select({ id: users.id, name: users.displayName, email: users.email, avatarUrl: users.avatarUrl })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, workspaceId))
    return {
      destination: { type: dest.type, id: dest.id, name: dest.name, path: dest.path },
      // A field narrowed to another List of the project is not available to these rows.
      customFields: fields
        .filter((f) => !f.listId || f.listId === dest.listId)
        .map((f) => ({ id: f.id, name: f.name, type: f.type, importable: IMPORTABLE_FIELD_TYPES.some((t) => t.type === f.type) })),
      statuses,
      taskTypes: types,
      members,
      mappingMemory: await this.mappingMemory(workspaceId, actor),
    }
  }

  async saveMapping(
    workspaceId: string,
    jobId: string,
    actor: Actor,
    body: { columns?: Record<string, string>; grid?: GridColumn[]; valueMaps?: ValueMaps; invite?: string[] },
  ) {
    await assertMayImport(this.db, { workspaceId, actorId: actor.id })
    const job = await this.draft(workspaceId, jobId, actor)
    const grid = Array.isArray(body.grid) ? body.grid : []
    if (!grid.some((c) => c?.key === 'taskName')) throw new BadRequestException('Task Name is required. Map one incoming field to Task Name.')
    for (const c of grid) {
      if (c.kind === 'custom' && c.fieldType && !IMPORTABLE_FIELD_TYPES.some((t) => t.type === c.fieldType)) {
        throw new BadRequestException(`"${c.label}" is a field type that is not supported for import.`)
      }
    }
    const columns = body.columns && typeof body.columns === 'object' ? body.columns : {}
    const problem = mappingProblem(columns as ColumnMapping)
    if (problem) throw new BadRequestException(problem)
    const options = { ...(job.options as unknown as SpreadsheetImportOptions) }
    if (body.valueMaps) options.valueMaps = body.valueMaps
    if (body.invite) options.invite = body.invite.filter((e) => typeof e === 'string').slice(0, 500)
    const mapping: SpreadsheetImportMapping = { columns, grid }
    await this.db
      .update(clickupImportJobs)
      .set({ mapping: mapping as unknown as Record<string, unknown>, options: options as unknown as Record<string, unknown>, updatedAt: new Date() })
      .where(eq(clickupImportJobs.id, jobId))
    return { ok: true }
  }

  async start(workspaceId: string, jobId: string, actor: Actor) {
    await assertMayImport(this.db, { workspaceId, actorId: actor.id })
    const job = await this.draft(workspaceId, jobId, actor)
    const mapping = job.mapping as unknown as SpreadsheetImportMapping | null
    if (!mapping?.grid?.length) throw new BadRequestException('Map the incoming fields before importing.')
    const options = job.options as unknown as SpreadsheetImportOptions
    const dest = await resolveDestination(this.db, workspaceId, options.destination, actor)
    const [staged] = await this.db
      .select({ n: sql<number>`coalesce(sum(jsonb_array_length(${importStagedRows.rows})), 0)::int` })
      .from(importStagedRows)
      .where(eq(importStagedRows.jobId, jobId))
    if (!staged?.n) throw new BadRequestException('There are no records to import.')

    const limits = await this.limits(workspaceId)
    if (limits.importsPerDay !== null) {
      const since = new Date(Date.now() - 24 * 60 * 60_000)
      const [today] = await this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(clickupImportJobs)
        .where(and(eq(clickupImportJobs.workspaceId, workspaceId), ne(clickupImportJobs.status, 'draft'), gte(clickupImportJobs.createdAt, since)))
      if ((today?.n ?? 0) >= limits.importsPerDay) {
        throw new HttpException(`This workspace has reached its limit of ${limits.importsPerDay} imports a day. Try again tomorrow.`, 429)
      }
    }

    await this.remember(workspaceId, mapping.columns)
    const deletableUntil = new Date(Date.now() + limits.deletableDays * 24 * 60 * 60_000)
    const [queued] = await this.db
      .update(clickupImportJobs)
      .set({ status: 'pending', phase: 'queued', total: staged.n, processed: 0, deletableUntil, updatedAt: new Date() })
      .where(and(eq(clickupImportJobs.id, jobId), eq(clickupImportJobs.status, 'draft')))
      .returning({ id: clickupImportJobs.id })
    if (!queued) throw new ConflictException('This import has already started.')
    await this.security
      .logAuditEvent({
        workspaceId,
        actorId: actor.id,
        action: 'import.started',
        resourceType: 'import',
        resourceId: jobId,
        description: `Started a${/^[AEIOU]/.test(sourceLabel(job.sourcePreset)) ? 'n' : ''} ${sourceLabel(job.sourcePreset)} import of ${staged.n} rows into ${dest.path}`,
        metadata: { source: SPREADSHEET, rows: staged.n, file: job.fileName ?? null },
      })
      .catch(() => undefined)
    this.runner.kick(jobId)
    return this.summary(workspaceId, jobId)
  }

  /** §2.4 historical mapping: the field chosen for each header, by its normalised spelling, for next time. */
  private async remember(workspaceId: string, columns: Record<string, string>) {
    const rows = Object.entries(columns)
      .filter(([h, t]) => normaliseHeader(h) && typeof t === 'string' && !/^cf:(?!new$)/.test(t))
      .map(([h, t]) => ({ workspaceId, source: SPREADSHEET, normalisedHeader: normaliseHeader(h), targetFieldKey: t, lastUsedAt: new Date() }))
    for (const row of rows) {
      await this.db
        .insert(importMappingMemory)
        .values(row)
        .onConflictDoUpdate({
          target: [importMappingMemory.workspaceId, importMappingMemory.source, importMappingMemory.normalisedHeader],
          set: { targetFieldKey: row.targetFieldKey, lastUsedAt: row.lastUsedAt },
        })
    }
  }

  async mappingMemory(workspaceId: string, actor: Actor): Promise<Record<string, string>> {
    await assertMayImport(this.db, { workspaceId, actorId: actor.id })
    const rows = await this.db
      .select({ header: importMappingMemory.normalisedHeader, target: importMappingMemory.targetFieldKey })
      .from(importMappingMemory)
      .where(and(eq(importMappingMemory.workspaceId, workspaceId), eq(importMappingMemory.source, SPREADSHEET)))
    return Object.fromEntries(rows.map((r) => [r.header, r.target]))
  }

  // ── cancel, delete ─────────────────────────────────────────────────────────

  /** §7 Cancel: allowed while queued or running. What was made stays, and is listed; Delete is offered after. */
  async cancel(workspaceId: string, jobId: string, actor: Actor) {
    await assertMayImport(this.db, { workspaceId, actorId: actor.id })
    const job = await this.job(workspaceId, jobId)
    if (!job.phase || !['pending', 'processing'].includes(job.status)) throw new ConflictException('Only a queued or running import can be cancelled.')
    // Queued and not yet claimed: it never starts.
    const [stopped] = await this.db
      .update(clickupImportJobs)
      .set({ status: 'cancelled', cancelRequestedAt: new Date(), finishedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(clickupImportJobs.id, jobId), eq(clickupImportJobs.status, 'pending')))
      .returning({ id: clickupImportJobs.id })
    if (!stopped) {
      await this.db.update(clickupImportJobs).set({ cancelRequestedAt: new Date(), updatedAt: new Date() }).where(eq(clickupImportJobs.id, jobId))
    }
    return this.summary(workspaceId, jobId)
  }

  /** "You can delete any imports created in the last 10 days. When you delete an import, all items created by the import will be deleted." */
  async remove(workspaceId: string, jobId: string, actor: Actor) {
    await assertMayImport(this.db, { workspaceId, actorId: actor.id })
    const job = await this.job(workspaceId, jobId)
    if (job.status === 'draft') {
      await this.db.delete(clickupImportJobs).where(eq(clickupImportJobs.id, jobId))
      return { ok: true, deleted: null }
    }
    if (!job.phase) throw new ConflictException('This import was made before imports could be deleted as a unit. Delete its items from their Lists, or with bulk actions.')
    if (!['completed', 'failed', 'cancelled'].includes(job.status)) throw new ConflictException('Cancel the import before deleting it.')
    if (!job.deletableUntil || job.deletableUntil.getTime() < Date.now()) {
      throw new ConflictException('Imports can only be deleted within 10 days. Delete its items manually or with bulk actions.')
    }
    const counts = await this.cleanup.trashImport(jobId, actor.id)
    await this.db
      .update(clickupImportJobs)
      .set({ status: 'deleted', deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(clickupImportJobs.id, jobId))
    await this.security
      .logAuditEvent({
        workspaceId,
        actorId: actor.id,
        action: 'import.deleted',
        resourceType: 'import',
        resourceId: jobId,
        description: `Deleted an import: ${counts.tasks} tasks and ${counts.lists} lists moved to Trash`,
        metadata: { ...counts },
      })
      .catch(() => undefined)
    return { ok: true, deleted: counts }
  }

  // ── history and reports ────────────────────────────────────────────────────

  private async summary(workspaceId: string, jobId: string) {
    const [row] = await this.history(workspaceId, { id: jobId })
    return row
  }

  /** §7 — the history table: imports (every importer, old and new) and exports, newest first. */
  async list(workspaceId: string, actor: Actor, opts: { limit?: number } = {}) {
    await assertMayImport(this.db, { workspaceId, actorId: actor.id })
    return { items: await this.history(workspaceId, { limit: opts.limit }) }
  }

  private async history(workspaceId: string, opts: { id?: string; limit?: number }) {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200)
    const imports = await this.db
      .select({
        id: clickupImportJobs.id,
        source: clickupImportJobs.source,
        sourcePreset: clickupImportJobs.sourcePreset,
        status: clickupImportJobs.status,
        phase: clickupImportJobs.phase,
        total: clickupImportJobs.total,
        processed: clickupImportJobs.processed,
        createdCount: clickupImportJobs.createdCount,
        itemsImported: clickupImportJobs.itemsImportedCount,
        fileName: clickupImportJobs.fileName,
        error: clickupImportJobs.error,
        supportReference: clickupImportJobs.supportReference,
        deletableUntil: clickupImportJobs.deletableUntil,
        startedAt: clickupImportJobs.startedAt,
        finishedAt: clickupImportJobs.finishedAt,
        createdAt: clickupImportJobs.createdAt,
        engine: sql<boolean>`${clickupImportJobs.phase} is not null`,
        byId: users.id,
        byName: users.displayName,
        byAvatar: users.avatarUrl,
      })
      .from(clickupImportJobs)
      .leftJoin(users, eq(users.id, clickupImportJobs.createdById))
      .where(
        and(
          eq(clickupImportJobs.workspaceId, workspaceId),
          ne(clickupImportJobs.status, 'draft'),
          opts.id ? eq(clickupImportJobs.id, opts.id) : undefined,
        ),
      )
      .orderBy(desc(clickupImportJobs.createdAt))
      .limit(limit)
    const rows = imports.map((j) => ({
      kind: 'import' as const,
      id: j.id,
      source: j.source,
      /** The app whose export this was (`asana`, `jira`, …), or `generic`. */
      sourcePreset: j.sourcePreset,
      status: j.status,
      statusLabel: IMPORT_STATUS_LABELS[j.status] ?? j.status,
      phase: j.phase,
      total: j.total,
      processed: j.processed,
      itemsImported: j.engine ? j.itemsImported : j.createdCount,
      fileName: j.fileName,
      error: j.error,
      supportReference: j.supportReference ?? j.id.slice(0, 8).toUpperCase(),
      deletable: Boolean(j.engine && j.deletableUntil && j.deletableUntil.getTime() > Date.now() && ['completed', 'failed', 'cancelled'].includes(j.status)),
      deletableUntil: j.deletableUntil,
      cancellable: Boolean(j.engine && ['pending', 'processing'].includes(j.status)),
      startedAt: j.startedAt ?? j.createdAt,
      finishedAt: j.finishedAt,
      createdAt: j.createdAt,
      by: j.byId ? { id: j.byId, name: j.byName, avatarUrl: j.byAvatar } : null,
    }))
    if (opts.id) return rows
    const exports = await this.db
      .select({
        id: exportJobs.id,
        type: exportJobs.type,
        status: exportJobs.status,
        rowCount: exportJobs.rowCount,
        fileName: exportJobs.fileName,
        error: exportJobs.error,
        supportReference: exportJobs.supportReference,
        downloadExpiresAt: exportJobs.downloadExpiresAt,
        finishedAt: exportJobs.finishedAt,
        createdAt: exportJobs.createdAt,
        byId: users.id,
        byName: users.displayName,
        byAvatar: users.avatarUrl,
      })
      .from(exportJobs)
      .leftJoin(users, eq(users.id, exportJobs.createdById))
      .where(eq(exportJobs.workspaceId, workspaceId))
      .orderBy(desc(exportJobs.createdAt))
      .limit(limit)
    const all = [
      ...rows,
      ...exports.map((e) => ({
        kind: 'export' as const,
        id: e.id,
        source: 'export',
        status: e.status,
        statusLabel: e.status === 'completed' ? 'Completed' : e.status === 'failed' ? 'Export Failed' : 'Export Pending',
        phase: null,
        total: e.rowCount ?? 0,
        processed: e.rowCount ?? 0,
        itemsImported: e.rowCount ?? 0,
        fileName: e.fileName,
        error: e.error,
        supportReference: e.supportReference ?? e.id.slice(0, 8).toUpperCase(),
        deletable: false,
        deletableUntil: null,
        cancellable: false,
        downloadable: e.status === 'completed' && Boolean(e.downloadExpiresAt && e.downloadExpiresAt.getTime() > Date.now()),
        startedAt: e.createdAt,
        finishedAt: e.finishedAt,
        createdAt: e.createdAt,
        by: e.byId ? { id: e.byId, name: e.byName, avatarUrl: e.byAvatar } : null,
      })),
    ]
    return all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit)
  }

  /** View details: header, summary, Items, Users, Errors and Settings. */
  async report(workspaceId: string, jobId: string, actor: Actor, opts: { q?: string } = {}) {
    await assertMayImport(this.db, { workspaceId, actorId: actor.id })
    const [summary] = await this.history(workspaceId, { id: jobId })
    if (!summary) throw new NotFoundException('Import not found')
    const job = await this.job(workspaceId, jobId)
    const q = opts.q?.trim()
    const items = await this.db
      .select({
        entityType: importJobItems.entityType,
        entityId: importJobItems.entityId,
        sourceRef: importJobItems.sourceRef,
        action: importJobItems.action,
        message: importJobItems.message,
      })
      .from(importJobItems)
      .where(and(eq(importJobItems.jobId, jobId), q ? ilike(importJobItems.message, `%${q.replace(/[%_\\]/g, '\\$&')}%`) : undefined))
      .orderBy(asc(importJobItems.createdAt))
      .limit(500)
    const errors = await this.db
      .select({ rowRef: importErrors.rowRef, field: importErrors.field, message: importErrors.message, severity: importErrors.severity })
      .from(importErrors)
      .where(eq(importErrors.jobId, jobId))
      .orderBy(asc(importErrors.createdAt))
      .limit(500)
    const [errorTotal] = await this.db.select({ n: sql<number>`count(*)::int` }).from(importErrors).where(eq(importErrors.jobId, jobId))
    return {
      ...summary,
      report: job.result,
      // The pre-engine importers stored their refusals here.
      legacyRowErrors: job.phase ? null : job.rowErrors,
      settings: { options: job.options, mapping: (job.mapping as { columns?: unknown } | null)?.columns ?? null, fileName: job.fileName },
      items: items.map((i) => ({ ...i, url: this.itemUrl(workspaceId, i.entityType, i.entityId) })),
      errors,
      errorCount: errorTotal?.n ?? 0,
    }
  }

  private itemUrl(workspaceId: string, type: string, id: string | null): string | null {
    if (!id) return null
    if (type === 'task' || type === 'subtask') return `/app/${workspaceId}/tasks/${id}`
    return null
  }

  /** `errors.csv`: every refusal and every dropped cell, with what to do about it. */
  async errorsCsv(workspaceId: string, jobId: string, actor: Actor): Promise<string> {
    await assertMayImport(this.db, { workspaceId, actorId: actor.id })
    await this.job(workspaceId, jobId)
    const rows = await this.db
      .select({ rowRef: importErrors.rowRef, field: importErrors.field, message: importErrors.message, severity: importErrors.severity })
      .from(importErrors)
      .where(eq(importErrors.jobId, jobId))
      .orderBy(asc(importErrors.createdAt))
    const fix = (severity: string) =>
      severity === 'error' ? 'Correct the row and import it again.' : 'Correct the cell in Rundesk, or in the file before importing again.'
    return toCsv(
      ['Row', 'Field', 'Message', 'Severity', 'Suggested fix'],
      rows.map((r) => [r.rowRef ?? '', r.field ?? '', r.message, r.severity === 'error' ? 'Row not imported' : 'Warning', fix(r.severity)]),
    )
  }

  /** "Download file": the rows as they were imported (after the person's edits in the grid). */
  async sourceFile(workspaceId: string, jobId: string, actor: Actor): Promise<{ name: string; csv: string }> {
    await assertMayImport(this.db, { workspaceId, actorId: actor.id })
    const job = await this.job(workspaceId, jobId)
    const mapping = job.mapping as unknown as SpreadsheetImportMapping | null
    if (!mapping?.grid) throw new NotFoundException('This import has no file to download.')
    const chunks = await this.db
      .select({ rows: importStagedRows.rows })
      .from(importStagedRows)
      .where(eq(importStagedRows.jobId, jobId))
      .orderBy(asc(importStagedRows.chunkIndex))
    if (!chunks.length) throw new NotFoundException('Uploaded files are kept for 30 days; this one has been removed.')
    const rows = chunks.flatMap((c) => c.rows as StagedRow[])
    const csv = toCsv(
      mapping.grid.map((c) => c.label),
      rows.map((r) => mapping.grid.map((c) => r.values[c.key] ?? '')),
    )
    const base = (job.fileName ?? 'import').replace(/\.[^.]+$/, '')
    return { name: `${base}-imported.csv`, csv }
  }
}

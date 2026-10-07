/**
 * THE IMPORT ENGINE'S WORKER (§9.3).
 *
 * A run is a job row (`clickup_import_jobs`, `phase` set) that this service
 * CLAIMS — an atomic update that only one API process can win — and then
 * carries through its phases: validating → creating lists → creating fields,
 * statuses, types and tags → creating tasks (in batches) → finalising.
 *
 * RESUMABLE BY CONSTRUCTION. Every row a run creates is written in the same
 * transaction as its `import_job_items` row, and a run (re)starting reads those
 * items first: anything already made is used, not made again. So the recovery
 * sweep below can take over a run a restart cut off — its heartbeat stopped —
 * and finish it without duplicating a single task.
 *
 * NO TRANSACTION IS HELD FOR THE RUN. Each batch of up to 500 tasks commits on
 * its own (the spreadsheet importer measured why: a run-long transaction held
 * pooled connections until twelve concurrent imports stalled every route). A
 * batch that fails is retried row by row, so one bad row fails alone.
 *
 * Cancel is a request: the runner looks for it between batches and stops
 * there, never in the middle of a write. What it made stays, and is listed.
 */

import { Inject, Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { HttpException } from '@nestjs/common'
import { and, asc, eq, inArray, isNotNull, lt, or, sql } from 'drizzle-orm'
import {
  clickupImportJobs,
  customFieldDefinitions,
  customFieldValues,
  importErrors,
  importJobItems,
  importStagedRows,
  labels,
  listStatuses,
  lists,
  projectStatuses,
  projects,
  spaceStatuses,
  taskAssignees,
  taskChecklistItems,
  taskChecklists,
  taskLabelAssignments,
  taskTypes,
  tasks,
  timeEntries,
  users,
  workspaceMembers,
  workspaces,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import {
  spreadsheetBundle,
  type BundleTask,
  type CustomCellValue,
  type GridContext,
  type ImportableFieldType,
  type RundeskImportBundle,
} from '@rundesk/imports'
import { DB_TOKEN } from '../../common/database/database.module'
import { runWithTenantDb } from '../../common/database/tenant-db.context'
import { assertCanPlaceIn } from '../../common/permissions/container-access'
import { readableList, type ReadActor } from '../../common/permissions/read-access'
import { assertMayShapeStatuses, type StatusOwner } from '../../common/permissions/status-access'
import { resolveEffectiveStatuses } from '../../common/statuses/status-resolution'
import { CustomFieldsService } from '../custom-fields/custom-fields.service'
import { CustomRolesService } from '../custom-roles/custom-roles.service'
import { InvitationsService } from '../invitations/invitations.service'
import { DEFAULT_LIST_STATUSES } from '../lists/list-statuses.defaults'
import { NotificationsService } from '../notifications/notifications.service'
import { PlansService } from '../plans/plans.service'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { SearchService } from '../search/search.service'
import { SecurityService } from '../security/security.service'
import { TenantDatabasesService } from '../tenant-databases/tenant-databases.service'
import { importLimitsFor, STALE_RUN_MS } from './import-limits'
import { resolveDestination, type ResolvedDestination } from './import-destination'
import {
  batches,
  chooseStatus,
  defaultStatus,
  DEFAULT_LIST_SOURCE,
  matchAssignee,
  planLists,
  sourceLabel,
  statusKeyFor,
  uniqueName,
  type EffectiveStatus,
  type Member,
} from './import-plan'
import type { ImportReport, RunPhase, SpreadsheetImportMapping, SpreadsheetImportOptions, StagedRow } from './imports.types'

type Job = typeof clickupImportJobs.$inferSelect
type Tx = Pick<Db, 'select' | 'insert' | 'update' | 'delete'>
type Category = 'open' | 'in_progress' | 'closed'
type ItemRow = typeof importJobItems.$inferInsert

/** What a new status the import makes looks like (§2.6: neutral, at the end of the list). */
const NEUTRAL_STATUS_COLOUR = '#94a3b8'
const IMPORTED_TAG_COLOUR = '#8b5cf6'

class CancelledRun extends Error {}

/** What a run has made, by entity type and source reference, read from `import_job_items`. */
class Registry {
  private readonly made = new Map<string, string>()
  key = (type: string, ref: string) => `${type}\u0000${ref}`
  get(type: string, ref: string) {
    return this.made.get(this.key(type, ref))
  }
  set(type: string, ref: string, id: string) {
    this.made.set(this.key(type, ref), id)
  }
}

type FieldTarget = { id: string; type: ImportableFieldType; optionByLabel: Map<string, string> }

type RunContext = {
  job: Job
  actor: ReadActor & { id: string }
  workspaceId: string
  options: SpreadsheetImportOptions
  dest: ResolvedDestination
  bundle: RundeskImportBundle
  registry: Registry
  warnings: Array<{ ref: string; field?: string; message: string }>
  /** Lists by bundle list source id. */
  listIds: Map<string, string>
  projectId: string
  statusByList: Map<string, { byName: Map<string, { key: string; category: Category }>; fallback: { key: string; category: Category } }>
  typeByName: Map<string, { id: string; isMilestone: boolean }>
  defaultType: { id: string; isMilestone: boolean } | null
  tagByName: Map<string, string>
  fields: Map<string, FieldTarget>
  people: Map<string, string>
  users: ImportReport['users']
  seeList: Map<string, boolean>
  /** Rows the bundle refused: counted from the rows themselves, so a resumed run counts them the same. */
  skipped: number
}

@Injectable()
export class ImportRunnerService {
  private readonly logger = new Logger(ImportRunnerService.name)
  /** Runs this process is carrying, so the sweep never starts a second copy here. */
  private readonly running = new Set<string>()

  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly customFields: CustomFieldsService,
    private readonly search: SearchService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
    private readonly security: SecurityService,
    private readonly invitations: InvitationsService,
    private readonly roles: CustomRolesService,
    private readonly plans: PlansService,
    private readonly tenants: TenantDatabasesService,
  ) {}

  /** Start (or resume) a run without waiting for it. The request's database context is carried along. */
  kick(jobId: string) {
    void this.run(jobId).catch((e) => this.logger.warn(`import ${jobId}: ${(e as Error)?.message ?? e}`))
  }

  /** Awaitable, so tests and the sweep can run a job to its end. */
  async run(jobId: string): Promise<void> {
    if (this.running.has(jobId)) return
    this.running.add(jobId)
    try {
      const job = await this.claim(jobId)
      if (job) await this.execute(job)
    } finally {
      this.running.delete(jobId)
    }
  }

  /**
   * ONE PROCESS WINS A RUN. A queued run, or one whose heartbeat stopped
   * longer ago than `STALE_RUN_MS`, is taken in a single update; anybody else
   * asking at the same moment updates nothing and walks away.
   */
  private async claim(jobId: string): Promise<Job | null> {
    const stale = new Date(Date.now() - STALE_RUN_MS)
    const [job] = await this.db
      .update(clickupImportJobs)
      .set({
        status: 'processing',
        heartbeatAt: new Date(),
        startedAt: sql`coalesce(${clickupImportJobs.startedAt}, now())`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(clickupImportJobs.id, jobId),
          isNotNull(clickupImportJobs.phase),
          or(
            eq(clickupImportJobs.status, 'pending'),
            and(
              eq(clickupImportJobs.status, 'processing'),
              or(sql`${clickupImportJobs.heartbeatAt} is null`, lt(clickupImportJobs.heartbeatAt, stale)),
            ),
          ),
        ),
      )
      .returning()
    return job ?? null
  }

  // ── the run ──────────────────────────────────────────────────────────────────

  private async execute(job: Job) {
    const startedAt = Date.now()
    let phase: RunPhase = 'validating'
    try {
      const ctx = await this.prepare(job)
      phase = 'creating_lists'
      await this.enterPhase(ctx, phase)
      await this.ensureLists(ctx)
      phase = 'creating_fields'
      await this.enterPhase(ctx, phase)
      await this.ensureStatuses(ctx)
      await this.ensureTaskTypes(ctx)
      await this.ensureTags(ctx)
      await this.ensureFields(ctx)
      await this.resolvePeople(ctx)
      phase = 'creating_tasks'
      await this.enterPhase(ctx, phase)
      await this.writeTasks(ctx)
      phase = 'finalising'
      await this.enterPhase(ctx, phase)
      await this.finish(ctx, startedAt)
    } catch (e) {
      if (e instanceof CancelledRun) await this.markCancelled(job)
      else await this.markFailed(job, phase, e)
    }
  }

  /** Validating: who, where, and what — the bundle, rebuilt from the staged rows exactly as the wizard sent them. */
  private async prepare(job: Job): Promise<RunContext> {
    await this.setPhase(job.id, 'validating')
    const options = job.options as unknown as SpreadsheetImportOptions
    const mapping = job.mapping as unknown as SpreadsheetImportMapping
    if (!job.createdById) throw new Error('The person who started this import no longer exists.')
    const [person] = await this.db.select({ role: users.role }).from(users).where(eq(users.id, job.createdById)).limit(1)
    const actor = { id: job.createdById, role: person?.role ?? null }
    // Asked again: access can end between Start and a resumed run.
    const dest = await resolveDestination(this.db, job.workspaceId, options.destination, actor)

    const chunks = await this.db
      .select({ rows: importStagedRows.rows })
      .from(importStagedRows)
      .where(eq(importStagedRows.jobId, job.id))
      .orderBy(asc(importStagedRows.chunkIndex))
    const rows = chunks.flatMap((c) => c.rows as StagedRow[])
    const gridCtx: GridContext = { dateFormat: options.dateFormat, delimiter: options.delimiter, valueMaps: options.valueMaps }
    const { bundle, report } = spreadsheetBundle(rows, mapping.grid, gridCtx)

    const cursor = (job.cursor ?? {}) as { validated?: boolean }
    if (!cursor.validated) {
      const errorRows = [
        ...report.skipped.map((s) => ({ jobId: job.id, rowRef: s.ref, field: null, message: s.reasons.join(' '), severity: 'error' as const })),
        ...report.warnings.map((w) => ({
          jobId: job.id,
          rowRef: w.ref,
          field: w.column ? (mapping.grid.find((c) => c.key === w.column)?.label ?? w.column) : null,
          message: w.message,
          severity: 'warning' as const,
        })),
      ]
      for (const chunk of batches(errorRows, 500)) await this.db.insert(importErrors).values(chunk)
      await this.db
        .update(clickupImportJobs)
        .set({
          cursor: { validated: true },
          total: bundle.tasks.length + report.skipped.length,
          processed: report.skipped.length,
          rejectedCount: report.skipped.length,
          rowErrors: report.skipped.slice(0, 200).map((s) => ({ row: Number(/\d+/.exec(s.ref)?.[0] ?? 0), code: 'invalid', message: s.reasons.join(' ') })),
          heartbeatAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(clickupImportJobs.id, job.id))
    }

    const registry = new Registry()
    const made = await this.db
      .select({ entityType: importJobItems.entityType, entityId: importJobItems.entityId, sourceRef: importJobItems.sourceRef })
      .from(importJobItems)
      .where(and(eq(importJobItems.jobId, job.id), eq(importJobItems.action, 'created')))
    for (const m of made) if (m.entityId && m.sourceRef) registry.set(m.entityType, m.sourceRef, m.entityId)

    return {
      job,
      actor,
      workspaceId: job.workspaceId,
      options,
      dest,
      bundle,
      registry,
      warnings: [],
      listIds: new Map(),
      projectId: dest.projectId ?? '',
      statusByList: new Map(),
      typeByName: new Map(),
      defaultType: null,
      tagByName: new Map(),
      fields: new Map(),
      people: new Map(),
      users: [],
      seeList: new Map(),
      skipped: report.skipped.length,
    }
  }

  // ── lists ────────────────────────────────────────────────────────────────────

  private async ensureLists(ctx: RunContext) {
    const { dest } = ctx
    ctx.projectId = dest.projectId ?? (dest.type === 'space' ? await this.defaultContainer(dest.spaceId, ctx.actor.id) : await this.folderProject(ctx))

    const plan = planLists(ctx.bundle, dest.type === 'list')
    const live = await this.db
      .select({ id: lists.id, name: lists.name, position: lists.position })
      .from(lists)
      .where(and(eq(lists.projectId, ctx.projectId), eq(lists.isArchived, false)))
    let position = live.reduce((m, l) => Math.max(m, l.position), -1) + 1
    const scope = await this.newListScope(dest)
    let mayCreateHere: boolean | null = null

    for (const p of plan) {
      if (p.isDestination) {
        ctx.listIds.set(p.sourceId, dest.listId!)
        continue
      }
      const known = ctx.registry.get('list', p.sourceId)
      if (known) {
        ctx.listIds.set(p.sourceId, known)
        continue
      }
      if (!p.alwaysNew) {
        const hit = live.find((l) => l.name.trim().toLowerCase() === p.name.toLowerCase())
        if (hit) {
          ctx.listIds.set(p.sourceId, hit.id)
          continue
        }
      }
      // Into an existing Project (the destination List's own), a new List is
      // what `POST /lists` would make there, so its rule is asked once.
      if (dest.type === 'list') {
        mayCreateHere ??= await assertCanPlaceIn(this.db, { spaceId: dest.spaceId, projectId: ctx.projectId, actorId: ctx.actor.id, kind: 'list' }).then(
          () => true,
          (e) => {
            if (e instanceof HttpException) return false
            throw e
          },
        )
        if (!mayCreateHere) {
          ctx.listIds.set(p.sourceId, dest.listId!)
          ctx.warnings.push({ ref: `List "${p.name}"`, message: `You cannot create Lists here, so its rows were imported into "${dest.name}".` })
          continue
        }
      }
      const name = p.alwaysNew ? uniqueName(p.name, live.map((l) => l.name)) : p.name
      const at = position++
      const listId = await this.db.transaction(async (tx) => {
        const [list] = await tx
          .insert(lists)
          .values({ projectId: ctx.projectId, spaceId: dest.spaceId, name, position: at, createdById: ctx.actor.id, statusScope: scope, importId: ctx.job.id })
          .returning({ id: lists.id })
        if (scope === 'list') {
          await tx.insert(listStatuses).values(DEFAULT_LIST_STATUSES.map((s) => ({ listId: list.id, ...s }))).onConflictDoNothing()
        }
        await tx.insert(importJobItems).values(this.item(ctx, 'list', list.id, p.sourceId, name))
        return list.id
      })
      live.push({ id: listId, name, position: at })
      ctx.listIds.set(p.sourceId, listId)
      ctx.registry.set('list', p.sourceId, listId)
    }
  }

  /** The space's hidden list container, as `ListsService.defaultContainerForSpace` resolves it. Never tagged: it is the space's, not the import's. */
  private async defaultContainer(spaceId: string, actorId: string): Promise<string> {
    const find = () =>
      this.db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.spaceId, spaceId), eq(projects.isDefaultContainer, true)))
        .limit(1)
    const [existing] = await find()
    if (existing) return existing.id
    const [made] = await this.db
      .insert(projects)
      .values({ spaceId, name: 'Lists', isDefaultContainer: true, createdById: actorId })
      .onConflictDoNothing()
      .returning({ id: projects.id })
    if (made) return made.id
    const [won] = await find()
    if (!won) throw new Error('Could not resolve the space’s list container')
    return won.id
  }

  /** A Folder destination: a new project, "Imported from Spreadsheet", in it. */
  private async folderProject(ctx: RunContext): Promise<string> {
    const known = ctx.registry.get('project', 'destination')
    if (known) return known
    await this.plans.assertCanCreateProjects(ctx.workspaceId, 1)
    const siblings = await this.db
      .select({ name: projects.name, position: projects.position })
      .from(projects)
      .where(and(eq(projects.folderId, ctx.dest.folderId!), eq(projects.isArchived, false)))
    const name = uniqueName('Imported from Spreadsheet', siblings.map((s) => s.name))
    return this.db.transaction(async (tx) => {
      const [project] = await tx
        .insert(projects)
        .values({
          spaceId: ctx.dest.spaceId,
          folderId: ctx.dest.folderId,
          name,
          position: siblings.reduce((m, s) => Math.max(m, s.position), -1) + 1,
          createdById: ctx.actor.id,
          importId: ctx.job.id,
        })
        .returning({ id: projects.id })
      await tx.insert(importJobItems).values(this.item(ctx, 'project', project.id, 'destination', name))
      ctx.registry.set('project', 'destination', project.id)
      return project.id
    })
  }

  /** As `ListsService.createList` decides it: a folder set to the space's statuses gives its new lists the space's set. */
  private async newListScope(dest: ResolvedDestination): Promise<'list' | 'space'> {
    if (dest.folderStatusScope !== 'space') return 'list'
    const [one] = await this.db.select({ id: spaceStatuses.id }).from(spaceStatuses).where(eq(spaceStatuses.spaceId, dest.spaceId)).limit(1)
    return one ? 'space' : 'list'
  }

  // ── statuses, task types, tags, custom fields, people ─────────────────────────

  private async ensureStatuses(ctx: RunContext) {
    const namesByList = new Map<string, Set<string>>()
    for (const t of ctx.bundle.tasks) {
      const listId = this.listOf(ctx, t)
      const set = namesByList.get(listId) ?? new Set<string>()
      if (t.statusName) set.add(t.statusName.trim())
      namesByList.set(listId, set)
    }
    const shapeAllowed = new Map<string, boolean>()
    for (const [listId, names] of namesByList) {
      const scope = await this.scopeOf(listId)
      let effective = (await resolveEffectiveStatuses(this.db, listId)) as EffectiveStatus[]
      const byName = new Map<string, { key: string; category: Category }>()
      for (const name of names) {
        const choice = chooseStatus(name, effective)
        if (choice.kind === 'existing') {
          byName.set(name.toLowerCase(), { key: choice.key, category: choice.category })
          continue
        }
        const ownerKey = `${scope.owner}:${scope.ownerId}`
        if (!shapeAllowed.has(ownerKey)) {
          shapeAllowed.set(
            ownerKey,
            await assertMayShapeStatuses(this.db, { owner: scope.owner, ownerId: scope.ownerId, actorId: ctx.actor.id }).then(
              () => true,
              (e) => {
                if (e instanceof HttpException) return false
                throw e
              },
            ),
          )
        }
        if (!shapeAllowed.get(ownerKey)) {
          ctx.warnings.push({
            ref: `Status "${choice.name}"`,
            field: 'Status',
            message: 'You cannot add statuses here, so its rows were given the default status.',
          })
          continue
        }
        const key = await this.createStatus(ctx, scope, choice.name, choice.category, effective)
        effective = [...effective, { key, name: choice.name, category: choice.category, position: effective.length }]
        byName.set(name.toLowerCase(), { key, category: choice.category })
      }
      ctx.statusByList.set(listId, { byName, fallback: defaultStatus(effective) })
    }
  }

  private async scopeOf(listId: string): Promise<{ owner: StatusOwner; ownerId: string }> {
    const [row] = await this.db
      .select({ scope: lists.statusScope, projectId: lists.projectId, spaceId: projects.spaceId })
      .from(lists)
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .where(eq(lists.id, listId))
      .limit(1)
    if (row?.scope === 'project') return { owner: 'project', ownerId: row.projectId }
    if (row?.scope === 'space') return { owner: 'space', ownerId: row.spaceId }
    return { owner: 'list', ownerId: listId }
  }

  /** A new status at the END of its owner's set, in a neutral colour (§2.6). */
  private async createStatus(
    ctx: RunContext,
    scope: { owner: StatusOwner; ownerId: string },
    name: string,
    category: Category,
    effective: EffectiveStatus[],
  ): Promise<string> {
    const ref = `${scope.owner}:${scope.ownerId}:${name.toLowerCase()}`
    const known = ctx.registry.get('status', ref)
    const key = statusKeyFor(name, effective.map((s) => s.key))
    if (known) return key
    const position = effective.reduce((m, s) => Math.max(m, s.position), -1) + 1
    const values = { key, name, color: NEUTRAL_STATUS_COLOUR, category, position, importId: ctx.job.id }
    await this.db.transaction(async (tx) => {
      const [row] =
        scope.owner === 'list'
          ? await tx.insert(listStatuses).values({ listId: scope.ownerId, ...values }).returning({ id: listStatuses.id })
          : scope.owner === 'project'
            ? await tx.insert(projectStatuses).values({ projectId: scope.ownerId, ...values }).returning({ id: projectStatuses.id })
            : await tx.insert(spaceStatuses).values({ spaceId: scope.ownerId, ...values }).returning({ id: spaceStatuses.id })
      await tx.insert(importJobItems).values(this.item(ctx, 'status', row.id, ref, name))
      ctx.registry.set('status', ref, row.id)
    })
    return key
  }

  /** Task types are the workspace's vocabulary: an admin's (or a manager's) to add to, as `TaskTypesService` has it. */
  private async ensureTaskTypes(ctx: RunContext) {
    const rows = await this.db
      .select({ id: taskTypes.id, name: taskTypes.name, isDefault: taskTypes.isDefault, isMilestone: taskTypes.isMilestone, position: taskTypes.position })
      .from(taskTypes)
      .where(eq(taskTypes.workspaceId, ctx.workspaceId))
    for (const r of rows) ctx.typeByName.set(r.name.trim().toLowerCase(), { id: r.id, isMilestone: r.isMilestone })
    const d = rows.find((r) => r.isDefault)
    ctx.defaultType = d ? { id: d.id, isMilestone: d.isMilestone } : null

    const wanted = [...new Set(ctx.bundle.tasks.map((t) => t.taskTypeName?.trim()).filter((n): n is string => Boolean(n)))]
    const missing = wanted.filter((n) => !ctx.typeByName.has(n.toLowerCase()))
    if (!missing.length) return
    const [member] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, ctx.workspaceId), eq(workspaceMembers.userId, ctx.actor.id)))
      .limit(1)
    const mayAdd = ctx.actor.role === 'super_admin' || member?.role === 'workspace_admin' || member?.role === 'manager'
    let position = rows.reduce((m, r) => Math.max(m, r.position), -1) + 1
    for (const name of missing) {
      if (!mayAdd) {
        ctx.warnings.push({ ref: `Task Type "${name}"`, field: 'Task Type', message: 'Only workspace admins can add task types, so its rows were given the default type.' })
        continue
      }
      const ref = name.toLowerCase()
      const known = ctx.registry.get('task_type', ref)
      if (known) {
        ctx.typeByName.set(ref, { id: known, isMilestone: false })
        continue
      }
      const at = position++
      await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(taskTypes)
          .values({ workspaceId: ctx.workspaceId, name: name.slice(0, 60), position: at, importId: ctx.job.id })
          .returning({ id: taskTypes.id })
        await tx.insert(importJobItems).values(this.item(ctx, 'task_type', row.id, ref, name))
        ctx.typeByName.set(ref, { id: row.id, isMilestone: false })
        ctx.registry.set('task_type', ref, row.id)
      })
    }
  }

  /** The workspace's tag of a name, whatever its case, or a new one — as `LabelsService.create` finds it. */
  private async ensureTags(ctx: RunContext) {
    const wanted = new Map<string, string>()
    for (const t of ctx.bundle.tasks) for (const tag of t.tags) wanted.set(tag.trim().slice(0, 60).toLowerCase(), tag.trim().slice(0, 60))
    if (!wanted.size) return
    const existing = await this.db
      .select({ id: labels.id, name: labels.name })
      .from(labels)
      .where(eq(labels.workspaceId, ctx.workspaceId))
    for (const l of existing) ctx.tagByName.set(l.name.toLowerCase(), l.id)
    for (const [ref, name] of wanted) {
      if (!ref || ctx.tagByName.has(ref)) continue
      await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(labels)
          .values({ workspaceId: ctx.workspaceId, name, color: IMPORTED_TAG_COLOUR, importId: ctx.job.id })
          .onConflictDoNothing()
          .returning({ id: labels.id })
        if (row) {
          await tx.insert(importJobItems).values(this.item(ctx, 'tag', row.id, ref, name))
          ctx.tagByName.set(ref, row.id)
          return
        }
        const [found] = await tx
          .select({ id: labels.id })
          .from(labels)
          .where(and(eq(labels.workspaceId, ctx.workspaceId), sql`lower(${labels.name}) = ${ref}`))
          .limit(1)
        if (found) ctx.tagByName.set(ref, found.id)
      })
    }
  }

  /**
   * Custom Fields live on a project in RUNDESK, so they are found and made on
   * the destination's project. A new field is made by `CustomFieldsService`
   * (its rules and its validation), then marked as the import's and hidden by
   * default in views (§2.5) — "Hidden imported fields" brings it back.
   */
  private async ensureFields(ctx: RunContext) {
    for (const f of ctx.bundle.customFields) {
      const options = [...new Set((f.options ?? []).map((o) => o.trim()).filter(Boolean))]
      let id = f.existingFieldId ?? ctx.registry.get('custom_field', f.sourceId)
      if (id) {
        const [def] = await this.db
          .select({ id: customFieldDefinitions.id, projectId: customFieldDefinitions.projectId, type: customFieldDefinitions.type, options: customFieldDefinitions.options })
          .from(customFieldDefinitions)
          .where(eq(customFieldDefinitions.id, id))
          .limit(1)
        if (!def || def.projectId !== ctx.projectId) {
          ctx.warnings.push({ ref: `Field "${f.name}"`, field: f.name, message: 'That Custom Field is not available in the destination, so the column was not imported.' })
          continue
        }
        const target = this.fieldTarget(def.id, def.type as ImportableFieldType, def.options)
        await this.addMissingOptions(def.id, def.options, options, target)
        ctx.fields.set(f.sourceId, target)
        continue
      }
      const optionList = f.type === 'dropdown' || f.type === 'labels' ? options.map((o) => ({ label: o, value: o })) : undefined
      try {
        const def = (await this.customFields.createDefinition(
          ctx.workspaceId,
          ctx.projectId,
          { name: f.name.slice(0, 100), type: f.type as never, options: optionList },
          ctx.actor,
        )) as { id: string; options?: unknown; config?: unknown }
        id = def.id
        await this.db.transaction(async (tx) => {
          await tx
            .update(customFieldDefinitions)
            .set({ importId: ctx.job.id, config: { ...((def.config as Record<string, unknown>) ?? {}), importedHidden: true } })
            .where(eq(customFieldDefinitions.id, def.id))
          await tx.insert(importJobItems).values(this.item(ctx, 'custom_field', def.id, f.sourceId, f.name))
        })
        ctx.registry.set('custom_field', f.sourceId, def.id)
        ctx.fields.set(f.sourceId, this.fieldTarget(def.id, f.type, optionList ?? []))
      } catch (e) {
        if (!(e instanceof HttpException)) throw e
        ctx.warnings.push({ ref: `Field "${f.name}"`, field: f.name, message: `The Custom Field could not be created: ${e.message}` })
      }
    }
  }

  private fieldTarget(id: string, type: ImportableFieldType, options: unknown): FieldTarget {
    const optionByLabel = new Map<string, string>()
    for (const o of (Array.isArray(options) ? options : []) as Array<{ label?: string; value?: string }>) {
      if (o?.label && o.value !== undefined) optionByLabel.set(o.label.trim().toLowerCase(), o.value)
    }
    return { id, type, optionByLabel }
  }

  /** "Dropdown (create options on the fly)": an existing field gains the labels the file uses that it lacks. */
  private async addMissingOptions(fieldId: string, current: unknown, wanted: string[], target: FieldTarget) {
    if (target.type !== 'dropdown' && target.type !== 'labels') return
    const add = wanted.filter((w) => !target.optionByLabel.has(w.toLowerCase()))
    if (!add.length) return
    const next = [...((Array.isArray(current) ? current : []) as Array<{ label: string; value: string }>), ...add.map((a) => ({ label: a, value: a }))]
    await this.db.update(customFieldDefinitions).set({ options: next, updatedAt: new Date() }).where(eq(customFieldDefinitions.id, fieldId))
    for (const a of add) target.optionByLabel.set(a.toLowerCase(), a)
  }

  /**
   * Assignee cells → members (§2.3). Unmatched names are reported; an
   * unmatched EMAIL the person chose to invite is invited (when they may
   * invite) — they can be assigned once they have joined.
   */
  private async resolvePeople(ctx: RunContext) {
    const values = [...new Set(ctx.bundle.tasks.flatMap((t) => t.assignees.map((a) => a.trim())).filter(Boolean))]
    if (!values.length) return
    const members: Member[] = await this.db
      .select({ userId: users.id, email: users.email, displayName: users.displayName })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, ctx.workspaceId))
    const invite = new Set((ctx.options.invite ?? []).map((e) => e.toLowerCase()))
    let mayInvite: boolean | null = null
    for (const value of values) {
      const hit = matchAssignee(value, members)
      if ('userId' in hit) {
        ctx.people.set(value.toLowerCase(), hit.userId)
        const m = members.find((x) => x.userId === hit.userId)
        ctx.users.push({ value, outcome: 'matched', userId: hit.userId, name: m?.displayName ?? undefined })
        continue
      }
      if (value.includes('@') && invite.has(value.toLowerCase())) {
        mayInvite ??= await this.roles.hasPermission(ctx.workspaceId, ctx.actor.id, 'members.invite')
        const note = mayInvite ? await this.invite(ctx, value) : 'You cannot invite people to this workspace.'
        ctx.users.push({ value, outcome: note ? 'skipped' : 'invited', note: note ?? 'Invited. Assign them once they have joined.' })
        continue
      }
      ctx.users.push({
        value,
        outcome: 'skipped',
        note: hit.ambiguous ? 'More than one member has this name.' : 'No member of this workspace matches.',
      })
    }
  }

  /** null when the invitation went out, else why it did not. */
  private async invite(ctx: RunContext, email: string): Promise<string | null> {
    if (ctx.registry.get('user', `invite:${email.toLowerCase()}`)) return null
    const [ws] = await this.db.select({ organizationId: workspaces.organizationId }).from(workspaces).where(eq(workspaces.id, ctx.workspaceId)).limit(1)
    if (!ws?.organizationId) return 'This workspace has no organization to invite into.'
    try {
      await this.invitations.create(ws.organizationId, ctx.actor.id, {
        email,
        orgRole: 'member',
        workspaceMemberships: [{ workspaceId: ctx.workspaceId, role: 'member' }],
      })
      await this.db.insert(importJobItems).values(this.item(ctx, 'user', null, `invite:${email.toLowerCase()}`, `Invited ${email}`))
      ctx.registry.set('user', `invite:${email.toLowerCase()}`, 'invited')
      return null
    } catch (e) {
      if (e instanceof HttpException) return e.message
      throw e
    }
  }

  // ── tasks ────────────────────────────────────────────────────────────────────

  private listOf(ctx: RunContext, t: BundleTask): string {
    return ctx.listIds.get(t.listSourceId ?? DEFAULT_LIST_SOURCE) ?? ctx.listIds.get(DEFAULT_LIST_SOURCE) ?? [...ctx.listIds.values()][0]
  }

  private async writeTasks(ctx: RunContext) {
    const limits = importLimitsFor((await this.plans.getWorkspacePlan(ctx.workspaceId)).id)
    const todo = ctx.bundle.tasks.filter((t) => !ctx.registry.get('task', t.sourceId))
    let done = ctx.bundle.tasks.length - todo.length
    const skipped = ctx.skipped
    const total = ctx.bundle.tasks.length + skipped
    // New tasks go after what a List already holds, in the file's order.
    const positions = new Map<string, number>()
    for (const listId of new Set(ctx.listIds.values())) {
      const [row] = await this.db
        .select({ max: sql<number | null>`max(${tasks.position})` })
        .from(tasks)
        .where(eq(tasks.listId, listId))
      positions.set(listId, (row?.max ?? -1) + 1)
    }
    /** Commit, then remember: an id is only the run's once the transaction that made it has committed. */
    const commit = async (write: (tx: Tx, made: Map<string, string>) => Promise<void>) => {
      const made = new Map<string, string>()
      await this.db.transaction((tx) => write(tx, made))
      for (const [sourceId, id] of made) ctx.registry.set('task', sourceId, id)
    }

    for (const batch of batches(todo, limits.batchSize)) {
      await this.assertNotCancelled(ctx.job.id)
      const before = new Map(positions)
      try {
        await commit(async (tx, made) => {
          for (const t of batch) await this.writeTask(tx, ctx, t, positions, made)
        })
      } catch {
        // One bad row fails alone: the batch is retried row by row.
        for (const [k, v] of before) positions.set(k, v)
        for (const t of batch) {
          if (ctx.registry.get('task', t.sourceId)) continue
          try {
            await commit((tx, made) => this.writeTask(tx, ctx, t, positions, made))
          } catch (e) {
            const message = (e as Error)?.message ?? 'unknown error'
            await this.db.insert(importJobItems).values(this.item(ctx, 'task', null, t.sourceId, `${t.sourceRef}: ${message}`, 'failed'))
            await this.db.insert(importErrors).values({ jobId: ctx.job.id, rowRef: t.sourceRef ?? null, field: null, message, severity: 'error' })
          }
        }
      }
      done += batch.length
      await this.progress(ctx, 'creating_tasks', skipped + done, total)
    }
  }

  /**
   * One task and everything on it, in the caller's transaction: its row, its
   * people and tags, its field values, its checklist, its time and its
   * name-only subtasks — each tagged with the import, each listed as an item.
   */
  private async writeTask(tx: Tx, ctx: RunContext, t: BundleTask, positions: Map<string, number>, made: Map<string, string>) {
    const listId = this.listOf(ctx, t)
    // A parent written earlier in this same batch is in `made`, not yet in the registry.
    let parentId = t.parentSourceId ? (ctx.registry.get('task', t.parentSourceId) ?? made.get(t.parentSourceId)) : undefined
    if (t.parentSourceId && !parentId) {
      ctx.warnings.push({ ref: t.sourceRef ?? t.sourceId, message: 'Its parent row was not imported, so it was imported as a task.' })
      parentId = undefined
    }
    const statuses = ctx.statusByList.get(listId)
    const status = (t.statusName ? statuses?.byName.get(t.statusName.trim().toLowerCase()) : undefined) ?? statuses?.fallback ?? { key: 'todo', category: 'open' as Category }
    const type = (t.taskTypeName ? ctx.typeByName.get(t.taskTypeName.trim().toLowerCase()) : undefined) ?? ctx.defaultType
    const position = positions.get(listId) ?? 0
    positions.set(listId, position + 1 + t.subtaskNames.length)
    const now = new Date()

    const [task] = await tx
      .insert(tasks)
      .values({
        listId,
        parentTaskId: parentId ?? null,
        createdById: ctx.actor.id,
        title: t.name.slice(0, 500),
        description: t.description ?? null,
        status: status.key,
        statusCategory: status.category,
        priority: t.priority ?? 'normal',
        dueDate: t.dueDate !== undefined ? new Date(t.dueDate) : null,
        startDate: t.startDate !== undefined ? new Date(t.startDate) : null,
        timeEstimate: t.timeEstimateMs !== undefined ? Math.round(t.timeEstimateMs / 1000) : null,
        taskTypeId: type?.id ?? null,
        isMilestone: type?.isMilestone ?? false,
        position,
        completedAt: status.category === 'closed' ? now : null,
        importId: ctx.job.id,
        ...(t.dateCreated !== undefined ? { createdAt: new Date(t.dateCreated) } : {}),
      })
      .returning({ id: tasks.id })
    const items: ItemRow[] = [this.item(ctx, parentId ? 'subtask' : 'task', task.id, t.sourceId, `${t.sourceRef}: ${t.name}`)]

    for (const value of t.assignees) {
      const userId = ctx.people.get(value.trim().toLowerCase())
      if (!userId) continue
      if (!(await this.canSeeList(ctx, listId, userId))) {
        ctx.warnings.push({ ref: t.sourceRef ?? t.sourceId, field: 'Task assignee', message: `${value} cannot see this List, so they were not assigned.` })
        continue
      }
      await tx.insert(taskAssignees).values({ taskId: task.id, userId }).onConflictDoNothing()
    }
    for (const tag of t.tags) {
      const labelId = ctx.tagByName.get(tag.trim().slice(0, 60).toLowerCase())
      if (labelId) await tx.insert(taskLabelAssignments).values({ taskId: task.id, labelId }).onConflictDoNothing()
    }
    for (const [sourceId, value] of Object.entries(t.fields)) {
      const field = ctx.fields.get(sourceId)
      const stored = field ? this.storedValue(field, value) : undefined
      if (field && stored !== undefined) {
        await tx.insert(customFieldValues).values({ taskId: task.id, fieldId: field.id, value: { v: stored } }).onConflictDoNothing()
      }
    }
    for (const [ci, checklist] of t.checklists.entries()) {
      const [made] = await tx
        .insert(taskChecklists)
        .values({ taskId: task.id, title: checklist.name.slice(0, 200), position: ci, importId: ctx.job.id })
        .returning({ id: taskChecklists.id })
      await tx.insert(taskChecklistItems).values(
        checklist.items.map((item, i) => ({
          checklistId: made.id,
          content: item.content.slice(0, 1000),
          isDone: item.done,
          position: i,
          completedAt: item.done ? now : null,
        })),
      )
      items.push(this.item(ctx, 'checklist', made.id, `${t.sourceId}#checklist${ci}`, checklist.name))
    }
    for (const [ei, entry] of t.timeEntries.entries()) {
      const seconds = Math.max(1, Math.round(entry.durationMs / 1000))
      const [made] = await tx
        .insert(timeEntries)
        .values({
          taskId: task.id,
          userId: ctx.actor.id,
          startedAt: new Date(now.getTime() - seconds * 1000),
          endedAt: now,
          durationSec: seconds,
          description: 'Imported time',
          importId: ctx.job.id,
        })
        .returning({ id: timeEntries.id })
      items.push(this.item(ctx, 'time_entry', made.id, `${t.sourceId}#time${ei}`, null))
    }
    // Name-only subtasks (§2.3 `Subtask Names`). Under a subtask they go to
    // its top-level task, as every deeper level does here.
    const nameParent = parentId ?? task.id
    for (const [si, name] of t.subtaskNames.entries()) {
      const fallback = statuses?.fallback ?? { key: 'todo', category: 'open' as Category }
      const [sub] = await tx
        .insert(tasks)
        .values({
          listId,
          parentTaskId: nameParent,
          createdById: ctx.actor.id,
          title: name.slice(0, 500),
          status: fallback.key,
          statusCategory: fallback.category,
          position: position + 1 + si,
          importId: ctx.job.id,
        })
        .returning({ id: tasks.id })
      items.push(this.item(ctx, 'subtask', sub.id, `${t.sourceId}#sub${si}`, name))
    }
    await tx.insert(importJobItems).values(items)
    made.set(t.sourceId, task.id)
  }

  /** The value as `custom_field_values` stores it: an option's value for a Dropdown, values for Labels. */
  private storedValue(field: FieldTarget, value: CustomCellValue): CustomCellValue | undefined {
    if (field.type === 'dropdown') return typeof value === 'string' ? field.optionByLabel.get(value.toLowerCase()) : undefined
    if (field.type === 'labels') {
      const picked = (Array.isArray(value) ? value : [String(value)]).map((v) => field.optionByLabel.get(v.toLowerCase())).filter((v): v is string => v !== undefined)
      return picked.length ? [...new Set(picked)] : undefined
    }
    return value
  }

  /** An assignee must be able to see the List (as `POST /tasks` asks), so nobody is assigned work they cannot open. */
  private async canSeeList(ctx: RunContext, listId: string, userId: string): Promise<boolean> {
    const key = `${listId}:${userId}`
    if (!ctx.seeList.has(key)) ctx.seeList.set(key, Boolean(await readableList(this.db, ctx.workspaceId, listId, { id: userId, role: null })))
    return ctx.seeList.get(key)!
  }

  // ── the end ──────────────────────────────────────────────────────────────────

  private async finish(ctx: RunContext, startedAt: number) {
    // A batch retried row by row says its warnings twice; the report says each once.
    const warnings = [...new Map(ctx.warnings.map((w) => [`${w.ref}\u0000${w.field ?? ''}\u0000${w.message}`, w])).values()]
    if (warnings.length) {
      for (const chunk of batches(warnings, 500)) {
        await this.db.insert(importErrors).values(
          chunk.map((w) => ({ jobId: ctx.job.id, rowRef: w.ref, field: w.field ?? null, message: w.message, severity: 'warning' as const })),
        )
      }
    }
    const counts = await this.countItems(ctx.job.id)
    await this.indexTasks(ctx)
    const [warn] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(importErrors)
      .where(and(eq(importErrors.jobId, ctx.job.id), eq(importErrors.severity, 'warning')))
    const report: ImportReport = {
      source: ctx.job.source,
      destination: { type: ctx.dest.type, id: ctx.dest.id, name: ctx.dest.name, path: ctx.dest.path },
      counts: {
        tasksCreated: counts.task ?? 0,
        subtasksCreated: counts.subtask ?? 0,
        tasksSkipped: ctx.skipped,
        tasksFailed: counts.failed ?? 0,
        listsCreated: counts.list ?? 0,
        projectsCreated: counts.project ?? 0,
        fieldsCreated: counts.custom_field ?? 0,
        tagsCreated: counts.tag ?? 0,
        statusesCreated: counts.status ?? 0,
        taskTypesCreated: counts.task_type ?? 0,
        checklistsCreated: counts.checklist ?? 0,
        timeEntriesCreated: counts.time_entry ?? 0,
      },
      users: ctx.users,
      warningsCount: warn?.n ?? 0,
      durationMs: Date.now() - startedAt,
    }
    const imported = report.counts.tasksCreated + report.counts.subtasksCreated
    await this.db
      .update(clickupImportJobs)
      .set({
        status: 'completed',
        phase: 'done',
        processed: sql`${clickupImportJobs.total}`,
        createdCount: imported,
        skippedCount: report.counts.tasksSkipped,
        itemsImportedCount: imported,
        result: report as unknown as Record<string, unknown>,
        finishedAt: new Date(),
        heartbeatAt: null,
        updatedAt: new Date(),
      })
      .where(eq(clickupImportJobs.id, ctx.job.id))

    const url = `/app/${ctx.workspaceId}/settings?tab=imports-exports&importId=${ctx.job.id}`
    const noun = imported === 1 ? 'task' : 'tasks'
    void this.notifications
      .create({
        userId: ctx.actor.id,
        workspaceId: ctx.workspaceId,
        actorId: ctx.actor.id,
        type: 'import_completed',
        title: `Your ${sourceLabel(ctx.job.sourcePreset)} import has finished: ${imported.toLocaleString('en-GB')} ${noun} imported`,
        body: 'View details',
        target: { entityType: 'import', entityId: ctx.job.id, url },
      })
      .catch(() => undefined)
    this.realtime.emitToUser(ctx.actor.id, { type: 'import.completed', workspaceId: ctx.workspaceId, jobId: ctx.job.id })
    await this.security
      .logAuditEvent({
        workspaceId: ctx.workspaceId,
        actorId: ctx.actor.id,
        action: 'import.completed',
        resourceType: 'import',
        resourceId: ctx.job.id,
        description: `${sourceLabel(ctx.job.sourcePreset)} import finished: ${imported} ${noun} imported into ${ctx.dest.path}`,
        metadata: { tasks: imported, skipped: report.counts.tasksSkipped, failed: report.counts.tasksFailed },
      })
      .catch(() => undefined)
  }

  private async countItems(jobId: string): Promise<Record<string, number>> {
    const rows = await this.db
      .select({ type: importJobItems.entityType, action: importJobItems.action, n: sql<number>`count(*)::int` })
      .from(importJobItems)
      .where(eq(importJobItems.jobId, jobId))
      .groupBy(importJobItems.entityType, importJobItems.action)
    const out: Record<string, number> = {}
    for (const r of rows) {
      if (r.action === 'created') out[r.type] = (out[r.type] ?? 0) + r.n
      if (r.action === 'failed') out.failed = (out.failed ?? 0) + r.n
    }
    return out
  }

  /** Search learns of the new tasks (a no-op without Meilisearch; Postgres search reads the rows themselves). */
  private async indexTasks(ctx: RunContext) {
    const ids = await this.db
      .select({ id: importJobItems.entityId })
      .from(importJobItems)
      .where(and(eq(importJobItems.jobId, ctx.job.id), inArray(importJobItems.entityType, ['task', 'subtask']), eq(importJobItems.action, 'created')))
    for (const chunk of batches(ids.map((r) => r.id).filter((id): id is string => Boolean(id)), 200)) {
      const rows = await this.db
        .select({ id: tasks.id, title: tasks.title, description: tasks.description, listId: tasks.listId, createdAt: tasks.createdAt, updatedAt: tasks.updatedAt })
        .from(tasks)
        .where(inArray(tasks.id, chunk))
      await Promise.all(
        rows.map((r) => this.search.indexTask(r, ctx.workspaceId, ctx.dest.spaceId, ctx.projectId).catch(() => undefined)),
      )
    }
  }

  private async markCancelled(job: Job) {
    await this.db
      .update(clickupImportJobs)
      .set({ status: 'cancelled', finishedAt: new Date(), heartbeatAt: null, updatedAt: new Date() })
      .where(eq(clickupImportJobs.id, job.id))
    if (job.createdById) {
      this.realtime.emitToUser(job.createdById, {
        type: 'import.progress',
        workspaceId: job.workspaceId,
        jobId: job.id,
        status: 'cancelled',
        phase: null,
        processed: job.processed,
        total: job.total,
      })
    }
  }

  /** "Import Failed", with the phase it failed in. Partial items stay listed, so Delete can still clean up. */
  private async markFailed(job: Job, phase: RunPhase, e: unknown) {
    const message = (e as Error)?.message ?? 'Import failed'
    const error = `Failed while ${phase.replace(/_/g, ' ')}: ${message}`.split('\u0000').join('�')
    this.logger.warn(`import ${job.id} failed (${phase}): ${message}`)
    await this.db
      .update(clickupImportJobs)
      .set({ status: 'failed', error, finishedAt: new Date(), heartbeatAt: null, updatedAt: new Date() })
      .where(eq(clickupImportJobs.id, job.id))
      .catch(() => undefined)
    if (!job.createdById) return
    this.realtime.emitToUser(job.createdById, { type: 'import.failed', workspaceId: job.workspaceId, jobId: job.id, error })
    void this.notifications
      .create({
        userId: job.createdById,
        workspaceId: job.workspaceId,
        actorId: job.createdById,
        type: 'import_failed',
        title: `Your ${sourceLabel(job.sourcePreset)} import failed`,
        body: error,
        target: { entityType: 'import', entityId: job.id, url: `/app/${job.workspaceId}/settings?tab=imports-exports&importId=${job.id}` },
      })
      .catch(() => undefined)
  }

  // ── progress, heartbeat, cancel ──────────────────────────────────────────────

  private async setPhase(jobId: string, phase: RunPhase) {
    await this.db.update(clickupImportJobs).set({ phase, heartbeatAt: new Date(), updatedAt: new Date() }).where(eq(clickupImportJobs.id, jobId))
  }

  private async enterPhase(ctx: RunContext, phase: RunPhase) {
    await this.assertNotCancelled(ctx.job.id)
    await this.setPhase(ctx.job.id, phase)
    const [job] = await this.db
      .select({ processed: clickupImportJobs.processed, total: clickupImportJobs.total })
      .from(clickupImportJobs)
      .where(eq(clickupImportJobs.id, ctx.job.id))
      .limit(1)
    this.emitProgress(ctx, phase, job?.processed ?? 0, job?.total ?? 0)
  }

  private async progress(ctx: RunContext, phase: RunPhase, processed: number, total: number) {
    await this.db
      .update(clickupImportJobs)
      .set({ processed, total, heartbeatAt: new Date(), updatedAt: new Date() })
      .where(eq(clickupImportJobs.id, ctx.job.id))
    this.emitProgress(ctx, phase, processed, total)
  }

  private emitProgress(ctx: RunContext, phase: RunPhase, processed: number, total: number) {
    this.realtime.emitToUser(ctx.actor.id, {
      type: 'import.progress',
      workspaceId: ctx.workspaceId,
      jobId: ctx.job.id,
      status: 'processing',
      phase,
      processed,
      total,
    })
  }

  private async assertNotCancelled(jobId: string) {
    const [row] = await this.db
      .select({ cancel: clickupImportJobs.cancelRequestedAt })
      .from(clickupImportJobs)
      .where(eq(clickupImportJobs.id, jobId))
      .limit(1)
    if (row?.cancel) throw new CancelledRun()
  }

  private item(
    ctx: RunContext,
    entityType: string,
    entityId: string | null,
    sourceRef: string,
    message: string | null,
    action: 'created' | 'failed' = 'created',
  ): ItemRow {
    return { jobId: ctx.job.id, entityType, entityId, sourceRef, action, message }
  }

  // ── recovery ─────────────────────────────────────────────────────────────────

  /**
   * THE SWEEP: runs queued for more than half a minute that nobody claimed (the
   * process that queued them died first), and runs whose heartbeat stopped,
   * are claimed and carried on — on the shared database and on each
   * organisation's dedicated one, whose context a cron does not have.
   */
  @Cron(CronExpression.EVERY_MINUTE, { name: 'imports-recover-stalled-runs' })
  async recoverStalledRuns() {
    await this.sweep()
    const dedicated = await this.tenants.listAll().catch(() => [])
    for (const t of dedicated) {
      if (t.status !== 'active') continue
      const db = await this.tenants.getDbForOrganization(t.organizationId).catch(() => null)
      if (db) await runWithTenantDb(db, () => this.sweep()).catch(() => undefined)
    }
  }

  private async sweep() {
    const queuedBefore = new Date(Date.now() - 30_000)
    const staleBefore = new Date(Date.now() - STALE_RUN_MS)
    const due = await this.db
      .select({ id: clickupImportJobs.id })
      .from(clickupImportJobs)
      .where(
        and(
          isNotNull(clickupImportJobs.phase),
          or(
            and(eq(clickupImportJobs.status, 'pending'), lt(clickupImportJobs.updatedAt, queuedBefore)),
            and(eq(clickupImportJobs.status, 'processing'), or(sql`${clickupImportJobs.heartbeatAt} is null`, lt(clickupImportJobs.heartbeatAt, staleBefore))),
          ),
        ),
      )
      .limit(5)
    for (const j of due) await this.run(j.id).catch(() => undefined)
  }
}

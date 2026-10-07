/**
 * §5.1 — "Export: Get a CSV export of your Workspace data." The Export items
 * tab's job: the chosen Spaces, Folders, Projects and Lists, every task in
 * them the exporter may read, in ClickUp's own column format — so a RUNDESK
 * export opens in ClickUp's importer and the other way round.
 *
 * Built off the request (a large workspace takes time), stored, announced
 * (in-app, email, realtime) and handed out by a signed link that expires an
 * hour after it is made. Nothing the exporter cannot open goes into the file:
 * the read rules every task list asks (`taskInReachFilter`, the container and
 * private-list rule, and `taskVisibilityFilter`) are asked of the export too.
 */

import { BadRequestException, ForbiddenException, GoneException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { and, asc, eq, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm'
import {
  customFieldDefinitions,
  customFieldValues,
  exportJobs,
  folders,
  labels,
  lists,
  projects,
  spaces,
  taskAssignees,
  taskAttachments,
  taskChecklistItems,
  taskChecklists,
  taskComments,
  taskLabelAssignments,
  taskTypes,
  tasks,
  timeEntries,
  users,
  workspaceMembers,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { EXPORT_DATE_FORMATS, exportCsv, type ExportDateFormat } from '@rundesk/imports'
import { DB_TOKEN } from '../../common/database/database.module'
import { runWithTenantDb } from '../../common/database/tenant-db.context'
import { taskInReachFilter } from '../../common/permissions/container-access.guard-helper'
import { resolveIsManager, taskVisibilityFilter } from '../../common/permissions/item-visibility'
import { resolveEffectiveStatuses } from '../../common/statuses/status-resolution'
import { R2Service } from '../../common/storage/r2.service'
import { isUuid } from '../../common/validation/uuid'
import { NotificationsService } from '../notifications/notifications.service'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { SecurityService } from '../security/security.service'
import { TenantDatabasesService } from '../tenant-databases/tenant-databases.service'
import { supportReference } from '../imports/import-plan'
import { IMPORT_LIMITS } from '../imports/import-limits'
import { exportHeaders, exportRow, fieldCell, fieldHeaders, type ExportContext, type ExportTask } from './export-csv'
import { ExportStorage } from './export-storage'

type Location = { type: 'space' | 'folder' | 'project' | 'list'; id: string }
type Actor = { id: string; role?: string | null }

/** Finished files are kept a day; a link made from one lasts an hour. */
const FILE_RETENTION_MS = 24 * 60 * 60_000
const LINK_SECONDS = IMPORT_LIMITS.enterprise.exportLinkSeconds
const CHUNK = 1_000

@Injectable()
export class ExportJobsService {
  private readonly logger = new Logger(ExportJobsService.name)
  readonly storage: ExportStorage
  private readonly running = new Set<string>()

  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    r2: R2Service,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
    private readonly security: SecurityService,
    private readonly tenants: TenantDatabasesService,
  ) {
    this.storage = new ExportStorage(r2, process.env.EXPORT_LINK_SECRET || process.env.JWT_ACCESS_SECRET || 'rundesk-export-links')
  }

  private get appUrl() {
    return (process.env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, '')
  }

  /** The signed, expiring link (§5.1: an hour). Through the API's public base, so it works from an email. */
  link(exportId: string, expires = Date.now() + LINK_SECONDS * 1000): { url: string; expiresAt: Date } {
    const base = (process.env.API_PUBLIC_URL ?? this.appUrl).replace(/\/$/, '')
    const sig = this.storage.sign(exportId, expires)
    return { url: `${base}/api/v1/exports/${exportId}/download?expires=${expires}&sig=${sig}`, expiresAt: new Date(expires) }
  }

  // ── start ────────────────────────────────────────────────────────────────────

  async start(workspaceId: string, actor: Actor, body: { type?: string; locations?: Location[]; dateFormat?: string }) {
    // A guest never exports the workspace's task data, whatever a role grants (§8).
    const [member] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, actor.id)))
      .limit(1)
    if (member?.role === 'guest') throw new ForbiddenException('Guests cannot export workspace data')
    if ((body.type ?? 'workspace_csv') !== 'workspace_csv') throw new BadRequestException('This export type is not available yet.')
    const dateFormat = (body.dateFormat ?? 'normal') as ExportDateFormat
    if (!EXPORT_DATE_FORMATS.some((f) => f.value === dateFormat)) throw new BadRequestException('Choose a date format: Normal, ISO or POSIX.')
    const locations = (Array.isArray(body.locations) ? body.locations : []).filter(
      (l) => l && ['space', 'folder', 'project', 'list'].includes(l.type) && typeof l.id === 'string' && isUuid(l.id),
    )
    if (!locations.length) throw new BadRequestException('Select at least one location to export.')
    if (locations.length > 2_000) throw new BadRequestException('Select fewer locations.')
    const listIds = await this.listsIn(workspaceId, locations)
    if (!listIds.length) throw new BadRequestException('Those locations hold no Lists in this workspace.')

    const [job] = await this.db
      .insert(exportJobs)
      .values({
        workspaceId,
        type: 'workspace_csv',
        scope: { locations },
        options: { dateFormat },
        status: 'pending',
        supportReference: supportReference('EXP'),
        createdById: actor.id,
      })
      .returning()
    await this.security
      .logAuditEvent({
        workspaceId,
        actorId: actor.id,
        action: 'export.started',
        resourceType: 'export',
        resourceId: job.id,
        description: `Started a workspace CSV export of ${listIds.length} lists`,
        metadata: { lists: listIds.length, dateFormat },
      })
      .catch(() => undefined)
    void this.run(job.id).catch((e) => this.logger.warn(`export ${job.id}: ${(e as Error)?.message ?? e}`))
    return this.status(workspaceId, job.id)
  }

  /** "Preparing export…" → "Download Export". A fresh hour-long link each time, while the file is kept. */
  async status(workspaceId: string, exportId: string) {
    if (!isUuid(exportId)) throw new NotFoundException('Export not found')
    const [job] = await this.db
      .select()
      .from(exportJobs)
      .where(and(eq(exportJobs.id, exportId), eq(exportJobs.workspaceId, workspaceId)))
      .limit(1)
    if (!job) throw new NotFoundException('Export not found')
    const kept = job.status === 'completed' && job.storageKey && job.finishedAt && Date.now() - job.finishedAt.getTime() < FILE_RETENTION_MS
    return {
      id: job.id,
      status: job.status,
      rowCount: job.rowCount,
      fileName: job.fileName,
      error: job.error,
      supportReference: job.supportReference,
      createdAt: job.createdAt,
      finishedAt: job.finishedAt,
      download: kept ? this.link(job.id) : null,
      expired: job.status === 'completed' && !kept,
    }
  }

  /** The Lists inside the chosen locations (a Space's, a Folder's, a Project's, or the List itself), live ones only. */
  private async listsIn(workspaceId: string, locations: Location[]): Promise<string[]> {
    const ids = (t: Location['type']) => locations.filter((l) => l.type === t).map((l) => l.id)
    const conds = [
      ids('space').length ? inArray(spaces.id, ids('space')) : undefined,
      ids('folder').length ? inArray(projects.folderId, ids('folder')) : undefined,
      ids('project').length ? inArray(projects.id, ids('project')) : undefined,
      ids('list').length ? inArray(lists.id, ids('list')) : undefined,
    ].filter(Boolean)
    const rows = await this.db
      .select({ id: lists.id })
      .from(lists)
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(
        and(
          eq(spaces.workspaceId, workspaceId),
          eq(lists.isArchived, false),
          eq(projects.isArchived, false),
          eq(spaces.isArchived, false),
          or(...conds),
        ),
      )
    return [...new Set(rows.map((r) => r.id))]
  }

  // ── the run ──────────────────────────────────────────────────────────────────

  async run(exportId: string) {
    if (this.running.has(exportId)) return
    this.running.add(exportId)
    try {
      const [job] = await this.db
        .update(exportJobs)
        .set({ status: 'processing', updatedAt: new Date() })
        .where(
          and(
            eq(exportJobs.id, exportId),
            or(eq(exportJobs.status, 'pending'), and(eq(exportJobs.status, 'processing'), lt(exportJobs.updatedAt, new Date(Date.now() - 10 * 60_000)))),
          ),
        )
        .returning()
      if (!job) return
      try {
        await this.build(job)
      } catch (e) {
        const message = (e as Error)?.message ?? 'Export failed'
        await this.db
          .update(exportJobs)
          .set({ status: 'failed', error: message, finishedAt: new Date(), updatedAt: new Date() })
          .where(eq(exportJobs.id, exportId))
        if (job.createdById) this.realtime.emitToUser(job.createdById, { type: 'export.ready', workspaceId: job.workspaceId, exportId })
      }
    } finally {
      this.running.delete(exportId)
    }
  }

  private async build(job: typeof exportJobs.$inferSelect) {
    const workspaceId = job.workspaceId
    const actorId = job.createdById
    if (!actorId) throw new Error('The person who started this export no longer exists.')
    const [person] = await this.db.select({ role: users.role }).from(users).where(eq(users.id, actorId)).limit(1)
    const isManager = await resolveIsManager(this.db, workspaceId, actorId, person?.role ?? null)
    const locations = ((job.scope as { locations?: Location[] } | null)?.locations ?? []) as Location[]
    const listIds = await this.listsIn(workspaceId, locations)
    const dateFormat = ((job.options as { dateFormat?: ExportDateFormat } | null)?.dateFormat ?? 'normal') as ExportDateFormat

    // Lists, with their place and status names.
    const listRows = listIds.length
      ? await this.db
          .select({
            id: lists.id,
            name: lists.name,
            position: lists.position,
            projectId: projects.id,
            projectName: projects.name,
            projectPosition: projects.position,
            isDefault: projects.isDefaultContainer,
            folderName: folders.name,
            spaceName: spaces.name,
          })
          .from(lists)
          .innerJoin(projects, eq(projects.id, lists.projectId))
          .innerJoin(spaces, eq(spaces.id, projects.spaceId))
          .leftJoin(folders, eq(folders.id, projects.folderId))
          .where(inArray(lists.id, listIds))
          .orderBy(asc(spaces.name), asc(projects.position), asc(lists.position))
      : []
    const listInfo: ExportContext['lists'] = new Map()
    for (const l of listRows) {
      const statuses = await resolveEffectiveStatuses(this.db, l.id)
      listInfo.set(l.id, {
        name: l.name,
        folderPath: [l.folderName, l.isDefault ? null : l.projectName].filter(Boolean).join('/'),
        spaceName: l.spaceName,
        statusNames: new Map(statuses.map((s) => [s.key, s.name])),
      })
    }
    const listOrder = new Map(listRows.map((l, i) => [l.id, i]))

    // Every task the exporter may read, in list order, subtasks after their parent.
    const found: ExportTask[] = []
    for (let i = 0; i < listIds.length; i += 200) {
      const chunk = listIds.slice(i, i + 200)
      const rows = await this.db
        .select({
          id: tasks.id,
          title: tasks.title,
          description: tasks.description,
          status: tasks.status,
          priority: tasks.priority,
          parentTaskId: tasks.parentTaskId,
          listId: tasks.listId,
          taskTypeId: tasks.taskTypeId,
          createdAt: tasks.createdAt,
          dueDate: tasks.dueDate,
          startDate: tasks.startDate,
          timeEstimate: tasks.timeEstimate,
          position: tasks.position,
        })
        .from(tasks)
        .innerJoin(lists, eq(lists.id, tasks.listId))
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(
          and(
            inArray(tasks.listId, chunk),
            isNull(tasks.deletedAt),
            eq(tasks.isArchived, false),
            taskInReachFilter(this.db, workspaceId, actorId, isManager),
            taskVisibilityFilter(this.db, actorId, isManager),
          ),
        )
        .orderBy(asc(tasks.position))
      found.push(...(rows as Array<ExportTask & { position: number }>))
    }
    const byId = new Map(found.map((t) => [t.id, t]))
    const subtaskIds: ExportContext['subtaskIds'] = new Map()
    for (const t of found) {
      if (t.parentTaskId && byId.has(t.parentTaskId)) subtaskIds.set(t.parentTaskId, [...(subtaskIds.get(t.parentTaskId) ?? []), t.id])
    }
    const ordered: ExportTask[] = []
    const tops = found
      .filter((t) => !t.parentTaskId || !byId.has(t.parentTaskId))
      .sort((a, b) => (listOrder.get(a.listId) ?? 0) - (listOrder.get(b.listId) ?? 0))
    for (const t of tops) {
      ordered.push(t)
      for (const sid of subtaskIds.get(t.id) ?? []) ordered.push(byId.get(sid)!)
    }

    const ctx: ExportContext = {
      appUrl: this.appUrl,
      workspaceId,
      dateFormat,
      lists: listInfo,
      taskTypes: new Map(
        (await this.db.select({ id: taskTypes.id, name: taskTypes.name }).from(taskTypes).where(eq(taskTypes.workspaceId, workspaceId))).map((r) => [r.id, r.name]),
      ),
      subtaskIds,
      assignees: new Map(),
      tags: new Map(),
      attachments: new Map(),
      checklists: new Map(),
      comments: new Map(),
      timeSpent: new Map(),
      fieldColumns: [],
      fieldValues: new Map(),
    }
    const push = <T>(map: Map<string, T[]>, key: string, value: T) => map.set(key, [...(map.get(key) ?? []), value])
    // People fields are written by name: the workspace's members, read once.
    const names = new Map(
      (
        await this.db
          .select({ id: users.id, name: users.displayName })
          .from(workspaceMembers)
          .innerJoin(users, eq(users.id, workspaceMembers.userId))
          .where(eq(workspaceMembers.workspaceId, workspaceId))
      ).map((u) => [u.id, u.name]),
    )

    // Custom Fields of the projects in scope, one column each.
    const projectIds = [...new Set(listRows.map((l) => l.projectId))]
    const defs = projectIds.length
      ? await this.db
          .select({ id: customFieldDefinitions.id, name: customFieldDefinitions.name, type: customFieldDefinitions.type, options: customFieldDefinitions.options })
          .from(customFieldDefinitions)
          .where(inArray(customFieldDefinitions.projectId, projectIds))
          .orderBy(asc(customFieldDefinitions.position))
      : []
    ctx.fieldColumns = fieldHeaders(defs)
    const defById = new Map(defs.map((d) => [d.id, d]))

    for (let i = 0; i < ordered.length; i += CHUNK) {
      const ids = ordered.slice(i, i + CHUNK).map((t) => t.id)
      for (const r of await this.db
        .select({ taskId: taskAssignees.taskId, userId: users.id, name: users.displayName })
        .from(taskAssignees)
        .innerJoin(users, eq(users.id, taskAssignees.userId))
        .where(inArray(taskAssignees.taskId, ids))) {
        push(ctx.assignees, r.taskId, r.name)
        names.set(r.userId, r.name)
      }
      for (const r of await this.db
        .select({ taskId: taskLabelAssignments.taskId, name: labels.name })
        .from(taskLabelAssignments)
        .innerJoin(labels, eq(labels.id, taskLabelAssignments.labelId))
        .where(inArray(taskLabelAssignments.taskId, ids))) {
        push(ctx.tags, r.taskId, r.name)
      }
      for (const r of await this.db
        .select({ id: taskAttachments.id, taskId: taskAttachments.taskId, fileName: taskAttachments.fileName })
        .from(taskAttachments)
        .where(inArray(taskAttachments.taskId, ids))) {
        push(ctx.attachments, r.taskId, { title: r.fileName, url: `${this.appUrl}/app/${workspaceId}/tasks/${r.taskId}?attachment=${r.id}` })
      }
      const lists_ = await this.db
        .select({ id: taskChecklists.id, taskId: taskChecklists.taskId, title: taskChecklists.title })
        .from(taskChecklists)
        .where(inArray(taskChecklists.taskId, ids))
        .orderBy(asc(taskChecklists.position))
      const items = lists_.length
        ? await this.db
            .select({ checklistId: taskChecklistItems.checklistId, content: taskChecklistItems.content, done: taskChecklistItems.isDone })
            .from(taskChecklistItems)
            .where(inArray(taskChecklistItems.checklistId, lists_.map((l) => l.id)))
            .orderBy(asc(taskChecklistItems.position))
        : []
      for (const l of lists_) {
        push(ctx.checklists, l.taskId, { name: l.title, items: items.filter((it) => it.checklistId === l.id).map((it) => ({ content: it.content, done: it.done })) })
      }
      for (const r of await this.db
        .select({ taskId: taskComments.taskId, body: taskComments.body, createdAt: taskComments.createdAt, assigned: taskComments.assignedToUserId, author: users.displayName })
        .from(taskComments)
        .innerJoin(users, eq(users.id, taskComments.authorId))
        .where(inArray(taskComments.taskId, ids))
        .orderBy(asc(taskComments.createdAt))) {
        push(ctx.comments, r.taskId, { author: r.author, body: r.body, createdAt: r.createdAt, assigned: Boolean(r.assigned) })
      }
      for (const r of await this.db
        .select({ taskId: timeEntries.taskId, seconds: sql<number>`coalesce(sum(${timeEntries.durationSec}), 0)::int` })
        .from(timeEntries)
        .where(and(inArray(timeEntries.taskId, ids), isNotNull(timeEntries.durationSec)))
        .groupBy(timeEntries.taskId)) {
        ctx.timeSpent.set(r.taskId, r.seconds)
      }
      if (defs.length) {
        for (const r of await this.db
          .select({ taskId: customFieldValues.taskId, fieldId: customFieldValues.fieldId, value: customFieldValues.value })
          .from(customFieldValues)
          .where(inArray(customFieldValues.taskId, ids))) {
          const def = defById.get(r.fieldId)
          if (!def) continue
          const cell = fieldCell(def.type, r.value, (def.options as Array<{ label: string; value: string }> | null) ?? [], names)
          const m = ctx.fieldValues.get(r.taskId) ?? new Map<string, string>()
          m.set(r.fieldId, cell)
          ctx.fieldValues.set(r.taskId, m)
        }
      }
    }

    const csv = exportCsv(exportHeaders(ctx), ordered.map((t) => exportRow(t, ctx)))
    const body = Buffer.from(csv, 'utf8')
    const key = `exports/${workspaceId}/${job.id}.csv`
    await this.storage.put(key, body, 'text/csv; charset=utf-8')
    const day = new Date().toISOString().slice(0, 10)
    const link = this.link(job.id)
    await this.db
      .update(exportJobs)
      .set({
        status: 'completed',
        storageKey: key,
        fileName: `rundesk-export-${day}.csv`,
        sizeBytes: body.length,
        rowCount: ordered.length,
        downloadExpiresAt: link.expiresAt,
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(exportJobs.id, job.id))

    this.realtime.emitToUser(actorId, { type: 'export.ready', workspaceId, exportId: job.id })
    void this.notifications
      .create({
        userId: actorId,
        workspaceId,
        actorId,
        type: 'export_ready',
        title: `Your export is ready: ${ordered.length.toLocaleString('en-GB')} tasks`,
        body: 'The download link expires in one hour.',
        target: { entityType: 'export', entityId: job.id, url: link.url },
      })
      .catch(() => undefined)
  }

  // ── download ─────────────────────────────────────────────────────────────────

  /** The signed link's answer: the file, while the link and the file both last. */
  async download(exportId: string, expires: number, signature: string) {
    if (!isUuid(exportId) || !this.storage.verify(exportId, expires, signature)) {
      throw new GoneException('This download link has expired. Export again from Settings › Imports / Exports.')
    }
    const [job] = await this.db.select().from(exportJobs).where(eq(exportJobs.id, exportId)).limit(1)
    if (!job || job.status !== 'completed' || !job.storageKey) throw new NotFoundException('Export not found')
    if (!job.finishedAt || Date.now() - job.finishedAt.getTime() > FILE_RETENTION_MS) {
      throw new GoneException('This export has been removed. Export again from Settings › Imports / Exports.')
    }
    await this.security
      .logAuditEvent({
        workspaceId: job.workspaceId,
        actorId: job.createdById ?? undefined,
        action: 'export.downloaded',
        resourceType: 'export',
        resourceId: job.id,
        description: `Downloaded export ${job.fileName ?? job.id} by its link`,
        metadata: { rows: job.rowCount ?? 0 },
      })
      .catch(() => undefined)
    return { stream: await this.storage.open(job.storageKey), fileName: job.fileName ?? 'rundesk-export.csv' }
  }

  // ── upkeep ───────────────────────────────────────────────────────────────────

  /** Queued exports nobody started (their process died first), on every database. */
  @Cron(CronExpression.EVERY_MINUTE, { name: 'exports-recover-stalled' })
  async recover() {
    await this.sweep()
    for (const t of await this.tenants.listAll().catch(() => [])) {
      if (t.status !== 'active') continue
      const db = await this.tenants.getDbForOrganization(t.organizationId).catch(() => null)
      if (db) await runWithTenantDb(db, () => this.sweep()).catch(() => undefined)
    }
  }

  private async sweep() {
    const due = await this.db
      .select({ id: exportJobs.id })
      .from(exportJobs)
      .where(
        or(
          and(eq(exportJobs.status, 'pending'), lt(exportJobs.updatedAt, new Date(Date.now() - 30_000))),
          and(eq(exportJobs.status, 'processing'), lt(exportJobs.updatedAt, new Date(Date.now() - 10 * 60_000))),
        ),
      )
      .limit(5)
    for (const j of due) await this.run(j.id).catch(() => undefined)
  }

  /** Finished files go after a day; the history row stays and says so. */
  @Cron(CronExpression.EVERY_HOUR, { name: 'exports-purge-files' })
  async purgeFiles() {
    const old = await this.db
      .select({ id: exportJobs.id, key: exportJobs.storageKey })
      .from(exportJobs)
      .where(and(isNotNull(exportJobs.storageKey), lt(exportJobs.finishedAt, new Date(Date.now() - FILE_RETENTION_MS))))
      .limit(500)
    for (const o of old) {
      if (o.key) await this.storage.remove(o.key).catch(() => undefined)
      await this.db.update(exportJobs).set({ storageKey: null, updatedAt: new Date() }).where(eq(exportJobs.id, o.id))
    }
    await this.storage.purgeLocal(FILE_RETENTION_MS)
  }
}

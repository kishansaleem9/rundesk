import { WS_MANAGER_ROLES } from '../../common/permissions/workspace-roles'
import { Injectable, Inject, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common'
import { eq, and, desc, isNull, gte, lt, inArray, sql } from 'drizzle-orm'
import { timeEntries, tasks, lists, projects, spaces, users, timeApprovals, workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { SecurityService } from '../security/security.service'
import { NotificationsService } from '../notifications/notifications.service'
import { resolveIsManager, taskVisibilityFilter } from '../../common/permissions/item-visibility'

@Injectable()
export class TimeEntriesService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private readonly security: SecurityService,
    private readonly notifications: NotificationsService,
  ) {}

  async canModerateApprovals(workspaceId: string, userId: string) {
    const [membership] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1)
    return membership?.role === 'workspace_admin'
  }

  /** Guests may not track time (Plan §3.3). Resolves the task's workspace role. */
  private async assertNotGuestForTask(taskId: string, userId: string) {
    const [row] = await this.db
      .select({ role: workspaceMembers.role })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .innerJoin(
        workspaceMembers,
        and(eq(workspaceMembers.workspaceId, spaces.workspaceId), eq(workspaceMembers.userId, userId)),
      )
      .where(eq(tasks.id, taskId))
      .limit(1)
    if (row?.role === 'guest') throw new ForbiddenException('Guests cannot track time')
  }

  /** Per-member monthly timesheet totals over the last `months` (§8.5). */
  async getMonthlyTimesheet(workspaceId: string, months = 6) {
    const since = new Date()
    since.setUTCMonth(since.getUTCMonth() - months)
    since.setUTCDate(1)
    since.setUTCHours(0, 0, 0, 0)
    const monthExpr = sql<string>`to_char(${timeEntries.startedAt} at time zone 'UTC', 'YYYY-MM')`
    const rows = await this.db
      .select({
        userId: users.id,
        displayName: users.displayName,
        month: monthExpr,
        totalSeconds: sql<number>`coalesce(sum(${timeEntries.durationSec}), 0)::int`,
        billableSeconds: sql<number>`coalesce(sum(case when ${timeEntries.isBillable} then ${timeEntries.durationSec} else 0 end), 0)::int`,
      })
      .from(users)
      .innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
      .innerJoin(timeEntries, and(eq(timeEntries.userId, users.id), gte(timeEntries.startedAt, since)))
      .where(eq(workspaceMembers.workspaceId, workspaceId))
      .groupBy(users.id, users.displayName, monthExpr)
    return rows
      .map((r) => ({
        ...r,
        totalHours: Math.round((r.totalSeconds / 3600) * 10) / 10,
        billableHours: Math.round((r.billableSeconds / 3600) * 10) / 10,
      }))
      .sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : a.displayName.localeCompare(b.displayName)))
  }

  /**
   * A5.14 — one row per person per weekday for a single week, which is what a
   * team timesheet is. The per-entry list can't answer "what did the team book
   * on Tuesday?" because it is scoped to one member and unpivoted by day.
   * `weekStart` is a Monday (normalized by the caller).
   */
  /** Monday (UTC) of the week containing `weekStart`; today's week when absent. */
  parseWeekStart(weekStart?: string): Date {
    const iso = weekStart ?? new Date().toISOString().slice(0, 10)
    return new Date(`${this.normalizeWeekStart(iso)}T00:00:00.000Z`)
  }

  async getTeamWeek(workspaceId: string, weekStart: Date) {
    const weekEnd = new Date(weekStart)
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7)
    // Monday-indexed day-of-week, so column 0 is always the week start.
    const dayExpr = sql<number>`(extract(isodow from ${timeEntries.startedAt} at time zone 'UTC')::int - 1)`
    const rows = await this.db
      .select({
        userId: users.id,
        displayName: users.displayName,
        dayIndex: dayExpr,
        totalSeconds: sql<number>`coalesce(sum(${timeEntries.durationSec}), 0)::int`,
        billableSeconds: sql<number>`coalesce(sum(case when ${timeEntries.isBillable} then ${timeEntries.durationSec} else 0 end), 0)::int`,
      })
      .from(users)
      .innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
      .innerJoin(
        timeEntries,
        and(
          eq(timeEntries.userId, users.id),
          gte(timeEntries.startedAt, weekStart),
          lt(timeEntries.startedAt, weekEnd),
        ),
      )
      .where(eq(workspaceMembers.workspaceId, workspaceId))
      .groupBy(users.id, users.displayName, dayExpr)

    const byUser = new Map<string, { userId: string; displayName: string; daySeconds: number[]; totalSeconds: number; billableSeconds: number }>()
    for (const row of rows) {
      const entry = byUser.get(row.userId) ?? {
        userId: row.userId,
        displayName: row.displayName ?? '',
        daySeconds: Array.from({ length: 7 }, () => 0),
        totalSeconds: 0,
        billableSeconds: 0,
      }
      if (row.dayIndex >= 0 && row.dayIndex < 7) entry.daySeconds[row.dayIndex] += row.totalSeconds
      entry.totalSeconds += row.totalSeconds
      entry.billableSeconds += row.billableSeconds
      byUser.set(row.userId, entry)
    }
    return [...byUser.values()].sort((a, b) => b.totalSeconds - a.totalSeconds)
  }

  /** The owning project's billable default for a task (§8.3). */
  private async projectDefaultBillable(taskId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ def: projects.defaultBillable })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .where(eq(tasks.id, taskId))
      .limit(1)
    return row?.def ?? false
  }

  /**
   * Member submits their weekly timesheet for approval (§8.7): marks the week
   * 'submitted' and notifies workspace managers/admins (§10.1 approval_needed).
   */
  async submitTimesheet(workspaceId: string, userId: string, weekStart: string) {
    const normalizedWeekStart = this.normalizeWeekStart(weekStart)
    const [row] = await this.db
      .insert(timeApprovals)
      .values({ workspaceId, userId, weekStart: normalizedWeekStart, status: 'submitted' })
      .onConflictDoUpdate({
        target: [timeApprovals.workspaceId, timeApprovals.userId, timeApprovals.weekStart],
        set: { status: 'submitted', rejectionReason: null, approvedById: null, approvedAt: null, updatedAt: new Date() },
      })
      .returning()

    // Notify managers/admins that an approval is needed.
    const [submitter] = await this.db.select({ name: users.displayName }).from(users).where(eq(users.id, userId)).limit(1)
    const managers = await this.db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          inArray(workspaceMembers.role, [...WS_MANAGER_ROLES]),
        ),
      )
    for (const m of managers) {
      if (m.userId === userId) continue
      void this.notifications.create({
        userId: m.userId,
        workspaceId,
        actorId: userId,
        type: 'approval_needed',
        title: `Timesheet awaiting approval`,
        body: `${submitter?.name ?? 'A teammate'} submitted their timesheet for the week of ${normalizedWeekStart}.`,
        target: { entityType: 'timesheet', entityId: `${userId}:${normalizedWeekStart}`, url: `/app/${workspaceId}/time/approvals` },
      })
    }
    return row
  }

  private normalizeWeekStart(weekStart: string): string {
    const parsed = new Date(`${weekStart}T00:00:00.000Z`)
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Invalid week start date')
    }
    const day = parsed.getUTCDay()
    const distanceToMonday = (day + 6) % 7
    parsed.setUTCDate(parsed.getUTCDate() - distanceToMonday)
    return parsed.toISOString().slice(0, 10)
  }

  async listForWorkspace(
    workspaceId: string,
    opts: { userId?: string; since?: Date; until?: Date; actorId?: string; actorRole?: string | null } = {},
  ) {
    // Per-item task privacy (§2): drop entries whose task is a private task the
    // caller may not see (a private task's title would otherwise leak via
    // `taskTitle`). Managers are unrestricted — the filter resolves to undefined.
    const isManager = opts.actorId
      ? await resolveIsManager(this.db, workspaceId, opts.actorId, opts.actorRole)
      : false
    const where = and(
      eq(spaces.workspaceId, workspaceId),
      opts.userId ? eq(timeEntries.userId, opts.userId) : undefined,
      opts.since ? gte(timeEntries.startedAt, opts.since) : undefined,
      // The other end of a window. Without it a week was "since Monday", so
      // stepping BACK a week still fetched everything after that Monday.
      opts.until ? lt(timeEntries.startedAt, opts.until) : undefined,
      taskVisibilityFilter(this.db, opts.actorId ?? '', isManager),
    )
    const rows = await this.db
      .select({
        id: timeEntries.id,
        taskId: timeEntries.taskId,
        userId: timeEntries.userId,
        startedAt: timeEntries.startedAt,
        endedAt: timeEntries.endedAt,
        durationSec: timeEntries.durationSec,
        description: timeEntries.description,
        isBillable: timeEntries.isBillable,
        createdAt: timeEntries.createdAt,
        taskTitle: tasks.title,
        userName: users.displayName,
      })
      .from(timeEntries)
      .leftJoin(tasks, eq(tasks.id, timeEntries.taskId))
      .leftJoin(users, eq(users.id, timeEntries.userId))
      .leftJoin(lists, eq(lists.id, tasks.listId))
      .leftJoin(projects, eq(projects.id, lists.projectId))
      .leftJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(where)
      .orderBy(desc(timeEntries.startedAt))
      .limit(500)
    return rows.map((r) => ({
      ...r,
      // Frontend expected field name compatibility
      durationSeconds: r.durationSec ?? 0,
      billable: r.isBillable,
      loggedAt: r.startedAt,
    }))
  }

  async listApprovals(workspaceId: string, status?: 'pending' | 'submitted' | 'approved' | 'rejected') {
    const since = new Date()
    since.setUTCDate(since.getUTCDate() - 90)

    const rows = await this.db
      .select({
        userId: timeEntries.userId,
        userName: users.displayName,
        startedAt: timeEntries.startedAt,
        durationSec: timeEntries.durationSec,
        isBillable: timeEntries.isBillable,
        description: timeEntries.description,
        projectName: projects.name,
      })
      .from(timeEntries)
      .leftJoin(tasks, eq(tasks.id, timeEntries.taskId))
      .leftJoin(users, eq(users.id, timeEntries.userId))
      .leftJoin(lists, eq(lists.id, tasks.listId))
      .leftJoin(projects, eq(projects.id, lists.projectId))
      .leftJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(eq(spaces.workspaceId, workspaceId), gte(timeEntries.startedAt, since)))
      .orderBy(desc(timeEntries.startedAt))

    const approvals = await this.db
      .select()
      .from(timeApprovals)
      .where(eq(timeApprovals.workspaceId, workspaceId))
    const reviewerIds = [...new Set(approvals.map((item) => item.approvedById).filter((id): id is string => Boolean(id)))]
    const reviewerRows =
      reviewerIds.length > 0
        ? await this.db
            .select({
              id: users.id,
              displayName: users.displayName,
              email: users.email,
            })
            .from(users)
            .where(inArray(users.id, reviewerIds))
        : []
    const reviewerById = new Map(
      reviewerRows.map((row) => [row.id, { name: row.displayName ?? null, email: row.email ?? null }]),
    )

    const approvalByKey = new Map<string, (typeof approvals)[number]>(
      approvals.map((item) => [`${item.userId}:${item.weekStart}`, item]),
    )
    const sheets = new Map<
      string,
      {
        id: string
        userId: string
        name: string
        weekStart: string
        weekOf: string
        total: number
        billable: number
        status: 'pending' | 'submitted' | 'approved' | 'rejected'
        approvedAt?: Date | null
        approvedById?: string | null
        reviewerName?: string | null
        reviewerEmail?: string | null
        rejectionReason?: string
        entries: Array<{ project: string; hours: number; billable: boolean; note?: string }>
      }
    >()

    for (const row of rows) {
      const startedAt = new Date(row.startedAt)
      const weekStart = this.normalizeWeekStart(startedAt.toISOString().slice(0, 10))
      const key = `${row.userId}:${weekStart}`
      const approval = approvalByKey.get(key)
      const start = new Date(`${weekStart}T00:00:00.000Z`)
      const end = new Date(start)
      end.setUTCDate(end.getUTCDate() + 6)
      const reviewer = approval?.approvedById ? reviewerById.get(approval.approvedById) : undefined
      if (!sheets.has(key)) {
        sheets.set(key, {
          id: key,
          userId: row.userId,
          name: row.userName ?? 'Member',
          weekStart,
          weekOf: `${start.toLocaleDateString()} — ${end.toLocaleDateString()}`,
          total: 0,
          billable: 0,
          status: (approval?.status as 'pending' | 'submitted' | 'approved' | 'rejected') ?? 'pending',
          approvedAt: approval?.approvedAt ?? null,
          approvedById: approval?.approvedById ?? null,
          reviewerName: reviewer?.name ?? null,
          reviewerEmail: reviewer?.email ?? null,
          rejectionReason: approval?.rejectionReason ?? undefined,
          entries: [],
        })
      }
      const sheet = sheets.get(key)!
      const hours = (row.durationSec ?? 0) / 3600
      sheet.total += hours
      if (row.isBillable) sheet.billable += hours
      sheet.entries.push({
        project: row.projectName ?? 'Project',
        hours: Number(hours.toFixed(2)),
        billable: row.isBillable,
        note: row.description ?? undefined,
      })
    }

    const allSheets = [...sheets.values()]
      .map((sheet) => ({
        ...sheet,
        total: Number(sheet.total.toFixed(1)),
        billable: Number(sheet.billable.toFixed(1)),
      }))
      .sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1))

    return status ? allSheets.filter((sheet) => sheet.status === status) : allSheets
  }

  async setApprovalStatus(
    workspaceId: string,
    userId: string,
    weekStart: string,
    actorId: string,
    input: { status: 'approved' | 'rejected'; reason?: string | null },
  ) {
    const normalizedWeekStart = this.normalizeWeekStart(weekStart)
    const [existing] = await this.db
      .select()
      .from(timeApprovals)
      .where(
        and(
          eq(timeApprovals.workspaceId, workspaceId),
          eq(timeApprovals.userId, userId),
          eq(timeApprovals.weekStart, normalizedWeekStart),
        ),
      )
      .limit(1)

    if (existing) {
      const [updated] = await this.db
        .update(timeApprovals)
        .set({
          status: input.status,
          rejectionReason: input.status === 'rejected' ? input.reason ?? null : null,
          approvedById: actorId,
          approvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(timeApprovals.id, existing.id))
        .returning()
      await this.security.logAuditEvent({
        workspaceId,
        actorId,
        action: `timesheet.${input.status}`,
        resourceType: 'timesheet',
        resourceId: `${userId}:${normalizedWeekStart}`,
        description: `Timesheet ${input.status} for week ${normalizedWeekStart}`,
        metadata: {
          userId,
          weekStart: normalizedWeekStart,
          rejectionReason: input.reason ?? null,
        },
      })
      return updated
    }

    const [created] = await this.db
      .insert(timeApprovals)
      .values({
        workspaceId,
        userId,
        weekStart: normalizedWeekStart,
        status: input.status,
        rejectionReason: input.status === 'rejected' ? input.reason ?? null : null,
        approvedById: actorId,
        approvedAt: new Date(),
      })
      .returning()
    await this.security.logAuditEvent({
      workspaceId,
      actorId,
      action: `timesheet.${input.status}`,
      resourceType: 'timesheet',
      resourceId: `${userId}:${normalizedWeekStart}`,
      description: `Timesheet ${input.status} for week ${normalizedWeekStart}`,
      metadata: {
        userId,
        weekStart: normalizedWeekStart,
        rejectionReason: input.reason ?? null,
      },
    })
    return created
  }

  async getRunning(userId: string) {
    const [row] = await this.db
      .select()
      .from(timeEntries)
      .where(and(eq(timeEntries.userId, userId), isNull(timeEntries.endedAt)))
      .orderBy(desc(timeEntries.startedAt))
      .limit(1)
    return row ?? null
  }

  async start(userId: string, taskId: string, description?: string, isBillable?: boolean) {
    await this.assertNotGuestForTask(taskId, userId)
    // Stop any existing running timer for this user
    const running = await this.getRunning(userId)
    if (running) await this.stop(running.id, userId)
    const [row] = await this.db
      .insert(timeEntries)
      .values({
        userId,
        taskId,
        startedAt: new Date(),
        description,
        isBillable: isBillable ?? (await this.projectDefaultBillable(taskId)),
      })
      .returning()
    return row
  }

  async stop(entryId: string, userId: string) {
    const [existing] = await this.db.select().from(timeEntries).where(eq(timeEntries.id, entryId))
    if (!existing) throw new NotFoundException('Entry not found')
    if (existing.userId !== userId) throw new ForbiddenException('Not your timer')
    if (existing.endedAt) return existing
    const endedAt = new Date()
    const durationSec = Math.floor((endedAt.getTime() - new Date(existing.startedAt).getTime()) / 1000)
    const [row] = await this.db
      .update(timeEntries)
      .set({ endedAt, durationSec, updatedAt: new Date() })
      .where(eq(timeEntries.id, entryId))
      .returning()
    return row
  }

  async createManual(data: {
    userId: string
    taskId: string
    durationSec: number
    startedAt?: Date
    description?: string
    isBillable?: boolean
  }) {
    await this.assertNotGuestForTask(data.taskId, data.userId)
    const startedAt = data.startedAt ?? new Date()
    const endedAt = new Date(startedAt.getTime() + data.durationSec * 1000)
    const [row] = await this.db
      .insert(timeEntries)
      .values({
        userId: data.userId,
        taskId: data.taskId,
        startedAt,
        endedAt,
        durationSec: data.durationSec,
        description: data.description,
        isBillable: data.isBillable ?? (await this.projectDefaultBillable(data.taskId)),
      })
      .returning()
    return row
  }

  async update(
    entryId: string,
    userId: string,
    patch: { durationSec?: number; description?: string | null; isBillable?: boolean; startedAt?: Date },
  ) {
    const [existing] = await this.db.select().from(timeEntries).where(eq(timeEntries.id, entryId))
    if (!existing) throw new NotFoundException('Entry not found')
    if (existing.userId !== userId) throw new ForbiddenException('Not your entry')
    const set: Record<string, unknown> = { ...patch, updatedAt: new Date() }
    if (typeof patch.durationSec === 'number' && patch.startedAt) {
      set.endedAt = new Date(patch.startedAt.getTime() + patch.durationSec * 1000)
    }
    const [row] = await this.db.update(timeEntries).set(set).where(eq(timeEntries.id, entryId)).returning()
    return row
  }

  async remove(entryId: string, userId: string) {
    const [existing] = await this.db.select().from(timeEntries).where(eq(timeEntries.id, entryId))
    if (!existing) throw new NotFoundException('Entry not found')
    if (existing.userId !== userId) throw new ForbiddenException('Not your entry')
    await this.db.delete(timeEntries).where(eq(timeEntries.id, entryId))
    return { ok: true }
  }
}

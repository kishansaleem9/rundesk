import { Injectable, Inject, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common'
import { eq, and, desc, isNull, gte, inArray } from 'drizzle-orm'
import { timeEntries, tasks, lists, projects, spaces, users, timeApprovals, workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { SecurityService } from '../security/security.service'

@Injectable()
export class TimeEntriesService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private readonly security: SecurityService,
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

  async listForWorkspace(workspaceId: string, opts: { userId?: string; since?: Date } = {}) {
    const where = and(
      eq(spaces.workspaceId, workspaceId),
      opts.userId ? eq(timeEntries.userId, opts.userId) : undefined,
      opts.since ? gte(timeEntries.startedAt, opts.since) : undefined,
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

  async listApprovals(workspaceId: string, status?: 'pending' | 'approved' | 'rejected') {
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
        status: 'pending' | 'approved' | 'rejected'
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
          status: (approval?.status as 'pending' | 'approved' | 'rejected') ?? 'pending',
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
        isBillable: isBillable ?? false,
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
        isBillable: data.isBillable ?? false,
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

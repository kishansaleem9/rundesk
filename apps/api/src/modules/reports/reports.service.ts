import { Injectable, Inject, Optional, NotFoundException, BadRequestException } from '@nestjs/common'
import { and, eq, gte, lte, sql, desc, asc, inArray } from 'drizzle-orm'
import {
  tasks,
  taskAssignees,
  taskActivity,
  taskDependencies,
  taskLabelAssignments,
  labels,
  users,
  workspaceMembers,
  timeEntries,
  sprints,
  sprintTasks,
  goals,
  lists,
  projects,
  spaces,
  clients,
  customReports,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { renderReportPdf, tableToLines } from './pdf'
import { AiService } from '../ai/ai.service'

function daysAgo(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d
}

// ── Custom report builder types ─────────────────────────────────────────────
export type ReportDefinition = {
  metrics?: string[]
  dimensions?: string[]
  dimension?: string
  filters?: Array<{ field: string; op: string; value: string }>
  viz?: 'bar' | 'line' | 'pie' | 'table'
  days?: number
}

export type ReportResult = {
  dimension: string
  metrics: string[]
  generatedAt: string
  rows: Array<{ key: string; label: string; values: Record<string, number> }>
}

// ── Scheduled delivery (§9.5) ───────────────────────────────────────────────
export type ReportScheduleInput = {
  frequency?: 'none' | 'daily' | 'weekly' | string
  hour?: number
  dayOfWeek?: number | null
  recipients?: string[]
}

export type ReportScheduleColumns = {
  scheduleFrequency: 'none' | 'daily' | 'weekly'
  scheduleHour: number
  scheduleDayOfWeek: number | null
  scheduleRecipients: string[]
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Validate + clamp incoming schedule fields. Throws BadRequestException on an
 * invalid frequency or malformed recipient email; clamps hour to 0–23 and
 * weekday to 0–6, and defaults a weekly schedule with no weekday to Monday.
 * Returns null when no schedule fields were supplied so a plain name/definition
 * edit leaves the existing schedule untouched.
 */
export function normalizeScheduleInput(input?: ReportScheduleInput): ReportScheduleColumns | null {
  if (!input || typeof input !== 'object') return null
  const hasAny =
    input.frequency !== undefined ||
    input.hour !== undefined ||
    input.dayOfWeek !== undefined ||
    input.recipients !== undefined
  if (!hasAny) return null

  const freq = input.frequency
  if (freq !== undefined && freq !== 'none' && freq !== 'daily' && freq !== 'weekly') {
    throw new BadRequestException('Invalid schedule frequency')
  }
  const frequency = (freq ?? 'none') as 'none' | 'daily' | 'weekly'

  let hour = 8
  if (input.hour !== undefined) {
    const h = Math.trunc(Number(input.hour))
    if (!Number.isFinite(h) || h < 0 || h > 23) throw new BadRequestException('Schedule hour must be between 0 and 23')
    hour = h
  }

  let dayOfWeek: number | null = null
  if (input.dayOfWeek !== undefined && input.dayOfWeek !== null) {
    const d = Math.trunc(Number(input.dayOfWeek))
    if (!Number.isFinite(d) || d < 0 || d > 6) throw new BadRequestException('Schedule day of week must be between 0 and 6')
    dayOfWeek = d
  }
  if (frequency === 'weekly' && dayOfWeek === null) dayOfWeek = 1

  let recipients: string[] = []
  if (input.recipients !== undefined) {
    if (!Array.isArray(input.recipients)) throw new BadRequestException('Recipients must be a list of emails')
    const cleaned = input.recipients.map((e) => String(e ?? '').trim().toLowerCase()).filter((e) => e.length > 0)
    for (const e of cleaned) {
      if (!EMAIL_RE.test(e)) throw new BadRequestException(`Invalid recipient email: ${e}`)
    }
    recipients = [...new Set(cleaned)]
  }

  return { scheduleFrequency: frequency, scheduleHour: hour, scheduleDayOfWeek: dayOfWeek, scheduleRecipients: recipients }
}

const SUPPORTED_METRICS = [
  'tasks-count',
  'tasks-completed',
  'on-time-rate',
  'cycle-time',
  'time-logged',
  'billable-hours',
  'sprint-velocity',
] as const

const SUPPORTED_DIMENSIONS = [
  'assignee',
  'status',
  'priority',
  'project',
  'sprint',
  'label',
  'date-week',
  'date-month',
] as const

function isoWeekKey(d: Date): string {
  // ISO week: Monday-based. Produce e.g. "2026-W25".
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function csvCell(v: string | number): string {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * Serialize a run result to CSV (a `group` column + one column per metric).
 * Shared by the CSV export endpoint and the scheduled-report email attachment.
 */
export function reportResultToCsv(result: ReportResult): string {
  const header = ['group', ...result.metrics]
  const lines = [header.map(csvCell).join(',')]
  for (const r of result.rows) {
    lines.push([csvCell(r.label), ...result.metrics.map((m) => csvCell(r.values[m] ?? 0))].join(','))
  }
  return lines.join('\n')
}

// ── Contribution analytics (§7.14) ──────────────────────────────────────────
export type ContributionPeriodType = 'this-month' | 'last-month' | 'sprint'
export type ContributionPeriod = {
  type: ContributionPeriodType
  from: string
  to: string
  label: string
  sprintId?: string
}
export type ContributionFactors = {
  userId: string
  name: string
  email: string | null
  tasksCompleted: number
  tasksAssigned: number
  onTimeRate: number
  collaboration: number
  blockersResolved: number
  score: number
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// taskActivity actions that count as collaboration touchpoints (comments,
// assignments, dependency/subtask/date coordination).
const COLLABORATION_ACTIONS = new Set([
  'commented', 'assigned', 'unassigned', 'dependency_added', 'dependency_removed',
  'due_date_changed', 'subtask_added', 'checklist_item_toggled',
])

/** Pure month-range resolver for this-month / last-month in UTC (§7.14 period selector). */
export function monthPeriodRange(
  period: 'this-month' | 'last-month',
  now: Date,
): { from: Date; to: Date; label: string } {
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  if (period === 'last-month') {
    const from = new Date(Date.UTC(y, m - 1, 1))
    const to = new Date(Date.UTC(y, m, 1) - 1)
    return { from, to, label: `${MONTH_NAMES[from.getUTCMonth()]} ${from.getUTCFullYear()}` }
  }
  const from = new Date(Date.UTC(y, m, 1))
  return { from, to: now, label: `${MONTH_NAMES[m]} ${y}` }
}

/**
 * Composite contribution index from a member's real factors (§7.14). Weighted so
 * completed work and resolved blockers dominate, with on-time reliability and
 * collaboration as secondary signals. Pure + testable.
 */
export function scoreContribution(f: {
  tasksCompleted: number
  onTimeRate: number
  collaboration: number
  blockersResolved: number
}): number {
  const completed = Math.max(0, f.tasksCompleted) * 3
  const blockers = Math.max(0, f.blockersResolved) * 2
  const onTime = Math.round(Math.max(0, Math.min(100, f.onTimeRate)) / 10) // 0–10
  const collab = Math.min(20, Math.max(0, f.collaboration))
  return completed + blockers + onTime + collab
}

/** Deterministic per-member contribution narrative (§7.14 AI fallback). Pure + testable. */
export function contributionNarrativeFallback(f: {
  name: string
  tasksCompleted: number
  onTimeRate: number
  collaboration: number
  blockersResolved: number
}): string {
  if (f.tasksCompleted === 0 && f.collaboration === 0 && f.blockersResolved === 0) {
    return `${f.name} has no recorded activity in this period.`
  }
  const parts: string[] = [
    `completed ${f.tasksCompleted} task${f.tasksCompleted === 1 ? '' : 's'} (${f.onTimeRate}% on time)`,
  ]
  if (f.blockersResolved > 0) parts.push(`resolved ${f.blockersResolved} blocker${f.blockersResolved === 1 ? '' : 's'}`)
  if (f.collaboration > 0) {
    parts.push(`logged ${f.collaboration} collaboration touchpoint${f.collaboration === 1 ? '' : 's'}`)
  }
  const last = parts.pop() as string
  const joined = parts.length ? `${parts.join(', ')}, and ${last}` : last
  return `${f.name} ${joined}.`
}

@Injectable()
export class ReportsService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    // AiService powers the §7.14 contribution narrative; @Optional so pure-DB
    // unit tests can construct ReportsService without the AI module. When absent,
    // narratives fall back to the deterministic template.
    @Optional() private ai?: AiService,
  ) {}

  // ─── Overview / Summary card ──────────────────────────────────────────────
  async getOverview(workspaceId: string) {
    const allTasksQuery = await this.db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        statusCategory: tasks.statusCategory,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        completedAt: tasks.completedAt,
        listId: lists.id,
        listName: lists.name,
        projectId: projects.id,
        projectName: projects.name,
        spaceId: spaces.id,
        spaceName: spaces.name,
      })
      .from(tasks)
      .innerJoin(lists, eq(tasks.listId, lists.id))
      .innerJoin(projects, eq(lists.projectId, projects.id))
      .innerJoin(spaces, eq(projects.spaceId, spaces.id))
      .where(eq(spaces.workspaceId, workspaceId))

    const now = new Date()
    const total = allTasksQuery.length
    const completed = allTasksQuery.filter((t) => t.status === 'done').length
    const overdue = allTasksQuery.filter(
      (t) => t.dueDate && new Date(t.dueDate) < now && t.status !== 'done',
    ).length
    const dueTodayTasks = allTasksQuery.filter((t) => {
      if (!t.dueDate) return false
      const d = new Date(t.dueDate)
      return d.toDateString() === now.toDateString() && t.status !== 'done'
    })
    const dueToday = dueTodayTasks.length

    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0

    const byPriority: Record<string, number> = { urgent: 0, high: 0, normal: 0, low: 0 }
    for (const t of allTasksQuery) {
      if (t.status === 'done' || t.status === 'cancelled') continue
      const key = (t.priority ?? 'normal') as keyof typeof byPriority
      if (key in byPriority) byPriority[key]++
    }

    // §9.1: return the actual due-today tasks (not just the count) so the
    // real-time widget can render the list with links, ordered by priority.
    const prioRank: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 }
    const dueTodayList = dueTodayTasks
      .sort((a, b) => (prioRank[a.priority ?? 'normal'] ?? 2) - (prioRank[b.priority ?? 'normal'] ?? 2))
      .slice(0, 50)
      .map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        statusCategory: t.statusCategory,
        priority: t.priority,
        dueDate: t.dueDate,
        listId: t.listId,
        listName: t.listName,
        projectId: t.projectId,
        projectName: t.projectName,
        spaceId: t.spaceId,
        spaceName: t.spaceName,
      }))

    return { total, completed, overdue, dueToday, completionRate, byPriority, dueTodayList }
  }

  // ─── Productivity per member ──────────────────────────────────────────────
  /**
   * View-Reports scoping (Plan §3.3): admins/managers see everyone; plain
   * members/guests see only their own row. Returns the userId to restrict to,
   * or undefined for full visibility.
   */
  async getViewerScope(workspaceId: string, userId: string): Promise<string | undefined> {
    const [m] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1)
    const privileged = ['workspace_admin', 'manager', 'super_admin']
    return m && privileged.includes(m.role) ? undefined : userId
  }

  async getProductivity(
    workspaceId: string,
    days = 30,
    restrictToUserId?: string,
    scope: { spaceId?: string; projectId?: string } = {},
  ) {
    const since = daysAgo(days)
    // Optional space/project scope (Plan §9). Applied inside the CASE counts so
    // every member still appears (with 0) rather than being filtered out.
    const inScope = scope.projectId
      ? sql`${lists.projectId} = ${scope.projectId}`
      : scope.spaceId
        ? sql`${projects.spaceId} = ${scope.spaceId}`
        : sql`true`

    const rows = await this.db
      .select({
        userId: users.id,
        displayName: users.displayName,
        email: users.email,
        avatarUrl: users.avatarUrl,
        tasksCompleted: sql<number>`count(distinct case when ${tasks.status} = 'done' and ${inScope} then ${tasks.id} end)::int`,
        tasksCreated: sql<number>`count(distinct case when ${tasks.createdById} = ${users.id} and ${inScope} then ${tasks.id} end)::int`,
        totalAssigned: sql<number>`count(distinct case when ${inScope} then ${tasks.id} end)::int`,
      })
      .from(users)
      .innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
      .leftJoin(taskAssignees, eq(taskAssignees.userId, users.id))
      .leftJoin(tasks, and(eq(tasks.id, taskAssignees.taskId), gte(tasks.updatedAt, since)))
      .leftJoin(lists, eq(lists.id, tasks.listId))
      .leftJoin(projects, eq(projects.id, lists.projectId))
      .where(
        restrictToUserId
          ? and(eq(workspaceMembers.workspaceId, workspaceId), eq(users.id, restrictToUserId))
          : eq(workspaceMembers.workspaceId, workspaceId),
      )
      .groupBy(users.id, users.displayName, users.email, users.avatarUrl)
      .orderBy(desc(sql`count(distinct case when ${tasks.status} = 'done' and ${inScope} then ${tasks.id} end)`))

    return rows
  }

  /** Completed-tasks trend bucketed by week or month (Plan §9). */
  async getProductivityTrend(
    workspaceId: string,
    days = 90,
    bucket: 'week' | 'month' = 'week',
    scope: { spaceId?: string; projectId?: string } = {},
  ) {
    const since = daysAgo(days)
    const periodExpr =
      bucket === 'month'
        ? sql<string>`to_char(${tasks.completedAt} at time zone 'UTC', 'YYYY-MM')`
        : sql<string>`to_char(date_trunc('week', ${tasks.completedAt} at time zone 'UTC'), 'YYYY-MM-DD')`
    const scopeCond = scope.projectId
      ? eq(lists.projectId, scope.projectId)
      : scope.spaceId
        ? eq(projects.spaceId, scope.spaceId)
        : undefined
    const rows = await this.db
      .select({
        period: periodExpr,
        tasksCompleted: sql<number>`count(distinct ${tasks.id})::int`,
      })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(eq(spaces.workspaceId, workspaceId), gte(tasks.completedAt, since), scopeCond))
      .groupBy(periodExpr)
      .orderBy(periodExpr)
    return rows
  }

  // ─── Completion analytics ─────────────────────────────────────────────────
  async getCompletionAnalytics(workspaceId: string, days = 30) {
    const since = daysAgo(days)
    const allTasks = await this.db
      .select({
        id: tasks.id,
        status: tasks.status,
        dueDate: tasks.dueDate,
        completedAt: tasks.completedAt,
        createdAt: tasks.createdAt,
      })
      .from(tasks)
      .innerJoin(lists, eq(tasks.listId, lists.id))
      .innerJoin(projects, eq(lists.projectId, projects.id))
      .innerJoin(spaces, eq(projects.spaceId, spaces.id))
      .where(and(eq(spaces.workspaceId, workspaceId), gte(tasks.createdAt, since)))

    const completed = allTasks.filter((t) => t.status === 'done')
    const onTime = completed.filter(
      (t) => t.completedAt && t.dueDate && new Date(t.completedAt) <= new Date(t.dueDate),
    ).length
    const late = completed.filter(
      (t) => t.completedAt && t.dueDate && new Date(t.completedAt) > new Date(t.dueDate),
    ).length

    // Group completed tasks by day for trend chart
    const byDay: Record<string, number> = {}
    for (let i = days - 1; i >= 0; i--) {
      const d = daysAgo(i)
      byDay[d.toISOString().split('T')[0]] = 0
    }
    for (const t of completed) {
      if (!t.completedAt) continue
      const day = new Date(t.completedAt).toISOString().split('T')[0]
      if (day in byDay) byDay[day]++
    }

    // Status breakdown
    const statusBreakdown: Record<string, number> = {}
    for (const t of allTasks) {
      statusBreakdown[t.status] = (statusBreakdown[t.status] ?? 0) + 1
    }

    return {
      total: allTasks.length,
      completed: completed.length,
      onTime,
      late,
      // Share of tasks created in the window that are now done — lets the
      // completion widget offer a this-week / this-month period toggle (§9.1).
      completionRate: allTasks.length > 0 ? Math.round((completed.length / allTasks.length) * 100) : 0,
      onTimeRate: completed.length > 0 ? Math.round((onTime / completed.length) * 100) : 0,
      trend: Object.entries(byDay).map(([date, count]) => ({ date, count })),
      statusBreakdown,
    }
  }

  // ─── Time tracking report ─────────────────────────────────────────────────
  async getTimeReport(workspaceId: string, days = 30, restrictToUserId?: string) {
    const since = daysAgo(days)

    const rows = await this.db
      .select({
        userId: users.id,
        displayName: users.displayName,
        email: users.email,
        totalSeconds: sql<number>`coalesce(sum(${timeEntries.durationSec}), 0)::int`,
        billableSeconds: sql<number>`coalesce(sum(case when ${timeEntries.isBillable} then ${timeEntries.durationSec} else 0 end), 0)::int`,
        entryCount: sql<number>`count(${timeEntries.id})::int`,
      })
      .from(users)
      .innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
      .leftJoin(
        timeEntries,
        and(eq(timeEntries.userId, users.id), gte(timeEntries.startedAt, since)),
      )
      .where(
        restrictToUserId
          ? and(eq(workspaceMembers.workspaceId, workspaceId), eq(users.id, restrictToUserId))
          : eq(workspaceMembers.workspaceId, workspaceId),
      )
      .groupBy(users.id, users.displayName, users.email)
      .orderBy(desc(sql`coalesce(sum(${timeEntries.durationSec}), 0)`))

    return rows.map((r) => ({
      ...r,
      totalHours: Math.round((r.totalSeconds / 3600) * 10) / 10,
      billableHours: Math.round((r.billableSeconds / 3600) * 10) / 10,
    }))
  }

  /** Billable hours broken down by project (and its client), Plan §9. */
  async getTimeByProject(workspaceId: string, days = 30, restrictToUserId?: string) {
    const since = daysAgo(days)
    const rows = await this.db
      .select({
        projectId: projects.id,
        projectName: projects.name,
        clientId: clients.id,
        clientName: clients.name,
        totalSeconds: sql<number>`coalesce(sum(${timeEntries.durationSec}), 0)::int`,
        billableSeconds: sql<number>`coalesce(sum(case when ${timeEntries.isBillable} then ${timeEntries.durationSec} else 0 end), 0)::int`,
        entryCount: sql<number>`count(${timeEntries.id})::int`,
      })
      .from(timeEntries)
      .innerJoin(tasks, eq(tasks.id, timeEntries.taskId))
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .leftJoin(clients, eq(clients.id, projects.clientId))
      .where(
        and(
          eq(spaces.workspaceId, workspaceId),
          gte(timeEntries.startedAt, since),
          restrictToUserId ? eq(timeEntries.userId, restrictToUserId) : undefined,
        ),
      )
      .groupBy(projects.id, projects.name, clients.id, clients.name)
      .orderBy(desc(sql`coalesce(sum(${timeEntries.durationSec}), 0)`))
    return rows.map((r) => ({
      ...r,
      totalHours: Math.round((r.totalSeconds / 3600) * 10) / 10,
      billableHours: Math.round((r.billableSeconds / 3600) * 10) / 10,
    }))
  }

  /**
   * Average time tasks spend in each status (Plan §9 bottleneck view), derived
   * from status_changed activity: a task is "in" meta.to from that event until
   * its next status change (or now if it's still there).
   */
  async getStatusDurations(workspaceId: string, days = 90) {
    const since = daysAgo(days)
    const events = await this.db
      .select({
        taskId: taskActivity.taskId,
        meta: taskActivity.meta,
        createdAt: taskActivity.createdAt,
      })
      .from(taskActivity)
      .innerJoin(tasks, eq(tasks.id, taskActivity.taskId))
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(
        and(
          eq(spaces.workspaceId, workspaceId),
          eq(taskActivity.action, 'status_changed'),
          gte(taskActivity.createdAt, since),
        ),
      )
      .orderBy(asc(taskActivity.taskId), asc(taskActivity.createdAt))

    const now = Date.now()
    const durations = new Map<string, { totalMs: number; count: number }>()
    let i = 0
    while (i < events.length) {
      const taskId = events[i].taskId
      const group: typeof events = []
      while (i < events.length && events[i].taskId === taskId) {
        group.push(events[i])
        i++
      }
      for (let j = 0; j < group.length; j++) {
        const to = (group[j].meta as { to?: string } | null)?.to
        if (!to) continue
        const start = new Date(group[j].createdAt).getTime()
        const end = j + 1 < group.length ? new Date(group[j + 1].createdAt).getTime() : now
        const ms = Math.max(0, end - start)
        const d = durations.get(to) ?? { totalMs: 0, count: 0 }
        d.totalMs += ms
        d.count += 1
        durations.set(to, d)
      }
    }
    return [...durations.entries()]
      .map(([status, d]) => ({
        status,
        avgHours: Math.round((d.totalMs / d.count / 3_600_000) * 10) / 10,
        samples: d.count,
      }))
      .sort((a, b) => b.avgHours - a.avgHours)
  }

  // ─── Sprint velocity ──────────────────────────────────────────────────────
  async getSprintVelocity(workspaceId: string) {
    const recentSprints = await this.db
      .select()
      .from(sprints)
      .where(eq(sprints.workspaceId, workspaceId))
      .orderBy(desc(sprints.startDate))
      .limit(10)

    const results = await Promise.all(
      recentSprints.map(async (sprint) => {
        const taskRows = await this.db
          .select({ taskId: sprintTasks.taskId })
          .from(sprintTasks)
          .where(eq(sprintTasks.sprintId, sprint.id))

        // Sum story points from sprint_tasks
        const [pointsRow] = await this.db
          .select({
            planned: sql<number>`coalesce(sum(${sprintTasks.storyPoints}), 0)::float`,
            completed: sql<number>`coalesce(sum(case when ${tasks.statusCategory} = 'closed' or ${tasks.status} = 'done' then ${sprintTasks.storyPoints} else 0 end), 0)::float`,
          })
          .from(sprintTasks)
          .innerJoin(tasks, eq(tasks.id, sprintTasks.taskId))
          .where(eq(sprintTasks.sprintId, sprint.id))

        const plannedPoints = Number(pointsRow?.planned ?? 0)
        const completedPoints = Number(pointsRow?.completed ?? 0)
        return {
          sprintId: sprint.id,
          name: sprint.name,
          startDate: sprint.startDate,
          endDate: sprint.endDate,
          status: sprint.status,
          taskCount: taskRows.length,
          plannedPoints,
          completedPoints,
        }
      }),
    )

    return results
  }

  // ─── Goals progress ────────────────────────────────────────────────────────
  async getGoalsProgress(workspaceId: string) {
    const rows = await this.db
      .select()
      .from(goals)
      .where(eq(goals.workspaceId, workspaceId))
      .orderBy(desc(goals.createdAt))

    const byStatus = {
      on_track: 0,
      at_risk: 0,
      off_track: 0,
      completed: 0,
    }
    for (const g of rows) {
      const status = g.status as keyof typeof byStatus
      if (status in byStatus) byStatus[status]++
    }

    const avgProgress =
      rows.length > 0
        ? Math.round(
            rows.reduce((s, g) => {
              const pct = g.targetValue > 0 ? (g.currentValue / g.targetValue) * 100 : 0
              return s + pct
            }, 0) / rows.length,
          )
        : 0

    return {
      goals: rows.map((g) => ({
        ...g,
        progress: g.targetValue > 0 ? Math.round((g.currentValue / g.targetValue) * 100) : 0,
      })),
      byStatus,
      avgProgress,
      total: rows.length,
    }
  }

  async getWorkload(workspaceId: string, days = 14) {
    const horizon = Math.min(Math.max(days, 1), 90)
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + horizon - 1)
    end.setHours(23, 59, 59, 999)

    const members = await this.db
      .select({
        userId: users.id,
        name: users.displayName,
        email: users.email,
        role: workspaceMembers.role,
        weeklyCapacityHours: workspaceMembers.weeklyCapacityHours,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, workspaceId))

    const assignments = await this.db
      .select({
        userId: taskAssignees.userId,
        timeEstimate: tasks.timeEstimate,
        startDate: tasks.startDate,
        dueDate: tasks.dueDate,
        status: tasks.status,
      })
      .from(taskAssignees)
      .innerJoin(tasks, eq(tasks.id, taskAssignees.taskId))
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(eq(spaces.workspaceId, workspaceId), eq(tasks.isArchived, false), sql`${tasks.status} != 'done'`))

    const dayCount = horizon
    const perUser = new Map<string, number[]>()
    for (const member of members) {
      perUser.set(member.userId, Array.from({ length: dayCount }, () => 0))
    }

    const toDayStart = (value: Date) => {
      const next = new Date(value)
      next.setHours(0, 0, 0, 0)
      return next
    }

    for (const assignment of assignments) {
      const dailyLoads = perUser.get(assignment.userId)
      if (!dailyLoads) continue

      const estimateHours = Math.max(0.5, Math.round(((assignment.timeEstimate ?? 4 * 3600) / 3600) * 10) / 10)
      const rawStart = assignment.startDate ? toDayStart(new Date(assignment.startDate)) : start
      const rawEnd = assignment.dueDate ? toDayStart(new Date(assignment.dueDate)) : rawStart
      const rangeStart = rawStart < start ? start : rawStart
      const rangeEnd = rawEnd > end ? end : rawEnd
      const spanDays = Math.max(1, Math.floor((rangeEnd.getTime() - rangeStart.getTime()) / 86400000) + 1)
      const perDay = estimateHours / spanDays

      for (let offset = 0; offset < dayCount; offset++) {
        const current = new Date(start)
        current.setDate(current.getDate() + offset)
        const within = current >= rangeStart && current <= rangeEnd
        if (within) dailyLoads[offset] += perDay
      }
    }

    return members.map((member) => {
      const weekly = member.weeklyCapacityHours ?? 40
      // Daily capacity (5-day work week)
      const dailyCapacity = Math.max(1, Math.round((weekly / 5) * 10) / 10)
      return {
        userId: member.userId,
        name: member.name ?? 'Unknown',
        email: member.email ?? null,
        role: humanizeRole(member.role),
        capacity: dailyCapacity,
        weeklyCapacityHours: weekly,
        dailyLoads: (perUser.get(member.userId) ?? []).map((load) => Math.round(load * 10) / 10),
      }
    })
  }

  /**
   * Drill-down for a single workload heat-map cell (§5.6): the tasks assigned
   * to `userId` that contribute load on `dateStr` (YYYY-MM-DD). Mirrors the
   * span/estimate maths in getWorkload exactly so the per-task `hours` sum to
   * the cell's displayed load. `days` is the same horizon the heat-map uses so
   * the range clamping matches.
   */
  async getWorkloadDay(workspaceId: string, userId: string, dateStr: string, days = 14) {
    const horizon = Math.min(Math.max(days, 1), 90)
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + horizon - 1)
    end.setHours(0, 0, 0, 0)

    const target = new Date(dateStr)
    if (Number.isNaN(target.getTime())) return []
    target.setHours(0, 0, 0, 0)

    const rows = await this.db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        statusCategory: tasks.statusCategory,
        priority: tasks.priority,
        startDate: tasks.startDate,
        dueDate: tasks.dueDate,
        timeEstimate: tasks.timeEstimate,
        listId: lists.id,
        listName: lists.name,
        projectId: projects.id,
        projectName: projects.name,
        spaceId: spaces.id,
        spaceName: spaces.name,
      })
      .from(taskAssignees)
      .innerJoin(tasks, eq(tasks.id, taskAssignees.taskId))
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(
        and(
          eq(spaces.workspaceId, workspaceId),
          eq(taskAssignees.userId, userId),
          eq(tasks.isArchived, false),
          sql`${tasks.status} != 'done'`,
        ),
      )

    const toDayStart = (value: Date) => {
      const next = new Date(value)
      next.setHours(0, 0, 0, 0)
      return next
    }

    const prioRank: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 }
    const result = []
    for (const task of rows) {
      const estimateHours = Math.max(0.5, Math.round(((task.timeEstimate ?? 4 * 3600) / 3600) * 10) / 10)
      const rawStart = task.startDate ? toDayStart(new Date(task.startDate)) : start
      const rawEnd = task.dueDate ? toDayStart(new Date(task.dueDate)) : rawStart
      const rangeStart = rawStart < start ? start : rawStart
      const rangeEnd = rawEnd > end ? end : rawEnd
      if (target < rangeStart || target > rangeEnd) continue
      const spanDays = Math.max(1, Math.floor((rangeEnd.getTime() - rangeStart.getTime()) / 86400000) + 1)
      const perDay = estimateHours / spanDays
      result.push({
        id: task.id,
        title: task.title,
        status: task.status,
        statusCategory: task.statusCategory,
        priority: task.priority,
        startDate: task.startDate,
        dueDate: task.dueDate,
        hours: Math.round(perDay * 10) / 10,
        listId: task.listId,
        listName: task.listName,
        projectId: task.projectId,
        projectName: task.projectName,
        spaceId: task.spaceId,
        spaceName: task.spaceName,
      })
    }
    result.sort(
      (a, b) =>
        (prioRank[a.priority ?? 'normal'] ?? 2) - (prioRank[b.priority ?? 'normal'] ?? 2) || b.hours - a.hours,
    )
    return result
  }

  /**
   * Deterministic per-project health scores 0–100 (§5.7). Transparent weighted
   * formula from real signals — no AI, no randomness:
   *   score = 100 × ( 0.35·onTime + 0.30·notOverdue + 0.15·notBlocked + 0.20·recentActivity )
   *   • onTime         = completed-with-due tasks finished on/before due date
   *                      (1 if some completed but none had due dates; 0.6 neutral if none completed)
   *   • notOverdue     = 1 − (open tasks past due ÷ open tasks)
   *   • notBlocked     = 1 − (open tasks blocked by an incomplete task ÷ open tasks)
   *   • recentActivity = min(1, activity events in last 7d ÷ open tasks)
   * Bands: green ≥ 75, yellow ≥ 50, red < 50; empty projects score 0.
   */
  async getProjectHealth(workspaceId: string) {
    const now = Date.now()
    const activitySince = daysAgo(7)

    const projectRows = await this.db
      .select({ id: projects.id, name: projects.name, color: projects.color })
      .from(projects)
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(eq(spaces.workspaceId, workspaceId), eq(projects.isArchived, false)))
      .orderBy(asc(projects.name))

    const taskRows = await this.db
      .select({
        id: tasks.id,
        projectId: lists.projectId,
        status: tasks.status,
        statusCategory: tasks.statusCategory,
        dueDate: tasks.dueDate,
        completedAt: tasks.completedAt,
      })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(eq(spaces.workspaceId, workspaceId), eq(tasks.isArchived, false)))

    const statusById = new Map(taskRows.map((t) => [t.id, t.statusCategory]))

    // Blocked open tasks: normalize both dependency directions to
    // (blockedId ← blockerId); a blocker still open means real blockage.
    const depRows = await this.db
      .select({
        taskId: taskDependencies.taskId,
        relatedTaskId: taskDependencies.relatedTaskId,
        type: taskDependencies.type,
      })
      .from(taskDependencies)
      .innerJoin(tasks, eq(tasks.id, taskDependencies.taskId))
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(eq(spaces.workspaceId, workspaceId), inArray(taskDependencies.type, ['blocks', 'blocked_by'])))

    const blockedSet = new Set<string>()
    for (const d of depRows) {
      const blockedId = d.type === 'blocks' ? d.relatedTaskId : d.taskId
      const blockerId = d.type === 'blocks' ? d.taskId : d.relatedTaskId
      const blockerStatus = statusById.get(blockerId)
      if (blockerStatus && blockerStatus !== 'closed') blockedSet.add(blockedId)
    }

    const activityRows = await this.db
      .select({
        projectId: lists.projectId,
        count: sql<number>`count(${taskActivity.id})::int`,
      })
      .from(taskActivity)
      .innerJoin(tasks, eq(tasks.id, taskActivity.taskId))
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(eq(spaces.workspaceId, workspaceId), gte(taskActivity.createdAt, activitySince)))
      .groupBy(lists.projectId)
    const activityByProject = new Map(activityRows.map((r) => [r.projectId, r.count]))

    type PHRow = (typeof taskRows)[number]
    const byProject = new Map<string, PHRow[]>()
    for (const t of taskRows) {
      const arr = byProject.get(t.projectId) ?? []
      arr.push(t)
      byProject.set(t.projectId, arr)
    }

    const W = { onTime: 0.35, overdue: 0.3, blockers: 0.15, activity: 0.2 }
    const isClosed = (t: PHRow) => t.statusCategory === 'closed' || t.status === 'done'

    const results = projectRows.map((p) => {
      const ts = byProject.get(p.id) ?? []
      const total = ts.length
      const completed = ts.filter(isClosed)
      const open = ts.filter((t) => !isClosed(t))
      const openCount = open.length

      const completedWithDue = completed.filter((t) => t.dueDate && t.completedAt)
      const onTimeCount = completedWithDue.filter(
        (t) => new Date(t.completedAt as Date) <= new Date(t.dueDate as Date),
      ).length
      const onTimeScore =
        completedWithDue.length > 0 ? onTimeCount / completedWithDue.length : completed.length > 0 ? 1 : 0.6

      const overdueOpen = open.filter((t) => t.dueDate && new Date(t.dueDate).getTime() < now).length
      const overdueScore = openCount > 0 ? 1 - overdueOpen / openCount : 1

      const blockedOpen = open.filter((t) => blockedSet.has(t.id)).length
      const blockerScore = openCount > 0 ? 1 - blockedOpen / openCount : 1

      const recentActivity = activityByProject.get(p.id) ?? 0
      const activityScore = openCount > 0 ? Math.min(1, recentActivity / openCount) : 1

      const raw =
        onTimeScore * W.onTime + overdueScore * W.overdue + blockerScore * W.blockers + activityScore * W.activity
      const score = total === 0 ? 0 : Math.round(raw * 100)
      const band = total === 0 ? 'empty' : score >= 75 ? 'green' : score >= 50 ? 'yellow' : 'red'

      return {
        projectId: p.id,
        name: p.name,
        color: p.color,
        score,
        band,
        total,
        open: openCount,
        completed: completed.length,
        overdueOpen,
        blockedOpen,
        recentActivity,
        components: {
          onTime: Math.round(onTimeScore * 100),
          overdue: Math.round(overdueScore * 100),
          blockers: Math.round(blockerScore * 100),
          activity: Math.round(activityScore * 100),
        },
      }
    })

    // Healthiest first; empty projects (score 0) naturally sink to the bottom.
    results.sort((a, b) => b.score - a.score)
    return results
  }

  /**
   * Workspace-wide recent task activity feed (§9.1). Unlike /notifications
   * (per-user), this returns the latest task_activity events across the whole
   * workspace with actor + task context for linking.
   */
  async getWorkspaceActivity(workspaceId: string, limit = 20) {
    const safeLimit = Math.min(Math.max(limit, 1), 100)
    const rows = await this.db
      .select({
        id: taskActivity.id,
        action: taskActivity.action,
        meta: taskActivity.meta,
        createdAt: taskActivity.createdAt,
        taskId: tasks.id,
        taskTitle: tasks.title,
        actorId: users.id,
        actorName: users.displayName,
        actorAvatarUrl: users.avatarUrl,
        listId: lists.id,
        listName: lists.name,
        projectId: projects.id,
        projectName: projects.name,
        spaceId: spaces.id,
        spaceName: spaces.name,
      })
      .from(taskActivity)
      .innerJoin(tasks, eq(tasks.id, taskActivity.taskId))
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .leftJoin(users, eq(users.id, taskActivity.actorId))
      .where(eq(spaces.workspaceId, workspaceId))
      .orderBy(desc(taskActivity.createdAt))
      .limit(safeLimit)
    return rows
  }

  // ─── Custom report builder (real metrics × dimension × filters) ────────────
  async runCustomReport(workspaceId: string, def: ReportDefinition): Promise<ReportResult> {
    const days = typeof def.days === 'number' && def.days > 0 ? def.days : 30
    const since = daysAgo(days)
    const dimension =
      (def.dimension ?? def.dimensions?.[0] ?? 'assignee') as (typeof SUPPORTED_DIMENSIONS)[number]
    const requested = (def.metrics ?? []).filter((m) =>
      (SUPPORTED_METRICS as readonly string[]).includes(m),
    )
    const metrics = requested.length ? requested : ['tasks-count']
    const want = new Set(metrics)
    const filters = Array.isArray(def.filters) ? def.filters : []

    // Base task set for the workspace within the date window.
    const taskRows = await this.db
      .select({
        id: tasks.id,
        status: tasks.status,
        statusCategory: tasks.statusCategory,
        priority: tasks.priority,
        createdAt: tasks.createdAt,
        dueDate: tasks.dueDate,
        completedAt: tasks.completedAt,
        projectId: projects.id,
        projectName: projects.name,
      })
      .from(tasks)
      .innerJoin(lists, eq(tasks.listId, lists.id))
      .innerJoin(projects, eq(lists.projectId, projects.id))
      .innerJoin(spaces, eq(projects.spaceId, spaces.id))
      .where(and(eq(spaces.workspaceId, workspaceId), gte(tasks.createdAt, since)))

    const taskIds = taskRows.map((t) => t.id)
    type TaskRow = (typeof taskRows)[number]

    // Assignees (needed for the assignee dimension and assignee filters).
    const assigneesByTask = new Map<string, Array<{ userId: string; name: string }>>()
    if (taskIds.length) {
      const rows = await this.db
        .select({ taskId: taskAssignees.taskId, userId: users.id, name: users.displayName, email: users.email })
        .from(taskAssignees)
        .innerJoin(users, eq(users.id, taskAssignees.userId))
        .where(inArray(taskAssignees.taskId, taskIds))
      for (const r of rows) {
        const list = assigneesByTask.get(r.taskId) ?? []
        list.push({ userId: r.userId, name: r.name || r.email })
        assigneesByTask.set(r.taskId, list)
      }
    }

    // Labels (only when grouping by label).
    const labelsByTask = new Map<string, Array<{ id: string; name: string }>>()
    if (dimension === 'label' && taskIds.length) {
      const rows = await this.db
        .select({ taskId: taskLabelAssignments.taskId, id: labels.id, name: labels.name })
        .from(taskLabelAssignments)
        .innerJoin(labels, eq(labels.id, taskLabelAssignments.labelId))
        .where(inArray(taskLabelAssignments.taskId, taskIds))
      for (const r of rows) {
        const list = labelsByTask.get(r.taskId) ?? []
        list.push({ id: r.id, name: r.name })
        labelsByTask.set(r.taskId, list)
      }
    }

    // Time entries (only when a time metric is requested).
    const timeByTask = new Map<string, { total: number; billable: number }>()
    if ((want.has('time-logged') || want.has('billable-hours')) && taskIds.length) {
      const rows = await this.db
        .select({ taskId: timeEntries.taskId, durationSec: timeEntries.durationSec, isBillable: timeEntries.isBillable })
        .from(timeEntries)
        .where(inArray(timeEntries.taskId, taskIds))
      for (const r of rows) {
        const sec = r.durationSec ?? 0
        const cur = timeByTask.get(r.taskId) ?? { total: 0, billable: 0 }
        cur.total += sec
        if (r.isBillable) cur.billable += sec
        timeByTask.set(r.taskId, cur)
      }
    }

    // Sprint membership + points (sprint dimension or velocity metric).
    const sprintByTask = new Map<string, { id: string; name: string; points: number }>()
    if ((dimension === 'sprint' || want.has('sprint-velocity')) && taskIds.length) {
      const rows = await this.db
        .select({ taskId: sprintTasks.taskId, sprintId: sprints.id, sprintName: sprints.name, points: sprintTasks.storyPoints })
        .from(sprintTasks)
        .innerJoin(sprints, eq(sprints.id, sprintTasks.sprintId))
        .where(inArray(sprintTasks.taskId, taskIds))
      for (const r of rows) {
        sprintByTask.set(r.taskId, { id: r.sprintId, name: r.sprintName, points: r.points ?? 0 })
      }
    }

    // Apply filters as task predicates.
    const filtered = taskRows.filter((t) => {
      for (const f of filters) {
        const field = (f.field ?? '').toLowerCase()
        const val = (f.value ?? '').toLowerCase().trim()
        if (!field || !val) continue
        if (field === 'priority' && (t.priority ?? '').toLowerCase() !== val) return false
        if (field === 'status' && (t.status ?? '').toLowerCase() !== val) return false
        if (field === 'project' && (t.projectName ?? '').toLowerCase() !== val) return false
        if (field === 'assignee') {
          const names = (assigneesByTask.get(t.id) ?? []).map((a) => a.name.toLowerCase())
          if (!names.includes(val)) return false
        }
      }
      return true
    })

    // Group by the chosen dimension (1:many dims fan a task into each group).
    const groups = new Map<string, { key: string; label: string; tasks: TaskRow[] }>()
    const add = (key: string, label: string, t: TaskRow) => {
      const g = groups.get(key)
      if (g) g.tasks.push(t)
      else groups.set(key, { key, label, tasks: [t] })
    }
    for (const t of filtered) {
      switch (dimension) {
        case 'assignee': {
          const as = assigneesByTask.get(t.id) ?? []
          if (as.length === 0) add('unassigned', 'Unassigned', t)
          else for (const a of as) add(a.userId, a.name, t)
          break
        }
        case 'label': {
          const ls = labelsByTask.get(t.id) ?? []
          if (ls.length === 0) add('none', 'No label', t)
          else for (const l of ls) add(l.id, l.name, t)
          break
        }
        case 'status':
          add(t.status, t.status, t)
          break
        case 'priority':
          add(t.priority ?? 'normal', t.priority ?? 'normal', t)
          break
        case 'project':
          add(t.projectId, t.projectName ?? 'Unknown', t)
          break
        case 'sprint': {
          const s = sprintByTask.get(t.id)
          if (!s) add('none', 'No sprint', t)
          else add(s.id, s.name, t)
          break
        }
        case 'date-week':
          add(isoWeekKey(new Date(t.createdAt)), isoWeekKey(new Date(t.createdAt)), t)
          break
        case 'date-month':
          add(monthKey(new Date(t.createdAt)), monthKey(new Date(t.createdAt)), t)
          break
        default:
          add('all', 'All', t)
      }
    }

    const rows = [...groups.values()].map((g) => {
      const completed = g.tasks.filter((t) => t.statusCategory === 'closed' || !!t.completedAt)
      const values: Record<string, number> = {}
      if (want.has('tasks-count')) values['tasks-count'] = g.tasks.length
      if (want.has('tasks-completed')) values['tasks-completed'] = completed.length
      if (want.has('on-time-rate')) {
        const onTime = completed.filter(
          (t) => t.completedAt && t.dueDate && new Date(t.completedAt) <= new Date(t.dueDate),
        ).length
        values['on-time-rate'] = completed.length ? Math.round((onTime / completed.length) * 100) : 0
      }
      if (want.has('cycle-time')) {
        const durations = completed
          .filter((t) => t.completedAt)
          .map((t) => (new Date(t.completedAt as Date).getTime() - new Date(t.createdAt).getTime()) / 86400000)
        values['cycle-time'] = durations.length
          ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10
          : 0
      }
      if (want.has('time-logged')) {
        const sec = g.tasks.reduce((a, t) => a + (timeByTask.get(t.id)?.total ?? 0), 0)
        values['time-logged'] = Math.round((sec / 3600) * 10) / 10
      }
      if (want.has('billable-hours')) {
        const sec = g.tasks.reduce((a, t) => a + (timeByTask.get(t.id)?.billable ?? 0), 0)
        values['billable-hours'] = Math.round((sec / 3600) * 10) / 10
      }
      if (want.has('sprint-velocity')) {
        values['sprint-velocity'] =
          Math.round(completed.reduce((a, t) => a + (sprintByTask.get(t.id)?.points ?? 0), 0) * 10) / 10
      }
      return { key: g.key, label: g.label, values }
    })

    const primary = metrics[0]
    rows.sort((a, b) => (b.values[primary] ?? 0) - (a.values[primary] ?? 0))

    return { dimension, metrics, generatedAt: new Date().toISOString(), rows }
  }

  async exportCustomReportCsv(workspaceId: string, def: ReportDefinition): Promise<string> {
    const result = await this.runCustomReport(workspaceId, def)
    return reportResultToCsv(result)
  }

  /** Render a custom report to a server-generated PDF (Plan §9). */
  async exportCustomReportPdf(workspaceId: string, def: ReportDefinition): Promise<Buffer> {
    const result = await this.runCustomReport(workspaceId, def)
    const header = ['Group', ...result.metrics]
    const rows = result.rows.map((r) => [r.label, ...result.metrics.map((m) => r.values[m] ?? 0)])
    const title = `Custom report — by ${result.dimension}`
    const subtitle = `Generated ${new Date(result.generatedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC`
    return renderReportPdf(title, [subtitle, '', ...tableToLines(header, rows)])
  }

  // ─── Saved report definitions ─────────────────────────────────────────────
  listSavedReports(workspaceId: string) {
    return this.db
      .select()
      .from(customReports)
      .where(eq(customReports.workspaceId, workspaceId))
      .orderBy(desc(customReports.createdAt))
  }

  async createSavedReport(
    workspaceId: string,
    userId: string,
    name: string,
    definition: ReportDefinition,
    schedule?: ReportScheduleInput,
  ) {
    const sched = normalizeScheduleInput(schedule)
    const [row] = await this.db
      .insert(customReports)
      .values({
        workspaceId,
        createdById: userId,
        name: name?.trim() || 'Untitled report',
        definition,
        ...(sched ?? {}),
      })
      .returning()
    return row
  }

  async updateSavedReport(
    workspaceId: string,
    id: string,
    patch: { name?: string; definition?: ReportDefinition; schedule?: ReportScheduleInput },
  ) {
    const set: Record<string, unknown> = { updatedAt: new Date() }
    if (patch.name !== undefined) set.name = patch.name.trim() || 'Untitled report'
    if (patch.definition !== undefined) set.definition = patch.definition
    const sched = normalizeScheduleInput(patch.schedule)
    if (sched) {
      set.scheduleFrequency = sched.scheduleFrequency
      set.scheduleHour = sched.scheduleHour
      set.scheduleDayOfWeek = sched.scheduleDayOfWeek
      set.scheduleRecipients = sched.scheduleRecipients
    }
    const [row] = await this.db
      .update(customReports)
      .set(set)
      .where(and(eq(customReports.id, id), eq(customReports.workspaceId, workspaceId)))
      .returning()
    if (!row) throw new NotFoundException('Report not found')
    return row
  }

  async deleteSavedReport(workspaceId: string, id: string) {
    const [row] = await this.db
      .delete(customReports)
      .where(and(eq(customReports.id, id), eq(customReports.workspaceId, workspaceId)))
      .returning()
    if (!row) throw new NotFoundException('Report not found')
    return { ok: true }
  }

  // ─── Contribution analytics (§7.14) ────────────────────────────────────────

  /** Resolve the reporting window for a contribution report (month or sprint). */
  private async resolveContributionPeriod(
    workspaceId: string,
    period: ContributionPeriodType,
    sprintId: string | undefined,
    now: Date,
  ): Promise<{ from: Date; to: Date; meta: ContributionPeriod }> {
    if (period === 'sprint') {
      const rows = sprintId
        ? await this.db
            .select()
            .from(sprints)
            .where(and(eq(sprints.id, sprintId), eq(sprints.workspaceId, workspaceId)))
            .limit(1)
        : await this.db
            .select()
            .from(sprints)
            .where(and(eq(sprints.workspaceId, workspaceId), eq(sprints.status, 'active')))
            .orderBy(desc(sprints.startDate))
            .limit(1)
      const s = rows[0]
      if (s) {
        const from = new Date(s.startDate)
        const to = s.endDate ? new Date(s.endDate) : now
        return {
          from,
          to,
          meta: { type: 'sprint', sprintId: s.id, from: from.toISOString(), to: to.toISOString(), label: `Sprint: ${s.name}` },
        }
      }
      // No sprint available — fall back to the current month.
      const mr = monthPeriodRange('this-month', now)
      return {
        from: mr.from,
        to: mr.to,
        meta: { type: 'sprint', from: mr.from.toISOString(), to: mr.to.toISOString(), label: 'No active sprint — this month' },
      }
    }
    const mr = monthPeriodRange(period, now)
    return {
      from: mr.from,
      to: mr.to,
      meta: { type: period, from: mr.from.toISOString(), to: mr.to.toISOString(), label: mr.label },
    }
  }

  /**
   * Per-member contribution factors over a period (§7.14): tasks completed,
   * on-time rate, collaboration touchpoints (comments/assignments/coordination
   * activity), and blockers resolved — all from real data — plus a composite
   * score and an AI narrative per member (deterministic fallback). `restrictToUserId`
   * scopes non-privileged viewers to their own row.
   */
  async getContribution(
    workspaceId: string,
    opts: { period?: ContributionPeriodType; sprintId?: string; restrictToUserId?: string } = {},
    ctx: { userId?: string } = {},
  ): Promise<{ period: ContributionPeriod; source: 'ai' | 'heuristic'; members: Array<ContributionFactors & { narrative: string }> }> {
    const now = new Date()
    const period = opts.period ?? 'this-month'
    const { from, to, meta } = await this.resolveContributionPeriod(workspaceId, period, opts.sprintId, now)

    const members = await this.db
      .select({ userId: users.id, name: users.displayName, email: users.email })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(
        opts.restrictToUserId
          ? and(eq(workspaceMembers.workspaceId, workspaceId), eq(users.id, opts.restrictToUserId))
          : eq(workspaceMembers.workspaceId, workspaceId),
      )

    // Completed / on-time / assigned counts per assignee within the window.
    // Bind the window bounds as ISO strings: a raw ${date} embed in a sql template
    // carries no column type, so the driver would mishandle a bare Date — Postgres
    // casts the string param to timestamptz in the comparison.
    const fromIso = from.toISOString()
    const toIso = to.toISOString()
    const completedRows = await this.db
      .select({
        userId: taskAssignees.userId,
        completed: sql<number>`count(distinct case when ${tasks.status} = 'done' and ${tasks.completedAt} >= ${fromIso} and ${tasks.completedAt} <= ${toIso} then ${tasks.id} end)::int`,
        onTime: sql<number>`count(distinct case when ${tasks.status} = 'done' and ${tasks.completedAt} >= ${fromIso} and ${tasks.completedAt} <= ${toIso} and ${tasks.dueDate} is not null and ${tasks.completedAt} <= ${tasks.dueDate} then ${tasks.id} end)::int`,
        assigned: sql<number>`count(distinct case when ${tasks.updatedAt} >= ${fromIso} and ${tasks.updatedAt} <= ${toIso} then ${tasks.id} end)::int`,
      })
      .from(taskAssignees)
      .innerJoin(tasks, eq(tasks.id, taskAssignees.taskId))
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(eq(spaces.workspaceId, workspaceId), eq(tasks.isArchived, false)))
      .groupBy(taskAssignees.userId)

    // Collaboration + blockers-resolved from the activity log, per actor.
    const activityRows = await this.db
      .select({
        actorId: taskActivity.actorId,
        action: taskActivity.action,
        count: sql<number>`count(*)::int`,
      })
      .from(taskActivity)
      .innerJoin(tasks, eq(tasks.id, taskActivity.taskId))
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(eq(spaces.workspaceId, workspaceId), gte(taskActivity.createdAt, from), lte(taskActivity.createdAt, to)))
      .groupBy(taskActivity.actorId, taskActivity.action)

    const completedByUser = new Map(completedRows.map((r) => [r.userId, r]))
    const collabByUser = new Map<string, number>()
    const blockersByUser = new Map<string, number>()
    for (const r of activityRows) {
      if (!r.actorId) continue
      if (COLLABORATION_ACTIONS.has(r.action)) {
        collabByUser.set(r.actorId, (collabByUser.get(r.actorId) ?? 0) + r.count)
      }
      if (r.action === 'dependency_removed') {
        blockersByUser.set(r.actorId, (blockersByUser.get(r.actorId) ?? 0) + r.count)
      }
    }

    const factors: ContributionFactors[] = members.map((m) => {
      const c = completedByUser.get(m.userId)
      const tasksCompleted = c?.completed ?? 0
      const onTimeRate = tasksCompleted > 0 ? Math.round(((c?.onTime ?? 0) / tasksCompleted) * 100) : 0
      const collaboration = collabByUser.get(m.userId) ?? 0
      const blockersResolved = blockersByUser.get(m.userId) ?? 0
      const score = scoreContribution({ tasksCompleted, onTimeRate, collaboration, blockersResolved })
      return {
        userId: m.userId,
        name: m.name ?? m.email ?? 'Unknown',
        email: m.email ?? null,
        tasksCompleted,
        tasksAssigned: c?.assigned ?? 0,
        onTimeRate,
        collaboration,
        blockersResolved,
        score,
      }
    })
    factors.sort((a, b) => b.score - a.score || b.tasksCompleted - a.tasksCompleted)

    // AI narrative per member (one model call; deterministic fallback each).
    const items = factors.map((f) => ({
      key: f.userId,
      name: f.name,
      facts: `completed ${f.tasksCompleted} tasks, ${f.onTimeRate}% on time, ${f.collaboration} collaboration touchpoints, ${f.blockersResolved} blockers resolved`,
      fallback: contributionNarrativeFallback(f),
    }))
    const narratives = this.ai
      ? await this.ai.narrateContributions(items, { userId: ctx.userId, workspaceId })
      : Object.fromEntries(items.map((it) => [it.key, it.fallback]))
    const source: 'ai' | 'heuristic' = this.ai?.isAvailable() ? 'ai' : 'heuristic'

    return {
      period: meta,
      source,
      members: factors.map((f) => ({ ...f, narrative: narratives[f.userId] ?? contributionNarrativeFallback(f) })),
    }
  }

  /** Render a contribution report to a server-generated PDF (§7.14). */
  async exportContributionPdf(
    workspaceId: string,
    opts: { period?: ContributionPeriodType; sprintId?: string } = {},
    ctx: { userId?: string } = {},
  ): Promise<Buffer> {
    const report = await this.getContribution(workspaceId, opts, ctx)
    const header = ['Member', 'Completed', 'On-time %', 'Collab', 'Blockers', 'Score']
    const rows = report.members.map((m) => [
      m.name,
      m.tasksCompleted,
      m.onTimeRate,
      m.collaboration,
      m.blockersResolved,
      m.score,
    ])
    const narrativeLines = report.members.flatMap((m) => [`- ${m.name}: ${m.narrative}`])
    const lines = [
      `Period: ${report.period.label}`,
      `Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`,
      '',
      ...tableToLines(header, rows),
      '',
      'Narratives:',
      ...narrativeLines,
    ]
    return renderReportPdf('Contribution report', lines)
  }
}

function humanizeRole(role?: string | null): string {
  if (!role) return 'Member'
  switch (role) {
    case 'workspace_admin':
      return 'Admin'
    case 'manager':
      return 'Manager'
    case 'guest':
      return 'Guest'
    case 'super_admin':
      return 'Super admin'
    case 'member':
      return 'Member'
    default:
      return role.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
  }
}

import { Injectable, Inject, NotFoundException } from '@nestjs/common'
import { and, eq, gte, sql, desc, inArray } from 'drizzle-orm'
import {
  tasks,
  taskAssignees,
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
  customReports,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

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

@Injectable()
export class ReportsService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  // ─── Overview / Summary card ──────────────────────────────────────────────
  async getOverview(workspaceId: string) {
    const allTasksQuery = await this.db
      .select({
        id: tasks.id,
        status: tasks.status,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        completedAt: tasks.completedAt,
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
    const dueToday = allTasksQuery.filter((t) => {
      if (!t.dueDate) return false
      const d = new Date(t.dueDate)
      return d.toDateString() === now.toDateString() && t.status !== 'done'
    }).length

    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0

    const byPriority: Record<string, number> = { urgent: 0, high: 0, normal: 0, low: 0 }
    for (const t of allTasksQuery) {
      if (t.status === 'done' || t.status === 'cancelled') continue
      const key = (t.priority ?? 'normal') as keyof typeof byPriority
      if (key in byPriority) byPriority[key]++
    }

    return { total, completed, overdue, dueToday, completionRate, byPriority }
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

  async getProductivity(workspaceId: string, days = 30, restrictToUserId?: string) {
    const since = daysAgo(days)

    const rows = await this.db
      .select({
        userId: users.id,
        displayName: users.displayName,
        email: users.email,
        avatarUrl: users.avatarUrl,
        tasksCompleted: sql<number>`count(distinct case when ${tasks.status} = 'done' then ${tasks.id} end)::int`,
        tasksCreated: sql<number>`count(distinct case when ${tasks.createdById} = ${users.id} then ${tasks.id} end)::int`,
        totalAssigned: sql<number>`count(distinct ${tasks.id})::int`,
      })
      .from(users)
      .innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
      .leftJoin(taskAssignees, eq(taskAssignees.userId, users.id))
      .leftJoin(tasks, and(eq(tasks.id, taskAssignees.taskId), gte(tasks.updatedAt, since)))
      .where(
        restrictToUserId
          ? and(eq(workspaceMembers.workspaceId, workspaceId), eq(users.id, restrictToUserId))
          : eq(workspaceMembers.workspaceId, workspaceId),
      )
      .groupBy(users.id, users.displayName, users.email, users.avatarUrl)
      .orderBy(desc(sql`count(distinct case when ${tasks.status} = 'done' then ${tasks.id} end)`))

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
    const header = ['group', ...result.metrics]
    const lines = [header.map(csvCell).join(',')]
    for (const r of result.rows) {
      lines.push([csvCell(r.label), ...result.metrics.map((m) => csvCell(r.values[m] ?? 0))].join(','))
    }
    return lines.join('\n')
  }

  // ─── Saved report definitions ─────────────────────────────────────────────
  listSavedReports(workspaceId: string) {
    return this.db
      .select()
      .from(customReports)
      .where(eq(customReports.workspaceId, workspaceId))
      .orderBy(desc(customReports.createdAt))
  }

  async createSavedReport(workspaceId: string, userId: string, name: string, definition: ReportDefinition) {
    const [row] = await this.db
      .insert(customReports)
      .values({ workspaceId, createdById: userId, name: name?.trim() || 'Untitled report', definition })
      .returning()
    return row
  }

  async updateSavedReport(
    workspaceId: string,
    id: string,
    patch: { name?: string; definition?: ReportDefinition },
  ) {
    const set: Record<string, unknown> = { updatedAt: new Date() }
    if (patch.name !== undefined) set.name = patch.name.trim() || 'Untitled report'
    if (patch.definition !== undefined) set.definition = patch.definition
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

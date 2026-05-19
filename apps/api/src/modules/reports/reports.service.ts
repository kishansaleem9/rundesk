import { Injectable, Inject } from '@nestjs/common'
import { and, eq, gte, sql, desc } from 'drizzle-orm'
import {
  tasks,
  taskAssignees,
  users,
  workspaceMembers,
  timeEntries,
  sprints,
  sprintTasks,
  goals,
  lists,
  projects,
  spaces,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

function daysAgo(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d
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
  async getProductivity(workspaceId: string, days = 30) {
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
      .where(eq(workspaceMembers.workspaceId, workspaceId))
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
  async getTimeReport(workspaceId: string, days = 30) {
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
      .where(eq(workspaceMembers.workspaceId, workspaceId))
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

import { Injectable, Inject } from '@nestjs/common'
import { and, eq, gte, lte, sql, desc, count, sum, isNotNull } from 'drizzle-orm'
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
    // Get all tasks in workspace (via spaces → projects → lists → tasks)
    const allTasksQuery = await this.db
      .select({ id: tasks.id, status: tasks.status, dueDate: tasks.dueDate, completedAt: tasks.completedAt })
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

    return { total, completed, overdue, dueToday, completionRate }
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
        const storyPoints = await this.db
          .select({ total: sql<number>`coalesce(sum(story_points), 0)::int` })
          .from(sprintTasks)
          .where(eq(sprintTasks.sprintId, sprint.id))
        const totalPoints = storyPoints[0]?.total ?? 0
        return {
          sprintId: sprint.id,
          name: sprint.name,
          startDate: sprint.startDate,
          endDate: sprint.endDate,
          status: sprint.status,
          taskCount: taskRows.length,
          plannedPoints: totalPoints,
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
}

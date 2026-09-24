import { Injectable, Inject, NotFoundException } from '@nestjs/common'
import { eq, and, desc, asc, inArray, type SQL } from 'drizzle-orm'
import { sprints, sprintTasks, tasks, lists, projects, spaces } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import type { SprintStatus } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { resolveIsManager, taskVisibilityFilter } from '../../common/permissions/item-visibility'
import { containerVisibilityFilter } from '../../common/permissions/container-access.guard-helper'
import { isUuid } from '../../common/validation/uuid'

function isTaskDone(status: string, statusCategory: string) {
  return statusCategory === 'closed' || status === 'done'
}

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function endOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

function eachDayInclusive(start: Date, end: Date) {
  const days: Date[] = []
  const cur = startOfDay(start)
  const last = startOfDay(end)
  while (cur <= last) {
    days.push(new Date(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

@Injectable()
export class SprintsService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  /**
   * A sprint's tasks: only its own workspace's (a row made before `addTask`
   * checked could point anywhere, and the join showed another workspace's
   * title), as `visFilter` lets the reader see them.
   */
  private async loadSprintTaskRows(sprintIds: string[], workspaceId: string, visFilter?: SQL) {
    if (sprintIds.length === 0) return []
    return this.db
      .select({
        sprintId: sprintTasks.sprintId,
        taskId: tasks.id,
        title: tasks.title,
        status: tasks.status,
        statusCategory: tasks.statusCategory,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        storyPoints: sprintTasks.storyPoints,
        completedAt: tasks.completedAt,
      })
      .from(sprintTasks)
      .innerJoin(tasks, eq(tasks.id, sprintTasks.taskId))
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(inArray(sprintTasks.sprintId, sprintIds), eq(spaces.workspaceId, workspaceId), visFilter))
      .orderBy(asc(sprintTasks.addedAt))
  }

  /**
   * What of a sprint's workspace the actor may see: the container rule and the
   * §2 private-item rule (only the second applied, and a refused space's task
   * was listed by title). Over `tasks`, `projects` and `spaces` unaliased.
   * undefined = no restriction (no actor, or the actor is a manager).
   */
  private async sprintTaskVisFilter(
    workspaceId: string,
    actor?: { id: string; role?: string },
  ): Promise<SQL | undefined> {
    if (!actor) return undefined
    const isManager = await resolveIsManager(this.db, workspaceId, actor.id, actor.role)
    return and(containerVisibilityFilter(this.db, actor.id, isManager), taskVisibilityFilter(this.db, actor.id, isManager))
  }

  private aggregateStats(
    rows: Awaited<ReturnType<SprintsService['loadSprintTaskRows']>>,
  ) {
    const map = new Map<
      string,
      { taskCount: number; completedTasks: number; totalPoints: number; completedPoints: number }
    >()
    for (const row of rows) {
      const cur = map.get(row.sprintId) ?? {
        taskCount: 0,
        completedTasks: 0,
        totalPoints: 0,
        completedPoints: 0,
      }
      const pts = Number(row.storyPoints ?? 0)
      cur.taskCount += 1
      cur.totalPoints += pts
      if (isTaskDone(row.status, row.statusCategory)) {
        cur.completedTasks += 1
        cur.completedPoints += pts
      }
      map.set(row.sprintId, cur)
    }
    return map
  }

  private buildBurndown(
    sprint: { startDate: Date; endDate: Date },
    rows: Awaited<ReturnType<SprintsService['loadSprintTaskRows']>>,
  ) {
    const days = eachDayInclusive(sprint.startDate, sprint.endDate)
    if (days.length === 0) return []

    const totalPoints = rows.reduce((s, r) => s + Number(r.storyPoints ?? 0), 0)
    const today = startOfDay(new Date())

    return days.map((day, i) => {
      const dayEnd = endOfDay(day)
      const completedByDay = rows
        .filter((r) => {
          if (!isTaskDone(r.status, r.statusCategory)) return false
          if (!r.completedAt) return startOfDay(day) <= today
          return new Date(r.completedAt) <= dayEnd
        })
        .reduce((s, r) => s + Number(r.storyPoints ?? 0), 0)

      const ideal =
        days.length <= 1
          ? 0
          : Math.round(totalPoints - (totalPoints * i) / (days.length - 1))

      const actual = startOfDay(day) > today ? null : Math.max(0, totalPoints - completedByDay)

      return {
        day: day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        ideal,
        actual,
      }
    })
  }

  async list(workspaceId: string, actor?: { id: string; role?: string }) {
    const rows = await this.db
      .select()
      .from(sprints)
      .where(eq(sprints.workspaceId, workspaceId))
      .orderBy(desc(sprints.startDate))

    const visFilter = await this.sprintTaskVisFilter(workspaceId, actor)
    const taskRows = await this.loadSprintTaskRows(rows.map((s) => s.id), workspaceId, visFilter)
    const statsMap = this.aggregateStats(taskRows)

    return rows.map((s) => {
      const stats = statsMap.get(s.id) ?? {
        taskCount: 0,
        completedTasks: 0,
        totalPoints: 0,
        completedPoints: 0,
      }
      return { ...s, ...stats }
    })
  }

  async getDetail(sprintId: string, actor?: { id: string; role?: string }) {
    const sprint = await this.get(sprintId)
    const visFilter = await this.sprintTaskVisFilter(sprint.workspaceId, actor)
    const taskRows = await this.loadSprintTaskRows([sprintId], sprint.workspaceId, visFilter)
    const stats = this.aggregateStats(taskRows).get(sprintId) ?? {
      taskCount: 0,
      completedTasks: 0,
      totalPoints: 0,
      completedPoints: 0,
    }
    return {
      ...sprint,
      ...stats,
      burndown: this.buildBurndown(sprint, taskRows),
      tasks: taskRows.map((r) => ({
        id: r.taskId,
        title: r.title,
        status: r.status,
        statusCategory: r.statusCategory,
        priority: r.priority,
        dueDate: r.dueDate,
        storyPoints: r.storyPoints,
        completedAt: r.completedAt,
      })),
    }
  }

  async get(sprintId: string) {
    const [row] = await this.db.select().from(sprints).where(eq(sprints.id, sprintId))
    if (!row) throw new NotFoundException('Sprint not found')
    return row
  }

  async create(data: {
    workspaceId: string
    spaceId?: string | null
    name: string
    goal?: string
    startDate: Date
    endDate: Date
  }) {
    const [row] = await this.db
      .insert(sprints)
      .values({
        workspaceId: data.workspaceId,
        spaceId: data.spaceId ?? null,
        name: data.name,
        goal: data.goal,
        startDate: data.startDate,
        endDate: data.endDate,
      })
      .returning()
    return row
  }

  async update(
    sprintId: string,
    patch: {
      name?: string
      goal?: string | null
      status?: SprintStatus
      startDate?: Date
      endDate?: Date
    },
  ) {
    const set: Record<string, unknown> = { ...patch }
    if (patch.status === 'completed' || patch.status === 'cancelled') {
      set.closedAt = new Date()
    }
    const [row] = await this.db.update(sprints).set(set).where(eq(sprints.id, sprintId)).returning()
    if (!row) throw new NotFoundException('Sprint not found')
    return row
  }

  async delete(sprintId: string) {
    await this.db.delete(sprints).where(eq(sprints.id, sprintId))
    return { ok: true }
  }

  async listTasks(sprintId: string, actor?: { id: string; role?: string }) {
    const sprint = await this.get(sprintId)
    const visFilter = await this.sprintTaskVisFilter(sprint.workspaceId, actor)
    const rows = await this.loadSprintTaskRows([sprintId], sprint.workspaceId, visFilter)
    return rows.map((r) => ({
      id: r.taskId,
      title: r.title,
      status: r.status,
      statusCategory: r.statusCategory,
      priority: r.priority,
      dueDate: r.dueDate,
      storyPoints: r.storyPoints,
      completedAt: r.completedAt,
    }))
  }

  async addTask(sprintId: string, taskId: string, storyPoints: number | undefined, actor: { id: string; role?: string }) {
    // A task of the sprint's own workspace that the actor may open, or not
    // found: adding took any id, and the sprint then listed the task's title
    // (measured, another workspace's task and a refused space's, 201 each).
    const sprint = await this.get(sprintId)
    if (typeof taskId !== 'string' || !isUuid(taskId)) throw new NotFoundException('Task not found')
    const [task] = await this.db
      .select({ id: tasks.id })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(eq(tasks.id, taskId), eq(spaces.workspaceId, sprint.workspaceId), await this.sprintTaskVisFilter(sprint.workspaceId, actor)))
      .limit(1)
    if (!task) throw new NotFoundException('Task not found')
    // When storyPoints is omitted (the common case) the conflict `set` would be
    // empty, which drizzle rejects ("No values to set") — so only update on
    // conflict when there's actually a value to write.
    if (storyPoints === undefined) {
      await this.db
        .insert(sprintTasks)
        .values({ sprintId, taskId })
        .onConflictDoNothing()
    } else {
      await this.db
        .insert(sprintTasks)
        .values({ sprintId, taskId, storyPoints })
        .onConflictDoUpdate({
          target: [sprintTasks.sprintId, sprintTasks.taskId],
          set: { storyPoints },
        })
    }
    return { ok: true }
  }

  async removeTask(sprintId: string, taskId: string) {
    await this.db
      .delete(sprintTasks)
      .where(and(eq(sprintTasks.sprintId, sprintId), eq(sprintTasks.taskId, taskId)))
    return { ok: true }
  }
}

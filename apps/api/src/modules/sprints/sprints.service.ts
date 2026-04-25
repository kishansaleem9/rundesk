import { Injectable, Inject, NotFoundException } from '@nestjs/common'
import { eq, and, desc, asc, sql } from 'drizzle-orm'
import { sprints, sprintTasks, tasks } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import type { SprintStatus } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

@Injectable()
export class SprintsService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  async list(workspaceId: string) {
    const rows = await this.db
      .select()
      .from(sprints)
      .where(eq(sprints.workspaceId, workspaceId))
      .orderBy(desc(sprints.startDate))

    const counts = await this.db
      .select({
        sprintId: sprintTasks.sprintId,
        totalPoints: sql<number>`COALESCE(SUM(${sprintTasks.storyPoints}), 0)`.as('total_points'),
        taskCount: sql<number>`COUNT(*)`.as('task_count'),
      })
      .from(sprintTasks)
      .groupBy(sprintTasks.sprintId)
    const countMap = new Map(counts.map((c) => [c.sprintId, c]))

    return rows.map((s) => {
      const c = countMap.get(s.id)
      return {
        ...s,
        taskCount: Number(c?.taskCount ?? 0),
        totalPoints: Number(c?.totalPoints ?? 0),
      }
    })
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

  async listTasks(sprintId: string) {
    return this.db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        storyPoints: sprintTasks.storyPoints,
      })
      .from(sprintTasks)
      .leftJoin(tasks, eq(tasks.id, sprintTasks.taskId))
      .where(eq(sprintTasks.sprintId, sprintId))
      .orderBy(asc(sprintTasks.addedAt))
  }

  async addTask(sprintId: string, taskId: string, storyPoints?: number) {
    await this.db
      .insert(sprintTasks)
      .values({ sprintId, taskId, storyPoints })
      .onConflictDoUpdate({
        target: [sprintTasks.sprintId, sprintTasks.taskId],
        set: { storyPoints },
      })
    return { ok: true }
  }

  async removeTask(sprintId: string, taskId: string) {
    await this.db
      .delete(sprintTasks)
      .where(and(eq(sprintTasks.sprintId, sprintId), eq(sprintTasks.taskId, taskId)))
    return { ok: true }
  }
}

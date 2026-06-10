import { Injectable, Inject, NotFoundException } from '@nestjs/common'
import { eq, and, desc, asc, isNull } from 'drizzle-orm'
import { goals, goalUpdates, goalKeyResults, users } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import type { GoalKind, GoalStatus } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

@Injectable()
export class GoalsService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  list(workspaceId: string, opts: { spaceId?: string | null; parentGoalId?: string | null } = {}) {
    const where = and(
      eq(goals.workspaceId, workspaceId),
      opts.spaceId === null ? isNull(goals.spaceId) : opts.spaceId ? eq(goals.spaceId, opts.spaceId) : undefined,
      opts.parentGoalId === null ? isNull(goals.parentGoalId) : opts.parentGoalId ? eq(goals.parentGoalId, opts.parentGoalId) : undefined,
    )
    return this.db
      .select({
        id: goals.id,
        workspaceId: goals.workspaceId,
        spaceId: goals.spaceId,
        parentGoalId: goals.parentGoalId,
        ownerId: goals.ownerId,
        ownerName: users.displayName,
        title: goals.title,
        description: goals.description,
        kind: goals.kind,
        targetValue: goals.targetValue,
        currentValue: goals.currentValue,
        unit: goals.unit,
        status: goals.status,
        startDate: goals.startDate,
        dueDate: goals.dueDate,
        completedAt: goals.completedAt,
        createdAt: goals.createdAt,
        updatedAt: goals.updatedAt,
      })
      .from(goals)
      .leftJoin(users, eq(users.id, goals.ownerId))
      .where(where)
      .orderBy(asc(goals.dueDate), desc(goals.createdAt))
  }

  async create(data: {
    workspaceId: string
    spaceId?: string | null
    parentGoalId?: string | null
    ownerId?: string | null
    title: string
    description?: string
    kind?: GoalKind
    targetValue?: number
    unit?: string
    startDate?: Date | null
    dueDate?: Date | null
  }) {
    const [row] = await this.db
      .insert(goals)
      .values({
        workspaceId: data.workspaceId,
        spaceId: data.spaceId ?? null,
        parentGoalId: data.parentGoalId ?? null,
        ownerId: data.ownerId ?? null,
        title: data.title,
        description: data.description,
        kind: data.kind ?? 'percentage',
        targetValue: data.targetValue ?? 100,
        unit: data.unit,
        startDate: data.startDate,
        dueDate: data.dueDate,
      })
      .returning()
    return row
  }

  async update(
    goalId: string,
    patch: {
      title?: string
      description?: string | null
      currentValue?: number
      targetValue?: number
      status?: GoalStatus
      ownerId?: string | null
      startDate?: Date | null
      dueDate?: Date | null
      completedAt?: Date | null
    },
    actorId: string,
  ) {
    const [existing] = await this.db.select().from(goals).where(eq(goals.id, goalId))
    if (!existing) throw new NotFoundException('Goal not found')

    const set: Record<string, unknown> = { ...patch, updatedAt: new Date() }
    if (typeof patch.currentValue === 'number' && patch.currentValue !== existing.currentValue) {
      await this.db.insert(goalUpdates).values({
        goalId,
        authorId: actorId,
        fromValue: existing.currentValue,
        toValue: patch.currentValue,
      })
      const target = patch.targetValue ?? existing.targetValue
      if (patch.currentValue >= target && existing.status !== 'completed') {
        set.status = 'completed'
        set.completedAt = new Date()
      }
    }

    const [row] = await this.db.update(goals).set(set).where(eq(goals.id, goalId)).returning()
    return row
  }

  async delete(goalId: string) {
    await this.db.delete(goals).where(eq(goals.id, goalId))
    return { ok: true }
  }

  history(goalId: string) {
    return this.db
      .select()
      .from(goalUpdates)
      .where(eq(goalUpdates.goalId, goalId))
      .orderBy(desc(goalUpdates.createdAt))
  }

  // ─── Single goal detail (goal + owner + key results) ───────────────────────
  async getOne(goalId: string) {
    const [goal] = await this.db
      .select({
        id: goals.id,
        workspaceId: goals.workspaceId,
        spaceId: goals.spaceId,
        parentGoalId: goals.parentGoalId,
        ownerId: goals.ownerId,
        owner: { id: users.id, displayName: users.displayName, avatarUrl: users.avatarUrl },
        title: goals.title,
        description: goals.description,
        kind: goals.kind,
        targetValue: goals.targetValue,
        currentValue: goals.currentValue,
        unit: goals.unit,
        status: goals.status,
        startDate: goals.startDate,
        dueDate: goals.dueDate,
        completedAt: goals.completedAt,
        createdAt: goals.createdAt,
        updatedAt: goals.updatedAt,
      })
      .from(goals)
      .leftJoin(users, eq(users.id, goals.ownerId))
      .where(eq(goals.id, goalId))
      .limit(1)
    if (!goal) throw new NotFoundException('Goal not found')
    const keyResults = await this.listKeyResults(goalId)
    return { ...goal, keyResults }
  }

  // ─── Key results (OKR sub-metrics) ─────────────────────────────────────────
  listKeyResults(goalId: string) {
    return this.db
      .select({
        id: goalKeyResults.id,
        goalId: goalKeyResults.goalId,
        ownerId: goalKeyResults.ownerId,
        ownerName: users.displayName,
        title: goalKeyResults.title,
        unit: goalKeyResults.unit,
        targetValue: goalKeyResults.targetValue,
        currentValue: goalKeyResults.currentValue,
        status: goalKeyResults.status,
        position: goalKeyResults.position,
        createdAt: goalKeyResults.createdAt,
        updatedAt: goalKeyResults.updatedAt,
      })
      .from(goalKeyResults)
      .leftJoin(users, eq(users.id, goalKeyResults.ownerId))
      .where(eq(goalKeyResults.goalId, goalId))
      .orderBy(asc(goalKeyResults.position), asc(goalKeyResults.createdAt))
  }

  async createKeyResult(
    goalId: string,
    data: { title: string; unit?: string; targetValue?: number; currentValue?: number; ownerId?: string | null },
  ) {
    const [goal] = await this.db.select({ workspaceId: goals.workspaceId }).from(goals).where(eq(goals.id, goalId)).limit(1)
    if (!goal) throw new NotFoundException('Goal not found')
    const [existing] = await this.db.select({ n: goalKeyResults.position }).from(goalKeyResults).where(eq(goalKeyResults.goalId, goalId)).orderBy(desc(goalKeyResults.position)).limit(1)
    const [row] = await this.db
      .insert(goalKeyResults)
      .values({
        goalId,
        workspaceId: goal.workspaceId,
        title: data.title,
        unit: data.unit,
        targetValue: data.targetValue ?? 100,
        currentValue: data.currentValue ?? 0,
        ownerId: data.ownerId ?? null,
        position: (existing?.n ?? -1) + 1,
      })
      .returning()
    return row
  }

  async updateKeyResult(
    krId: string,
    patch: { title?: string; unit?: string | null; targetValue?: number; currentValue?: number; status?: GoalStatus; ownerId?: string | null },
  ) {
    const [existing] = await this.db.select().from(goalKeyResults).where(eq(goalKeyResults.id, krId)).limit(1)
    if (!existing) throw new NotFoundException('Key result not found')
    const set: Record<string, unknown> = { ...patch, updatedAt: new Date() }
    if (typeof patch.currentValue === 'number') {
      const target = patch.targetValue ?? existing.targetValue
      if (patch.currentValue >= target) set.status = patch.status ?? 'completed'
    }
    const [row] = await this.db.update(goalKeyResults).set(set).where(eq(goalKeyResults.id, krId)).returning()
    return row
  }

  async deleteKeyResult(krId: string) {
    await this.db.delete(goalKeyResults).where(eq(goalKeyResults.id, krId))
    return { ok: true }
  }
}

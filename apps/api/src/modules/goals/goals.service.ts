import { Injectable, Inject, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common'
import { eq, and, desc, asc, isNull } from 'drizzle-orm'
import { goals, goalUpdates, goalKeyResults, spaces, users } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import type { GoalKind, GoalStatus } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { isUuid } from '../../common/validation/uuid'
import {
  goalReach,
  goalVisibilityFilter,
  mayReadGoalAt,
  readableGoal,
  type ReadActor,
} from '../../common/permissions/read-access'

const STATUSES: readonly GoalStatus[] = ['on_track', 'at_risk', 'off_track', 'completed']
const KINDS: readonly GoalKind[] = ['numeric', 'percentage', 'boolean']

/**
 * Every route reads and writes as the person calling it (`read-access.ts`:
 * a goal filed in a space is read by that space's rule, a guest reads none).
 * Measured before this, nothing did: a member of another organisation renamed
 * and deleted a workspace's key results through a goal of their own, and moved
 * their own goal into that workspace by patching its `workspaceId`
 * (`found-24-sep/goals-open-across-workspaces`).
 *
 * A goal the caller may not read answers not-found, the same as one that does
 * not exist, so a route never confirms what it refuses.
 */
@Injectable()
export class GoalsService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  async list(workspaceId: string, opts: { spaceId?: string | null; parentGoalId?: string | null }, actor: ReadActor) {
    const reach = await goalReach(this.db, workspaceId, actor)
    // A guest has no goal shared with them — goals are not shared here — so none.
    if (reach === 'none') return []
    // A filter that is not an id matches no goal (and is not handed to Postgres to refuse).
    if ((opts.spaceId && !isUuid(opts.spaceId)) || (opts.parentGoalId && !isUuid(opts.parentGoalId))) return []
    const where = and(
      eq(goals.workspaceId, workspaceId),
      opts.spaceId === null ? isNull(goals.spaceId) : opts.spaceId ? eq(goals.spaceId, opts.spaceId) : undefined,
      opts.parentGoalId === null ? isNull(goals.parentGoalId) : opts.parentGoalId ? eq(goals.parentGoalId, opts.parentGoalId) : undefined,
      reach === 'spaces' ? goalVisibilityFilter(this.db, actor.id) : undefined,
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

  async create(
    data: {
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
    },
    actor: ReadActor,
  ) {
    if ((await goalReach(this.db, data.workspaceId, actor)) === 'none') {
      throw new ForbiddenException('Guests cannot create goals')
    }
    if (typeof data.title !== 'string' || !data.title.trim()) throw new BadRequestException('A goal needs a title')
    if (data.kind !== undefined && !KINDS.includes(data.kind)) throw new BadRequestException('Unknown goal kind')
    this.assertNumber(data.targetValue, 'targetValue')

    // A sub-goal is filed where its parent is, unless it names a space itself —
    // so a goal made under a private space's goal is not the whole workspace's.
    let spaceId = data.spaceId ?? null
    if (data.parentGoalId) {
      const parent = await readableGoal(this.db, data.parentGoalId, actor)
      if (!parent || parent.workspaceId !== data.workspaceId) throw new NotFoundException('Parent goal not found')
      if (data.spaceId === undefined) spaceId = parent.spaceId
    }
    const at = { workspaceId: data.workspaceId, spaceId, spaceVisibility: await this.spaceVisibilityIn(data.workspaceId, spaceId) }
    if (spaceId && !(await mayReadGoalAt(this.db, at, actor))) throw new NotFoundException('Space not found')
    if (data.ownerId) await this.assertOwnerCanRead(at, data.ownerId)

    const [row] = await this.db
      .insert(goals)
      .values({
        workspaceId: data.workspaceId,
        spaceId,
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

  /**
   * Only the fields a goal's editor may change, each named. This spread the
   * request body into the row, so a PATCH could set `workspaceId` — measured:
   * a goal of another organisation's was moved into a workspace that way — or
   * `spaceId`, `parentGoalId`, `createdAt`.
   */
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
    },
    actor: ReadActor,
  ) {
    const goal = await this.goalOpenTo(goalId, actor)
    const [existing] = await this.db.select().from(goals).where(eq(goals.id, goal.id))
    if (!existing) throw new NotFoundException('Goal not found')

    const set: Record<string, unknown> = { updatedAt: new Date() }
    if (patch.title !== undefined) {
      if (typeof patch.title !== 'string' || !patch.title.trim()) throw new BadRequestException('A goal needs a title')
      set.title = patch.title
    }
    if (patch.description !== undefined) set.description = patch.description
    if (patch.status !== undefined) {
      if (!STATUSES.includes(patch.status)) throw new BadRequestException('Unknown goal status')
      set.status = patch.status
    }
    this.assertNumber(patch.currentValue, 'currentValue')
    this.assertNumber(patch.targetValue, 'targetValue')
    if (patch.targetValue !== undefined) set.targetValue = patch.targetValue
    if (patch.currentValue !== undefined) set.currentValue = patch.currentValue
    if (patch.startDate !== undefined) set.startDate = patch.startDate
    if (patch.dueDate !== undefined) set.dueDate = patch.dueDate
    if (patch.ownerId !== undefined) {
      if (patch.ownerId !== null) await this.assertOwnerCanRead(goal, patch.ownerId)
      set.ownerId = patch.ownerId
    }

    if (typeof patch.currentValue === 'number' && patch.currentValue !== existing.currentValue) {
      await this.db.insert(goalUpdates).values({
        goalId: goal.id,
        authorId: actor.id,
        fromValue: existing.currentValue,
        toValue: patch.currentValue,
      })
      const target = patch.targetValue ?? existing.targetValue
      if (patch.currentValue >= target && existing.status !== 'completed') {
        set.status = 'completed'
        set.completedAt = new Date()
      }
    }

    const [row] = await this.db.update(goals).set(set).where(eq(goals.id, goal.id)).returning()
    return row
  }

  async delete(goalId: string, actor: ReadActor) {
    const goal = await this.goalOpenTo(goalId, actor)
    await this.db.delete(goals).where(eq(goals.id, goal.id))
    return { ok: true }
  }

  async history(goalId: string, actor: ReadActor) {
    const goal = await this.goalOpenTo(goalId, actor)
    return this.db
      .select()
      .from(goalUpdates)
      .where(eq(goalUpdates.goalId, goal.id))
      .orderBy(desc(goalUpdates.createdAt))
  }

  // ─── Single goal detail (goal + owner + key results) ───────────────────────
  async getOne(goalId: string, actor: ReadActor) {
    const open = await this.goalOpenTo(goalId, actor)
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
      .where(eq(goals.id, open.id))
      .limit(1)
    if (!goal) throw new NotFoundException('Goal not found')
    const keyResults = await this.keyResultsOf(open.id)
    return { ...goal, keyResults }
  }

  // ─── Key results (OKR sub-metrics) ─────────────────────────────────────────
  async listKeyResults(goalId: string, actor: ReadActor) {
    const goal = await this.goalOpenTo(goalId, actor)
    return this.keyResultsOf(goal.id)
  }

  private keyResultsOf(goalId: string) {
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
    actor: ReadActor,
  ) {
    const goal = await this.goalOpenTo(goalId, actor)
    if (typeof data.title !== 'string' || !data.title.trim()) throw new BadRequestException('A key result needs a title')
    this.assertNumber(data.targetValue, 'targetValue')
    this.assertNumber(data.currentValue, 'currentValue')
    if (data.ownerId) await this.assertOwnerCanRead(goal, data.ownerId)
    const [existing] = await this.db.select({ n: goalKeyResults.position }).from(goalKeyResults).where(eq(goalKeyResults.goalId, goal.id)).orderBy(desc(goalKeyResults.position)).limit(1)
    const [row] = await this.db
      .insert(goalKeyResults)
      .values({
        goalId: goal.id,
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

  /**
   * A key result is addressed THROUGH its goal, and must be that goal's. The
   * route carried both ids and this read only the key result's, so the guard's
   * check of the goal was a check of whatever goal the caller named: their own.
   */
  async updateKeyResult(
    goalId: string,
    krId: string,
    patch: { title?: string; unit?: string | null; targetValue?: number; currentValue?: number; status?: GoalStatus; ownerId?: string | null },
    actor: ReadActor,
  ) {
    const goal = await this.goalOpenTo(goalId, actor)
    const existing = await this.keyResultOf(goal.id, krId)
    const set: Record<string, unknown> = { updatedAt: new Date() }
    if (patch.title !== undefined) {
      if (typeof patch.title !== 'string' || !patch.title.trim()) throw new BadRequestException('A key result needs a title')
      set.title = patch.title
    }
    if (patch.unit !== undefined) set.unit = patch.unit
    if (patch.status !== undefined) {
      if (!STATUSES.includes(patch.status)) throw new BadRequestException('Unknown key result status')
      set.status = patch.status
    }
    this.assertNumber(patch.targetValue, 'targetValue')
    this.assertNumber(patch.currentValue, 'currentValue')
    if (patch.targetValue !== undefined) set.targetValue = patch.targetValue
    if (patch.currentValue !== undefined) set.currentValue = patch.currentValue
    if (patch.ownerId !== undefined) {
      if (patch.ownerId !== null) await this.assertOwnerCanRead(goal, patch.ownerId)
      set.ownerId = patch.ownerId
    }
    if (typeof patch.currentValue === 'number') {
      const target = patch.targetValue ?? existing.targetValue
      if (patch.currentValue >= target) set.status = patch.status ?? 'completed'
    }
    const [row] = await this.db.update(goalKeyResults).set(set).where(eq(goalKeyResults.id, existing.id)).returning()
    return row
  }

  async deleteKeyResult(goalId: string, krId: string, actor: ReadActor) {
    const goal = await this.goalOpenTo(goalId, actor)
    const existing = await this.keyResultOf(goal.id, krId)
    await this.db.delete(goalKeyResults).where(eq(goalKeyResults.id, existing.id))
    return { ok: true }
  }

  // ─── Who may ───────────────────────────────────────────────────────────────

  private async goalOpenTo(goalId: string, actor: ReadActor) {
    const goal = await readableGoal(this.db, goalId, actor)
    if (!goal) throw new NotFoundException('Goal not found')
    return goal
  }

  private async keyResultOf(goalId: string, krId: string) {
    if (!isUuid(krId)) throw new NotFoundException('Key result not found')
    const [kr] = await this.db
      .select()
      .from(goalKeyResults)
      .where(and(eq(goalKeyResults.id, krId), eq(goalKeyResults.goalId, goalId)))
      .limit(1)
    if (!kr) throw new NotFoundException('Key result not found')
    return kr
  }

  /** The visibility of `spaceId` when it is a space of `workspaceId`; not-found otherwise. */
  private async spaceVisibilityIn(workspaceId: string, spaceId: string | null): Promise<string | null> {
    if (!spaceId) return null
    if (!isUuid(spaceId)) throw new NotFoundException('Space not found')
    const [space] = await this.db
      .select({ visibility: spaces.visibility })
      .from(spaces)
      .where(and(eq(spaces.id, spaceId), eq(spaces.workspaceId, workspaceId)))
      .limit(1)
    if (!space) throw new NotFoundException('Space not found')
    return space.visibility
  }

  /**
   * An owner answers for a goal, so it must be someone who can read it: a
   * member of its workspace (not a guest), and of its space when that is
   * private. Any user id was taken, from any organisation.
   */
  private async assertOwnerCanRead(
    at: { workspaceId: string; spaceId: string | null; spaceVisibility: string | null },
    ownerId: string,
  ) {
    if (!isUuid(ownerId) || !(await mayReadGoalAt(this.db, at, { id: ownerId }))) {
      throw new BadRequestException('The owner must be a member who can see this goal')
    }
  }

  private assertNumber(value: unknown, field: string) {
    if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value))) {
      throw new BadRequestException(`${field} must be a number`)
    }
  }
}

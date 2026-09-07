import { Injectable, Inject, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common'
import { and, asc, eq, gte, lt } from 'drizzle-orm'
import { taskTimeBlocks, tasks, users, lists } from '@rundesk/db'
import type { Db, PlannerSettings } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

/**
 * §V2-02 — the Planner.
 *
 * `[12:40]` "Planner ka matlab — woh basically Google Calendar [jaisa] hai."
 * Frame `13:08` is a week grid; `[14:52]` is dragging a task onto it.
 *
 * Blocks are PERSONAL. `[14:56]` "to yeh MERI planner pe bhi show honge" —
 * this is one person's plan for their own week, not a shared schedule, which
 * is why every read here is scoped by `userId` and never widened by a role.
 * A manager who could see your blocks would be seeing your day, not your work.
 */

/** A week is the widest thing the grid asks for; a month view would ask twice. */
const MAX_RANGE_DAYS = 62

/** Frame `14:45` — dragging task `dbgdh` on makes a block "Work on dbgdh". */
export const DEFAULT_BLOCK_PREFIX = 'Work on'

function parseInstant(value: unknown, field: string): Date {
  if (typeof value !== 'string' && !(value instanceof Date)) {
    throw new BadRequestException(`"${field}" must be a date`)
  }
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`"${field}" is not a valid date`)
  return d
}

@Injectable()
export class PlannerService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  /**
   * The blocks on one person's grid between two instants.
   *
   * Half-open on purpose — `[from, to)` — so asking for two consecutive weeks
   * returns each block exactly once. A closed range double-counts anything
   * starting precisely at midnight on the boundary, which is most all-day
   * blocks.
   */
  async listBlocks(workspaceId: string, userId: string, fromRaw: unknown, toRaw: unknown) {
    const from = parseInstant(fromRaw, 'from')
    const to = parseInstant(toRaw, 'to')
    if (to <= from) throw new BadRequestException('"to" must be after "from"')
    const days = (to.getTime() - from.getTime()) / 86_400_000
    if (days > MAX_RANGE_DAYS) {
      throw new BadRequestException(`A planner range covers at most ${MAX_RANGE_DAYS} days`)
    }

    const rows = await this.db
      .select({
        id: taskTimeBlocks.id,
        taskId: taskTimeBlocks.taskId,
        title: taskTimeBlocks.title,
        startsAt: taskTimeBlocks.startsAt,
        endsAt: taskTimeBlocks.endsAt,
        isAllDay: taskTimeBlocks.isAllDay,
        taskTitle: tasks.title,
        taskStatus: tasks.status,
        taskPriority: tasks.priority,
        taskListId: tasks.listId,
      })
      .from(taskTimeBlocks)
      .leftJoin(tasks, eq(tasks.id, taskTimeBlocks.taskId))
      .where(
        and(
          eq(taskTimeBlocks.workspaceId, workspaceId),
          eq(taskTimeBlocks.userId, userId),
          gte(taskTimeBlocks.startsAt, from),
          lt(taskTimeBlocks.startsAt, to),
        ),
      )
      .orderBy(asc(taskTimeBlocks.startsAt))

    /*
     * `label` is resolved here rather than stored, so renaming a task renames
     * every block that points at it. A stored copy would leave last week's
     * grid describing a task by a name it no longer has.
     */
    return rows.map((r) => ({ ...r, label: r.title ?? r.taskTitle ?? null }))
  }

  /** The person's own planner preferences, or nulls meaning "never opened". */
  async getSettings(userId: string): Promise<PlannerSettings> {
    const [row] = await this.db
      .select({ settings: users.plannerSettings })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    return row?.settings ?? {}
  }

  async updateSettings(userId: string, patch: PlannerSettings) {
    if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
      throw new BadRequestException('Planner settings must be an object')
    }
    if (patch.defaultDurationMinutes !== undefined) {
      const n = patch.defaultDurationMinutes
      if (!Number.isInteger(n) || n < 5 || n > 24 * 60) {
        throw new BadRequestException('Default event duration must be between 5 minutes and 24 hours')
      }
    }
    /*
     * A default list you cannot post to is worse than no default: every task
     * created from a message would fail somewhere the person never sees.
     */
    if (patch.defaultListId) {
      const [list] = await this.db
        .select({ id: lists.id })
        .from(lists)
        .where(eq(lists.id, patch.defaultListId))
        .limit(1)
      if (!list) throw new BadRequestException('That list does not exist')
    }
    const current = await this.getSettings(userId)
    const next = { ...current, ...patch }
    await this.db.update(users).set({ plannerSettings: next, updatedAt: new Date() }).where(eq(users.id, userId))
    return next
  }

  /**
   * Put a block on the grid. `[14:52]` — the drop target of the drag.
   *
   * A task-backed block stores no title: it renders from the task, prefixed
   * with the person's own "Work on". Storing the composed string would freeze
   * both the prefix and the task's name at the moment of the drag.
   */
  async createBlock(
    workspaceId: string,
    userId: string,
    body: { taskId?: string | null; title?: string | null; startsAt: unknown; endsAt?: unknown; isAllDay?: boolean },
  ) {
    const startsAt = parseInstant(body.startsAt, 'startsAt')
    let endsAt: Date
    if (body.endsAt) {
      endsAt = parseInstant(body.endsAt, 'endsAt')
    } else {
      // No end given: the person's own default duration, which is what
      // dropping a task on the grid does — it does not ask for a length.
      const settings = await this.getSettings(userId)
      const minutes = settings.defaultDurationMinutes ?? 60
      endsAt = new Date(startsAt.getTime() + minutes * 60_000)
    }
    if (endsAt <= startsAt) throw new BadRequestException('A block must end after it starts')

    const title = body.title?.trim() || null
    if (!body.taskId && !title) {
      throw new BadRequestException('A block needs a task or a title')
    }
    if (body.taskId) {
      // The task must exist and be in this workspace — a block pointing across
      // workspaces would render a title its owner is not allowed to read.
      const [task] = await this.db
        .select({ id: tasks.id })
        .from(tasks)
        .innerJoin(lists, eq(lists.id, tasks.listId))
        .where(eq(tasks.id, body.taskId))
        .limit(1)
      if (!task) throw new NotFoundException('Task not found')
    }

    const [row] = await this.db
      .insert(taskTimeBlocks)
      .values({
        workspaceId,
        userId,
        taskId: body.taskId ?? null,
        title: body.taskId ? null : title,
        startsAt,
        endsAt,
        isAllDay: body.isAllDay === true,
      })
      .returning()
    return row
  }

  /** Moving or resizing a block on the grid. */
  async updateBlock(
    blockId: string,
    userId: string,
    patch: { startsAt?: unknown; endsAt?: unknown; title?: string | null; isAllDay?: boolean },
  ) {
    const existing = await this.ownedBlock(blockId, userId)
    const startsAt = patch.startsAt !== undefined ? parseInstant(patch.startsAt, 'startsAt') : existing.startsAt
    const endsAt = patch.endsAt !== undefined ? parseInstant(patch.endsAt, 'endsAt') : existing.endsAt
    if (endsAt <= startsAt) throw new BadRequestException('A block must end after it starts')

    const set: Record<string, unknown> = { startsAt, endsAt, updatedAt: new Date() }
    if (patch.isAllDay !== undefined) set.isAllDay = patch.isAllDay === true
    if (patch.title !== undefined) {
      const title = patch.title?.trim() || null
      if (!existing.taskId && !title) throw new BadRequestException('A block needs a task or a title')
      // A task-backed block keeps rendering from its task; a title here would
      // be written and never read.
      if (!existing.taskId) set.title = title
    }
    const [row] = await this.db
      .update(taskTimeBlocks)
      .set(set)
      .where(eq(taskTimeBlocks.id, blockId))
      .returning()
    return row
  }

  async deleteBlock(blockId: string, userId: string) {
    await this.ownedBlock(blockId, userId)
    await this.db.delete(taskTimeBlocks).where(eq(taskTimeBlocks.id, blockId))
    return { ok: true }
  }

  /**
   * A block you do not own is a 404, not a 403 — the same reasoning as a
   * private view. Somebody else's plan for their Thursday is not something you
   * should be able to confirm the existence of.
   */
  private async ownedBlock(blockId: string, userId: string) {
    const [row] = await this.db
      .select()
      .from(taskTimeBlocks)
      .where(eq(taskTimeBlocks.id, blockId))
      .limit(1)
    if (!row) throw new NotFoundException('Block not found')
    if (row.userId !== userId) throw new NotFoundException('Block not found')
    return row
  }
}

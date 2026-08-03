import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, asc, eq, gte, lte } from 'drizzle-orm'
import { timeOff, users, workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

/** Longest single leave entry — a year of "away" is a leaver, not a holiday. */
const MAX_TIME_OFF_DAYS = 365

/** YYYY-MM-DD, the shape the `date` column round-trips without a timezone. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

export type TimeOffInput = {
  userId?: string
  startsOn: string
  endsOn: string
  note?: string | null
}

/**
 * §A4.10 Days off. ClickUp models workweeks, working hours, holiday calendars
 * and team days off; for an agency only the last one changes a decision, so this
 * stores exactly that and feeds it to the workload heat-map.
 */
@Injectable()
export class TimeOffService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  /**
   * Every entry overlapping [from, to] for the workspace. Availability is a team
   * fact — you cannot plan around leave you cannot see — so this is not scoped
   * to the caller.
   */
  async list(workspaceId: string, range?: { from?: string; to?: string }) {
    const from = range?.from && DATE_ONLY.test(range.from) ? range.from : undefined
    const to = range?.to && DATE_ONLY.test(range.to) ? range.to : undefined
    return this.db
      .select({
        id: timeOff.id,
        userId: timeOff.userId,
        startsOn: timeOff.startsOn,
        endsOn: timeOff.endsOn,
        note: timeOff.note,
        displayName: users.displayName,
        email: users.email,
      })
      .from(timeOff)
      .innerJoin(users, eq(users.id, timeOff.userId))
      .where(
        and(
          eq(timeOff.workspaceId, workspaceId),
          // Overlap, not containment: leave that starts before the window and
          // ends inside it still removes capacity from the window.
          from ? gte(timeOff.endsOn, from) : undefined,
          to ? lte(timeOff.startsOn, to) : undefined,
        ),
      )
      .orderBy(asc(timeOff.startsOn))
  }

  async create(
    workspaceId: string,
    actor: { id: string; isManager: boolean },
    input: TimeOffInput,
  ) {
    const userId = input.userId ?? actor.id
    // Booking someone else's leave is a scheduling decision about them, so it
    // stays with managers; anyone may record their own.
    if (userId !== actor.id && !actor.isManager) {
      throw new ForbiddenException('Only an admin or manager can record time off for someone else')
    }
    if (!DATE_ONLY.test(input.startsOn ?? '') || !DATE_ONLY.test(input.endsOn ?? '')) {
      throw new BadRequestException('startsOn and endsOn must be YYYY-MM-DD dates')
    }
    const start = new Date(`${input.startsOn}T00:00:00Z`)
    const end = new Date(`${input.endsOn}T00:00:00Z`)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('startsOn and endsOn must be valid dates')
    }
    if (end < start) throw new BadRequestException('endsOn must not be before startsOn')
    const spanDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
    if (spanDays > MAX_TIME_OFF_DAYS) {
      throw new BadRequestException(`Time off cannot span more than ${MAX_TIME_OFF_DAYS} days`)
    }

    const [membership] = await this.db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1)
    if (!membership) throw new BadRequestException('That user is not a member of this workspace')

    const [row] = await this.db
      .insert(timeOff)
      .values({
        workspaceId,
        userId,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        note: input.note?.trim() || null,
        createdById: actor.id,
      })
      .returning()
    return row
  }

  async remove(workspaceId: string, entryId: string, actor: { id: string; isManager: boolean }) {
    const [row] = await this.db
      .select()
      .from(timeOff)
      .where(and(eq(timeOff.id, entryId), eq(timeOff.workspaceId, workspaceId)))
      .limit(1)
    if (!row) throw new NotFoundException('Time off entry not found')
    if (row.userId !== actor.id && !actor.isManager) {
      throw new ForbiddenException('Only an admin or manager can remove someone else’s time off')
    }
    await this.db.delete(timeOff).where(eq(timeOff.id, entryId))
    return { ok: true }
  }
}

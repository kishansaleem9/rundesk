import { Injectable, Inject, ForbiddenException, BadRequestException } from '@nestjs/common'
import { and, eq, inArray } from 'drizzle-orm'
import { users, workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

export type PresenceStatus = 'online' | 'away' | 'busy' | 'offline'

/**
 * §A4.8 — the statuses a user may set for themselves. Derived presence reports
 * activity; an override reports intent, which is the only thing a teammate can
 * act on ("don't interrupt" cannot be inferred from a heartbeat).
 */
export const MANUAL_PRESENCE_STATUSES = ['online', 'away', 'busy', 'offline'] as const
export type ManualPresenceStatus = (typeof MANUAL_PRESENCE_STATUSES)[number]

// Online while a socket pings (every ~60s) plus slack; away for a while after;
// offline once cold. Tuned so a briefly-flaky connection doesn't flip to away.
export const ONLINE_WINDOW_MS = 150_000 // 2.5 min
export const AWAY_WINDOW_MS = 15 * 60_000 // 15 min

@Injectable()
export class PresenceService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  /** Derive a presence status from a last-seen timestamp. */
  static deriveStatus(lastSeenAt: Date | string | null | undefined, now: Date = new Date()): PresenceStatus {
    if (!lastSeenAt) return 'offline'
    const seen = lastSeenAt instanceof Date ? lastSeenAt : new Date(lastSeenAt)
    const ageMs = now.getTime() - seen.getTime()
    if (ageMs < 0) return 'online' // clock skew — treat a future stamp as fresh
    if (ageMs <= ONLINE_WINDOW_MS) return 'online'
    if (ageMs <= AWAY_WINDOW_MS) return 'away'
    return 'offline'
  }

  /**
   * The status a teammate should see: the user's own override when they set
   * one, otherwise the heartbeat-derived value.
   */
  static resolveStatus(
    presenceStatus: string | null | undefined,
    lastSeenAt: Date | string | null | undefined,
    now: Date = new Date(),
  ): PresenceStatus {
    if (presenceStatus && (MANUAL_PRESENCE_STATUSES as readonly string[]).includes(presenceStatus)) {
      return presenceStatus as PresenceStatus
    }
    return PresenceService.deriveStatus(lastSeenAt, now)
  }

  /**
   * Set or clear the caller's own presence override. `null` hands presence back
   * to the heartbeat.
   */
  async setManualStatus(userId: string, status: ManualPresenceStatus | null) {
    if (status !== null && !(MANUAL_PRESENCE_STATUSES as readonly string[]).includes(status)) {
      throw new BadRequestException(`status must be one of ${MANUAL_PRESENCE_STATUSES.join(', ')} or null`)
    }
    const [row] = await this.db
      .update(users)
      .set({ presenceStatus: status })
      .where(eq(users.id, userId))
      .returning({ presenceStatus: users.presenceStatus, lastSeenAt: users.lastSeenAt })
    return {
      presenceStatus: row?.presenceStatus ?? null,
      status: PresenceService.resolveStatus(row?.presenceStatus, row?.lastSeenAt),
    }
  }

  /** Refresh a user's presence heartbeat. Called on socket connect + ping. */
  async recordHeartbeat(userId: string, now: Date = new Date()): Promise<void> {
    if (!userId) return
    await this.db.update(users).set({ lastSeenAt: now }).where(eq(users.id, userId))
  }

  /**
   * §G06 [06:42] — a status that has expired is not a status.
   *
   * Enforced on read, everywhere, rather than by a sweeper. A job that clears
   * statuses is a job that can be down, and a status outliving its reason —
   * "Busy" three days after the meeting — is exactly what this feature exists
   * to prevent. Past the moment, every reader sees nothing.
   */
  static liveStatus(
    row: { statusEmoji?: string | null; statusText?: string | null; statusExpiresAt?: Date | string | null },
    now: Date = new Date(),
  ): { emoji: string | null; text: string | null; expiresAt: string | null } | null {
    if (!row?.statusEmoji && !row?.statusText) return null
    if (row.statusExpiresAt) {
      const until = row.statusExpiresAt instanceof Date ? row.statusExpiresAt : new Date(row.statusExpiresAt)
      if (!Number.isNaN(until.getTime()) && until.getTime() <= now.getTime()) return null
    }
    return {
      emoji: row.statusEmoji ?? null,
      text: row.statusText ?? null,
      expiresAt: row.statusExpiresAt
        ? (row.statusExpiresAt instanceof Date ? row.statusExpiresAt : new Date(row.statusExpiresAt)).toISOString()
        : null,
    }
  }

  /**
   * §G06 [06:42] — set the caller's custom status.
   *
   * "main yahan se apna status set kar sakti hoon ke main is time kya kar rahi
   * hoon." Emoji and text are both optional; clearing both clears the status,
   * which is what the Clear button does rather than needing a second endpoint.
   */
  async setCustomStatus(
    userId: string,
    input: { emoji?: string | null; text?: string | null; expiresAt?: string | Date | null },
  ) {
    const emoji = input.emoji?.trim() || null
    const text = input.text?.trim() || null

    // Long enough for "In a meeting until 3, ping me if urgent", short enough
    // that a status cannot be used as a paragraph in somebody's sidebar.
    if (text && text.length > 120) throw new BadRequestException('A status is at most 120 characters')
    // One grapheme. Anything longer is a sentence in the emoji slot, which
    // breaks every place this renders in a 16px square.
    if (emoji && [...emoji].length > 2) throw new BadRequestException('Pick a single emoji')

    let expiresAt: Date | null = null
    if (input.expiresAt) {
      expiresAt = input.expiresAt instanceof Date ? input.expiresAt : new Date(input.expiresAt)
      if (Number.isNaN(expiresAt.getTime())) throw new BadRequestException('expiresAt must be a valid date/time')
      if (expiresAt.getTime() <= Date.now()) {
        throw new BadRequestException('A status that has already expired is not a status')
      }
    }
    // Clearing the words clears the clock with them, so a later status does not
    // inherit the expiry of the one before it.
    if (!emoji && !text) expiresAt = null

    const [row] = await this.db
      .update(users)
      .set({ statusEmoji: emoji, statusText: text, statusExpiresAt: expiresAt })
      .where(eq(users.id, userId))
      .returning({
        statusEmoji: users.statusEmoji,
        statusText: users.statusText,
        statusExpiresAt: users.statusExpiresAt,
      })
    return { status: PresenceService.liveStatus(row ?? {}) }
  }

  /**
   * Presence for every member of a workspace (requires the caller to be a
   * member). Returns each member's raw lastSeenAt plus the derived status.
   */
  async getWorkspacePresence(workspaceId: string, requesterId: string, now: Date = new Date()) {
    const [membership] = await this.db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, requesterId)))
      .limit(1)
    if (!membership) throw new ForbiddenException('Workspace membership required')

    const rows = await this.db
      .select({
        userId: users.id,
        lastSeenAt: users.lastSeenAt,
        presenceStatus: users.presenceStatus,
        // §G06 [06:42] — the words, alongside the dot. Read here rather than
        // fetched separately: "away" and "on a 30-minute break" are the same
        // glance, and two round trips guarantees they disagree for a moment.
        statusEmoji: users.statusEmoji,
        statusText: users.statusText,
        statusExpiresAt: users.statusExpiresAt,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, workspaceId))

    return rows.map((r) => ({
      userId: r.userId,
      lastSeenAt: r.lastSeenAt,
      manual: r.presenceStatus ?? null,
      status: PresenceService.resolveStatus(r.presenceStatus, r.lastSeenAt, now),
      customStatus: PresenceService.liveStatus(r, now),
    }))
  }

  /** Presence for a specific set of users (any workspace) — keyed by userId. */
  async statusFor(userIds: string[], now: Date = new Date()) {
    const ids = [...new Set(userIds.filter(Boolean))]
    if (ids.length === 0) return {} as Record<string, PresenceStatus>
    const rows = await this.db
      .select({ userId: users.id, lastSeenAt: users.lastSeenAt, presenceStatus: users.presenceStatus })
      .from(users)
      .where(inArray(users.id, ids))
    const out: Record<string, PresenceStatus> = {}
    for (const r of rows) out[r.userId] = PresenceService.resolveStatus(r.presenceStatus, r.lastSeenAt, now)
    return out
  }
}

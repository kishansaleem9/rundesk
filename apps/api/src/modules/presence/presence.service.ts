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
      .select({ userId: users.id, lastSeenAt: users.lastSeenAt, presenceStatus: users.presenceStatus })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, workspaceId))

    return rows.map((r) => ({
      userId: r.userId,
      lastSeenAt: r.lastSeenAt,
      manual: r.presenceStatus ?? null,
      status: PresenceService.resolveStatus(r.presenceStatus, r.lastSeenAt, now),
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

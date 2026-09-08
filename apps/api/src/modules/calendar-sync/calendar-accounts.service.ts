import { Injectable, Inject, BadRequestException, NotFoundException } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { userCalendarAccounts, PUBLIC_CALENDAR_ACCOUNT_COLUMNS } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { toBusyWindows, type RawWindow } from './free-busy'

/**
 * §V2-14 — a person's calendar accounts, frame `13:50`.
 *
 * `[13:38]` "aur jitna chahoon main add kar sakti hoon."
 *
 * EVERY METHOD IS SCOPED BY `userId`, and that is the security model rather
 * than a convenience. These rows hold OAuth refresh tokens for somebody's
 * personal Google account; an endpoint that took an account id without also
 * proving whose it is would let any member of the workspace unhook — or read
 * the address of — a colleague's calendar. So the id is never trusted alone:
 * every lookup is `(id AND userId)`, and a mismatch is a 404 rather than a 403,
 * because the existence of somebody else's calendar account is not something
 * you should be able to confirm.
 */

const PROVIDERS = ['gcal', 'outlook'] as const
export type CalendarProviderId = (typeof PROVIDERS)[number]

/** How long one provider gets before its busy time is given up on. */
const FREE_BUSY_TIMEOUT_MS = 4000

@Injectable()
export class CalendarAccountsService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  private assertProvider(value: string): CalendarProviderId {
    if (!(PROVIDERS as readonly string[]).includes(value)) {
      throw new BadRequestException(`Unknown calendar provider: ${value}`)
    }
    return value as CalendarProviderId
  }

  /**
   * The accounts a person has connected in this workspace.
   *
   * Projected through `PUBLIC_CALENDAR_ACCOUNT_COLUMNS` so tokens cannot leave
   * by accident — a bare `select()` here would put a refresh token in a JSON
   * response, and nothing else in the request would look wrong.
   */
  async list(userId: string, workspaceId: string) {
    return this.db
      .select(PUBLIC_CALENDAR_ACCOUNT_COLUMNS)
      .from(userCalendarAccounts)
      .where(
        and(
          eq(userCalendarAccounts.userId, userId),
          eq(userCalendarAccounts.workspaceId, workspaceId),
        ),
      )
      .orderBy(userCalendarAccounts.createdAt)
  }

  /**
   * Record a completed OAuth grant.
   *
   * RE-CONNECTING THE SAME ACCOUNT REFRESHES IT rather than adding a second
   * row — that is what the unique key on `external_account_id` is for. The old
   * behaviour was the opposite and much worse: a second grant for a DIFFERENT
   * account overwrote the first, because the key was (workspace, provider).
   *
   * The first account a person connects becomes their default, because the
   * alternative is a fresh connection that writes nowhere until they visit a
   * settings page they have no reason to think they need.
   */
  async upsertFromOAuth(input: {
    userId: string
    workspaceId: string
    provider: string
    externalAccountId: string
    externalAccountEmail?: string | null
    accessToken?: string | null
    refreshToken?: string | null
    tokenExpiresAt?: Date | null
    scopes?: string[]
  }) {
    const provider = this.assertProvider(input.provider)
    if (!input.externalAccountId) {
      // Without the provider's own id there is no way to tell a re-connection
      // from a new account, which is exactly the confusion this replaces.
      throw new BadRequestException('The provider did not identify the account')
    }

    const existing = await this.db
      .select({ id: userCalendarAccounts.id })
      .from(userCalendarAccounts)
      .where(
        and(
          eq(userCalendarAccounts.userId, input.userId),
          eq(userCalendarAccounts.workspaceId, input.workspaceId),
          eq(userCalendarAccounts.provider, provider),
          eq(userCalendarAccounts.externalAccountId, input.externalAccountId),
        ),
      )
      .limit(1)

    const tokens = {
      externalAccountEmail: input.externalAccountEmail ?? null,
      accessToken: input.accessToken ?? null,
      refreshToken: input.refreshToken ?? null,
      tokenExpiresAt: input.tokenExpiresAt ?? null,
      scopes: input.scopes ?? [],
      status: 'connected',
      updatedAt: new Date(),
    }

    if (existing[0]) {
      await this.db
        .update(userCalendarAccounts)
        .set(tokens)
        .where(eq(userCalendarAccounts.id, existing[0].id))
      return { id: existing[0].id, created: false }
    }

    const mine = await this.list(input.userId, input.workspaceId)
    const [row] = await this.db
      .insert(userCalendarAccounts)
      .values({
        userId: input.userId,
        workspaceId: input.workspaceId,
        provider,
        externalAccountId: input.externalAccountId,
        ...tokens,
        isDefault: mine.length === 0,
      })
      .returning({ id: userCalendarAccounts.id })
    return { id: row.id, created: true }
  }

  /**
   * "Default calendar" — where new events are written.
   *
   * The clear-then-set is a TRANSACTION because the database enforces at most
   * one default with a partial unique index: setting the new one before
   * clearing the old would collide, and clearing outside a transaction would
   * leave a person with no default at all if the second statement failed.
   */
  async setDefault(userId: string, workspaceId: string, accountId: string) {
    await this.owned(userId, accountId)
    await this.db.transaction(async (tx) => {
      await tx
        .update(userCalendarAccounts)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(
          and(
            eq(userCalendarAccounts.userId, userId),
            eq(userCalendarAccounts.workspaceId, workspaceId),
          ),
        )
      await tx
        .update(userCalendarAccounts)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(eq(userCalendarAccounts.id, accountId))
    })
    return this.list(userId, workspaceId)
  }

  /** "Busy calendars" — whether this one is read when working out free time. */
  async setCountsAsBusy(userId: string, workspaceId: string, accountId: string, busy: boolean) {
    await this.owned(userId, accountId)
    await this.db
      .update(userCalendarAccounts)
      .set({ countsAsBusy: busy, updatedAt: new Date() })
      .where(eq(userCalendarAccounts.id, accountId))
    return this.list(userId, workspaceId)
  }

  /**
   * Disconnect one account.
   *
   * When the default is removed, the oldest remaining account takes over rather
   * than leaving nobody holding it — a workspace with connected calendars and
   * no default writes new events nowhere, which looks like the sync breaking.
   */
  async remove(userId: string, workspaceId: string, accountId: string) {
    const account = await this.owned(userId, accountId)
    await this.db.delete(userCalendarAccounts).where(eq(userCalendarAccounts.id, accountId))
    if (account.isDefault) {
      const rest = await this.list(userId, workspaceId)
      if (rest[0]) {
        await this.db
          .update(userCalendarAccounts)
          .set({ isDefault: true, updatedAt: new Date() })
          .where(eq(userCalendarAccounts.id, rest[0].id))
      }
    }
    return this.list(userId, workspaceId)
  }

  /**
   * The accounts whose events count as busy — §V2-14c reads this.
   *
   * Returns tokens, because the caller has to talk to the provider. It is
   * deliberately NOT the same method the controller calls, so the safe list and
   * the privileged one cannot be confused at a call site.
   */
  async busyAccountsWithTokens(userId: string, workspaceId: string) {
    return this.db
      .select()
      .from(userCalendarAccounts)
      .where(
        and(
          eq(userCalendarAccounts.userId, userId),
          eq(userCalendarAccounts.workspaceId, workspaceId),
          eq(userCalendarAccounts.countsAsBusy, true),
          eq(userCalendarAccounts.status, 'connected'),
        ),
      )
  }

  /**
   * §V2-14c — when this person is busy, according to the calendars they said
   * should decide that.
   *
   * WHAT IS AND IS NOT EXERCISED HERE. The Google call below is real and
   * unverified: this environment has no Google credentials, so no test in this
   * repository reaches it. What IS covered is everything around it — which
   * accounts get asked (`countsAsBusy`), what a returned window is allowed to
   * contain (no title, ever), and how windows merge. The provider's half is
   * the provider's.
   *
   * Failures are swallowed PER ACCOUNT rather than for the whole call: one
   * revoked token should cost that calendar's busy time, not everybody else's.
   */
  async externalBusyWindows(userId: string, workspaceId: string, from: Date, to: Date) {
    const accounts = await this.busyAccountsWithTokens(userId, workspaceId)
    const all: RawWindow[] = []
    for (const account of accounts) {
      if (account.provider !== 'gcal' || !account.accessToken) continue
      try {
        const url =
          `https://www.googleapis.com/calendar/v3/freeBusy`
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${account.accessToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            timeMin: from.toISOString(),
            timeMax: to.toISOString(),
            /*
             * `primary` is Google's own name for the calendar an account owns,
             * which is why the frame's Default picker shows an email address.
             * The column is NOT NULL DEFAULT 'primary', so this is the value
             * every OAuth-connected account already carries; the fallback is
             * here because sending an empty id would fail SILENTLY — failures
             * are swallowed per account, so the calendar would simply report
             * nobody as ever busy.
             */
            items: [{ id: account.externalCalendarId || 'primary' }],
          }),
          /*
           * BOUNDED, because this runs inside a request somebody is waiting on.
           * Without it, Google being slow makes opening a colleague's calendar
           * hang rather than degrade — and the whole point of catching per
           * account is that one bad calendar costs only its own busy time.
           */
          signal: AbortSignal.timeout(FREE_BUSY_TIMEOUT_MS),
        })
        if (!res.ok) continue
        /*
         * freeBusy is used rather than the events list ON PURPOSE. It returns
         * start/end pairs and nothing else — no summaries, no attendees — so
         * the titles of somebody's personal appointments never enter this
         * process at all. Filtering them out after fetching would work until
         * the day somebody logged the response.
         */
        const body = (await res.json()) as {
          calendars?: Record<string, { busy?: Array<{ start?: string; end?: string }> }>
        }
        for (const cal of Object.values(body.calendars ?? {})) {
          for (const slot of cal.busy ?? []) all.push({ start: slot.start, end: slot.end })
        }
      } catch {
        // One calendar failing is not the others' problem.
        continue
      }
    }
    return toBusyWindows(all, 'external')
  }

  /**
   * An account belonging to this person, or a 404.
   *
   * 404 rather than 403 on a mismatch: whether a colleague has connected a
   * calendar is not something the id in a URL should be able to confirm.
   */
  private async owned(userId: string, accountId: string) {
    const [row] = await this.db
      .select({
        id: userCalendarAccounts.id,
        isDefault: userCalendarAccounts.isDefault,
        userId: userCalendarAccounts.userId,
      })
      .from(userCalendarAccounts)
      .where(eq(userCalendarAccounts.id, accountId))
      .limit(1)
    if (!row || row.userId !== userId) throw new NotFoundException('Calendar account not found')
    return row
  }
}

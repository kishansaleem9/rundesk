import { Injectable, Inject, BadRequestException, NotFoundException } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { userCalendarAccounts, PUBLIC_CALENDAR_ACCOUNT_COLUMNS } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { toBusyWindows, type RawWindow } from './free-busy'
import {
  calendarBases,
  CalendarRefused,
  deleteEvent,
  readGoogle,
  readGraph,
  writeEvent,
  type CalendarEvent,
  type CalendarProvider as Provider,
  type EventToWrite,
} from './calendar-events'

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

/** How long one calendar gets to answer a read, a write or a refresh. */
const CALENDAR_TIMEOUT_MS = 6000

type AccountRow = typeof userCalendarAccounts.$inferSelect

/** An account the planner could not read, said by the page rather than drawn as an empty week. */
export interface UnreadCalendar {
  accountId: string
  email: string | null
  provider: string
  /** `refused`: the grant is gone or expired past refreshing — connect it again. `failed`: anything else. */
  reason: 'refused' | 'failed'
}

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
        // The base a lane points at its stub (`calendarBases`), and a token
        // refreshed when it has expired: an hour after connecting, the stored
        // one is refused, and every busy hour went with it.
        const token = await this.tokenFor(account)
        if (!token) continue
        const url = `${calendarBases().google}/freeBusy`
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
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
   * A TOKEN THIS ACCOUNT'S PROVIDER WILL TAKE. The stored one while it has not
   * expired; a refreshed one when it has, or is about to, or when `force` says
   * the provider has just refused the stored one. Google's last an hour, so an
   * account read only with the token it was connected with stops answering an
   * hour later. Null when there is nothing to refresh with, or the provider
   * will not refresh it (the grant is gone).
   *
   * The token addresses are overridable as the calendars' are, so a lane's stub
   * answers them (GOOGLE_TOKEN_URL, MICROSOFT_TOKEN_URL); the client is the one
   * the account was connected through.
   */
  private async tokenFor(account: AccountRow, force = false): Promise<string | null> {
    const expiresAt = account.tokenExpiresAt?.getTime() ?? null
    const current = !!account.accessToken && (expiresAt === null || expiresAt > Date.now() + 60_000)
    if (!force && current) return account.accessToken
    if (!account.refreshToken) return force ? null : account.accessToken
    const cfg = account.provider === 'gcal'
      ? {
          url: process.env.GOOGLE_TOKEN_URL ?? 'https://oauth2.googleapis.com/token',
          id: process.env.GOOGLE_CLIENT_ID ?? '',
          secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
        }
      : {
          url: process.env.MICROSOFT_TOKEN_URL ?? 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
          id: process.env.MICROSOFT_CLIENT_ID ?? '',
          secret: process.env.MICROSOFT_CLIENT_SECRET ?? '',
        }
    try {
      const res = await fetch(cfg.url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: account.refreshToken,
          client_id: cfg.id,
          client_secret: cfg.secret,
        }).toString(),
        signal: AbortSignal.timeout(CALENDAR_TIMEOUT_MS),
      })
      if (!res.ok) return null
      const body = (await res.json()) as { access_token?: string; expires_in?: number; refresh_token?: string }
      if (!body.access_token) return null
      const expires = body.expires_in ? new Date(Date.now() + body.expires_in * 1000) : null
      await this.db
        .update(userCalendarAccounts)
        .set({
          accessToken: body.access_token,
          refreshToken: body.refresh_token ?? account.refreshToken,
          tokenExpiresAt: expires,
          updatedAt: new Date(),
        })
        .where(eq(userCalendarAccounts.id, account.id))
      account.accessToken = body.access_token
      account.tokenExpiresAt = expires
      return body.access_token
    } catch {
      return null
    }
  }

  /** A call to the provider with this account's token, made once more with a refreshed one if the provider refuses it. */
  private async withToken<T>(account: AccountRow, call: (token: string) => Promise<T>): Promise<T> {
    const token = await this.tokenFor(account)
    if (!token) throw new CalendarRefused(account.provider as Provider, 401)
    try {
      return await call(token)
    } catch (err) {
      if (!(err instanceof CalendarRefused)) throw err
      const again = await this.tokenFor(account, true)
      if (!again || again === token) throw err
      return call(again)
    }
  }

  /**
   * THE EVENTS OF THE CALENDARS THIS PERSON READS, in the window
   * (`found-25-sep/connected-calendars-read-by-nothing`): every account the
   * planner's calendar picker has ticked — `countsAsBusy`, the column that
   * already means "this calendar is read" — that is connected. Each account is
   * read on its own and a failure costs only its own events, as free/busy's
   * does, but it is SAID (`unread`), so a page can name the calendar that is
   * missing rather than draw a week that looks empty.
   *
   * Only ever the caller's own accounts: the titles of somebody's personal
   * appointments are theirs, and a colleague is shown free/busy alone.
   */
  async events(
    userId: string,
    workspaceId: string,
    from: Date,
    to: Date,
  ): Promise<{ events: CalendarEvent[]; unread: UnreadCalendar[]; truncated: string[] }> {
    const accounts = await this.busyAccountsWithTokens(userId, workspaceId)
    const read = await Promise.all(
      accounts.map(async (account) => {
        try {
          const got = await this.withToken(account, (token) =>
            account.provider === 'gcal'
              ? readGoogle(token, account.externalCalendarId, account.id, from, to, AbortSignal.timeout(CALENDAR_TIMEOUT_MS))
              : readGraph(token, account.id, from, to, AbortSignal.timeout(CALENDAR_TIMEOUT_MS)),
          )
          return { account, got }
        } catch (err) {
          return { account, reason: err instanceof CalendarRefused ? ('refused' as const) : ('failed' as const) }
        }
      }),
    )
    const events: CalendarEvent[] = []
    const unread: UnreadCalendar[] = []
    const truncated: string[] = []
    for (const r of read) {
      if ('got' in r && r.got) {
        events.push(...r.got.events)
        if (r.got.truncated) truncated.push(r.account.id)
      } else {
        unread.push({
          accountId: r.account.id,
          email: r.account.externalAccountEmail,
          provider: r.account.provider,
          reason: (r as { reason: 'refused' | 'failed' }).reason,
        })
      }
    }
    const at = (e: CalendarEvent) => Date.parse(e.allDay ? `${e.start}T00:00:00Z` : e.start)
    events.sort((a, b) => at(a) - at(b))
    return { events, unread, truncated }
  }

  /**
   * The events of ONE of this person's connected calendars over a window — the
   * AI Notetaker's "Join all meetings for" reads each calendar it is told to
   * join (`commit-log/log-39863ff-1`). Theirs alone: an account of somebody
   * else's, or one no longer connected, has no events here.
   */
  async eventsOfAccount(userId: string, accountId: string, from: Date, to: Date): Promise<CalendarEvent[]> {
    const [account] = await this.db
      .select()
      .from(userCalendarAccounts)
      .where(and(eq(userCalendarAccounts.id, accountId), eq(userCalendarAccounts.userId, userId), eq(userCalendarAccounts.status, 'connected')))
      .limit(1)
    if (!account) return []
    const got = await this.withToken(account, (token) =>
      account.provider === 'gcal'
        ? readGoogle(token, account.externalCalendarId, account.id, from, to, AbortSignal.timeout(CALENDAR_TIMEOUT_MS))
        : readGraph(token, account.id, from, to, AbortSignal.timeout(CALENDAR_TIMEOUT_MS)),
    )
    return got.events
  }

  /**
   * "Default calendar — where new events are WRITTEN": this person's, with its
   * tokens, when it is connected; null when they have none, or it is not.
   */
  async defaultAccountWithTokens(userId: string, workspaceId: string): Promise<AccountRow | null> {
    const [row] = await this.db
      .select()
      .from(userCalendarAccounts)
      .where(
        and(
          eq(userCalendarAccounts.userId, userId),
          eq(userCalendarAccounts.workspaceId, workspaceId),
          eq(userCalendarAccounts.isDefault, true),
          eq(userCalendarAccounts.status, 'connected'),
        ),
      )
      .limit(1)
    return row ?? null
  }

  /** One of this person's accounts, with its tokens; null when it is not theirs, or is gone. */
  async ownAccountWithTokens(userId: string, accountId: string): Promise<AccountRow | null> {
    const [row] = await this.db
      .select()
      .from(userCalendarAccounts)
      .where(and(eq(userCalendarAccounts.id, accountId), eq(userCalendarAccounts.userId, userId)))
      .limit(1)
    return row ?? null
  }

  /**
   * Write a planner block into the account as an event, or change the one it
   * became; the event's id. And an event the AI was confirmed to make, with whom
   * it invites (`ledger-rows/row-2294`), written the same way.
   */
  async writeBlockEvent(account: AccountRow, e: EventToWrite, eventId: string | null): Promise<string> {
    return this.withToken(account, (token) =>
      writeEvent(account.provider as Provider, token, account.externalCalendarId, e, eventId, AbortSignal.timeout(CALENDAR_TIMEOUT_MS)),
    )
  }

  /** Delete the event a planner block became. */
  async deleteBlockEvent(account: AccountRow, eventId: string): Promise<void> {
    await this.withToken(account, (token) =>
      deleteEvent(account.provider as Provider, token, account.externalCalendarId, eventId, AbortSignal.timeout(CALENDAR_TIMEOUT_MS)),
    )
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

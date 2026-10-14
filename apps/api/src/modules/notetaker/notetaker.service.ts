import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { meetingAttendees, meetings, notetakerBots, userCalendarAccounts, users, workspaceMembers, type NotetakerStatus } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { meetingPlatformOf, type MeetingPlatform } from '../../common/meeting-links'
import { CalendarAccountsService } from '../calendar-sync/calendar-accounts.service'
import { MeetingsService } from '../meetings/meetings.service'
import { AiService } from '../ai/ai.service'
import { NotificationsService } from '../notifications/notifications.service'
import {
  createBot,
  downloadTranscript,
  getBot,
  recallConfig,
  removeBot,
  stateOf,
  transcriptText,
  transcriptUrlOf,
  RecallFailed,
  type RecallConfig,
} from './recall'

/** A visit still under way: the service is asked about these until they end. */
const ACTIVE: NotetakerStatus[] = ['scheduled', 'joining', 'waiting', 'recording', 'processing']
/** In the meeting: called back by "leave", not unscheduled. */
const IN_CALL: NotetakerStatus[] = ['joining', 'waiting', 'recording']

/** "Joins meetings when they begin": a calendar's meetings starting within this window are sent a bot. */
const LOOK_BEHIND_MS = 10 * 60_000
const LOOK_AHEAD_MS = 15 * 60_000
/** How many visits one look asks about, so a backlog is read over several looks rather than one long one. */
const REFRESH_BATCH = 25

export type NotetakerRun = {
  id: string
  meetingUrl: string
  platform: MeetingPlatform
  title: string | null
  joinAt: string | null
  status: NotetakerStatus
  statusDetail: string | null
  meetingId: string | null
  calendarAccountId: string | null
  createdAt: string
}

/**
 * THE AI NOTETAKER (`commit-log/log-39863ff-1`), as ClickUp's works.
 *
 * ClickUp's: "send AI Notetaker to any ad hoc Zoom, Google Meet, or Microsoft
 * Teams meeting" by pasting its link; or pick the calendars under "Join all
 * meetings for", and it joins their meetings "when they begin". Afterwards the
 * meeting's notes — an overview, action items, the transcript with who said
 * what — are kept, and land in the Inbox (its help centre and feature pages,
 * through search excerpts, 14 October).
 *
 * Here a visit is a `notetaker_bots` row, the bot is Recall.ai's (`recall.ts`),
 * and what it leaves is a MEETING RECORD — the same record an internal call's
 * notetaker leaves (`CallsService.end`): its title and time, the transcript,
 * the notes `AiService.notesFromTranscript` writes from it (none where no model
 * is set up: the transcript is kept all the same), the members who spoke as its
 * attendees and anybody else by name; and an Inbox notice to its owner that
 * opens it. ClickUp keeps its notes in a private Doc; a Doc here is read as the
 * place it lives and has no privacy of its own, so the notes live where this
 * product's meeting notes already live, on the Meetings page.
 *
 * A visit is its owner's alone: listed to them, called back by them. Every
 * minute (NOTETAKER_POLL_SECONDS) the service looks at the calendars people
 * told it to join and sends a bot to each meeting about to begin, and asks
 * after every visit under way; opening the panel asks after the opener's too,
 * so nobody waits a minute to see the bot has joined.
 */
@Injectable()
export class NotetakerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotetakerService.name)
  private timer: NodeJS.Timeout | null = null
  private looking = false

  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly calendars: CalendarAccountsService,
    private readonly meetingsService: MeetingsService,
    private readonly ai: AiService,
    private readonly notifications: NotificationsService,
  ) {}

  private get config(): RecallConfig | null {
    return recallConfig()
  }

  onModuleInit() {
    const seconds = Number(process.env.NOTETAKER_POLL_SECONDS ?? 60)
    if (!this.config || !(seconds > 0)) return
    this.timer = setInterval(() => void this.look(), seconds * 1000)
    this.timer.unref?.()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** A member of the workspace, not a guest: a guest has no meetings of their own here. */
  private async assertMember(workspaceId: string, userId: string) {
    const [m] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1)
    if (!m) throw new ForbiddenException('Workspace membership required')
    if (m.role === 'guest') throw new ForbiddenException('Guests have no AI Notetaker')
  }

  private assertSetUp(): RecallConfig {
    const cfg = this.config
    if (!cfg) throw new BadRequestException('The AI Notetaker is not set up on this server')
    return cfg
  }

  private toRun(r: typeof notetakerBots.$inferSelect): NotetakerRun {
    return {
      id: r.id,
      meetingUrl: r.meetingUrl,
      platform: r.platform,
      title: r.title,
      joinAt: r.joinAt?.toISOString() ?? null,
      status: r.status,
      statusDetail: r.statusDetail,
      meetingId: r.meetingId,
      calendarAccountId: r.calendarAccountId,
      createdAt: r.createdAt.toISOString(),
    }
  }

  /**
   * The panel: whether the notetaker is set up, this person's calendars and
   * whether it joins each one's meetings, and their visits, newest first —
   * those under way asked after first.
   */
  async overview(workspaceId: string, userId: string) {
    await this.assertMember(workspaceId, userId)
    const configured = !!this.config
    if (configured) {
      const mine = await this.db
        .select()
        .from(notetakerBots)
        .where(and(eq(notetakerBots.workspaceId, workspaceId), eq(notetakerBots.userId, userId), inArray(notetakerBots.status, ACTIVE), isNotNull(notetakerBots.vendorBotId)))
        .limit(REFRESH_BATCH)
      for (const row of mine) await this.refresh(row).catch(() => undefined)
    }
    const calendars = await this.db
      .select({
        id: userCalendarAccounts.id,
        provider: userCalendarAccounts.provider,
        email: userCalendarAccounts.externalAccountEmail,
        joins: userCalendarAccounts.notetakerJoins,
        status: userCalendarAccounts.status,
      })
      .from(userCalendarAccounts)
      .where(and(eq(userCalendarAccounts.workspaceId, workspaceId), eq(userCalendarAccounts.userId, userId)))
    const runs = await this.db
      .select()
      .from(notetakerBots)
      .where(and(eq(notetakerBots.workspaceId, workspaceId), eq(notetakerBots.userId, userId)))
      .orderBy(desc(notetakerBots.createdAt))
      .limit(30)
    return { configured, calendars, runs: runs.map((r) => this.toRun(r)) }
  }

  /** "Send AI Notetaker": to the meeting at this link, now. */
  async send(workspaceId: string, userId: string, body: { meetingUrl?: unknown; title?: unknown }) {
    await this.assertMember(workspaceId, userId)
    const cfg = this.assertSetUp()
    const meetingUrl = typeof body?.meetingUrl === 'string' ? body.meetingUrl.trim() : ''
    const platform = meetingPlatformOf(meetingUrl)
    if (!platform) throw new BadRequestException('Paste a Zoom, Google Meet or Microsoft Teams meeting link')
    const title = typeof body?.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 200) : null
    const [row] = await this.db
      .insert(notetakerBots)
      .values({ workspaceId, userId, meetingUrl, platform, title, status: 'joining' })
      .returning()
    return this.toRun(await this.dispatch(cfg, row, null))
  }

  /** Ask the service for the visit's bot, and keep its id; a refusal is the visit's failure, said. */
  private async dispatch(cfg: RecallConfig, row: typeof notetakerBots.$inferSelect, joinAt: Date | null) {
    try {
      const bot = await createBot(cfg, { meetingUrl: row.meetingUrl, joinAt })
      const [kept] = await this.db
        .update(notetakerBots)
        .set({ vendorBotId: bot.id, updatedAt: new Date() })
        .where(eq(notetakerBots.id, row.id))
        .returning()
      return kept ?? row
    } catch (e) {
      const said = e instanceof RecallFailed ? e.message : 'The meeting bot service could not be asked'
      const [failed] = await this.db
        .update(notetakerBots)
        .set({ status: 'failed', statusDetail: said.slice(0, 500), updatedAt: new Date(), finishedAt: new Date() })
        .where(eq(notetakerBots.id, row.id))
        .returning()
      return failed ?? row
    }
  }

  /** "Join all meetings for": this calendar's, on or off. The person's own calendars only. */
  async setCalendarJoins(workspaceId: string, userId: string, accountId: string, joins: unknown) {
    await this.assertMember(workspaceId, userId)
    if (typeof joins !== 'boolean') throw new BadRequestException('joins is true or false')
    const [row] = await this.db
      .update(userCalendarAccounts)
      .set({ notetakerJoins: joins, updatedAt: new Date() })
      .where(and(eq(userCalendarAccounts.id, accountId), eq(userCalendarAccounts.userId, userId), eq(userCalendarAccounts.workspaceId, workspaceId)))
      .returning({ id: userCalendarAccounts.id, joins: userCalendarAccounts.notetakerJoins })
    if (!row) throw new NotFoundException('Calendar not found')
    // Turned on, it looks at once: a meeting beginning now is not left until the next look.
    if (joins && this.config) void this.look().catch(() => undefined)
    return row
  }

  /** Call the notetaker back: unscheduled before its meeting, out of it once in. */
  async cancel(workspaceId: string, userId: string, runId: string) {
    await this.assertMember(workspaceId, userId)
    const cfg = this.assertSetUp()
    const [row] = await this.db
      .select()
      .from(notetakerBots)
      .where(and(eq(notetakerBots.id, runId), eq(notetakerBots.workspaceId, workspaceId), eq(notetakerBots.userId, userId)))
      .limit(1)
    if (!row) throw new NotFoundException('Not found')
    if (!ACTIVE.includes(row.status)) throw new BadRequestException('That notetaker has already finished')
    if (row.vendorBotId) {
      await removeBot(cfg, row.vendorBotId, IN_CALL.includes(row.status)).catch((e) => {
        throw new BadRequestException(e instanceof RecallFailed ? e.message : 'The notetaker could not be called back')
      })
    }
    const [done] = await this.db
      .update(notetakerBots)
      .set({ status: 'cancelled', updatedAt: new Date(), finishedAt: new Date() })
      .where(and(eq(notetakerBots.id, row.id), inArray(notetakerBots.status, ACTIVE)))
      .returning()
    return this.toRun(done ?? row)
  }

  /** One look: the calendars' meetings about to begin, then every visit under way. One at a time. */
  async look() {
    const cfg = this.config
    if (!cfg || this.looking) return
    this.looking = true
    try {
      await this.joinCalendars(cfg)
      const active = await this.db
        .select()
        .from(notetakerBots)
        .where(and(inArray(notetakerBots.status, ACTIVE), isNotNull(notetakerBots.vendorBotId)))
        .orderBy(notetakerBots.updatedAt)
        .limit(REFRESH_BATCH)
      for (const row of active) await this.refresh(row).catch((e) => this.logger.warn(`notetaker ${row.id}: ${String(e?.message ?? e)}`))
    } finally {
      this.looking = false
    }
  }

  /**
   * Each calendar a person told it to join: its meetings with a video link
   * that begin from ten minutes ago to fifteen from now are sent a bot, at the
   * meeting's start — once each, whatever happened to the visit since.
   */
  private async joinCalendars(cfg: RecallConfig) {
    const accounts = await this.db
      .select({ id: userCalendarAccounts.id, userId: userCalendarAccounts.userId, workspaceId: userCalendarAccounts.workspaceId })
      .from(userCalendarAccounts)
      .innerJoin(workspaceMembers, and(eq(workspaceMembers.workspaceId, userCalendarAccounts.workspaceId), eq(workspaceMembers.userId, userCalendarAccounts.userId)))
      .where(and(eq(userCalendarAccounts.notetakerJoins, true), eq(userCalendarAccounts.status, 'connected'), sql`${workspaceMembers.role} <> 'guest'`))
    const now = Date.now()
    for (const account of accounts) {
      const events = await this.calendars
        .eventsOfAccount(account.userId, account.id, new Date(now - LOOK_BEHIND_MS), new Date(now + LOOK_AHEAD_MS))
        .catch(() => [])
      for (const e of events) {
        if (e.allDay || !e.meetingUrl) continue
        const platform = meetingPlatformOf(e.meetingUrl)
        const startsAt = new Date(e.start)
        if (!platform || startsAt.getTime() < now - LOOK_BEHIND_MS || startsAt.getTime() > now + LOOK_AHEAD_MS) continue
        const [row] = await this.db
          .insert(notetakerBots)
          .values({
            workspaceId: account.workspaceId,
            userId: account.userId,
            meetingUrl: e.meetingUrl,
            platform,
            title: e.title || null,
            joinAt: startsAt,
            endsAt: new Date(e.end),
            calendarAccountId: account.id,
            calendarEventId: e.id,
            status: 'scheduled',
          })
          .onConflictDoNothing()
          .returning()
        if (!row) continue
        // A meeting already begun is joined now; one to come, when it begins.
        await this.dispatch(cfg, row, startsAt.getTime() > now + 60_000 ? startsAt : null)
      }
    }
  }

  /** Ask after a visit; when its recording is done, write its notes. */
  private async refresh(row: typeof notetakerBots.$inferSelect) {
    const cfg = this.config
    if (!cfg || !row.vendorBotId) return
    const bot = await getBot(cfg, row.vendorBotId)
    const state = stateOf(bot)
    if (state.status === 'done') {
      await this.finish(row, transcriptUrlOf(bot))
      return
    }
    if (state.status === row.status && state.detail === row.statusDetail) return
    await this.db
      .update(notetakerBots)
      .set({
        status: state.status,
        statusDetail: state.detail,
        updatedAt: new Date(),
        ...(state.status === 'failed' ? { finishedAt: new Date() } : {}),
      })
      .where(and(eq(notetakerBots.id, row.id), inArray(notetakerBots.status, ACTIVE)))
  }

  /**
   * The visit's notes, written once: claimed by moving it to `writing`, so a
   * look and an opened panel asking at the same moment write one record. The
   * transcript, the notes written from it where a model is set up, the members
   * who spoke as attendees and anybody else by name, and the owner told.
   */
  private async finish(row: typeof notetakerBots.$inferSelect, transcriptUrl: string | null) {
    const [claimed] = await this.db
      .update(notetakerBots)
      .set({ status: 'writing', updatedAt: new Date() })
      .where(and(eq(notetakerBots.id, row.id), inArray(notetakerBots.status, ACTIVE)))
      .returning()
    if (!claimed) return
    try {
      const parts = transcriptUrl ? await downloadTranscript(transcriptUrl) : []
      const transcript = transcriptText(parts)
      const notes = transcript
        ? await this.ai.notesFromTranscript(transcript, { userId: row.userId, workspaceId: row.workspaceId }).catch(() => null)
        : null
      const speakers = [...new Set(parts.map((p) => p.speaker))]
      const members = speakers.length
        ? await this.db
            .select({ id: users.id, name: users.displayName })
            .from(users)
            .innerJoin(workspaceMembers, and(eq(workspaceMembers.userId, users.id), eq(workspaceMembers.workspaceId, row.workspaceId)))
            .where(inArray(sql`lower(${users.displayName})`, speakers.map((s) => s.toLowerCase())))
        : []
      const memberNames = new Set(members.map((m) => (m.name ?? '').toLowerCase()))
      const startedAt = row.joinAt ?? row.createdAt
      const title = row.title?.trim() || `Meeting on ${startedAt.toISOString().slice(0, 10)}`
      const meeting = await this.meetingsService.create(row.workspaceId, row.userId, {
        title: title.slice(0, 200),
        startsAt: startedAt.toISOString(),
        endsAt: (row.endsAt && row.endsAt < new Date() ? row.endsAt : new Date()).toISOString(),
        provider: row.platform,
        joinUrl: row.meetingUrl,
        notes,
        attendeeIds: members.map((m) => m.id),
      })
      if (transcript) await this.db.update(meetings).set({ transcript }).where(eq(meetings.id, meeting.id))
      const outsiders = speakers.filter((s) => !memberNames.has(s.toLowerCase()))
      if (outsiders.length) {
        await this.db.insert(meetingAttendees).values(outsiders.map((name) => ({ meetingId: meeting.id, name })))
      }
      await this.db
        .update(notetakerBots)
        .set({ status: 'done', statusDetail: transcript ? null : 'no transcript', meetingId: meeting.id, updatedAt: new Date(), finishedAt: new Date() })
        .where(eq(notetakerBots.id, row.id))
      await this.notifications
        .create({
          userId: row.userId,
          workspaceId: row.workspaceId,
          type: 'meeting_notes_ready',
          title: `Meeting notes are ready: ${title}`,
          body: notes ? 'The AI Notetaker wrote the notes and kept the transcript.' : transcript ? 'The AI Notetaker kept the transcript.' : 'The AI Notetaker found nothing said to keep.',
          target: { entityType: 'meeting', entityId: meeting.id, url: `/app/${row.workspaceId}/meetings?meeting=${meeting.id}` },
        })
        .catch(() => undefined)
    } catch (e) {
      await this.db
        .update(notetakerBots)
        .set({ status: 'failed', statusDetail: `The notes could not be written: ${String((e as Error)?.message ?? e)}`.slice(0, 500), updatedAt: new Date(), finishedAt: new Date() })
        .where(eq(notetakerBots.id, row.id))
    }
  }
}

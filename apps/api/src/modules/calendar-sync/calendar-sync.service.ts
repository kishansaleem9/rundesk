import { Injectable, Inject, BadRequestException, NotFoundException } from '@nestjs/common'
import { and, eq, isNotNull } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import type { Db } from '@rundesk/db'
import { resolveIsManager, taskVisibilityFilter } from '../../common/permissions/item-visibility'
import {
  taskCalendarLinks,
  tasks,
  lists,
  projects,
  spaces,
  userIcalTokens,
  workspaceIntegrationConnections,
  taskAssignees,
  users,
  workspaceMembers,
} from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { taskInReachFilter } from '../../common/permissions/container-access.guard-helper'
import { readableTask, type ReadActor } from '../../common/permissions/read-access'

/**
 * Bidirectional calendar sync for Google Calendar + Outlook.
 *
 * Outbound: when a task with a dueDate is created/updated, we upsert an
 * event on each of the workspace's connected calendars whose owner may read
 * the task now (`ownerMayRead`). Archiving / clearing the dueDate deletes the
 * event.
 *
 * Inbound: `pullEvents` fetches recent events from the calendar and either
 * updates the linked task or creates a new task in the workspace's designated
 * inbox list (settable on the connection metadata as `inboxListId`). It runs
 * only when asked — `POST /workspaces/:ws/calendar-sync/:provider/pull`, which
 * the calendar-sync wizard calls — and nothing schedules it: this module has
 * no `@Cron` or `@Interval`. This said "a manual or scheduled `pullEvents`
 * call"; the planner's "Sync now" and a scheduled pull are the open row in
 * `docs/video2-reaudit.md` §5 ("Sync now" on the planner).
 *
 * iCal: every user has a personal `/ical/:token.ics` feed that any
 * calendar client (Outlook, Apple Calendar, Google) can subscribe to.
 * This provides one-way sync to any client without OAuth.
 */
export type CalendarProvider = 'gcal' | 'outlook'

/** What a pull answers when the connection's owner is no longer in the workspace (`ownerIsMember`). */
export const LEAVERS_CALENDAR: Record<CalendarProvider, string> = {
  gcal: 'The Google Calendar connected to this workspace belongs to somebody who is no longer in it, so nothing is pulled from it. Connect it again under your own account.',
  outlook: 'The Outlook calendar connected to this workspace belongs to somebody who is no longer in it, so nothing is pulled from it. Connect it again under your own account.',
}

type ConnectionRow = {
  id: string
  workspaceId: string
  provider: string
  accessToken: string | null
  refreshToken: string | null
  tokenExpiresAt: Date | null
  externalAccountEmail: string | null
  metadata: Record<string, unknown>
  connectedById: string | null
}

type CalendarEvent = {
  id: string
  summary: string
  description?: string
  start: Date
  end: Date
  /**
   * A day's event, with no time of day — the task's dates carry none. A timed
   * event at 17:00 in Los Angeles is UTC midnight, so its instant alone would
   * read as a day (`found-6-oct/a-time-on-utc-midnight-reads-as-no-time`).
   */
  allDay: boolean
  etag?: string
  htmlLink?: string
}

const SYNC_TARGET_CALENDAR = 'primary'

@Injectable()
export class CalendarSyncService {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  // ─── outbound: rundesk -> calendar ────────────────────────────────────────

  /**
   * Push a single task to every connected calendar in its workspace whose
   * owner may read it now (`ownerMayRead`).
   * Best-effort: failures are swallowed so a flaky calendar API doesn't
   * fail the user's task update.
   */
  async pushTask(taskId: string, expectedWorkspaceId?: string): Promise<{ pushed: CalendarProvider[]; skipped: string[] }> {
    const ctx = await this.resolveTaskContext(taskId)
    if (!ctx) return { pushed: [], skipped: ['task-not-found'] }
    // When called from an HTTP route, ensure the task actually belongs to the
    // caller's workspace (the route only proves membership of :workspaceId).
    if (expectedWorkspaceId && ctx.task.workspaceId !== expectedWorkspaceId) {
      return { pushed: [], skipped: ['task-not-in-workspace'] }
    }

    const pushed: CalendarProvider[] = []
    const skipped: string[] = []

    if (!ctx.task.dueDate || ctx.task.isArchived) {
      await this.deleteEverywhere(taskId)
      skipped.push('no-due-date-or-archived')
      return { pushed, skipped }
    }

    for (const conn of ctx.connections) {
      /*
       * ONLY INTO THE CALENDAR OF SOMEBODY WHO MAY READ THE TASK NOW
       * (`found-5-oct/calendar-push-ignores-who-may-read`). Every connection of
       * the workspace was written to, whoever had made it: a member granted
       * `integrations.manage` connected the workspace's Google Calendar, and the
       * title and description of a task in a private space they are refused
       * (403) were sent to it, and went on being sent after they were removed
       * from the workspace. A connection is its owner's own account, so it takes
       * what its owner may open — the task read rule, asked now, at every push —
       * and it stops when its owner leaves, as the iCal feed does
       * (`resolveIcalToken`). Nothing about it is deleted: the connection is
       * there to see and to disconnect.
       */
      if (!(await this.ownerMayRead(conn, ctx.task))) continue
      try {
        if (conn.provider === 'gcal') {
          await this.upsertGoogleEvent(conn, ctx.task)
          pushed.push('gcal')
        } else if (conn.provider === 'outlook') {
          await this.upsertOutlookEvent(conn, ctx.task)
          pushed.push('outlook')
        }
      } catch (err) {
        skipped.push(`${conn.provider}:${(err as Error).message}`)
      }
    }
    return { pushed, skipped }
  }

  /**
   * The route's push, by somebody who may read the task: it writes the task's
   * title and description into the workspace's calendars whose owner may read
   * it now (`ownerMayRead`), or deletes its events there. Membership of the
   * workspace was all it asked, and a member refused a private space pushed a
   * task there (`found-25-sep/task-rows-changed-by-id-anywhere`).
   */
  async pushTaskAs(taskId: string, workspaceId: string, actor: ReadActor) {
    if (!(await readableTask(this.db, workspaceId, taskId, actor))) throw new NotFoundException('Task not found')
    return this.pushTask(taskId, workspaceId)
  }

  /**
   * Remove this task's event from every connected calendar — called when
   * the task is archived/deleted or the dueDate is cleared.
   */
  async deleteEverywhere(taskId: string): Promise<void> {
    const links = await this.db
      .select()
      .from(taskCalendarLinks)
      .where(eq(taskCalendarLinks.taskId, taskId))
    if (links.length === 0) return

    const connections = await this.loadConnectionsByIds(
      [...new Set(links.map((l) => l.workspaceId))],
    )

    for (const link of links) {
      const conn = connections.find(
        (c) => c.workspaceId === link.workspaceId && c.provider === link.provider,
      )
      if (!conn) continue
      try {
        if (conn.provider === 'gcal') {
          await this.deleteGoogleEvent(conn, link.externalCalendarId, link.externalEventId)
        } else if (conn.provider === 'outlook') {
          await this.deleteOutlookEvent(conn, link.externalEventId)
        }
      } catch {
        // ignore — event may already be gone on the calendar side
      }
    }
    await this.db.delete(taskCalendarLinks).where(eq(taskCalendarLinks.taskId, taskId))
  }

  // ─── inbound: calendar -> rundesk ─────────────────────────────────────────

  /**
   * Pull recent events from a workspace's connected calendar and either
   * update the linked task (if we've seen this event before) or insert
   * a new task in the configured inbox list. Returns counts so the UI
   * can render a "synced N tasks" toast.
   */
  async pullEvents(workspaceId: string, provider: CalendarProvider): Promise<{
    created: number
    updated: number
    skipped: number
  }> {
    const conn = await this.requireConnection(workspaceId, provider)
    // Pulled only while its owner is in the workspace, as a push and a task's
    // meeting ask it (`ownerMayRead`): the pull chose a removed member's
    // connection as readily as a member's, and with a token would read their
    // calendar into the inbox list as tasks made by them
    // (`found-6-oct/calendar-pull-uses-a-leavers-connection`).
    if (!(await this.ownerIsMember(conn, workspaceId))) {
      throw new BadRequestException(LEAVERS_CALENDAR[provider])
    }
    const inboxListId = (conn.metadata as { inboxListId?: string })?.inboxListId
    if (!inboxListId) {
      throw new BadRequestException(
        `No inbox list configured for ${provider}. Set metadata.inboxListId on the connection first.`,
      )
    }

    const events =
      provider === 'gcal'
        ? await this.listGoogleEvents(conn)
        : await this.listOutlookEvents(conn)

    let created = 0
    let updated = 0
    let skipped = 0
    for (const event of events) {
      // THIS workspace's link to the event. An event id is the provider's, and
      // a link in another workspace carrying the same one — the same calendar
      // connected twice, or an id a calendar's owner chose — is not this
      // pull's to overwrite.
      const [existing] = await this.db
        .select()
        .from(taskCalendarLinks)
        .where(
          and(
            eq(taskCalendarLinks.workspaceId, workspaceId),
            eq(taskCalendarLinks.provider, provider),
            eq(taskCalendarLinks.externalEventId, event.id),
          ),
        )
        .limit(1)

      if (existing) {
        if (existing.etag === event.etag) {
          skipped += 1
          continue
        }
        await this.db
          .update(tasks)
          .set({
            title: event.summary,
            description: event.description ?? null,
            dueDate: event.end,
            startDate: event.start,
            dueDateHasTime: !event.allDay,
            startDateHasTime: !event.allDay,
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, existing.taskId))
        await this.db
          .update(taskCalendarLinks)
          .set({ etag: event.etag ?? null, lastSyncedAt: new Date(), updatedAt: new Date() })
          .where(eq(taskCalendarLinks.id, existing.id))
        updated += 1
      } else {
        const [task] = await this.db
          .insert(tasks)
          .values({
            listId: inboxListId,
            title: event.summary,
            description: event.description ?? null,
            startDate: event.start,
            dueDate: event.end,
            startDateHasTime: !event.allDay,
            dueDateHasTime: !event.allDay,
            createdById: conn.connectedById ?? null,
          })
          .returning()
        await this.db.insert(taskCalendarLinks).values({
          taskId: task.id,
          userId: conn.connectedById ?? task.createdById!,
          workspaceId,
          provider,
          externalCalendarId: SYNC_TARGET_CALENDAR,
          externalEventId: event.id,
          etag: event.etag ?? null,
        })
        created += 1
      }
    }
    return { created, updated, skipped }
  }

  // ─── iCal feed ────────────────────────────────────────────────────────────

  /**
   * Mint (or rotate) a personal iCal subscription token for a user in a
   * workspace. The returned token is the secret half of the public feed
   * URL `/ical/{token}.ics`.
   */
  /**
   * Return the user's existing (non-revoked) iCal token without rotating it,
   * minting one only if none exists. Used for read/display so opening the
   * dialog doesn't invalidate already-distributed subscription URLs.
   */
  async getOrCreateIcalToken(userId: string, workspaceId: string): Promise<{ token: string; url: string }> {
    const [existing] = await this.db
      .select()
      .from(userIcalTokens)
      .where(and(eq(userIcalTokens.userId, userId), eq(userIcalTokens.workspaceId, workspaceId)))
      .limit(1)
    if (existing && !existing.revokedAt) {
      const base = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3001'
      return { token: existing.token, url: `${base}/ical/${existing.token}.ics` }
    }
    return this.mintIcalToken(userId, workspaceId)
  }

  async mintIcalToken(userId: string, workspaceId: string): Promise<{ token: string; url: string }> {
    const token = `ical_${randomBytes(24).toString('base64url')}`
    await this.db
      .insert(userIcalTokens)
      .values({ userId, workspaceId, token })
      .onConflictDoUpdate({
        target: [userIcalTokens.userId, userIcalTokens.workspaceId],
        set: { token, revokedAt: null, createdAt: new Date() },
      })

    const base = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3001'
    return { token, url: `${base}/ical/${token}.ics` }
  }

  async revokeIcalToken(userId: string, workspaceId: string): Promise<void> {
    await this.db
      .update(userIcalTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(userIcalTokens.userId, userId), eq(userIcalTokens.workspaceId, workspaceId)))
  }

  /**
   * Look up the iCal token + return the user/workspace it points at. Used
   * by the public feed endpoint to authorise the request without a JWT.
   */
  async resolveIcalToken(token: string): Promise<{ userId: string; workspaceId: string } | null> {
    const [row] = await this.db
      .select()
      .from(userIcalTokens)
      .where(eq(userIcalTokens.token, token))
      .limit(1)
    if (!row || row.revokedAt) return null
    /*
     * THE OWNER MUST STILL BELONG TO THE WORKSPACE, read at every fetch. The
     * token was checked for revocation only: measured on lane 1, a member
     * removed from the workspace (404 on it) kept a working feed, which went
     * on serving tasks made after the removal.
     */
    const [member] = await this.db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, row.workspaceId), eq(workspaceMembers.userId, row.userId)))
      .limit(1)
    if (!member) return null
    // Best-effort lastUsedAt; failure here doesn't block the feed.
    void this.db
      .update(userIcalTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(userIcalTokens.id, row.id))
      .catch(() => undefined)
    return { userId: row.userId, workspaceId: row.workspaceId }
  }

  /**
   * Build an RFC 5545 VCALENDAR document for every task in the workspace
   * the user has access to. Any client that supports iCalendar subscriptions
   * (Outlook, Apple Calendar, Google, Fantastical) will refresh this on
   * its own cadence — usually 1-24 hours.
   */
  async buildIcalFeed(userId: string, workspaceId: string): Promise<string> {
    // §2 per-item privacy: the token identifies one user — only surface private
    // tasks they may see (creator/assignee/manager); exclude everyone else's.
    const isManager = await resolveIsManager(this.db, workspaceId, userId)
    // And the container rule: only the private-item rule applied, so the feed
    // carried the dated tasks of private spaces its owner is refused (measured
    // on lane 1, title and description).
    const visFilter = and(taskInReachFilter(this.db, workspaceId, userId, isManager), taskVisibilityFilter(this.db, userId, isManager))
    const rows = await this.db
      .select({
        id: tasks.id,
        title: tasks.title,
        description: tasks.description,
        startDate: tasks.startDate,
        dueDate: tasks.dueDate,
        updatedAt: tasks.updatedAt,
        status: tasks.status,
        listId: tasks.listId,
      })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .leftJoin(taskAssignees, eq(taskAssignees.taskId, tasks.id))
      .where(
        and(
          eq(spaces.workspaceId, workspaceId),
          eq(tasks.isArchived, false),
          isNotNull(tasks.dueDate),
          visFilter,
        ),
      )

    // Tasks can appear multiple times due to the assignee left join; dedupe.
    const seen = new Set<string>()
    const events: string[] = []
    for (const row of rows) {
      if (seen.has(row.id)) continue
      seen.add(row.id)
      if (!row.dueDate) continue
      events.push(this.formatVEvent(row, workspaceId))
    }

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Rundesk//ICAL Subscription//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:Rundesk · ${workspaceId.slice(0, 8)}`,
      'X-WR-TIMEZONE:UTC',
      ...events,
      'END:VCALENDAR',
    ]
    return lines.join('\r\n')
  }

  private formatVEvent(
    row: {
      id: string
      title: string
      description: string | null
      startDate: Date | null
      dueDate: Date | null
      updatedAt: Date
      status: string
    },
    workspaceId: string,
  ): string {
    const start = row.startDate ?? row.dueDate!
    const end = row.dueDate!
    const wrap = (key: string, value: string) => `${key}:${this.escapeIcsText(value)}`
    return [
      'BEGIN:VEVENT',
      `UID:task-${row.id}@rundesk`,
      `DTSTAMP:${this.formatIcsDate(row.updatedAt)}`,
      `DTSTART:${this.formatIcsDate(start)}`,
      `DTEND:${this.formatIcsDate(end)}`,
      wrap('SUMMARY', row.title),
      row.description ? wrap('DESCRIPTION', row.description) : null,
      `STATUS:${row.status === 'done' || row.status === 'cancelled' ? 'CONFIRMED' : 'TENTATIVE'}`,
      `URL:${process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000'}/app/${workspaceId}?task=${row.id}`,
      'END:VEVENT',
    ]
      .filter((l): l is string => Boolean(l))
      .join('\r\n')
  }

  private formatIcsDate(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0')
    return (
      `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
      `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
    )
  }

  private escapeIcsText(text: string): string {
    // Per RFC 5545: backslash, comma, semicolon, and newlines need escaping.
    return text
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\n')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;')
  }

  // ─── google calendar HTTP layer ───────────────────────────────────────────

  private async upsertGoogleEvent(conn: ConnectionRow, task: TaskForSync): Promise<void> {
    const token = await this.ensureFreshToken(conn)
    const [existingLink] = await this.db
      .select()
      .from(taskCalendarLinks)
      .where(
        and(
          eq(taskCalendarLinks.taskId, task.id),
          eq(taskCalendarLinks.provider, 'gcal'),
          eq(taskCalendarLinks.userId, conn.connectedById!),
        ),
      )
      .limit(1)

    const body = JSON.stringify({
      summary: task.title,
      description: task.description ?? undefined,
      start: { dateTime: (task.startDate ?? task.dueDate!).toISOString() },
      end:   { dateTime: task.dueDate!.toISOString() },
      // Embedding the task id makes the round-trip back identifiable.
      extendedProperties: { private: { rundeskTaskId: task.id } },
    })

    const url = existingLink
      ? `https://www.googleapis.com/calendar/v3/calendars/${SYNC_TARGET_CALENDAR}/events/${existingLink.externalEventId}`
      : `https://www.googleapis.com/calendar/v3/calendars/${SYNC_TARGET_CALENDAR}/events`

    const res = await fetch(url, {
      method: existingLink ? 'PUT' : 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body,
    })
    if (!res.ok) {
      throw new Error(`Google Calendar ${existingLink ? 'PUT' : 'POST'} ${res.status}: ${await res.text()}`)
    }
    const event = (await res.json()) as { id: string; etag?: string }
    if (existingLink) {
      await this.db
        .update(taskCalendarLinks)
        .set({ etag: event.etag ?? null, lastSyncedAt: new Date(), updatedAt: new Date() })
        .where(eq(taskCalendarLinks.id, existingLink.id))
    } else {
      await this.db.insert(taskCalendarLinks).values({
        taskId: task.id,
        userId: conn.connectedById!,
        workspaceId: conn.workspaceId,
        provider: 'gcal',
        externalCalendarId: SYNC_TARGET_CALENDAR,
        externalEventId: event.id,
        etag: event.etag ?? null,
      })
    }
  }

  private async deleteGoogleEvent(conn: ConnectionRow, calendarId: string, eventId: string): Promise<void> {
    const token = await this.ensureFreshToken(conn)
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
    )
    // 404/410 mean the event is already gone — treat as success.
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      throw new Error(`Google Calendar DELETE ${res.status}: ${await res.text()}`)
    }
  }

  private async listGoogleEvents(conn: ConnectionRow): Promise<CalendarEvent[]> {
    const token = await this.ensureFreshToken(conn)
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const url = `https://www.googleapis.com/calendar/v3/calendars/${SYNC_TARGET_CALENDAR}/events?updatedMin=${encodeURIComponent(since)}&singleEvents=true&maxResults=250`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) {
      throw new Error(`Google Calendar LIST ${res.status}: ${await res.text()}`)
    }
    const body = (await res.json()) as {
      items?: Array<{
        id: string
        etag?: string
        summary?: string
        description?: string
        start?: { dateTime?: string; date?: string }
        end?: { dateTime?: string; date?: string }
        extendedProperties?: { private?: { rundeskTaskId?: string } }
        status?: string
        htmlLink?: string
      }>
    }
    return (body.items ?? [])
      .filter((e) => e.status !== 'cancelled' && e.start && (e.start.dateTime || e.start.date))
      .map((e) => ({
        id: e.id,
        summary: e.summary ?? '(untitled)',
        description: e.description,
        start: new Date(e.start!.dateTime ?? e.start!.date!),
        end: new Date(e.end?.dateTime ?? e.end?.date ?? e.start!.dateTime ?? e.start!.date!),
        // Google gives a day's event a `date` and a timed one a `dateTime`.
        allDay: !e.start!.dateTime,
        etag: e.etag,
        htmlLink: e.htmlLink,
      }))
  }

  // ─── outlook (microsoft graph) HTTP layer ─────────────────────────────────

  private async upsertOutlookEvent(conn: ConnectionRow, task: TaskForSync): Promise<void> {
    const token = await this.ensureFreshToken(conn)
    const [existingLink] = await this.db
      .select()
      .from(taskCalendarLinks)
      .where(
        and(
          eq(taskCalendarLinks.taskId, task.id),
          eq(taskCalendarLinks.provider, 'outlook'),
          eq(taskCalendarLinks.userId, conn.connectedById!),
        ),
      )
      .limit(1)

    const body = JSON.stringify({
      subject: task.title,
      body: { contentType: 'text', content: task.description ?? '' },
      start: { dateTime: (task.startDate ?? task.dueDate!).toISOString(), timeZone: 'UTC' },
      end:   { dateTime: task.dueDate!.toISOString(), timeZone: 'UTC' },
      singleValueExtendedProperties: [
        {
          // Microsoft Graph's flavour of custom metadata. The GUID identifies
          // our extension; the value lets us round-trip the task id.
          id: 'String {6e7f5f3a-1234-5678-9abc-def012345678} Name rundeskTaskId',
          value: task.id,
        },
      ],
    })

    const url = existingLink
      ? `https://graph.microsoft.com/v1.0/me/events/${existingLink.externalEventId}`
      : `https://graph.microsoft.com/v1.0/me/events`

    const res = await fetch(url, {
      method: existingLink ? 'PATCH' : 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body,
    })
    if (!res.ok) {
      throw new Error(`Outlook ${existingLink ? 'PATCH' : 'POST'} ${res.status}: ${await res.text()}`)
    }
    const event = (await res.json()) as { id: string; '@odata.etag'?: string }
    const etag = event['@odata.etag'] ?? null
    if (existingLink) {
      await this.db
        .update(taskCalendarLinks)
        .set({ etag, lastSyncedAt: new Date(), updatedAt: new Date() })
        .where(eq(taskCalendarLinks.id, existingLink.id))
    } else {
      await this.db.insert(taskCalendarLinks).values({
        taskId: task.id,
        userId: conn.connectedById!,
        workspaceId: conn.workspaceId,
        provider: 'outlook',
        externalCalendarId: 'me',
        externalEventId: event.id,
        etag,
      })
    }
  }

  private async deleteOutlookEvent(conn: ConnectionRow, eventId: string): Promise<void> {
    const token = await this.ensureFreshToken(conn)
    const res = await fetch(`https://graph.microsoft.com/v1.0/me/events/${eventId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      throw new Error(`Outlook DELETE ${res.status}: ${await res.text()}`)
    }
  }

  private async listOutlookEvents(conn: ConnectionRow): Promise<CalendarEvent[]> {
    const token = await this.ensureFreshToken(conn)
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const url = `https://graph.microsoft.com/v1.0/me/events?$filter=lastModifiedDateTime ge ${since}&$top=250`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) {
      throw new Error(`Outlook LIST ${res.status}: ${await res.text()}`)
    }
    const body = (await res.json()) as {
      value?: Array<{
        id: string
        '@odata.etag'?: string
        subject?: string
        bodyPreview?: string
        start?: { dateTime?: string }
        end?: { dateTime?: string }
        isAllDay?: boolean
        isCancelled?: boolean
      }>
    }
    return (body.value ?? [])
      .filter((e) => !e.isCancelled && e.start?.dateTime && e.end?.dateTime)
      .map((e) => ({
        id: e.id,
        summary: e.subject ?? '(untitled)',
        description: e.bodyPreview,
        start: new Date(e.start!.dateTime!),
        end: new Date(e.end!.dateTime!),
        allDay: e.isAllDay === true,
        etag: e['@odata.etag'],
      }))
  }

  // ─── shared HTTP / token helpers ──────────────────────────────────────────

  /**
   * Return a usable access token for this connection, refreshing via the
   * refresh_token grant if it's expired or near expiry (60s buffer).
   * Updates the persisted token + expiry on success.
   */
  private async ensureFreshToken(conn: ConnectionRow): Promise<string> {
    if (!conn.accessToken) throw new BadRequestException(`No access token for ${conn.provider}`)
    const expiresIn = conn.tokenExpiresAt ? conn.tokenExpiresAt.getTime() - Date.now() : Infinity
    if (expiresIn > 60_000) return conn.accessToken

    if (!conn.refreshToken) {
      throw new BadRequestException(`Token expired for ${conn.provider} and no refresh_token stored`)
    }

    const cfg = this.getProviderTokenConfig(conn.provider as CalendarProvider)
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: conn.refreshToken,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    })
    const res = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    if (!res.ok) {
      throw new Error(`OAuth refresh failed for ${conn.provider}: ${res.status} ${await res.text()}`)
    }
    const body = (await res.json()) as { access_token: string; expires_in?: number; refresh_token?: string }
    const newExpiry = body.expires_in
      ? new Date(Date.now() + body.expires_in * 1000)
      : null
    await this.db
      .update(workspaceIntegrationConnections)
      .set({
        accessToken: body.access_token,
        refreshToken: body.refresh_token ?? conn.refreshToken,
        tokenExpiresAt: newExpiry,
        updatedAt: new Date(),
      })
      .where(eq(workspaceIntegrationConnections.id, conn.id))

    conn.accessToken = body.access_token
    conn.tokenExpiresAt = newExpiry
    return body.access_token
  }

  private getProviderTokenConfig(provider: CalendarProvider): {
    tokenUrl: string
    clientId: string
    clientSecret: string
  } {
    if (provider === 'gcal') {
      return {
        tokenUrl: 'https://oauth2.googleapis.com/token',
        clientId: process.env.GOOGLE_CLIENT_ID ?? '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      }
    }
    return {
      tokenUrl:
        process.env.MICROSOFT_TOKEN_URL ??
        'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      clientId: process.env.MICROSOFT_CLIENT_ID ?? '',
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET ?? '',
    }
  }

  // ─── lookups ──────────────────────────────────────────────────────────────

  private async resolveTaskContext(
    taskId: string,
  ): Promise<{ task: TaskForSync; connections: ConnectionRow[] } | null> {
    const [row] = await this.db
      .select({
        id: tasks.id,
        title: tasks.title,
        description: tasks.description,
        startDate: tasks.startDate,
        dueDate: tasks.dueDate,
        isArchived: tasks.isArchived,
        workspaceId: spaces.workspaceId,
      })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(tasks.id, taskId))
      .limit(1)
    if (!row) return null
    const connections = await this.loadConnectionsByIds([row.workspaceId])
    return { task: row, connections }
  }

  /**
   * Whether this connection's owner may open this task now: still a member of
   * the task's workspace — the iCal feed's rule, asked of a platform admin too
   * — and let in by the task read rule (`readableTask`), asked with their
   * account's role as every read asks it. A connection nobody owns any more
   * (`connected_by_id` is set null when the account goes) is nobody's to read.
   * The push asks it of every calendar, and a task's Google Meet or Zoom of
   * the connection it is made in (`TasksService.createTaskMeeting`).
   */
  async ownerMayRead(conn: { connectedById: string | null }, task: { id: string; workspaceId: string }): Promise<boolean> {
    const ownerId = conn.connectedById
    if (!ownerId) return false
    const [member] = await this.db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, task.workspaceId), eq(workspaceMembers.userId, ownerId)))
      .limit(1)
    if (!member) return false
    const [account] = await this.db.select({ role: users.role }).from(users).where(eq(users.id, ownerId)).limit(1)
    return (await readableTask(this.db, task.workspaceId, task.id, { id: ownerId, role: account?.role })) !== null
  }

  /**
   * Whether this connection's owner is still a member of the workspace — the
   * half of `ownerMayRead` that asks nothing of a task, which a pull has none
   * of. A connection nobody owns any more is nobody's.
   */
  private async ownerIsMember(conn: { connectedById: string | null }, workspaceId: string): Promise<boolean> {
    if (!conn.connectedById) return false
    const [member] = await this.db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, conn.connectedById)))
      .limit(1)
    return Boolean(member)
  }

  private async loadConnectionsByIds(workspaceIds: string[]): Promise<ConnectionRow[]> {
    if (workspaceIds.length === 0) return []
    const rows = await this.db
      .select()
      .from(workspaceIntegrationConnections)
      .where(eq(workspaceIntegrationConnections.status, 'connected'))
    return rows
      .filter((r) => workspaceIds.includes(r.workspaceId))
      .filter((r) => r.provider === 'gcal' || r.provider === 'outlook')
      .map(toConnectionRow)
  }

  private async requireConnection(
    workspaceId: string,
    provider: CalendarProvider,
  ): Promise<ConnectionRow> {
    const [row] = await this.db
      .select()
      .from(workspaceIntegrationConnections)
      .where(
        and(
          eq(workspaceIntegrationConnections.workspaceId, workspaceId),
          eq(workspaceIntegrationConnections.provider, provider),
          eq(workspaceIntegrationConnections.status, 'connected'),
        ),
      )
      .limit(1)
    if (!row) {
      throw new NotFoundException(`No connected ${provider} integration for workspace ${workspaceId}`)
    }
    return toConnectionRow(row)
  }
}

type TaskForSync = {
  id: string
  title: string
  description: string | null
  startDate: Date | null
  dueDate: Date | null
  isArchived: boolean
  workspaceId: string
}

function toConnectionRow(r: {
  id: string
  workspaceId: string
  provider: string
  accessToken: string | null
  refreshToken: string | null
  tokenExpiresAt: Date | null
  externalAccountEmail: string | null
  metadata: Record<string, unknown>
  connectedById: string | null
}): ConnectionRow {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    provider: r.provider,
    accessToken: r.accessToken,
    refreshToken: r.refreshToken,
    tokenExpiresAt: r.tokenExpiresAt,
    externalAccountEmail: r.externalAccountEmail,
    metadata: r.metadata,
    connectedById: r.connectedById,
  }
}

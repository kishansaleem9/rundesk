import type Anthropic from '@anthropic-ai/sdk'
import { EMAIL_BODY_MAX, EMAIL_SUBJECT_MAX, emailAddress, emailRecipients } from '../tasks/comment-email'

/**
 * THE AI ACTS IN A CONNECTED APP, AS THE PERSON WHO ASKED (`ledger-rows/row-2294`).
 *
 * ClickUp's AI works through a person's own connections and acts as that
 * person. With Google Calendar it creates an event — a title (the one thing it
 * needs), a start, a duration, a description, a location and attendees — and
 * drafts the invite for the person to approve. With Gmail it creates drafts and
 * searches them. Connected Search lets it read what the person's apps hold
 * (help centre, "Use Gmail tools with ClickUp AI" and "Google Calendar
 * integration"; AlternativeTo, July 2025, "connection between Brain and Google
 * Calendar"; read through search excerpts, 12 October).
 *
 * The same three are offered here, on the command path's preview, where
 * nothing is written until the person confirms:
 *
 *   · `create_calendar_event` — an event in the asker's own calendar, the one
 *     their planner writes to (Google or Outlook), with its attendees invited;
 *   · `draft_email` — a draft in a mailbox the asker linked themselves
 *     (`found-9-oct/task-email-sends-from-the-server`), left in their Drafts
 *     and never sent from here;
 *   · `search_connected_apps` — READ-ONLY: what the asker's own Google Drive,
 *     Gmail and SharePoint hold, searched as Connected Search searches them for
 *     that person (`found-23-sep/connected-search-per-person`).
 *
 * Everything in this file is pure: the planner's half. `AiService.executeOne`
 * writes, after the person confirms, and checks again everything an action
 * carries, because an action comes back in the body of `/ai/command/execute`.
 */

/** The asker's calendar that new events are written to: their default one. */
export type ConnectedCalendar = { provider: 'gcal' | 'outlook'; email: string | null }

/** A mailbox the asker linked themselves. */
export type ConnectedMailbox = { id: string; provider: 'gmail' | 'outlook' | 'imap'; address: string }

/** What the planner knows of the asker's own connections. */
export type ConnectedContext = {
  calendar: ConnectedCalendar | null
  mailbox: ConnectedMailbox | null
  /** Why there is no mailbox to write in, when that is not simply that none is linked. */
  mailboxRefusal?: string | null
  /** The asker's own time zone (an IANA name): what "10:00" means to them. */
  timeZone: string
}

/** One thing a connected app holds, as Connected Search answers it. */
export type ConnectedHit = { source: 'drive' | 'gmail' | 'sharepoint'; title: string; url: string; snippet: string }

/** What one search of the asker's connected apps found, or why it found nothing. */
export type ConnectedSearchResult = { query: string; hits: ConnectedHit[]; refusal?: string }

export const CONNECTED_REFUSALS = {
  noCalendar:
    'You have no calendar connected to add events to: connect Google Calendar or Outlook in the Planner, under Calendars, and ask again',
  calendarRefused: (name: string) =>
    `${name} refused the grant Rundesk holds for your calendar: connect it again in the Planner, under Calendars`,
  noMailbox:
    'You have linked no mailbox of your own to write drafts in: link Gmail, Outlook or another mailbox over IMAP in Email settings, and ask again',
  noSearchSource:
    'You have connected none of your own apps to search: connect Google Drive, Gmail or SharePoint in the App Center, under Connected Search, and ask again',
  notMember: 'You are not a member of that workspace',
  unavailable: 'This server cannot reach connected apps',
} as const

/** The longest event the AI makes: a day. */
export const EVENT_MAX_MINUTES = 24 * 60
/** The most people one event invites. */
export const EVENT_MAX_ATTENDEES = 50
export const EVENT_TITLE_MAX = 255
export const EVENT_DESCRIPTION_MAX = 8_000
export const EVENT_LOCATION_MAX = 500
const DEFAULT_MINUTES = 30

/**
 * The connected-app tools offered to the model. The two that write are
 * previewed like the task tools; the search is answered during the turn, as
 * `search_tasks` is, so the model can act on what it found.
 */
export const CONNECTED_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: 'create_calendar_event',
    description:
      "Add an event to the asker's OWN connected calendar (Google Calendar or Outlook) and invite people to it. PREVIEWED for the user to confirm: nothing is written until they do. Give the start as the asker's local time.",
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'The event title.' },
        start: { type: 'string', description: "The start, in the asker's own time zone: YYYY-MM-DDTHH:mm." },
        durationMinutes: { type: 'number', description: 'How long it lasts, in minutes (30 if not said).' },
        description: { type: 'string', description: 'Optional words for the invite.' },
        location: { type: 'string', description: 'Optional place or meeting link.' },
        attendeeEmails: {
          type: 'array',
          items: { type: 'string' },
          description: 'Who to invite, by email address (workspace members by the email in "Workspace context").',
        },
      },
      required: ['title', 'start'],
    },
  },
  {
    name: 'draft_email',
    description:
      "Write an email as a DRAFT in a mailbox the asker linked themselves (Gmail, Outlook, or another over IMAP). It is saved in their Drafts for them to send; it is never sent from here. PREVIEWED for the user to confirm.",
    input_schema: {
      type: 'object',
      properties: {
        to: { type: 'array', items: { type: 'string' }, description: 'Who it goes to, by email address.' },
        cc: { type: 'array', items: { type: 'string' }, description: 'Who it is copied to.' },
        subject: { type: 'string', description: 'The subject line.' },
        body: { type: 'string', description: 'The email, in plain text.' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'search_connected_apps',
    description:
      "READ-ONLY. Search what the asker's own connected apps hold — their Google Drive, Gmail and SharePoint, as they connected them for themselves — by a free-text query. Returns titles and links.",
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to look for.' },
      },
      required: ['query'],
    },
  },
]

/** The two that write, previewed and confirmed. */
export const CONNECTED_ACTION_TOOLS: ReadonlySet<string> = new Set(['create_calendar_event', 'draft_email'])
export const CONNECTED_SEARCH_TOOL = 'search_connected_apps'

/**
 * WHAT A COMMAND TURN IS FILED UNDER IN `ai_usage`, by what the model reached
 * for in it: §V2-11's last two tiles, "External app actions" and "External app
 * searches", count these. A turn is one call to the model whichever it is, so
 * nothing is counted twice; the label is all that changes.
 */
export const COMMAND_USAGE_FEATURES = ['command', 'command.connected_action', 'command.connected_search'] as const
export type CommandUsageFeature = (typeof COMMAND_USAGE_FEATURES)[number]

export function commandUsageFeature(content: ReadonlyArray<{ type: string; name?: string }>): CommandUsageFeature {
  const used = content.filter((b) => b.type === 'tool_use').map((b) => b.name ?? '')
  if (used.some((name) => CONNECTED_ACTION_TOOLS.has(name))) return 'command.connected_action'
  if (used.includes(CONNECTED_SEARCH_TOOL)) return 'command.connected_search'
  return 'command'
}

const text = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim().slice(0, max) : ''
const line = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max) : ''
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : typeof value === 'string' ? value.split(/[,;]/) : []

/** Is this an IANA zone the runtime knows? */
export function isTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

function wallParts(ms: number, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]))
  return { y: Number(p.year), mo: Number(p.month), d: Number(p.day), h: Number(p.hour) % 24, mi: Number(p.minute) }
}

/**
 * THE INSTANT A WALL-CLOCK TIME NAMES IN A ZONE: "2026-10-14T10:00" in
 * Asia/Karachi is 05:00 UTC. Null when the time is not one, or the date is not
 * a real day (the 30th of February). Two passes, so a time beside a
 * daylight-saving change takes the offset of its own side of it.
 */
export function zonedInstant(local: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::00(?:\.0+)?)?$/.exec(local.trim())
  if (!m || !isTimeZone(timeZone)) return null
  const [y, mo, d, h, mi] = m.slice(1).map(Number)
  if (mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59) return null
  const asUtc = Date.UTC(y, mo - 1, d, h, mi)
  const day = new Date(asUtc)
  if (day.getUTCFullYear() !== y || day.getUTCMonth() !== mo - 1 || day.getUTCDate() !== d) return null
  const offsetAt = (ms: number) => {
    const w = wallParts(ms, timeZone)
    return Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi) - Math.floor(ms / 60_000) * 60_000
  }
  let ms = asUtc - offsetAt(asUtc)
  ms = asUtc - offsetAt(ms)
  return new Date(ms)
}

/** "2026-10-14 10:00", as the clock reads in the zone. */
export function wallTime(at: Date, timeZone: string): string {
  const w = wallParts(at.getTime(), timeZone)
  const two = (n: number) => String(n).padStart(2, '0')
  return `${w.y}-${two(w.mo)}-${two(w.d)} ${two(w.h)}:${two(w.mi)}`
}

const listed = (xs: string[]): string =>
  xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`

export const providerName = (provider: string): string =>
  provider === 'gcal' ? 'Google Calendar' : provider === 'outlook' ? 'Outlook' : provider === 'gmail' ? 'Gmail' : provider === 'imap' ? 'IMAP' : provider

export type CalendarEventArgs = {
  workspaceId: string
  title: string
  /** ISO instants. */
  start: string
  end: string
  /** The zone the asker meant, and the times the preview showed them in. */
  timeZone: string
  description?: string
  location?: string
  attendees: string[]
}

export type EmailDraftArgs = {
  workspaceId: string
  accountId: string
  to: string[]
  cc: string[]
  subject: string
  body: string
}

/**
 * AN EVENT, AS IT GOES — refused, in words, when it cannot. Used twice: by the
 * planner on what the model asked for, and by the executor on what came back
 * in the body, which nobody vouches for.
 */
export function checkedEvent(input: {
  title?: unknown
  start: Date | null
  end: Date | null
  description?: unknown
  location?: unknown
  attendees?: unknown
}): { ok: true; event: Omit<CalendarEventArgs, 'workspaceId' | 'timeZone'> } | { ok: false; message: string } {
  const title = line(input.title, EVENT_TITLE_MAX)
  if (!title) return { ok: false, message: 'An event needs a title' }
  if (!input.start || !input.end || Number.isNaN(input.start.getTime()) || Number.isNaN(input.end.getTime())) {
    return { ok: false, message: `“${title}” needs a start, as a day and a time` }
  }
  const minutes = (input.end.getTime() - input.start.getTime()) / 60_000
  if (!(minutes >= 5) || minutes > EVENT_MAX_MINUTES) {
    return { ok: false, message: `“${title}” lasts 5 minutes to ${EVENT_MAX_MINUTES / 60} hours` }
  }
  const attendees: string[] = []
  for (const raw of strings(input.attendees)) {
    if (!raw.trim()) continue
    const address = emailAddress(raw)
    if (!address) return { ok: false, message: `“${raw.trim().slice(0, 100)}” is not an email address` }
    if (!attendees.includes(address)) attendees.push(address)
  }
  if (attendees.length > EVENT_MAX_ATTENDEES) return { ok: false, message: `An event invites ${EVENT_MAX_ATTENDEES} people at most` }
  const description = text(input.description, EVENT_DESCRIPTION_MAX)
  const location = line(input.location, EVENT_LOCATION_MAX)
  return {
    ok: true,
    event: {
      title,
      start: input.start.toISOString(),
      end: input.end.toISOString(),
      ...(description ? { description } : {}),
      ...(location ? { location } : {}),
      attendees,
    },
  }
}

/** An email draft, as it goes — refused in words when it cannot. Used by the planner and the executor alike. */
export function checkedDraft(input: { to?: unknown; cc?: unknown; subject?: unknown; body?: unknown }):
  | { ok: true; draft: Omit<EmailDraftArgs, 'workspaceId' | 'accountId'> }
  | { ok: false; message: string } {
  const recipients = emailRecipients({ to: strings(input.to), cc: strings(input.cc) })
  if (!recipients.ok) return { ok: false, message: recipients.message }
  const subject = line(input.subject, EMAIL_SUBJECT_MAX)
  const body = text(input.body, EMAIL_BODY_MAX + 1)
  if (!body) return { ok: false, message: 'A draft needs words' }
  if (body.length > EMAIL_BODY_MAX) return { ok: false, message: `An email is ${EMAIL_BODY_MAX.toLocaleString('en-US')} characters at most` }
  return { ok: true, draft: { to: recipients.recipients.to, cc: recipients.recipients.cc, subject, body } }
}

/** What the planner returns for one connected-app call: an action to preview, or why it is not one. */
export type ConnectedPlanned =
  | { action: { tool: 'create_calendar_event'; args: CalendarEventArgs; humanLabel: string } }
  | { action: { tool: 'draft_email'; args: EmailDraftArgs; humanLabel: string } }
  | { warning: string }

/**
 * `create_calendar_event`, planned. The start is the asker's local time, turned
 * into an instant in their own zone; the label says it back in that zone, with
 * the calendar it goes into and whom it invites, so what the person confirms is
 * what is written.
 */
export function planCalendarEvent(input: Record<string, unknown>, workspaceId: string, connected: ConnectedContext | undefined): ConnectedPlanned {
  const title = line(input.title, EVENT_TITLE_MAX) || 'the event'
  const calendar = connected?.calendar
  if (!connected || !calendar) return { warning: `Skipped the event “${title}”: ${CONNECTED_REFUSALS.noCalendar}.` }
  const zone = isTimeZone(connected.timeZone) ? connected.timeZone : 'UTC'
  const start = typeof input.start === 'string' ? zonedInstant(input.start, zone) : null
  const minutesAsked = Number(input.durationMinutes ?? DEFAULT_MINUTES)
  const minutes = Number.isFinite(minutesAsked) && minutesAsked > 0 ? Math.round(minutesAsked) : DEFAULT_MINUTES
  const end = start ? new Date(start.getTime() + minutes * 60_000) : null
  const checked = checkedEvent({ title: input.title, start, end, description: input.description, location: input.location, attendees: input.attendeeEmails })
  if (!checked.ok) return { warning: `Skipped the event “${title}”: ${checked.message}.` }
  const e = checked.event
  const from = wallTime(new Date(e.start), zone)
  const to = wallTime(new Date(e.end), zone)
  const until = from.slice(0, 10) === to.slice(0, 10) ? to.slice(11) : to
  const where = `${providerName(calendar.provider)}${calendar.email ? ` (${calendar.email})` : ''}`
  return {
    action: {
      tool: 'create_calendar_event',
      args: { workspaceId, timeZone: zone, ...e },
      humanLabel: `Add “${e.title}” to your ${where} on ${from}–${until} (${zone})${
        e.attendees.length ? `, inviting ${listed(e.attendees)}` : ''
      }`,
    },
  }
}

/** `draft_email`, planned: in the asker's own mailbox, never sent. */
export function planEmailDraft(input: Record<string, unknown>, workspaceId: string, connected: ConnectedContext | undefined): ConnectedPlanned {
  const subject = line(input.subject, EMAIL_SUBJECT_MAX)
  const named = subject ? `the draft “${subject}”` : 'a draft'
  const mailbox = connected?.mailbox
  if (!mailbox) return { warning: `Skipped ${named}: ${connected?.mailboxRefusal || CONNECTED_REFUSALS.noMailbox}.` }
  const checked = checkedDraft(input)
  if (!checked.ok) return { warning: `Skipped ${named}: ${checked.message}.` }
  const d = checked.draft
  return {
    action: {
      tool: 'draft_email',
      args: { workspaceId, accountId: mailbox.id, ...d },
      humanLabel: `Save a draft in ${mailbox.address} (${providerName(mailbox.provider)}) to ${listed(d.to)}${
        d.cc.length ? `, copying ${listed(d.cc)}` : ''
      }: “${d.subject || '(no subject)'}”`,
    },
  }
}

/** A search's answer as the planner keeps it — what the service attached to the call, when it is one. */
export function connectedSearchOf(value: unknown): ConnectedSearchResult | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Partial<ConnectedSearchResult>
  if (typeof v.query !== 'string' || !Array.isArray(v.hits)) return null
  return { query: v.query, hits: v.hits, ...(typeof v.refusal === 'string' ? { refusal: v.refusal } : {}) }
}

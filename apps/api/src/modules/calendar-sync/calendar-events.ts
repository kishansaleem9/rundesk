/**
 * A PERSON'S CONNECTED CALENDARS, READ AND WRITTEN
 * (`found-25-sep/connected-calendars-read-by-nothing`).
 *
 * The planner's Accounts page said a connected calendar's events appear on the
 * Planner and that one calendar is where new events are created. Nothing read
 * an event and nothing wrote one: the only call to a person's calendar was
 * Google's free/busy, and the Meetings page's "Upcoming" read Rundesk's own
 * meetings alone. These are the calls, in each provider's own shapes, and the
 * one shape the rest of the API and the web read them in.
 *
 * THE ADDRESSES ARE READ FROM THE ENVIRONMENT, so a lane points them at
 * `scripts/e2e-lanes/calendar-stub.mjs` (GOOGLE_CALENDAR_API_URL, which the
 * task push already read, and MS_GRAPH_API_URL); unset, they are Google's and
 * Microsoft's.
 *
 * Pure of the database: the caller passes a token, and is told when the
 * provider refused it (`CalendarRefused`), so it can refresh and ask once more.
 */

export type CalendarProvider = 'gcal' | 'outlook'

/** An event as the planner and Upcoming read it, whichever calendar it came from. */
export interface CalendarEvent {
  /** The provider's own id for it. */
  id: string
  accountId: string
  provider: CalendarProvider
  title: string
  /** An instant (ISO, UTC) for a timed event; `YYYY-MM-DD` for an all-day one. */
  start: string
  /** An instant; for an all-day event the day AFTER its last, as both providers say it. */
  end: string
  allDay: boolean
  location: string | null
  /** Where the provider shows it, when it says. */
  link: string | null
}

/** What is written for a planner block: a title and a span, timed or all-day. */
export interface EventToWrite {
  title: string
  start: Date
  end: Date
  allDay: boolean
}

export function calendarBases(): { google: string; graph: string } {
  return {
    google: (process.env.GOOGLE_CALENDAR_API_URL ?? 'https://www.googleapis.com/calendar/v3').replace(/\/+$/, ''),
    graph: (process.env.MS_GRAPH_API_URL ?? 'https://graph.microsoft.com/v1.0').replace(/\/+$/, ''),
  }
}

/** The provider refused the token: expired, or the grant is gone. */
export class CalendarRefused extends Error {
  constructor(provider: CalendarProvider, status: number) {
    super(`${provider} refused the calendar's token (${status})`)
  }
}

/** Any other failure the provider answered with. */
export class CalendarFailed extends Error {
  constructor(provider: CalendarProvider, status: number) {
    super(`${provider} answered ${status}`)
  }
}

/**
 * HOW MANY PAGES OF ONE CALENDAR ARE READ FOR ONE WINDOW. A week of somebody's
 * calendar is a page; a calendar that answers page after page is a loop, and a
 * request somebody is waiting on is no place for one. Past it, the rest of the
 * window is not drawn, which `truncated` says.
 */
export const MAX_PAGES = 8

const answer = async (res: Response, provider: CalendarProvider) => {
  if (res.status === 401) throw new CalendarRefused(provider, res.status)
  if (!res.ok) throw new CalendarFailed(provider, res.status)
  return res
}

/** `YYYY-MM-DD` of an instant, in UTC. */
const dayOf = (iso: string) => new Date(iso).toISOString().slice(0, 10)

/** One Google event, or null for one that is cancelled or has no time. */
export function fromGoogle(item: any, accountId: string): CalendarEvent | null {
  if (!item || item.status === 'cancelled') return null
  const allDay = typeof item.start?.date === 'string'
  const start = allDay ? item.start.date : item.start?.dateTime
  const end = allDay ? item.end?.date : item.end?.dateTime
  if (typeof item.id !== 'string' || typeof start !== 'string' || typeof end !== 'string') return null
  return {
    id: item.id,
    accountId,
    provider: 'gcal',
    title: typeof item.summary === 'string' && item.summary.trim() ? item.summary : '',
    start: allDay ? start : new Date(start).toISOString(),
    end: allDay ? end : new Date(end).toISOString(),
    allDay,
    location: typeof item.location === 'string' && item.location ? item.location : null,
    link: typeof item.htmlLink === 'string' ? item.htmlLink : null,
  }
}

/**
 * One Graph event, or null. Graph writes its times without a zone, in the zone
 * the request asked for — UTC here (`Prefer: outlook.timezone="UTC"`) — so a
 * time is read as UTC; an all-day event's are midnights, read as their days.
 */
export function fromGraph(item: any, accountId: string): CalendarEvent | null {
  if (!item || item.isCancelled === true) return null
  const s = item.start?.dateTime
  const t = item.end?.dateTime
  if (typeof item.id !== 'string' || typeof s !== 'string' || typeof t !== 'string') return null
  const utc = (x: string) => new Date(/[zZ]$|[+-]\d\d:?\d\d$/.test(x) ? x : `${x}Z`).toISOString()
  const allDay = item.isAllDay === true
  return {
    id: item.id,
    accountId,
    provider: 'outlook',
    title: typeof item.subject === 'string' && item.subject.trim() ? item.subject : '',
    start: allDay ? dayOf(utc(s)) : utc(s),
    end: allDay ? dayOf(utc(t)) : utc(t),
    allDay,
    location: typeof item.location?.displayName === 'string' && item.location.displayName ? item.location.displayName : null,
    link: typeof item.webLink === 'string' ? item.webLink : null,
  }
}

/**
 * The events of one Google calendar that overlap the window, every page of
 * them up to `MAX_PAGES`. `singleEvents` asks for each occurrence of a
 * recurring event rather than the rule, which is what a grid draws.
 */
export async function readGoogle(
  token: string,
  calendarId: string,
  accountId: string,
  from: Date,
  to: Date,
  signal?: AbortSignal,
): Promise<{ events: CalendarEvent[]; truncated: boolean }> {
  const base = `${calendarBases().google}/calendars/${encodeURIComponent(calendarId || 'primary')}/events`
  const events: CalendarEvent[] = []
  let pageToken: string | undefined
  for (let page = 0; page < MAX_PAGES; page++) {
    const q = new URLSearchParams({
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
    })
    if (pageToken) q.set('pageToken', pageToken)
    const res = await answer(await fetch(`${base}?${q}`, { headers: { Authorization: `Bearer ${token}` }, signal }), 'gcal')
    const body = (await res.json()) as { items?: unknown[]; nextPageToken?: string }
    for (const item of body.items ?? []) {
      const e = fromGoogle(item, accountId)
      if (e) events.push(e)
    }
    pageToken = body.nextPageToken
    if (!pageToken) return { events, truncated: false }
  }
  return { events, truncated: true }
}

/**
 * The events of a Microsoft account's calendar that overlap the window
 * (`calendarView`, which expands recurring events as `singleEvents` does), every
 * page up to `MAX_PAGES`. The next page's address is Graph's own
 * (`@odata.nextLink`), followed only while it stays on the same host.
 */
export async function readGraph(
  token: string,
  accountId: string,
  from: Date,
  to: Date,
  signal?: AbortSignal,
): Promise<{ events: CalendarEvent[]; truncated: boolean }> {
  const base = calendarBases().graph
  const q = new URLSearchParams({ startDateTime: from.toISOString(), endDateTime: to.toISOString(), $top: '250' })
  let next: string | undefined = `${base}/me/calendarView?${q}`
  const host = new URL(base).host
  const events: CalendarEvent[] = []
  let elsewhere = false
  for (let page = 0; page < MAX_PAGES && next; page++) {
    const res = await answer(
      await fetch(next, { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="UTC"' }, signal }),
      'outlook',
    )
    const body = (await res.json()) as { value?: unknown[]; '@odata.nextLink'?: string }
    for (const item of body.value ?? []) {
      const e = fromGraph(item, accountId)
      if (e) events.push(e)
    }
    const link = body['@odata.nextLink']
    // A token goes only where it was meant to: never to a host the page names.
    // The events past it are not read, and the window says so.
    elsewhere = !!link && new URL(link).host !== host
    next = link && !elsewhere ? link : undefined
  }
  return { events, truncated: !!next || elsewhere }
}

/** Google's body for a block: `date` for an all-day one, `dateTime` for a timed one. */
export function googleBody(e: EventToWrite) {
  return {
    summary: e.title,
    start: e.allDay ? { date: dayOf(e.start.toISOString()) } : { dateTime: e.start.toISOString() },
    end: e.allDay ? { date: dayOf(e.end.toISOString()) } : { dateTime: e.end.toISOString() },
  }
}

/** Graph's body for a block, in UTC: midnights for an all-day one. */
export function graphBody(e: EventToWrite) {
  const at = (d: Date) => (e.allDay ? `${dayOf(d.toISOString())}T00:00:00` : d.toISOString().replace(/Z$/, ''))
  return {
    subject: e.title,
    isAllDay: e.allDay,
    start: { dateTime: at(e.start), timeZone: 'UTC' },
    end: { dateTime: at(e.end), timeZone: 'UTC' },
  }
}

/** Create the event, or change the one written before; its id. */
export async function writeEvent(
  provider: CalendarProvider,
  token: string,
  calendarId: string,
  e: EventToWrite,
  eventId: string | null,
  signal?: AbortSignal,
): Promise<string> {
  const { google, graph } = calendarBases()
  const url = provider === 'gcal'
    ? `${google}/calendars/${encodeURIComponent(calendarId || 'primary')}/events${eventId ? `/${encodeURIComponent(eventId)}` : ''}`
    : `${graph}/me/events${eventId ? `/${encodeURIComponent(eventId)}` : ''}`
  const res = await answer(
    await fetch(url, {
      method: eventId ? 'PATCH' : 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(provider === 'gcal' ? googleBody(e) : graphBody(e)),
      signal,
    }),
    provider,
  )
  const body = (await res.json()) as { id?: string }
  if (typeof body.id !== 'string') throw new CalendarFailed(provider, res.status)
  return body.id
}

/** Delete the event; one already gone (404, 410) is gone, which is what was asked. */
export async function deleteEvent(
  provider: CalendarProvider,
  token: string,
  calendarId: string,
  eventId: string,
  signal?: AbortSignal,
): Promise<void> {
  const { google, graph } = calendarBases()
  const url = provider === 'gcal'
    ? `${google}/calendars/${encodeURIComponent(calendarId || 'primary')}/events/${encodeURIComponent(eventId)}`
    : `${graph}/me/events/${encodeURIComponent(eventId)}`
  const res = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` }, signal })
  if (res.status === 404 || res.status === 410) return
  await answer(res, provider)
}

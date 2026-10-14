import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import {
  CalendarRefused,
  deleteEvent,
  fromGoogle,
  fromGraph,
  graphBody,
  googleBody,
  MAX_PAGES,
  readGoogle,
  readGraph,
  writeEvent,
} from './calendar-events'

/**
 * A person's connected calendars, read and written in each provider's own
 * shapes (`found-25-sep/connected-calendars-read-by-nothing`). The lanes answer
 * these calls from `calendar-stub.mjs`; this holds the shapes themselves, and
 * what a refusal, a page and a host are taken for.
 */

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
  delete process.env.GOOGLE_CALENDAR_API_URL
  delete process.env.MS_GRAPH_API_URL
})

const answer = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('calendar events — one shape whichever calendar they came from', () => {
  it('a Google event is read as an instant in UTC, an all-day one as its days, and a cancelled one not at all', () => {
    assert.deepEqual(
      fromGoogle({ id: 'a', summary: 'Standup', start: { dateTime: '2026-10-08T09:00:00-07:00' }, end: { dateTime: '2026-10-08T09:15:00-07:00' }, htmlLink: 'https://g/a' }, 'acc'),
      { id: 'a', accountId: 'acc', provider: 'gcal', title: 'Standup', start: '2026-10-08T16:00:00.000Z', end: '2026-10-08T16:15:00.000Z', allDay: false, location: null, link: 'https://g/a', meetingUrl: null },
    )
    assert.deepEqual(
      fromGoogle({ id: 'b', summary: 'Holiday', start: { date: '2026-10-09' }, end: { date: '2026-10-10' } }, 'acc'),
      { id: 'b', accountId: 'acc', provider: 'gcal', title: 'Holiday', start: '2026-10-09', end: '2026-10-10', allDay: true, location: null, link: null, meetingUrl: null },
    )
    // `commit-log/log-39863ff-1` — the meeting the AI Notetaker would join: Meet's own link, a conference's video entry, a link in the words.
    assert.equal(fromGoogle({ id: 'm', summary: 'Sync', start: { dateTime: '2026-10-08T09:00:00Z' }, end: { dateTime: '2026-10-08T09:30:00Z' }, hangoutLink: 'https://meet.google.com/abc-defg-hij' }, 'acc')?.meetingUrl, 'https://meet.google.com/abc-defg-hij')
    assert.equal(fromGoogle({ id: 'z', summary: 'Zoom', start: { dateTime: '2026-10-08T09:00:00Z' }, end: { dateTime: '2026-10-08T09:30:00Z' }, conferenceData: { entryPoints: [{ entryPointType: 'phone', uri: 'tel:+1' }, { entryPointType: 'video', uri: 'https://acme.zoom.us/j/123456' }] } }, 'acc')?.meetingUrl, 'https://acme.zoom.us/j/123456')
    assert.equal(fromGoogle({ id: 'n', summary: 'Lunch', start: { dateTime: '2026-10-08T09:00:00Z' }, end: { dateTime: '2026-10-08T09:30:00Z' }, location: 'https://example.com/menu' }, 'acc')?.meetingUrl, null)
    assert.equal(fromGraph({ id: 't', subject: 'Teams', start: { dateTime: '2026-10-08T09:00:00' }, end: { dateTime: '2026-10-08T09:30:00' }, onlineMeeting: { joinUrl: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting/0' } }, 'acc')?.meetingUrl, 'https://teams.microsoft.com/l/meetup-join/19%3ameeting/0')
    assert.equal(fromGoogle({ id: 'c', status: 'cancelled', start: { dateTime: '2026-10-08T09:00:00Z' }, end: { dateTime: '2026-10-08T10:00:00Z' } }, 'acc'), null)
  })

  it('a Graph event, written without a zone in the UTC the request asked for, is read as UTC; an all-day one as its days', () => {
    assert.deepEqual(
      fromGraph({ id: 'o', subject: 'Review', isAllDay: false, start: { dateTime: '2026-10-08T15:00:00.0000000', timeZone: 'UTC' }, end: { dateTime: '2026-10-08T16:00:00.0000000', timeZone: 'UTC' }, location: { displayName: 'Room 4' }, webLink: 'https://o/o' }, 'acc'),
      { id: 'o', accountId: 'acc', provider: 'outlook', title: 'Review', start: '2026-10-08T15:00:00.000Z', end: '2026-10-08T16:00:00.000Z', allDay: false, location: 'Room 4', link: 'https://o/o', meetingUrl: null },
    )
    assert.deepEqual(
      fromGraph({ id: 'd', subject: 'Away', isAllDay: true, start: { dateTime: '2026-10-09T00:00:00.0000000' }, end: { dateTime: '2026-10-11T00:00:00.0000000' } }, 'acc'),
      { id: 'd', accountId: 'acc', provider: 'outlook', title: 'Away', start: '2026-10-09', end: '2026-10-11', allDay: true, location: null, link: null, meetingUrl: null },
    )
  })

  it('a block is written as Google and Graph each say an event: dateTime or date, and UTC midnights for a day', () => {
    const timed = { title: 'Focus', start: new Date('2026-10-08T13:00:00Z'), end: new Date('2026-10-08T14:00:00Z'), allDay: false }
    const day = { title: 'Offsite', start: new Date('2026-10-09T00:00:00Z'), end: new Date('2026-10-10T00:00:00Z'), allDay: true }
    assert.deepEqual(googleBody(timed), { summary: 'Focus', start: { dateTime: '2026-10-08T13:00:00.000Z' }, end: { dateTime: '2026-10-08T14:00:00.000Z' } })
    assert.deepEqual(googleBody(day), { summary: 'Offsite', start: { date: '2026-10-09' }, end: { date: '2026-10-10' } })
    assert.deepEqual(graphBody(timed), { subject: 'Focus', isAllDay: false, start: { dateTime: '2026-10-08T13:00:00.000', timeZone: 'UTC' }, end: { dateTime: '2026-10-08T14:00:00.000', timeZone: 'UTC' } })
    assert.deepEqual(graphBody(day), { subject: 'Offsite', isAllDay: true, start: { dateTime: '2026-10-09T00:00:00', timeZone: 'UTC' }, end: { dateTime: '2026-10-10T00:00:00', timeZone: 'UTC' } })
  })
})

describe('calendar events — reading and writing them', () => {
  it('a Google calendar is read page after page, at the address the environment names, with its token', async () => {
    process.env.GOOGLE_CALENDAR_API_URL = 'http://stub.test/google/calendar/v3/'
    const asked: string[] = []
    globalThis.fetch = mock.fn(async (url: string | URL, init?: RequestInit) => {
      asked.push(`${url} ${(init?.headers as Record<string, string>).Authorization}`)
      const page = new URL(String(url)).searchParams.get('pageToken')
      return page
        ? answer(200, { items: [{ id: '2', summary: 'Two', start: { dateTime: '2026-10-08T11:00:00Z' }, end: { dateTime: '2026-10-08T12:00:00Z' } }] })
        : answer(200, { items: [{ id: '1', summary: 'One', start: { dateTime: '2026-10-08T09:00:00Z' }, end: { dateTime: '2026-10-08T10:00:00Z' } }], nextPageToken: 'p2' })
    }) as never
    const read = await readGoogle('tok', 'primary', 'acc', new Date('2026-10-08T00:00:00Z'), new Date('2026-10-09T00:00:00Z'))
    assert.deepEqual(read.events.map((e) => e.id), ['1', '2'])
    assert.equal(read.truncated, false)
    assert.equal(asked.length, 2)
    assert.ok(asked.every((a) => a.startsWith('http://stub.test/google/calendar/v3/calendars/primary/events?') && a.endsWith(' Bearer tok')), asked.join('\n'))
  })

  it('and stops at the page limit, saying so, rather than reading a calendar that never ends', async () => {
    let calls = 0
    globalThis.fetch = mock.fn(async () => {
      calls += 1
      return answer(200, { items: [], nextPageToken: `p${calls}` })
    }) as never
    const read = await readGoogle('tok', 'primary', 'acc', new Date('2026-10-08T00:00:00Z'), new Date('2026-10-09T00:00:00Z'))
    assert.equal(calls, MAX_PAGES)
    assert.equal(read.truncated, true)
  })

  it('a refused token is CalendarRefused, so it can be refreshed; any other failure is not', async () => {
    globalThis.fetch = mock.fn(async () => answer(401, { error: { code: 401 } })) as never
    await assert.rejects(readGoogle('tok', 'primary', 'acc', new Date(), new Date(Date.now() + 1000)), CalendarRefused)
    globalThis.fetch = mock.fn(async () => answer(503, { error: { code: 503 } })) as never
    await assert.rejects(readGoogle('tok', 'primary', 'acc', new Date(), new Date(Date.now() + 1000)), (err: unknown) => !(err instanceof CalendarRefused))
  })

  it('a Graph next page is followed on Graph’s own host, and never to another one with the token', async () => {
    process.env.MS_GRAPH_API_URL = 'http://graph.test/v1.0'
    const asked: string[] = []
    globalThis.fetch = mock.fn(async (url: string | URL) => {
      asked.push(String(url))
      return asked.length === 1
        ? answer(200, { value: [], '@odata.nextLink': 'http://elsewhere.test/v1.0/me/calendarView?$skiptoken=1' })
        : answer(200, { value: [] })
    }) as never
    const read = await readGraph('tok', 'acc', new Date('2026-10-08T00:00:00Z'), new Date('2026-10-09T00:00:00Z'))
    assert.equal(asked.length, 1, asked.join('\n'))
    assert.ok(asked[0].startsWith('http://graph.test/v1.0/me/calendarView?'))
    assert.equal(read.truncated, true)
  })

  it('a write creates the event, a write with its id changes it, and a delete of one already gone is done', async () => {
    process.env.GOOGLE_CALENDAR_API_URL = 'http://stub.test/google/calendar/v3'
    const asked: string[] = []
    globalThis.fetch = mock.fn(async (url: string | URL, init?: RequestInit) => {
      asked.push(`${init?.method} ${url}`)
      return init?.method === 'DELETE' ? new Response(null, { status: 410 }) : answer(200, { id: 'ev1' })
    }) as never
    const e = { title: 'Focus', start: new Date('2026-10-08T13:00:00Z'), end: new Date('2026-10-08T14:00:00Z'), allDay: false }
    assert.equal(await writeEvent('gcal', 'tok', 'primary', e, null), 'ev1')
    assert.equal(await writeEvent('gcal', 'tok', 'primary', e, 'ev1'), 'ev1')
    await deleteEvent('gcal', 'tok', 'primary', 'ev1')
    assert.deepEqual(asked, [
      'POST http://stub.test/google/calendar/v3/calendars/primary/events',
      'PATCH http://stub.test/google/calendar/v3/calendars/primary/events/ev1',
      'DELETE http://stub.test/google/calendar/v3/calendars/primary/events/ev1',
    ])
  })
})

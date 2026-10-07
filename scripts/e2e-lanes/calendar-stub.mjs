#!/usr/bin/env node
/*
 * GOOGLE CALENDAR AND MICROSOFT GRAPH, ENOUGH OF EACH TO BE READ AND WRITTEN
 * (`found-25-sep/connected-calendars-read-by-nothing`).
 *
 * A person connects their calendars on the planner's Accounts page, and the
 * page said their events would appear on the Planner and that one of them is
 * where new events are created. Nothing read an event and nothing wrote one:
 * the only call to a person's calendar was Google's free/busy, and no lane
 * could answer even that, because the addresses were Google's own. This is the
 * other end of those calls, the way `s3-stub.mjs` is the store's and
 * `model-stub.mjs` the model's: the API reads its base addresses from
 * GOOGLE_CALENDAR_API_URL and MS_GRAPH_API_URL, and a lane points both here.
 *
 * WHAT IT ANSWERS, in each provider's own shapes:
 *   Google  GET    /google/calendar/v3/calendars/:id/events   (timeMin, timeMax, maxResults, pageToken)
 *           POST   /google/calendar/v3/calendars/:id/events
 *           PATCH  /google/calendar/v3/calendars/:id/events/:eventId
 *           DELETE /google/calendar/v3/calendars/:id/events/:eventId
 *           POST   /google/calendar/v3/freeBusy
 *   Graph   GET    /graph/v1.0/me/calendarView               (startDateTime, endDateTime, $top, $skiptoken)
 *           POST   /graph/v1.0/me/events
 *           PATCH  /graph/v1.0/me/events/:eventId
 *           DELETE /graph/v1.0/me/events/:eventId
 *   Tokens  POST   /google/token and /microsoft/token          (grant_type=refresh_token)
 *
 * A CALENDAR IS A BEARER TOKEN. Each request's `Authorization: Bearer <token>`
 * names the calendar it reads and writes, and a token nobody seeded is refused
 * 401, as a revoked grant is. So two suites on one lane never see each other's
 * events, and an account whose grant is gone is one whose token was never
 * seeded. A suite seeds a calendar with the token its account row carries.
 *
 * AND A REFRESH TOKEN, WHEN IT IS SEEDED WITH ONE. An access token lasts an
 * hour; a refresh at either provider's token address with the seeded refresh
 * token answers a new access token for the same calendar, and one nobody
 * seeded is refused `invalid_grant`, as a revoked grant is.
 *
 * THE CONTROL SEAM, for suites and for `check-calendar-stub.mjs`:
 *   POST /__control/calendar {token, provider, events}   seed (replace) a calendar
 *   GET  /__control/calendar?token=                      its events, and what the product wrote
 *   POST /__control/fail {token, status, count}          the next `count` calls with it answer `status`
 *   POST /__control/reset {token}                        forget the token entirely
 *   GET  /__control/version                              which source this process runs
 *
 * NOT FOR PRODUCTION. Binds loopback, and refuses to start without
 * `RUNDESK_CALENDAR_STUB=1`.
 *
 *   RUNDESK_CALENDAR_STUB=1 node scripts/e2e-lanes/calendar-stub.mjs --port 9401
 *
 * Prints one line of JSON when listening, so callers wait on readiness rather
 * than sleeping.
 */
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'

if (process.env.RUNDESK_CALENDAR_STUB !== '1') {
  console.error('[calendar-stub] refusing to start without RUNDESK_CALENDAR_STUB=1 — this is a test double')
  process.exitCode = 1
  process.exit()
}

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : process.argv[i + 1]
}
const PORT = Number(arg('port', 9401))
// Which source this process runs: `lane-env.sh` restarts a stub whose file has moved.
const SOURCE = createHash('sha1').update(readFileSync(new URL(import.meta.url))).digest('hex').slice(0, 12)

/** refresh token → the calendar its access tokens open. */
const refreshes = new Map()
/**
 * token → { provider, events: Map<id, event>, writes: [], fail: {status, left} | null }
 * An event here is the provider-neutral shape: { id, title, start, end, allDay, location }.
 * `start`/`end` are ISO instants for a timed event and `YYYY-MM-DD` for an all-day
 * one, whose `end` is the day after its last, as both providers say it.
 */
const calendars = new Map()

const json = (res, status, body) => {
  const s = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(s) })
  res.end(s)
}
const empty = (res, status) => {
  res.writeHead(status)
  res.end()
}
const readBody = (req) =>
  new Promise((resolve) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'))
      } catch {
        resolve(null)
      }
    })
  })

/** An event's span as instants, an all-day one from its first midnight (UTC) to the midnight after its last. */
const spanOf = (e) => ({
  from: Date.parse(e.allDay ? `${e.start}T00:00:00Z` : e.start),
  to: Date.parse(e.allDay ? `${e.end}T00:00:00Z` : e.end),
})
/** In the window when it overlaps it at all, as both providers list. */
const inWindow = (e, from, to) => {
  const s = spanOf(e)
  return s.from < to && s.to > from
}
const byStart = (a, b) => spanOf(a).from - spanOf(b).from

// ── each provider's shapes ───────────────────────────────────────────────────

const googleEvent = (e) => ({
  kind: 'calendar#event',
  id: e.id,
  status: 'confirmed',
  htmlLink: `https://calendar.google.test/event?eid=${e.id}`,
  summary: e.title,
  ...(e.location ? { location: e.location } : {}),
  start: e.allDay ? { date: e.start } : { dateTime: e.start },
  end: e.allDay ? { date: e.end } : { dateTime: e.end },
})
/** What the product sent Google, as this stub keeps it; null when it is no event. */
const fromGoogle = (body, id) => {
  const s = body?.start ?? {}
  const t = body?.end ?? {}
  const allDay = typeof s.date === 'string'
  const start = allDay ? s.date : s.dateTime
  const end = allDay ? t.date : t.dateTime
  if (typeof start !== 'string' || typeof end !== 'string') return null
  return { id, title: body.summary ?? '', start, end, allDay, location: body.location ?? null }
}

/** Graph writes a time without its zone, to seven decimals, in the zone the request asked for (UTC here). */
const graphTime = (iso) => new Date(iso).toISOString().replace(/\.(\d{3})Z$/, (_, ms) => `.${ms}0000`)
const graphEvent = (e) => ({
  id: e.id,
  subject: e.title,
  isAllDay: e.allDay,
  webLink: `https://outlook.office.test/calendar/item/${e.id}`,
  location: { displayName: e.location ?? '' },
  start: { dateTime: graphTime(e.allDay ? `${e.start}T00:00:00Z` : e.start), timeZone: 'UTC' },
  end: { dateTime: graphTime(e.allDay ? `${e.end}T00:00:00Z` : e.end), timeZone: 'UTC' },
})
const fromGraph = (body, id) => {
  const s = body?.start?.dateTime
  const t = body?.end?.dateTime
  if (typeof s !== 'string' || typeof t !== 'string') return null
  // A zone other than UTC would need a zone table this stub does not carry.
  const zoneOf = (x) => x?.timeZone ?? 'UTC'
  if (zoneOf(body.start) !== 'UTC' || zoneOf(body.end) !== 'UTC') return { unsupportedZone: true }
  const at = (x) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(x) ? x : `${x}Z`).toISOString()
  const allDay = body.isAllDay === true
  return {
    id,
    title: body.subject ?? '',
    start: allDay ? at(s).slice(0, 10) : at(s),
    end: allDay ? at(t).slice(0, 10) : at(t),
    allDay,
    location: body.location?.displayName || null,
  }
}

const refused = (res, provider) =>
  provider === 'outlook'
    ? json(res, 401, { error: { code: 'InvalidAuthenticationToken', message: 'Access token has expired or is not yet valid.' } })
    : json(res, 401, { error: { code: 401, message: 'Request had invalid authentication credentials.', status: 'UNAUTHENTICATED' } })

const failed = (res, provider, status) =>
  provider === 'outlook'
    ? json(res, status, { error: { code: status === 429 ? 'TooManyRequests' : 'ErrorInternalServerError', message: `the stub was asked to answer ${status}` } })
    : json(res, status, { error: { code: status, message: `the stub was asked to answer ${status}` } })

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  const path = url.pathname

  // ── control ────────────────────────────────────────────────────────────────
  if (path === '/__control/version' && req.method === 'GET') return json(res, 200, { source: SOURCE })
  if (path === '/__control/calendar' && req.method === 'POST') {
    const body = await readBody(req)
    if (!body?.token || !['gcal', 'outlook'].includes(body.provider)) {
      return json(res, 400, { error: 'token and a provider (gcal or outlook) are required' })
    }
    const events = new Map()
    for (const e of body.events ?? []) {
      const id = e.id ?? randomUUID()
      events.set(id, { id, title: e.title ?? '', start: e.start, end: e.end, allDay: e.allDay === true, location: e.location ?? null })
    }
    const had = calendars.get(body.token)
    const cal = { provider: body.provider, events, writes: [], fail: had?.fail ?? null }
    calendars.set(body.token, cal)
    if (body.refreshToken) refreshes.set(body.refreshToken, cal)
    return json(res, 200, { token: body.token, events: events.size })
  }
  if (path === '/__control/calendar' && req.method === 'GET') {
    const cal = calendars.get(url.searchParams.get('token') ?? '')
    if (!cal) return json(res, 404, { error: 'no calendar for that token' })
    return json(res, 200, { provider: cal.provider, events: [...cal.events.values()].sort(byStart), writes: cal.writes })
  }
  if (path === '/__control/fail' && req.method === 'POST') {
    const body = await readBody(req)
    const cal = calendars.get(body?.token ?? '')
    if (!cal) return json(res, 404, { error: 'no calendar for that token' })
    cal.fail = { status: Number(body.status ?? 500), left: Number(body.count ?? 1) }
    return json(res, 200, { staged: cal.fail })
  }
  if (path === '/__control/reset' && req.method === 'POST') {
    const body = await readBody(req)
    const cal = calendars.get(body?.token ?? '')
    // Every token and refresh token that opens this calendar goes with it.
    for (const [k, v] of calendars) if (v === cal) calendars.delete(k)
    for (const [k, v] of refreshes) if (v === cal) refreshes.delete(k)
    return json(res, 200, { forgot: !!cal })
  }

  // ── the token addresses: a refresh answers a new access token for the same calendar ──
  if ((path === '/google/token' || path === '/microsoft/token') && req.method === 'POST') {
    const raw = await new Promise((resolve) => {
      let b = ''
      req.on('data', (c) => (b += c))
      req.on('end', () => resolve(b))
    })
    const form = new URLSearchParams(raw)
    const cal = refreshes.get(form.get('refresh_token') ?? '')
    const provider = path === '/google/token' ? 'gcal' : 'outlook'
    if (form.get('grant_type') !== 'refresh_token' || !cal || cal.provider !== provider) {
      return json(res, 400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' })
    }
    const token = `refreshed-${randomUUID()}`
    calendars.set(token, cal)
    cal.writes.push({ method: 'POST', path, body: { grant_type: 'refresh_token' }, at: new Date().toISOString() })
    return json(res, 200, { access_token: token, expires_in: 3599, token_type: 'Bearer' })
  }

  // ── the providers ──────────────────────────────────────────────────────────
  const google = path.startsWith('/google/calendar/v3/')
  const graph = path.startsWith('/graph/v1.0/')
  if (!google && !graph) return json(res, 404, { error: `no route ${req.method} ${path}` })
  const provider = google ? 'gcal' : 'outlook'

  const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1] ?? ''
  const cal = calendars.get(token)
  // A token nobody seeded, or one seeded for the other provider, is no grant here.
  if (!cal || cal.provider !== provider) return refused(res, provider)
  if (cal.fail && cal.fail.left > 0) {
    cal.fail.left -= 1
    const status = cal.fail.status
    if (cal.fail.left === 0) cal.fail = null
    return status === 401 ? refused(res, provider) : failed(res, provider, status)
  }

  const record = (body) => cal.writes.push({ method: req.method, path, body, at: new Date().toISOString() })

  if (google) {
    const rest = path.slice('/google/calendar/v3'.length)
    if (rest === '/freeBusy' && req.method === 'POST') {
      const body = (await readBody(req)) ?? {}
      const from = Date.parse(body.timeMin)
      const to = Date.parse(body.timeMax)
      const busy = [...cal.events.values()].filter((e) => inWindow(e, from, to)).sort(byStart).map((e) => {
        const s = spanOf(e)
        return { start: new Date(s.from).toISOString(), end: new Date(s.to).toISOString() }
      })
      const calendarsOut = {}
      for (const item of body.items ?? []) calendarsOut[item.id] = { busy }
      return json(res, 200, { kind: 'calendar#freeBusy', timeMin: body.timeMin, timeMax: body.timeMax, calendars: calendarsOut })
    }
    const m = /^\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/.exec(rest)
    if (!m) return json(res, 404, { error: { code: 404, message: 'Not Found' } })
    const eventId = m[2] ? decodeURIComponent(m[2]) : null
    if (!eventId && req.method === 'GET') {
      const from = Date.parse(url.searchParams.get('timeMin') ?? '')
      const to = Date.parse(url.searchParams.get('timeMax') ?? '')
      if (Number.isNaN(from) || Number.isNaN(to)) {
        return json(res, 400, { error: { code: 400, message: 'timeMin and timeMax are required here' } })
      }
      const all = [...cal.events.values()].filter((e) => inWindow(e, from, to)).sort(byStart)
      const size = Math.max(1, Math.min(2500, Number(url.searchParams.get('maxResults') ?? 250)))
      const at = Number(url.searchParams.get('pageToken') ?? 0)
      const page = all.slice(at, at + size)
      return json(res, 200, {
        kind: 'calendar#events',
        items: page.map(googleEvent),
        ...(at + size < all.length ? { nextPageToken: String(at + size) } : {}),
      })
    }
    if (!eventId && req.method === 'POST') {
      const body = await readBody(req)
      const e = fromGoogle(body, `g${randomUUID().replace(/-/g, '').slice(0, 20)}`)
      if (!e) return json(res, 400, { error: { code: 400, message: 'Missing start or end time.' } })
      cal.events.set(e.id, e)
      record(body)
      return json(res, 200, googleEvent(e))
    }
    const had = eventId ? cal.events.get(eventId) : null
    if (eventId && req.method === 'PATCH') {
      if (!had) return json(res, 404, { error: { code: 404, message: 'Not Found' } })
      const body = (await readBody(req)) ?? {}
      const merged = fromGoogle({ summary: had.title, location: had.location, ...googleEvent(had), ...body }, had.id)
      if (!merged) return json(res, 400, { error: { code: 400, message: 'Missing start or end time.' } })
      cal.events.set(had.id, merged)
      record(body)
      return json(res, 200, googleEvent(merged))
    }
    if (eventId && req.method === 'DELETE') {
      if (!had) return json(res, 410, { error: { code: 410, message: 'Resource has been deleted' } })
      cal.events.delete(eventId)
      record(null)
      return empty(res, 204)
    }
    return json(res, 405, { error: { code: 405, message: `no ${req.method} here` } })
  }

  // Graph
  const rest = path.slice('/graph/v1.0'.length)
  if (rest === '/me/calendarView' && req.method === 'GET') {
    const from = Date.parse(url.searchParams.get('startDateTime') ?? '')
    const to = Date.parse(url.searchParams.get('endDateTime') ?? '')
    if (Number.isNaN(from) || Number.isNaN(to)) {
      return json(res, 400, { error: { code: 'ErrorInvalidParameter', message: 'This request requires a time window specified by the query string parameters StartDateTime and EndDateTime.' } })
    }
    const all = [...cal.events.values()].filter((e) => inWindow(e, from, to)).sort(byStart)
    const size = Math.max(1, Math.min(1000, Number(url.searchParams.get('$top') ?? 10)))
    const at = Number(url.searchParams.get('$skiptoken') ?? 0)
    const page = all.slice(at, at + size)
    const next = new URL(url)
    next.searchParams.set('$skiptoken', String(at + size))
    return json(res, 200, {
      value: page.map(graphEvent),
      ...(at + size < all.length ? { '@odata.nextLink': next.toString() } : {}),
    })
  }
  const m = /^\/me\/events(?:\/([^/]+))?$/.exec(rest)
  if (!m) return json(res, 404, { error: { code: 'ResourceNotFound', message: 'Resource not found for the segment.' } })
  const eventId = m[1] ? decodeURIComponent(m[1]) : null
  if (!eventId && req.method === 'POST') {
    const body = await readBody(req)
    const e = fromGraph(body, `AAMk${randomUUID().replace(/-/g, '')}`)
    if (!e) return json(res, 400, { error: { code: 'ErrorInvalidRequest', message: 'Start and End are required.' } })
    if (e.unsupportedZone) return json(res, 400, { error: { code: 'ErrorInvalidTimeZone', message: 'The stub answers UTC alone.' } })
    cal.events.set(e.id, e)
    record(body)
    return json(res, 201, graphEvent(e))
  }
  const had = eventId ? cal.events.get(eventId) : null
  if (eventId && req.method === 'PATCH') {
    if (!had) return json(res, 404, { error: { code: 'ErrorItemNotFound', message: 'The specified object was not found in the store.' } })
    const body = (await readBody(req)) ?? {}
    const merged = fromGraph({ ...graphEvent(had), ...body }, had.id)
    if (!merged || merged.unsupportedZone) return json(res, 400, { error: { code: 'ErrorInvalidRequest', message: 'Start and End must be UTC here.' } })
    cal.events.set(had.id, merged)
    record(body)
    return json(res, 200, graphEvent(merged))
  }
  if (eventId && req.method === 'DELETE') {
    if (!had) return json(res, 404, { error: { code: 'ErrorItemNotFound', message: 'The specified object was not found in the store.' } })
    cal.events.delete(eventId)
    record(null)
    return empty(res, 204)
  }
  return json(res, 405, { error: { code: 'ErrorInvalidRequest', message: `no ${req.method} here` } })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(JSON.stringify({
    ready: true,
    port: PORT,
    google: `http://127.0.0.1:${PORT}/google/calendar/v3`,
    graph: `http://127.0.0.1:${PORT}/graph/v1.0`,
    source: SOURCE,
  }))
})

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)))

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
 * AND THE THREE FEDERATED SEARCHES (`found-23-sep/connected-search-per-person`),
 * each answered from what a token was seeded with:
 *   Drive   GET    /google/drive/v3/files                      (q: name contains '…', trashed, visibility)
 *   Gmail   GET    /gmail/v1/users/me/messages                 (q: "phrase")
 *           GET    /gmail/v1/users/me/messages/:id             (format=metadata)
 *   Graph   POST   /graph/v1.0/search/query                    (requests[0].query.queryString)
 *
 * AND A MAILBOX TO SEND A TASK'S EMAIL FROM (`found-9-oct/task-email-sends-from-the-server`),
 * a bearer token each, its messages kept with which way they went:
 *   Gmail   POST   /gmail/v1/users/me/messages/send            ({raw, threadId}: the whole message, base64url)
 *           GET    /gmail/v1/users/me/messages/:id             (format=metadata: its headers)
 *           GET    /gmail/v1/users/me/threads/:id              (format=full: every message, its words a part)
 *   Graph   GET    /graph/v1.0/me                              (whose mailbox; after a consent, whose grant)
 *           POST   /graph/v1.0/me/messages                     (a draft, in a new conversation)
 *           POST   /graph/v1.0/me/messages/:id/createReply     (a draft, in that message's conversation)
 *           POST   /graph/v1.0/me/messages/:id/attachments     (a file on a draft)
 *           POST   /graph/v1.0/me/messages/:id/send            (the draft sent: 202, no body)
 *           GET    /graph/v1.0/me/messages                     ($filter=conversationId eq '…')
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
 *   POST /__control/search {token, drive, gmail, sharepoint}   seed (replace) an account to search
 *   POST /__control/code {code, accessToken, refreshToken, email, sub, scopes}   a consent's code, for
 *        `POST /google/token` (grant_type=authorization_code) to answer, and `GET /google/userinfo` after
 *   GET  /__control/search?token=                        what was asked of it, query by query
 *   POST /__control/mailbox {token, provider, address, name, refreshToken}   seed (replace) a mailbox
 *   GET  /__control/mailbox?token=                       its messages, sent and received, and drafts
 *   POST /__control/mailbox/answer {token, threadId, from, fromName, text}   somebody answers in a thread
 *   POST /__control/mailbox/fail {token, status, count, on}  the next `count` calls with it answer `status` —
 *                                                          with `on: "write"`, only its sends and drafts, not the
 *                                                          reads a poll for answers makes between them
 *        (a consent's code is answered at `/microsoft/token` too, and `GET /graph/v1.0/me` after)
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
/**
 * token → { drive: [{id, name, visibility, modifiedTime}], gmail: [{id, subject, from, snippet, date}],
 *           sharepoint: [{id, name, webUrl, lastModifiedDateTime}], asked: [{source, query}] }
 * A Drive file's `visibility` is Drive's own: `limited` (its owner and whom they shared it with),
 * `domainCanFind`, `domainWithLink`, `anyoneCanFind` or `anyoneWithLink`.
 */
const searchAccounts = new Map()
/** code → the grant a consent's code is exchanged for; access token → its account's profile. */
const codes = new Map()
const profiles = new Map()
/**
 * token → { provider: 'gmail' | 'outlook', address, name, messages: [message], fail: {status, left} | null }
 * A message: { id, threadId, internetMessageId, from, fromName, to, cc, bcc, subject, text, inReplyTo,
 *              attachments: [{ name, contentType, size }], direction: 'sent' | 'received', isDraft, at }.
 * Gmail's thread and Graph's conversation are both `threadId` here. Refresh token → the mailbox.
 */
const mailboxes = new Map()
const mailboxRefreshes = new Map()

/** RFC 2047's encoded words read back: `=?UTF-8?B?…?=` and `=?UTF-8?Q?…?=`. */
const decodeWords = (v) =>
  String(v ?? '').replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, _cs, enc, data) =>
    enc.toUpperCase() === 'B'
      ? Buffer.from(data, 'base64').toString('utf8')
      : Buffer.from(data.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (__, h) => String.fromCharCode(parseInt(h, 16))), 'latin1').toString('utf8'),
  )
/** A message's header block and body, its folded lines unfolded. */
function splitMessage(raw) {
  const at = raw.search(/\r?\n\r?\n/)
  const head = at === -1 ? raw : raw.slice(0, at)
  const body = at === -1 ? '' : raw.slice(at).replace(/^\r?\n\r?\n/, '')
  const headers = {}
  for (const line of head.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const i = line.indexOf(':')
    if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim()
  }
  return { headers, body }
}
const bodyOf = (headers, body) =>
  /base64/i.test(headers['content-transfer-encoding'] ?? '') ? Buffer.from(body.replace(/\s+/g, ''), 'base64') : Buffer.from(body, 'utf8')
const addressList = (v) => String(v ?? '').split(',').map((p) => (/<([^>]+)>/.exec(p)?.[1] ?? p).trim().toLowerCase()).filter((a) => a.includes('@'))
/** What Gmail's `raw` says: who, to whom, about what, its words and its files. */
function readRaw(raw) {
  const { headers, body } = splitMessage(raw)
  const type = headers['content-type'] ?? 'text/plain'
  let text = ''
  const attachments = []
  const boundary = /boundary="?([^";]+)"?/i.exec(type)?.[1]
  if (/^multipart\//i.test(type) && boundary) {
    for (const part of body.split(`--${boundary}`).slice(1)) {
      if (part.startsWith('--')) break
      const p = splitMessage(part.replace(/^\r?\n/, ''))
      const disposition = p.headers['content-disposition'] ?? ''
      const content = bodyOf(p.headers, p.body.replace(/\r?\n$/, ''))
      if (/attachment/i.test(disposition)) {
        const name = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1]
        attachments.push({ name: name ? decodeURIComponent(name) : (/filename="([^"]*)"/i.exec(disposition)?.[1] ?? ''), contentType: p.headers['content-type'] ?? '', size: content.length })
      } else if (!text && /text\/plain/i.test(p.headers['content-type'] ?? '')) text = content.toString('utf8')
    }
  } else text = bodyOf(headers, body).toString('utf8')
  const from = headers.from ?? ''
  return {
    from: (/<([^>]+)>/.exec(from)?.[1] ?? from).trim().toLowerCase(),
    fromName: decodeWords(from.replace(/<[^>]*>/, '').replace(/"/g, '').trim()),
    to: addressList(headers.to),
    cc: addressList(headers.cc),
    bcc: addressList(headers.bcc),
    subject: decodeWords(headers.subject ?? ''),
    inReplyTo: headers['in-reply-to'] ?? null,
    text,
    attachments,
  }
}
const gmailMessage = (m) => ({
  id: m.id,
  threadId: m.threadId,
  labelIds: [m.direction === 'sent' ? 'SENT' : 'INBOX'],
  internalDate: String(m.at),
  payload: {
    mimeType: 'text/plain',
    headers: [
      { name: 'From', value: m.fromName ? `"${m.fromName}" <${m.from}>` : m.from },
      { name: 'To', value: m.to.join(', ') },
      { name: 'Subject', value: m.subject },
      { name: 'Message-ID', value: m.internetMessageId },
      { name: 'Date', value: new Date(m.at).toUTCString() },
    ],
    body: { data: Buffer.from(m.text, 'utf8').toString('base64url') },
  },
})
const graphMessage = (m) => ({
  id: m.id,
  conversationId: m.threadId,
  internetMessageId: m.internetMessageId,
  subject: m.subject,
  isDraft: m.isDraft === true,
  receivedDateTime: new Date(m.at).toISOString(),
  from: { emailAddress: { address: m.from, name: m.fromName ?? '' } },
  toRecipients: m.to.map((address) => ({ emailAddress: { address } })),
  ccRecipients: m.cc.map((address) => ({ emailAddress: { address } })),
  bccRecipients: m.bcc.map((address) => ({ emailAddress: { address } })),
  body: { contentType: 'text', content: m.text },
  hasAttachments: m.attachments.length > 0,
})
const fromGraphRecipients = (xs) => (Array.isArray(xs) ? xs.map((r) => String(r?.emailAddress?.address ?? '').toLowerCase()).filter(Boolean) : [])
/** Drive's `q`, as far as the product writes it: the name term, and the visibility terms if any. */
const readDriveQuery = (q) => {
  const name = /name contains '((?:[^'\\]|\\.)*)'/.exec(q)?.[1]?.replace(/\\(.)/g, '$1') ?? ''
  const visibility = [...q.matchAll(/visibility = '([a-zA-Z]+)'/g)].map((m) => m[1])
  return { name, visibility }
}

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

  if (path === '/__control/search' && req.method === 'POST') {
    const body = await readBody(req)
    if (!body?.token) return json(res, 400, { error: 'a token is required' })
    searchAccounts.set(body.token, {
      drive: body.drive ?? [],
      gmail: body.gmail ?? [],
      sharepoint: body.sharepoint ?? [],
      asked: [],
    })
    return json(res, 200, { token: body.token })
  }
  if (path === '/__control/code' && req.method === 'POST') {
    const body = await readBody(req)
    if (!body?.code || !body?.accessToken) return json(res, 400, { error: 'a code and the access token it answers are required' })
    codes.set(body.code, body)
    return json(res, 200, { code: body.code })
  }
  if (path === '/google/userinfo' && req.method === 'GET') {
    const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1] ?? ''
    const who = profiles.get(token)
    if (!who) return refused(res, 'gcal')
    return json(res, 200, who)
  }
  if (path === '/__control/search' && req.method === 'GET') {
    const acct = searchAccounts.get(url.searchParams.get('token') ?? '')
    if (!acct) return json(res, 404, { error: 'no account for that token' })
    return json(res, 200, { asked: acct.asked })
  }

  // ── mailboxes: seeded, read, answered in, and failed ─────────────────────────
  if (path === '/__control/mailbox' && req.method === 'POST') {
    const body = await readBody(req)
    if (!body?.token || !['gmail', 'outlook'].includes(body.provider) || !body.address) {
      return json(res, 400, { error: 'a token, a provider (gmail or outlook) and the address are required' })
    }
    const box = { provider: body.provider, address: String(body.address).toLowerCase(), name: body.name ?? '', messages: [], fail: null }
    mailboxes.set(body.token, box)
    if (body.refreshToken) mailboxRefreshes.set(body.refreshToken, box)
    return json(res, 200, { token: body.token })
  }
  if (path === '/__control/mailbox' && req.method === 'GET') {
    const box = mailboxes.get(url.searchParams.get('token') ?? '')
    if (!box) return json(res, 404, { error: 'no mailbox for that token' })
    return json(res, 200, { provider: box.provider, address: box.address, messages: box.messages })
  }
  if (path === '/__control/mailbox/answer' && req.method === 'POST') {
    const body = await readBody(req)
    const box = mailboxes.get(body?.token ?? '')
    if (!box) return json(res, 404, { error: 'no mailbox for that token' })
    const thread = box.messages.filter((m) => m.threadId === body.threadId && !m.isDraft)
    if (thread.length === 0) return json(res, 404, { error: 'no such thread in that mailbox' })
    const last = thread[thread.length - 1]
    const id = `in-${randomUUID()}`
    const m = {
      id,
      threadId: body.threadId,
      internetMessageId: `<${id}@answer.test>`,
      from: String(body.from ?? '').toLowerCase(),
      fromName: body.fromName ?? '',
      to: [box.address],
      cc: [],
      bcc: [],
      subject: body.subject ?? (/^re:/i.test(last.subject) ? last.subject : `Re: ${last.subject}`),
      text: String(body.text ?? ''),
      inReplyTo: last.internetMessageId,
      attachments: [],
      direction: 'received',
      isDraft: false,
      at: Math.max(Date.now(), last.at + 1),
    }
    box.messages.push(m)
    return json(res, 200, { id: m.id, internetMessageId: m.internetMessageId })
  }
  if (path === '/__control/mailbox/fail' && req.method === 'POST') {
    const body = await readBody(req)
    const box = mailboxes.get(body?.token ?? '')
    if (!box) return json(res, 404, { error: 'no mailbox for that token' })
    box.fail = { status: Number(body.status ?? 500), left: Number(body.count ?? 1), on: body.on === 'write' ? 'write' : 'any' }
    return json(res, 200, { staged: box.fail })
  }

  const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1] ?? ''
  // Whose grant a consent gave, read by the product before anything else (Graph's `/me`).
  if (path === '/graph/v1.0/me' && req.method === 'GET' && (profiles.has(bearer) || mailboxes.has(bearer))) {
    const who = profiles.get(bearer)
    const box = mailboxes.get(bearer)
    return json(res, 200, {
      id: who?.sub ?? `mailbox-${box?.address}`,
      mail: who?.email ?? box?.address ?? null,
      userPrincipalName: who?.email ?? box?.address ?? null,
      displayName: who?.name ?? box?.name ?? null,
    })
  }
  const box = mailboxes.get(bearer)
  const gmailMail = path === '/gmail/v1/users/me/messages/send' || path.startsWith('/gmail/v1/users/me/threads/') || (path.startsWith('/gmail/v1/users/me/messages/') && !!box)
  const graphMail = path === '/graph/v1.0/me/messages' || path.startsWith('/graph/v1.0/me/messages/')
  if (gmailMail || graphMail) {
    const provider = gmailMail ? 'gmail' : 'outlook'
    if (!box || box.provider !== provider) return refused(res, provider === 'gmail' ? 'gcal' : 'outlook')
    if (box.fail && box.fail.left > 0 && (box.fail.on !== 'write' || req.method !== 'GET')) {
      box.fail.left -= 1
      const status = box.fail.status
      if (box.fail.left === 0) box.fail = null
      return status === 401 ? refused(res, provider === 'gmail' ? 'gcal' : 'outlook') : failed(res, provider === 'gmail' ? 'gcal' : 'outlook', status)
    }
    const notFound = () =>
      provider === 'gmail'
        ? json(res, 404, { error: { code: 404, message: 'Requested entity was not found.' } })
        : json(res, 404, { error: { code: 'ErrorItemNotFound', message: 'The specified object was not found in the store.' } })

    if (path === '/gmail/v1/users/me/messages/send' && req.method === 'POST') {
      const body = await readBody(req)
      if (typeof body?.raw !== 'string') return json(res, 400, { error: { code: 400, message: "'raw' RFC822 payload message string or uploading message via /upload/* URL required" } })
      const read = readRaw(Buffer.from(body.raw, 'base64url').toString('utf8'))
      if (body.threadId && !box.messages.some((m) => m.threadId === body.threadId)) return notFound()
      const id = `gm-${randomUUID()}`
      box.messages.push({
        id,
        threadId: body.threadId || id,
        internetMessageId: `<${id}@mail.gmail.test>`,
        ...read,
        // Gmail sends as the mailbox, whatever From says.
        from: box.address,
        direction: 'sent',
        isDraft: false,
        at: Date.now(),
      })
      return json(res, 200, { id, threadId: body.threadId || id, labelIds: ['SENT'] })
    }
    if (path.startsWith('/gmail/v1/users/me/messages/') && req.method === 'GET') {
      const m = box.messages.find((x) => x.id === decodeURIComponent(path.slice('/gmail/v1/users/me/messages/'.length)))
      return m ? json(res, 200, gmailMessage(m)) : notFound()
    }
    if (path.startsWith('/gmail/v1/users/me/threads/') && req.method === 'GET') {
      const threadId = decodeURIComponent(path.slice('/gmail/v1/users/me/threads/'.length))
      const messages = box.messages.filter((m) => m.threadId === threadId && !m.isDraft)
      return messages.length ? json(res, 200, { id: threadId, messages: messages.map(gmailMessage) }) : notFound()
    }

    const draftFrom = (body, threadId, inReplyTo) => {
      const id = `ol-${randomUUID()}`
      return {
        id,
        threadId,
        internetMessageId: `<${id}@outlook.test>`,
        from: box.address,
        fromName: box.name,
        to: fromGraphRecipients(body?.toRecipients),
        cc: fromGraphRecipients(body?.ccRecipients),
        bcc: fromGraphRecipients(body?.bccRecipients),
        subject: String(body?.subject ?? ''),
        text: String(body?.body?.content ?? ''),
        inReplyTo,
        attachments: (Array.isArray(body?.attachments) ? body.attachments : []).map((a) => ({ name: a.name, contentType: a.contentType, size: Buffer.from(a.contentBytes ?? '', 'base64').length })),
        direction: 'sent',
        isDraft: true,
        at: Date.now(),
      }
    }
    if (path === '/graph/v1.0/me/messages' && req.method === 'POST') {
      const body = await readBody(req)
      const draft = draftFrom(body, `conv-${randomUUID()}`, null)
      box.messages.push(draft)
      return json(res, 201, graphMessage(draft))
    }
    if (path === '/graph/v1.0/me/messages' && req.method === 'GET') {
      const filter = url.searchParams.get('$filter') ?? ''
      const conversation = /conversationId eq '((?:[^']|'')*)'/.exec(filter)?.[1]?.replace(/''/g, "'")
      const messages = box.messages.filter((m) => conversation === undefined || m.threadId === conversation)
      return json(res, 200, { value: messages.map(graphMessage) })
    }
    const m = /^\/graph\/v1\.0\/me\/messages\/([^/]+)(?:\/(createReply|attachments|send))?$/.exec(path)
    const target = m ? box.messages.find((x) => x.id === decodeURIComponent(m[1])) : null
    if (!m || !target) return notFound()
    if (m[2] === 'createReply' && req.method === 'POST') {
      const body = (await readBody(req)) ?? {}
      const given = body.message ?? {}
      const draft = draftFrom(
        {
          ...given,
          subject: given.subject ?? (/^re:/i.test(target.subject) ? target.subject : `RE: ${target.subject}`),
          toRecipients: given.toRecipients ?? [{ emailAddress: { address: target.from } }],
        },
        target.threadId,
        target.internetMessageId,
      )
      box.messages.push(draft)
      return json(res, 201, graphMessage(draft))
    }
    if (m[2] === 'attachments' && req.method === 'POST') {
      if (!target.isDraft) return json(res, 400, { error: { code: 'ErrorInvalidRequest', message: 'Attachments are added to a draft.' } })
      const a = (await readBody(req)) ?? {}
      target.attachments.push({ name: a.name, contentType: a.contentType, size: Buffer.from(a.contentBytes ?? '', 'base64').length })
      return json(res, 201, { id: `att-${randomUUID()}`, name: a.name })
    }
    if (m[2] === 'send' && req.method === 'POST') {
      if (!target.isDraft) return json(res, 400, { error: { code: 'ErrorInvalidRequest', message: 'Only a draft is sent.' } })
      target.isDraft = false
      target.at = Date.now()
      return empty(res, 202)
    }
    if (!m[2] && req.method === 'GET') return json(res, 200, graphMessage(target))
    return notFound()
  }

  // ── the federated searches: an account per bearer token ──────────────────────
  const driveSearch = path === '/google/drive/v3/files' && req.method === 'GET'
  const gmailList = path === '/gmail/v1/users/me/messages' && req.method === 'GET'
  const gmailOne = path.startsWith('/gmail/v1/users/me/messages/') && req.method === 'GET'
  const graphSearch = path === '/graph/v1.0/search/query' && req.method === 'POST'
  if (driveSearch || gmailList || gmailOne || graphSearch) {
    const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1] ?? ''
    const acct = searchAccounts.get(token)
    if (!acct) return refused(res, graphSearch ? 'outlook' : 'gcal')
    const has = (text, term) => String(text ?? '').toLowerCase().includes(String(term ?? '').toLowerCase())
    if (driveSearch) {
      const q = url.searchParams.get('q') ?? ''
      acct.asked.push({ source: 'drive', query: q })
      const { name, visibility } = readDriveQuery(q)
      const files = acct.drive.filter((f) => has(f.name, name) && (visibility.length === 0 || visibility.includes(f.visibility ?? 'limited')))
      return json(res, 200, { files: files.map((f) => ({ id: f.id, name: f.name, mimeType: 'application/vnd.google-apps.document', webViewLink: `https://drive.google.test/file/d/${f.id}/view`, modifiedTime: f.modifiedTime ?? '2026-10-01T09:00:00.000Z' })) })
    }
    if (gmailList) {
      const q = url.searchParams.get('q') ?? ''
      acct.asked.push({ source: 'gmail', query: q })
      const phrase = q.replace(/^"|"$/g, '')
      return json(res, 200, { messages: acct.gmail.filter((m) => has(m.subject, phrase) || has(m.snippet, phrase)).map((m) => ({ id: m.id, threadId: m.id })) })
    }
    if (gmailOne) {
      const id = decodeURIComponent(path.slice('/gmail/v1/users/me/messages/'.length))
      const m = acct.gmail.find((x) => x.id === id)
      if (!m) return json(res, 404, { error: { code: 404, message: 'Requested entity was not found.' } })
      return json(res, 200, {
        id: m.id,
        snippet: m.snippet ?? '',
        internalDate: String(Date.parse(m.date ?? '2026-10-01T09:00:00Z')),
        payload: { headers: [{ name: 'Subject', value: m.subject ?? '' }, { name: 'From', value: m.from ?? '' }, { name: 'Date', value: m.date ?? '' }] },
      })
    }
    const body = await readBody(req)
    const query = body?.requests?.[0]?.query?.queryString ?? ''
    acct.asked.push({ source: 'sharepoint', query })
    const hits = acct.sharepoint.filter((f) => has(f.name, query)).map((f) => ({ resource: { id: f.id, name: f.name, webUrl: f.webUrl, lastModifiedDateTime: f.lastModifiedDateTime ?? '2026-10-01T09:00:00Z' } }))
    return json(res, 200, { value: [{ hitsContainers: [{ hits, total: hits.length, moreResultsAvailable: false }] }] })
  }

  // ── the token addresses: a refresh answers a new access token for the same calendar ──
  if ((path === '/google/token' || path === '/microsoft/token') && req.method === 'POST') {
    const raw = await new Promise((resolve) => {
      let b = ''
      req.on('data', (c) => (b += c))
      req.on('end', () => resolve(b))
    })
    const form = new URLSearchParams(raw)
    // A consent's code, once: answered with the grant it was seeded with.
    if (form.get('grant_type') === 'authorization_code') {
      const grant = codes.get(form.get('code') ?? '')
      // A code is answered at its own provider's address: Microsoft's only when it was seeded as Microsoft's.
      const theirs = path === '/google/token' ? grant?.provider !== 'outlook' : grant?.provider === 'outlook'
      if (!grant || !theirs) return json(res, 400, { error: 'invalid_grant', error_description: 'Malformed auth code.' })
      codes.delete(form.get('code'))
      profiles.set(grant.accessToken, { sub: grant.sub ?? grant.accessToken, email: grant.email ?? null, name: grant.name ?? null })
      return json(res, 200, {
        access_token: grant.accessToken,
        ...(grant.refreshToken ? { refresh_token: grant.refreshToken } : {}),
        expires_in: 3599,
        scope: (grant.scopes ?? []).join(' '),
        token_type: 'Bearer',
      })
    }
    // A mailbox's refresh: a new access token for the same mailbox.
    const mailbox = form.get('grant_type') === 'refresh_token' ? mailboxRefreshes.get(form.get('refresh_token') ?? '') : null
    if (mailbox && (path === '/google/token') === (mailbox.provider === 'gmail')) {
      const token = `mailbox-refreshed-${randomUUID()}`
      mailboxes.set(token, mailbox)
      return json(res, 200, { access_token: token, expires_in: 3599, token_type: 'Bearer' })
    }
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

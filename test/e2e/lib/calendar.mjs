/**
 * THE LANE'S CALENDARS, as a suite reaches them — in one place, as the store's
 * address is (`lib/store.mjs`). Lane k runs its API on 302k and its calendar
 * stub (`scripts/e2e-lanes/calendar-stub.mjs`) on 94k; CI sets
 * `E2E_CALENDAR_PORT` once, at job level.
 *
 * A calendar there is a bearer token: a suite seeds one with the token it puts
 * on the account row it makes, so nothing it does reaches another suite's.
 * Every call here forgets nothing but the token it names.
 */

/** Where the stub listens: `--calendar`, then `E2E_CALENDAR_PORT`, then the lane formula. */
export function calendarBase(apiPort, override) {
  const port = Number(override ?? process.env.E2E_CALENDAR_PORT ?? 9400 + (apiPort - 3020))
  return `http://127.0.0.1:${port}`
}

const post = async (base, path, body) => {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`the calendar stub answered ${res.status} to ${path}`)
  return res.json()
}

/**
 * Seed (replace) a calendar: `provider` is `gcal` or `outlook`; each event is
 * `{ id?, title, start, end, allDay?, location? }`, an all-day one's dates as
 * `YYYY-MM-DD` with the day after its last as its end. With `refreshToken`, a
 * refresh at the provider's token address answers a new token for it.
 */
export const seedCalendar = (base, { token, provider, events = [], refreshToken }) =>
  post(base, '/__control/calendar', { token, provider, events, refreshToken })

/** Its events now, and what the product wrote to it: `{ provider, events, writes }`, or null. */
export async function readCalendar(base, token) {
  const res = await fetch(`${base}/__control/calendar?token=${encodeURIComponent(token)}`)
  return res.ok ? res.json() : null
}

/** The next `count` calls with this token answer `status`. */
export const failCalendar = (base, token, status, count = 1) =>
  post(base, '/__control/fail', { token, status, count })

/** Forget the token, its refresh tokens and everything it held. */
export const forgetCalendar = (base, token) => post(base, '/__control/reset', { token })

/**
 * SEARCH'S THREE FEDERATED SOURCES, answered by the same stub
 * (`found-23-sep/connected-search-per-person`): seed (replace) the account a
 * token opens — Drive files `{id, name, visibility}`, Gmail messages
 * `{id, subject, from, snippet, date}`, SharePoint files `{id, name, webUrl}`.
 */
export const seedSearchAccount = (base, { token, drive = [], gmail = [], sharepoint = [] }) =>
  post(base, '/__control/search', { token, drive, gmail, sharepoint })

/** What was asked of an account, query by query: `[{source, query}]`, or null. */
export async function searchesAsked(base, token) {
  const res = await fetch(`${base}/__control/search?token=${encodeURIComponent(token)}`)
  return res.ok ? (await res.json()).asked : null
}

/**
 * A consent's code: its provider's token address exchanges it once for this
 * grant — `POST /google/token`, or `/microsoft/token` for `provider: 'outlook'`
 * — and `/google/userinfo` or Graph's `/me` names its account.
 */
export const seedConsentCode = (base, { code, accessToken, refreshToken, email, sub, scopes = [], provider, name }) =>
  post(base, '/__control/code', { code, accessToken, refreshToken, email, sub, scopes, provider, name })

/**
 * A MAILBOX TO SEND A TASK'S EMAIL FROM (`found-9-oct/task-email-sends-from-the-server`):
 * seed (replace) the Gmail or Outlook mailbox a token opens; with
 * `refreshToken`, a refresh at its provider's token address answers a new
 * token for it.
 */
export const seedMailbox = (base, { token, provider, address, name = '', refreshToken }) =>
  post(base, '/__control/mailbox', { token, provider, address, name, refreshToken })

/** Its messages, sent and received: `{ provider, address, messages }`, or null. */
export async function readMailbox(base, token) {
  const res = await fetch(`${base}/__control/mailbox?token=${encodeURIComponent(token)}`)
  return res.ok ? res.json() : null
}

/** Somebody answers in a thread of the mailbox: `{ id, internetMessageId }`. */
export const answerInMailbox = (base, { token, threadId, from, fromName, text, subject }) =>
  post(base, '/__control/mailbox/answer', { token, threadId, from, fromName, text, subject })

/** The next `count` calls with this mailbox's token answer `status`. */
/** The next `count` calls with a mailbox's token answer `status`; `on: 'write'` spares the reads a poll makes. */
export const failMailbox = (base, token, status, count = 1, on = 'any') => post(base, '/__control/mailbox/fail', { token, status, count, on })

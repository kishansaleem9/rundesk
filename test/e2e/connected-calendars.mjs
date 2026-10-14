/**
 * A PERSON'S CONNECTED CALENDARS ARE READ, AND A BLOCK IS WRITTEN TO ONE
 * (`found-25-sep/connected-calendars-read-by-nothing`).
 *
 * The planner's Accounts page says "Connect one and your events appear on the
 * Planner, and your tasks can go the other way", and that one calendar "is where
 * new events are created". Nothing read a connected calendar's events — the only
 * call to one was Google's free/busy — and nothing wrote one: the grid drew
 * Rundesk's blocks alone and the Meetings page's "Upcoming" Rundesk's meetings.
 *
 * Against the lane's calendar stub (`scripts/e2e-lanes/calendar-stub.mjs`), in
 * which a calendar is a bearer token: a person of the run's own, with three
 * accounts — a Google default with events, a Microsoft one whose grant is gone,
 * and a Google one whose token has expired — and a colleague in their workspace.
 *
 *   node test/e2e/connected-calendars.mjs --api 3024 --dist /tmp/claude-0/dist-4
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil } from './lib/wait.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'
import { calendarBase, seedCalendar, readCalendar, failCalendar, forgetCalendar } from './lib/calendar.mjs'
import { openKept } from './lib/sealed.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 11

const REPO = path.resolve(import.meta.dirname, '../..')
const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const DIST = path.resolve(REPO, argOf('--dist', 'apps/web/dist'))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
const CAL = calendarBase(API_PORT, argOf('--calendar', undefined))

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

// lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`).
const apiAs = apiAsAt(API, { noAnswer: 'throw' })

const stamp = Date.now()
const TAG = `cal-${stamp}`
const PASSWORD = 'Calendars@12345!'
/** The calendars, each a token of this run's own. */
const TOKENS = { google: `${TAG}-google`, gone: `${TAG}-gone`, stale: `${TAG}-stale`, fresh: `${TAG}-fresh` }
const REFRESH = `${TAG}-refresh`

/* The day the run is in, in UTC, which the browser is told it is in too. */
const now = new Date()
const day = now.toISOString().slice(0, 10)
const at = (hh, mm = 0) => new Date(`${day}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00.000Z`)
const nextDay = new Date(at(0).getTime() + 86_400_000).toISOString().slice(0, 10)
const soon = new Date(Math.ceil((now.getTime() + 2 * 3_600_000) / 60_000) * 60_000)

const EVENTS = {
  standup: { id: `${TAG}-standup`, title: `Standup ${TAG}`, start: at(14).toISOString(), end: at(14, 30).toISOString() },
  holiday: { id: `${TAG}-holiday`, title: `Holiday ${TAG}`, start: day, end: nextDay, allDay: true },
  review: { id: `${TAG}-review`, title: `Review ${TAG}`, start: soon.toISOString(), end: new Date(soon.getTime() + 30 * 60_000).toISOString() },
  refreshed: { id: `${TAG}-refreshed`, title: `Refreshed ${TAG}`, start: at(16).toISOString(), end: at(17).toISOString() },
}

const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
const browser = await chromium.launch(launchOptions())
let sql = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the accounts are planted by SQL, as an OAuth grant would leave them')

  // ── A person of the run's own, and a colleague in their workspace ─────────
  const meEmail = `${TAG}-me@rundesk.invalid`
  const me = await signUpApi(API, {
    fullName: 'Calendar person', email: meEmail, password: PASSWORD,
    organizationName: `Calendars ${stamp}`, organizationSlug: `calendars-${stamp}`,
  })
  const ME = apiAs(me.accessToken)
  const ws = (await ME('/workspaces')).data?.[0]
  const WS = ws?.workspace?.id ?? ws?.id
  if (!WS) throw new Error('the person signed up with no workspace to plan in')
  const colleagueEmail = `${TAG}-colleague@rundesk.invalid`
  const colleague = await signUpApi(API, {
    fullName: 'Calendar colleague', email: colleagueEmail, password: PASSWORD,
    organizationName: `Colleague ${stamp}`, organizationSlug: `colleague-${stamp}`,
  })
  const joined = await ME(`/workspaces/${WS}/members`, { method: 'POST', body: { email: colleagueEmail, role: 'member' } })
  if (joined.status >= 300) throw new Error(`could not add the colleague: ${joined.status}`)
  const THEM = apiAs(colleague.accessToken)

  // ── Their calendars: seeded at the stub, and connected as a grant leaves them ──
  await seedCalendar(CAL, { token: TOKENS.google, provider: 'gcal', events: [EVENTS.standup, EVENTS.holiday, EVENTS.review] })
  await seedCalendar(CAL, { token: TOKENS.fresh, provider: 'gcal', events: [EVENTS.refreshed], refreshToken: REFRESH })
  const plant = async ({ provider, key, token, refresh = null, expires, isDefault = false }) => {
    const [row] = await sql`
      insert into user_calendar_accounts
        (user_id, workspace_id, provider, external_account_id, external_account_email, access_token,
         refresh_token, token_expires_at, is_default, counts_as_busy, status)
      values (${me.user.id}, ${WS}, ${provider}, ${`${TAG}-${key}`}, ${`${key}-${stamp}@calendar.test`}, ${token},
              ${refresh}, ${expires}, ${isDefault}, true, 'connected')
      returning id::text as id`
    return row.id
  }
  const inAnHour = new Date(Date.now() + 3_600_000)
  const ACC = {
    google: await plant({ provider: 'gcal', key: 'google', token: TOKENS.google, expires: inAnHour, isDefault: true }),
    gone: await plant({ provider: 'outlook', key: 'gone', token: TOKENS.gone, expires: inAnHour }),
    stale: await plant({ provider: 'gcal', key: 'stale', token: TOKENS.stale, refresh: REFRESH, expires: new Date(Date.now() - 60_000) }),
  }
  const goneEmail = `gone-${stamp}@calendar.test`

  // ══ 1. WHAT THE PLANNER READS ═══════════════════════════════════════════
  console.log('\n▶ the planner asks for the events of the person’s calendars over two days')
  const window = `from=${at(0).toISOString()}&to=${new Date(at(0).getTime() + 2 * 86_400_000).toISOString()}`
  const read = await ME(`/planner/${WS}/events?${window}`)
  const events = read.data?.events ?? []
  const find = (e) => events.find((x) => x.id === e.id)
  const standup = find(EVENTS.standup)
  const holiday = find(EVENTS.holiday)
  chk(
    read.status === 200 && standup?.accountId === ACC.google && standup.title === EVENTS.standup.title
      && standup.start === EVENTS.standup.start && standup.allDay === false
      && holiday?.allDay === true && holiday.start === day && holiday.end === nextDay,
    'the events of a connected calendar are read: a timed one at its instants, an all-day one by its days, each with its account',
    `answered ${read.status}; the timed one ${JSON.stringify(standup ?? null)}; the all-day one ${JSON.stringify(holiday ?? null)}`,
  )
  // Kept sealed since batch 42, so opened as the API opens it: "not the expired one" was true of any
  // sealed value, the expired one sealed again among them (`found-14-oct/suites-read-sealed-secrets-raw`).
  const [staleRow] = await sql`select access_token, token_expires_at from user_calendar_accounts where id = ${ACC.stale}`
  const stale = staleRow && { ...staleRow, access_token: openKept(staleRow.access_token, 'user_calendar_accounts.access_token') }
  chk(
    find(EVENTS.refreshed)?.accountId === ACC.stale && /^refreshed-/.test(stale?.access_token ?? '') && new Date(stale?.token_expires_at) > new Date(),
    'and a calendar whose token has expired is read with a token refreshed at its token address, which is kept',
    `its event ${find(EVENTS.refreshed) ? 'was read' : 'was not read'}; the account's token is ${stale?.access_token === TOKENS.stale ? 'still the expired one' : /^refreshed-/.test(stale?.access_token ?? '') ? 'the one the token address gave' : `neither (${stale?.access_token === null ? 'it does not open' : 'another'})`}, expiring ${stale?.token_expires_at}`,
  )
  const unread = read.data?.unread ?? []
  chk(
    unread.some((u) => u.accountId === ACC.gone && u.reason === 'refused' && u.email === goneEmail) && !unread.some((u) => u.accountId !== ACC.gone),
    'and a calendar whose grant is gone is named as refused, rather than read as an empty one',
    `unread: ${JSON.stringify(unread)}`,
  )
  const theirs = await THEM(`/planner/${WS}/events?${window}`)
  const leaked = (theirs.data?.events ?? []).filter((e) => Object.values(EVENTS).some((x) => x.id === e.id))
  chk(
    theirs.status === 200 && leaked.length === 0 && (theirs.data?.unread ?? []).length === 0,
    'a colleague in the same workspace reads none of them: the route answers the caller’s own calendars alone',
    `answered ${theirs.status}; the colleague read ${leaked.length} of the person's events, and ${JSON.stringify(theirs.data?.unread ?? null)} unread`,
  )

  // ══ 2. WHAT A BLOCK WRITES ════════════════════════════════════════════════
  console.log('\n▶ a block made, moved and deleted on the planner, with a default calendar')
  const eventsOf = async (token) => (await readCalendar(CAL, token))?.events ?? []
  const made = await ME(`/planner/${WS}/blocks`, {
    method: 'POST',
    body: { title: `Focus ${TAG}`, startsAt: at(18).toISOString(), endsAt: at(19).toISOString() },
  })
  const BLOCK = made.data?.id
  const written = (await eventsOf(TOKENS.google)).find((e) => e.title === `Focus ${TAG}`)
  chk(
    made.status < 300 && made.data?.calendar?.written === true && made.data?.calendar?.accountId === ACC.google
      && !!written && Date.parse(written.start) === at(18).getTime() && Date.parse(written.end) === at(19).getTime(),
    'a block made on the planner is written to the default calendar as an event at its time, and the answer says so',
    `answered ${made.status} with ${JSON.stringify(made.data?.calendar ?? null)}; the calendar holds ${JSON.stringify(written ?? null)}`,
  )
  const moved = BLOCK
    ? await ME(`/planner/${WS}/blocks/${BLOCK}`, { method: 'PATCH', body: { startsAt: at(19).toISOString(), endsAt: at(20).toISOString() } })
    : { status: 0 }
  const after = written ? (await eventsOf(TOKENS.google)).find((e) => e.id === written.id) : null
  const gone = BLOCK ? await ME(`/planner/${WS}/blocks/${BLOCK}`, { method: 'DELETE' }) : { status: 0 }
  const still = written ? (await eventsOf(TOKENS.google)).some((e) => e.id === written.id) : true
  chk(
    moved.ok && !!after && Date.parse(after.start) === at(19).getTime() && Date.parse(after.end) === at(20).getTime()
      && gone.ok && !still,
    'and moving the block moves that event, and deleting the block deletes it',
    `moved ${moved.status}: the event ${after ? `at ${after.start}–${after.end}` : 'is missing'}; deleted ${gone.status}: the event ${still ? 'is still there' : 'is gone'}`,
  )

  console.log('\n▶ a block whose calendar does not answer, and one that is drawn once')
  await failCalendar(CAL, TOKENS.google, 503, 1)
  const refused = await ME(`/planner/${WS}/blocks`, {
    method: 'POST',
    body: { title: `Unanswered ${TAG}`, startsAt: at(20).toISOString(), endsAt: at(21).toISOString() },
  })
  const kept = refused.data?.id
    ? (await sql`select count(*)::int as n from task_time_blocks where id = ${refused.data.id}`)[0].n === 1
    : false
  chk(
    refused.status < 300 && kept && refused.data?.calendar?.written === false && refused.data?.calendar?.reason === 'failed',
    'a block its calendar does not take is saved here all the same, and the answer says it was not written',
    `answered ${refused.status} with ${JSON.stringify(refused.data?.calendar ?? null)}; the block ${kept ? 'is saved' : 'is not saved'}`,
  )
  const twice = await ME(`/planner/${WS}/blocks`, {
    method: 'POST',
    body: { title: `Once ${TAG}`, startsAt: at(21).toISOString(), endsAt: at(22).toISOString() },
  })
  const asEvent = (await eventsOf(TOKENS.google)).find((e) => e.title === `Once ${TAG}`)
  const reread = await ME(`/planner/${WS}/events?${window}`)
  chk(
    twice.data?.calendar?.written === true && !!asEvent && reread.status === 200
      && !(reread.data?.events ?? []).some((e) => e.id === asEvent.id),
    'and a block written to a calendar is not read back from it as an event: it is drawn once, as the block',
    `written ${JSON.stringify(twice.data?.calendar ?? null)}; in the calendar as ${asEvent?.id ?? 'nothing'}; read back as an event: ${(reread.data?.events ?? []).some((e) => e.id === asEvent?.id)}`,
  )

  // ══ 3. WHAT THE PAGES DRAW ════════════════════════════════════════════════
  console.log('\n▶ the planner and the Meetings page, signed in as the person, in UTC')
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, timezoneId: 'UTC' })
  const page = await ctx.newPage()
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', meEmail)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.goto(`${stack.base}/app/${WS}/calendar`, { waitUntil: 'domcontentloaded' })
  const drawnIn = (where, e) =>
    page.locator(`${where} [data-testid="planner-calendar-event"][data-event-id="${e.id}"]`)
  const timedThere = drawnIn(`[data-testid="planner-day-column"][data-day="${day}"]`, EVENTS.standup)
  const allDayThere = drawnIn('[data-testid="planner-allday-row"]', EVENTS.holiday)
  await waitUntil(async () => (await timedThere.count()) > 0 && (await allDayThere.count()) > 0, { timeoutMs: 20_000 })
  const timedText = await timedThere.filter({ visible: true }).first().innerText({ timeout: 5000 }).catch(() => '')
  const allDayDay = (await allDayThere.count()) ? await allDayThere.first().getAttribute('data-day') : null
  chk(
    timedText.includes(EVENTS.standup.title) && allDayDay === day,
    'the planner draws a connected calendar’s timed event in its day’s column and its all-day event in the all-day row',
    `the timed one ${timedText ? `reads "${timedText}"` : 'is not drawn in its column'}; the all-day one ${allDayDay ? `is drawn on ${allDayDay}` : 'is not drawn in the all-day row'}`,
  )
  const named = page.locator(`[data-testid="planner-calendar-unread"] [data-account-id="${ACC.gone}"][data-reason="refused"]`)
  await waitUntil(async () => (await named.count()) > 0, { timeoutMs: 10_000 })
  const namedText = await named.filter({ visible: true }).first().innerText({ timeout: 5000 }).catch(() => '')
  chk(
    namedText.includes(goneEmail),
    'and says, by its address, which calendar it could not read',
    namedText ? `it says "${namedText}"` : 'nothing names it',
  )

  await page.goto(`${stack.base}/app/${WS}/meetings`, { waitUntil: 'domcontentloaded' })
  const listed = page.locator(`[data-testid="meeting-upcoming-event"][data-event-id="${EVENTS.review.id}"]`)
  const unlisted = page.locator(`[data-testid="meetings-upcoming-unread"][data-account-id="${ACC.gone}"]`)
  await waitUntil(async () => (await listed.count()) > 0 && (await unlisted.count()) > 0, { timeoutMs: 20_000 })
  const listedText = await listed.filter({ visible: true }).first().innerText({ timeout: 5000 }).catch(() => '')
  chk(
    listedText.includes(EVENTS.review.title) && listedText.includes(`google-${stamp}@calendar.test`) && (await unlisted.count()) > 0,
    'Meetings’ “Upcoming” lists the next meeting in a connected calendar, with whose calendar it is, and names the one it could not read',
    `the meeting ${listedText ? `reads "${listedText.replace(/\s+/g, ' ')}"` : 'is not listed'}; the unread calendar is ${(await unlisted.count()) ? 'named' : 'not named'}`,
  )
  await ctx.close()
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  for (const token of Object.values(TOKENS)) await forgetCalendar(CAL, token).catch(() => {})
  await sql?.end?.({ timeout: 5 }).catch(() => {})
  await browser.close().catch(() => {})
  stack?.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}

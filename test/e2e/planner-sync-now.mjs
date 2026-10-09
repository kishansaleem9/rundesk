/**
 * THE PLANNER'S SYNC NOW (`ledger-rows/row-1904`).
 *
 * Frame `14:36` draws the planner's top-right cluster — `Week ▾`, an AI-notes
 * icon, the calendars chip, a circular-arrows refresh and the ⚙ — and the
 * planner had no refresh: an event added in the calendar after the week was
 * drawn stayed off it, and a synced task's event deleted or changed in the
 * calendar stayed so until the task itself changed. ClickUp's calendar reads
 * its connected calendars and writes the tasks synced to them; its own refresh
 * is the 2025 "Resync" control (through search excerpts).
 *
 * Sync now writes the presser's syncs through again into their OWN calendars
 * (`ledger-rows/row-1962`): every task their syncs hold, each event written
 * whether or not it looks changed, so one deleted in the calendar is written
 * again and one the calendar changed is put back as the task says; and the
 * calendars' events are read again, so what was added there is drawn.
 *
 * Against the lane's calendar stub, in which a calendar is a bearer token: a
 * member and a colleague, each with a Google calendar synced to the same list.
 *
 *   node test/e2e/planner-sync-now.mjs --api 3027 --dist /tmp/claude-0/dist-7
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil } from './lib/wait.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'
import { calendarBase, seedCalendar, readCalendar, forgetCalendar } from './lib/calendar.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 5

const REPO = path.resolve(import.meta.dirname, '../..')
const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const CAL = calendarBase(API_PORT, argOf('--calendar', undefined))
const ADMIN = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const API = `${stack.base}/api/v1`
// lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). Never throws: `{status, data, error}`.
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `psn${stamp}`
const PASSWORD = 'PlannerSync@12345!'
const TOKENS = { member: `${TAG}-member`, colleague: `${TAG}-colleague` }

/* Today, in UTC, which the browser is told it is in too. */
const day = new Date().toISOString().slice(0, 10)
const at = (hh, mm = 0) => new Date(`${day}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00.000Z`)

/** The member's or colleague's calendar at the stub, as Google answers it, by its token. */
const google = (token, rest = '', init = {}) =>
  fetch(`${CAL}/google/calendar/v3/calendars/primary/events${rest}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  })

let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the calendars are connected by SQL, as a grant leaves them')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id

  const person = async (key) => {
    const email = `${TAG}-${key}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `Sync ${key}`, email, password: PASSWORD, organizationName: `Sync ${key} ${stamp}`, organizationSlug: `sync-${key}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'member' } })
    if (!added.ok) throw new Error(`could not add the ${key}: ${said(added)}`)
    const [row] = await sql`select id from users where email = ${email}`
    return { id: row.id, email, as: apiAs(signed.accessToken) }
  }
  const member = await person('member')
  const colleague = await person('colleague')

  const must = (res, what) => {
    if (!res.ok || !res.data?.id) throw new Error(`could not make ${what}: ${said(res)}`)
    return res.data.id
  }
  const S = must(await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} Studio` } }), 'the space')
  const P = must(await A('/projects', { method: 'POST', body: { spaceId: S, name: `${TAG} Launch` } }), 'the project')
  const L = must(await A('/lists', { method: 'POST', body: { projectId: P, name: `${TAG} Launch list` } }), 'the list')

  // Their calendars, seeded at the stub and connected as a grant leaves them; each synced to the list.
  const connect = async (who, token) => {
    await seedCalendar(CAL, { token, provider: 'gcal', events: [] })
    const [row] = await sql`
      insert into user_calendar_accounts
        (user_id, workspace_id, provider, external_account_id, external_account_email, access_token, token_expires_at, is_default, counts_as_busy, status)
      values (${who.id}, ${WS}, 'gcal', ${`${token}-account`}, ${`${token}@calendar.test`}, ${token},
              ${new Date(Date.now() + 3_600_000)}, true, true, 'connected')
      returning id::text as id`
    const synced = await who.as(`/workspaces/${WS}/calendar-sync/rules`, { method: 'POST', body: { scopeType: 'list', scopeId: L, accountId: row.id } })
    if (synced.status !== 201) throw new Error(`could not sync the list: ${said(synced)}`)
    return row.id
  }
  await connect(member, TOKENS.member)
  await connect(colleague, TOKENS.colleague)

  const titled = (title) => `${TAG} ${title}`
  const eventsOf = async (token) => (await readCalendar(CAL, token))?.events ?? []
  const named = async (token, title) => (await eventsOf(token)).filter((e) => e.title === titled(title))
  const shows = (token, title) => waitUntil(async () => (await named(token, title)).length === 1, { timeoutMs: 20_000 })
  const MORNING = must(await A('/tasks', { method: 'POST', body: { listId: L, title: titled('Morning review'), dueDate: at(9).toISOString() } }), 'the morning task')
  const AFTERNOON = must(await A('/tasks', { method: 'POST', body: { listId: L, title: titled('Afternoon review'), dueDate: at(15).toISOString() } }), 'the afternoon task')
  const writtenFirst = (await shows(TOKENS.member, 'Morning review')) && (await shows(TOKENS.member, 'Afternoon review'))
    && (await shows(TOKENS.colleague, 'Morning review'))
  if (!writtenFirst) throw new Error('the list’s tasks were never written to the calendars its syncs name')
  // A dated task the list holds that was never pushed, as an import leaves one.
  const [imported] = await sql`
    insert into tasks (list_id, title, due_date, due_date_has_time, created_by_id)
    values (${L}, ${titled('Imported review')}, ${at(17)}, true, ${member.id}) returning id::text as id`

  // ══ 1. THE BUTTON ═════════════════════════════════════════════════════════
  console.log('\n▶ the planner, signed in as the member, in UTC')
  browser = await chromium.launch(launchOptions())
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, timezoneId: 'UTC' })
  const page = await ctx.newPage()
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', member.email)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
  await page.goto(`${stack.base}/app/${WS}/calendar`, { waitUntil: 'domcontentloaded' })
  const syncButton = page.getByTestId('planner-sync-now')
  const gear = page.getByTestId('planner-settings')
  const buttonShown = await syncButton.waitFor({ state: 'visible', timeout: 20_000 }).then(() => true, () => false)
  const buttonName = buttonShown ? await syncButton.getAttribute('aria-label').catch(() => null) : null
  const syncBox = buttonShown ? await syncButton.boundingBox().catch(() => null) : null
  const gearBox = await gear.boundingBox().catch(() => null)
  chk(
    buttonShown && buttonName === 'Sync now' && !!syncBox && !!gearBox && syncBox.x < gearBox.x && Math.abs(syncBox.y - gearBox.y) < 8,
    'the planner’s header has Sync now beside its settings, as frame 14:36 draws its circular arrows beside the ⚙',
    `shown ${buttonShown}, named ${JSON.stringify(buttonName)}; at ${JSON.stringify(syncBox)} against the gear at ${JSON.stringify(gearBox)}`,
  )

  // ══ 2. WHAT THE CALENDAR GAINED ═══════════════════════════════════════════
  console.log('\n▶ an event added to the member’s calendar after the planner drew the week')
  const drawn = (id) => page.locator(`[data-testid="planner-day-column"][data-day="${day}"] [data-testid="planner-calendar-event"][data-event-id="${id}"]`)
  const afternoonEvent = (await named(TOKENS.member, 'Afternoon review'))[0]
  const weekDrawn = await waitUntil(async () => (await drawn(afternoonEvent?.id ?? 'none').count()) > 0, { timeoutMs: 20_000 })
  const addedRes = await google(TOKENS.member, '', {
    method: 'POST',
    body: JSON.stringify({ summary: titled('Dentist'), start: { dateTime: at(11).toISOString() }, end: { dateTime: at(11, 30).toISOString() } }),
  })
  const dentist = addedRes.ok ? await addedRes.json() : null
  const beforePress = await drawn(dentist?.id ?? 'none').count()

  // Before the press: the morning task's event deleted in the member's calendar and in the colleague's, and the
  // afternoon task's renamed in the member's.
  const morningMine = (await named(TOKENS.member, 'Morning review'))[0]
  const morningTheirs = (await named(TOKENS.colleague, 'Morning review'))[0]
  const deletedMine = await google(TOKENS.member, `/${encodeURIComponent(morningMine?.id ?? 'none')}`, { method: 'DELETE' })
  const deletedTheirs = await google(TOKENS.colleague, `/${encodeURIComponent(morningTheirs?.id ?? 'none')}`, { method: 'DELETE' })
  const renamedThere = await google(TOKENS.member, `/${encodeURIComponent(afternoonEvent?.id ?? 'none')}`, {
    method: 'PATCH',
    body: JSON.stringify({ summary: 'Renamed in the calendar' }),
  })
  await syncButton.click({ timeout: 8000 }).catch(() => {})
  const dentistDrawn = await waitUntil(async () => (await drawn(dentist?.id ?? 'none').count()) > 0, { timeoutMs: 20_000 })
  chk(
    weekDrawn && !!dentist?.id && beforePress === 0 && dentistDrawn,
    'an event added to the member’s calendar after the planner drew the week is drawn once Sync now is pressed',
    `the week drawn ${weekDrawn}; the event added ${addedRes.status} ${JSON.stringify(dentist?.id ?? null)}; drawn before the press ${beforePress}, after it ${dentistDrawn}`,
  )

  // ══ 3. WHAT THE CALENDAR LOST OR CHANGED ═════════════════════════════════
  const morningBack = await shows(TOKENS.member, 'Morning review')
  const afternoonBack = await waitUntil(async () => {
    const e = (await eventsOf(TOKENS.member)).find((x) => x.id === afternoonEvent?.id)
    return e?.title === titled('Afternoon review')
  }, { timeoutMs: 20_000 })
  chk(
    deletedMine.status === 204 && renamedThere.ok && morningBack && afternoonBack,
    'Sync now writes a synced task’s event again where it was deleted from the member’s calendar, and puts back as the task says one the calendar changed',
    `deleted ${deletedMine.status}, renamed ${renamedThere.status}; the morning task written again ${morningBack}; the afternoon task’s title put back ${afternoonBack}`,
  )

  // ══ 4. WHAT WAS NEVER PUSHED ══════════════════════════════════════════════
  const importedIn = await shows(TOKENS.member, 'Imported review')
  chk(
    importedIn,
    'and it writes a task the sync holds that was never pushed — made by an import, not through the product',
    `the imported task (${imported.id}) in the member’s calendar: ${importedIn}`,
  )

  // ══ 5. ONLY THE PRESSER'S CALENDARS ═══════════════════════════════════════
  console.log('\n▶ the colleague’s calendar, after the member’s press; then the colleague’s own')
  const theirsAfterMember = (await named(TOKENS.colleague, 'Morning review')).length
  const theirImportedAfterMember = (await named(TOKENS.colleague, 'Imported review')).length
  const theirPress = await colleague.as(`/workspaces/${WS}/calendar-sync/sync-now`, { method: 'POST' })
  const theirsBack = (await named(TOKENS.colleague, 'Morning review')).length
  const theirImported = (await named(TOKENS.colleague, 'Imported review')).length
  chk(
    deletedTheirs.status === 204 && theirsAfterMember === 0 && theirImportedAfterMember === 0
      && theirPress.status === 201 && theirPress.data?.tasks === 3 && theirPress.data?.failed === 0
      && theirsBack === 1 && theirImported === 1,
    'Sync now writes only the presser’s calendars: the colleague’s deleted event stays deleted after the member’s press, and their own press writes it again with the task never pushed, answering how many tasks it went through',
    `deleted ${deletedTheirs.status}; after the member’s press: the morning event ${theirsAfterMember}, the imported ${theirImportedAfterMember}; their press ${said(theirPress)} ${JSON.stringify(theirPress.data ?? null)}; then ${theirsBack} and ${theirImported}`,
  )
  void MORNING
  void AFTERNOON
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  if (WS && A) {
    const gone = await A(`/workspaces/${WS}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${WS} answered ${gone.status || 'nothing'}`)
  }
  for (const token of Object.values(TOKENS)) await forgetCalendar(CAL, token).catch(() => {})
  // Only now: the calls above go through this proxy, and a closed one refuses them.
  stack.close()
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}

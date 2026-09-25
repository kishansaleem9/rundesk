/**
 * "CONNECT CALENDAR" LEADS TO WHERE A CALENDAR IS CONNECTED, AND IS OFFERED
 * TO WHOEVER HAS NONE.
 *
 * NOT A FRAME ROW: `found-24-sep/meetings-connect-calendar-goes-to-settings`.
 * The Meetings page's empty "Upcoming" offered "Connect Calendar" and opened
 * Settings → Integrations, which holds webhooks, Slack, the importer and the
 * data export and connects no calendar; a member, whom settings does not let
 * in, was sent back to the start. Calendars connect on the planner's Accounts
 * page (§V2-14), a page of its settings dialog, which had no address.
 *
 * ClickUp (help centre, search snippets): the AI Notetaker needs the Planner
 * connected to Google or Outlook, and a calendar connects from the Planner's
 * calendar settings. Video 1's row: the Connect Calendar prompt shows "when no
 * calendar is connected". The empty state's sentence promised that connecting
 * one would bring the meetings here, and nothing reads a calendar into
 * "Upcoming" (`found-25-sep/connected-calendars-read-by-nothing`).
 *
 * The dialog's page is an address now (`/calendar?settings=accounts`), and the
 * link goes there. Read for the admin and for a member, after a reload, and
 * with a calendar connected.
 *
 * Found beside it: the Accounts page's own "+ Add account" was a link to the
 * same Settings tab, so the way to a calendar stopped one page later. It
 * starts the connect now, the planner onboarding's own flow; the server here
 * has no calendar keys, so the twin is a server routed to say it has them.
 *
 *   node test/e2e/meetings-connect-calendar.mjs --api 3021 --dist /tmp/claude-0/dist-1
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 5

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
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

const stamp = Date.now()
const TAG = `mcc${stamp}`
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, data}`. Every call site reads `status`. */
const apiAs = (token) => async (route, init = {}) => {
  const headers = { authorization: `Bearer ${token}` }
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, { ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined }).catch(() => null)
  if (!res) return { status: 0, data: null }
  return { status: res.status, data: (await res.json().catch(() => null))?.data }
}

let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — a connected calendar is planted by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${made.status}`)
  WS = made.data.id
  const email = `${TAG}-member@rundesk.invalid`
  const password = 'Meeting@12345!'
  await signUpApi(API, { fullName: 'Meeting member', email, password, organizationName: `Meeting ${stamp}`, organizationSlug: `meeting-${stamp}` })
  const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'member' } })
  if (added.status >= 300) throw new Error(`could not add the member: ${added.status}`)
  const [memberRow] = await sql`select id from users where email = ${email}`
  if (!memberRow) throw new Error('the member has no user row')

  browser = await (await resolveChromium()).launch(launchOptions())
  /** `routed`: a server that can connect both calendars, and a consent address somewhere harmless. */
  const signIn = async (who, { routed = false } = {}) => {
    // The service worker answers API reads itself, and a routed request never reaches it.
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, serviceWorkers: 'block' })
    const page = await ctx.newPage()
    page.asked = []
    page.on('request', (req) => { if (/\/calendar-sync\/connect\/[^/]+$/.test(new URL(req.url()).pathname)) page.asked.push(req.url()) })
    if (routed) {
      await page.route((u) => u.pathname.endsWith('/providers/status'), (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ provider: 'gcal', available: true }, { provider: 'outlook', available: true }], error: null }) }).catch(() => {}),
      )
      await page.route((u) => /\/calendar-sync\/connect\/[^/]+$/.test(u.pathname), (route) =>
        route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { authUrl: 'about:blank#oauth' }, error: null }) }).catch(() => {}),
      )
    }
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', who.email)
    await page.fill('input[type=password]', who.password)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
    return page
  }
  /** The Meetings page's "Upcoming", once it has drawn: its words and whether it offers Connect Calendar. */
  const upcoming = async (page) => {
    await page.goto(`${B}/app/${WS}/meetings`, { waitUntil: 'domcontentloaded' })
    const box = page.getByTestId('meetings-upcoming')
    await box.getByText(/Nothing scheduled/i).waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
    // What the section offers is decided by a second answer (the person's calendars).
    await page.waitForTimeout(2500)
    const text = ((await box.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim()
    const offers = (await box.getByRole('link', { name: /Connect Calendar/i }).count().catch(() => 0)) > 0
    return { text, offers }
  }
  /** Where "Connect Calendar" leads, and whether the Accounts page is open there. */
  const follow = async (page) => {
    await upcoming(page)
    await page.getByTestId('meetings-upcoming').getByRole('link', { name: /Connect Calendar/i }).click({ timeout: 8000 }).catch(() => {})
    await page.getByTestId('planner-settings-accounts').waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
    const url = new URL(page.url())
    const accounts = await page.getByTestId('planner-settings-accounts').isVisible().catch(() => false)
    return { path: url.pathname, search: url.search, accounts }
  }

  // ══ 1. THE ADMIN ═════════════════════════════════════════════════════════
  console.log('\n▶ the admin follows "Connect Calendar" from Meetings')
  const aPage = await signIn(ADMIN)
  const aLand = await follow(aPage)
  chk(
    aLand.path.endsWith('/calendar') && aLand.accounts,
    '"Connect Calendar" opens the planner’s Accounts page, where a calendar is connected — not Settings → Integrations',
    `landed on ${aLand.path}${aLand.search}; the Accounts page ${aLand.accounts ? 'open' : 'not open'}`,
  )

  // ══ 2. A MEMBER ══════════════════════════════════════════════════════════
  console.log('\n▶ a member follows it')
  const mPage = await signIn({ email, password })
  const mLand = await follow(mPage)
  chk(
    mLand.path.endsWith('/calendar') && mLand.accounts,
    'a member is taken there too — Settings sent them back to the start',
    `landed on ${mLand.path}${mLand.search}; the Accounts page ${mLand.accounts ? 'open' : 'not open'}`,
  )

  // ══ 3. AN ADDRESS ════════════════════════════════════════════════════════
  console.log('\n▶ the Accounts page, by its address, after a reload')
  await mPage.goto(`${B}/app/${WS}/calendar?settings=accounts`, { waitUntil: 'domcontentloaded' })
  const opened = await mPage.getByTestId('planner-settings-accounts').waitFor({ state: 'visible', timeout: 20_000 }).then(() => true).catch(() => false)
  await mPage.keyboard.press('Escape').catch(() => {})
  // The dialog animates out: read it once it has gone, or once it has had the time to.
  await mPage.getByTestId('planner-settings-dialog').waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {})
  await mPage.waitForURL((u) => !new URL(u).searchParams.has('settings'), { timeout: 8000 }).catch(() => {})
  const closedUrl = new URL(mPage.url())
  const dialogGone = !(await mPage.getByTestId('planner-settings-dialog').isVisible().catch(() => false))
  await mPage.goto(`${B}/app/${WS}/calendar?settings=nonsense`, { waitUntil: 'domcontentloaded' })
  const plannerDrawn = await mPage.getByTestId('planner-page').waitFor({ state: 'visible', timeout: 20_000 }).then(() => true).catch(() => false)
  await mPage.waitForTimeout(2000)
  const bogusOpened = await mPage.getByTestId('planner-settings-dialog').isVisible().catch(() => false)
  chk(
    opened && dialogGone && closedUrl.searchParams.get('settings') === null && plannerDrawn && !bogusOpened,
    'the planner’s Accounts page has an address: it opens from it, closing it clears the address, and an address naming no page opens nothing',
    `opened ${opened}; closed ${dialogGone}, the address after closing ${closedUrl.pathname}${closedUrl.search}; ` +
      `"settings=nonsense": the planner ${plannerDrawn ? 'drawn' : 'not drawn'}, a dialog ${bogusOpened ? 'opened' : 'not opened'}`,
  )

  // ══ 4. WHAT THE EMPTY "UPCOMING" SAYS ════════════════════════════════════
  console.log('\n▶ the member\'s empty "Upcoming", without a calendar and with one')
  const without = await upcoming(mPage)
  await sql`
    insert into user_calendar_accounts
      (user_id, workspace_id, provider, external_account_id, external_account_email,
       access_token, refresh_token, is_default, counts_as_busy)
    values (${memberRow.id}, ${WS}, 'gcal', ${`${TAG}-member`}, ${`${TAG}@example.com`},
            ${'ACCESS-' + TAG}, ${'REFRESH-' + TAG}, true, true)
  `
  const withOne = await upcoming(mPage)
  const promises = (text) => /show up here/i.test(text)
  chk(
    without.offers && /Nothing scheduled/i.test(without.text) && !promises(without.text) &&
      !withOne.offers && /Nothing scheduled/i.test(withOne.text),
    'the empty "Upcoming" promises nothing it does not do: with no calendar it offers Connect Calendar without saying the meetings will then show up here, and with one connected it does not ask for one',
    `without a calendar: ${without.offers ? 'offered' : 'not offered'}, "${without.text}"; ` +
      `with one: ${withOne.offers ? 'offered' : 'not offered'}, "${withOne.text}"`,
  )

  // ══ 5. "ADD ACCOUNT" CONNECTS ONE ════════════════════════════════════════
  console.log('\n▶ the Accounts page\'s "Add account", on this server and on one that can connect')
  /** The Accounts page by its address, and its Google Calendar button, pressed. */
  const addGoogle = async (page) => {
    await page.goto(`${B}/app/${WS}/calendar?settings=accounts`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('planner-settings-accounts').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
    const button = page.getByTestId('planner-account-add-gcal')
    await button.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(1500)
    const enabled = await button.isEnabled().catch(() => null)
    const why = ((await page.getByTestId('planner-account-add-not-configured').innerText().catch(() => '')) ?? '').trim()
    page.asked.length = 0
    await button.click({ timeout: 3000, force: true }).catch(() => {})
    await page.waitForTimeout(2000)
    return { enabled, why, started: page.asked.length > 0, at: page.url() }
  }
  // This server has no calendar keys: each is greyed out, says why, and starts nothing.
  const here = await addGoogle(aPage)
  const twin = await addGoogle(await signIn(ADMIN, { routed: true }))
  chk(
    here.enabled === false && here.why.length > 0 && !here.started && twin.enabled === true && twin.started && /about:blank/.test(twin.at),
    '"Add account" starts connecting a calendar where the server can connect it, and where it cannot, says so and starts nothing — it was a link to Settings → Integrations',
    `this server: enabled ${here.enabled}, "${here.why}", started ${here.started}; ` +
      `one that can connect: enabled ${twin.enabled}, started ${twin.started}, now at ${twin.at}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  stack.close()
  if (sql) await sql`delete from user_calendar_accounts where external_account_id like ${TAG + '%'}`.catch(() => {})
  if (WS && A) await A(`/workspaces/${WS}`, { method: 'DELETE' }).catch(() => {})
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}

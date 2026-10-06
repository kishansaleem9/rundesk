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
 * starts the connect now, the planner onboarding's own flow. Both servers are
 * routed: one says it has no calendar keys and the twin says it has them (the
 * lanes' own keys are not real, `lane_oauth_env`).
 *
 *   node test/e2e/meetings-connect-calendar.mjs --api 3021 --dist /tmp/claude-0/dist-1
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'
import { waitUntil } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 6

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
/* NEVER THROWS — `{status, data}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)

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
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${made.status}`)
  WS = made.data.id
  const email = `${TAG}-member@rundesk.invalid`
  const password = 'Meeting@12345!'
  await signUpApi(API, { fullName: 'Meeting member', email, password, organizationName: `Meeting ${stamp}`, organizationSlug: `meeting-${stamp}` })
  const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'member' } })
  if (!added.ok) throw new Error(`could not add the member: ${added.status}`)
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
    // Both answers are routed: the lanes hold calendar keys that are not real
    // (`lane_oauth_env`), so the server's own status says it can connect.
    // Whether the server's status and its start agree is `oauth-start-readiness`'s.
    const unset = (keys) => ({ available: false, reason: `Missing backend configuration: ${keys}` })
    await page.route((u) => u.pathname.endsWith('/providers/status'), (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: routed
            ? [{ provider: 'gcal', available: true }, { provider: 'outlook', available: true }]
            : [{ provider: 'gcal', ...unset('GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET') }, { provider: 'outlook', ...unset('MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET') }],
          error: null,
        }),
      }).catch(() => {}),
    )
    if (routed) {
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
    // What the section says is decided by two answers, the person's meetings
    // and their calendars, and it says when both are in. It waited 2.5 s for
    // the calendars, which under load was not enough, and with a calendar
    // connected read "not offered" before anything had answered
    // (`found-6-oct/meetings-upcoming-read-after-a-fixed-wait`).
    await waitUntil(async () => (await box.getAttribute('data-state').catch(() => null)) === 'known', { timeoutMs: 20_000 })
    const text = ((await box.filter({ visible: true }).innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim()
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
  /*
   * BEFORE ITS ANSWERS ARE IN, THE SECTION SAYS NOTHING OF THEM. The member's
   * upcoming meetings and their calendars are each held back by a route, so
   * the section is read while it waits rather than raced: first with neither
   * answered — it said "Nothing scheduled" before their meetings had answered
   * (`found-6-oct/upcoming-says-nothing-scheduled-before-it-knows`) — then
   * with the meetings in and the calendars not, when it may say nothing is
   * scheduled but may not yet offer a calendar.
   */
  const hold = (pattern) => {
    let release = () => {}
    const until = new Promise((resolve) => { release = resolve })
    const held = { count: 0, release, pattern }
    held.route = async (route) => {
      held.count += 1
      await until
      await route.continue().catch(() => {})
    }
    return held
  }
  const heldMeetings = hold((u) => /\/meetings\/upcoming$/.test(u.pathname))
  const heldCalendars = hold((u) => /\/calendar-sync\/accounts$/.test(u.pathname))
  await mPage.route(heldMeetings.pattern, heldMeetings.route)
  await mPage.route(heldCalendars.pattern, heldCalendars.route)
  await mPage.goto(`${B}/app/${WS}/meetings`, { waitUntil: 'domcontentloaded' })
  const heldBox = mPage.getByTestId('meetings-upcoming')
  await heldBox.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
  await waitUntil(async () => heldMeetings.count > 0 && heldCalendars.count > 0, { timeoutMs: 15_000 })
  const readHeld = async () => ({
    state: await heldBox.getAttribute('data-state').catch(() => null),
    text: ((await heldBox.filter({ visible: true }).innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim(),
    offers: (await heldBox.getByRole('link', { name: /Connect Calendar/i }).count().catch(() => 0)) > 0,
  })
  const neither = await readHeld()
  heldMeetings.release()
  await heldBox.getByText(/Nothing scheduled/i).waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  const meetingsOnly = await readHeld()
  heldCalendars.release()
  await mPage.unroute(heldMeetings.pattern)
  await mPage.unroute(heldCalendars.pattern)
  chk(
    heldMeetings.count > 0 && heldCalendars.count > 0 &&
      neither.state === 'checking' && !/Nothing scheduled/i.test(neither.text) && !neither.offers &&
      meetingsOnly.state === 'checking' && /Nothing scheduled/i.test(meetingsOnly.text) && !meetingsOnly.offers,
    'before the member’s meetings have answered, "Upcoming" does not say nothing is scheduled, and before their calendars have, it does not offer Connect Calendar — it says it is checking',
    `held ${heldMeetings.count} meetings and ${heldCalendars.count} calendars request(s); with neither answered it said ${JSON.stringify(neither.state)}, ` +
      `"${neither.text}", Connect Calendar ${neither.offers ? 'offered' : 'not offered'}; with the meetings in, ${JSON.stringify(meetingsOnly.state)}, ` +
      `"${meetingsOnly.text}", Connect Calendar ${meetingsOnly.offers ? 'offered' : 'not offered'}`,
  )
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
    const why = ((await page.getByTestId('planner-account-add-not-configured').filter({ visible: true }).innerText().catch(() => '')) ?? '').trim()
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
  if (sql) await sql`delete from user_calendar_accounts where external_account_id like ${TAG + '%'}`.catch(() => {})
  if (WS && A) {
    const gone = await A(`/workspaces/${WS}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${WS} answered ${gone.status || 'nothing'}`)
  }
  // Only now: the DELETE above goes through this proxy, and a closed one refuses it.
  stack.close()
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}

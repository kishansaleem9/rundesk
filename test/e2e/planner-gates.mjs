/**
 * THE PLANNER ASKS FOR WHAT ITS SETTINGS SHOW, AND OFFERS ONLY THE CALENDARS IT CAN CONNECT.
 *
 * NOT FRAME ROWS. Two ledger rows:
 *
 * `ledger-rows/defect-calendar-toggles-before-settings`: the Holidays and Time
 * off calendars read ON until the planner's settings arrived, so a person who
 * had hidden both had them asked for, and drawn, on every load.
 *
 * `ledger-rows/defect-planner-connect-empty-consent`: the onboarding's Connect
 * Google Calendar / Outlook posted `oauth/start` whether or not this server
 * could connect them; without a client id the "consent" address named no
 * application.
 *
 * The settings are the person's own (PATCHed here). The provider status is
 * routed for both twins — unavailable for the first, available for the second —
 * because the lanes hold calendar keys that are not real (`lane_oauth_env`,
 * `oauth-start-answers-for-no-application`), so the server's own answer is
 * "available" there. Whether the server's status and its start agree is
 * `oauth-start-readiness`'s to measure; this suite measures what the page does
 * with each answer.
 *
 *   node test/e2e/planner-gates.mjs --api 3021
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'
import { openDb } from './lib/db.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 3

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

const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
const stamp = Date.now()
const TAG = `pgt-${stamp}`
let browser = null
let sql = null
let WS = null
let token = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the holiday is planted by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  token = auth.accessToken
  const call = async (route, init = {}) => {
    const res = await fetch(`${API}${route}`, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: init.body ? JSON.stringify(init.body) : undefined })
    return { status: res.status, data: (await res.json().catch(() => null))?.data }
  }
  const made = await call('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${made.status}`)
  WS = made.data.id
  await sql`insert into workspace_holidays (workspace_id, day, name) values (${WS}, current_date, ${`${TAG} holiday`})`.catch(() => {})
  const hide = await call(`/planner/${WS}/settings`, { method: 'PATCH', body: { hiddenCalendarIds: ['workspace:holidays', 'workspace:timeOff'], darkenNonWorkingHours: false } })
  if (hide.status >= 300) throw new Error(`could not hide the calendars: ${hide.status}`)

  browser = await chromium.launch(launchOptions())
  const open = async ({ providersAvailable } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
    const page = await ctx.newPage()
    const asked = []
    page.on('request', (req) => {
      const u = req.url()
      if (/\/work-schedule|\/time-off/.test(u)) asked.push(new URL(u).pathname.split('/').pop())
      // The person's own grant (`found-24-sep/personal-calendar-connect-needs-integrations-manage`).
      if (/\/calendar-sync\/connect\//.test(u)) asked.push('oauth/start')
    })
    const unset = { available: false, reason: 'Missing backend configuration: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET' }
    await page.route((u) => u.pathname.endsWith('/providers/status'), (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: providersAvailable
            ? [{ provider: 'gcal', available: true }, { provider: 'outlook', available: true }]
            : [{ provider: 'gcal', ...unset }, { provider: 'outlook', ...unset, reason: 'Missing backend configuration: MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET' }],
          error: null,
        }),
      }).catch(() => {}),
    )
    if (providersAvailable) {
      // Somewhere harmless to be sent: the page follows the consent address.
      await page.route((u) => /\/calendar-sync\/connect\/[^/]+$/.test(u.pathname), (route) =>
        route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { authUrl: 'about:blank#oauth' }, error: null }) }).catch(() => {}),
      )
    }
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', ADMIN.email)
    await page.fill('input[type=password]', ADMIN.password)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
    asked.length = 0
    await page.goto(`${B}/app/${WS}/calendar`, { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid="planner-page"]', { timeout: 20_000 }).catch(() => {})
    return { page, asked }
  }

  // ══ 1. HIDDEN CALENDARS, ON A FRESH LOAD ═════════════════════════════════
  console.log('\n▶ the planner, with Holidays and Time off hidden')
  const { page, asked } = await open()
  await page.waitForTimeout(1500)
  const hiddenAsked = [...asked]
  const hiddenChips = await page.locator('[data-testid="planner-holiday-chip"], [data-testid="planner-timeoff-chip"]').count()
  // The twin: the same person with both shown, so "asks for neither" is not a
  // planner that never asks.
  await call(`/planner/${WS}/settings`, { method: 'PATCH', body: { hiddenCalendarIds: [] } })
  asked.length = 0
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="planner-page"]', { timeout: 20_000 }).catch(() => {})
  const shownAsked = await waitUntil(async () => asked.includes('work-schedule'), { timeoutMs: 10_000 })
  const shownChip = await waitUntil(async () => (await page.locator('[data-testid="planner-holiday-chip"]').count()) > 0, { timeoutMs: 10_000 })
  chk(
    !hiddenAsked.includes('work-schedule') && !hiddenAsked.some((x) => x.startsWith('time-off')) && hiddenChips === 0 && shownAsked && shownChip,
    'with both calendars hidden, a fresh load asks for neither and draws neither — shown, the holiday is asked for and drawn',
    `hidden: asked for ${JSON.stringify(hiddenAsked)}, chips ${hiddenChips}; shown: asked ${shownAsked}, the holiday drawn ${shownChip}`,
  )

  // ══ 2. A CALENDAR THIS SERVER CANNOT CONNECT ═════════════════════════════
  console.log('\n▶ the onboarding’s Connect buttons, on a server with no calendar keys')
  const offered = await page.getByTestId('planner-onboarding').count()
  const gcal = page.getByTestId('planner-onboarding-connect-gcal')
  const gcalDisabled = await gcal.isDisabled({ timeout: 8000 }).catch(() => null)
  const note = ((await page.getByTestId('planner-onboarding-not-configured').innerText({ timeout: 5000 }).catch(() => '')) ?? '').trim()
  await gcal.click({ timeout: 3000, force: true }).catch(() => {})
  await page.waitForTimeout(1000)
  chk(
    offered === 1 && gcalDisabled === true && note.length > 0 && !asked.includes('oauth/start'),
    'a calendar the server cannot connect is not offered as a button that works, and the page says why',
    `onboarding shown ${offered}; Google disabled: ${gcalDisabled}; the note ${JSON.stringify(note)}; OAuth started: ${asked.includes('oauth/start')}`,
  )

  // ══ 3. A CALENDAR IT CAN ═════════════════════════════════════════════════
  console.log('\n▶ the same buttons, where the server can connect them')
  const twin = await open({ providersAvailable: true })
  const enabled = await twin.page.getByTestId('planner-onboarding-connect-gcal').isEnabled({ timeout: 8000 }).catch(() => false)
  await twin.page.getByTestId('planner-onboarding-connect-gcal').click({ timeout: 5000 }).catch(() => {})
  const started = await waitUntil(async () => twin.asked.includes('oauth/start'), { timeoutMs: 8000 })
  chk(
    enabled && started,
    'where the server can connect it, Google Calendar is offered and starts the connection',
    `enabled: ${enabled}; OAuth started: ${started}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  if (WS && token) {
    const gone = await fetch(`${API}/workspaces/${WS}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } }).catch(() => null)
    if (![200, 204, 404].includes(gone?.status)) console.log(`  cleanup left behind: DELETE /workspaces/${WS} answered ${gone?.status ?? 'nothing'}`)
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

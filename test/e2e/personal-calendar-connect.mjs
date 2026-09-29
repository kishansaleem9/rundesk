/**
 * A PERSON CONNECTS THEIR OWN CALENDAR.
 *
 * NOT A FRAME ROW: `found-24-sep/personal-calendar-connect-needs-integrations-manage`.
 * The planner's connect (the onboarding panel and the Accounts page) posted the
 * WORKSPACE connection's `oauth/start`, which asks `integrations.manage` — an
 * admin's key unless a custom role grants it — so a member was offered Connect
 * and refused. The callback then wrote the grant twice: as the person's own
 * account, and as the workspace's calendar connection, which the task push and
 * pull run on.
 *
 * ClickUp (help centre, search snippets): the Google Calendar and Outlook
 * integrations are personal and private — "No one else in your Workspace can
 * access your Google Calendar through this integration" — and guests and
 * limited members can use them. So a calendar connected from the planner is
 * asked of the person, and is theirs alone: the grant is marked personal in
 * its signed state, and its callback writes their account and nothing of the
 * workspace's. The workspace's own connection stays the admin's, in the App
 * Center.
 *
 * No calendar keys here, and no Google: a start answers a consent address all
 * the same (its state is read, not followed), and a grant's code exchange is
 * refused by the provider, which is the failure path, read end to end.
 *
 *   node test/e2e/personal-calendar-connect.mjs --api 3021 --dist /tmp/claude-0/dist-1
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
const TAG = `pcc${stamp}`
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, data}`. Every call site reads `status`. A POST
 * always carries a body: an empty one under a JSON content type is a 400. */
const apiAs = (token) => async (route, init = {}) => {
  const headers = { authorization: `Bearer ${token}` }
  const body = init.body ?? (init.method === 'POST' ? {} : undefined)
  if (body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, { ...init, headers, body: body ? JSON.stringify(body) : undefined }).catch(() => null)
  if (!res) return { status: 0, data: null }
  return { status: res.status, data: (await res.json().catch(() => null))?.data }
}
/** What a consent address's signed state says — read, never followed. */
const stateOf = (authUrl) => {
  try {
    const state = new URL(authUrl).searchParams.get('state') ?? ''
    return { raw: state, ...JSON.parse(Buffer.from(state.split('.')[0], 'base64url').toString('utf8')) }
  } catch {
    return null
  }
}
const PERSONAL = (ws) => `/workspaces/${ws}/calendar-sync/connect/gcal`
const WORKSPACE = (ws) => `/workspaces/${ws}/integrations/connections/gcal/oauth/start`

let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the workspace connection is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${made.status}`)
  WS = made.data.id
  const person = async (who, role) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const password = 'Calendar@12345!'
    const signed = await signUpApi(API, { fullName: `Calendar ${who}`, email, password, organizationName: `Calendar ${who} ${stamp}`, organizationSlug: `calendar-${who}-${stamp}` })
    if (role) {
      const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
      if (added.status >= 300) throw new Error(`could not add the ${who}: ${added.status}`)
    }
    const [row] = await sql`select id from users where email = ${email}`
    return { email, password, id: row?.id, call: apiAs(signed.accessToken) }
  }
  const member = await person('member', 'member')
  const guest = await person('guest', 'guest')
  const outsider = await person('outsider', null)

  // ══ 1. A MEMBER ══════════════════════════════════════════════════════════
  console.log('\n▶ a member asks to connect their own Google Calendar')
  const mine = await member.call(PERSONAL(WS), { method: 'POST' })
  const mineState = stateOf(mine.data?.authUrl)
  chk(
    mine.status < 300 && /accounts\.google\.com/.test(mine.data?.authUrl ?? '') &&
      mineState?.userId === member.id && mineState?.workspaceId === WS && mineState?.personal === true,
    'a member is answered with Google’s consent address, for their own calendar — its signed state names them, this workspace, and a personal grant',
    `${mine.status}; the state ${JSON.stringify(mineState && { ...mineState, raw: undefined })}`,
  )

  // ══ 2. A GUEST ═══════════════════════════════════════════════════════════
  console.log('\n▶ a guest asks the same')
  const theirs = await guest.call(PERSONAL(WS), { method: 'POST' })
  const theirState = stateOf(theirs.data?.authUrl)
  chk(
    theirs.status < 300 && theirState?.userId === guest.id && theirState?.personal === true,
    'a guest may connect their own calendar too — ClickUp gives guests and limited members the calendar integrations',
    `${theirs.status}; the state ${JSON.stringify(theirState && { ...theirState, raw: undefined })}`,
  )

  // ══ 3. THE WORKSPACE'S CONNECTION ════════════════════════════════════════
  console.log('\n▶ the workspace’s own calendar connection, asked by the member and by the admin')
  const memberWs = await member.call(WORKSPACE(WS), { method: 'POST' })
  const adminWs = await A(WORKSPACE(WS), { method: 'POST' })
  const adminWsState = stateOf(adminWs.data?.authUrl)
  chk(
    memberWs.status === 403 && adminWs.status < 300 && adminWsState?.personal === undefined,
    'the workspace’s own calendar connection is still the admin’s: the member is refused it, and the admin’s grant is not a personal one',
    `the member ${memberWs.status}; the admin ${adminWs.status}, personal ${adminWsState?.personal}`,
  )

  // ══ 4. SOMEBODY ELSE'S WORKSPACE ═════════════════════════════════════════
  console.log('\n▶ somebody outside the workspace')
  const outside = await outsider.call(PERSONAL(WS), { method: 'POST' })
  // Refused as the member guard refuses anybody else: 403, or 404 where the
  // workspace is not theirs to know of. Either way, no grant is handed out.
  chk(
    (outside.status === 403 || outside.status === 404) && !outside.data?.authUrl && mine.status < 300,
    'somebody outside the workspace cannot start a grant in it — its member can',
    `outside ${outside.status}${outside.data?.authUrl ? ', handed a consent address' : ''}; the member ${mine.status}`,
  )

  // ══ 5. A GRANT THAT FAILS ════════════════════════════════════════════════
  console.log('\n▶ a grant whose code the provider refuses, personal and the workspace’s')
  const callback = async (state) => {
    const res = await fetch(`${API}/integrations/oauth/gcal/callback?code=${TAG}&state=${encodeURIComponent(state ?? '')}`, { redirect: 'manual' }).catch(() => null)
    const at = res?.headers.get('location') ?? ''
    try { return { status: res?.status ?? 0, url: new URL(at) } } catch { return { status: res?.status ?? 0, url: null } }
  }
  const personalFail = await callback(mineState?.raw)
  const cardAfterPersonal = await sql`select last_error from workspace_integration_connections where workspace_id = ${WS} and provider = 'gcal'`
  const workspaceFail = await callback(adminWsState?.raw)
  const cardAfterWorkspace = await sql`select last_error from workspace_integration_connections where workspace_id = ${WS} and provider = 'gcal'`
  chk(
    personalFail.status === 302 && personalFail.url?.pathname === `/app/${WS}/calendar` &&
      personalFail.url?.searchParams.get('settings') === 'accounts' && (personalFail.url?.searchParams.get('calendarError') ?? '').length > 0 &&
      cardAfterPersonal.length === 0 &&
      workspaceFail.status === 302 && /\/integrations$/.test(workspaceFail.url?.pathname ?? '') && (cardAfterWorkspace[0]?.last_error ?? '').length > 0,
    'a personal grant that fails lands on the planner’s Accounts page saying why, and writes nothing onto the workspace’s calendar card — the admin’s lands on the App Center, on its card',
    `personal: ${personalFail.status} to ${personalFail.url?.pathname}${personalFail.url?.search}, the workspace card ${JSON.stringify(cardAfterPersonal)}; ` +
      `the workspace's: ${workspaceFail.status} to ${workspaceFail.url?.pathname}, the card ${JSON.stringify(cardAfterWorkspace)}`,
  )

  // ══ 6. IN THE BROWSER ════════════════════════════════════════════════════
  console.log('\n▶ the member’s "Add account", and the failure said on the Accounts page')
  browser = await (await resolveChromium()).launch(launchOptions())
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  // A server that can connect Google, and a consent page that is not Google's.
  await page.route((u) => u.pathname.endsWith('/providers/status'), (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ provider: 'gcal', available: true }, { provider: 'outlook', available: true }], error: null }) }).catch(() => {}),
  )
  await page.route((u) => u.hostname === 'accounts.google.com', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<title>consent</title>' }).catch(() => {}),
  )
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', member.email)
  await page.fill('input[type=password]', member.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
  await page.goto(`${B}/app/${WS}/calendar?settings=accounts`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('planner-account-add-gcal').click({ timeout: 20_000 }).catch(() => {})
  await page.waitForURL((u) => new URL(u).hostname === 'accounts.google.com', { timeout: 10_000 }).catch(() => {})
  const consent = stateOf(page.url())
  const consentHost = new URL(page.url()).hostname
  // The failure, as the callback sends a person back.
  const back = personalFail.url ? `${B}${personalFail.url.pathname}${personalFail.url.search}` : `${B}/app/${WS}/calendar?settings=accounts`
  await page.goto(back, { waitUntil: 'domcontentloaded' })
  const said = ((await page.getByTestId('planner-account-connect-error').filter({ visible: true }).innerText({ timeout: 20_000 }).catch(() => '')) ?? '').trim()
  // Closed, the page takes its reason with it: a reload does not say it again.
  await page.keyboard.press('Escape').catch(() => {})
  await page.getByTestId('planner-settings-dialog').waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {})
  await page.waitForURL((u) => !new URL(u).searchParams.has('calendarError'), { timeout: 8000 }).catch(() => {})
  const after = new URL(page.url())
  chk(
    consent?.userId === member.id && consent?.personal === true && said.length > 0 && /could not be connected/i.test(said) &&
      !after.searchParams.has('calendarError') && !after.searchParams.has('settings'),
    'the member’s "Add account" takes them to Google with their own grant, and one that failed is said on the Accounts page until it is closed',
    `the consent page's state ${JSON.stringify(consent && { ...consent, raw: undefined })} at ${consentHost}; ` +
      `the Accounts page says "${said}"; the address after closing it ${after.pathname}${after.search}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
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

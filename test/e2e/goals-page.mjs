/**
 * THE GOALS PAGE DRAWS WHAT THE API SENDS, AND OFFERS A GUEST NOTHING TO FAIL.
 *
 * NOT A FRAME ROW: `found-24-sep/goals-page-reads-fields-the-api-never-sends`.
 * The goals list drew each card's bar and percentage from `goal.progress`, a
 * field the API has never sent, so every card read 0% — a confident zero. And
 * a guest, whose goal list is empty and whose create is refused (403), was
 * offered "New goal" and "Create your first goal", which failed with nothing
 * said.
 *
 * Read from the screen: a goal planted at 30 of 60 reads 50% (a share of its
 * target, so neither the raw value nor a default); a guest's page offers no
 * create and says no goal is shared with them, beside a member's page, which
 * offers it; and a create that fails says so.
 *
 *   node test/e2e/goals-page.mjs --api 3021
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
const TAG = `gp-${stamp}`
let browser = null
let sql = null
let WS = null
let token = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the goal is planted by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  token = auth.accessToken
  const call = async (route, init = {}) => {
    const res = await fetch(`${API}${route}`, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: init.body ? JSON.stringify(init.body) : undefined })
    return { status: res.status, data: (await res.json().catch(() => null))?.data }
  }
  const adminId = (await call('/users/me')).data?.id
  const made = await call('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${made.status}`)
  WS = made.data.id
  const people = {}
  for (const [who, role] of [['member', 'member'], ['guest', 'guest']]) {
    const email = `${TAG}-${who}@rundesk.invalid`
    await signUpApi(API, { fullName: `Goals ${who}`, email, password: 'Member@12345!', organizationName: `Goals ${who} ${stamp}`, organizationSlug: `goals-${who}-${stamp}` })
    const added = await call(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (added.status >= 300) throw new Error(`could not add the ${who}: ${added.status}`)
    people[who] = { email, password: 'Member@12345!' }
  }
  await sql`insert into goals (workspace_id, title, owner_id, target_value, current_value) values (${WS}, ${`${TAG} thirty of sixty`}, ${adminId}, 60, 30)`

  browser = await chromium.launch(launchOptions())
  const signIn = async (email, password) => {
    // The service worker is blocked so a route can fail the create below.
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' })
    const page = await ctx.newPage()
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', email)
    await page.fill('input[type=password]', password)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
    await page.goto(`${B}/app/${WS}/goals`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    return page
  }

  // ══ 1. A GOAL'S PROGRESS ═════════════════════════════════════════════════
  console.log('\n▶ a goal at 30 of 60')
  const admin = await signIn(ADMIN.email, ADMIN.password)
  const card = admin.locator('a', { hasText: `${TAG} thirty of sixty` }).first()
  await card.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  const cardText = (await card.innerText().catch(() => '')).replace(/\s+/g, ' ')
  chk(
    /\b50%/.test(cardText),
    'a goal at 30 of 60 reads 50% on its card',
    `the card reads "${cardText.slice(0, 120)}"`,
  )

  // ══ 2. A GUEST ═══════════════════════════════════════════════════════════
  console.log('\n▶ a guest, and a member')
  const guest = await signIn(people.guest.email, people.guest.password)
  const member = await signIn(people.member.email, people.member.password)
  const offered = async (page) => {
    const buttons = await page.getByRole('button', { name: /New goal|Create your first goal/ }).count()
    return buttons > 0
  }
  const guestOffered = await offered(guest)
  const guestSays = await guest.getByText('No goals have been shared with you.').isVisible().catch(() => false)
  const memberOffered = await offered(member)
  chk(
    !guestOffered && guestSays && memberOffered,
    'a guest is offered no “New goal” and is told no goal is shared with them — a member is offered one',
    `the guest is offered a create: ${guestOffered}, told none is shared: ${guestSays}; the member is offered one: ${memberOffered}`,
  )

  // ══ 3. A CREATE THAT FAILS ═══════════════════════════════════════════════
  console.log('\n▶ a goal the server will not make')
  const GOALS = (u) => u.pathname.endsWith(`/workspaces/${WS}/goals`)
  let refused = false
  const refuse = (route) => {
    if (route.request().method() !== 'POST') return route.continue().catch(() => {})
    refused = true
    return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'failed by the suite' }) }).catch(() => {})
  }
  await member.route(GOALS, refuse)
  await member.getByRole('button', { name: /New goal|Create your first goal/ }).first().click({ timeout: 10_000 }).catch(() => {})
  await member.getByPlaceholder(/goal/i).first().fill(`${TAG} refused`, { timeout: 10_000 }).catch(() => {})
  await member.getByRole('button', { name: /^Create$/ }).click({ timeout: 10_000 }).catch(() => {})
  const toast = member.locator('[data-sonner-toast]')
  const toasted = await toast.first().waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false)
  const told = toasted ? ((await toast.first().innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim() : ''
  await member.unroute(GOALS, refuse).catch(() => {})
  chk(
    refused && told.includes('The goal could not be created.'),
    'a goal the server will not make says so',
    `the create was ${refused ? 'refused' : 'NEVER SENT'}; the page said ${JSON.stringify(told)}`,
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

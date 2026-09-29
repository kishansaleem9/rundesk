/**
 * A MEMBER SETS THEIR OWN WEEKLY CAPACITY; SOMEBODY ELSE'S ASKS THE PROFILE
 * PERMISSION.
 *
 * NOT A FRAME ROW: `found-28-sep/own-capacity-not-self-service`, found by the
 * people-and-calendar research. `PATCH members/:userId/capacity` asked
 * `members.profile.manage` even of somebody setting their own, and no page
 * offered it to anybody: the Workload page drew each person's capacity as a
 * figure.
 *
 * ClickUp ("Set capacity limits in Workload view"): "Workspace members can set
 * capacity for themselves, while Admins, Workspace owners, and managers can
 * set capacity for themselves and others", by clicking the capacity beside a
 * name. A guest is not a workspace member there.
 *
 *   node test/e2e/own-capacity.mjs --api 3027 --dist /tmp/claude-0/dist-7
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
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

/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`. */
const apiAs = (token) => async (route, init = {}) => {
  const headers = { authorization: `Bearer ${token}` }
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, { ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined }).catch(() => null)
  if (!res) return { status: 0, data: null, error: { message: 'no answer' } }
  const text = await res.text().catch(() => '')
  let json = null
  try { json = JSON.parse(text) } catch { /* no body */ }
  return { status: res.status, data: json?.data, error: json?.error }
}
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `ocp${stamp}`
const PASSWORD = 'OwnCapacity@12345!'
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the hours stored are read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const adminId = (await A('/users/me')).data?.id
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  // The Workload page is a view a workspace switches on.
  await A('/feature-flags/views.workload', { method: 'PUT', body: { enabled: true, scope: 'workspace', scopeId: WS, workspaceId: WS } })
  const person = async (key, role) => {
    const email = `${TAG}-${key}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `Capacity ${key}`, email, password: PASSWORD, organizationName: `Capacity ${key} ${stamp}`, organizationSlug: `capacity-${key}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (added.status >= 300) throw new Error(`could not add the ${key}: ${said(added)}`)
    return { email, id: signed.user?.id, as: apiAs(signed.accessToken) }
  }
  const member = await person('member', 'member')
  const other = await person('other', 'member')
  const manager = await person('manager', 'manager')
  const guest = await person('guest', 'guest')
  const hours = async (userId) => (await sql`select weekly_capacity_hours as h from workspace_members where workspace_id = ${WS} and user_id = ${userId}`)[0]?.h ?? null
  const capacity = (userId) => `/workspaces/${WS}/members/${userId}/capacity`

  // ══ 1. A MEMBER SETS THEIR OWN ═══════════════════════════════════════════
  console.log('\n▶ a plain member sets their own weekly capacity')
  const own = await member.as(capacity(member.id), { method: 'PATCH', body: { weeklyCapacityHours: 30 } })
  chk(
    own.status === 200 && (await hours(member.id)) === 30,
    'a plain member sets their own weekly capacity (200), and 30 hours is stored',
    `${said(own)}; stored ${await hours(member.id)}`,
  )

  // ══ 2. NOT SOMEBODY ELSE'S ═══════════════════════════════════════════════
  console.log('\n▶ the plain member tries a colleague’s')
  const before = await hours(other.id)
  const theirs = await member.as(capacity(other.id), { method: 'PATCH', body: { weeklyCapacityHours: 5 } })
  chk(
    theirs.status === 403 && /Set member profiles/.test(theirs.error?.message ?? '') && (await hours(other.id)) === before,
    'a plain member setting a colleague’s capacity is refused (403), told it takes the Set member profiles permission, and nothing changes',
    `${said(theirs)}; the colleague’s ${before} → ${await hours(other.id)}`,
  )

  // ══ 3. A MANAGER SETS A MEMBER'S, NOT AN ADMIN'S ═════════════════════════
  console.log('\n▶ the manager sets a member’s, and tries the admin’s')
  const byManager = await manager.as(capacity(other.id), { method: 'PATCH', body: { weeklyCapacityHours: 25 } })
  const adminBefore = await hours(adminId)
  const aboveThem = await manager.as(capacity(adminId), { method: 'PATCH', body: { weeklyCapacityHours: 1 } })
  chk(
    byManager.status === 200 && (await hours(other.id)) === 25 && aboveThem.status === 403 && (await hours(adminId)) === adminBefore,
    'a manager sets a plain member’s capacity (200) and is refused an admin’s (403), somebody above their own role',
    `member’s ${said(byManager)} → ${await hours(other.id)}; admin’s ${said(aboveThem)}`,
  )

  // ══ 4. A GUEST SETS NONE ═════════════════════════════════════════════════
  console.log('\n▶ a guest tries their own')
  const guestOwn = await guest.as(capacity(guest.id), { method: 'PATCH', body: { weeklyCapacityHours: 10 } })
  chk(
    guestOwn.status === 403 && /guest has no capacity/i.test(guestOwn.error?.message ?? ''),
    'a guest setting their own capacity is refused (403): “A guest has no capacity to set” — a guest is not in the Workload',
    said(guestOwn),
  )

  // ══ 5–6. THE WORKLOAD PAGE OFFERS IT ═════════════════════════════════════
  const chromium = await resolveChromium()
  browser = await chromium.launch(launchOptions())
  const workloadAs = async (who) => {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, serviceWorkers: 'block' })
    const page = await ctx.newPage()
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', who.email)
    await page.fill('input[type=password]', PASSWORD)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
    await page.goto(`${B}/app/${WS}/workload`, { waitUntil: 'domcontentloaded' })
    // The rows are drawn once the report answers: the reader's own name is among them.
    await waitUntil(() => page.getByText('Capacity member', { exact: true }).first().isVisible().catch(() => false), { timeoutMs: 20_000 })
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
    return page
  }

  console.log('\n▶ the plain member’s Workload page')
  const mp = await workloadAs(member)
  const mine = await mp.getByTestId(`workload-capacity-${member.id}`).count()
  const colleague = await mp.getByTestId(`workload-capacity-${other.id}`).count()
  await mp.getByTestId(`workload-capacity-${member.id}`).click({ timeout: 5000 }).catch(() => {})
  await mp.getByTestId('workload-capacity-input').fill('32', { timeout: 5000 }).catch(() => {})
  await mp.getByRole('button', { name: /^Save$/ }).click({ timeout: 5000 }).catch(() => {})
  const saved = await waitUntil(async () => (await hours(member.id)) === 32, { timeoutMs: 10_000 })
  chk(
    mine === 1 && colleague === 0 && saved,
    'the plain member’s Workload offers a capacity control on their own row and on nobody else’s, and setting 32 hours through it saves them',
    `own control ${mine}; a colleague’s ${colleague}; stored ${await hours(member.id)}`,
  )
  await mp.context().close().catch(() => {})

  console.log('\n▶ the manager’s Workload page')
  const gp = await workloadAs(manager)
  const onMember = await gp.getByTestId(`workload-capacity-${member.id}`).count()
  const onOwn = await gp.getByTestId(`workload-capacity-${manager.id}`).count()
  chk(
    onMember === 1 && onOwn === 1,
    'the manager’s Workload offers the control on their own row and on a plain member’s',
    `on the member’s ${onMember}; on their own ${onOwn}`,
  )
  await gp.context().close().catch(() => {})
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
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

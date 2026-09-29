/**
 * ON A DASHBOARD SOMEBODY ELSE MADE, THE BUILDER OFFERS YOUR OWN COPY, NOT AN
 * EDIT THAT CANNOT BE SAVED.
 *
 * NOT A FRAME ROW: `found-28-sep/dashboard-edit-offered-on-others-presets`,
 * found by the dashboard research. The widget builder offered Edit dashboard
 * and Save layout on whatever dashboard was shown — the workspace default
 * included, which a member sees until they have one of their own — and
 * `PUT /dashboards/:id` is the owner's, so the save answered "Preset not
 * found" and the arrangement was lost.
 *
 * ClickUp (help centre, from search snippets): a dashboard is changed by those
 * with edit access to it; anybody else can duplicate it and change the copy.
 * The builder offers the owner Edit dashboard, and anybody else Make my own
 * copy, which saves the layout as their own dashboard.
 *
 *   node test/e2e/dashboard-own-copy.mjs --api 3027 --dist /tmp/claude-0/dist-7
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
const TAG = `doc${stamp}`
const PASSWORD = 'OwnCopy@12345!'
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the dashboards saved are read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const adminId = (await A('/users/me')).data?.id
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const email = `${TAG}-member@rundesk.invalid`
  const signed = await signUpApi(API, { fullName: 'Dashboard member', email, password: PASSWORD, organizationName: `Dash ${stamp}`, organizationSlug: `dash-${stamp}` })
  const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'member' } })
  if (added.status >= 300) throw new Error(`could not add the member: ${said(added)}`)
  const memberId = signed.user?.id

  // The admin's dashboard, made the workspace default: what the member sees before they have one.
  const layout = [{ id: `${TAG}-a`, type: 'tasks-due', w: 1, h: 1 }, { id: `${TAG}-b`, type: 'overdue', w: 1, h: 1 }]
  const preset = await A('/dashboards', { method: 'POST', body: { workspaceId: WS, name: `${TAG} the admin’s dashboard`, layout } })
  if (preset.status >= 300 || !preset.data?.id) throw new Error(`could not make the dashboard: ${said(preset)}`)
  const PRESET = preset.data.id
  const def = await A(`/dashboards/workspace/${WS}/preset/${PRESET}/workspace-default`, { method: 'PUT' })
  if (def.status >= 300) throw new Error(`could not make it the workspace default: ${said(def)}`)
  const adminsLayout = async () => JSON.stringify((await sql`select layout from dashboard_presets where id = ${PRESET}`)[0]?.layout ?? null)
  const before = await adminsLayout()

  const chromium = await resolveChromium()
  browser = await chromium.launch(launchOptions())
  const pageAs = async (who, password) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
    const page = await ctx.newPage()
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', who)
    await page.fill('input[type=password]', password)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    // The builder is the dashboard's Custom mode.
    await page.goto(`${B}/app/${WS}/dashboard?mode=custom`, { waitUntil: 'domcontentloaded' })
    return page
  }
  /**
   * The builder's one button outside edit mode, by what it says — read once the
   * dashboard shown is the one staged (its name is drawn), since before the
   * dashboards load the builder has none and offers Edit.
   */
  const offer = async (page) => {
    await waitUntil(() => page.getByText(`${TAG} the admin’s dashboard`).first().isVisible().catch(() => false), { timeoutMs: 20_000 })
    const button = page.getByRole('button', { name: /^(Edit dashboard|Make my own copy)$/ })
    await waitUntil(() => button.first().isVisible().catch(() => false), { timeoutMs: 20_000 })
    return (await button.first().innerText().catch(() => '')).trim()
  }
  /** Enter edit mode by that button, then Save layout, and answer the save's request. */
  const saveThrough = async (page) => {
    const requests = []
    page.on('response', (r) => {
      const u = new URL(r.url())
      if (u.pathname.startsWith('/api/v1/dashboards') && ['POST', 'PUT'].includes(r.request().method())) requests.push(`${r.request().method()} ${r.status()}`)
    })
    await page.getByRole('button', { name: /^(Edit dashboard|Make my own copy)$/ }).first().click({ timeout: 10_000 }).catch(() => {})
    await page.getByRole('button', { name: /^Save layout$/ }).click({ timeout: 10_000 }).catch(() => {})
    await waitUntil(async () => requests.length > 0, { timeoutMs: 10_000 })
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
    return requests
  }

  // ══ 1. THE MEMBER IS OFFERED A COPY ══════════════════════════════════════
  console.log('\n▶ a plain member, on the admin’s workspace default')
  const mp = await pageAs(email, PASSWORD)
  const memberOffer = await offer(mp)
  chk(
    memberOffer === 'Make my own copy',
    'on the admin’s workspace default a plain member is offered Make my own copy, not Edit dashboard, which they could not save',
    `the button says ${JSON.stringify(memberOffer)}`,
  )

  // ══ 2. AND THE COPY IS SAVED AS THEIRS ═══════════════════════════════════
  const memberSaves = await saveThrough(mp)
  const theirs = await sql`select id, layout, is_default from dashboard_presets where workspace_id = ${WS} and user_id = ${memberId}`
  const after = await adminsLayout()
  chk(
    memberSaves.includes('POST 201') && !memberSaves.some((r) => r.startsWith('PUT')) && theirs.length === 1 && theirs[0].is_default === true
      && Array.isArray(theirs[0].layout) && theirs[0].layout.length === layout.length && after === before,
    'saving it makes the member a dashboard of their own with that layout (201), asks nothing of the admin’s, and leaves the admin’s as it was',
    `requests ${JSON.stringify(memberSaves)}; theirs ${JSON.stringify(theirs.map((r) => ({ default: r.is_default, widgets: r.layout?.length })))}; the admin’s changed ${after !== before}`,
  )

  // ══ 3. THE OWNER EDITS THEIR OWN ═════════════════════════════════════════
  console.log('\n▶ the admin, on their own dashboard')
  const ap = await pageAs(ADMIN.email, ADMIN.password)
  const adminOffer = await offer(ap)
  const adminSaves = await saveThrough(ap)
  const adminsCount = (await sql`select count(*)::int as n from dashboard_presets where workspace_id = ${WS} and user_id = ${adminId}`)[0].n
  chk(
    adminOffer === 'Edit dashboard' && adminSaves.includes('PUT 200') && adminsCount === 1,
    'the admin is offered Edit dashboard on their own and saves to it (200), making no copy',
    `the button says ${JSON.stringify(adminOffer)}; requests ${JSON.stringify(adminSaves)}; the admin has ${adminsCount} dashboard(s)`,
  )
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

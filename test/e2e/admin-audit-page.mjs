/**
 * THE AUDIT LOG READS THE WORKSPACE ITS READER PICKS, AND SAYS WHEN IT FAILS.
 *
 * NOT A FRAME ROW: `found-24-sep/admin-audit-reads-the-first-workspace`. The
 * console's audit log read the trail of the admin's FIRST workspace (the one
 * they joined first), with no way to pick another, where every other console
 * page offers the choice. Its Export CSV threw its failure away (`void`), so a
 * failed export did nothing at all; and a trail that failed to load said "No
 * audit events yet."
 *
 * Read from the screen as the super-admin, with an event planted by SQL in a
 * new workspace (the last they joined) and one in their first.
 *
 *   node test/e2e/admin-audit-page.mjs --api 3021
 */
import fs from 'node:fs'
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
const EXPECTED_CHECKS = 4

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
const TAG = `aap-${stamp}`
const PICKED = `${TAG} happened in the picked workspace`
const FIRST = `${TAG} happened in the first workspace`
let browser = null
let sql = null
let WS = null
let token = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the events are planted by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  token = auth.accessToken
  const call = async (route, init = {}) => {
    const res = await fetch(`${API}${route}`, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: init.body ? JSON.stringify(init.body) : undefined })
    return { status: res.status, data: (await res.json().catch(() => null))?.data }
  }
  const mine = await call('/workspaces')
  const firstWs = mine.data?.[0]?.workspace?.id
  if (!firstWs) throw new Error(`the admin has no workspace to be first: ${mine.status}`)
  const made = await call('/workspaces', { method: 'POST', body: { name: `${TAG} picked` } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${made.status}`)
  WS = made.data.id
  if (WS === firstWs) throw new Error('the new workspace is the first — nothing to tell apart')
  await sql`insert into audit_logs (workspace_id, actor_email, action, description) values (${WS}, ${ADMIN.email}, 'workspace.updated', ${PICKED})`
  await sql`insert into audit_logs (workspace_id, actor_email, action, description) values (${firstWs}, ${ADMIN.email}, 'workspace.updated', ${FIRST})`

  browser = await chromium.launch(launchOptions())
  // The app's service worker answers API GETs itself, and a page route never
  // sees a request the worker handles: blocked, so the held reads are held.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', acceptDownloads: true })
  const page = await ctx.newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ADMIN.email)
  await page.fill('input[type=password]', ADMIN.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
  const shown = (text) => page.getByText(text, { exact: true }).count()

  // ══ 1. THE WORKSPACE PICKED IS THE ONE READ ══════════════════════════════
  console.log('\n▶ an event in a workspace that is not the first')
  await page.goto(`${B}/app/admin/audit`, { waitUntil: 'domcontentloaded' })
  const picker = page.getByTestId('admin-audit-workspace')
  const offered = await picker.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false)
  if (offered) await picker.selectOption(WS).catch(() => {})
  await waitUntil(async () => (await shown(PICKED)) > 0, { timeoutMs: 15_000 })
  const pickedShown = await shown(PICKED)
  const firstShown = await shown(FIRST)
  chk(
    offered && pickedShown === 1 && firstShown === 0,
    'the audit log offers the admin their workspaces, and reads the one picked — its event shown, the first workspace’s not',
    `a workspace picker offered: ${offered}; the picked workspace's event shown ×${pickedShown}, the first's ×${firstShown}`,
  )

  // ══ 2. ITS EXPORT ════════════════════════════════════════════════════════
  console.log('\n▶ Export CSV of the workspace picked')
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 20_000 }).catch(() => null),
    page.getByRole('button', { name: /Export CSV/ }).click({ timeout: 10_000 }).catch(() => {}),
  ])
  const csv = dl ? fs.readFileSync(await dl.path()).toString('utf8') : ''
  chk(
    csv.includes(PICKED) && !csv.includes(FIRST),
    'Export CSV saves the picked workspace’s trail, not the first’s',
    dl ? `the file has the picked event: ${csv.includes(PICKED)}, the first's: ${csv.includes(FIRST)} (${csv.length} bytes)` : 'nothing was saved',
  )

  // ══ 3. A FAILED EXPORT ═══════════════════════════════════════════════════
  console.log('\n▶ an export that fails')
  const EXPORT = (u) => u.pathname.endsWith('/audit-logs/export')
  const failExport = (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'failed by the suite' }) }).catch(() => {})
  await page.route(EXPORT, failExport)
  await page.getByRole('button', { name: /Export CSV/ }).click({ timeout: 10_000 }).catch(() => {})
  const toast = page.locator('[data-sonner-toast]')
  await waitUntil(async () => (await toast.count()) > 0, { timeoutMs: 10_000 })
  const toldExport = ((await toast.first().filter({ visible: true }).innerText({ timeout: 3000 }).catch(() => '')) ?? '').replace(/\s+/g, ' ').trim()
  await page.unroute(EXPORT, failExport).catch(() => {})
  chk(
    /could not be exported/i.test(toldExport),
    'an export that fails says so',
    `the page said ${JSON.stringify(toldExport)}`,
  )

  // ══ 4. A FAILED READ ═════════════════════════════════════════════════════
  console.log('\n▶ a trail that fails to load')
  const LIST = (u) => /\/audit-logs$/.test(u.pathname)
  const failList = (route) => (route.request().method() === 'GET'
    ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'failed by the suite' }) })
    : route.continue()
  ).catch(() => {})
  await page.route(LIST, failList)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitUntil(async () => (await page.getByTestId('admin-audit-load-failed').count()) > 0 || (await shown('No audit events yet.')) > 0, { timeoutMs: 20_000 })
  const failedSays = ((await page.getByTestId('admin-audit-load-failed').filter({ visible: true }).innerText({ timeout: 3000 }).catch(() => '')) ?? '').trim()
  const saysNone = await shown('No audit events yet.')
  await page.unroute(LIST, failList).catch(() => {})
  chk(
    failedSays === 'The audit log could not be loaded.' && saysNone === 0,
    'a trail that fails to load says so — and not that there are no events',
    `the page says ${JSON.stringify(failedSays)}; "No audit events yet." ×${saysNone}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  if (sql) await sql`delete from audit_logs where description like ${`${TAG}%`}`.catch(() => {})
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

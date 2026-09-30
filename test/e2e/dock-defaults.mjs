/**
 * A DOCK NOBODY ARRANGED KEEPS ITS DEFAULT TOOLS.
 *
 * NOT A FRAME ROW: `found-25-sep/dock-empties-after-the-first-page`. The dock
 * carries a default set of tools until its owner chooses (G07-7), and "never
 * chose" was read from `pinnedLinks` being absent. But the dock's row is also
 * where the sidebar's recents live, and the first page a person visited wrote
 * them — creating the row with `pinned_links = []`, which the web reads as "chose
 * to hold nothing". So a person's dock emptied itself on their first page, and
 * the picker's first tick then started from nothing: ticking one tool left one.
 *
 * A member of a fresh workspace, their dock read on screen and their row by SQL.
 *
 *   node test/e2e/dock-defaults.mjs --api 3021 --dist /tmp/claude-0/dist-1
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

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

const stamp = Date.now()
const TAG = `dkd${stamp}`
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
  if (!sql) throw new Error('no DATABASE_URL — the dock row is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${made.status}`)
  WS = made.data.id
  const email = `${TAG}-member@rundesk.invalid`
  const password = 'Docked@12345!'
  const signed = await signUpApi(API, {
    fullName: 'Docked member', email, password,
    organizationName: `Docked ${stamp}`, organizationSlug: `docked-${stamp}`,
  })
  const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'member' } })
  if (!added.ok) throw new Error(`could not add the member: ${added.status}`)
  const M = apiAs(signed.accessToken)
  const memberId = signed.user?.id
  const row = async () => (await sql`select pinned_links from user_dock_configs where user_id = ${memberId} and workspace_id = ${WS}`)[0] ?? null

  browser = await (await resolveChromium()).launch(launchOptions())
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', email)
  await page.fill('input[type=password]', password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
  /** The tools the dock carries, once the page has drawn it. */
  const dockAt = async (where) => {
    await page.goto(`${B}/app/${WS}${where}`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('floating-dock').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
    await page.waitForTimeout(2500)
    return page.locator('[data-testid="floating-dock"] [data-testid^="dock-tool-"]').evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-testid')).filter((id) => !id.startsWith('dock-tool-toggle-') && id !== 'dock-tool-picker').map((id) => id.replace('dock-tool-', '')))
  }

  // ══ 1. NEVER ARRANGED ════════════════════════════════════════════════════
  console.log('\n▶ a member who never arranged their dock, after a few pages')
  await dockAt('/inbox')
  await dockAt('/docs')
  const tools = await dockAt('')
  const stored = await row()
  chk(
    tools.includes('home') && tools.includes('inbox') && tools.length >= 3 && stored !== null && stored.pinned_links === null,
    'a dock nobody arranged keeps its default tools after moving between pages — the row the pages wrote records no choice',
    `the dock carries ${JSON.stringify(tools)}; the stored choice ${stored ? JSON.stringify(stored.pinned_links) : 'no row'}`,
  )

  // ══ 2. THE PICKER'S FIRST TICK ═══════════════════════════════════════════
  console.log('\n▶ the picker, ticking one more tool')
  await page.getByTestId('floating-dock').locator('button', { hasText: '⚙' }).click({ timeout: 8000 }).catch(() => {})
  const toggle = page.getByTestId('dock-tool-toggle-goals')
  await toggle.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
  await toggle.click({ timeout: 5000 }).catch(() => {})
  let after = null
  for (let i = 0; i < 20; i++) {
    after = (await row())?.pinned_links ?? null
    if (Array.isArray(after) && after.includes('goals')) break
    await new Promise((r) => setTimeout(r, 300))
  }
  const toolsAfter = await dockAt('')
  chk(
    Array.isArray(after) && after.includes('goals') && after.includes('home') && after.includes('inbox') && toolsAfter.includes('goals') && toolsAfter.includes('home'),
    'the first tick adds to the default tools, not to nothing — the dock keeps them and gains Goals',
    `stored ${JSON.stringify(after)}; the dock carries ${JSON.stringify(toolsAfter)}`,
  )

  // ══ 3. ARRANGED TO HOLD NOTHING, AND CLEARED ══════════════════════════════
  console.log('\n▶ a dock arranged to hold nothing, then cleared')
  const emptied = await M(`/dashboards/dock/${WS}`, { method: 'POST', body: { pinnedLinks: [] } })
  const emptyTools = await dockAt('')
  const cleared = await M(`/dashboards/dock/${WS}`, { method: 'POST', body: { pinnedLinks: null } })
  const clearedRow = await row()
  const clearedTools = await dockAt('')
  chk(
    emptied.ok && emptyTools.length === 0 && cleared.ok && clearedRow?.pinned_links === null && clearedTools.includes('home'),
    'a dock arranged to hold nothing holds nothing — and cleared, it has its default tools again',
    `emptied ${emptied.status}, carrying ${JSON.stringify(emptyTools)}; cleared ${cleared.status}, stored ${JSON.stringify(clearedRow?.pinned_links)}, carrying ${JSON.stringify(clearedTools)}`,
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

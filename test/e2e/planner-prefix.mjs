/**
 * A CLEARED BLOCK PREFIX GOES BACK TO "WORK ON".
 *
 * NOT A FRAME ROW: `product-siblings/planner-block-prefix-cannot-clear`. The
 * Time blocking page's prefix box, cleared and left, sent
 * `blockPrefix: undefined`, which JSON drops, and the server merges a PATCH
 * over what it holds, so the old prefix stayed: set "Deep work:", clear the
 * box, reload, and it said "Deep work:" again. There was no way back to the
 * default.
 *
 * Planner settings belong to the person, not the workspace, so this signs up
 * its own and leaves everybody else's alone.
 *
 *   node test/e2e/planner-prefix.mjs --api 3021
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 3

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')

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
const TAG = `ppx-${stamp}`
const PERSON = { email: `${TAG}@rundesk.invalid`, password: 'Prefix@12345!' }
const PREFIX = 'Deep work:'
let browser = null
let WS = null
let token = null

try {
  const signed = await signUpApi(API, {
    fullName: 'Prefix person', email: PERSON.email, password: PERSON.password,
    organizationName: `Prefix ${stamp}`, organizationSlug: `prefix-${stamp}`,
  })
  token = signed.accessToken
  const call = async (route, init = {}) => {
    const res = await fetch(`${API}${route}`, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: init.body ? JSON.stringify(init.body) : undefined })
    return { status: res.status, data: (await res.json().catch(() => null))?.data }
  }
  const made = await call('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${made.status}`)
  WS = made.data.id
  const stored = async () => (await call(`/planner/${WS}/settings`)).data?.blockPrefix ?? null

  browser = await chromium.launch(launchOptions())
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await ctx.newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', PERSON.email)
  await page.fill('input[type=password]', PERSON.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
  const box = page.getByTestId('planner-block-prefix')
  const openTimeBlocking = async () => {
    await page.goto(`${B}/app/${WS}/calendar`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('planner-settings').click({ timeout: 20_000 }).catch(() => {})
    await page.getByTestId('planner-settings-nav-timeBlocking').click({ timeout: 10_000 }).catch(() => {})
    await box.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
  }

  // ══ 1. A PREFIX, TYPED AND LEFT ══════════════════════════════════════════
  console.log(`\n▶ "${PREFIX}" typed into the box and left`)
  await openTimeBlocking()
  await box.fill(PREFIX, { timeout: 5000 }).catch(() => {})
  await box.blur().catch(() => {})
  const saved = await waitUntil(async () => (await stored()) === PREFIX, { timeoutMs: 10_000 })
  chk(
    saved,
    'a prefix typed into the box and left is saved',
    `the server holds ${JSON.stringify(await stored())}`,
  )

  // ══ 2. CLEARED ═══════════════════════════════════════════════════════════
  console.log('\n▶ the box cleared and left, then the page reloaded')
  await box.fill('', { timeout: 5000 }).catch(() => {})
  await box.blur().catch(() => {})
  const cleared = await waitUntil(async () => (await stored()) === null, { timeoutMs: 10_000 })
  await openTimeBlocking()
  const shown = await box.inputValue({ timeout: 5000 }).catch(() => null)
  chk(
    saved && cleared && shown === 'Work on',
    'clearing it goes back to the default — the server keeps no prefix, and after a reload the box reads "Work on"',
    `the server holds ${JSON.stringify(await stored())}; after a reload the box reads ${JSON.stringify(shown)}`,
  )

  // ══ 3. TOO LONG ══════════════════════════════════════════════════════════
  console.log('\n▶ a prefix of 41 characters')
  const before = await stored()
  const long = await call(`/planner/${WS}/settings`, { method: 'PATCH', body: { blockPrefix: 'x'.repeat(41) } })
  const after = await stored()
  chk(
    long.status === 400 && after === before,
    'a prefix longer than 40 characters is refused, and the one held stays',
    `answered ${long.status}; the server held ${JSON.stringify(before)}, now ${JSON.stringify(after)}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  stack.close()
  if (WS && token) await fetch(`${API}/workspaces/${WS}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } }).catch(() => {})
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}

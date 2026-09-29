/**
 * WHAT THE COPY SAYS ABOUT CLICKAPPS NAMES WHO ACTUALLY DECIDES AND WHERE.
 *
 * NOT A FRAME ROW: `found-28-sep/copy-points-admins-to-the-console`, found by
 * the ClickApps research. Sign-up's Features step said the choice could be
 * changed "later in Admin → Features" — the platform console, where a
 * workspace's own switches are Settings → Features. And a member who asked for
 * a switched-off ClickApp was told "Your workspace admins have been asked",
 * though the ask goes to whoever holds `workspace.clickapps.manage`
 * (`admin-guard-admits-managers-where-the-web-says-admin`); the gate's other
 * answers said "admins" the same way. The gate opens only on a plan-locked
 * action, so its answers are read in every locale by a web unit test
 * (`lib/i18n/clickapps-copy.test.ts`); this reads the sign-up step a newcomer
 * sees.
 *
 *   node test/e2e/clickapps-copy.mjs --api 3027 --dist /tmp/claude-0/dist-7
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 1

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
const TAG = `cac${stamp}`
const PASSWORD = 'ClickAppsCopy@12345!'
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
let WS = null
let A = null
let browser = null

try {
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id

  const chromium = await resolveChromium()
  browser = await chromium.launch(launchOptions())

  // ══ 1. SIGN-UP'S FEATURES STEP ═══════════════════════════════════════════
  console.log('\n▶ sign-up, at its Features step')
  const sp = await (await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })).newPage()
  await sp.goto(`${B}/sign-up`, { waitUntil: 'domcontentloaded' })
  // The cookie notice sits over the form's foot; answered first.
  await sp.getByRole('button', { name: /^Accept$/ }).click({ timeout: 5000 }).catch(() => {})
  // The name field has no type attribute: it is the one input that is neither email nor password.
  await sp.locator('input:not([type=email]):not([type=password])').first().fill(`${TAG} Newcomer`, { timeout: 15_000 }).catch(() => {})
  await sp.locator('input[type=email]').fill(`${TAG}-new@rundesk.invalid`, { timeout: 5000 }).catch(() => {})
  await sp.locator('input[type=password]').first().fill(PASSWORD, { timeout: 5000 }).catch(() => {})
  await sp.getByRole('button', { name: /^Continue/ }).click({ timeout: 8000 }).catch(() => {})
  // Each step is filled once it is drawn: the step's counter says which.
  await waitUntil(() => sp.getByText(/STEP 2 OF 4/i).first().isVisible().catch(() => false), { timeoutMs: 10_000 })
  // The steps slide: step one's three fields leave while step two's one arrives.
  await waitUntil(async () => (await sp.locator('input').count()) === 1, { timeoutMs: 10_000 })
  await sp.locator('input').first().fill(`${TAG} newcomer workspace`, { timeout: 8000 }).catch(() => {})
  await sp.getByRole('button', { name: /^Continue/ }).click({ timeout: 8000 }).catch(() => {})
  await waitUntil(() => sp.getByText(/STEP 3 OF 4/i).first().isVisible().catch(() => false), { timeoutMs: 10_000 })
  const subtitle = sp.getByText(/change this later in/i).first()
  const drawn = await waitUntil(() => subtitle.isVisible().catch(() => false), { timeoutMs: 10_000 })
  const text = drawn ? (await subtitle.innerText().catch(() => '')).trim() : ''
  chk(
    drawn && /Settings → Features/.test(text) && !/Admin → Features/.test(text),
    'sign-up’s Features step says the choice is changed later in Settings → Features, where a workspace’s switches are, not in the admin console',
    `drawn ${drawn}; it said ${JSON.stringify(text)}`,
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
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}

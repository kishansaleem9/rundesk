/**
 * CREATE WITH AI SAYS WHY IT MADE NOTHING, AND WHAT ITS PLAN WARNED.
 *
 * NOT A FRAME ROW: `ledger-rows/defect-ai-create-refusal-and-warnings`. A step
 * the server refused came back with its code alone (`reason: "unknown_space"`),
 * and the menu printed it in brackets: "— skipped (unknown_space)", where the
 * server has a sentence for each refusal that says what would change it. And a
 * plan's `warnings`, which the type declared, were never drawn.
 *
 * The plan is the planner's answer, so it is served by route (no model is
 * needed for it), carrying a warning and a list in a space that is not there;
 * the confirm is the real one, which refuses the list.
 *
 *   node test/e2e/create-ai-results.mjs --api 3021
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 2

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
const TAG = `car-${stamp}`
const WARNING = `${TAG}: one thing asked for was left out, because it is not something I can create`
const REFUSAL = 'I could not find that space in this workspace — nothing was created.'
let browser = null
let WS = null
let token = null

try {
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  token = auth.accessToken
  const made = await fetch(`${API}/workspaces`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ name: TAG }),
  }).then((r) => r.json()).catch(() => null)
  WS = made?.data?.id
  if (!WS) throw new Error('could not make the workspace')

  browser = await chromium.launch(launchOptions())
  // The service worker is blocked so the route below answers the planner.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  // The planner's answer: a warning, and one list in a space that does not exist.
  await page.route((u) => u.pathname.endsWith('/api/v1/ai/command'), (route) =>
    (route.request().method() === 'POST'
      ? route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              summary: `${TAG} a list, in a space that is not there`,
              actions: [{ tool: 'create_list', humanLabel: `${TAG} list`, args: { spaceId: '00000000-0000-4000-8000-000000000000', name: `${TAG} list` } }],
              warnings: [WARNING],
            },
            error: null,
          }),
        })
      : route.continue()
    ).catch(() => {}),
  )
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ADMIN.email)
  await page.fill('input[type=password]', ADMIN.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
  await page.goto(`${B}/app/${WS}`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('quick-create-open').click({ timeout: 25_000 })
  await page.getByTestId('create-search').fill(`${TAG} make a list somewhere`, { timeout: 10_000 })
  await page.getByTestId('create-ai-open').click({ timeout: 10_000 })

  // ══ 1. THE PLAN'S WARNING ════════════════════════════════════════════════
  console.log('\n▶ a plan that carries a warning')
  await waitUntil(async () => (await page.getByTestId('create-ai-summary').count()) > 0, { timeoutMs: 20_000 })
  const warned = await waitUntil(async () => (await page.getByText(WARNING, { exact: true }).count()) > 0, { timeoutMs: 5000 })
  chk(
    warned,
    'the plan’s warning is shown with it',
    `the plan read ${JSON.stringify(((await page.locator('[data-testid="create-ai-panel"]').innerText().catch(() => '')) ?? '').slice(0, 200))}`,
  )

  // ══ 2. A STEP THE SERVER REFUSES ═════════════════════════════════════════
  console.log('\n▶ confirmed, and a step refused')
  await page.getByTestId('create-ai-confirm').click({ timeout: 10_000 }).catch(() => {})
  const result = page.getByTestId('create-ai-result-0')
  await result.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
  const line = ((await result.innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim()
  chk(
    line.includes(REFUSAL) && !line.includes('unknown_space'),
    'a refused step says why, in the sentence the server gives — not its code',
    `the result line read ${JSON.stringify(line)}`,
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
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}

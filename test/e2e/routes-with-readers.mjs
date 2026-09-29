/**
 * THREE ROUTES NO PAGE READ, NOW READ WHERE THEY BELONG: A WEBHOOK'S RECENT
 * DELIVERIES, A GOAL'S HISTORY, AND THE DIGEST'S PREVIEW.
 *
 * NOT A FRAME ROW: `product-siblings/other-get-routes-without-reader`. A route
 * survey found GETs no web page called: `…/webhooks/:id/deliveries`,
 * `goals/:goalId/history` and `notifications/digest/preview`. Each answered
 * something a person wants — which deliveries failed and why, how a goal's
 * progress moved and by whom, what tomorrow's digest will hold — and nothing
 * showed it.
 *
 *   - Settings → Integrations → Webhooks: each webhook's Deliveries, the last
 *     50, with the event, the answer, the attempts, and a failed one's reply.
 *   - A goal's page: History, each change of its value, by whom and when.
 *   - Profile → Notifications, with the digest on: Preview the digest.
 *
 *   node test/e2e/routes-with-readers.mjs --api 3027 --dist /tmp/claude-0/dist-7
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
const TAG = `rwr${stamp}`
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
let WS = null
let A = null
let browser = null
let digestWas = null

try {
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id

  // A webhook to a name that never resolves (RFC 6761's `.invalid`: a private
  // address is refused when the hook is made), and one test delivery to it, which fails.
  const hook = await A(`/workspaces/${WS}/webhooks`, { method: 'POST', body: { name: `${TAG} hook`, url: 'https://rundesk-hook.invalid/hook', events: ['task.created'] } })
  if (hook.status >= 300 || !hook.data?.id) throw new Error(`could not make the webhook: ${said(hook)}`)
  const HOOK = hook.data.id
  const tested = await A(`/workspaces/${WS}/webhooks/${HOOK}/test`, { method: 'POST' })
  const recorded = await waitUntil(async () => ((await A(`/workspaces/${WS}/webhooks/${HOOK}/deliveries`)).data ?? []).length > 0, { timeoutMs: 20_000 })
  if (!recorded) throw new Error(`the test delivery was never recorded: ${said(tested)}`)

  // A goal whose value moves twice.
  const goal = await A(`/workspaces/${WS}/goals`, { method: 'POST', body: { title: `${TAG} goal`, targetValue: 10, currentValue: 0 } })
  if (goal.status >= 300 || !goal.data?.id) throw new Error(`could not make the goal: ${said(goal)}`)
  const GOAL = goal.data.id
  for (const v of [3, 7]) {
    const r = await A(`/goals/${GOAL}`, { method: 'PATCH', body: { currentValue: v } })
    if (r.status >= 300) throw new Error(`could not move the goal to ${v}: ${said(r)}`)
  }

  // The digest's own answer, which the preview must repeat.
  const prefs = await A('/notifications/preferences')
  digestWas = prefs.data?.digest ?? null
  const answer = await A('/notifications/digest/preview?frequency=weekly')
  if (answer.status >= 300) throw new Error(`the digest preview route answered ${said(answer)}`)
  const TOTAL = answer.data?.total ?? -1

  browser = await (await resolveChromium()).launch(launchOptions())
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 950 }, serviceWorkers: 'block' })).newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ADMIN.email)
  await page.fill('input[type=password]', ADMIN.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})

  // ══ 1. A WEBHOOK'S DELIVERIES ════════════════════════════════════════════
  console.log('\n▶ Settings › Integrations › Webhooks: the webhook’s Deliveries')
  await page.goto(`${B}/app/${WS}/settings?tab=integrations`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId(`webhook-deliveries-toggle-${HOOK}`).click({ timeout: 20_000 }).catch(() => {})
  const list = page.getByTestId(`webhook-deliveries-${HOOK}`)
  const shown = await waitUntil(async () => (await list.getByTestId('webhook-delivery').count()) > 0, { timeoutMs: 15_000 })
  const row = list.getByTestId('webhook-delivery').first()
  const first = shown
    ? {
        success: await row.getAttribute('data-success', { timeout: 5000 }).catch(() => null),
        text: await row.filter({ visible: true }).innerText({ timeout: 5000 }).catch(() => ''),
      }
    : null
  chk(
    shown && first?.success === 'false' && /webhook\.test/.test(first?.text ?? ''),
    'a webhook’s Deliveries lists its recent deliveries — the failed test delivery among them, marked failed, with its event',
    `listed ${shown}; the first ${JSON.stringify(first)}`,
  )

  // ══ 2. A GOAL'S HISTORY ══════════════════════════════════════════════════
  console.log('\n▶ the goal’s page: History')
  await page.goto(`${B}/app/${WS}/goals/${GOAL}`, { waitUntil: 'domcontentloaded' })
  const rows = page.getByTestId('goal-history').getByTestId('goal-history-row')
  await waitUntil(async () => (await rows.count()) >= 2, { timeoutMs: 20_000 })
  const history = await rows.filter({ visible: true }).allInnerTexts().catch(() => [])
  chk(
    history.length === 2 && /3\s*→\s*7/.test(history[0] ?? '') && /0\s*→\s*3/.test(history[1] ?? ''),
    'the goal’s History lists each change of its value, newest first — 3 → 7, then 0 → 3 — with who made it',
    `history ${JSON.stringify(history)}`,
  )

  // ══ 3. THE DIGEST'S PREVIEW ══════════════════════════════════════════════
  console.log('\n▶ Profile › Notifications: Preview the digest')
  const on = await A('/notifications/preferences', { method: 'POST', body: { digest: { enabled: true, frequency: 'weekly', hour: 8 } } })
  if (on.status >= 300) throw new Error(`could not turn the digest on: ${said(on)}`)
  await page.goto(`${B}/app/profile?tab=notifications`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('digest-preview-open').click({ timeout: 20_000 }).catch(() => {})
  const said_ = await waitUntil(async () => (await page.getByTestId('digest-preview-total').count()) + (await page.getByTestId('digest-preview-empty').count()) > 0, { timeoutMs: 15_000 })
  const totalText = (await page.getByTestId('digest-preview-total').filter({ visible: true }).innerText().catch(() => '')).trim()
  const empty = await page.getByTestId('digest-preview-empty').count()
  chk(
    said_ && (TOTAL === 0 ? empty === 1 : totalText.includes(String(TOTAL))),
    'Preview the digest shows what the digest would hold now — the same total the digest route answers',
    `the route ${TOTAL}; shown ${JSON.stringify(totalText)}${empty ? ' (empty)' : ''}`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  if (A && digestWas) {
    const back = await A('/notifications/preferences', { method: 'POST', body: { digest: digestWas } })
    if (back.status === 0 || back.status >= 300) console.log(`  (the admin's digest setting was not put back: ${said(back)})`)
  }
  if (WS && A) {
    const gone = await A(`/workspaces/${WS}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${WS} answered ${gone.status || 'nothing'}`)
  }
  // Only now: the restore and the DELETE above go through this proxy, and a closed one refuses them.
  stack.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}

/**
 * THE CONTRIBUTION REPORT'S SPRINT PERIOD REPORTS ON THE SPRINT CHOSEN — ONE ITS READER MAY READ.
 *
 * NOT A FRAME ROW: `product-siblings/contribution-sprint-unselectable`. The
 * Sprint chip offered no way to choose a sprint, so the report, its label and
 * its PDF always took the active sprint that started last, whichever the
 * reader meant. And the server resolved a sprint id with no read rule: a
 * member refused a private space asked for its sprint and was given its name
 * as the period's label (found fixing this, after `sprints-open-to-any-member`).
 *
 * Sprints are planted by SQL: two active ones in an open space, the later-begun
 * being the default, and one in a private space the member is refused, begun
 * before both.
 *
 *   node test/e2e/contribution-sprint.mjs --api 3021
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'
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

const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
const stamp = Date.now()
const TAG = `csp-${stamp}`
const WORD = `SECRET${stamp}`
let browser = null
let sql = null
let WS = null
let A = null

/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the sprints are planted by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const email = `${TAG}-member@rundesk.invalid`
  const signed = await signUpApi(API, {
    fullName: 'Contribution member', email, password: 'Member@12345!',
    organizationName: `Contribution ${stamp}`, organizationSlug: `contribution-${stamp}`,
  })
  const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'member' } })
  if (!added.ok) throw new Error(`could not add the member: ${said(added)}`)
  const M = apiAs(signed.accessToken)
  const space = (await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} open` } })).data?.id
  const hidden = (await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${WORD} space`, visibility: 'private' } })).data?.id
  if (!space || !hidden) throw new Error('could not make the spaces')
  const sprint = async (spaceId, name, startedDaysAgo) =>
    (await sql`insert into sprints (workspace_id, space_id, name, status, start_date, end_date)
               values (${WS}, ${spaceId}, ${name}, 'active', now() - make_interval(days => ${startedDaysAgo}), now() + interval '7 days')
               returning id`)[0].id
  const EARLIER = `${TAG} earlier sprint`
  const LATER = `${TAG} later sprint`
  const earlier = await sprint(space, EARLIER, 6)
  await sprint(space, LATER, 2)
  // Begun before both, so the default is the later open one for the admin too.
  const secret = await sprint(hidden, `${WORD} sprint`, 10)

  // ══ 1. A SPRINT ID THE READER MAY NOT READ ════════════════════════════════
  console.log('\n▶ the contribution report, asked for a private space’s sprint')
  const route = `/workspaces/${WS}/reports/contribution?period=sprint&sprintId=${secret}`
  const [mine, theirs] = await Promise.all([M(route), A(route)])
  const label = (res) => String(res.data?.period?.label ?? '')
  chk(
    mine.status === 200 && !label(mine).includes(WORD) && label(theirs).includes(WORD),
    'a member asking for a private space’s sprint is not given its name as the period — the admin is',
    `the member's ${said(mine)} label ${JSON.stringify(label(mine))}; the admin's ${JSON.stringify(label(theirs))}`,
  )

  // ══ 2. THE PICKER ════════════════════════════════════════════════════════
  console.log('\n▶ Insights → Contribution → Sprint, choosing the earlier sprint')
  browser = await chromium.launch(launchOptions())
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ADMIN.email)
  await page.fill('input[type=password]', ADMIN.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
  await page.goto(`${B}/app/${WS}/insights`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /^Sprint$/ }).first().click({ timeout: 20_000 }).catch(() => {})
  const picker = page.getByTestId('contribution-sprint')
  const offered = await picker.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false)
  const defaultLabel = offered ? await waitUntil(async () => (await page.getByText(`Sprint: ${LATER}`).count()) > 0, { timeoutMs: 15_000 }) : false
  if (offered) await picker.selectOption(earlier).catch(() => {})
  const chosenLabel = offered ? await waitUntil(async () => (await page.getByText(`Sprint: ${EARLIER}`).count()) > 0, { timeoutMs: 15_000 }) : false
  chk(
    offered && defaultLabel && chosenLabel,
    'the Sprint period offers a sprint to choose — the one begun last by default — and reports on the one chosen',
    `a picker offered: ${offered}; labelled the later sprint first: ${defaultLabel}; the earlier once chosen: ${chosenLabel}`,
  )

  // ══ 3. ITS PDF ═══════════════════════════════════════════════════════════
  console.log('\n▶ the PDF of the sprint chosen')
  let pdfBody = null
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().includes('/reports/contribution.pdf')) {
      try { pdfBody = JSON.parse(req.postData() ?? 'null') } catch { pdfBody = null }
    }
  })
  await page.getByRole('button', { name: /Download PDF/ }).first().click({ timeout: 10_000 }).catch(() => {})
  await waitUntil(async () => pdfBody !== null, { timeoutMs: 15_000 })
  chk(
    pdfBody?.period === 'sprint' && pdfBody?.sprintId === earlier,
    'Download PDF asks for the sprint chosen',
    `the PDF was asked for ${JSON.stringify(pdfBody)}`,
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

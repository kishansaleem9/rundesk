/**
 * THE TIMESHEET'S "MINE" IS THE VIEWER'S OWN WEEK — and the three figures
 * above it are too.
 *
 * NOT A FRAME ROW: the open-work item `timesheet-mine-includes-everyone`. The
 * Mine grid, the week's log, Submit and the "Total this week / Billable /
 * Entries" figures all read one query: the latest 500 of EVERY entry the
 * caller can see — for anybody who may approve time, the whole workspace —
 * filtered by day and not by person. So an admin's Mine timesheet carried the
 * team's hours as their own, "Total this week" summed every entry fetched, and
 * Submit could send a week the admin never worked.
 *
 * THE FIXTURE MAKES THE WRONG ANSWER DIFFERENT FROM THE RIGHT ONE. An admin
 * logs one billable hour this week and thirty minutes last week; a member logs
 * two billable hours this week. Every figure on the admin's Mine view is then
 * wrong by a knowable amount if anybody else's time leaks in, and stepping
 * back a week is wrong if the week has no far end. The Team view is the
 * positive twin: it must still show the member.
 *
 *   node test/e2e/timesheet-mine.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { apiClient, login } from './lib/fixture.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a branch that skipped is a failure. */
const EXPECTED_CHECKS = 8

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
const EMAIL = process.env.E2E_EMAIL ?? 'admin@rundesk.internal'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123!'

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

const stamp = Date.now()
const TAG = `tsm-${stamp}`
const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
let browser = null
let api = null
let WS = null

/** Monday 00:00 of the week `now` falls in, in this machine's zone — the page's own week. */
const mondayOf = (d) => {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}
const HOUR = 3600 * 1000

try {
  const auth = await login(`${B}/api/v1`, EMAIL, PASSWORD)
  // The fixture's apiClient NEVER THROWS — every call below is read off `status`.
  api = apiClient(`${B}/api/v1`, auth.accessToken)
  const made = await api('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${made.status}`)
  WS = made.data.id
  const admin = (await api('/users/me')).data?.id

  const space = (await api('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} space` } })).data?.id
  const project = (await api('/projects', { method: 'POST', body: { spaceId: space, name: `${TAG} project` } })).data?.id
  const list = (await api('/lists', { method: 'POST', body: { projectId: project, name: `${TAG} list` } })).data?.id
  const task = (await api('/tasks', { method: 'POST', body: { listId: list, title: `${TAG} work` } })).data?.id
  if (!task) throw new Error('could not make the task')

  const signupRes = await fetch(`${B}/api/v1/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fullName: `Timesheet ${stamp}`, email: `tsm-${stamp}@rundesk.invalid`, password: 'Member@12345!', organizationName: `Timesheet ${stamp}`, organizationSlug: `timesheet-${stamp}` }),
  })
  const signup = (await signupRes.json().catch(() => null))?.data
  if (!signup?.accessToken) throw new Error(`signup failed: ${signupRes.status}`)
  const memberId = signup.user?.id ?? signup.id
  const added = await api(`/workspaces/${WS}/members`, { method: 'POST', body: { email: `tsm-${stamp}@rundesk.invalid`, role: 'member' } })
  if (added.status >= 300) throw new Error(`could not add the member: ${added.status}`)
  const M = apiClient(`${B}/api/v1`, signup.accessToken)

  // This week's entries sit an hour into Monday, so they are this week's
  // whatever day the run is on; last week's sit on last Tuesday.
  const monday = mondayOf(new Date())
  const log = (as, startedAt, ms, billable) =>
    as(`/tasks/${task}/time-entries/manual`, {
      method: 'POST',
      body: { startedAt: startedAt.toISOString(), endedAt: new Date(startedAt.getTime() + ms).toISOString(), isBillable: billable },
    })
  const mineNow = await log(api, new Date(monday.getTime() + 1 * HOUR), 1 * HOUR, true)
  const mineBefore = await log(api, new Date(monday.getTime() - 6 * 24 * HOUR + 10 * HOUR), 0.5 * HOUR, false)
  const theirsNow = await log(M, new Date(monday.getTime() + 3 * HOUR), 2 * HOUR, true)
  for (const [what, res] of [['the admin’s', mineNow], ['last week’s', mineBefore], ['the member’s', theirsNow]]) {
    if (res.status >= 300) throw new Error(`could not log ${what} time: ${res.status} ${JSON.stringify(res.error ?? '')}`)
  }

  browser = await chromium.launch(launchOptions())
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await ctx.newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
  await page.goto(`${B}/app/${WS}/time`, { waitUntil: 'domcontentloaded' })

  const stat = (id) => page.getByTestId(id).textContent({ timeout: 5000 }).then((t) => t?.trim() ?? null, () => null)
  const rowsUsers = () =>
    page.getByTestId('time-entry-row').evaluateAll((els) => els.map((e) => e.getAttribute('data-user-id'))).catch(() => [])

  // ══ 1. THIS WEEK, MINE ═══════════════════════════════════════════════════
  console.log('\n▶ an admin’s Mine timesheet is the admin’s own week')

  await waitUntil(async () => (await stat('time-stat-total')) === '1h 00m', { timeoutMs: 20_000 })
  chk(
    (await stat('time-stat-total')) === '1h 00m',
    '"Total this week" is the admin’s own hour — not the member’s two added to it',
    `it reads ${JSON.stringify(await stat('time-stat-total'))}; "3h 00m" is the team's week, and more than that is every entry fetched`,
  )
  chk(
    (await stat('time-stat-billable')) === '1h 00m',
    'and "Billable" is the admin’s billable hour alone',
    `it reads ${JSON.stringify(await stat('time-stat-billable'))}`,
  )
  chk(
    (await stat('time-stat-entries')) === '1',
    'and "Entries" counts the one entry the admin made this week',
    `it reads ${JSON.stringify(await stat('time-stat-entries'))}`,
  )
  const users = await rowsUsers()
  chk(
    users.length === 1 && users[0] === admin,
    'the week’s log lists the admin’s entry and nobody else’s',
    `the log's entries belong to ${JSON.stringify(users)} (the admin is ${admin}, the member ${memberId})`,
  )

  // ══ 2. LAST WEEK ═════════════════════════════════════════════════════════
  console.log('\n▶ stepping back a week shows that week and only that week')

  await page.getByTestId('time-week-prev').click({ timeout: 8000 }).catch(() => {})
  await waitUntil(async () => (await stat('time-stat-total')) === '0h 30m', { timeoutMs: 15_000 })
  chk(
    (await stat('time-stat-total')) === '0h 30m' && (await rowsUsers()).length === 1,
    'last week holds the thirty minutes logged then — not this week’s hour as well',
    `it reads ${JSON.stringify(await stat('time-stat-total'))} over ${(await rowsUsers()).length} entr(ies); "since Monday" with no far end still fetched everything after it`,
  )

  // ══ 3. THE TEAM VIEW STILL SHOWS THE TEAM ════════════════════════════════
  console.log('\n▶ while the Team view still shows everybody')

  await page.getByTestId('time-week-next').click({ timeout: 8000 }).catch(() => {})
  await page.getByTestId('time-sheet-team').click({ timeout: 8000 }).catch(() => {})
  const memberRow = page.locator(`[data-testid="time-team-row"][data-user-id="${memberId}"]`)
  const shown = await waitUntil(async () => (await memberRow.count()) === 1, { timeoutMs: 15_000 })
  const memberTotal = shown ? ((await memberRow.textContent().catch(() => '')) ?? '') : ''
  chk(
    shown && memberTotal.includes('2h 00m'),
    'the member’s two hours are on the Team view — Mine was narrowed, the team was not',
    `the member's row is ${shown ? JSON.stringify(memberTotal.slice(0, 120)) : 'absent'}`,
  )

  // ══ 4. THE WINDOW HAS A FAR END, AND IT IS VALIDATED ═════════════════════
  /*
   * Asked of the server directly, because the page filters by day as well and
   * would hide a server that ignored `until`: last Monday to this Monday must
   * be last week's thirty minutes alone.
   */
  const lastMonday = new Date(monday.getTime() - 7 * 24 * HOUR)
  const window = await api(
    `/workspaces/${WS}/time-entries?userId=${admin}&since=${encodeURIComponent(lastMonday.toISOString())}&until=${encodeURIComponent(monday.toISOString())}`,
  )
  const inWindow = (window.data ?? []).map((e) => e.durationSeconds)
  chk(
    window.status === 200 && inWindow.length === 1 && inWindow[0] === 1800,
    'the server’s window ends where it is told to — last week holds only last week’s entry',
    `it answered ${window.status} with durations ${JSON.stringify(inWindow)}`,
  )
  const bad = await api(`/workspaces/${WS}/time-entries?until=nonsense`)
  chk(
    bad.status === 400,
    'an unreadable window bound is refused by name, not answered with a server error',
    `?until=nonsense answered ${bad.status}`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  if (api && WS) {
    const res = await api(`/workspaces/${WS}`, { method: 'DELETE' })
    if (res.status >= 300) console.log(`  \x1b[33mnote\x1b[0m cleanup answered ${res.status}`)
  }
  await browser?.close().catch(() => {})
  stack.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}

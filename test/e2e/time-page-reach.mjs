/**
 * THE TIME PAGE SHOWS EACH PERSON THE SAME PEOPLE'S HOURS ON EVERY TAB — AND
 * ONLY THIS WORKSPACE'S HOURS.
 *
 * NOT A FRAME ROW: `found-25-sep/time-page-answers-whose-hours-twice`. The
 * Reports tab read a manager's team (the spaces and projects they belong to);
 * the Team week and Monthly tabs, the admins' or your own. One page answered
 * "whose hours may a manager see" two ways. Measuring it showed a second fault
 * under the first: the team week and the monthly rollup summed every entry of
 * a workspace's members, wherever they logged it, so hours kept in another
 * workspace were counted in this one.
 *
 * The rule is the reports' (`common/permissions/viewer-scope.ts`), stated
 * once: an admin sees everyone, a manager their team, anyone else their own.
 * ClickUp's "All timesheets" is the owner's and the admins'; a manager here is
 * given their team, as the reports already gave it.
 *
 *   node test/e2e/time-page-reach.mjs --api 3021 --dist /tmp/claude-0/dist-1
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
const TAG = `tpr${stamp}`
const PASSWORD = 'TimeReach@12345!'
/** This week's Monday (UTC): the Time page opens on it, and every entry below falls in it. */
const WEEK = (() => {
  const d = new Date()
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  m.setUTCDate(m.getUTCDate() - ((m.getUTCDay() + 6) % 7))
  return m.toISOString().slice(0, 10)
})()
const at = (hh) => `${WEEK}T${hh}:00:00.000Z`

const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
let sql = null
let WS = null
let WSB = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the manager is put on a space by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  const other = await A('/workspaces', { method: 'POST', body: { name: `${TAG} other` } })
  if (made.status >= 300 || other.status >= 300) throw new Error(`could not make the workspaces: ${said(made)} ${said(other)}`)
  WS = made.data.id
  WSB = other.data.id

  const signUp = async (key) => {
    const email = `${TAG}-${key}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `Reach ${key}`, email, password: PASSWORD, organizationName: `Reach ${key} ${stamp}`, organizationSlug: `reach-${key}-${stamp}` })
    const [row] = await sql`select id from users where email = ${email}`
    return { id: row.id, email, password: PASSWORD, as: apiAs(signed.accessToken) }
  }
  const join = async (who, ws, role) => {
    const added = await A(`/workspaces/${ws}/members`, { method: 'POST', body: { email: who.email, role } })
    if (added.status >= 300) throw new Error(`could not add ${who.email}: ${said(added)}`)
  }
  const manager = await signUp('manager')
  const near = await signUp('near')
  const far = await signUp('far')
  const plain = await signUp('plain')
  for (const [who, role] of [[manager, 'manager'], [near, 'member'], [far, 'member'], [plain, 'member']]) await join(who, WS, role)
  await join(near, WSB, 'member')

  const taskIn = async (ws, name) => {
    const space = await A('/spaces', { method: 'POST', body: { workspaceId: ws, name: `${TAG} ${name}` } })
    const project = await A('/projects', { method: 'POST', body: { spaceId: space.data?.id, name: `${TAG} ${name}` } })
    const list = await A('/lists', { method: 'POST', body: { projectId: project.data?.id, name: `${TAG} ${name}` } })
    const task = await A('/tasks', { method: 'POST', body: { listId: list.data?.id, title: `${TAG} ${name} task` } })
    if (task.status >= 300 || !task.data?.id) throw new Error(`could not make ${name}: ${said(space)} ${said(task)}`)
    return { spaceId: space.data.id, taskId: task.data.id }
  }
  const teamSpace = await taskIn(WS, 'team')
  const farSpace = await taskIn(WS, 'far')
  const elsewhere = await taskIn(WSB, 'elsewhere')
  // The manager's team: the space they belong to.
  await sql`insert into space_members (space_id, user_id, role) values (${teamSpace.spaceId}, ${manager.id}, 'edit') on conflict do nothing`
  const log = async (who, taskId, from, to) => {
    const r = await who.as(`/tasks/${taskId}/time-entries/manual`, { method: 'POST', body: { startedAt: at(from), endedAt: at(to), description: TAG } })
    if (r.status >= 300) throw new Error(`could not log time: ${said(r)}`)
  }
  await log(near, teamSpace.taskId, '01', '03') // 2h in the manager's team
  await log(far, farSpace.taskId, '01', '04') // 3h outside it
  await log(plain, teamSpace.taskId, '04', '05') // 1h, the plain member's own
  await log(near, elsewhere.taskId, '05', '10') // 5h in the other workspace

  const hoursOf = (rows, id, field = 'totalSeconds') => {
    const r = (rows ?? []).filter((x) => x.userId === id)
    return r.length === 0 ? null : r.reduce((s, x) => s + (x[field] ?? 0), 0) / 3600
  }
  const teamWeek = async (who) => (await who(`/workspaces/${WS}/time-team-week?weekStart=${WEEK}`)).data ?? []
  const monthly = async (who) => (await who(`/workspaces/${WS}/time-monthly?months=6`)).data ?? []

  // ══ 1. THE REPORTS TAB, WHICH ALREADY ASKED THE TEAM ═════════════════════
  console.log('\n▶ the Reports tab for the manager')
  const report = (await manager.as(`/workspaces/${WS}/reports/time?days=30`)).data ?? []
  const reportHours = (id) => (report.find((r) => r.userId === id)?.totalHours ?? null)
  chk(
    reportHours(near.id) === 2 && (reportHours(far.id) ?? 0) === 0,
    'the Reports tab gives the manager their team’s hours — the near member’s two — and none of the far member’s, outside their spaces',
    `near ${reportHours(near.id)}h, far ${reportHours(far.id)}h`,
  )

  // ══ 2–3. THE TEAM WEEK AND THE MONTHLY ROLLUP ═══════════════════════════
  console.log('\n▶ the team week and the monthly rollup for the manager')
  const mWeek = await teamWeek(manager.as)
  const mMonth = await monthly(manager.as)
  chk(
    hoursOf(mWeek, near.id) === 2 && hoursOf(mWeek, plain.id) === 1 && hoursOf(mWeek, far.id) === null,
    'the team week gives the manager the same people the Reports tab does: the near member’s two hours and the plain member’s one, in their space — and no row for the far member',
    `near ${hoursOf(mWeek, near.id)}, plain ${hoursOf(mWeek, plain.id)}, far ${hoursOf(mWeek, far.id)}`,
  )
  chk(
    hoursOf(mMonth, near.id) === 2 && hoursOf(mMonth, far.id) === null,
    'so does the monthly rollup: the near member’s two hours, and no row for the far member',
    `near ${hoursOf(mMonth, near.id)}, far ${hoursOf(mMonth, far.id)}`,
  )

  // ══ 4. A MEMBER, AND AN ADMIN ════════════════════════════════════════════
  console.log('\n▶ the plain member and the admin')
  const pWeek = await teamWeek(plain.as)
  const aWeek = await teamWeek(A)
  chk(
    hoursOf(pWeek, plain.id) === 1 && pWeek.length === 1 && hoursOf(aWeek, far.id) === 3 && hoursOf(aWeek, plain.id) === 1,
    'a member’s team week is their own row alone, and the admin’s holds everyone',
    `plain sees ${pWeek.length} row(s) (${hoursOf(pWeek, plain.id)}h own); admin: far ${hoursOf(aWeek, far.id)}, plain ${hoursOf(aWeek, plain.id)}`,
  )

  // ══ 5. ONLY THIS WORKSPACE'S HOURS ═══════════════════════════════════════
  console.log('\n▶ the near member’s hours, as the admin sees them here: two here, five in the other workspace')
  const aMonth = await monthly(A)
  chk(
    hoursOf(aWeek, near.id) === 2 && hoursOf(aMonth, near.id) === 2,
    'this workspace’s team week and monthly rollup count the near member’s two hours here — not the five they logged in another workspace',
    `team week ${hoursOf(aWeek, near.id)}h, monthly ${hoursOf(aMonth, near.id)}h`,
  )

  // ══ 6. THE TIME PAGE ═════════════════════════════════════════════════════
  console.log('\n▶ the Time page’s Team view and monthly header, for the manager')
  browser = await (await resolveChromium()).launch(launchOptions())
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } })
  const page = await ctx.newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', manager.email)
  await page.fill('input[type=password]', manager.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
  await page.goto(`${B}/app/${WS}/time`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('time-sheet-team').click({ timeout: 20_000 }).catch(() => {})
  await waitUntil(async () => (await page.getByTestId('time-team-row').count()) > 0, { timeoutMs: 8000 })
  const rows = await page.getByTestId('time-team-row').evaluateAll((els) => els.map((e) => e.getAttribute('data-user-id')))
  await page.getByRole('button', { name: /^Monthly$/ }).first().click().catch(() => {})
  await page.getByText('Monthly timesheet', { exact: true }).first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
  await page.waitForTimeout(800)
  const header = {
    team: await page.getByText(/Last 6 months · your team/).count(),
    everyone: await page.getByText(/Last 6 months · all members/).count(),
  }
  await ctx.close().catch(() => {})
  chk(
    rows.includes(near.id) && rows.includes(plain.id) && !rows.includes(far.id) && header.team === 1 && header.everyone === 0,
    'the Time page’s Team view lists the manager’s team, not the far member, and the monthly header says it is their team’s — not all members’',
    `team rows ${JSON.stringify(rows.map((id) => (id === near.id ? 'near' : id === plain.id ? 'plain' : id === far.id ? 'far' : 'other')))}; header ${JSON.stringify(header)}`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  for (const ws of [WS, WSB]) {
    if (!ws || !A) continue
    const gone = await A(`/workspaces/${ws}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${ws} answered ${gone.status || 'nothing'}`)
  }
  // Only now: the DELETEs above go through this proxy, and a closed one refuses them.
  stack.close()
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}

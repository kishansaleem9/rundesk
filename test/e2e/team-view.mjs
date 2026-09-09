/**
 * §V2-13 — TEAM VIEW, frames `07:10`, `07:40` and `09:25`.
 *
 * Team appears three times in the frames: in the required-views toggle list, in
 * the list's view tabs beside List | Board | Calendar | Gantt, and at `09:25`
 * where ClickUp paywalls it and the paywall teaches what it would show — a
 * member card, a 16/8 load, a 25% donut, and Ready / In Progress / Review.
 *
 * WHY IT IS NOT PAYWALLED HERE. The re-audit recorded this as "the teach-then-
 * offer paywall is wired to one call site", which was true and beside the
 * point: ClickUp gates Team View because it is a paid tier THERE. Imitating
 * the gate would mean offering to unlock something Rundesk did not have. The
 * ask is the view; the view is built; gating it afterwards would be inventing
 * a tier in order to take it away.
 *
 * List export is deliberately left ungated for the mirror-image reason — it
 * sat behind `WorkspaceAdminGuard` and REMOVING that was the fix
 * (`list-export.mjs`). Adding a plan tier now would take a working feature
 * away to match a screenshot.
 *
 * WHAT THESE CHECKS ARE FOR. A view that groups by person is easy to draw and
 * easy to draw wrongly: rows of names photograph identically whether or not
 * the tasks under them are that person's. So the fixture gives three people
 * DIFFERENT loads, one task with TWO assignees, and one with none, and the
 * checks are on the arithmetic each row reports.
 *
 * AGAINST THE REAL STACK, not a stub. The list route reads enough endpoints
 * that a hand-written stub crashes it before the tabs render — which is worth
 * knowing, but is a fact about the stub, not about Team View.
 *
 *   node test/e2e/team-view.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil, readText } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 9

const REPO = path.resolve(import.meta.dirname, '../..')
const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const DIST = path.resolve(REPO, argOf('--dist', 'apps/web/dist'))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
const ME = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${bad ?? good}`) }
}

const apiAs = (token) => async (route, init = {}) => {
  const headers = token ? { authorization: `Bearer ${token}` } : {}
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, {
    ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}

const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
const browser = await chromium.launch(launchOptions())
let sql = null
const TAG = `e2e-team-${Date.now()}`

try {
  const auth = await signInApi(API, ME.email, ME.password)
  const A = apiAs(auth.accessToken)
  const me = (await A('/users/me')).data
  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id

  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — this suite stages assignments directly')

  /*
   * A SECOND REAL PERSON, so "grouped by assignee" has more than one group to
   * be right about. One row would look correct however the grouping worked.
   */
  const mateEmail = `teammate-${Date.now()}@rundesk.invalid`
  const reg = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: mateEmail, displayName: `Omar ${TAG}`, password: 'Teammate@123!' }),
  })
  if (!reg.ok) throw new Error(`could not register a teammate: ${reg.status}`)
  await A(`/workspaces/${workspaceId}/members`, { method: 'POST', body: { email: mateEmail, role: 'member' } })
  const mateId = ((await A(`/workspaces/${workspaceId}/members`)).data ?? [])
    .find((m) => m.email === mateEmail)?.userId

  const [space] = await sql`
    insert into spaces (workspace_id, name) values (${workspaceId}, ${`Space ${TAG}`}) returning id`
  const [project] = await sql`
    insert into projects (space_id, name) values (${space.id}, ${`Project ${TAG}`}) returning id`
  const [list] = await sql`
    insert into lists (project_id, name) values (${project.id}, ${`List ${TAG}`}) returning id`

  /*
   * DELIBERATELY UNEVEN. The admin owns four (two closed), the teammate owns
   * two (none closed), one task belongs to BOTH, and one to nobody. Equal loads
   * would let a view that ignored assignment produce right-looking numbers.
   */
  const mkTask = async (title, closed) => {
    const [row] = await sql`
      insert into tasks (list_id, title, status_category)
      values (${list.id}, ${`${title} ${TAG}`}, ${closed ? 'closed' : 'open'}) returning id`
    return row.id
  }
  const assign = (taskId, userId) => sql`
    insert into task_assignees (task_id, user_id) values (${taskId}, ${userId})
    on conflict do nothing`

  const a1 = await mkTask('Mine one', true)
  const a2 = await mkTask('Mine two', true)
  const a3 = await mkTask('Mine three', false)
  const shared = await mkTask('Shared thing', false)
  await mkTask('Nobody wants this', false)
  for (const id of [a1, a2, a3, shared]) await assign(id, me.id)
  await assign(shared, mateId)
  const mateOwn = await mkTask('Theirs one', false)
  await assign(mateOwn, mateId)

  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
  const page = await ctx.newPage()
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ME.email)
  await page.fill('input[type=password]', ME.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: 30000 })
  await page.goto(`${stack.base}/app/${workspaceId}/${space.id}/${project.id}/${list.id}`, {
    waitUntil: 'domcontentloaded',
  })


  console.log('\n▶ §V2-13 — Team is one of the views `[frame 07:40]`')
  const tabThere = await waitUntil(
    () => page.getByTestId('work-view-tab-type-team').isVisible().catch(() => false),
    { timeoutMs: 20_000 },
  )
  chk(
    tabThere,
    'the list offers a Team view beside the others',
    'there is no Team tab — the frames show it three times and it was not a view type at all',
  )

  await page.getByTestId('work-view-tab-type-team').click()
  const shown = await waitUntil(
    () => page.getByTestId('team-view').isVisible().catch(() => false),
    { timeoutMs: 15_000 },
  )
  chk(shown, 'and choosing it draws the view', 'the Team tab rendered nothing')

  const rows = () => page.locator('[data-testid="team-view-row"]')
  const names = () => page.locator('[data-testid="team-view-name"]').allInnerTexts()

  chk(
    (await rows().count()) === 3,
    'one row per person, plus one for the work nobody owns',
    `there were ${await rows().count()} rows for two people and an unassigned task — ` +
      'dropping the unowned row reports a team as fully allocated while work sits unowned',
  )

  const seen = await names()
  chk(
    seen.some((n) => n.includes('Admin')) && seen.some((n) => n.includes('Omar')),
    'and the rows are the real people, not ids',
    `the rows read ${JSON.stringify(seen)}`,
  )

  /*
   * THE ARITHMETIC. Sara owns four (three of her own plus the shared one) and
   * two are closed; Omar owns two (his own plus the shared one) and none are
   * closed. A view that grouped correctly but counted the whole list would
   * report the same number on every row.
   */
  const loads = await page.locator('[data-testid="team-view-load"]').allInnerTexts()
  chk(
    loads.some((x) => x.includes('2 of 4')),
    'the busiest person’s row counts only their work',
    `the loads read ${JSON.stringify(loads)} — expected one saying "2 of 4" for the admin`,
  )
  chk(
    loads.some((x) => x.includes('0 of 2')),
    'and the next person’s counts only theirs',
    `the loads read ${JSON.stringify(loads)} — expected one saying "0 of 2" for the teammate`,
  )
  /*
   * A task with two assignees is on BOTH plates. The question this view
   * answers is "what is on this person's plate", and shared work is on both —
   * so the rows deliberately do not sum to the list.
   */
  chk(
    loads.some((x) => x.includes('0 of 1')),
    'while the work nobody owns is its own row rather than nowhere',
    `the loads read ${JSON.stringify(loads)} — expected one saying "0 of 1"`,
  )

  const first = await readText(rows().first())
  chk(
    /Admin/.test(first),
    'the busiest person is first',
    `the first row was ${JSON.stringify(first.replace(/\s+/g, ' ').slice(0, 60))}`,
  )
  const last = await readText(rows().last())
  chk(
    !/Admin|Omar/.test(last),
    'and the unowned work is last, whatever its size — it is a gap, not a colleague',
    `the last row was ${JSON.stringify(last.replace(/\s+/g, ' ').slice(0, 60))}`,
  )

  await ctx.close()
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${e.message.split('\n')[0]}`)
} finally {
  if (sql) {
    await sql`delete from tasks where title like ${'%' + TAG}`.catch(() => {})
    await sql`delete from lists where name like ${'%' + TAG}`.catch(() => {})
    await sql`delete from projects where name like ${'%' + TAG}`.catch(() => {})
    await sql`delete from spaces where name like ${'%' + TAG}`.catch(() => {})
    await sql.end({ timeout: 5 }).catch(() => {})
  }
  await browser.close().catch(() => {})
  stack?.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran < EXPECTED_CHECKS) {
    console.log(
      `\n✗ only ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, ` +
        'so "0 failed" describes the part it reached and nothing else.',
    )
    process.exit(1)
  }
  process.exit(failed === 0 ? 0 : 1)
}

/**
 * §V2-13 — TEAM VIEW, frames `07:10`, `07:40` and `09:25`.
 *
 * Team appears three times in the frames: in the required-views toggle list, in
 * the list's view tabs beside List | Board | Calendar | Gantt, and at `09:25`
 * where ClickUp paywalls it and the paywall teaches what it would show — a
 * member card, a 16/8 load, a 25% donut, and Ready / In Progress / Review.
 *
 * IT IS NOW PAYWALLED, AND THE NOTE THAT USED TO BE HERE WAS WRONG. It argued
 * that "the ask is the view; gating it afterwards would be inventing a tier in
 * order to take it away". That is a *stale reason* — the defect class this
 * audit keeps finding, where a written-down justification suppresses exactly
 * the investigation that would overturn it. `[09:26]` is not ambiguous: "Is ke
 * baad TEAM VIEW — yeh cheez ke liye humein of course BUY karna parega", said
 * over a modal with a price on it. The tier was not invented here; it was in
 * the frame the row was written from.
 *
 * The list export stays free, and that is not the mirror-image of this: it is
 * the other half of the same instruction. `[10:49]` "agar aap ke paas premium
 * nahi [hai] to aap LIST VIEW download karo" — see `list-export.mjs`.
 *
 * SO THIS SUITE NOW RUNS AS TWO ACTORS. Everything above the paywall section
 * is the ENTITLED one, and those checks are worth more than they were: the
 * rollup they assert on is computed by the SERVER now, because a paywall over
 * arithmetic a browser does has nothing behind it to refuse. The blocked actor
 * at the bottom is the other half — without it, a Team tab that drew nothing
 * would pass as a paywall. The deeper matrix lives in `paywall-sites.mjs`.
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
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil, readText } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". Exact, so a skipped branch is a failure too. */
const EXPECTED_CHECKS = 13

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
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
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

  /*
   * THE `v` SHORTCUT HAS TO REACH IT TOO, and it could not.
   *
   * The cycler at the list route's `:2204` held its own copy of the view keys
   * — `['list','board','table','calendar','gantt']` — which is the same five
   * `ALL_VIEWS` holds eight hundred lines above it, minus `team`. A fifth copy
   * of one list, one key short. So Team View was drawn in the tab strip, was
   * selectable by mouse, and `v` walked past it forever: present, reachable
   * one way, unreachable the other, and nothing on screen to say so.
   *
   * Pressed enough times to come all the way round, because a cycler that
   * merely MOVES proves nothing — it has to visit every enabled view. The
   * count comes from the tabs the page itself draws, so adding a view type
   * cannot leave this check quietly walking a shorter loop than the product.
   */
  const viewTabs = await page.locator('[data-testid^="work-view-tab-type-"]').evaluateAll((els) =>
    els.map((e) => (e.getAttribute('data-testid') ?? '').replace('work-view-tab-type-', '')),
  )
  /*
   * BLUR, DO NOT CLICK. The cycler ignores keys typed into an input, so focus
   * has to leave one — but the first version of this did it with
   * `body.click({position: {x: 4, y: 4}})`, and the top-left corner of this
   * page is the sidebar. The click navigated off the list route entirely, so
   * there were no view tabs left to read and `visited` came back **empty**:
   * the check failed against a correct build and blamed the cycler. Blurring
   * moves focus without moving the page.
   */
  await page.evaluate(() => document.activeElement?.blur?.())
  const visited = new Set()
  for (let i = 0; i < viewTabs.length + 1; i += 1) {
    await page.keyboard.press('v')
    await page.waitForTimeout(250)
    /*
     * `aria-current`, NOT `data-active`. The first version of this read
     * `[data-active="true"]` and found nothing on any press, so it reported
     * `visited []` against a cycler that works — twice. The `data-active`
     * attribute exists, on a DIFFERENT tab strip inside the list route; the
     * strip this page draws comes from `work-ui.tsx`, which marks the current
     * tab with `aria-current` and nothing else. `paywall-sites.mjs` reads the
     * same attribute on the same testid, which is where this should have been
     * checked before guessing a second time.
     */
    const active = await page
      .locator('[data-testid^="work-view-tab-type-"][aria-current="true"]')
      .first()
      .getAttribute('data-testid')
      .catch(() => null)
    if (active) visited.add(active.replace('work-view-tab-type-', ''))
  }
  chk(
    viewTabs.length > 1 && visited.has('team'),
    `pressing \`v\` reaches every view the list offers, Team included`,
    `the list draws ${JSON.stringify(viewTabs)} and ${viewTabs.length + 1} presses of \`v\` ` +
      `visited ${JSON.stringify([...visited])} — a cycler keeping its own copy of the view keys ` +
      'walks past whichever one that copy is missing, and the tab stays clickable so nothing looks wrong',
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

  /*
   * §V2-13 `[09:26]` — THE OTHER ACTOR.
   *
   * Everything above ran in a workspace whose plan includes Team View, which
   * is what makes the rest of this section readable: the same build, the same
   * person, one column different. A workspace of its own rather than a
   * downgrade of the one above, so a run that dies here cannot leave the
   * shared workspace on a Free plan.
   */
  console.log('\n▶ §V2-13 — and the plan that does not include it `[09:26]`')
  const lockedWs = (await A('/workspaces', { method: 'POST', body: { name: `Locked ${TAG}` } })).data
  if (!lockedWs?.id) throw new Error('could not create the blocked workspace this section is about')
  const lockedSpace = ((await A(`/spaces/workspace/${lockedWs.id}`)).data ?? [])[0]
  const lockedProject = lockedSpace ? ((await A(`/projects/space/${lockedSpace.id}`)).data ?? [])[0] : null
  const lockedList = lockedProject
    ? (await A('/lists', { method: 'POST', body: { projectId: lockedProject.id, name: `Locked list ${TAG}` } })).data
    : null
  if (!lockedList?.id) throw new Error('the blocked workspace came up without a list')
  await A('/tasks', { method: 'POST', body: { listId: lockedList.id, title: `Locked task ${TAG}` } })
  await sql`update workspaces set plan = 'free' where id = ${lockedWs.id}`

  const refused = await A(`/tasks/list/${lockedList.id}/team`)
  chk(
    refused.status === 403,
    'the server refuses the rollup outright on a plan without Team View',
    `GET /tasks/list/:id/team answered ${refused.status} on a Free plan — a gate the browser draws is not a gate`,
  )

  await page.goto(`${stack.base}/app/${lockedWs.id}/${lockedSpace.id}/${lockedProject.id}/${lockedList.id}`, {
    waitUntil: 'domcontentloaded',
  })
  await page.waitForSelector('[data-testid="list-view-controls"]', { timeout: 25_000 })
  await page.waitForTimeout(1200)
  await page.getByTestId('work-view-tab-type-team').click()
  chk(
    await waitUntil(() => page.getByTestId('feature-gate').isVisible().catch(() => false), { timeoutMs: 15_000 }),
    'and pressing Team opens the paywall rather than an empty view',
    'the Team tab on a Free plan drew neither the view nor the gate',
  )
  // The tab must not have become current either: a locked placeholder behind a
  // locked modal is still a tab that navigated when it was told not to.
  const blockedTabCurrent = await page.getByTestId('work-view-tab-type-team').getAttribute('aria-current')
  chk(
    blockedTabCurrent !== 'true' && (await page.getByTestId('team-view').count()) === 0,
    'with the view itself still not on screen, and the tab still not current',
    `aria-current was ${JSON.stringify(blockedTabCurrent)} — the modal is decoration over a feature handed over anyway`,
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
    /*
     * The Free-plan workspace goes too, and it matters more than the rest: it
     * cascades to its own space/project/list, and leaving one behind would put
     * a workspace with a restricted plan in the path of every other suite's
     * `pickWorkspace`.
     */
    await sql`delete from workspaces where name like ${'%' + TAG}`.catch(() => {})
    await sql.end({ timeout: 5 }).catch(() => {})
  }
  await browser.close().catch(() => {})
  stack?.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  /*
   * EXACT, not `<`. With `<`, a branch that silently stopped being reached
   * turns into a shorter run that still passes — which is precisely what would
   * happen if the paywall section below ever stopped executing.
   */
  if (ran !== EXPECTED_CHECKS) {
    console.log(
      `\n✗ ran ${ran} checks, expected exactly ${EXPECTED_CHECKS} — ` +
        'so "0 failed" describes the part it reached and nothing else.',
    )
    process.exit(1)
  }
  process.exit(failed === 0 ? 0 : 1)
}

/**
 * HOME'S "ASSIGNED TO ME" AND "TODAY & OVERDUE", AND THE READ BEHIND THEM.
 *
 * NOT A FRAME ROW: `product-siblings/home-today-overdue-includes-closed`, on
 * `GET /tasks/workspace/:ws/members/:userId`. "Today & overdue" kept every task
 * with a past due date, finished or not; "Assigned to me" left out status KEYS
 * `done` and `cancelled`, which are renamable; closed tasks took places under a
 * limit of 100 by last update; and a failed read showed "no tasks". (A binned
 * task is archived too, so it was never listed; the check keeps it that way.) (Whose tasks a caller may read at all is
 * `workspace-read-access`.)
 *
 * The API half reads the member's own list; the screen half signs in as the
 * member and reads Home.
 *
 *   node test/e2e/home-my-work.mjs --api 3021 --dist /tmp/claude-0/dist-1
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
const EXPECTED_CHECKS = 7

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
const API = `http://127.0.0.1:${API_PORT}/api/v1`
const ADMIN = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}
const PERSON_PASSWORD = 'Member@12345!'

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.error ?? null).slice(0, 120)}`

const stamp = Date.now()
const TAG = `hmw-${stamp}`
const day = 24 * 60 * 60 * 1000
const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
let sql = null
let browser = null
let WS = null
let A = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the finished and private tasks are staged by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id

  const person = async (label, role) => {
    const email = `${TAG}-${label}@rundesk.invalid`
    const data = await signUpApi(API, {
      fullName: `Home ${label}`, email, password: PERSON_PASSWORD,
      organizationName: `Home ${label} ${stamp}`, organizationSlug: `home-${label}-${stamp}`,
    })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (added.status >= 300) throw new Error(`could not add the ${label}: ${said(added)}`)
    return { email, id: data.user?.id, call: apiAs(data.accessToken) }
  }
  const member = await person('member', 'member')

  const make = async (route, body, what) => {
    const res = await A(route, { method: 'POST', body })
    if (res.status >= 300 || !res.data?.id) throw new Error(`could not make ${what}: ${said(res)}`)
    return res.data.id
  }
  const listIn = async (spaceBody, what) => {
    const space = await make('/spaces', { workspaceId: WS, ...spaceBody }, `${what} space`)
    const project = await make('/projects', { spaceId: space, name: `${TAG} ${what}` }, `${what} project`)
    return make('/lists', { projectId: project, name: `${TAG} ${what} list` }, `${what} list`)
  }
  const OPEN_LIST = await listIn({ name: `${TAG} open` }, 'open')
  const task = (listId, title, assignee, dueInDays) =>
    make('/tasks', {
      listId, title: `${TAG} ${title}`, assigneeIds: [assignee],
      ...(dueInDays == null ? {} : { dueDate: new Date(Date.now() + dueInDays * day).toISOString() }),
    }, title)

  // The member's own work. Finished ones are closed by SQL: in a status the
  // screen shows by KEY, and one whose key is not `done` at all.
  const OVERDUE = await task(OPEN_LIST, 'overdue and open', member.id, -3)
  const LATER = await task(OPEN_LIST, 'due next week', member.id, 5)
  const UNDATED = await task(OPEN_LIST, 'no date', member.id, null)
  const DONE = await task(OPEN_LIST, 'overdue and done', member.id, -3)
  const SHIPPED = await task(OPEN_LIST, 'overdue and shipped', member.id, -1)
  const BINNED = await task(OPEN_LIST, 'overdue and binned', member.id, -2)
  const MINE_PRIVATE = await task(OPEN_LIST, 'private, assigned to the member', member.id, null)
  await sql`update tasks set status = 'done', status_category = 'closed' where id = ${DONE}`
  await sql`update tasks set status = 'shipped', status_category = 'closed' where id = ${SHIPPED}`
  await sql`update tasks set visibility = 'private' where id = ${MINE_PRIVATE}`
  const binned = await A(`/tasks/${BINNED}/trash`, { method: 'POST' })
  if (binned.status >= 300) throw new Error(`could not put a task in the Trash: ${said(binned)}`)

  const ids = (res) => (res.data ?? []).map((t) => t.id)

  // ══ 1. OPEN WORK, SOONEST FIRST ══════════════════════════════════════════
  console.log('\n▶ a member’s list is their open work, soonest due first')

  const own = await member.call(`/tasks/workspace/${WS}/members/${member.id}`)
  const ownIds = ids(own)
  chk(
    own.status === 200 && [OVERDUE, LATER, UNDATED].every((id) => ownIds.includes(id)) &&
      ![DONE, SHIPPED, BINNED].some((id) => ownIds.includes(id)),
    'nothing finished, whatever its closed status is called, and nothing in the Trash',
    `it answered ${own.status}; finished or binned still listed: ` +
      `${JSON.stringify((own.data ?? []).filter((t) => [DONE, SHIPPED, BINNED].includes(t.id)).map((t) => t.title))}`,
  )
  chk(
    ownIds.includes(MINE_PRIVATE),
    'while a private task assigned to the member is on the member’s own list',
    'the member cannot read a private task they are assigned — the private-item rule lets an assignee see it',
  )
  const order = [OVERDUE, LATER, UNDATED].map((id) => ownIds.indexOf(id))
  const cut = await member.call(`/tasks/workspace/${WS}/members/${member.id}?limit=1`)
  chk(
    order.every((i) => i >= 0) && order[0] < order[1] && order[1] < order[2] &&
      ids(cut).length === 1 && ids(cut)[0] === OVERDUE,
    'soonest due first, undated last — so a limit cuts the least urgent',
    `the three came back at positions ${JSON.stringify(order)}; ?limit=1 answered ${JSON.stringify((cut.data ?? []).map((t) => t.title))}`,
  )

  // ══ 2. ON HOME ═══════════════════════════════════════════════════════════
  console.log('\n▶ Home lists and counts the same, and says so when it cannot')

  browser = await chromium.launch(launchOptions())
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', member.email)
  await page.fill('input[type=password]', PERSON_PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})

  const rowsIn = async (section) => {
    await page.goto(`${stack.base}/app/${WS}?section=${section}`, { waitUntil: 'domcontentloaded' })
    const box = page.getByTestId(`home-section-${section}`)
    await waitUntil(async () => (await box.getByTestId('home-task-row').count()) > 0, { timeoutMs: 20_000 })
    return box.getByTestId('home-task-row').evaluateAll((els) => els.map((e) => e.getAttribute('data-task-id')))
  }
  const countOf = async (testId) =>
    (await page.getByTestId(`${testId}-count`).filter({ visible: true }).innerText({ timeout: 5000 }).catch(() => '')).trim()

  const assigned = await rowsIn('assigned-to-me')
  const assignedCount = await countOf('home-nav-assigned-to-me')
  const wantAssigned = [OVERDUE, LATER, UNDATED, MINE_PRIVATE]
  chk(
    wantAssigned.every((id) => assigned.includes(id)) && ![DONE, SHIPPED, BINNED].some((id) => assigned.includes(id)) &&
      assignedCount === String(assigned.length),
    '“Assigned to me” lists the member’s open work and counts it — the task in a status called “shipped” is not there',
    `it lists ${assigned.length} row(s) (finished or binned among them: ${[DONE, SHIPPED, BINNED].filter((id) => assigned.includes(id)).length}), ` +
      `counted "${assignedCount}"`,
  )

  const today = await rowsIn('today-overdue')
  const todayCount = await countOf('home-nav-today-overdue')
  chk(
    today.includes(OVERDUE) && ![DONE, SHIPPED, BINNED, LATER, UNDATED].some((id) => today.includes(id)) &&
      todayCount === String(today.length),
    '“Today & overdue” lists what is due by today and still open, and counts it',
    `it lists ${today.length} row(s), counted "${todayCount}"; finished, binned or not yet due among them: ` +
      `${[DONE, SHIPPED, BINNED, LATER, UNDATED].filter((id) => today.includes(id)).length}`,
  )

  /*
   * A FAILED READ. The route is HELD to a 500 and the flag proves it fired: a
   * route the page never used would leave the real answer on screen and pass.
   */
  let refused = false
  await ctx.route('**/tasks/workspace/*/members/*', async (route) => {
    refused = true
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ data: null, error: { message: 'down' } }) }).catch(() => {})
  })
  await page.goto(`${stack.base}/app/${WS}?section=assigned-to-me`, { waitUntil: 'domcontentloaded' })
  const saidFailed = await waitUntil(() => page.getByTestId('home-tasks-failed').isVisible().catch(() => false), { timeoutMs: 20_000 })
  const emptyShown = await page.getByText(/Tasks that match this section will appear here/i).count()
  chk(
    refused && saidFailed && emptyShown === 0,
    'a read that failed says so, instead of “no tasks”',
    `the route ${refused ? 'refused the read' : 'never saw the read'}; the failure line ${saidFailed ? 'showed' : 'did not show'}; ` +
      `the empty state showed ${emptyShown} time(s)`,
  )
  await ctx.unroute('**/tasks/workspace/*/members/*').catch(() => {})

  /*
   * AND A LIST THAT WAS CUT. The server limit is measured above (?limit=1);
   * this is what the page draws when the answer runs to the limit. 501 rows
   * of the answer's own shape, and the flag again.
   */
  let answered = false
  const many = Array.from({ length: 501 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    title: `${TAG} bulk ${i}`, status: 'to do', statusCategory: 'active', dueDate: null,
    listId: OPEN_LIST, listName: 'bulk', projectId: '00000000-0000-4000-8000-000000000000', spaceId: '00000000-0000-4000-8000-000000000000',
  }))
  await ctx.route('**/tasks/workspace/*/members/*', async (route) => {
    answered = true
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: many, error: null }) }).catch(() => {})
  })
  await page.goto(`${stack.base}/app/${WS}?section=assigned-to-me`, { waitUntil: 'domcontentloaded' })
  await waitUntil(async () => (await countOf('home-nav-assigned-to-me')) !== '', { timeoutMs: 20_000 })
  const cutCount = await countOf('home-nav-assigned-to-me')
  const cutRows = await page.getByTestId('home-task-row').count()
  chk(
    answered && cutCount === '500+' && cutRows === 500,
    'a list that ran to the limit is counted “500+”, not a confident 500',
    `the route ${answered ? 'answered' : 'never saw the read'}; counted "${cutCount}" over ${cutRows} row(s)`,
  )
  await ctx.unroute('**/tasks/workspace/*/members/*').catch(() => {})
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  if (WS && A) {
    const gone = await A(`/workspaces/${WS}`, { method: 'DELETE' }).catch(() => ({ status: 0 }))
    if (gone.status >= 300 || gone.status === 0) console.log(`  \x1b[33mnote\x1b[0m cleanup answered ${gone.status}`)
  }
  await browser?.close().catch(() => {})
  await sql?.end?.({ timeout: 5 })
  stack?.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}

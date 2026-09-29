/**
 * §V2-S14 — THE PLANNER RAIL, frame `13:05`.
 *
 * The frame lists five sections down the left of the Planner:
 *
 *     Priorities · Meet with · Assigned to me › · Today & overdue › · Backlog
 *
 * Rundesk drew three. The page's own header comment described all five, so the
 * file documented the gap for as long as it had it.
 *
 * THE BUG UNDERNEATH, which is the reason this suite talks to the real API.
 * The planner asked for its assigned tasks at
 * `/tasks/workspace/:ws/member/:id` — singular. The API serves `/members/`.
 * Every load answered 404, so `assigned` was permanently `[]`: the Backlog rail
 * was always empty, and the two Time-blocking switches that gate that list were
 * gating nothing, in the running product, after the commit whose title was
 * about making those switches work.
 *
 * IT SURVIVED BECAUSE THE SUITES STUBBED THE CLIENT'S SPELLING.
 * `planner-grid.mjs` and `planner-settings.mjs` both contained
 *
 *     if (url.includes('/member/')) return reply(ASSIGNED)
 *
 * which implements a route the API does not have. A check written against that
 * can never fail on the real product, however carefully it is phrased. So the
 * first check here is not about the rail at all: it watches the request the
 * page actually makes, against the real API, and fails if it 404s. That is the
 * one assertion in this file a stub could not have satisfied, and it is the one
 * that would have caught the original bug.
 *
 * The sixth duplicated-list bug lives here too: the page kept its own
 * `['priorities', 'meetWith', 'backlog']` default instead of importing
 * `RAIL_SECTIONS`. It agreed by luck, and the luck would have run out on this
 * commit — two new names in the constant, two new checkboxes on the Sidebar
 * page, and a rail that never drew them.
 *
 *   node test/e2e/planner-rail.mjs --api 3011 --dist apps/web/dist
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

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 10

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
  // The SENTENCE, then the reason. This printed `${bad ?? good}`, so a failing
  // check named only its reason and never itself — and for a check inside a
  // loop the reason is all a reader (or `check-break-reddened.mjs`) has to go
  // on. Seventy suites shared the line.
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` \u2014 ${bad}` : ''}`) }
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
const TAG = `e2e-rail-${Date.now()}`

try {
  const auth = await signInApi(API, ME.email, ME.password)
  const A = apiAs(auth.accessToken)
  const me = (await A('/users/me')).data
  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id

  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — this suite stages assigned work directly')

  const [space] = await sql`
    insert into spaces (workspace_id, name) values (${workspaceId}, ${`Space ${TAG}`}) returning id`
  const [project] = await sql`
    insert into projects (space_id, name) values (${space.id}, ${`Project ${TAG}`}) returning id`
  const [list] = await sql`
    insert into lists (project_id, name) values (${project.id}, ${`List ${TAG}`}) returning id`

  /*
   * Four tasks that separate the two new sections from each other and from
   * Backlog. Same-shaped fixtures would let a rail that drew the same list
   * three times look right.
   */
  const mk = async (title, dueOffsetDays, closed = false) => {
    const due =
      dueOffsetDays === null
        ? null
        : (() => {
            const d = new Date()
            d.setDate(d.getDate() + dueOffsetDays)
            d.setHours(12, 0, 0, 0)
            return d.toISOString()
          })()
    const [row] = await sql`
      insert into tasks (list_id, title, due_date, status_category)
      values (${list.id}, ${`${title} ${TAG}`}, ${due}, ${closed ? 'closed' : 'open'})
      returning id`
    await sql`insert into task_assignees (task_id, user_id) values (${row.id}, ${me.id})
      on conflict do nothing`
    return row.id
  }
  await mk('Late thing', -3)
  await mk('Due today thing', 0)
  await mk('Next week thing', 7)
  await mk('Finished thing', -1, true)

  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
  const page = await ctx.newPage()

  /*
   * WATCH THE REAL REQUEST. Recorded before navigation so nothing is missed,
   * and matched on the shape of the URL rather than on any one spelling — the
   * point is to catch whatever the page asks for, including a path that does
   * not exist.
   */
  const assignedCalls = []
  page.on('response', (res) => {
    const url = res.url()
    if (/\/tasks\/workspace\/[^/]+\/members?\//.test(url)) {
      assignedCalls.push({ url, status: res.status() })
    }
  })

  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ME.email)
  await page.fill('input[type=password]', ME.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  // `/app/:workspaceId/calendar` — the planner is workspace-scoped.
  await page.goto(`${stack.base}/app/${workspaceId}/calendar`, { waitUntil: 'domcontentloaded' })
  await waitUntil(
    () => page.getByTestId('planner-backlog').isVisible().catch(() => false),
    { timeoutMs: 25_000 },
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ the assigned-tasks call the page actually makes')

  await waitUntil(() => assignedCalls.length > 0, { timeoutMs: 15_000 })
  chk(
    assignedCalls.length > 0,
    'the planner asks the API for the work assigned to you',
    'the planner never requested its assigned tasks at all',
  )
  chk(
    assignedCalls.length > 0 && assignedCalls.every((c) => c.status === 200),
    'and the API answers it',
    `it answered ${assignedCalls.map((c) => c.status).join(', ')} — ` +
      `requested ${assignedCalls.map((c) => c.url.replace(/^.*\/api\/v1/, '')).join(', ')}. ` +
      'A 404 here empties the Backlog and every rail section built on it, silently.',
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ frame `13:05` — five sections, in the order the frame lists them')

  const sectionOrder = await page.$$eval(
    'aside section[data-testid]',
    (nodes) => nodes.map((n) => n.getAttribute('data-testid')),
  )
  chk(
    sectionOrder.includes('planner-assigned'),
    'the rail has an "Assigned to me" section',
    `the rail sections were: ${sectionOrder.join(' → ') || '(none)'}`,
  )
  chk(
    sectionOrder.includes('planner-today-overdue'),
    'and a "Today & overdue" section',
    `the rail sections were: ${sectionOrder.join(' → ') || '(none)'}`,
  )
  chk(
    sectionOrder.indexOf('planner-assigned') < sectionOrder.indexOf('planner-today-overdue') &&
      sectionOrder.indexOf('planner-today-overdue') < sectionOrder.indexOf('planner-backlog'),
    'in the frame\'s order — Assigned to me, then Today & overdue, then Backlog',
    `the order was: ${sectionOrder.join(' → ')}`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ each section holds what its name says')

  const textsIn = async (testid) =>
    (await page.getByTestId(testid).allInnerTexts()).map((s) => s.toLowerCase())

  const assignedItems = await textsIn('planner-assigned-item')
  chk(
    assignedItems.some((t) => t.includes('late thing')) &&
      assignedItems.some((t) => t.includes('next week thing')),
    '"Assigned to me" holds the work assigned to you whenever it is due',
    `it held: ${assignedItems.join(' | ') || '(nothing)'}`,
  )
  chk(
    assignedItems.length > 0 && !assignedItems.some((t) => t.includes('finished thing')),
    'and leaves out what is already finished',
    'a closed task was listed as assigned work still to do',
  )

  const todayItems = await textsIn('planner-today-overdue-item')
  chk(
    todayItems.some((t) => t.includes('late thing')) &&
      todayItems.some((t) => t.includes('due today thing')),
    '"Today & overdue" holds both the late work and today\'s',
    `it held: ${todayItems.join(' | ') || '(nothing)'}`,
  )
  /*
   * THE DISCRIMINATING ONE. A section that just re-drew the assigned list would
   * pass the check above and be wrong: what makes it "Today & overdue" is what
   * it LEAVES OUT.
   */
  chk(
    todayItems.length > 0 && !todayItems.some((t) => t.includes('next week thing')),
    'and leaves out work that is not due yet',
    'a task due next week was listed under "Today & overdue" — the section is ' +
      'just the assigned list under a different heading',
  )

  const lateFlags = await page.$$eval(
    '[data-testid="planner-today-overdue-item"]',
    (nodes) => nodes.map((n) => [n.textContent?.toLowerCase() ?? '', n.getAttribute('data-late')]), // text-read: key — names the row; the check is on data-late
  )
  chk(
    lateFlags.some(([txt, late]) => txt.includes('late thing') && late === 'true') &&
      lateFlags.some(([txt, late]) => txt.includes('due today thing') && late === 'false'),
    'and it says which are late and which are merely due',
    `the rows read: ${JSON.stringify(lateFlags)} — one heading over two very ` +
      'different situations tells you how many things there are and nothing else',
  )
} catch (err) {
  failed += 1
  console.error('\n\x1b[31mSUITE ERROR\x1b[0m', err)
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
  if (ran !== EXPECTED_CHECKS) {
    console.log(
      `\n✗ only ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, ` +
        'so "0 failed" describes the part it reached and nothing else.',
    )
    process.exit(1)
  }
  process.exit(failed === 0 ? 0 : 1)
}

/**
 * THE FIVE VIEW TYPES A LIST HAD ONLY AS NAMES (`commit-log/log-68bc188-1`,
 * `ledger-rows/row-777`): Activity, Workload, Timeline, Mind Map and Map, as
 * ClickUp has them (frame `07:10`, "Default settings for views", lists all
 * eleven; the help centre's pages on each, read through search excerpts on 13
 * October, are summed up in `docs/clickup-research.md` §2a–2e).
 *
 * Every check reads the server's answer or the database, never only the page
 * that drew it, and every view is driven the way a person drives it:
 *
 *   1. ACTIVITY — the list's feed, newest first: another list's comment is not
 *      in it, the activity filter keeps one kind and its count is the filter's,
 *      a search keeps one task, a private task its reader may not open leaves
 *      nothing, Me Mode keeps the reader's tasks, and sixty entries page as
 *      fifty and ten. The tab draws it under Today.
 *   2. WORKLOAD — a two-day 8h task is 4h on each day of its assignee; a task
 *      with no estimate adds nothing and is listed; by Tasks a task counts on
 *      each of its days; closing a task by a status of its own name (not
 *      "done") takes its hours away, here and on the workspace page.
 *   3. TIMELINE — bars by assignee; a drag along the row moves both dates, a
 *      drag onto another person's row reassigns; an unscheduled task dropped on
 *      a day is due that day; grouped by status, a task is on its status.
 *   4. MIND MAP — a node per task and subtask; "+" makes a subtask; a drop
 *      makes one task another's subtask, and a drop the server refuses leaves
 *      the tree as the server has it.
 *   5. MAP — a Location's address is placed by the geocoder as it is saved, a
 *      marker at that point, tiles asked of the tile server; an address it
 *      cannot place is listed aside with its words.
 *   6. And the space's view settings decide which of the tabs a list draws.
 *
 * The geocoder and the tiles are the lane's media stub (`media-stub.mjs`,
 * GEOCODER_URL and MAP_TILES_URL in `lane_media_env`).
 *
 *   node test/e2e/list-views.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt, madeWorkspace } from './lib/fixture.mjs'
import { waitUntil } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

const EXPECTED_CHECKS = 32

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
const ADMIN = { email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal', password: process.env.E2E_PASSWORD ?? 'Admin@123!' }

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

const stamp = Date.now()
const TAG = `lv${stamp}`
const PASSWORD = 'ListViews@12345!'
const ALL_VIEWS = ['list', 'board', 'table', 'calendar', 'gantt', 'team', 'activity', 'workload', 'timeline', 'mindmap', 'map']
const NEW_VIEWS = ['activity', 'workload', 'timeline', 'mindmap', 'map']

/** The reader's own calendar day, `YYYY-MM-DD`, `n` days from today. */
const dayOf = (n = 0) => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
/** A date-only instant, as a task's date with no time is kept. */
const dateOnly = (n) => `${dayOf(n)}T00:00:00.000Z`
const ymd = (iso) => (typeof iso === 'string' ? iso.slice(0, 10) : null)

const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
const apiAs = apiAsAt(API, { emptyBodyOn: ['POST'] })
const said = (res) => `${res.status} ${JSON.stringify(res.message || null)}`
const must = (res, what) => {
  if (!res.ok || !res.data) throw new Error(`could not ${what}: ${said(res)}`)
  return res.data
}

let sql = null
let browser = null
let WS = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the feed is counted by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  const A = apiAs(auth.accessToken)
  const [me] = await sql`select id from users where lower(email) = lower(${ADMIN.email})`
  WS = must(await A('/workspaces', { method: 'POST', body: { name: `List views ${TAG}` } }), 'make the workspace').id
  madeWorkspace(WS)
  const email = `${TAG}-mia@rundesk.invalid`
  const signed = await signUpApi(API, { fullName: `Mia ${stamp}`, email, password: PASSWORD, organizationName: `Views mia ${stamp}`, organizationSlug: `views-mia-${stamp}` })
  must(await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'member' } }), 'add Mia')
  const [miaRow] = await sql`select id from users where email = ${email}`
  const mia = { id: miaRow.id, api: apiAs(signed.accessToken) }
  const M = mia.api

  const space = must(await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} views`, viewConfig: { enabledViews: ALL_VIEWS, defaultView: 'list' } } }), 'make the space')
  const project = must(await A('/projects', { method: 'POST', body: { spaceId: space.id, name: `${TAG} work` } }), 'make the folder')
  const L = must(await A('/lists', { method: 'POST', body: { projectId: project.id, name: `${TAG} launch` } }), 'make the list').id
  const OTHER = must(await A('/lists', { method: 'POST', body: { projectId: project.id, name: `${TAG} elsewhere` } }), 'make the other list').id
  const PAGING = must(await A('/lists', { method: 'POST', body: { projectId: project.id, name: `${TAG} paging` } }), 'make the paging list').id

  const task = async (api, body, what) => must(await api('/tasks', { method: 'POST', body }), what).id
  const T1 = await task(A, { listId: L, title: `Plan the launch ${TAG}`, startDate: dateOnly(0), dueDate: dateOnly(1), timeEstimate: 8 * 3600, assigneeIds: [mia.id] }, 'make the two-day task')
  const T2 = await task(A, { listId: L, title: `Book the venue ${TAG}` }, 'make the unscheduled task')
  const T3 = await task(A, { listId: L, title: `Write the brief ${TAG}`, startDate: dateOnly(0), dueDate: dateOnly(2), assigneeIds: [mia.id] }, 'make the unestimated task')
  const T4 = await task(A, { listId: L, title: `Secret plans ${TAG}` }, 'make the private task')
  must(await A(`/tasks/${T4}`, { method: 'PATCH', body: { visibility: 'private' } }), 'make the task private')
  const T5 = await task(A, { listId: L, title: `Admin errand ${TAG}`, startDate: dateOnly(0), dueDate: dateOnly(0), assigneeIds: [me.id] }, 'make the admin’s task')
  const T6 = await task(A, { listId: L, title: `Ship the kit ${TAG}`, startDate: dateOnly(3), dueDate: dateOnly(3), timeEstimate: 2 * 3600, assigneeIds: [mia.id] }, 'make the task to close')
  const S1 = await task(A, { listId: L, title: `Draft the agenda ${TAG}`, parentTaskId: T1 }, 'make the subtask')
  const ELSE = await task(A, { listId: OTHER, title: `Elsewhere ${TAG}`, startDate: dateOnly(0), dueDate: dateOnly(1), timeEstimate: 6 * 3600, assigneeIds: [mia.id] }, 'make the other list’s task')
  must(await A(`/tasks/${ELSE}/comments`, { method: 'POST', body: { body: `Over there ${TAG}` } }), 'comment in the other list')
  must(await A(`/tasks/${T1}/comments`, { method: 'POST', body: { body: `First thoughts ${TAG}` } }), 'comment on the task')
  must(await A(`/tasks/${T3}/comments`, { method: 'POST', body: { body: `Outline ready ${TAG}` } }), 'comment on the brief')
  const statuses = must(await A(`/lists/${L}/statuses`), 'read the list’s statuses')
  const working = statuses.find((s) => s.category === 'in_progress') ?? statuses.find((s) => s.category === 'open' && s.position > 0)
  if (!working) throw new Error(`no status to move to among ${JSON.stringify(statuses.map((s) => s.key))}`)
  must(await A(`/tasks/${T1}`, { method: 'PATCH', body: { status: working.key } }), 'change the task’s status')

  // ══ 1. ACTIVITY ═══════════════════════════════════════════════════════════
  console.log('\n▶ the list’s Activity view')
  const feed = (api, q = '') => api(`/lists/${L}/activity${q}`)
  const adminFeed = await feed(A, '?limit=100')
  const items = adminFeed.data?.items ?? []
  chk(
    adminFeed.ok && items[0]?.action === 'status_changed' && items[0]?.taskId === T1,
    'the newest entry of the list’s feed is the status change just made, on its task',
    `${said(adminFeed)}, first ${JSON.stringify(items[0] ?? null)}`,
  )
  chk(
    adminFeed.ok && items.length > 0 && !items.some((i) => i.taskId === ELSE),
    'a comment in another list is never in this list’s feed',
    `${items.filter((i) => i.taskId === ELSE).length} entries of the other list’s task`,
  )
  const commented = await feed(A, '?action=commented&limit=100')
  const kinds = await A(`/lists/${L}/activity/actions`)
  const offered = (kinds.data ?? []).find((k) => k.action === 'commented')?.count
  const onlyComments = (commented.data?.items ?? []).every((i) => i.action === 'commented')
  chk(
    commented.ok && kinds.ok && onlyComments && (commented.data?.items ?? []).length === 2 && offered === 2,
    'the activity filter keeps only comments, and their number is the count the filter offers',
    `${(commented.data?.items ?? []).length} entries (${onlyComments ? 'all comments' : 'not all comments'}), the filter offered ${offered}`,
  )
  const searched = await feed(A, `?q=${encodeURIComponent(`Write the brief ${TAG}`)}&limit=100`)
  const searchedIds = new Set((searched.data?.items ?? []).map((i) => i.taskId))
  chk(
    searched.ok && searchedIds.size === 1 && searchedIds.has(T3),
    'a search for one task’s title keeps only that task’s entries',
    `${said(searched)}, tasks ${JSON.stringify([...searchedIds])}`,
  )
  const miaFeed = await feed(M, '?limit=100')
  chk(
    miaFeed.ok && items.some((i) => i.taskId === T4) && !(miaFeed.data?.items ?? []).some((i) => i.taskId === T4),
    'a private task the reader may not open leaves no entry in their feed — the admin’s feed holds it',
    `${said(miaFeed)}, admin sees ${items.filter((i) => i.taskId === T4).length}, Mia sees ${(miaFeed.data?.items ?? []).filter((i) => i.taskId === T4).length}`,
  )
  const meMode = await feed(M, '?me=true&limit=100')
  const meIds = new Set((meMode.data?.items ?? []).map((i) => i.taskId))
  chk(
    meMode.ok && meIds.size > 0 && [...meIds].every((id) => [T1, T3, T6].includes(id)) && meIds.has(T1),
    'Me Mode keeps only the tasks assigned to the reader',
    `${said(meMode)}, tasks ${JSON.stringify([...meIds])}`,
  )
  const P = await task(A, { listId: PAGING, title: `Paging ${TAG}` }, 'make the paging task')
  for (let i = 0; i < 59; i++) must(await A(`/tasks/${P}/comments`, { method: 'POST', body: { body: `note ${i} ${TAG}` } }), `comment ${i}`)
  const [{ n: total }] = await sql`select count(*)::int as n from task_activity where task_id = ${P}`
  const page1 = await A(`/lists/${PAGING}/activity?limit=50`)
  const page2 = page1.data?.nextBefore ? await A(`/lists/${PAGING}/activity?limit=50&before=${page1.data.nextBefore}`) : null
  const paged = [...(page1.data?.items ?? []), ...(page2?.data?.items ?? [])].map((i) => i.id)
  chk(
    total > 50 && (page1.data?.items ?? []).length === 50 && page2?.ok && page2.data?.nextBefore === null && paged.length === total && new Set(paged).size === total,
    'sixty entries page as fifty and ten, none twice, none lost',
    `${total} entries; pages of ${(page1.data?.items ?? []).length} and ${(page2?.data?.items ?? []).length}, ${new Set(paged).size} distinct`,
  )
  const unknown = await feed(A, '?action=renamed_by_magic')
  chk(unknown.status === 400, 'an activity that is not one is refused (400)', said(unknown))

  // ── the page ──
  const chromium = await resolveChromium()
  browser = await chromium.launch(launchOptions())
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  page.setDefaultTimeout(15_000)
  const tilesAsked = []
  page.on('request', (r) => { if (/\/tiles\/\d+\/\d+\/\d+\.svg$/.test(r.url())) tilesAsked.push(r.url()) })
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ADMIN.email)
  await page.fill('input[type=password]', ADMIN.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  const LIST_URL = `${B}/app/${WS}/${space.id}/${project.id}/${L}`
  const openView = async (view) => {
    // Bounded: a tab a patch takes away fails the check that reads its view, not the run (`lv-26`).
    await page.getByTestId(`work-view-tab-type-${view}`).click({ timeout: 15_000 }).catch(() => {})
  }
  await page.goto(LIST_URL, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('work-view-tab-type-list').waitFor({ timeout: 25_000 })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 2000 }).catch(() => {})

  await openView('activity')
  const rows = page.getByTestId('activity-view-row')
  await rows.first().waitFor({ timeout: 15_000 }).catch(() => {})
  const firstRow = {
    action: await rows.first().getAttribute('data-action').catch(() => null),
    task: await rows.first().getAttribute('data-task-id').catch(() => null),
  }
  const firstDay = await page.getByTestId('activity-view-day').first().getAttribute('data-day').catch(() => null)
  const drawn = await rows.count()
  chk(
    firstRow.action === 'status_changed' && firstRow.task === T1 && firstDay === dayOf(0) && drawn === Math.min(50, items.length),
    'the Activity tab draws the feed newest first, under Today, the status change on top',
    `first row ${JSON.stringify(firstRow)} under ${firstDay}; ${drawn} rows for the server’s ${items.length}`,
  )
  await page.getByTestId('activity-view-search').fill(`Write the brief ${TAG}`, { timeout: 10_000 }).catch(() => {})
  let narrowed = []
  await waitUntil(async () => {
    narrowed = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-task-id')))
    return narrowed.length > 0 && narrowed.every((id) => id === T3)
  }, { timeoutMs: 10_000 })
  chk(
    narrowed.length > 0 && narrowed.every((id) => id === T3),
    'its search narrows the rows to that task’s',
    `rows of ${JSON.stringify([...new Set(narrowed)])}`,
  )

  // ══ 2. WORKLOAD ═══════════════════════════════════════════════════════════
  console.log('\n▶ the list’s Workload view')
  const load = (list, q = '') => A(`/lists/${list}/workload?start=${dayOf(0)}&days=14${q}`)
  const hours = await load(L)
  const miaHours = (hours.data?.members ?? []).find((m) => m.userId === mia.id)
  const days = miaHours?.dailyLoads ?? []
  chk(
    hours.ok && days[0] === 4 && days[1] === 4 && days[3] === 2 && days.filter((v, i) => v !== 0 && i !== 0 && i !== 1 && i !== 3).length === 0,
    'a two-day 8h task puts 4h on each of its assignee’s two days, and nothing elsewhere',
    `${said(hours)}, Mia’s days ${JSON.stringify(days)}`,
  )
  const other = await load(OTHER)
  chk(
    other.ok && (hours.data?.members ?? []).length > 0 && !(other.data?.members ?? []).some((m) => m.tasks.some((t) => t.taskId === T1)) &&
      (other.data?.members ?? []).some((m) => m.tasks.some((t) => t.taskId === ELSE)),
    'another list’s Workload has none of it, and has its own',
    `${said(other)}, ${JSON.stringify((other.data?.members ?? []).map((m) => m.tasks.map((t) => t.taskId)))}`,
  )
  chk(
    hours.ok && (hours.data?.noEstimate ?? []).some((t) => t.taskId === T3) && miaHours?.total === 10,
    'a task with no estimate is listed under No estimate and adds no hours',
    `no estimate ${JSON.stringify((hours.data?.noEstimate ?? []).map((t) => t.taskId))}, Mia’s total ${miaHours?.total}`,
  )
  const counted = await load(L, '&measure=tasks')
  const miaTasks = (counted.data?.members ?? []).find((m) => m.userId === mia.id)?.dailyLoads ?? []
  chk(
    counted.ok && miaTasks[0] === 2 && miaTasks[1] === 2 && miaTasks[2] === 1 && miaTasks[3] === 1,
    'by Tasks, a task counts once on every day of its span',
    `${said(counted)}, Mia’s days ${JSON.stringify(miaTasks)}`,
  )
  const page14 = await A(`/workspaces/${WS}/reports/workload?days=14`)
  const miaPage = (page14.data ?? []).find((m) => m.userId === mia.id)
  chk(
    page14.ok && miaPage?.estimatedHours === 16 && miaPage?.unestimatedTasks === 1,
    'the workspace page counts the same hours and says which tasks it does not count',
    `${said(page14)}, Mia ${JSON.stringify(miaPage ? { estimatedHours: miaPage.estimatedHours, unestimated: miaPage.unestimatedTasks } : null)}`,
  )
  const shipped = must(await A(`/lists/${L}/statuses`, { method: 'POST', body: { name: `Shipped ${stamp}`, category: 'closed' } }), 'make a closed status of its own name')
  must(await A(`/tasks/${T6}`, { method: 'PATCH', body: { status: shipped.key } }), 'close the task')
  const afterClose = await load(L)
  const afterPage = await A(`/workspaces/${WS}/reports/workload?days=14`)
  const miaAfter = (afterClose.data?.members ?? []).find((m) => m.userId === mia.id)
  chk(
    afterClose.ok && miaAfter?.dailyLoads?.[3] === 0 && miaAfter?.total === 8 &&
      (afterPage.data ?? []).find((m) => m.userId === mia.id)?.estimatedHours === 14,
    'closed by a status of its own name, its hours leave the view and the workspace page',
    `status ${shipped.key}; Mia’s day 3 ${miaAfter?.dailyLoads?.[3]}, total ${miaAfter?.total}, page ${(afterPage.data ?? []).find((m) => m.userId === mia.id)?.estimatedHours}`,
  )

  await openView('workload')
  const todayCell = page.locator(`[data-testid="workload-view-cell"][data-row="${mia.id}"][data-day="${dayOf(0)}"]`)
  await todayCell.waitFor({ timeout: 15_000 }).catch(() => {})
  const cellLoad = await todayCell.getAttribute('data-load').catch(() => null)
  const cellCapacity = await todayCell.getAttribute('data-capacity').catch(() => null)
  const listsT3 = await page.locator(`[data-testid="workload-no-estimate-item"][data-task-id="${T3}"]`).count()
  const listsT2 = await page.locator(`[data-testid="workload-unscheduled-item"][data-task-id="${T2}"]`).count()
  chk(
    cellLoad === '4' && cellCapacity !== null && cellCapacity !== '' && listsT3 === 1 && listsT2 === 1,
    'the Workload tab draws the assignee’s day with its load and capacity, and lists the unestimated and the unscheduled',
    `today’s cell ${cellLoad} of ${cellCapacity}; no estimate lists the brief ${listsT3}×, unscheduled lists the venue ${listsT2}×`,
  )

  // ══ 3. TIMELINE ═══════════════════════════════════════════════════════════
  console.log('\n▶ the list’s Timeline view')
  const taskOf = async (id) => (await A(`/tasks/${id}`)).data ?? null
  await openView('timeline')
  const bar = (id, group) => page.locator(`[data-testid="timeline-bar"][data-task-id="${id}"]${group ? `[data-group-key="${group}"]` : ''}`)
  await bar(T1).first().waitFor({ timeout: 15_000 }).catch(() => {})
  chk(
    (await bar(T1, mia.id).count()) === 1 && (await bar(ELSE).count()) === 0,
    'grouped by Assignee, the task is a bar on its assignee’s row, and another list’s task is not drawn',
    `bars of the task on Mia’s row ${await bar(T1, mia.id).count()}, of the other list’s task ${await bar(ELSE).count()}`,
  )
  const DAY_W = 56
  // Caught: no bar means no drag, and the check below reads the task's dates, which then stay put.
  const box1 = await bar(T1, mia.id).boundingBox({ timeout: 10_000 }).catch(() => null)
  if (box1) {
    await page.mouse.move(box1.x + 10, box1.y + box1.height / 2)
    await page.mouse.down()
    await page.mouse.move(box1.x + 10 + DAY_W, box1.y + box1.height / 2, { steps: 4 })
    await page.mouse.move(box1.x + 10 + 2 * DAY_W, box1.y + box1.height / 2, { steps: 4 })
    await page.mouse.up()
  }
  let moved = null
  await waitUntil(async () => {
    moved = await taskOf(T1)
    return ymd(moved?.startDate) === dayOf(2) && ymd(moved?.dueDate) === dayOf(3)
  }, { timeoutMs: 10_000 })
  chk(
    ymd(moved?.startDate) === dayOf(2) && ymd(moved?.dueDate) === dayOf(3),
    'dragging the bar two days along its row moves its start and due by two days',
    `start ${ymd(moved?.startDate)}, due ${ymd(moved?.dueDate)}`,
  )
  // The bar where the list now draws it, two days on — not where it was when the drag began.
  await waitUntil(async () => (await bar(T1, mia.id).getAttribute('data-from').catch(() => null)) === dayOf(2), { timeoutMs: 10_000 })
  const box2 = await bar(T1, mia.id).boundingBox({ timeout: 10_000 }).catch(() => null)
  const adminRow = await page.locator(`[data-testid="timeline-group"][data-group-key="${me.id}"] [data-testid="timeline-grid"]`).boundingBox({ timeout: 10_000 }).catch(() => null)
  if (box2 && adminRow) {
    await page.mouse.move(box2.x + 10, box2.y + box2.height / 2)
    await page.mouse.down()
    await page.mouse.move(box2.x + 10, (box2.y + adminRow.y + adminRow.height / 2) / 2, { steps: 4 })
    await page.mouse.move(box2.x + 10, adminRow.y + adminRow.height / 2, { steps: 4 })
    await page.mouse.up()
  }
  let reassigned = null
  await waitUntil(async () => {
    reassigned = await taskOf(T1)
    const ids = (reassigned?.assignees ?? []).map((a) => a.userId ?? a.id)
    return ids.length === 1 && ids[0] === me.id
  }, { timeoutMs: 10_000 })
  const afterIds = (reassigned?.assignees ?? []).map((a) => a.userId ?? a.id)
  chk(
    afterIds.length === 1 && afterIds[0] === me.id,
    'dragging it onto another person’s row reassigns it to them',
    `assignees now ${JSON.stringify(afterIds)}`,
  )
  const waiting = page.locator(`[data-testid="timeline-unscheduled-item"][data-task-id="${T2}"]`)
  const miaGrid = page.locator(`[data-testid="timeline-group"][data-group-key="${mia.id}"] [data-testid="timeline-grid"]`)
  const firstDayShown = await page.getByTestId('timeline-period').getAttribute('data-from').catch(() => null)
  const todayIndex = firstDayShown ? Math.round((new Date(`${dayOf(0)}T00:00:00`) - new Date(`${firstDayShown}T00:00:00`)) / 86_400_000) : 0
  const sawWaiting = (await waiting.count()) === 1
  await waiting.dragTo(miaGrid, { targetPosition: { x: todayIndex * DAY_W + DAY_W / 2, y: 12 } }).catch(() => {})
  let scheduled = null
  await waitUntil(async () => {
    scheduled = await taskOf(T2)
    return ymd(scheduled?.dueDate) === dayOf(0)
  }, { timeoutMs: 10_000 })
  chk(
    sawWaiting && ymd(scheduled?.dueDate) === dayOf(0),
    'a task with no date waits in Unscheduled, and dropping it on a day gives it that due date',
    `listed ${sawWaiting}; due ${ymd(scheduled?.dueDate)}, today ${dayOf(0)}`,
  )
  await page.getByTestId('timeline-group-by').selectOption('status', { timeout: 10_000 }).catch(() => {})
  const t3 = await taskOf(T3)
  await bar(T3, t3?.status).waitFor({ timeout: 8000 }).catch(() => {})
  chk(
    !!t3?.status && (await bar(T3, t3.status).count()) === 1,
    'grouped by Status, the task is on its status’s row',
    `the brief’s bar on ${JSON.stringify(await bar(T3).first().getAttribute('data-group-key').catch(() => null))}, its status ${t3?.status}`,
  )

  // ══ 4. MIND MAP ═══════════════════════════════════════════════════════════
  console.log('\n▶ the list’s Mind Map')
  await openView('mindmap')
  await page.getByTestId('mindmap-view').waitFor({ timeout: 15_000 }).catch(() => {})
  const listRows = (await A(`/tasks/list/${L}`)).data ?? []
  const ids = new Set()
  for (const r of listRows) {
    ids.add(r.id)
    for (const s of r.subtasks ?? []) ids.add(s.id)
  }
  const nodeCount = Number(await page.getByTestId('mindmap-view').getAttribute('data-node-count').catch(() => -1))
  const nodes = await page.getByTestId('mindmap-node').count()
  chk(
    ids.size >= 7 && nodeCount === ids.size && nodes === ids.size && ids.has(S1),
    'the mind map draws a node for every task and subtask of the list',
    `${nodes} nodes drawn (said ${nodeCount}) for the list’s ${ids.size}`,
  )
  const node = (id) => page.locator(`[data-testid="mindmap-node"][data-task-id="${id}"]`)
  const CHILD = `Child of the venue ${TAG}`
  await node(T2).getByTestId('mindmap-add-child').click({ timeout: 10_000 }).catch(() => {})
  await page.getByTestId('mindmap-new-title').fill(CHILD, { timeout: 10_000 }).catch(() => {})
  await page.getByTestId('mindmap-new-title').press('Enter', { timeout: 10_000 }).catch(() => {})
  let children = []
  await waitUntil(async () => {
    children = (await A(`/tasks/${T2}/subtasks`)).data ?? []
    return children.some((c) => c.title === CHILD)
  }, { timeoutMs: 10_000 })
  chk(
    children.some((c) => c.title === CHILD) && children.filter((c) => c.title === CHILD).length === 1,
    '+ on a task makes one subtask of it, which the task’s own read has',
    `subtasks ${JSON.stringify(children.map((c) => c.title))}`,
  )
  await node(T3).dragTo(node(T6), { timeout: 10_000 }).catch(() => {})
  let parented = null
  await waitUntil(async () => {
    parented = await taskOf(T3)
    return parented?.parentTaskId === T6
  }, { timeoutMs: 10_000 })
  chk(parented?.parentTaskId === T6, 'dropping a task on another makes it that task’s subtask', `parent ${parented?.parentTaskId}`)
  await node(T2).waitFor({ timeout: 8000 }).catch(() => {})
  await node(T2).dragTo(node(T5), { timeout: 10_000 }).catch(() => {})
  await page.waitForResponse((r) => r.url().includes(`/tasks/${T2}`) && r.request().method() === 'PATCH', { timeout: 8000 }).catch(() => null)
  const stayed = await taskOf(T2)
  await waitUntil(async () => (await node(T2).getAttribute('data-kind').catch(() => null)) === 'task', { timeoutMs: 8000 })
  chk(
    stayed && !stayed.parentTaskId && (await node(T2).getAttribute('data-kind').catch(() => null)) === 'task',
    'dropping a task that has subtasks onto another is refused, and the tree is as the server has it',
    `parent ${stayed?.parentTaskId}, drawn as ${await node(T2).getAttribute('data-kind').catch(() => null)}`,
  )
  const cycle = await A(`/tasks/${T1}`, { method: 'PATCH', body: { parentTaskId: S1 } })
  chk(cycle.status === 400, 'and the server refuses a task becoming the subtask of its own subtask (400)', said(cycle))

  // ══ 5. MAP ════════════════════════════════════════════════════════════════
  console.log('\n▶ the list’s Map')
  const SITE = must(await A(`/workspaces/${WS}/projects/${project.id}/custom-fields`, { method: 'POST', body: { name: `Site ${TAG}`, type: 'location' } }), 'make the Location field').id
  const place = (taskId, value) => A(`/workspaces/${WS}/tasks/${taskId}/custom-fields/${SITE}`, { method: 'PUT', body: { value } })
  must(await place(T1, 'Eiffel Tower, Paris'), 'place the launch')
  const mapRead = await A(`/lists/${L}/map`)
  const eiffel = (mapRead.data?.markers ?? []).find((m) => m.taskId === T1)
  chk(
    mapRead.ok && mapRead.data?.geocoder === true && Math.abs((eiffel?.lat ?? 0) - 48.8584) < 1e-6 && Math.abs((eiffel?.lng ?? 0) - 2.2945) < 1e-6 &&
      (mapRead.data?.unplaced ?? []).some((u) => u.taskId === T2 && u.address === null),
    'a placed address is a marker at the geocoder’s point, and a task with no location is listed aside',
    `${said(mapRead)}, marker ${JSON.stringify(eiffel ?? null)}, geocoder ${mapRead.data?.geocoder}`,
  )
  must(await place(T5, 'Nowhere Lane 1'), 'give an address no geocoder places')
  const lost = ((await A(`/lists/${L}/map`)).data?.unplaced ?? []).find((u) => u.taskId === T5)
  chk(lost?.address === 'Nowhere Lane 1', 'an address the geocoder cannot place is listed with its words, not drawn', JSON.stringify(lost ?? null))
  await openView('map')
  const marker = page.locator(`[data-testid="map-marker"][data-task-id="${T1}"]`)
  await marker.waitFor({ timeout: 15_000 }).catch(() => {})
  await waitUntil(async () => tilesAsked.length > 0, { timeoutMs: 8000 })
  chk(
    (await marker.count()) === 1 && (await marker.getAttribute('data-lat').catch(() => null)) === '48.8584' && tilesAsked.length > 0,
    'the Map tab draws the marker and asks the tile server for the tiles around it',
    `markers ${await marker.count()}, at ${await marker.getAttribute('data-lat').catch(() => null)}; ${tilesAsked.length} tiles asked`,
  )
  must(await place(T1, 'Big Ben, London'), 'move the launch')
  const movedMarker = ((await A(`/lists/${L}/map`)).data?.markers ?? []).find((m) => m.taskId === T1)
  chk(Math.abs((movedMarker?.lat ?? 0) - 51.5007) < 1e-6, 'changing the address moves the marker', JSON.stringify(movedMarker ?? null))

  // ══ 6. THE SPACE DECIDES THE TABS ═════════════════════════════════════════
  console.log('\n▶ the space’s view settings decide the tabs')
  const tabsBefore = []
  for (const v of NEW_VIEWS) if ((await page.getByTestId(`work-view-tab-type-${v}`).count()) === 1) tabsBefore.push(v)
  must(await A(`/spaces/${space.id}`, { method: 'PUT', body: { viewConfig: { enabledViews: ALL_VIEWS.filter((v) => v !== 'map'), defaultView: 'list' } } }), 'turn Map off')
  await page.goto(LIST_URL, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('work-view-tab-type-activity').waitFor({ timeout: 25_000 }).catch(() => {})
  const mapTab = await page.getByTestId('work-view-tab-type-map').count()
  chk(
    tabsBefore.length === 5 && mapTab === 0 && (await page.getByTestId('work-view-tab-type-mindmap').count()) === 1,
    'the list draws a tab for each of the five, and a space that turns one off loses its tab',
    `tabs before ${JSON.stringify(tabsBefore)}; Map after ${mapTab}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  stack.close()
  await sql?.end?.({ timeout: 2 }).catch?.(() => {})
}

console.log(`\n${passed} passed, ${failed} failed`)
// Said only when it is so, as every suite says it: the break runner reads this line as a short run.
if (passed + failed !== EXPECTED_CHECKS) {
  console.log(`\n✗ ${passed + failed} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
}
if (failed > 0 || passed + failed !== EXPECTED_CHECKS) process.exitCode = 1

/**
 * TASKS IN MULTIPLE LISTS, AS CLICKUP'S CLICKAPP (`commit-log/log-713a611-1`).
 *
 * ClickUp (help centre, "Tasks in Multiple Lists" and its FAQ, and the feedback
 * board, through search excerpts, 9 October): an owner or admin turns the
 * ClickApp on, and turning it off takes every task out of the lists it was
 * added to, for good. A task keeps its home list and is added to other lists
 * from its ⋯ menu (Add to › Another List) or beside its location; it is the
 * same task in each, with one status, its home list's. "Remove task from this
 * List" takes it out of an added list, never out of its home; moving it
 * changes its home. Guests neither add nor remove. Whoever may see one of a
 * task's lists sees the task there.
 *
 * Measured before it was built (lane 7, the tree before it): there was no
 * `/tasks/:id/lists` (404), no ClickApp, and a task lived in one list only.
 *
 * A workspace of this run's own, made by Olga, who owns it; Mia, Max and Vic,
 * members, and a guest. Mia's private list holds her task; a team list and a
 * third list are open to every member; a list in a view-only space is not
 * Mia's to add to.
 *
 *   node test/e2e/tasks-in-multiple-lists.mjs --api 3030 --dist /tmp/claude-0/dist-10
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'
import { waitUntil } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 14

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

// The API's own words (`task-lists.service.ts`).
const REFUSED = {
  off: 'Tasks in Multiple Lists is off in this workspace: an owner or admin turns it on in Settings → ClickApps',
  guest: 'Guests cannot add a task to another list, or take it out of one',
  subtask: 'A subtask is in the lists its parent is in',
  home: 'This is the task’s home list: a task is moved out of it, not taken out',
  homeAgain: 'This is the task’s home list already',
  already: 'The task is in this list already',
  notIn: 'The task is not in this list',
}
const FLAG = 'tasks.multiple_lists'

const stamp = Date.now()
const TAG = `tml${stamp}`
const PASSWORD = 'MultipleLists@12345!'

const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, data, error, message}`. Every call site reads `status`. */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.message || null)}`
const refusedRead = (res) => res.status === 403 || res.status === 404

let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the lists a task is in are read back by SQL')
  const owner = await signUpApi(API, { fullName: `olga ${stamp}`, email: `${TAG}-olga@rundesk.invalid`, password: PASSWORD, organizationName: `Lists olga ${stamp}`, organizationSlug: `lists-olga-${stamp}` })
  A = apiAs(owner.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: `Lists ${TAG}` } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id

  const person = async (who, role) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `${who} ${stamp}`, email, password: PASSWORD, organizationName: `Lists ${who} ${stamp}`, organizationSlug: `lists-${who}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (!added.ok) throw new Error(`could not add ${who}: ${said(added)}`)
    return { email, id: signed.user.id, api: apiAs(signed.accessToken) }
  }
  const mia = await person('mia', 'member')
  const max = await person('max', 'member')
  const vic = await person('vic', 'member')
  const gus = await person('gus', 'guest')
  const M = mia.api
  const must = (res, what) => { if (!res.ok || !res.data?.id) throw new Error(`could not make ${what}: ${said(res)}`); return res.data }

  const space = must(await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} team`, defaultPermission: 'admin' } }), 'the team space')
  const project = must(await A('/projects', { method: 'POST', body: { spaceId: space.id, name: `${TAG} work` } }), 'the project')
  const HOME_NAME = `${TAG} Mia's plans`
  const home = must(await M('/lists', { method: 'POST', body: { projectId: project.id, name: HOME_NAME, visibility: 'private' } }), 'Mia’s private list')
  const team = must(await A('/lists', { method: 'POST', body: { projectId: project.id, name: `${TAG} team board` } }), 'the team list')
  const third = must(await A('/lists', { method: 'POST', body: { projectId: project.id, name: `${TAG} third list` } }), 'the third list')
  const secret = must(await A('/lists', { method: 'POST', body: { projectId: project.id, name: `${TAG} Olga's own`, visibility: 'private' } }), 'Olga’s private list')
  const viewSpace = must(await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} view only`, defaultPermission: 'view' } }), 'the view-only space')
  const viewProject = must(await A('/projects', { method: 'POST', body: { spaceId: viewSpace.id, name: `${TAG} read` } }), 'the view-only project')
  const viewList = must(await A('/lists', { method: 'POST', body: { projectId: viewProject.id, name: `${TAG} read only` } }), 'the view-only list')

  const waiting = await M(`/lists/${home.id}/statuses`, { method: 'POST', body: { name: 'Waiting on client', category: 'in_progress' } })
  const WAITING = waiting.data?.key
  const TITLE = `Plan the launch ${TAG}`
  const task = must(await M('/tasks', { method: 'POST', body: { listId: home.id, title: TITLE } }), 'Mia’s task')
  const T = task.id
  const statusSet = await M(`/tasks/${T}`, { method: 'PATCH', body: { status: WAITING } })
  if (!WAITING || !statusSet.ok) throw new Error(`could not give the task its home list's own status: ${said(waiting)}; ${said(statusSet)}`)
  const PRIVATE_TITLE = `Mia's own note ${TAG}`
  const privateTask = must(await M('/tasks', { method: 'POST', body: { listId: home.id, title: PRIVATE_TITLE } }), 'Mia’s private task')
  const madePrivate = await M(`/tasks/${privateTask.id}`, { method: 'PATCH', body: { visibility: 'private' } })
  if (!madePrivate.ok) throw new Error(`could not make Mia's task private: ${said(madePrivate)}`)
  const sub = must(await M('/tasks', { method: 'POST', body: { listId: home.id, title: `a step ${TAG}`, parentTaskId: T } }), 'the subtask')
  const readOnly = must(await A('/tasks', { method: 'POST', body: { listId: viewList.id, title: `Read me ${TAG}` } }), 'the task in the view-only space')
  // The guest's: a task of the team list, shared with them to edit.
  const shared = must(await A('/tasks', { method: 'POST', body: { listId: team.id, title: `Shared with the guest ${TAG}` } }), 'the task shared with the guest')
  await sql`insert into object_shares (workspace_id, object_type, object_id, user_id, level) values (${WS}, 'task', ${shared.id}, ${gus.id}, 'edit')`

  const placements = async () => (await sql`select list_id, added_by_id from task_lists where task_id = ${T} order by created_at`)
  const activity = async (action) => (await sql`select meta, actor_id from task_activity where task_id = ${T} and action = ${action}`)

  const chromium = await resolveChromium()
  browser = await chromium.launch(launchOptions())
  const signIn = async (email) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
    const page = await ctx.newPage()
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', email)
    await page.fill('input[type=password]', PASSWORD)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
    return page
  }
  const listUrl = (l, p = project, s = space) => `${B}/app/${WS}/${s.id}/${p.id}/${l.id}`
  const openMenu = async (page) => {
    await page.getByTestId('task-more-menu').click({ timeout: 15_000 }).catch(() => {})
    await page.getByTestId('task-menu-add-to').click({ timeout: 8000 }).catch(() => {})
    await page.getByTestId('task-menu-add-to-list').waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
  }

  // ══ 1. OFF UNTIL TURNED ON ═════════════════════════════════════════════════
  console.log('\n▶ before the ClickApp is turned on')
  const offLists = await M(`/tasks/${T}/lists`)
  const offAdd = await M(`/tasks/${T}/lists`, { method: 'POST', body: { listId: team.id } })
  const miaPage = await signIn(mia.email)
  await miaPage.goto(`${listUrl(home)}?task=${T}`, { waitUntil: 'domcontentloaded' })
  await miaPage.getByTestId('task-tab-overview').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
  await openMenu(miaPage)
  const offItem = miaPage.getByTestId('task-menu-add-to-list')
  const offDisabled = (await offItem.getAttribute('data-disabled').catch(() => null)) !== null || (await offItem.getAttribute('aria-disabled').catch(() => null)) === 'true'
  const offReason = (await miaPage.getByTestId('task-menu-add-to-list-reason').filter({ visible: true }).innerText({ timeout: 5000 }).catch(() => '')).trim()
  await miaPage.keyboard.press('Escape')
  await miaPage.keyboard.press('Escape')
  chk(
    offLists.status === 200 && offLists.data?.on === false && offLists.data?.canChange === false && offLists.data?.reason === REFUSED.off
      && offAdd.status === 403 && offAdd.message === REFUSED.off && (await placements()).length === 0
      && offDisabled && offReason === REFUSED.off,
    'it is off until an owner or admin turns it on: the task’s lists say so, adding is refused in words (403) and nothing is kept, and the menu’s Add to › Another List is drawn greyed, saying why',
    JSON.stringify({ lists: offLists.data ?? offLists.status, add: said(offAdd), offDisabled, offReason }),
  )

  // ══ 2. TURNED ON IN SETTINGS → CLICKAPPS ═══════════════════════════════════
  console.log('\n▶ a member asks to turn it on; the owner turns it on among the ClickApps')
  const memberSwitch = await M(`/feature-flags/${FLAG}`, { method: 'PUT', body: { enabled: true, scope: 'workspace', workspaceId: WS } })
  const olgaPage = await signIn(`${TAG}-olga@rundesk.invalid`)
  await olgaPage.goto(`${B}/app/${WS}/settings?tab=features`, { waitUntil: 'domcontentloaded' })
  const sw = olgaPage.getByRole('switch', { name: 'Tasks in Multiple Lists', exact: true })
  await sw.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  await waitUntil(async () => !(await sw.isDisabled().catch(() => true)), { timeoutMs: 10_000 })
  const before = await sw.getAttribute('aria-checked').catch(() => null)
  await sw.click({ timeout: 5000 }).catch(() => {})
  const turnedOn = await waitUntil(async () => (await sw.getAttribute('aria-checked').catch(() => null)) === 'true', { timeoutMs: 10_000 })
  const [flagRow] = await sql`select enabled from feature_flags where flag_key = ${FLAG} and workspace_id = ${WS} and scope = 'workspace'`
  chk(
    refusedRead(memberSwitch) && before === 'false' && turnedOn && flagRow?.enabled === true,
    'a member may not turn it on (refused), and Settings → ClickApps lists it, off; the owner switches it on, and it is kept for the workspace (read by SQL)',
    JSON.stringify({ member: said(memberSwitch), before, turnedOn, flag: flagRow ?? null }),
  )

  // ══ 3. ADD TO › ANOTHER LIST ═══════════════════════════════════════════════
  console.log('\n▶ Mia adds her task to the team list, from its ⋯ menu')
  const maxBefore = (await max.api(`/tasks/${T}`)).status
  await miaPage.goto(`${listUrl(home)}?task=${T}`, { waitUntil: 'domcontentloaded' })
  await miaPage.getByTestId('task-tab-overview').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
  await waitUntil(async () => (await miaPage.getByTestId('task-lists-row').count()) > 0, { timeoutMs: 15_000 })
  await openMenu(miaPage)
  await miaPage.getByTestId('task-menu-add-to-list').click({ timeout: 8000 }).catch(() => {})
  const dialogTitle = (await miaPage.getByRole('dialog').getByRole('heading').filter({ visible: true }).first().innerText({ timeout: 8000 }).catch(() => '')).trim()
  const offersHome = await miaPage.getByTestId(`move-target-list-${home.id}`).count()
  await miaPage.getByTestId(`move-target-list-${team.id}`).click({ timeout: 8000 }).catch(() => {})
  let rows = []
  await waitUntil(async () => (rows = await placements()).length === 1, { timeoutMs: 15_000 })
  // The activity is written after the row: waited for, not read the moment the row is there.
  let added = []
  await waitUntil(async () => (added = await activity('list_added')).length >= 1, { timeoutMs: 10_000 })
  const chipsDrawn = await waitUntil(async () => (await miaPage.getByTestId(`task-lists-chip-${team.id}`).count()) === 1
    && (await miaPage.getByTestId(`task-lists-chip-${home.id}`).getAttribute('data-home').catch(() => null)) === 'yes', { timeoutMs: 15_000 })
  // Asked again, the picker offers the third list and not the one the task is in now.
  await openMenu(miaPage)
  await miaPage.getByTestId('task-menu-add-to-list').click({ timeout: 8000 }).catch(() => {})
  await miaPage.getByTestId(`move-target-list-${third.id}`).waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
  const offersThird = await miaPage.getByTestId(`move-target-list-${third.id}`).count()
  const offersTeamAgain = await miaPage.getByTestId(`move-target-list-${team.id}`).count()
  await miaPage.keyboard.press('Escape')
  chk(
    dialogTitle === `Add "${TITLE}" to another List` && offersHome === 0
      && rows.length === 1 && rows[0].list_id === team.id && rows[0].added_by_id === mia.id
      && added.length === 1 && added[0].meta?.listId === team.id && added[0].actor_id === mia.id && chipsDrawn
      && offersThird === 1 && offersTeamAgain === 0,
    'Add to › Another List opens the picker without the task’s own list; the list chosen holds the task (read by SQL), its activity says so, the sheet names both lists, the home one marked, and the picker offers that list no more',
    JSON.stringify({ dialogTitle, offersHome, rows, added, chipsDrawn, offersThird, offersTeamAgain }),
  )

  // ══ 4. THE SAME TASK, READ THROUGH THE LIST IT WAS ADDED TO ════════════════
  console.log('\n▶ Max, who may not open Mia’s list, and the team list')
  const maxAfter = await max.api(`/tasks/${T}`)
  const maxTeam = await max.api(`/tasks/list/${team.id}`)
  const teamRows = Array.isArray(maxTeam.data) ? maxTeam.data : []
  const asAdded = teamRows.find((r) => r.id === T)
  const maxLists = await max.api(`/tasks/${T}/lists`)
  const homeEntry = (maxLists.data?.lists ?? []).find((l) => l.home)
  chk(
    refusedRead({ status: maxBefore }) && maxAfter.status === 200 && maxAfter.data?.listId === home.id
      && !!asAdded && asAdded.addedFrom?.id === home.id && asAdded.addedFrom?.name === null
      && homeEntry && homeEntry.name === null && (maxLists.data?.lists ?? []).some((l) => l.id === team.id && l.name),
    'whoever may open one of its lists reads it there: Max, refused it before, reads it by id and in the team list after — its home still Mia’s list, which is not named to him',
    JSON.stringify({ before: maxBefore, after: maxAfter.status, home: maxAfter.data?.listId === home.id, row: asAdded ? { addedFrom: asAdded.addedFrom } : null, lists: maxLists.data?.lists ?? maxLists.status }),
  )
  const NEW_TITLE = `Plan the launch party ${TAG}`
  const renamed = await M(`/tasks/${T}`, { method: 'PATCH', body: { title: NEW_TITLE } })
  const maxEdit = await max.api(`/tasks/${T}`, { method: 'PATCH', body: { title: `Max was here ${TAG}` } })
  const seenThere = ((await max.api(`/tasks/list/${team.id}`)).data ?? []).find((r) => r.id === T)?.title
  const [{ n: copies }] = await sql`select count(*)::int as n from tasks where title in (${NEW_TITLE}, ${TITLE})`
  chk(
    renamed.ok && seenThere === NEW_TITLE && copies === 1 && refusedRead(maxEdit),
    'it is one task: Mia renames it in her list and the team list reads the new name, one row of it (read by SQL) — and Max, who may change nothing in Mia’s list, may not change it from his',
    JSON.stringify({ renamed: said(renamed), seenThere, copies, maxEdit: said(maxEdit) }),
  )

  // ══ 5. A PRIVATE TASK STAYS PRIVATE ════════════════════════════════════════
  console.log('\n▶ Mia’s private task, added to the team list too')
  const privAdd = await M(`/tasks/${privateTask.id}/lists`, { method: 'POST', body: { listId: team.id } })
  const maxPriv = await max.api(`/tasks/${privateTask.id}`)
  const maxListsPriv = ((await max.api(`/tasks/list/${team.id}`)).data ?? []).some((r) => r.id === privateTask.id)
  const miaListsPriv = ((await M(`/tasks/list/${team.id}`)).data ?? []).some((r) => r.id === privateTask.id)
  chk(
    privAdd.status === 201 || privAdd.status === 200 ? refusedRead(maxPriv) && !maxListsPriv && miaListsPriv : false,
    'a private task added to a list everybody may open stays private: Max is refused it by id and the team list does not draw it for him — it does for Mia',
    JSON.stringify({ add: said(privAdd), maxById: maxPriv.status, maxSees: maxListsPriv, miaSees: miaListsPriv }),
  )

  // ══ 6. A LIST IS NAMED ONLY TO ITS READERS ═════════════════════════════════
  console.log('\n▶ Olga adds the task to her own private list')
  const olgaAdd = await A(`/tasks/${T}/lists`, { method: 'POST', body: { listId: secret.id } })
  const miaSees = await M(`/tasks/${T}/lists`)
  const olgaSees = await A(`/tasks/${T}/lists`)
  const ids = (res) => (res.data?.lists ?? []).map((l) => l.id)
  chk(
    (olgaAdd.status === 201 || olgaAdd.status === 200) && !ids(miaSees).includes(secret.id) && ids(miaSees).includes(team.id) && ids(olgaSees).includes(secret.id),
    'a list the task was added to is named only to those who may open it: Olga’s own list is in her answer and not in Mia’s',
    JSON.stringify({ add: said(olgaAdd), mia: ids(miaSees), olga: ids(olgaSees) }),
  )
  await A(`/tasks/${T}/lists/${secret.id}`, { method: 'DELETE' })

  // ══ 7. THE TEAM LIST DRAWS IT, IN ITS HOME LIST'S STATUS ═══════════════════
  console.log('\n▶ the team list’s page, as Max')
  const maxPage = await signIn(max.email)
  await maxPage.goto(listUrl(team), { waitUntil: 'domcontentloaded' })
  const homeChip = maxPage.getByTestId(`task-row-home-list-${T}`)
  const group = maxPage.locator(`[data-testid="list-group"][data-group="${WAITING}"]`)
  const drawn = await waitUntil(async () => (await homeChip.count()) > 0 && (await group.count()) === 1, { timeoutMs: 20_000 })
  const chipText = (await homeChip.filter({ visible: true }).first().innerText({ timeout: 5000 }).catch(() => '')).trim()
  const groupHomeOnly = await group.getAttribute('data-home-only').catch(() => null)
  const groupHasTask = (await group.getByText(NEW_TITLE, { exact: true }).count()) > 0
  const groupOffersAdd = await group.getByTestId('list-group-add-task').count()
  const groupLabel = (await group.locator('h3').filter({ visible: true }).first().innerText({ timeout: 5000 }).catch(() => '')).trim()
  chk(
    drawn && chipText === 'Its home: a list you cannot open' && groupHomeOnly === 'yes' && groupLabel === 'Waiting on client' && groupHasTask && groupOffersAdd === 0,
    'the team list draws the task with a chip saying it lives elsewhere — the list unnamed to Max — in a group of its home list’s status, named as at home, which the team list does not have, offering no + Add Task there',
    JSON.stringify({ drawn, chipText, groupHomeOnly, groupLabel, groupHasTask, groupOffersAdd }),
  )
  // The Board, from the views bar, as a reader opens it.
  await maxPage.getByTestId('work-view-tab-type-board').click({ timeout: 15_000 }).catch(() => {})
  const column = maxPage.locator(`[data-testid="board-column"][data-status="${WAITING}"]`)
  const columnDrawn = await waitUntil(async () => (await column.count()) === 1 && (await column.getByText(NEW_TITLE, { exact: true }).count()) > 0, { timeoutMs: 20_000 })
  chk(
    columnDrawn && (await column.getAttribute('data-home-only').catch(() => null)) === 'yes',
    'and the Board draws a column for that status, the task on it',
    `column drawn: ${columnDrawn}`,
  )

  // ══ 8. REMOVE TASK FROM THIS LIST ══════════════════════════════════════════
  console.log('\n▶ Mia takes it out of the team list, from the sheet')
  await miaPage.goto(`${listUrl(home)}?task=${T}`, { waitUntil: 'domcontentloaded' })
  await miaPage.getByTestId(`task-lists-remove-${team.id}`).click({ timeout: 20_000 }).catch(() => {})
  let after = null
  await waitUntil(async () => (after = await placements()).length === 0, { timeoutMs: 15_000 })
  // Written after the row goes: waited for.
  let removed = []
  await waitUntil(async () => (removed = await activity('list_removed')).some((r) => r.meta?.listId === team.id && r.actor_id === mia.id), { timeoutMs: 10_000 })
  const maxGone = (await max.api(`/tasks/${T}`)).status
  const chipGone = await waitUntil(async () => (await miaPage.getByTestId(`task-lists-chip-${team.id}`).count()) === 0, { timeoutMs: 10_000 })
  chk(
    after?.length === 0 && removed.some((r) => r.meta?.listId === team.id && r.actor_id === mia.id) && refusedRead({ status: maxGone }) && chipGone,
    'its × takes it out of the team list: the row is gone (read by SQL), the activity says so, the sheet no longer names the list — and Max’s way to it goes with it',
    JSON.stringify({ after, removed, maxGone, chipGone }),
  )

  // ══ 9. WHAT IS REFUSED ═════════════════════════════════════════════════════
  console.log('\n▶ its home list, twice, a subtask, a guest, a reader, a list one may not add to')
  const outOfHome = await M(`/tasks/${T}/lists/${home.id}`, { method: 'DELETE' })
  const homeAgain = await M(`/tasks/${T}/lists`, { method: 'POST', body: { listId: home.id } })
  const first = await M(`/tasks/${T}/lists`, { method: 'POST', body: { listId: third.id } })
  const twice = await M(`/tasks/${T}/lists`, { method: 'POST', body: { listId: third.id } })
  const notIn = await M(`/tasks/${T}/lists/${team.id}`, { method: 'DELETE' })
  const subAdd = await M(`/tasks/${sub.id}/lists`, { method: 'POST', body: { listId: team.id } })
  chk(
    outOfHome.status === 403 && outOfHome.message === REFUSED.home && homeAgain.status === 400 && homeAgain.message === REFUSED.homeAgain
      && (first.status === 201 || first.status === 200) && twice.status === 409 && twice.message === REFUSED.already
      && notIn.status === 404 && notIn.message === REFUSED.notIn && subAdd.status === 400 && subAdd.message === REFUSED.subtask,
    'each refusal in words: out of its home list (403), into it again (400), into a list twice (409), out of one it is not in (404), and a subtask on its own (400)',
    JSON.stringify({ outOfHome: said(outOfHome), homeAgain: said(homeAgain), first: said(first), twice: said(twice), notIn: said(notIn), sub: said(subAdd) }),
  )
  const gusLists = await gus.api(`/tasks/${shared.id}/lists`)
  const gusAdd = await gus.api(`/tasks/${shared.id}/lists`, { method: 'POST', body: { listId: third.id } })
  const vicLists = await vic.api(`/tasks/${readOnly.id}/lists`)
  const vicAdd = await vic.api(`/tasks/${readOnly.id}/lists`, { method: 'POST', body: { listId: team.id } })
  const intoViewOnly = await M(`/tasks/${T}/lists`, { method: 'POST', body: { listId: viewList.id } })
  const [{ n: stray }] = await sql`select count(*)::int as n from task_lists where list_id = ${viewList.id} or task_id in (${readOnly.id}, ${shared.id})`
  chk(
    gusLists.status === 200 && gusLists.data?.canChange === false && gusLists.data?.reason === REFUSED.guest && gusAdd.status === 403 && gusAdd.message === REFUSED.guest
      && vicLists.data?.canChange === false && vicAdd.status === 403 && typeof vicAdd.message === 'string' && vicAdd.message.length > 0
      && intoViewOnly.status === 403 && typeof intoViewOnly.message === 'string' && intoViewOnly.message.length > 0 && stray === 0,
    'a guest, though the task is shared with them to edit, is told guests do not, and refused (403); a member who may only read a task is refused in the write rule’s words; and nobody adds a task to a list they may not add tasks to (403) — none kept (read by SQL)',
    JSON.stringify({ gus: gusLists.data ?? gusLists.status, gusAdd: said(gusAdd), vic: vicLists.data?.reason ?? vicLists.status, vicAdd: said(vicAdd), intoViewOnly: said(intoViewOnly), stray }),
  )

  // ══ 10. A MOVE CHANGES ITS HOME ════════════════════════════════════════════
  console.log('\n▶ the task, in the third list too, moved into it')
  const moved = await M(`/tasks/${T}/move`, { method: 'POST', body: { listId: third.id } })
  const [homeNow] = await sql`select list_id from tasks where id = ${T}`
  const left = await placements()
  const listsNow = await M(`/tasks/${T}/lists`)
  chk(
    moved.ok && homeNow?.list_id === third.id && left.length === 0 && (listsNow.data?.lists ?? []).length === 1 && listsNow.data.lists[0].id === third.id && listsNow.data.lists[0].home,
    'moved into a list it was added to, that list is its home, and it is not in it twice (read by SQL)',
    JSON.stringify({ moved: said(moved), home: homeNow?.list_id === third.id, left, lists: listsNow.data?.lists ?? listsNow.status }),
  )

  // ══ 11. TURNED OFF, THE PLACEMENTS GO FOR GOOD ═════════════════════════════
  console.log('\n▶ the task added to two lists, and the ClickApp turned off and on again')
  await M(`/tasks/${T}/lists`, { method: 'POST', body: { listId: team.id } })
  await M(`/tasks/${T}/lists`, { method: 'POST', body: { listId: home.id } })
  const beforeOff = (await placements()).length + (await sql`select count(*)::int as n from task_lists where task_id = ${privateTask.id}`)[0].n
  const off = await A(`/feature-flags/${FLAG}`, { method: 'PUT', body: { enabled: false, scope: 'workspace', workspaceId: WS } })
  const [{ n: inWorkspace }] = await sql`select count(*)::int as n from task_lists tl join lists l on l.id = tl.list_id join projects p on p.id = l.project_id join spaces s on s.id = p.space_id where s.workspace_id = ${WS}`
  await A(`/feature-flags/${FLAG}`, { method: 'PUT', body: { enabled: true, scope: 'workspace', workspaceId: WS } })
  const [{ n: afterOn }] = await sql`select count(*)::int as n from task_lists tl join lists l on l.id = tl.list_id join projects p on p.id = l.project_id join spaces s on s.id = p.space_id where s.workspace_id = ${WS}`
  chk(
    beforeOff === 3 && off.ok && inWorkspace === 0 && afterOn === 0,
    'turning the ClickApp off takes every task of the workspace out of the lists it was added to, and turning it on again brings none back (read by SQL)',
    JSON.stringify({ beforeOff, off: said(off), inWorkspace, afterOn }),
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

/**
 * THE LIST PAGE OFFERS WHAT THIS PERSON MAY DO IN THE LIST, AND NOTHING THE
 * API WOULD REFUSE THEM.
 *
 * NOT A FRAME ROW: `found-25-sep/list-page-offers-refused-edits`. The list
 * page asked nothing about its reader: the header's Add task and each group's
 * add row, a row's done circle, its priority flag and its due date, the
 * table's cells and add row, the board's drag, add row, column names and Add
 * group, the calendar's and the gantt's drag and the calendar's add, Statuses
 * and Create field were drawn for anybody who could open the
 * list, and a view-only or comment-only reader — or one whose Edit adds
 * nothing, since adding takes Full edit — was refused each one (403) after
 * using it. The task sheet asks the API what its reader may do
 * (`task-sheet-offers-refused-edits`); the page did not.
 *
 * ClickUp (help centre, "Permissions in detail"): View changes nothing;
 * Comment comments, and on a task assigned to the person completes it; Edit
 * changes every task and adds none; Full edit adds.
 *
 * `GET /tasks/list/:listId/capabilities` answers once per list — `add`, `edit`,
 * `comment`, `statuses`, `fields` — and the page draws by it; a row's done
 * circle also for a task assigned to the reader where they may comment. A
 * member reads four lists of the admin's, one per level. What they change is
 * read back by SQL.
 *
 *   node test/e2e/list-page-levels.mjs --api 3021 --dist /tmp/claude-0/dist-1
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 9

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

const stamp = Date.now()
const TAG = `lpl${stamp}`
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — what the member changes is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const email = `${TAG}-member@rundesk.invalid`
  const password = 'ListLevels@12345!'
  const signed = await signUpApi(API, { fullName: 'List reader', email, password, organizationName: `List ${stamp}`, organizationSlug: `list-${stamp}` })
  const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'member' } })
  if (!added.ok) throw new Error(`could not add the member: ${said(added)}`)
  const M = apiAs(signed.accessToken)
  const [me] = await sql`select id from users where email = ${email}`

  /** A space at `level` (or the default, Full edit), its project and list, and two tasks of the admin's. */
  const place = async (name, level, assignFirst = false) => {
    const space = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} ${name}`, ...(level ? { defaultPermission: level } : {}) } })
    const project = await A('/projects', { method: 'POST', body: { spaceId: space.data?.id, name: `${TAG} ${name}` } })
    const list = await A('/lists', { method: 'POST', body: { projectId: project.data?.id, name: `${TAG} ${name}` } })
    if (!list.ok || !list.data?.id) throw new Error(`could not make the ${name} list: ${said(space)} ${said(project)} ${said(list)}`)
    const task = async (title, assignees = []) => {
      const t = await A('/tasks', { method: 'POST', body: { listId: list.data.id, title: `${TAG} ${name} ${title}`, ...(assignees.length ? { assigneeIds: assignees } : {}) } })
      if (!t.ok || !t.data?.id) throw new Error(`could not make "${title}": ${said(t)}`)
      return { id: t.data.id, title: `${TAG} ${name} ${title}` }
    }
    const first = await task('first', assignFirst ? [me.id] : [])
    const second = await task('second')
    // A subtask of the first, and a text field on the project, so the rows and the table have one each.
    const sub = await A('/tasks', { method: 'POST', body: { listId: list.data.id, title: `${TAG} ${name} subtask`, parentTaskId: first.id } })
    if (!sub.ok) throw new Error(`could not make the ${name} subtask: ${said(sub)}`)
    const field = await A(`/workspaces/${WS}/projects/${project.data.id}/custom-fields`, { method: 'POST', body: { name: `${TAG} note`, type: 'text' } })
    if (!field.ok) throw new Error(`could not make the ${name} field: ${said(field)}`)
    // And an empty list beside it, for what an empty list invites.
    const empty = await A('/lists', { method: 'POST', body: { projectId: project.data.id, name: `${TAG} ${name} empty` } })
    if (!empty.ok) throw new Error(`could not make the ${name} empty list: ${said(empty)}`)
    const base = `/app/${WS}/${space.data.id}/${project.data.id}`
    return { list: list.data.id, url: `${base}/${list.data.id}`, emptyUrl: `${base}/${empty.data.id}`, first, second, subTitle: `${TAG} ${name} subtask` }
  }
  const VIEW = await place('view', 'view')
  const COMMENT = await place('comment', 'comment', true)
  const EDIT = await place('edit', 'edit')
  const FULL = await place('full edit')
  const row = async (id) => (await sql`select status, priority, due_date from tasks where id = ${id}`)[0] ?? null

  browser = await (await resolveChromium()).launch(launchOptions())
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', email)
  await page.fill('input[type=password]', password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})

  const count = async (loc) => loc.count().catch(() => -1)
  /** Open the list in one of its views, and wait for a task it draws there. */
  const openIn = async (place, view, shows = place.first) => {
    await page.goto(`${B}${place.url}`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId(`work-view-tab-type-${view}`).click({ timeout: 20_000 }).catch(() => {})
    await page.getByText(shows.title, { exact: true }).first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
    await page.waitForTimeout(2000)
  }
  /** Open the list and read what it offers, by the labels the controls carry either way. */
  const offered = async (place) => {
    await openIn(place, 'list')
    const rowOf = (t) => page.locator('[data-testid="list-task-row"]', { hasText: t.title }).first()
    const fieldsPanel = page.locator('summary', { hasText: /^Fields \(/ }).first()
    const hasFieldsPanel = (await count(fieldsPanel)) > 0
    if (hasFieldsPanel) await fieldsPanel.click({ timeout: 5000 }).catch(() => {})
    const createField = hasFieldsPanel ? await count(page.getByText('Create new field', { exact: true })) : -1
    if (hasFieldsPanel) await page.keyboard.press('Escape').catch(() => {})
    // The first row's subtasks, opened: the subtask's row and its done circle.
    await rowOf(place.first).getByRole('button', { name: /^Expand subtasks$/ }).first().click({ timeout: 5000 }).catch(() => {})
    const subRow = page.locator('div.group\\/st', { hasText: place.subTitle }).first()
    await subRow.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
    const subShown = await count(subRow)
    const subDone = await count(subRow.getByRole('button', { name: /^Mark done$/ }))
    return {
      subShown,
      subDone,
      headerAdd: await count(page.getByRole('button', { name: /^Add task$/ })),
      groupAdd: await count(page.getByTestId('list-group-add-task')),
      doneFirst: await count(rowOf(place.first).getByRole('button', { name: /^Mark done$/ })),
      doneSecond: await count(rowOf(place.second).getByRole('button', { name: /^Mark done$/ })),
      priority: await count(rowOf(place.second).getByRole('button', { name: /^Change priority$/ })),
      due: await count(rowOf(place.second).locator('input[type="date"]')),
      select: await count(rowOf(place.second).getByRole('checkbox', { name: /^Select task$/ })),
      statuses: await count(page.getByRole('button', { name: /^Statuses$/ })),
      createField,
      rowOf,
    }
  }
  const shown = (o) => JSON.stringify({ ...o, rowOf: undefined })

  // ══ 1. A VIEW-ONLY SPACE ═════════════════════════════════════════════════
  console.log('\n▶ a list in a view-only space')
  const v = await offered(VIEW)
  chk(
    v.headerAdd === 0 && v.groupAdd === 0 && v.doneFirst === 0 && v.doneSecond === 0 && v.priority === 0 && v.due === 0
      && v.select === 0 && v.statuses === 0 && v.createField === 0 && v.subShown === 1 && v.subDone === 0,
    'in a view-only space the list page offers the member nothing to change: no Add task, no add row, no done circle — a subtask’s neither — priority, due date or selection on a row, no Statuses and no Create field',
    shown(v),
  )

  // ══ 2. A SPACE WHOSE DEFAULT IS EDIT ═════════════════════════════════════
  console.log('\n▶ a list in a space whose default is Edit')
  const e = await offered(EDIT)
  const before = (await row(EDIT.second.id))?.priority
  if (e.priority > 0) await e.rowOf(EDIT.second).getByRole('button', { name: /^Change priority$/ }).click({ timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(2000)
  const after = (await row(EDIT.second.id))?.priority
  chk(
    e.headerAdd === 0 && e.groupAdd === 0 && e.priority === 1 && e.due === 1 && e.doneSecond === 1 && e.select === 1
      && e.statuses === 1 && e.createField === 1 && e.subShown === 1 && e.subDone === 1 && after !== before,
    'where the default is Edit the rows are theirs to change — a new priority saves — with Statuses and Create field, and there is no Add task or add row, since adding takes Full edit',
    `${shown(e)}; the priority ${before} → ${after}`,
  )

  // ══ 3. A FULL EDIT SPACE ═════════════════════════════════════════════════
  console.log('\n▶ a list in a Full edit space: adding through a group’s row')
  const f = await offered(FULL)
  await page.getByTestId('list-group-add-task').first().click({ timeout: 5000 }).catch(() => {})
  const titleInput = page.getByTestId('list-group-add-title')
  await titleInput.fill(`${TAG} added by the member`, { timeout: 5000 }).catch(() => {})
  await titleInput.press('Enter').catch(() => {})
  await page.waitForTimeout(2500)
  const addedN = (await sql`select count(*)::int as n from tasks where title = ${`${TAG} added by the member`}`)[0].n
  chk(
    f.headerAdd >= 1 && f.groupAdd >= 1 && addedN === 1,
    'in a Full edit space the list offers Add task and an add row, and a task added through the row is made',
    `${shown(f)}; made ${addedN}`,
  )

  // ══ 4. A COMMENT SPACE, A TASK ASSIGNED TO THEM ══════════════════════════
  console.log('\n▶ a list in a comment-only space, one of its tasks assigned to the member')
  const c = await offered(COMMENT)
  const cBefore = (await row(COMMENT.first.id))?.status
  if (c.doneFirst > 0) await c.rowOf(COMMENT.first).getByRole('button', { name: /^Mark done$/ }).click({ timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(2500)
  const cAfter = (await row(COMMENT.first.id))?.status
  chk(
    c.doneFirst === 1 && c.doneSecond === 0 && c.priority === 0 && c.headerAdd === 0 && cAfter !== cBefore,
    'in a comment-only space the member may complete the task assigned to them — and completing it saves — and nothing else: no done circle on the other, no priority, no Add task',
    `${shown(c)}; their task ${cBefore} → ${cAfter}`,
  )

  // ══ 5. WHAT THE API ANSWERS ══════════════════════════════════════════════
  console.log('\n▶ what the API answers the member, list by list')
  const caps = {}
  for (const [k, p] of Object.entries({ view: VIEW, comment: COMMENT, edit: EDIT, full: FULL })) {
    const r = await M(`/tasks/list/${p.list}/capabilities`)
    caps[k] = r.status === 200 ? r.data : r.status
  }
  const is = (x, add, edit, comment, shape) =>
    x && x.add === add && x.edit === edit && x.comment === comment && x.statuses === shape && x.fields === shape
  chk(
    is(caps.view, false, false, false, false) && is(caps.comment, false, false, true, false) && is(caps.edit, false, true, true, true) && is(caps.full, true, true, true, true),
    'the API says what the list’s routes would: nothing in the view-only space, comments in the comment-only one, changes, statuses and fields where the default is Edit, and adding too where it is Full edit',
    JSON.stringify(caps),
  )

  // ══ 6. THE TABLE VIEW ════════════════════════════════════════════════════
  console.log('\n▶ the Table view, in the view-only list and where the default is Edit')
  const tableRow = (t) => page.locator(`[data-testid="list-table-row"][data-task-id="${t.id}"]`).first()
  const disabled = async (loc) => loc.first().isDisabled({ timeout: 5000 }).catch(() => null)
  /** Double-click a row's title: an editor gets its name to change, anybody else the task. */
  const renames = async (t) => {
    await tableRow(t).getByText(t.title, { exact: true }).first().dblclick({ timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(600)
    const n = await count(tableRow(t).locator('input:not([type="checkbox"])'))
    await page.keyboard.press('Escape').catch(() => {})
    return n
  }
  await openIn(VIEW, 'table')
  const tv = {
    add: await count(page.getByTestId('list-table-add-task')),
    statusCells: await count(page.getByTestId('list-table-status-button')),
    statusDisabled: await disabled(page.getByTestId('list-table-status-button')),
    priorityDisabled: await disabled(page.getByTestId('list-table-priority-button')),
    assigneeDisabled: await disabled(page.getByTestId('list-table-assignee-button')),
    dueDisabled: await disabled(page.getByTestId('list-table-due-button')),
    customOpen: await count(page.locator('[data-testid^="custom-cell-open-"]')),
    customRead: await count(page.locator('[data-testid^="custom-cell-readonly-"]')),
    select: await count(page.getByRole('checkbox', { name: /^Select / })),
  }
  tv.rename = await renames(VIEW.second)
  await openIn(COMMENT, 'table')
  const tc = {
    theirs: await tableRow(COMMENT.first).getByTestId('list-table-status-button').isEnabled({ timeout: 5000 }).catch(() => null),
    other: await tableRow(COMMENT.second).getByTestId('list-table-status-button').isEnabled({ timeout: 5000 }).catch(() => null),
  }
  await openIn(EDIT, 'table')
  const te = {
    customOpen: await count(page.locator('[data-testid^="custom-cell-open-"]')),
    rename: await renames(EDIT.second),
  }
  const statusBefore = (await row(EDIT.first.id))?.status
  const tRowE = tableRow(EDIT.first)
  const tStatusE = tRowE.getByTestId('list-table-status-button')
  const statusEnabled = await tStatusE.isEnabled({ timeout: 5000 }).catch(() => null)
  if (statusEnabled) {
    await tStatusE.click({ timeout: 5000 }).catch(() => {})
    await tRowE.getByRole('button', { name: /^In progress$/ }).first().click({ timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(2000)
  }
  const statusAfter = (await row(EDIT.first.id))?.status
  chk(
    tv.add === 0 && tv.statusCells >= 2 && tv.statusDisabled === true && tv.priorityDisabled === true && tv.assigneeDisabled === true
      && tv.dueDisabled === true && tv.customOpen === 0 && tv.customRead >= 2 && tv.select === 0 && tv.rename === 0
      && tc.theirs === true && tc.other === false
      && te.customOpen >= 2 && te.rename === 1 && statusEnabled === true && statusAfter !== statusBefore,
    'the Table view offers a view-only reader no add row and no cell to change — status, priority, assignees, due date, a field and the name read, not pressed — a comment-only one the status of the task assigned to them, and where the default is Edit every cell, a status cell saving a new status',
    `view-only ${JSON.stringify(tv)}; comment-only ${JSON.stringify(tc)}; Edit ${JSON.stringify(te)}, the status cell enabled ${statusEnabled}, the status ${statusBefore} → ${statusAfter}`,
  )

  // ══ 7. THE BOARD VIEW ════════════════════════════════════════════════════
  console.log('\n▶ the Board view, in the view-only list and in the Full edit one')
  const board = async (place) => {
    await openIn(place, 'board')
    const card = page.getByTestId('board-task-card').filter({ hasText: place.second.title }).first()
    return {
      cards: await count(page.getByTestId('board-task-card')),
      add: await count(page.getByTestId('board-column-add')),
      addGroup: await count(page.getByRole('button', { name: /^Add group$/ })),
      rename: await count(page.getByTitle('Click to rename this status')),
      dragDisabled: await card.getAttribute('aria-disabled', { timeout: 5000 }).catch(() => null),
    }
  }
  const bv = await board(VIEW)
  const bf = await board(FULL)
  chk(
    bv.cards >= 2 && bv.add === 0 && bv.addGroup === 0 && bv.rename === 0 && bv.dragDisabled === 'true'
      && bf.add >= 1 && bf.addGroup === 1 && bf.rename >= 1 && bf.dragDisabled === 'false',
    'the Board view gives a view-only reader no add row, no Add group, no column to rename and no card to drag to another status, and gives them all where the default is Full edit',
    `view-only ${JSON.stringify(bv)}; Full edit ${JSON.stringify(bf)}`,
  )

  // ══ 8. THE CALENDAR AND THE GANTT ════════════════════════════════════════
  console.log('\n▶ the Calendar and the Gantt, in the view-only list and in the Full edit one')
  // Each list's second task is given dates by the admin, so both views draw it.
  const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)
  for (const p of [VIEW, FULL]) {
    const dated = await A(`/tasks/${p.second.id}`, { method: 'PATCH', body: { startDate: day(-2), dueDate: day(0) } })
    if (!dated.ok) throw new Error(`could not date "${p.second.title}": ${said(dated)}`)
  }
  const calendar = async (p) => {
    await openIn(p, 'calendar', p.second)
    const item = page.locator('[data-testid="list-calendar"] button', { hasText: p.second.title }).first()
    return {
      shown: await count(item),
      draggable: await item.getAttribute('draggable', { timeout: 5000 }).catch(() => null),
      addDay: await count(page.getByRole('button', { name: /^Add task on this day$/ })),
    }
  }
  /**
   * Drag the task's bar six steps right. What the dates say after is read back
   * by SQL; whether the press opened the task is what the page did with it — a
   * refused move leaves the dates as they were too, so the dates alone cannot
   * tell a bar that was not offered from one that was, and failed.
   */
  const gantt = async (p) => {
    await openIn(p, 'gantt', p.second)
    const bar = page.locator(`div[role="button"][aria-label="${p.second.title}"]`).first()
    const box = await bar.boundingBox({ timeout: 10_000 }).catch(() => null)
    const before = (await row(p.second.id))?.due_date
    if (box) {
      const y = box.y + box.height / 2
      const x = box.x + Math.min(box.width / 2, 10)
      await page.mouse.move(x, y)
      await page.mouse.down()
      for (let i = 1; i <= 6; i++) await page.mouse.move(x + i * 25, y)
      await page.mouse.up()
    }
    await page.waitForTimeout(2500)
    const after = (await row(p.second.id))?.due_date
    const opened = await page.getByTestId('task-sheet').first().isVisible().catch(() => false)
    await page.keyboard.press('Escape').catch(() => {})
    return { bar: !!box, moved: String(before) !== String(after), opened }
  }
  const cv = await calendar(VIEW)
  const gv = await gantt(VIEW)
  const cf = await calendar(FULL)
  const gf = await gantt(FULL)
  chk(
    cv.shown >= 1 && cv.draggable === 'false' && cv.addDay === 0 && gv.bar && !gv.moved && gv.opened
      && cf.draggable === 'true' && cf.addDay > 0 && gf.bar && gf.moved && !gf.opened,
    'the Calendar and the Gantt give a view-only reader no day to add on and no task to move — a pressed bar stays where it was and opens the task — and where the default is Full edit a day offers Add and a dragged bar moves the task’s dates',
    `view-only: calendar ${JSON.stringify(cv)}, gantt ${JSON.stringify(gv)}; Full edit: calendar ${JSON.stringify(cf)}, gantt ${JSON.stringify(gf)}`,
  )

  // ══ 9. AN EMPTY LIST ═════════════════════════════════════════════════════
  console.log('\n▶ an empty list, in the view-only space and in the Full edit one')
  const empty = async (p) => {
    await page.goto(`${B}${p.emptyUrl}`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('work-view-tab-type-list').click({ timeout: 20_000 }).catch(() => {})
    const none = page.getByTestId('list-empty-none')
    await none.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
    await page.waitForTimeout(1500)
    return {
      shown: await count(none),
      create: await count(none.getByRole('button', { name: /^Create task$/ })),
      hint: await count(none.locator('kbd')),
    }
  }
  const ev = await empty(VIEW)
  const ef = await empty(FULL)
  chk(
    ev.shown === 1 && ev.create === 0 && ev.hint === 0 && ef.create === 1 && ef.hint === 1,
    'an empty list asks a view-only reader to add nothing — no Create task, no “press C” — and asks where the default is Full edit',
    `view-only ${JSON.stringify(ev)}; Full edit ${JSON.stringify(ef)}`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
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

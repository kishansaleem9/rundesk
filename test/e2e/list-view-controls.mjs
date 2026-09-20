/**
 * §M frame `12:10` — the three chips over a List view: `Group: Status`,
 * `Subtasks`, `Columns`.
 *
 * The frame is the whole specification here: the transcript around `[11:44]`
 * covers the Filter panel and never names these, so there is no narration to
 * lean on. Zoomed it is unambiguous — three rounded pills, each with a glyph,
 * the first tinted and NAMING ITS CURRENT VALUE.
 *
 * What was actually missing, after reading the route rather than assuming:
 *
 *   · Group by existed, as a `<select>` reading "By status" — the same
 *     information in a form that does not say what the control is.
 *   · Subtasks did not exist at all above the rows. Children were reachable
 *     only by clicking a chevron on each parent, one at a time.
 *   · `includeSubtasks=true` — the reference's "As separate tasks" — has been a
 *     supported parameter of `GET /tasks/list/:id` the whole time and NO WEB
 *     CODE HAS EVER SENT IT. Two python suites use it; the product could not.
 *   · Columns was a "Fields (n/m)" box that could hide only CUSTOM fields, so
 *     the columns every list has were the ones you could not touch — and the
 *     whole control was gated on the customFields ClickApp, which meant
 *     switching that off took away the ability to hide Due date.
 *
 * Runs against the REAL API, deliberately. A stubbed server could show that
 * the query string went out; only a real one can show that children come back
 * as rows, and that is the half that was dead.
 *
 *   node test/e2e/list-view-controls.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { apiClient, login, pickWorkspace, ensureSweepFixture } from './lib/fixture.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'

const chromium = await resolveChromium()
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". Exact, so a skipped branch is a failure. */
const EXPECTED_CHECKS = 40

const EMAIL = process.env.E2E_EMAIL ?? 'admin@rundesk.internal'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123!'
const REPO = path.resolve(import.meta.dirname, '../..')
const TAG = `lvc-${Date.now()}`

let stack = null
let B = (process.env.BASE ?? '').replace(/\/$/, '')
if (!B) {
  stack = await startLocalStack({
    dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')),
    apiPort: Number(argOf('--api', process.env.E2E_API_PORT ?? 3011)),
  })
  B = stack.base
}

const results = []
const ok = (m) => { results.push(1); console.log(`  \x1b[32mPASS\x1b[0m ${m}`) }
const bad = (m) => { results.push(0); console.log(`  \x1b[31mFAIL\x1b[0m ${m}`) }
const chk = (c, good, badMsg) => (c ? ok(good) : bad(badMsg ?? good))

const auth = await login(`${B}/api/v1`, EMAIL, PASSWORD)
const api = apiClient(`${B}/api/v1`, auth.accessToken)
const WS = process.env.E2E_WS ?? (await pickWorkspace(api)).id
const fixture = await ensureSweepFixture(api, WS)

/*
 * A parent with one child, made here rather than hoped for. Every claim below
 * about expanding, collapsing and separating is a claim about THESE two rows,
 * so the suite is not at the mercy of what another run left in the list.
 */
const PARENT_TITLE = `parent ${TAG}`
const CHILD_TITLE = `child ${TAG}`
const created = []
const parent = (await api('/tasks', { method: 'POST', body: { listId: fixture.listId, title: PARENT_TITLE } })).data
if (!parent?.id) throw new Error('could not create the parent task this suite is about')
created.push(parent.id)
const child = (await api('/tasks', {
  method: 'POST',
  body: { listId: fixture.listId, title: CHILD_TITLE, parentTaskId: parent.id },
})).data
if (!child?.id) throw new Error('could not create the subtask this suite is about')
created.push(child.id)
console.log(`\x1b[2m  workspace ${WS}, list ${fixture.listId}, parent ${parent.id}, child ${child.id}\x1b[0m`)

const browser = await chromium.launch(launchOptions())
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
const page = await ctx.newPage()

/*
 * Every list fetch this page makes, with its query string. This is the only
 * way to tell "the server was asked for children" apart from "the client
 * filtered something it already had" — and that distinction IS the item.
 */
const listCalls = []
page.on('request', (r) => {
  const u = r.url()
  if (u.includes(`/tasks/list/${fixture.listId}`) && !u.includes('/export')) listCalls.push(u)
})

const chipBox = (testId) => page.getByTestId(testId).boundingBox()
const rowFor = (id) => page.locator(`[data-testid="list-task-row"][data-task-id="${id}"]`)
const childVisible = () =>
  page.getByText(CHILD_TITLE, { exact: true }).first().isVisible().catch(() => false)

const chooseSubtaskMode = async (mode) => {
  // `<summary>` is the clickable half of a <details>; clicking the details
  // itself lands on whichever child is under the cursor.
  await page.getByTestId('list-subtasks').locator('summary').click()
  await page.getByTestId(`list-subtasks-${mode}`).click()
  await page.waitForTimeout(1200)
}

try {
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app\//, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click().catch(() => {})
  await page.goto(`${B}/app/${WS}/${fixture.listPath}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="list-view-controls"]', { timeout: 25_000 })
  // A saved default view from another run could land this on Board, where two
  // of the three chips deliberately do not exist. Say which view we are on.
  await page.getByTestId('work-view-tab-type-list').click()
  await page.waitForTimeout(1500)
  /*
   * NARROW THE LIST TO THIS RUN'S OWN TWO ROWS, and every row-level claim below
   * is about rows this suite made. The seeded list is shared; past a few
   * hundred rows the status group virtualises and a row created at the end is
   * not in the DOM at all, which reads exactly like the feature being broken.
   *
   * The filter does not weaken anything: it matches on title, the tag is in
   * both titles, and the nested child is drawn from the parent's `subtasks`
   * rather than from the filtered list.
   */
  await page.getByTestId('list-task-search').fill(TAG)
  await page.waitForTimeout(1200)

  console.log('\n▶ the three chips the frame shows, as the cluster it shows')
  const groupBox = await chipBox('list-group-chip')
  const subBox = await chipBox('list-subtasks')
  const colBox = await chipBox('list-columns')
  chk(!!groupBox && !!subBox && !!colBox, 'Group, Subtasks and Columns are all on the toolbar',
    `missing a chip: group=${!!groupBox} subtasks=${!!subBox} columns=${!!colBox}`)
  if (groupBox && subBox && colBox) {
    chk(
      await page.locator('[data-testid="list-view-controls"] [data-testid="list-group-chip"]').count() === 1 &&
        await page.locator('[data-testid="list-view-controls"] [data-testid="list-subtasks"]').count() === 1 &&
        await page.locator('[data-testid="list-view-controls"] [data-testid="list-columns"]').count() === 1,
      'all three are in one cluster, as the frame groups them',
      'the three chips are loose in the toolbar rather than grouped',
    )
    /*
     * MEASURED, not eyeballed: one row means one row. Loose in the toolbar the
     * wrap lands BETWEEN Group and Subtasks with every chip present and
     * correct — nothing reads as broken, and it is not what the frame shows.
     */
    const ys = [groupBox.y, subBox.y, colBox.y]
    chk(Math.max(...ys) - Math.min(...ys) <= 4, 'the three sit on one row',
      `tops were ${ys.map((y) => Math.round(y)).join(', ')} — the toolbar wrapped through the cluster`)
    /*
     * Order, and NOTHING BETWEEN THEM. x-order alone can be satisfied by a
     * wrapped layout, so the gap is measured too: the container's own `gap-2`
     * is 8px, and anything much wider means another control got in.
     */
    chk(groupBox.x < subBox.x && subBox.x < colBox.x, 'and in the frame\'s left-to-right order',
      `order was group@${Math.round(groupBox.x)} subtasks@${Math.round(subBox.x)} columns@${Math.round(colBox.x)}`)
    const gaps = [subBox.x - (groupBox.x + groupBox.width), colBox.x - (subBox.x + subBox.width)]
    chk(gaps.every((g) => g >= 0 && g <= 14), 'with nothing wedged between them',
      `the gaps measured ${gaps.map((g) => Math.round(g)).join('px, ')}px`)
    /*
     * A floor per KIND of control, from what this build actually measures — one
     * floor for all three would be set by the narrowest and would not notice
     * the widest collapsing.
     */
    const FLOORS = { group: 120, subtasks: 86, columns: 84 }
    chk(groupBox.width >= FLOORS.group, `the Group chip is at least ${FLOORS.group}px wide`,
      `the Group chip measured ${Math.round(groupBox.width)}px — "Group: Status" cannot be in there`)
    chk(subBox.width >= FLOORS.subtasks, `the Subtasks chip is at least ${FLOORS.subtasks}px wide`,
      `the Subtasks chip measured ${Math.round(subBox.width)}px`)
    chk(colBox.width >= FLOORS.columns, `the Columns chip is at least ${FLOORS.columns}px wide`,
      `the Columns chip measured ${Math.round(colBox.width)}px`)
    chk([groupBox, subBox, colBox].every((b) => b.height >= 24 && b.height <= 44),
      'and all three are one pill tall',
      `heights were ${[groupBox, subBox, colBox].map((b) => Math.round(b.height)).join(', ')}`)
  } else {
    // Same count either way, so a missing chip cannot shrink the run.
    for (let i = 0; i < 8; i++) bad('no chip geometry to measure')
  }

  console.log('\n▶ the Group chip names its current value `12:10`')
  const groupText = () => page.getByTestId('list-group-by').evaluate(
    (el) => el.options[el.selectedIndex]?.textContent?.trim() ?? '',
  )
  chk(await groupText() === 'Group: Status', 'it reads "Group: Status" on arrival',
    `it read ${JSON.stringify(await groupText())} — the frame's chip names the value, not the axis`)
  chk(await page.locator('[data-testid="list-group-chip"] svg').count() > 0,
    'and it carries a glyph, as all three chips do', 'the Group chip has no icon')
  await page.getByTestId('list-group-by').selectOption('assignee')
  await page.waitForTimeout(900)
  chk(await groupText() === 'Group: Assignee', 'changing the grouping changes what the chip says',
    `after switching to assignee the chip read ${JSON.stringify(await groupText())}`)
  await page.getByTestId('list-group-by').selectOption('status')
  await page.waitForTimeout(900)

  console.log('\n▶ the Subtasks menu — three options, and only three')
  await page.getByTestId('list-subtasks').locator('summary').click()
  await page.waitForTimeout(400)
  const optionTexts = await page.locator('[data-testid^="list-subtasks-"]').evaluateAll(
    (els) => els.map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim()),
  )
  chk(optionTexts.length === 3, 'the menu offers exactly three', `it offered ${optionTexts.length}: ${JSON.stringify(optionTexts)}`)
  chk(
    optionTexts[0]?.startsWith('Collapse all') &&
      optionTexts[1]?.startsWith('Expand all') &&
      optionTexts[2]?.startsWith('As separate tasks'),
    'and they are the reference\'s three, in its order',
    `the options read ${JSON.stringify(optionTexts)}`,
  )
  const checkedMode = async () => {
    const marks = await page.locator('[data-testid^="list-subtasks-"]').evaluateAll(
      (els) => els.map((e) => [e.getAttribute('data-testid'), e.getAttribute('aria-checked')]),
    )
    return marks.filter(([, c]) => c === 'true').map(([id]) => id)
  }
  chk(JSON.stringify(await checkedMode()) === JSON.stringify(['list-subtasks-collapsed']),
    'exactly one is ticked, and it is Collapse all',
    `ticked: ${JSON.stringify(await checkedMode())}`)
  await page.keyboard.press('Escape')
  await page.getByTestId('list-subtasks').evaluate((el) => { el.open = false })

  console.log('\n▶ Collapse all / Expand all move the rows')
  chk(!(await childVisible()), 'the child is out of sight while the mode is Collapse all',
    'a subtask was already on screen with the mode set to Collapse all')
  await chooseSubtaskMode('expanded')
  chk(await childVisible(), 'Expand all brings it into view without touching a chevron',
    'Expand all left the subtask hidden')
  chk(await page.getByTestId('list-subtasks').getAttribute('data-mode') === 'expanded',
    'and the chip says what it is set to', 'the chip did not record the mode')
  await chooseSubtaskMode('collapsed')
  chk(!(await childVisible()), 'Collapse all puts it away again', 'Collapse all left the subtask on screen')

  /*
   * THE CHECK THE STAMP EXISTS FOR. Expand all is an ACTION, not a state: a
   * row collapsed by hand must re-open when the menu item is chosen again.
   * Without the stamp the mode has not changed, nothing re-runs, and the
   * second press does nothing — on exactly the press a person would make.
   */
  console.log('\n▶ Expand all, twice, with a hand-collapse in between')
  await chooseSubtaskMode('expanded')
  const chevron = rowFor(parent.id).locator('button[aria-expanded]').first()
  chk(await chevron.count() > 0, 'the parent row has an expander of its own',
    'no per-row expander on the parent — the two halves cannot be told apart')
  await chevron.click()
  await page.waitForTimeout(700)
  chk(!(await childVisible()), 'collapsing that one row hides only that one row',
    'the per-row chevron did not collapse the parent')
  await chooseSubtaskMode('expanded')
  chk(await childVisible(), 'choosing Expand all again re-expands it',
    'the second Expand all did nothing — the menu item is dead on the press that matters')

  console.log('\n▶ As separate tasks — the parameter nothing had ever sent')
  const before = listCalls.length
  await chooseSubtaskMode('separate')
  const asked = await waitUntil(
    () => listCalls.slice(before).some((u) => u.includes('includeSubtasks=true')),
    { timeoutMs: 8_000 },
  )
  chk(asked, 'the page asks the server for the children (includeSubtasks=true)',
    `no request carried includeSubtasks: ${JSON.stringify(listCalls.slice(before))}`)
  chk(!listCalls.slice(0, before).some((u) => u.includes('includeSubtasks=true')),
    'and it had not been asking before — the other two modes do not',
    'includeSubtasks went out under a mode that is not "As separate tasks"')
  const separateRow = await waitUntil(() => rowFor(child.id).count().then((n) => n === 1), { timeoutMs: 8_000 })
  chk(separateRow, 'the child comes back as a row of its own',
    `the list drew ${await rowFor(child.id).count()} top-level rows for the child`)
  /*
   * The double-draw guard. With the tree still on, a child would be both a
   * top-level row AND nested under its parent — the rows would look right and
   * the count would be wrong, which is how this kind of bug survives.
   */
  chk(await page.getByText(CHILD_TITLE, { exact: true }).count() === 1,
    'and exactly once — not also nested under its parent',
    `the child's title appeared ${await page.getByText(CHILD_TITLE, { exact: true }).count()} times`)
  chk(await rowFor(parent.id).locator('button[aria-expanded]').count() === 0,
    'the parent loses its expander, having nothing left to expand',
    'the parent still offers a chevron while its child is a row of its own')
  await chooseSubtaskMode('collapsed')
  chk(await waitUntil(() => rowFor(child.id).count().then((n) => n === 0), { timeoutMs: 8_000 }),
    'going back to Collapse all takes the child row away again',
    'the child stayed a top-level row after the mode changed back')

  console.log('\n▶ Columns — the built-in ones, and only the ones this view draws')
  await page.getByTestId('list-columns').locator('summary').click()
  await page.waitForTimeout(400)
  const listCols = await page.locator('[data-testid^="list-column-"]').evaluateAll(
    (els) => els.map((e) => e.getAttribute('data-testid')).sort(),
  )
  /*
   * Three, not five. The list row has no status pill and no created date, so
   * offering those two here would be two switches that could change nothing —
   * and a control that cannot do what its label says reads as done.
   */
  chk(JSON.stringify(listCols) === JSON.stringify(['list-column-assignees', 'list-column-due', 'list-column-priority']),
    'the list view offers the three columns it actually draws',
    `it offered ${JSON.stringify(listCols)}`)
  chk(await page.locator('[data-testid="list-column-title"]').count() === 0,
    'Name is not on offer', 'the panel offered to hide the task name')
  const dueInputs = () => page.locator('[data-testid="list-task-row"] input[type="date"]').count()
  const dueBefore = await dueInputs()
  chk(dueBefore > 0, 'the rows are showing a due-date control to begin with',
    'no due-date control on any row, so hiding one proves nothing')
  await page.getByTestId('list-column-due').uncheck()
  await page.waitForTimeout(700)
  chk(await dueInputs() === 0, 'unticking Due date takes it off every row',
    `${await dueInputs()} rows still showed a due-date control`)
  await page.getByTestId('list-column-due').check()
  await page.waitForTimeout(700)
  chk(await dueInputs() === dueBefore, 'and re-ticking brings it back on all of them',
    `${await dueInputs()} rows have it back, out of ${dueBefore}`)
  chk(await page.locator('[data-testid="list-columns"] [data-testid="list-fields-panel"]').count() === 1,
    'the custom-fields section still lives inside this panel',
    'the customFields read site is no longer in the Columns panel — clickapps-plan reads it there')
  await page.getByTestId('list-columns').evaluate((el) => { el.open = false })

  console.log('\n▶ the table draws five, and hiding one moves the heading AND the cells')
  await page.getByTestId('work-view-tab-type-table').click()
  await page.waitForTimeout(1800)
  await page.getByTestId('list-columns').locator('summary').click()
  await page.waitForTimeout(400)
  const tableCols = await page.locator('[data-testid^="list-column-"]').evaluateAll(
    (els) => els.map((e) => e.getAttribute('data-testid')).sort(),
  )
  chk(
    JSON.stringify(tableCols) === JSON.stringify([
      'list-column-assignees', 'list-column-created', 'list-column-due',
      'list-column-priority', 'list-column-status',
    ]),
    'the table offers all five it draws',
    `it offered ${JSON.stringify(tableCols)}`,
  )
  /*
   * THE TRAP THIS CHECK IS HERE FOR. The header maps over a column array; the
   * body writes each cell out by hand. Filter only the array and a heading
   * goes while its cells stay, putting every row one column out of step with
   * its own heading — and it still looks like a table.
   */
  const statusHead = () => page.locator('[data-testid="list-table-head-status"]').count()
  const statusCells = () => page.locator('[data-testid="list-table-status-cell"]').count()
  const headBefore = await statusHead()
  const cellsBefore = await statusCells()
  chk(headBefore === 1 && cellsBefore > 0, 'the table has a Status heading and status cells to start with',
    `heading=${headBefore} statusCells=${cellsBefore} — nothing to compare`)
  await page.getByTestId('list-column-status').uncheck()
  await page.waitForTimeout(900)
  chk(await statusHead() === 0, 'hiding Status removes the Status heading',
    'the Status heading survived being switched off')
  chk(await statusCells() === 0, 'and every status CELL with it',
    `${await statusCells()} status cells survived their own heading — the rows are now one column out of step`)
  await page.getByTestId('list-column-status').check()
  await page.waitForTimeout(900)
  chk(await statusHead() === 1 && await statusCells() === cellsBefore,
    'and ticking it puts both back',
    `heading=${await statusHead()} cells=${await statusCells()}/${cellsBefore}`)
  await page.getByTestId('list-columns').evaluate((el) => { el.open = false })

  console.log('\n▶ both settings belong to the view, so the Save chip must notice')
  await page.getByTestId('work-view-tab-type-list').click()
  await page.waitForTimeout(1200)
  const saveChip = page.getByTestId('list-save-view')
  const sawSaveChipBefore = await saveChip.isVisible().catch(() => false)
  await chooseSubtaskMode('expanded')
  chk(await waitUntil(() => saveChip.isVisible().catch(() => false), { timeoutMs: 6_000 }),
    'changing the Subtasks mode marks the view unsaved',
    `the Save view chip did not appear (it was ${sawSaveChipBefore ? 'already' : 'not'} showing before)`)
  await chooseSubtaskMode('collapsed')
} catch (e) {
  bad(`threw: ${String(e?.message ?? e).split('\n')[0]}`)
  await page.screenshot({ path: '/tmp/claude-0/shots/list-view-controls-fail.png', fullPage: true }).catch(() => {})
} finally {
  /*
   * Everything this run made, taken back. A parent delete cascades to its
   * child, but both ids are sent because the order of that cascade is the
   * server's business, not this suite's.
   */
  for (const id of created.reverse()) {
    await api(`/tasks/${id}`, { method: 'DELETE' }).catch(() => {})
  }
  await browser.close().catch(() => {})
}

const failed = () => results.filter((x) => !x).length
if (results.length !== EXPECTED_CHECKS) {
  console.log(`  \x1b[31mFAIL\x1b[0m ran ${results.length} checks, expected ${EXPECTED_CHECKS}`)
  results.push(0)
}
console.log(`\n${results.length - failed()} passed, ${failed()} failed`)
await stack?.close?.()
process.exit(failed() ? 1 : 0)

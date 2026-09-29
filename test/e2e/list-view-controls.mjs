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

/**
 * "0 failed" is not "it ran". Exact, so a skipped branch is a failure.
 *
 * 40 → 49: the last nine cover two controls that live in this same toolbar and
 * this same list body and had no suite of their own — §V2-S13 `10:52`'s
 * per-group `+ Add Task` (four) and §V2-S13 `09:35`'s calendar `Today` (five).
 */
// 50 since 22 September: `b2-cluster` gives the wrapper `display: contents` and
// ran green — the chips stay adjacent at this viewport, so only the wrapper's
// own BOX can tell a cluster from three things side by side.
const EXPECTED_CHECKS = 50

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
// THE SENTENCE, THEN THE REASON: a failing check that printed only its reason
// named no check `check-break-reddened.mjs` could find when the reason was
// built from the run (`found-29-sep/failing-checks-print-only-their-reason`).
const chk = (c, good, badMsg) => (c ? ok(good) : bad(badMsg && badMsg !== good ? `${good} \u2014 ${badMsg}` : good))

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

const chipBox = (testId) => page.getByTestId(testId).boundingBox().catch(() => null)
const rowFor = (id) => page.locator(`[data-testid="list-task-row"][data-task-id="${id}"]`)
const childVisible = () =>
  page.getByText(CHILD_TITLE, { exact: true }).first().isVisible().catch(() => false)

const chooseSubtaskMode = async (mode) => {
  // `<summary>` is the clickable half of a <details>; clicking the details
  // itself lands on whichever child is under the cursor.
  // Both bounded: a check in this suite asserts the Subtasks menu exists, so a
  // patch can take it away, and bounding only the first press would move the
  // thirty seconds onto the second. Every caller checks what the mode DID, so
  // a press that never landed fails there rather than ending the section here.
  await page.getByTestId('list-subtasks').locator('summary').click({ timeout: 8000 }).catch(() => {})
  await page.getByTestId(`list-subtasks-${mode}`).click({ timeout: 8000 }).catch(() => {})
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
  // A GATE THAT REPORTS. `list-view-controls` is the subject of checks below,
  // so a patch that removes it defeats this wait first and the throw ends the
  // run before one check can name itself. Caught, so the checks below report
  // the absence instead of being replaced by a twenty-five-second exception.
  await page.waitForSelector('[data-testid="list-view-controls"]', { timeout: 25_000 }).catch(() => {})
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
     * AND THE CLUSTER IS A BOX, WHICH IS WHAT MAKES IT A CLUSTER.
     *
     * Everything above is satisfied by three chips that merely happen to be
     * adjacent. `b2-cluster` gives the wrapper `display: contents` — the element
     * and its testid survive, the three chips are still its DOM children, and at
     * this viewport nothing wraps, so the count check ("all three are in one
     * cluster") and the one-row check both passed and the patch ran GREEN.
     *
     * What `contents` removes is the wrapper's own box. Without it the chips are
     * laid out by the toolbar and wrap through the group at narrower widths,
     * which is the state the wrap came from. A box that contains all three is
     * the fact, and it is true at any width — so this is asserted here rather
     * than by resizing the viewport and hoping the wrap lands where the frame
     * would show it.
     */
    const clusterBox = await chipBox('list-view-controls')
    chk(
      !!clusterBox &&
        clusterBox.width > 0 &&
        clusterBox.x <= groupBox.x + 1 &&
        clusterBox.x + clusterBox.width >= colBox.x + colBox.width - 1,
      'and the cluster is a box of its own that holds all three',
      clusterBox
        ? `the cluster box ${JSON.stringify(clusterBox)} does not contain chips ending at ` +
          `x=${Math.round(colBox.x + colBox.width)}`
        : 'the cluster has no box at all — `display: contents` leaves the three laid out by the ' +
          'toolbar, so they wrap through the group at narrower widths',
    )
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
  // A closed select shows its selected option's label, and only while the select itself is shown.
  const groupText = () => page.getByTestId('list-group-by').filter({ visible: true }).evaluate(
    (el) => el.options[el.selectedIndex]?.textContent?.trim() ?? '', undefined, { timeout: 5000 },
  ).catch(() => '')
  chk(await groupText() === 'Group: Status', 'it reads "Group: Status" on arrival',
    `it read ${JSON.stringify(await groupText())} — the frame's chip names the value, not the axis`)
  chk(await page.locator('[data-testid="list-group-chip"] svg').count() > 0,
    'and it carries a glyph, as all three chips do', 'the Group chip has no icon')
  await page.getByTestId('list-group-by').selectOption('assignee', { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(900)
  chk(await groupText() === 'Group: Assignee', 'changing the grouping changes what the chip says',
    `after switching to assignee the chip read ${JSON.stringify(await groupText())}`)
  await page.getByTestId('list-group-by').selectOption('status', { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(900)

  console.log('\n▶ the Subtasks menu — three options, and only three')
  // Bounded: the menu this opens is asserted to exist elsewhere in the suite.
  // With it gone the read below comes back empty and the check reports "0
  // options", which is the finding — thirty seconds of nothing is not.
  await page.getByTestId('list-subtasks').locator('summary').click({ timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(400)
  // What the menu SHOWS: a closed menu still holds its items, and offers none of them.
  const optionTexts = await page.locator('[data-testid^="list-subtasks-"]').filter({ visible: true }).evaluateAll(
    (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()),
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
  /*
   * The read is the FIRST thing in the condition, so no `&&` stands in front of
   * it to short-circuit: a missing chip would sit out the default 30s and throw,
   * taking every check below it with it. Bound it, catch it, and compare for
   * 'expanded' — absence lands as null, which is not 'expanded', so it FAILS.
   */
  const chipMode = await page.getByTestId('list-subtasks')
    .getAttribute('data-mode', { timeout: 8000 }).catch(() => null)
  chk(chipMode === 'expanded',
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
  // Bounded for the same reason as the Subtasks menu above: with the control
  // gone the read below is empty and the check names the number it found.
  await page.getByTestId('list-columns').locator('summary').click({ timeout: 8000 }).catch(() => {})
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
  // Bounded and caught: the check above it is allowed to fail, and an unbounded
  // press on a control that is not there ends the section instead (ledger §10).
  await page.getByTestId('list-columns').locator('summary').click({ timeout: 10_000 }).catch(() => {})
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

  /*
   * ── §V2-S13 frame `10:52` — `+ Add Task` INSIDE a group ──────────────────
   *
   * The frame's List tab is grouped by status: a collapsible header, the
   * group's rows, then its own `+ Add Task` — and the empty `TO DO 0` group
   * still offers it. Rundesk's status groups grew one, but priority and
   * assignee groupings had none at all, and nothing anywhere proved that the
   * control creates into the group it sits in rather than into the list's
   * default status. A composer that lands the task in another group looks
   * right, reports success, and puts the row where it was not asked to go.
   */
  console.log('\n▶ every group carries its own + Add Task, empty ones included')
  const groupSections = page.locator('[data-testid="list-group"]')
  const groupCount = await groupSections.count()
  chk(groupCount >= 2, 'the list draws more than one status group to compare',
    `it drew ${groupCount} groups — with one there is no empty group to check`)
  const addPerGroup = await groupSections.evaluateAll((els) =>
    els.map((el) => el.querySelectorAll('[data-testid="list-group-add-task"]').length),
  )
  chk(addPerGroup.length > 0 && addPerGroup.every((n) => n === 1),
    'each one carries exactly one add control',
    `the groups carried ${JSON.stringify(addPerGroup)} add controls`)
  const emptyGroup = page.locator('[data-testid="list-group"][data-count="0"]').first()
  chk(await emptyGroup.count() === 1 &&
      await emptyGroup.locator('[data-testid="list-group-add-task"]').count() === 1,
    'including a group with nothing in it, which is the frame\'s `TO DO 0`',
    'an empty group offered no way to add to it — the case you most want it in')

  /*
   * THE CHECK WITH TEETH. Read back from the SERVER, and compared with the
   * group's own key: "a task was created" is true of the old quick-add too.
   */
  const targetGroup = await emptyGroup.getAttribute('data-group').catch(() => null)
  const GROUP_TITLE = `group add ${TAG}`
  // `list-view-controls-42-empty-group-no-add` takes the control away, which is
  // the check above: this click then waited out the default timeout and ended
  // the run at 44 of 49.
  //
  // AND THE FILL UNDER IT, which is where the same run ended the next time —
  // 45 of 50. Bounding the press and leaving the typing unbounded moves the
  // thirty seconds one line down: with no control to press there is no composer
  // to type into, and the two checks below have something to say about that.
  await emptyGroup.locator('[data-testid="list-group-add-task"]').click({ timeout: 8000 }).catch(() => {})
  await emptyGroup
    .locator('[data-testid="list-group-add-title"]')
    .fill(GROUP_TITLE, { timeout: 8000 })
    .catch(() => {})
  await page.keyboard.press('Enter')
  const landed = await waitUntil(async () => {
    const rows = (await api(`/tasks/list/${fixture.listId}`)).data ?? []
    return rows.some((r) => r.title === GROUP_TITLE)
  }, { timeoutMs: 12_000 })
  const rowsNow = (await api(`/tasks/list/${fixture.listId}`)).data ?? []
  const madeHere = rowsNow.find((r) => r.title === GROUP_TITLE)
  if (madeHere?.id) created.push(madeHere.id)
  chk(landed && !!madeHere, 'typing a title into a group\'s composer creates a task',
    'nothing was created from the group composer')
  chk(madeHere?.status === targetGroup,
    `and it lands in that group (${targetGroup}), not in the list's default status`,
    `the new task came back with status ${JSON.stringify(madeHere?.status)}, and the group was ${JSON.stringify(targetGroup)}`)

  /*
   * ── §V2-S13 frame `09:35` — the calendar's `Today` ───────────────────────
   *
   * The frame's calendar toolbar reads `Today` · `Month ▾` · `‹` `›` ·
   * `August 2026`. Rundesk had the two arrows and nothing else, and
   * `calendarMonth` is only ever MOVED by them — so once you had paged forward
   * there was no control that brought you back and you counted clicks. The
   * period is compared as a key rather than as the rendered heading, which is
   * locale-dependent and would make this a test of `toLocaleDateString`.
   */
  console.log('\n▶ the calendar has a Today, and it is the way back')
  await page.getByTestId('work-view-tab-type-calendar').click()
  // A GATE THAT REPORTS. This element is the subject of a check below, so a patch
  // that removes it defeats the gate first and the throw ends the section before
  // the check can name itself (ledger §10).
  await page.waitForSelector('[data-testid="list-calendar"]', { timeout: 20_000 }).catch(() => {})
  const todayBtn = page.getByTestId('list-calendar-today')
  const prevBtn = page.getByTestId('list-calendar-prev')
  /*
   * EVERY READ IN THIS SECTION ANSWERS INSTEAD OF THROWING. The gate above is
   * caught, so a patch that removes the calendar reaches these lines — and both
   * verbs wait for their element and throw when it never arrives. Two of the
   * reads below were written twice over, once in a condition and once in the
   * message beside it, and a `chk` message is evaluated whether the check
   * passes or fails: no `&&` in the condition can spare the second read.
   *
   * `null` is not a value any of these checks accept — the period comparisons
   * are `===` and `!==` against a string read the same way, and `disabled`
   * wants `true` or `false` — so an absent control still FAILS, in a sentence,
   * with the rest of the section reported.
   */
  const period = () =>
    page
      .getByTestId('list-calendar')
      .getAttribute('data-calendar-period', { timeout: 6000 })
      .catch(() => null)
  const todayOff = () => todayBtn.isDisabled({ timeout: 6000 }).catch(() => null)
  const todayBox = await todayBtn.boundingBox().catch(() => null)
  const prevBox = await prevBtn.boundingBox().catch(() => null)
  chk(!!todayBox && !!prevBox && todayBox.x < prevBox.x,
    'Today is on the toolbar, and leftmost as the frame draws it',
    `Today at ${todayBox ? Math.round(todayBox.x) : 'absent'}, Prev at ${prevBox ? Math.round(prevBox.x) : 'absent'}`)
  chk(await todayOff() === true,
    'and is inert while the calendar is already showing the current period',
    'Today was live on a calendar that had not moved — it cannot say where you are')
  const startPeriod = await period()
  await page.getByTestId('list-calendar-next').click()
  await page.getByTestId('list-calendar-next').click()
  await page.waitForTimeout(600)
  const movedPeriod = await period()
  const todayWoke = await todayOff()
  chk(movedPeriod !== startPeriod && todayWoke === false,
    'paging forward moves the calendar and wakes Today up',
    `the period went ${JSON.stringify(startPeriod)} → ${JSON.stringify(movedPeriod)}, ` +
      `Today disabled=${JSON.stringify(todayWoke)}`)
  await todayBtn.click()
  await page.waitForTimeout(600)
  const backPeriod = await period()
  chk(backPeriod !== null && backPeriod === startPeriod,
    'and one press brings it back to the current period',
    `after pressing Today the calendar sat on ${JSON.stringify(backPeriod)}, ` +
      `where it started on ${JSON.stringify(startPeriod)}`)
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

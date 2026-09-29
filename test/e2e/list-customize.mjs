/**
 * §V2-S13 frame `10:35` — "Stack fields", "Show empty fields" and "Collapse
 * empty columns", the three switches the Customize view panel draws directly
 * under Card size and Card cover; and §V2-07 frame `11:00` — the "⚡ Business
 * feature" caption under the export dialog's Download button.
 *
 * WHAT THE FRAME ACTUALLY SHOWS, re-extracted rather than taken from the row's
 * one-line summary. Frame `10:35` is a BOARD view, and the panel reads, top to
 * bottom: the view's name, `Card size  Medium ›`, `Card cover  Image ›`, then
 * `Stack fields` (off), `Show empty fields` (ON), `Collapse empty columns`
 * (off), then `More options ›`. Frame `11:00` is the SAME panel on the List
 * view and carries a different trio in the same place — Show task locations ·
 * Show subtask parent names · Show closed tasks. So these three are board
 * switches, and a check that they are absent on the list is a check that they
 * were not simply scattered everywhere the panel opens.
 *
 * EVERY CLAIM HERE IS ABOUT THE GRID, NOT ABOUT THE SWITCH.
 *
 *   The defect this row is most likely to become is its mirror — the one §1 of
 *   the ledger is made of: a labelled switch that saves, reads back, survives a
 *   reload and changes nothing on screen. `data-checked="true"` on the control
 *   is satisfied by exactly that build. So nothing below asserts a toggle's own
 *   state as evidence: the claims are the number of fields on a card, the y
 *   coordinates those fields sit at, the measured height of the card, and the
 *   `data-collapsed` of a lane. The break patches include one per switch that
 *   leaves the control working perfectly and reverts only its READER.
 *
 * THE PLAN CAPTION, and why it is in this file. Frame `11:00` puts "⚡ Business
 * feature" under the Download button, inside the open export dialog. Rundesk's
 * only pre-press signal was a padlock on the export section's own `<summary>`,
 * which is not on screen once the section is expanded — which is exactly where
 * a person is standing when they pick a format and press a button that cannot
 * work. The refusal itself is `paywall-sites.mjs`'s and is not re-tested here.
 *
 * ONE WORKSPACE, ONE COLUMN CHANGED. A new workspace comes up on `enterprise`,
 * so the entitled half runs first, the plan is then set to `free` by SQL, and
 * the locked half runs against the SAME list with the SAME tasks. Two
 * workspaces would have differed in their plan and in everything else about
 * them, and a claim that held on one and not the other would not say which
 * difference did it.
 *
 *   node test/e2e/list-customize.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { apiClient, login } from './lib/fixture.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil, readText } from './lib/wait.mjs'

const chromium = await resolveChromium()
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** Exact, with `!==`: a branch that skipped must not read as a shorter pass. */
const EXPECTED_CHECKS = 37

const EMAIL = process.env.E2E_EMAIL ?? 'admin@rundesk.internal'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123!'
const REPO = path.resolve(import.meta.dirname, '../..')
const TAG = `lcz-${Date.now()}`

let stack = null
let B = (process.env.BASE ?? '').replace(/\/$/, '')
if (!B) {
  stack = await startLocalStack({
    dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')),
    apiPort: Number(argOf('--api', process.env.E2E_API_PORT ?? 3011)),
  })
  B = stack.base
}
const API = `${B}/api/v1`

const results = []
const ok = (m) => { results.push(1); console.log(`  \x1b[32mPASS\x1b[0m ${m}`) }
const bad = (m) => { results.push(0); console.log(`  \x1b[31mFAIL\x1b[0m ${m}`) }
// THE SENTENCE, THEN THE REASON: a failing check that printed only its reason
// named no check `check-break-reddened.mjs` could find when the reason was
// built from the run (`found-29-sep/failing-checks-print-only-their-reason`).
const chk = (c, good, badMsg) => (c ? ok(good) : bad(badMsg && badMsg !== good ? `${good} \u2014 ${badMsg}` : good))

const auth = await login(API, EMAIL, PASSWORD)
const api = apiClient(API, auth.accessToken)

let sql = null
let browser = null
let ws = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — this suite sets a workspace plan directly')

  /*
   * This suite's OWN workspace, list and tasks. The board's lanes and the
   * heights of the cards in them are the measurements here, and neither can be
   * arranged in a list other suites are writing to.
   */
  const made = (await api('/workspaces', { method: 'POST', body: { name: `Customize ${TAG}` } })).data
  if (!made?.id) throw new Error('could not create this suite’s workspace')
  ws = made.id
  const spaceId = ((await api(`/spaces/workspace/${ws}`)).data ?? [])[0]?.id
  const projectId = spaceId ? ((await api(`/projects/space/${spaceId}`)).data ?? [])[0]?.id : null
  if (!spaceId || !projectId) throw new Error('the workspace came up without a project')
  // Through `POST /lists`, which seeds the default status pipeline. The
  // starter list is written straight into the table and has none, and this
  // suite needs named lanes — one with cards in it and one without.
  const listId = (await api('/lists', { method: 'POST', body: { projectId, name: `Customize ${TAG}` } })).data?.id
  if (!listId) throw new Error('could not make this suite’s list')
  const listPath = `${spaceId}/${projectId}/${listId}`
  const statuses = (await api(`/lists/${listId}/statuses`)).data ?? []
  const fullLane = (statuses.find((s) => s.category === 'open') ?? statuses[0])?.key
  /*
   * §V2-07 `11:00` — the closed status this suite parks a task in, so "Show
   * closed tasks" has something to remove.
   *
   * AND `emptyLane` NOW EXCLUDES IT, which is not fussiness. `emptyLane` was
   * "the first key that is not `fullLane`", and the board's "Collapse empty
   * columns" check requires that lane to be genuinely empty. Seeding a closed
   * task without this would, on any list whose second status happens to be a
   * closed one, put a card in the lane a later check asserts is empty — and
   * that check would fail four sections away from the line that caused it,
   * reading as a broken switch.
   */
  const closedLane = statuses.find((s) => s.category === 'closed')?.key
  const emptyLane = statuses.map((s) => s.key).find((k) => k && k !== fullLane && k !== closedLane)
  if (!fullLane || !emptyLane) throw new Error(`the list came up with ${statuses.length} status(es); two are needed`)
  if (!closedLane) throw new Error('the list came up with no closed status; "Show closed tasks" needs one')

  const me = auth.user?.id ?? auth.userId
  const newTask = async (body) => {
    const res = await api('/tasks', { method: 'POST', body: { listId, ...body } })
    // `apiClient` never throws — it returns `{status, data, error}` — so a
    // failed seed has to be read off the status or the whole run measures an
    // empty board and blames the switches for it.
    if (res.status >= 300 || !res.data?.id) {
      throw new Error(`seeding "${body.title}" returned ${res.status} ${JSON.stringify(res.error)}`)
    }
    return res.data.id
  }
  /*
   * ONE CARD WITH EVERY FIELD FILLED and one with none of them, in the SAME
   * lane. "Show empty fields" is the difference between them, and comparing a
   * card against itself under two settings is the only comparison that cannot
   * be satisfied by the two cards simply being different.
   */
  const fullId = await newTask({
    title: `full ${TAG}`,
    status: fullLane,
    dueDate: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    assigneeIds: me ? [me] : undefined,
  })
  await newTask({ title: `child ${TAG}`, status: fullLane, parentTaskId: fullId })
  const bareId = await newTask({ title: `bare ${TAG}`, status: fullLane })
  /*
   * §V2-07 `11:00` — A CLOSED PARENT WITH AN OPEN CHILD, and the pairing is
   * the point rather than convenience.
   *
   * "Show subtask parent names" resolves a parent's title out of the rows this
   * page has, and the temptation is to resolve it out of the VISIBLE rows,
   * which is one line shorter and wrong: a parent can be filtered off the
   * screen while its child stays. This pair is that case, made with controls
   * the suite already drives — hide closed tasks, and the parent goes while
   * the child remains. A build that read the filtered set would then draw no
   * parent name, which looks exactly like "this row has no parent".
   */
  const shutId = await newTask({ title: `shut ${TAG}`, status: closedLane })
  const orphanId = await newTask({ title: `orphan ${TAG}`, status: fullLane, parentTaskId: shutId })

  browser = await chromium.launch(launchOptions())
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 } })
  const page = await ctx.newPage()

  /** Every saved-view write this page makes, with its body. */
  const viewWrites = []
  page.on('request', (r) => {
    if (/\/views(\/|\?|$)/.test(r.url()) && (r.method() === 'POST' || r.method() === 'PATCH')) {
      try { viewWrites.push(JSON.parse(r.postData() ?? '{}')) } catch { viewWrites.push({}) }
    }
  })

  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click().catch(() => {})

  const openBoard = async () => {
    await page.goto(`${B}/app/${ws}/${listPath}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="list-view-controls"]', { timeout: 25_000 })
    await page.getByTestId('work-view-tab-type-board').click()
    await waitUntil(() => card(fullId).count().then((n) => n === 1), { timeoutMs: 15_000 })
  }
  /*
   * `> summary` is the panel's OWN toggle. `locator('summary')` is a
   * descendant search and this panel is a `<details>` with more `<details>`
   * inside it — the export section and the two Card rows — so that expression
   * matches several and Playwright refuses in strict mode, correctly.
   */
  const openDetails = async (details, settleMs = 400) => {
    // Bounded: a `<details>` a patch has removed is a failing check below, not
    // thirty seconds and a dead run.
    if (!(await details.evaluate((el) => el.open).catch(() => true))) {
      await details.locator('> summary').click({ timeout: 8000 }).catch(() => {})
    }
    await page.waitForTimeout(settleMs)
  }
  const panel = () => page.getByTestId('list-customize')
  const openPanel = () => openDetails(panel())
  const closePanel = async () => {
    await panel().evaluate((el) => { el.open = false })
    await page.waitForTimeout(250)
  }
  /*
   * BOUNDED, AND IT REPORTS RATHER THAN THROWS.
   *
   * Every switch this suite is about is a switch one of its patches removes, so
   * an unqualified click here is thirty seconds and an exception that ends the
   * run. Four patches did exactly that — `list-trio-1-no-trio` reported
   * `3 passed, 4 failed` with `ran 6 checks, expected exactly 37`, thirty-one
   * checks never reported under a headline about the harness.
   *
   * Returning a boolean rather than throwing means a caller that ignores it
   * simply goes on to find the setting unchanged, which is the honest failure:
   * the check that reads the setting reports its own sentence and the run
   * reaches its own totals.
   */
  const flip = async (testId) => {
    await openPanel()
    const clicked = await page
      .getByTestId(testId)
      .click({ timeout: 8000 })
      .then(() => true)
      .catch(() => false)
    await page.waitForTimeout(500)
    await closePanel()
    return clicked
  }

  const card = (id) => page.locator(`[data-testid="board-task-card"][data-task-id="${id}"]`)
  const meta = (id) => card(id).locator('[data-testid="board-card-meta"]')
  /*
   * A trailing hyphen on the prefix, deliberately. `board-card-meta` starts
   * with `board-card-` too, and `^="board-card-field"` without the hyphen
   * would also match a testid called `board-card-fields` the day somebody adds
   * one. A prefix is a namespace and it is counted here, so it is spelled so
   * that only the fields land in it.
   */
  const fieldsOf = (id) => card(id).locator('[data-testid^="board-card-field-"]')
  const heightOf = async (id) => (await card(id).boundingBox().catch(() => null))?.height ?? 0
  const lane = (key) => page.locator(`[data-testid="board-column"][data-status="${key}"]`)

  await openBoard()

  // ── the panel, where the frame puts it ────────────────────────────────────
  console.log('\n▶ frame `10:35` — three switches, under Card size and Card cover')
  await openPanel()
  const order = await page
    .locator('[data-testid="list-board-settings"] [role="switch"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
  chk(
    JSON.stringify(order) ===
      JSON.stringify(['list-board-stack-fields', 'list-board-show-empty-fields', 'list-board-collapse-empty']),
    'the three switches are there, in the frame’s order',
    `the board block held ${JSON.stringify(order)}`,
  )
  const arrival = await page
    .locator('[data-testid="list-board-settings"] [role="switch"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-checked')))
  chk(
    JSON.stringify(arrival) === JSON.stringify(['false', 'true', 'false']),
    'and at the frame’s own positions — stack off, empties shown, columns open',
    `they arrived as ${JSON.stringify(arrival)}; the frame reads off / ON / off`,
  )
  await closePanel()

  console.log('\n▶ frame `11:00` — the LIST view’s panel is a different trio')
  await page.getByTestId('work-view-tab-type-list').click()
  await page.waitForTimeout(900)
  await openPanel()
  chk(
    await page.getByTestId('list-board-settings').count() === 0,
    'they are not offered on the list, where there are no cards or lanes to change',
    'the board switches are drawn on the List view — three labelled controls over a grid they cannot alter',
  )
  /*
   * AND THE LIST'S OWN THREE ARE IN THAT SLOT. The check above says the board's
   * are absent; on its own that is satisfied by an empty gap, which is what
   * this view had. Both halves or neither.
   */
  const listSwitch = (name) => page.getByTestId(`list-show-${name}`)
  const listTrio = await Promise.all(
    ['task-locations', 'subtask-parents', 'closed'].map((n) => listSwitch(n).count()),
  )
  const trioBlock = await page.getByTestId('list-list-settings').count()
  chk(
    trioBlock === 1 && listTrio.every((n) => n === 1),
    'the List view carries its own trio there — task locations, subtask parent names, closed tasks',
    `list-list-settings ${trioBlock}, switches ${JSON.stringify(listTrio)} ` +
      '— frame `11:00` puts three switches where frame `10:35` puts the board\'s three',
  )
  /*
   * READ ONCE INTO A VARIABLE, then assert the variable — and the failure
   * message says the variable too.
   *
   * A `chk`'s third argument is an ARGUMENT: it is built before `chk` is
   * called, whether the check passes or fails. A message that awaits a locator
   * therefore runs on every pass, and on the run where that locator matches
   * nothing it throws a 30-second timeout from inside a check that was about
   * to report a clean FAIL — which is how the first run of this section ended
   * with "threw" instead of a sentence naming what was wrong. `.count()` is
   * the one locator call that answers 0 rather than waiting; everything else
   * has to be read before it is described.
   */
  const checkedOf = async (name) =>
    (await listSwitch(name).count()) === 1 ? await listSwitch(name).getAttribute('data-checked') : null
  const locationsAtRest = await checkedOf('task-locations')
  const parentsAtRest = await checkedOf('subtask-parents')
  chk(
    locationsAtRest === 'false' && parentsAtRest === 'false',
    'and the two new ones start off, which is where the frame draws them',
    `locations ${locationsAtRest}, parents ${parentsAtRest} — ` +
      'frame `11:00` shows both switches in the off position',
  )
  await closePanel()

  /*
   * ONE SETTING, TWO DOORS. `showClosed` already had a toolbar chip; the panel
   * is a second way to reach it, not a second copy of it. Two controls each
   * holding their own `useState` agree right up until one of them is used, and
   * then the screen holds two answers to one question — the duplicated-list
   * defect with a UI on it, which this audit has found five times elsewhere.
   * So it is checked in BOTH directions: either one alone passes on a build
   * where the panel writes into the chip's state and never reads it back.
   */
  console.log('\n▶ `11:00` + `11:41` — the Closed switch and the Closed chip are one setting')
  const chipActive = () =>
    page.getByTestId('list-toggle-closed').getAttribute('data-active').catch(() => null)
  /*
   * AN EMPTY CLOSED GROUP IS NOT DRAWN AT ALL, and the first version of this
   * check did not know that. `GroupedListView` filters its groups with
   * `length > 0 || category === 'open' || category === 'in_progress'`: an
   * empty To-do lane stays so you can add to it, an empty Done lane goes. So
   * the evidence that the closed task left is the GROUP leaving, not a count
   * falling to zero — and asserting the count would have waited thirty seconds
   * for an element the product is right not to render.
   */
  const closedGroup = () => page.locator(`[data-testid="list-group"][data-group="${closedLane}"]`)
  const closedBefore = (await closedGroup().count()) === 1 ? await closedGroup().getAttribute('data-count') : null
  await flip('list-show-closed')
  const chipAfterPanel = await chipActive()
  chk(
    chipAfterPanel === 'true',
    'turning the panel switch off moves the toolbar chip with it',
    `the chip's data-active read ${chipAfterPanel} after the panel switch was turned off — ` +
      'the panel is a second door onto one setting, not a second setting',
  )
  const closedGone = await waitUntil(() => closedGroup().count().then((n) => n === 0), { timeoutMs: 8000 })
  chk(
    closedBefore === '1' && closedGone,
    'and the closed task really leaves the list, off the group that held it',
    `the ${closedLane} group held data-count=${closedBefore} before and ${await closedGroup().count()} ` +
      'group(s) remain after — a switch whose only effect is its own state is the mirror defect this ' +
      'panel has produced once already',
  )
  await page.getByTestId('list-toggle-closed').click()
  await page.waitForTimeout(500)
  await openPanel()
  const panelAfterChip = await checkedOf('closed')
  chk(
    panelAfterChip === 'true',
    'and pressing the toolbar chip moves the panel switch back, which is the other direction',
    `the panel switch read data-checked=${panelAfterChip} after the CHIP was pressed — ` +
      'writing into one shared value and reading from a private one passes the first check and fails here',
  )
  await closePanel()

  // ── the two annotations, which is where the switches become real ──────────
  console.log('\n▶ `11:00` — "Show task locations" names the list a row lives in')
  await flip('list-show-task-locations')
  const locationChip = page.locator(`[data-testid="task-row-location-${bareId}"]`)
  const locationText = await waitUntil(() => locationChip.count().then((n) => n === 1), { timeoutMs: 8000 })
    ? ((await locationChip.textContent()) ?? '').trim()
    : null
  chk(
    locationText === `Customize ${TAG}`,
    'a row gains the name of the list it is in, read off the row rather than off the URL',
    `the location chip read ${JSON.stringify(locationText)}, expected ${JSON.stringify(`Customize ${TAG}`)} — ` +
      'resolved from the task\'s own listId, so it is right by construction rather than by the route agreeing',
  )

  console.log('\n▶ `11:00` — "Show subtask parent names", where a subtask is a row of its own')
  await openDetails(page.getByTestId('list-subtasks'))
  await page.getByTestId('list-subtasks-separate').click()
  await waitUntil(
    () => page.locator(`[data-testid="list-task-row"][data-task-id="${orphanId}"]`).count().then((n) => n === 1),
    { timeoutMs: 15_000 },
  )
  await flip('list-show-subtask-parents')
  const parentChip = (id) => page.locator(`[data-testid="task-row-parent-${id}"]`)
  const parentText = await waitUntil(() => parentChip(orphanId).count().then((n) => n === 1), { timeoutMs: 8000 })
    ? ((await parentChip(orphanId).textContent()) ?? '').trim()
    : null
  chk(
    parentText === `shut ${TAG}`,
    'a subtask row says which task it belongs to',
    `the parent chip on the subtask read ${JSON.stringify(parentText)}, expected ${JSON.stringify(`shut ${TAG}`)}`,
  )

  /*
   * THE ONE THAT DECIDES WHERE THE LOOKUP READS FROM. The parent is closed;
   * hiding closed tasks takes it off the screen and leaves its child there.
   * A build that resolved the title against the VISIBLE rows now draws nothing
   * — and nothing is what a row with no parent draws, so the bug would look
   * like correct behaviour on a task that has a parent.
   *
   * AND THE SWITCH IS CYCLED AFTERWARDS, WHICH IS THE ONLY REASON THIS CHECK
   * WORKS. Written the obvious way — hide the closed tasks, then look — it
   * passed against the broken build too, and the break patch that swaps
   * `tasks` for `visibleTasks` came back 37/37. The annotations are a `useMemo`
   * keyed on `[tasks, …the two switches…]`; hiding closed tasks changes
   * `visibleTasks` and NOT one of those keys, so the memo does not re-run and
   * the wrong build keeps serving the map it built while the parent was still
   * visible. The check was reading a cached correct answer and calling it
   * evidence.
   *
   * Turning the switch off and on again moves a key the memo is watching, so
   * the map is rebuilt with the closed parent already off the screen — which
   * is the state the claim is actually about. A check that only holds because
   * a cache has not been invalidated is the confident zero in memo form.
   */
  await flip('list-show-closed')
  await waitUntil(() => closedGroup().count().then((n) => n === 0), { timeoutMs: 8000 })
  await flip('list-show-subtask-parents')
  await flip('list-show-subtask-parents')
  const orphanedText = (await parentChip(orphanId).count()) === 1
    ? ((await parentChip(orphanId).textContent()) ?? '').trim()
    : null
  chk(
    orphanedText === `shut ${TAG}`,
    'and it still says so when the parent itself has been filtered off the screen',
    `with closed tasks hidden the chip read ${JSON.stringify(orphanedText)} — the parent is resolved from ` +
      'every row the page holds, not from the ones that survived the filter, because a hidden parent is ' +
      'not an absent one',
  )
  await flip('list-show-closed')

  await closePanel()
  await page.getByTestId('work-view-tab-type-board').click()
  await waitUntil(() => card(fullId).count().then((n) => n === 1), { timeoutMs: 15_000 })

  // ── Stack fields ──────────────────────────────────────────────────────────
  console.log('\n▶ "Stack fields" — the card’s fields move to their own lines')
  /*
   * CENTRES, NOT TOPS, for the unstacked row — and this is not a detail. The
   * flat layout is `items-center`, and the three fields are not the same
   * height (the assignee stack is a 20px avatar, the other two are 11px text),
   * so their TOPS differ by a few pixels while they are plainly on one line.
   * A check on tops would have failed on the correct build and passed on a
   * stacked one only by accident. The stacked layout is compared by tops,
   * because there the claim is that each field starts below the last.
   */
  const centresOf = () =>
    fieldsOf(fullId).evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect()
        return Math.round(r.top + r.height / 2)
      }),
    )
  const flatCentres = await centresOf()
  chk(
    flatCentres.length >= 2 && Math.max(...flatCentres) - Math.min(...flatCentres) <= 2,
    `unstacked, the card’s fields share one row (${flatCentres.length} fields, ` +
      `${Math.max(...flatCentres) - Math.min(...flatCentres)}px apart)`,
    `the unstacked fields centred at ${JSON.stringify(flatCentres)} — expected two or more on one line`,
  )
  const flatHeight = await heightOf(fullId)
  await flip('list-board-stack-fields')
  chk(
    (await meta(fullId).getAttribute('data-stacked').catch(() => null)) === 'true',
    'switching it on reaches the card’s field block',
    `the card’s meta block reported data-stacked=${JSON.stringify(
      await meta(fullId).getAttribute('data-stacked').catch(() => null),
    )}`,
  )
  const stackedTops = await fieldsOf(fullId).evaluateAll((els) =>
    els.map((e) => Math.round(e.getBoundingClientRect().top)),
  )
  const strictlyDown = stackedTops.every((y, i) => i === 0 || y - stackedTops[i - 1] >= 8)
  chk(
    stackedTops.length === flatCentres.length && strictlyDown,
    `and every field starts below the last (${stackedTops.length} fields at ${JSON.stringify(stackedTops)})`,
    `stacked, the fields sat at tops ${JSON.stringify(stackedTops)} — a "stack" that leaves them on one row, ` +
      'or drops one of them on the way, is a class name rather than a layout',
  )
  const stackedHeight = await heightOf(fullId)
  chk(
    stackedHeight > flatHeight + 8,
    `the card grows with them (${Math.round(flatHeight)}px → ${Math.round(stackedHeight)}px)`,
    `the card measured ${Math.round(flatHeight)}px flat and ${Math.round(stackedHeight)}px stacked — ` +
      'the rows are drawn on top of each other, which is a layout that photographs as working',
  )
  await flip('list-board-stack-fields')
  chk(
    Math.abs((await heightOf(fullId)) - flatHeight) <= 4,
    'and switching it back off returns the card to the height it was',
    `after switching back it measured ${Math.round(await heightOf(fullId))}px against ${Math.round(flatHeight)}px — ` +
      'the switch is one-way, which is the second press doing nothing',
  )

  // ── Show empty fields ─────────────────────────────────────────────────────
  console.log('\n▶ "Show empty fields" — the card keeps the fields it has no value for')
  const bareShown = await fieldsOf(bareId).evaluateAll((els) =>
    els.map((e) => `${e.getAttribute('data-testid')}:${e.getAttribute('data-filled')}`).sort(),
  )
  chk(
    JSON.stringify(bareShown) ===
      JSON.stringify([
        'board-card-field-assignees:false',
        'board-card-field-due:false',
        'board-card-field-subtasks:false',
      ]),
    'a task with nothing set still draws its three fields, each marked empty',
    `the bare card drew ${JSON.stringify(bareShown)}`,
  )
  const bareWithEmpties = await heightOf(bareId)
  await flip('list-board-show-empty-fields')
  chk(
    await fieldsOf(bareId).count() === 0 && await meta(bareId).count() === 0,
    'switching it off takes them off the card entirely',
    `the bare card still drew ${await fieldsOf(bareId).count()} field(s) with empties hidden`,
  )
  chk(
    (await heightOf(bareId)) < bareWithEmpties - 8,
    `and the card shrinks by them (${Math.round(bareWithEmpties)}px → ${Math.round(await heightOf(bareId))}px)`,
    `the bare card measured ${Math.round(bareWithEmpties)}px with empties and ` +
      `${Math.round(await heightOf(bareId))}px without — the placeholders are hidden rather than removed`,
  )
  /*
   * THE OTHER HALF, and the one a build that simply hid the whole meta block
   * would fail: a card that HAS values must keep them. "Show empty fields" off
   * is not "show no fields".
   */
  const fullWithoutEmpties = await fieldsOf(fullId).evaluateAll((els) =>
    els.map((e) => `${e.getAttribute('data-testid')}:${e.getAttribute('data-filled')}`).sort(),
  )
  chk(
    JSON.stringify(fullWithoutEmpties) ===
      JSON.stringify([
        'board-card-field-assignees:true',
        'board-card-field-due:true',
        'board-card-field-subtasks:true',
      ]),
    'while a card that has values keeps every one of them',
    `the filled card drew ${JSON.stringify(fullWithoutEmpties)} with empties hidden`,
  )
  await flip('list-board-show-empty-fields')

  // ── Collapse empty columns ────────────────────────────────────────────────
  console.log('\n▶ "Collapse empty columns" — the lane with nothing in it folds')
  chk(
    await lane(emptyLane).getAttribute('data-count') === '0' &&
      (await lane(fullLane).getAttribute('data-count')) !== '0',
    'the board has one empty lane and one with cards in it',
    `lanes reported counts ${await lane(emptyLane).getAttribute('data-count')} and ` +
      `${await lane(fullLane).getAttribute('data-count')} — without both, the next three checks compare nothing`,
  )
  chk(
    await lane(emptyLane).getAttribute('data-collapsed') === 'false',
    'and with the switch off it is open, as the frame shows it',
    'the empty lane was already collapsed before the switch was touched',
  )
  /*
   * MEASURED ON THE LANE'S BODY, NOT ON THE LANE.
   *
   * The board is a CSS grid: every column stretches to the tallest in its row,
   * and `BoardColumn`'s wrapper carries `min-h-40` as well. So a collapsed
   * lane and an open one have the SAME bounding box, and a height comparison
   * on the column would report the collapse as broken on a build where it
   * works. The thing that actually goes away is the cards area, and it is
   * measured while it is there so that "it is gone" is not satisfied by its
   * never having been drawn.
   */
  const openBodyHeight =
    (await lane(emptyLane).getByTestId('board-column-body').boundingBox().catch(() => null))?.height ?? 0
  await flip('list-board-collapse-empty')
  chk(
    await lane(emptyLane).getAttribute('data-collapsed') === 'true',
    'switching it on folds the empty lane',
    `the empty lane reported data-collapsed=${JSON.stringify(await lane(emptyLane).getAttribute('data-collapsed'))}`,
  )
  chk(
    await lane(fullLane).getAttribute('data-collapsed') === 'false',
    'and leaves the lane that has cards alone',
    'the lane with cards in it was collapsed too — "collapse empty columns" collapsed every column',
  )
  /*
   * DRAWN as well as reported. `data-collapsed="true"` on a lane that still
   * draws its cards area is the attribute saying one thing and the grid doing
   * another, which is the exact shape of the defect this file exists to catch.
   * The `> 20` half is what stops this passing vacuously on a board where the
   * body was never drawn at all.
   */
  chk(
    openBodyHeight > 20 && (await lane(emptyLane).getByTestId('board-column-body').count()) === 0,
    `and the lane’s cards area really is gone (it measured ${Math.round(openBodyHeight)}px while open)`,
    `the empty lane's body measured ${Math.round(openBodyHeight)}px open and there are still ` +
      `${await lane(emptyLane).getByTestId('board-column-body').count()} of them after the fold`,
  )
  /*
   * THE CHEVRON STILL WORKS. Keyed as `manual OR auto`, the chevron on an
   * auto-collapsed lane is a control that moves and changes nothing; keyed as
   * `manual XOR auto`, a press records a difference from the default and opens
   * it. This is the check that tells the two implementations apart.
   */
  await lane(emptyLane).getByTestId('board-column-toggle').click()
  await page.waitForTimeout(400)
  chk(
    (await lane(emptyLane).getAttribute('data-collapsed')) === 'false' &&
      (await lane(emptyLane).getByTestId('board-column-body').count()) === 1,
    'and the lane’s own chevron still opens it, rather than being outvoted by the switch',
    'pressing the chevron on an auto-collapsed lane did nothing — the switch wins every press for ever',
  )
  await flip('list-board-collapse-empty')

  /*
   * ── they belong to the VIEW ──────────────────────────────────────────────
   *
   * SAVE FIRST, THEN CHANGE ONE. The obvious order — flip a switch and assert
   * the Save-view chip appeared — cannot fail here, because every flip above
   * has already dirtied the config and the chip has been up since the first
   * one. It would read as a causal claim and mean "the chip is on screen".
   * Saving resets the fingerprint and takes the chip down, so the flip after
   * it is the only thing that can bring it back.
   */
  console.log('\n▶ and the three are part of the view, not of this page load')
  await flip('list-board-stack-fields')
  await page.evaluate(() => { window.prompt = () => 'stacked board' })
  const before = viewWrites.length
  /*
   * Bounded, and the chip's state recorded FIRST — because the check two below
   * asserts the chip goes DOWN, and a chip that was never there is down. With
   * the press caught rather than throwing, that absence would have read as a
   * successful save. `chipWasUp` is what tells the two apart.
   */
  const chipWasUp = await page.getByTestId('list-save-view').isVisible().catch(() => false)
  await page.getByTestId('list-save-view').click({ timeout: 8000 }).catch(() => {})
  chk(
    await waitUntil(
      () => viewWrites.slice(before).some((b) => b?.config?.stackFields === true),
      { timeoutMs: 10_000 },
    ),
    'saving the view writes the switches with it',
    `the view writes carried ${JSON.stringify(viewWrites.slice(before).map((b) => b?.config?.stackFields))}`,
  )
  chk(
    chipWasUp &&
      (await waitUntil(() => page.getByTestId('list-save-view').isVisible().catch(() => false).then((v) => !v), { timeoutMs: 8_000 })),
    'and the Save chip goes down once it is saved',
    chipWasUp
      ? 'the Save view chip stayed up after a successful save, so the check below cannot mean anything'
      : 'the Save view chip was never up, so it going down says nothing about saving',
  )
  await flip('list-board-collapse-empty')
  chk(
    await waitUntil(() => page.getByTestId('list-save-view').isVisible().catch(() => false), { timeoutMs: 8_000 }),
    'changing one afterwards marks that saved view unsaved again',
    'the Save view chip never came back — the switches are not part of the view config',
  )

  // ── frame `11:00` — the caption under Download ────────────────────────────
  console.log('\n▶ on a plan that INCLUDES the board download, the dialog says nothing about plans')
  const entitled = (await api(`/workspaces/${ws}/plan`)).data
  chk(
    entitled?.features?.boardExport === true,
    `this workspace starts entitled (plan ${JSON.stringify(entitled?.plan)})`,
    `the workspace reported boardExport=${entitled?.features?.boardExport} — ` +
      'without an entitled starting point the caption check below measures nothing',
  )
  await openPanel()
  await openDetails(page.getByTestId('list-export-section'), 300)
  chk(
    await page.getByTestId('list-export-plan-note').count() === 0,
    'no caption is shown to somebody whose plan already includes it',
    'the export dialog told a paying customer that the download is a paid feature',
  )

  /*
   * THE ONE COLUMN. Set here rather than through an endpoint because
   * `workspaces.plan` is written by a super-admin route this account may not
   * hold; nothing else about the workspace, the list or the tasks changes.
   */
  await sql`update workspaces set plan = 'free' where id = ${ws}`
  await openBoard()

  console.log('\n▶ frame `11:00` — and on a plan that does not, it names the tier')
  await openPanel()
  await openDetails(page.getByTestId('list-export-section'), 300)
  const note = page.getByTestId('list-export-plan-note')
  chk(
    await waitUntil(() => note.count().then((n) => n === 1), { timeoutMs: 8_000 }),
    'the open export dialog carries the plan caption, beside the button it is about',
    'the board export dialog offered a Download and no word about why it cannot work — ' +
      'the padlock is on the summary, which is not on screen once the section is open',
  )
  /*
   * READ THE CAPTION ONLY IF THERE IS ONE, because the check above is allowed
   * to fail and the two below have to survive it.
   *
   * `list-customize-10-no-caption` removes the block entirely — the state this
   * row was in before the caption was built — and the first check reddened
   * exactly as it should. Then `note.getAttribute('data-plan')` on a locator
   * matching nothing waited its 30 seconds and THREW, which ended the section:
   * 33 of 37 checks ran, and the four that did not include the anti-drift check
   * that is the whole reason the caption resolves its own tier. A patch
   * credited with reddening one check while silencing three.
   *
   * Absent reads as `null` and empty here, and both checks below then report
   * their own sentences about a caption that is not there.
   */
  const present = (await note.count()) > 0
  const noteText = present ? await readText(note) : ''
  const notePlan = present ? await note.getAttribute('data-plan') : null
  chk(
    notePlan === 'business' && noteText.trim().length > 0,
    `it names Business, the cheapest tier that includes the board export (read ${JSON.stringify(noteText.trim())})`,
    `the caption reported data-plan=${JSON.stringify(notePlan)} with text ${JSON.stringify(noteText)}`,
  )
  /*
   * THE ANTI-DRIFT CHECK. The caption and the gate dialog are two readers of
   * one plan catalog: `feature-gate.tsx`'s `upgradeTarget` is the first and is
   * not exported, so the list route resolves the tier itself. That is only
   * safe while something fails when the two disagree, and this is it.
   */
  await page.getByTestId('list-export-download').click()
  chk(
    await waitUntil(() => page.getByTestId('feature-gate').isVisible().catch(() => false), { timeoutMs: 10_000 }),
    'pressing Download still opens the gate that teaches',
    'the board Download did nothing visible on a plan that does not include it',
  )
  // Read once, bounded and caught: the check above is ALLOWED to find the gate
  // absent, and when it is absent so is its plan label. A `chk` message is
  // evaluated whether the check passes or fails, so the second read here would
  // end the section rather than report which tier was offered.
  const gatePlan = await page
    .getByTestId('feature-gate-plan')
    .getAttribute('data-plan', { timeout: 6000 })
    .catch(() => null)
  chk(
    gatePlan === notePlan,
    'and the caption names the same tier the gate offers',
    `the caption said ${JSON.stringify(notePlan)} and the dialog offers ` +
      `${JSON.stringify(gatePlan)} — ` +
      'two readers of one catalog have drifted, and the cheaper of the two is a wrong price on a label',
  )
  await page.getByTestId('feature-gate-close').click()
  await page.waitForTimeout(400)

  /*
   * `[10:49]` "Lekin agar aap ke paas premium nahi [hai] to aap LIST VIEW
   * download karo." Same workspace, same Free plan, same panel and the same
   * button — only the view underneath changed. A caption here is this row's
   * version of the gate spreading onto the download she says stays free.
   */
  console.log('\n▶ `[10:49]` — and the free list download is captioned with nothing')
  await page.getByTestId('work-view-tab-type-list').click()
  await page.waitForTimeout(1200)
  await openPanel()
  await openDetails(page.getByTestId('list-export-section'), 300)
  const exportView = await page
    .getByTestId('list-export-section')
    .getAttribute('data-export-view', { timeout: 6000 })
    .catch(() => null)
  chk(
    exportView === 'list',
    'standing on List, the panel is about the list download',
    `the panel said it would export ${JSON.stringify(exportView)}`,
  )
  chk(
    await page.getByTestId('list-export-plan-note').count() === 0,
    'which carries no plan caption at all',
    'the free list export is captioned as a paid feature — the caption has spread past the gate',
  )

  await ctx.close()
} catch (e) {
  bad(`threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  if (sql) {
    /*
     * The whole fixture, by name. `workspaces` cascades to spaces → projects →
     * lists → tasks; and it matters more than usual here because this one ends
     * the run carrying a `free` plan that another suite's `pickWorkspace`
     * could otherwise wander into.
     */
    await sql`delete from workspaces where name like ${'%' + TAG}`.catch(() => {})
    await sql.end({ timeout: 5 }).catch(() => {})
  }
  await stack?.close?.()
}

const failed = () => results.filter((x) => !x).length
if (results.length !== EXPECTED_CHECKS) {
  console.log(`  \x1b[31mFAIL\x1b[0m ran ${results.length} checks, expected exactly ${EXPECTED_CHECKS}`)
  results.push(0)
}
console.log(`\n${results.length - failed()} passed, ${failed()} failed`)
process.exit(failed() ? 1 : 0)

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
const EXPECTED_CHECKS = 29

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
const chk = (c, good, badMsg) => (c ? ok(good) : bad(badMsg ?? good))

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
  const emptyLane = statuses.map((s) => s.key).find((k) => k && k !== fullLane)
  if (!fullLane || !emptyLane) throw new Error(`the list came up with ${statuses.length} status(es); two are needed`)

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
    if (!(await details.evaluate((el) => el.open))) await details.locator('> summary').click()
    await page.waitForTimeout(settleMs)
  }
  const panel = () => page.getByTestId('list-customize')
  const openPanel = () => openDetails(panel())
  const closePanel = async () => {
    await panel().evaluate((el) => { el.open = false })
    await page.waitForTimeout(250)
  }
  const flip = async (testId) => {
    await openPanel()
    await page.getByTestId(testId).click()
    await page.waitForTimeout(500)
    await closePanel()
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
  const heightOf = async (id) => (await card(id).boundingBox())?.height ?? 0
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
    await meta(fullId).getAttribute('data-stacked') === 'true',
    'switching it on reaches the card’s field block',
    `the card’s meta block reported data-stacked=${JSON.stringify(await meta(fullId).getAttribute('data-stacked'))}`,
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
    (await lane(emptyLane).getByTestId('board-column-body').boundingBox())?.height ?? 0
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
  await page.getByTestId('list-save-view').click()
  chk(
    await waitUntil(
      () => viewWrites.slice(before).some((b) => b?.config?.stackFields === true),
      { timeoutMs: 10_000 },
    ),
    'saving the view writes the switches with it',
    `the view writes carried ${JSON.stringify(viewWrites.slice(before).map((b) => b?.config?.stackFields))}`,
  )
  chk(
    await waitUntil(() => page.getByTestId('list-save-view').isVisible().catch(() => false).then((v) => !v), { timeoutMs: 8_000 }),
    'and the Save chip goes down once it is saved',
    'the Save view chip stayed up after a successful save, so the check below cannot mean anything',
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
  const noteText = await readText(note)
  const notePlan = await note.getAttribute('data-plan')
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
  chk(
    await page.getByTestId('feature-gate-plan').getAttribute('data-plan') === notePlan,
    'and the caption names the same tier the gate offers',
    `the caption said ${JSON.stringify(notePlan)} and the dialog offers ` +
      `${JSON.stringify(await page.getByTestId('feature-gate-plan').getAttribute('data-plan'))} — ` +
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
  chk(
    await page.getByTestId('list-export-section').getAttribute('data-export-view') === 'list',
    'standing on List, the panel is about the list download',
    `the panel said it would export ${JSON.stringify(await page.getByTestId('list-export-section').getAttribute('data-export-view'))}`,
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

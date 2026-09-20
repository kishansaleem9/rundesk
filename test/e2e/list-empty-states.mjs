/**
 * §V2-S13 frame `11:30` — THE CONFIDENT ZERO, on the list body.
 *
 * The frame's empty list reads "You don't have any tasks assigned to you."
 * over "To see all tasks, <u>turn off Me Mode.</u>" — it names the filter that
 * emptied it and links the way back.
 *
 * Rundesk branched on `visibleTasks.length === 0` alone and printed
 * `list.noTasksYet` ("No tasks yet"), the hint "press C to add the first" and a
 * **Create task** button. So a list holding five hundred tasks, with one word
 * typed into the in-list search that matched none of them, told you the list
 * was empty and invited you to create the first one. Nothing on that screen
 * named the search, the assignee select, the filter rules or the Closed
 * toggle, and nothing cleared them.
 *
 * WHAT THIS ASSERTS, and why a weaker version of it would pass on the bug:
 *
 *   "An empty state renders" passes BEFORE the fix — there was always an empty
 *   state, it just said the wrong thing. So the check with teeth is that the
 *   two states are DIFFERENT STRINGS, that the filtered one NAMES the filter
 *   that produced it, and that the button on it puts the rows back. All three
 *   are false of the old code and none of them is satisfied by rendering a box.
 *
 * NARROWED BY CONSTRUCTION. The e2e database is shared, and "this list is
 * genuinely empty" is not a claim anyone can make about a list other suites
 * are writing to. So this makes its own list, and everything below is about
 * that list and the rows this run put in it.
 *
 *   node test/e2e/list-empty-states.mjs --api 3011 --dist apps/web/dist
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
 * Exact, with `!==`. With `<`, a branch that quietly skipped becomes a shorter
 * run that still reports "0 failed" — and half this suite is branches.
 */
const EXPECTED_CHECKS = 23

const EMAIL = process.env.E2E_EMAIL ?? 'admin@rundesk.internal'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123!'
const REPO = path.resolve(import.meta.dirname, '../..')
const TAG = `les-${Date.now()}`
/** A term that cannot match any title, here or in anybody else's rows. */
const NO_MATCH = `zzz-${TAG}-nomatch`

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
 * A LIST OF THIS RUN'S OWN. `apiClient` never throws — it returns
 * {status, data, error} — so the status is checked rather than a `.catch`
 * that would read a 403 as success and leave every check below asserting
 * against somebody else's list.
 */
const madeList = await api('/lists', {
  method: 'POST',
  body: { projectId: fixture.projectId, name: `Empty states ${TAG}` },
})
if (madeList.status >= 300 || !madeList.data?.id) {
  throw new Error(`could not make this suite's own list: ${madeList.status} ${JSON.stringify(madeList.error)}`)
}
const listId = madeList.data.id
const listPath = `${fixture.spaceId}/${fixture.projectId}/${listId}`

const statuses = (await api(`/lists/${listId}/statuses`)).data ?? []
const openStatus = statuses.find((s) => s.category === 'open') ?? statuses[0]
const closedStatus = statuses.find((s) => s.category === 'closed')

const created = []
const browser = await chromium.launch(launchOptions())
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
const page = await ctx.newPage()

const visible = (testId) => page.getByTestId(testId).isVisible().catch(() => false)
const countOf = (testId) => page.getByTestId(testId).count()
const textOfId = async (testId) =>
  (await page.getByTestId(testId).innerText().catch(() => '')).replace(/\s+/g, ' ').trim()

/**
 * An attribute off an element that may not exist, without a 30-second wait.
 *
 * `locator.getAttribute()` on a selector matching nothing blocks until it times
 * out, which inside a `waitUntil` spends the whole budget on the first poll.
 * `evaluateAll` over zero elements returns `[]` at once.
 */
const attrOf = async (selector, name) =>
  (await page.locator(selector).evaluateAll((els, n) => els.map((e) => e.getAttribute(n)), name))[0] ?? null

/**
 * WHAT IS ACTUALLY NARROWING THE LIST, for a failure to say on sight.
 *
 * Three of the checks below are "press Clear and the rows come back", and they
 * can fail two very different ways: nothing was cleared, or everything was
 * cleared and the rows are not drawn. A bare row count cannot tell them apart,
 * so every one of them reports the controls' own values and the empty state's
 * own `data-filters` beside the count — and each says which Clear it was,
 * because two checks with the same failure text are one failure you cannot
 * place.
 */
const narrowState = async () => {
  const search = await page.getByTestId('list-task-search').inputValue().catch(() => '<absent>')
  const assignee = await page.getByTestId('list-assignee-filter').inputValue().catch(() => '<absent>')
  const axes = await attrOf('[data-testid="list-empty-filtered"]', 'data-filters')
  return (
    `search=${JSON.stringify(search)} assignee=${JSON.stringify(assignee)} ` +
    `data-filters=${axes === null ? '<no filtered empty state>' : JSON.stringify(axes)} ` +
    `rows-drawn=${await countOf('list-task-row')}`
  )
}

const gotoList = async () =>
  page.goto(`${B}/app/${WS}/${listPath}`, { waitUntil: 'domcontentloaded' })

try {
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app\//, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click().catch(() => {})

  // ── 1. A list that really is empty ────────────────────────────────────────
  console.log('\n▶ a list with nothing in it says so, and offers to start it')
  await gotoList()
  await page.waitForSelector('[data-testid="list-task-search"]', { timeout: 25_000 })
  const sawNone = await waitUntil(() => visible('list-empty-none'), { timeoutMs: 15_000 })
  chk(sawNone, 'the empty-list state renders on a list with no rows',
    'no empty-list state on a list this run created and never wrote to')
  chk(await countOf('list-empty-filtered') === 0,
    'and the filtered state is not the one on screen',
    'a list with nothing in it claimed a filter had emptied it')
  const emptyListText = await textOfId('list-empty-none')
  chk(/create task/i.test(emptyListText),
    'it offers to create the first task, which is the right invitation here',
    `the empty-list state read ${JSON.stringify(emptyListText)}`)

  // ── 2. Rows, then a filter that hides all of them ─────────────────────────
  /*
   * Created through the API and then picked up by a RELOAD, not by waiting.
   * `apps/web/src/lib/query.ts:6` sets `staleTime: 30_000`, so the page that
   * has already fetched this list will not fetch it again for half a minute —
   * a check that waited would be asserting over the empty array it already
   * had. A fresh document is a fresh QueryClient, which is a cache miss by
   * construction.
   */
  console.log('\n▶ three rows, and a search term that matches none of them')
  for (let i = 0; i < 3; i++) {
    const made = await api('/tasks', {
      method: 'POST',
      body: {
        listId,
        title: `empty-state row ${TAG}-${i}`,
        ...(openStatus?.key ? { status: openStatus.key } : {}),
      },
    })
    if (made.status >= 300 || !made.data?.id) {
      throw new Error(`seeding row ${i} returned ${made.status} ${JSON.stringify(made.error)}`)
    }
    created.push(made.data.id)
  }
  await gotoList()
  await page.waitForSelector('[data-testid="list-task-search"]', { timeout: 25_000 })
  const rowsShowing = await waitUntil(() => countOf('list-task-row').then((n) => n === 3), { timeoutMs: 15_000 })
  chk(rowsShowing, 'all three rows are on screen before anything is filtered',
    `the list drew ${await countOf('list-task-row')} rows, not 3`)

  await page.getByTestId('list-task-search').fill(NO_MATCH)
  const sawFiltered = await waitUntil(() => visible('list-empty-filtered'), { timeoutMs: 10_000 })
  chk(sawFiltered, 'a search that matches nothing produces the FILTERED empty state',
    'a search that hid every row still produced the "no tasks yet" state — the confident zero')
  chk(await countOf('list-empty-none') === 0,
    'and the empty-list state is gone, not both at once',
    'both empty states rendered together')

  /*
   * ── THE CHECK THIS FILE EXISTS FOR ───────────────────────────────────────
   *
   * Two strings, compared. "An empty state renders" is true of the bug; "the
   * two empty states say different things" is the whole fix. If a future edit
   * collapses them back into one component with one copy, this is the check
   * that goes red, and nothing else here would.
   */
  const filteredText = await textOfId('list-empty-filtered')
  chk(
    filteredText.length > 0 && filteredText !== emptyListText,
    'the filtered state says something DIFFERENT from the empty-list state',
    `both empty states read ${JSON.stringify(filteredText)} — a filtered list is still claiming to be an empty one`,
  )
  chk(
    !/create task/i.test(filteredText),
    'and it does not invite you to create a task that the filter would immediately hide',
    `the filtered state offers Create task: ${JSON.stringify(filteredText)}`,
  )

  console.log('\n▶ it names the filter that emptied it, and counts what is hidden')
  chk(
    filteredText.includes(NO_MATCH),
    'the search term itself is on screen',
    `the filtered state never named the search: ${JSON.stringify(filteredText)}`,
  )
  const axes = (await page.getByTestId('list-empty-filtered').getAttribute('data-filters')) ?? ''
  chk(axes.split(',').filter(Boolean).join(',') === 'search',
    'and the search is the only narrowing it claims',
    `it reported the active narrowings as ${JSON.stringify(axes)}`)
  const hiddenAttr = await page.getByTestId('list-empty-filtered').getAttribute('data-hidden-count')
  chk(hiddenAttr === '3', 'it reports the three rows the filter is hiding',
    `it said ${JSON.stringify(hiddenAttr)} rows were hidden, out of 3 this run created`)
  chk((await textOfId('list-empty-filtered-count')).includes('3'),
    'and says so in words, not only in an attribute',
    `the count line read ${JSON.stringify(await textOfId('list-empty-filtered-count'))}`)

  console.log('\n▶ and it offers the way back')
  chk(await visible('list-empty-clear-filters'), 'there is a control to clear the filters',
    'the filtered empty state has no undo — the frame\'s "turn off Me Mode" has no equivalent')
  await page.getByTestId('list-empty-clear-filters').click()
  const backAgain = await waitUntil(() => countOf('list-task-row').then((n) => n === 3), { timeoutMs: 10_000 })
  chk(backAgain, 'pressing it puts all three rows back',
    `the SEARCH clear left: ${await narrowState()} — expected 3 rows`)
  chk(await page.getByTestId('list-task-search').inputValue() === '',
    'and empties the search box it was complaining about',
    `the search box still holds ${JSON.stringify(await page.getByTestId('list-task-search').inputValue())} — ` +
      'the rows came back for some other reason')

  // ── 3. More than one axis at once ─────────────────────────────────────────
  /*
   * The single-axis version of Clear is the easy one. Two axes is where a
   * "clear" that only resets the control it was written for leaves the list
   * still empty and the button looking dead — so both are set, both are named,
   * and both must be gone afterwards.
   */
  console.log('\n▶ two narrowings at once are both named, and both cleared')
  await page.getByTestId('list-task-search').fill(NO_MATCH)
  await page.getByTestId('list-assignee-filter').selectOption('__unassigned__').catch(() => {})
  const twoAxes = await waitUntil(async () => {
    if (!(await visible('list-empty-filtered'))) return false
    const a = (await page.getByTestId('list-empty-filtered').getAttribute('data-filters')) ?? ''
    return a.includes('search') && a.includes('assignees')
  }, { timeoutMs: 10_000 })
  chk(twoAxes, 'both the search and the assignee filter are named',
    `the narrowings were ${JSON.stringify(await page.getByTestId('list-empty-filtered').getAttribute('data-filters'))}`)
  await page.getByTestId('list-empty-clear-filters').click()
  const bothCleared = await waitUntil(async () => {
    const search = await page.getByTestId('list-task-search').inputValue()
    const assignee = await page.getByTestId('list-assignee-filter').inputValue()
    return search === '' && assignee === ''
  }, { timeoutMs: 10_000 })
  chk(bothCleared, 'and one press clears both of them',
    `the TWO-AXIS clear left: ${await narrowState()} — ` +
      'a Clear that resets one control leaves the list empty and itself looking dead')
  chk(await waitUntil(() => countOf('list-task-row').then((n) => n === 3), { timeoutMs: 10_000 }),
    'the rows are back after the two-axis clear',
    `the TWO-AXIS clear left: ${await narrowState()} — expected 3 rows`)

  // ── 4. The axis that is not a text box ────────────────────────────────────
  /*
   * "Show closed tasks" empties the list without anything being typed. It is
   * the case the old copy was most wrong about — the rows exist, they are
   * finished, and the screen said the list had never had anything in it.
   */
  console.log('\n▶ hiding closed tasks is a narrowing too, and is named as one')
  if (closedStatus?.key) {
    for (const id of created) {
      const patched = await api(`/tasks/${id}`, { method: 'PATCH', body: { status: closedStatus.key } })
      if (patched.status >= 300) throw new Error(`closing ${id} returned ${patched.status}`)
    }
    await gotoList()
    await page.waitForSelector('[data-testid="list-toggle-closed"]', { timeout: 25_000 })
    /*
     * COUNTED ON THE GROUP, NOT IN THE DOM — and this is not a convenience.
     *
     * `GroupedListView` starts every closed-category group COLLAPSED, on
     * purpose, so the active work is visible first (`$listId.tsx:3379-3385`,
     * rows gated at `:3573`). Three finished tasks are therefore three rows
     * that are not rendered at all, and `list-task-row` reads 0 whether the
     * Clear button worked or not. Counting them here does not measure the
     * claim; it measures a collapse default, and it blames Clear for it.
     *
     * The group's own `data-count` is the size of the FILTERED SET, is
     * rendered whether the group is open or shut, and is exactly the claim:
     * "those three rows are back in what the list is showing".
     */
    const closedGroupCount = () =>
      attrOf(`[data-testid="list-group"][data-group="${closedStatus.key}"]`, 'data-count')
    const seeded = await waitUntil(async () => (await closedGroupCount()) === '3', { timeoutMs: 15_000 })
    if (!seeded) throw new Error(`the closed group holds ${await closedGroupCount()} of 3 before the toggle was touched`)
    await page.getByTestId('list-toggle-closed').click()
    const closedEmpty = await waitUntil(() => visible('list-empty-filtered'), { timeoutMs: 10_000 })
    chk(closedEmpty, 'switching closed tasks off gives the filtered state, not the empty-list one',
      'a list of finished work reported itself as a list that had never had anything in it')
    const closedAxes = (await page.getByTestId('list-empty-filtered').getAttribute('data-filters')) ?? ''
    chk(closedAxes.split(',').filter(Boolean).join(',') === 'closed',
      'and names the Closed toggle as the reason',
      `it reported ${JSON.stringify(closedAxes)}`)
    await page.getByTestId('list-empty-clear-filters').click()
    const restored = await waitUntil(
      async () => !(await visible('list-empty-filtered')) && (await closedGroupCount()) === '3',
      { timeoutMs: 10_000 },
    )
    chk(restored,
      'and Clear switches it back on, with all three rows in the filtered set again',
      `the CLOSED clear left: ${await narrowState()}, ` +
        `and the ${closedStatus.key} group holds ${JSON.stringify(await closedGroupCount())} of 3`)
  } else {
    // Same count either way, so a list without a closed status cannot shorten
    // the run into a pass.
    for (let i = 0; i < 3; i++) bad('this list has no closed status, so the Closed axis could not be exercised')
  }

  // ── 5. Back to genuinely empty ────────────────────────────────────────────
  /*
   * The other direction, and the one a naive fix breaks: once `tasks.length`
   * is what decides, deleting the rows has to bring the ORIGINAL state back.
   * A fix that latched on "a filter was once active" would keep showing the
   * filtered state over a list that now really is empty.
   */
  console.log('\n▶ delete the rows and the empty-list state comes back')
  for (const id of created.splice(0)) {
    const gone = await api(`/tasks/${id}`, { method: 'DELETE' })
    if (gone.status >= 300) throw new Error(`deleting ${id} returned ${gone.status}`)
  }
  await gotoList()
  await page.waitForSelector('[data-testid="list-task-search"]', { timeout: 25_000 })
  const noneAgain = await waitUntil(() => visible('list-empty-none'), { timeoutMs: 15_000 })
  chk(noneAgain, 'an emptied list says "no tasks yet" again',
    'after the rows were deleted the list still claimed a filter was hiding them')
  chk(await textOfId('list-empty-none') === emptyListText,
    'and says exactly what it said the first time',
    `it now reads ${JSON.stringify(await textOfId('list-empty-none'))}, ` +
      `where it first read ${JSON.stringify(emptyListText)}`)
} catch (e) {
  bad(`threw: ${String(e?.message ?? e).split('\n')[0]}`)
  await page.screenshot({ path: '/tmp/claude-0/shots/list-empty-states-fail.png', fullPage: true }).catch(() => {})
} finally {
  // Everything this run made, taken back — including the list itself, because
  // a list left behind changes what the NEXT suite's `lists[0]` is.
  for (const id of created.reverse()) await api(`/tasks/${id}`, { method: 'DELETE' })
  await api(`/lists/${listId}`, { method: 'DELETE' })
  await browser.close().catch(() => {})
}

const failed = () => results.filter((x) => !x).length
if (results.length !== EXPECTED_CHECKS) {
  console.log(`  \x1b[31mFAIL\x1b[0m ran ${results.length} checks, expected exactly ${EXPECTED_CHECKS}`)
  results.push(0)
}
console.log(`\n${results.length - failed()} passed, ${failed()} failed`)
await stack?.close?.()
process.exit(failed() ? 1 : 0)

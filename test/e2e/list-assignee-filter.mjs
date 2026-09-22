/**
 * §V2-07 frame `11:30` — the list toolbar's assignee control, and the popover
 * that hangs off it.
 *
 * WHAT THE FRAME DRAWS, re-extracted and zoomed. The toolbar's right-hand
 * group reads `⧩ Filter · ⊘ Closed · ⚇ Assignee  <face ✕> · 🔍 · ⚙ Customize ·
 * Add Task ▾` — so the assignee filter is a chip that opens a picker and the
 * chosen person is a FACE beside it with an `✕` badge on it, not a name inside
 * a collapsed `<select>`. Behind it, the popover: a heading **"Tasks where I
 * have assigned"** over three switches — **Comments**, **Subtasks**,
 * **Checklists** — all three drawn ON. `[11:28]` "ASSIGNEE — aap ko ya aap ke
 * alawa [kisi aur ko]".
 *
 * TWO LEDGER ROWS, ONE CONTROL. `P | Assignee filter is a <select>, not an
 * avatar picker` and `M | "assigned to me" toggles — Comments · Subtasks ·
 * Checklists` are the same cluster in the same frame: the switches are
 * settings of the assignee filter and do nothing whatever anywhere else.
 *
 * WHY TWO OF THE THREE COULD NOT HAVE BEEN BUILT IN THE BROWSER. The list
 * payload carries `assignees` and `subtasks` and says nothing about who a
 * COMMENT or a CHECKLIST ITEM is assigned to, so a client-side version of this
 * feature would have been one switch that works and two that cannot. The API
 * answers it, per source, and the first section below is that answer with no
 * browser involved — because three switches that all widen the list by the
 * same rows would pass every rendering check ever written.
 *
 * AND WHY EVERY COMBINATION IS A FIRST FETCH. `apps/web/src/lib/query.ts` sets
 * `staleTime: 30_000`, so a combination this run has already asked for is
 * answered out of cache and no request goes out at all. The three switches
 * start ON, so they are all turned OFF *before* a person is chosen, and the
 * four combinations exercised after that are each one this run has never
 * fetched. That is a cache miss by construction rather than by timing.
 *
 *   node test/e2e/list-assignee-filter.mjs --api 3011 --dist apps/web/dist
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

/** Exact, with `!==`: a branch that skipped must not read as a shorter pass. */
const EXPECTED_CHECKS = 29

const EMAIL = process.env.E2E_EMAIL ?? 'admin@rundesk.internal'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123!'
const REPO = path.resolve(import.meta.dirname, '../..')
const TAG = `laf-${Date.now()}`

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
const ME = auth.user?.id ?? auth.userId

/*
 * A LIST OF THIS SUITE'S OWN. Every claim below is "exactly these rows are
 * drawn", and the e2e database is shared — asserting a set against a list
 * other suites write into is asserting on their fixtures as well as mine.
 */
const madeList = await api('/lists', {
  method: 'POST',
  body: { projectId: fixture.projectId, name: `Assignee filter ${TAG}` },
})
if (madeList.status >= 300 || !madeList.data?.id) {
  throw new Error(`could not make this suite's own list: ${madeList.status} ${JSON.stringify(madeList.error)}`)
}
const listId = madeList.data.id
const listPath = `${fixture.spaceId}/${fixture.projectId}/${listId}`
const statuses = (await api(`/lists/${listId}/statuses`)).data ?? []
/*
 * An OPEN status, deliberately. `GroupedListView` starts every closed-category
 * group collapsed on purpose, so tasks seeded into a finished status are rows
 * that never render — and every set comparison below would read 0 and blame
 * the filter.
 */
const lane = (statuses.find((s) => s.category === 'open') ?? statuses[0])?.key

let browser = null
const made = {}

try {
  if (!ME) throw new Error('the signed-in user has no id — nothing to filter by')

  const newTask = async (key, body) => {
    const res = await api('/tasks', { method: 'POST', body: { listId, ...(lane ? { status: lane } : {}), ...body } })
    // `apiClient` never throws — `{status, data, error}` — so a failed seed is
    // read off the status. A `.catch` here would be inert and the run would
    // measure an empty list.
    if (res.status >= 300 || !res.data?.id) {
      throw new Error(`seeding "${key}" returned ${res.status} ${JSON.stringify(res.error)}`)
    }
    made[key] = res.data.id
    return res.data.id
  }

  /*
   * FOUR TASKS, EACH REACHING ME BY EXACTLY ONE ROUTE, plus a fifth that
   * reaches me by none. Four sources that all matched the same task would make
   * the three switches indistinguishable, which is the thing this fixture
   * exists to prevent.
   */
  await newTask('direct', { title: `direct ${TAG}`, assigneeIds: [ME] })
  await newTask('viaComment', { title: `comment ${TAG}` })
  await newTask('viaSubtask', { title: `subtask ${TAG}` })
  await newTask('viaChecklist', { title: `checklist ${TAG}` })
  /*
   * THE DISCRIMINATOR. This one has a comment I WROTE, assigned to nobody,
   * AND (seeded further down) a checklist item assigned to nobody. A query
   * that matched "tasks with a comment on them" — or "tasks I have commented
   * on" — instead of "tasks with a comment assigned to me" would pull it in,
   * and every other check here would still pass. The checklist half was
   * missing until a break patch walked straight through the gap.
   */
  await newTask('noise', { title: `noise ${TAG}` })

  const comment = async (taskId, body) => {
    const res = await api(`/tasks/${taskId}/comments`, { method: 'POST', body: { body } })
    if (res.status >= 300 || !res.data?.id) {
      throw new Error(`commenting on ${taskId} returned ${res.status} ${JSON.stringify(res.error)}`)
    }
    return res.data.id
  }
  const assigned = await comment(made.viaComment, `please look at this ${TAG}`)
  const assignRes = await api(`/tasks/${made.viaComment}/comments/${assigned}/assign`, {
    method: 'POST',
    body: { userId: ME },
  })
  if (assignRes.status >= 300) throw new Error(`assigning the comment returned ${assignRes.status}`)
  await comment(made.noise, `just thinking out loud ${TAG}`)

  const child = await api('/tasks', {
    method: 'POST',
    body: { listId, ...(lane ? { status: lane } : {}), title: `child ${TAG}`, parentTaskId: made.viaSubtask, assigneeIds: [ME] },
  })
  if (child.status >= 300 || !child.data?.id) throw new Error(`seeding the subtask returned ${child.status}`)
  made.child = child.data.id

  const checklist = await api(`/tasks/${made.viaChecklist}/checklists`, {
    method: 'POST',
    body: { title: `Steps ${TAG}` },
  })
  if (checklist.status >= 300 || !checklist.data?.id) throw new Error(`seeding the checklist returned ${checklist.status}`)
  const item = await api(`/tasks/${made.viaChecklist}/checklists/${checklist.data.id}/items`, {
    method: 'POST',
    body: { content: `do the thing ${TAG}`, assigneeId: ME },
  })
  if (item.status >= 300) throw new Error(`seeding the checklist item returned ${item.status}`)

  /*
   * AND THE CHECKLIST DISCRIMINATOR, which this fixture did not have.
   *
   * `noise` was built to catch a comment query that matched "tasks with a
   * comment" instead of "tasks with a comment assigned to me" — and nothing
   * did the same job for checklists. With exactly ONE task carrying a
   * checklist, and its only item assigned to me, "tasks whose checklist item
   * is assigned to me" and "tasks with any checklist item at all" return the
   * identical set, so the check below passed either way.
   *
   * That is not hypothetical: `list-assignee-filter-15-checklists-any-item`
   * drops `eq(taskChecklistItems.assigneeId, opts.userId)` from the query and
   * came back 29 passed, 0 failed.
   *
   * An UNASSIGNED item rather than one assigned to somebody else, because it
   * is the stricter of the two — a query that forgot the condition entirely
   * and a query that compared against the wrong person both pull this in.
   */
  const noiseList = await api(`/tasks/${made.noise}/checklists`, {
    method: 'POST',
    body: { title: `Noise steps ${TAG}` },
  })
  if (noiseList.status >= 300 || !noiseList.data?.id) {
    throw new Error(`seeding the discriminator checklist returned ${noiseList.status}`)
  }
  const noiseItem = await api(`/tasks/${made.noise}/checklists/${noiseList.data.id}/items`, {
    method: 'POST',
    body: { content: `nobody's job ${TAG}` },
  })
  if (noiseItem.status >= 300) {
    throw new Error(`seeding the discriminator checklist item returned ${noiseItem.status}`)
  }

  // ── the API, where two of the three switches actually live ────────────────
  console.log('\n▶ `GET /tasks/list/:id/assigned-via` answers per SOURCE')
  const askVia = (opts) =>
    api(
      `/tasks/list/${listId}/assigned-via?userId=${ME}` +
        `&comments=${!!opts.comments}&subtasks=${!!opts.subtasks}&checklists=${!!opts.checklists}`,
    )
  const all = await askVia({ comments: true, subtasks: true, checklists: true })
  chk(all.status === 200, 'the endpoint answers',
    `GET /tasks/list/:id/assigned-via returned ${all.status} ${JSON.stringify(all.error)}`)
  chk(
    JSON.stringify(all.data?.comments) === JSON.stringify([made.viaComment]),
    'the Comments source is exactly the task whose comment is assigned to me',
    `comments came back as ${JSON.stringify(all.data?.comments)}, expected [${made.viaComment}]`,
  )
  chk(
    JSON.stringify(all.data?.subtasks) === JSON.stringify([made.viaSubtask]),
    'the Subtasks source is the PARENT of the child assigned to me, not the child',
    `subtasks came back as ${JSON.stringify(all.data?.subtasks)}, expected [${made.viaSubtask}] ` +
      `(the child is ${made.child}, which the list never draws as a row)`,
  )
  chk(
    JSON.stringify(all.data?.checklists) === JSON.stringify([made.viaChecklist]),
    'and the Checklists source is the task whose checklist item is assigned to me',
    `checklists came back as ${JSON.stringify(all.data?.checklists)}, expected [${made.viaChecklist}]`,
  )
  chk(
    !(all.data?.taskIds ?? []).includes(made.noise) &&
      !(all.data?.comments ?? []).includes(made.noise),
    'a comment I wrote and assigned to nobody pulls nothing in',
    `the union carried ${JSON.stringify(all.data?.taskIds)} and includes the unassigned-comment task ${made.noise} — ` +
      'the query is matching "has a comment" rather than "has a comment assigned to me"',
  )
  /*
   * EACH SWITCH ALONE. With all three on, a build that ignored the flags and
   * always ran all three queries would be indistinguishable from a correct
   * one; asked one at a time, it is not.
   */
  const only = await askVia({ comments: true })
  chk(
    JSON.stringify(only.data?.comments) === JSON.stringify([made.viaComment]) &&
      (only.data?.subtasks ?? []).length === 0 &&
      (only.data?.checklists ?? []).length === 0,
    'asked for Comments alone it returns Comments alone',
    `comments=true&subtasks=false&checklists=false came back as ${JSON.stringify(only.data)} — ` +
      'the flags are accepted and ignored',
  )
  const none = await askVia({})
  chk(
    (none.data?.taskIds ?? []).length === 0,
    'and with all three off it finds nothing at all',
    `all three off came back with ${JSON.stringify(none.data?.taskIds)}`,
  )
  /*
   * A missing `userId` is a 400 AND SAYS SO. The status alone cannot tell this
   * refusal from a validation pipe's, so the message is asserted with it.
   */
  const noUser = await api(`/tasks/list/${listId}/assigned-via?comments=true`)
  chk(
    noUser.status === 400 && /userid/i.test(String(noUser.error?.message ?? '')),
    'asking without a person is refused, and the refusal says what is missing',
    `it returned ${noUser.status} with ${JSON.stringify(noUser.error)}`,
  )

  // ── the browser ───────────────────────────────────────────────────────────
  browser = await chromium.launch(launchOptions())
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 } })
  const page = await ctx.newPage()

  /** Every `assigned-via` request this page makes, with its query. */
  const viaRequests = []
  page.on('request', (r) => {
    if (r.url().includes('/assigned-via')) viaRequests.push(r.url())
  })

  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app\//, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click().catch(() => {})
  await page.goto(`${B}/app/${WS}/${listPath}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="list-task-search"]', { timeout: 25_000 })

  const picker = () => page.getByTestId('list-assignee-picker')
  const openPicker = async () => {
    if (!(await picker().evaluate((el) => el.open))) await picker().locator('> summary').click()
    await page.waitForTimeout(250)
  }
  const closePicker = async () => {
    await picker().evaluate((el) => { el.open = false })
    await page.waitForTimeout(200)
  }
  /** The ids the grid is DRAWING, which is the only thing any of this is about. */
  const drawn = () =>
    page.locator('[data-testid="list-task-row"]').evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-task-id')).sort(),
    )
  const rowsBecome = (ids) => {
    const want = JSON.stringify([...ids].sort())
    return waitUntil(async () => JSON.stringify(await drawn()) === want, { timeoutMs: 12_000 })
  }
  const setSwitch = async (testId, next) => {
    await openPicker()
    const el = page.getByTestId(testId)
    if ((await el.getAttribute('data-checked')) !== (next ? 'true' : 'false')) await el.click()
    await page.waitForTimeout(150)
  }

  const everything = [made.direct, made.viaComment, made.viaSubtask, made.viaChecklist, made.noise]
  chk(
    await rowsBecome(everything),
    'the list opens drawing this suite’s five tasks',
    `it drew ${JSON.stringify(await drawn())}, expected ${JSON.stringify(everything.sort())}`,
  )

  // ── the picker is faces (the `P` row) ─────────────────────────────────────
  console.log('\n▶ frame `11:30` — the assignee filter is a picker of FACES')
  await openPicker()
  const optionValues = await page
    .locator('[data-testid^="list-assignee-option-"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid').replace('list-assignee-option-', '')))
  const selectValues = await page
    .locator('[data-testid="list-assignee-filter"] option')
    .evaluateAll((els) => els.map((e) => e.getAttribute('value')))
  chk(
    optionValues.length >= 3,
    `the picker offers ${optionValues.length} rows`,
    `the picker offered ${JSON.stringify(optionValues)} — with fewer than three the comparison below is vacuous`,
  )
  /*
   * THE ANTI-DUPLICATED-LIST CHECK. The faces and the native `<select>` beside
   * them are two surfaces on one filter; two hand-written rosters is how the
   * third picker in this codebase ended up offering ten of nineteen field
   * types. Built from one list, so they cannot differ — and this is what says
   * so.
   */
  chk(
    JSON.stringify(optionValues.map((v) => (v === 'anyone' ? '' : v))) === JSON.stringify(selectValues),
    'and offers exactly the same people, in the same order, as the native select beside it',
    `the faces offered ${JSON.stringify(optionValues)} and the select ${JSON.stringify(selectValues)}`,
  )
  const faceBox = await page
    .getByTestId(`list-assignee-option-${ME}`)
    .getByTestId('list-assignee-face')
    .boundingBox()
  chk(
    (faceBox?.width ?? 0) >= 16 && (faceBox?.height ?? 0) >= 16,
    `a person’s row draws a real avatar (${Math.round(faceBox?.width ?? 0)}×${Math.round(faceBox?.height ?? 0)}px)`,
    `the "Me" row's face measured ${JSON.stringify(faceBox)} — a zero-sized avatar is a name in a list`,
  )
  chk(
    await page.getByTestId('list-assignee-option-anyone').getAttribute('data-face') === 'false',
    'and "Anyone" is not given a face, because it is not a person',
    'the Anyone row draws somebody’s avatar',
  )

  // ── the three switches ────────────────────────────────────────────────────
  console.log('\n▶ frame `11:30` — "Tasks where I have assigned", three switches, all on')
  const viaOrder = await page
    .locator('[data-testid="list-assigned-via"] [role="switch"]')
    .evaluateAll((els) => els.map((e) => `${e.getAttribute('data-testid')}:${e.getAttribute('data-checked')}`))
  chk(
    JSON.stringify(viaOrder) ===
      JSON.stringify([
        'list-assigned-via-comments:true',
        'list-assigned-via-subtasks:true',
        'list-assigned-via-checklists:true',
      ]),
    'the three are there, in the frame’s order, all three on',
    `the popover held ${JSON.stringify(viaOrder)}`,
  )
  chk(
    await page.getByTestId('list-assigned-via-hint').count() === 1,
    'and says out loud that they need a person before they do anything',
    'with "Anyone" selected the three switches offer no sign that they extend nothing',
  )

  /*
   * ALL THREE OFF BEFORE A PERSON IS CHOSEN. Two reasons, and the second is
   * the one that matters: it makes the plain assignee filter measurable on its
   * own, and it leaves every combination below a key this run has never
   * fetched, so each one is a real request rather than a 30-second cache hit.
   */
  await setSwitch('list-assigned-via-comments', false)
  await setSwitch('list-assigned-via-subtasks', false)
  await setSwitch('list-assigned-via-checklists', false)
  await page.getByTestId(`list-assignee-option-${ME}`).click()
  await page.waitForTimeout(400)

  console.log('\n▶ with all three off, the filter is the plain one')
  chk(
    await rowsBecome([made.direct]),
    'choosing my own face leaves only the task assigned to me',
    `it drew ${JSON.stringify(await drawn())}, expected only ${made.direct}`,
  )
  chk(
    viaRequests.length === 0,
    'and nothing is asked of the server, because there is nothing to extend',
    `the page made ${viaRequests.length} assigned-via request(s) with all three switches off: ${JSON.stringify(viaRequests)}`,
  )
  chk(
    (await page.getByTestId('list-assignee-selected').getAttribute('data-user-id').catch(() => null)) === ME &&
      await page.getByTestId('list-assignee-clear').count() === 1,
    'the chosen face sits beside the chip with the frame’s ✕ on it',
    `the chip reported data-user-id=` +
      `${JSON.stringify(
        await page.getByTestId('list-assignee-selected').getAttribute('data-user-id').catch(() => null),
      )} ` +
      `with ${await page.getByTestId('list-assignee-clear').count()} clear button(s)`,
  )
  chk(
    await page.getByTestId('list-assignee-filter').inputValue() === ME,
    'and the native select beside it moved with it, rather than disagreeing',
    `the select reads ${JSON.stringify(await page.getByTestId('list-assignee-filter').inputValue())} while the picker holds ${ME}`,
  )

  // ── one switch at a time, each changing the GRID ──────────────────────────
  console.log('\n▶ each switch, alone, adds the rows it is named for')
  await setSwitch('list-assigned-via-comments', true)
  await closePicker()
  chk(
    await rowsBecome([made.direct, made.viaComment]),
    'Comments adds the task whose comment is assigned to me — and only that one',
    `it drew ${JSON.stringify(await drawn())}, expected ${JSON.stringify([made.direct, made.viaComment].sort())}`,
  )
  await setSwitch('list-assigned-via-comments', false)
  await setSwitch('list-assigned-via-subtasks', true)
  await closePicker()
  chk(
    await rowsBecome([made.direct, made.viaSubtask]),
    'Subtasks adds the PARENT of the child assigned to me',
    `it drew ${JSON.stringify(await drawn())}, expected ${JSON.stringify([made.direct, made.viaSubtask].sort())}`,
  )
  await setSwitch('list-assigned-via-subtasks', false)
  await setSwitch('list-assigned-via-checklists', true)
  await closePicker()
  chk(
    await rowsBecome([made.direct, made.viaChecklist]),
    'Checklists adds the task whose checklist item is assigned to me',
    `it drew ${JSON.stringify(await drawn())}, expected ${JSON.stringify([made.direct, made.viaChecklist].sort())}`,
  )
  await setSwitch('list-assigned-via-comments', true)
  await setSwitch('list-assigned-via-subtasks', true)
  await closePicker()
  chk(
    await rowsBecome([made.direct, made.viaComment, made.viaSubtask, made.viaChecklist]),
    'and all three together add all three, while the task none of them touches stays out',
    `it drew ${JSON.stringify(await drawn())} — the unassigned-comment task is ${made.noise}`,
  )

  /*
   * THE REQUEST, not just the render. Rendering the right rows for the wrong
   * reason is the commonest way a fix is fake, and a client that fetched all
   * three sources every time and filtered them here would pass every check
   * above. Asserted NON-EMPTY first: `!some(...)` over an empty list is true,
   * and reads as "no request carried it" while meaning "there were no
   * requests".
   */
  console.log('\n▶ and the switches reach the SERVER, one combination per key')
  chk(
    viaRequests.length >= 4,
    `the page made ${viaRequests.length} assigned-via requests`,
    `it made ${viaRequests.length}: ${JSON.stringify(viaRequests)} — with fewer than four, the next check is vacuous`,
  )
  const combos = viaRequests.map((u) => {
    const q = new URL(u).searchParams
    return `${q.get('comments')}/${q.get('subtasks')}/${q.get('checklists')}`
  })
  chk(
    combos.includes('true/false/false') &&
      combos.includes('false/true/false') &&
      combos.includes('false/false/true') &&
      combos.includes('true/true/true'),
    'each combination went out on its own, so none of them was answered from a warm cache',
    `the requests carried ${JSON.stringify(combos)} — a key that leaves the flags out answers the ` +
      'second combination with the first one’s rows for thirty seconds',
  )
  chk(
    viaRequests.every((u) => new URL(u).searchParams.get('userId') === ME),
    'and every one of them named the person the filter is set to',
    `the requests carried userIds ${JSON.stringify(viaRequests.map((u) => new URL(u).searchParams.get('userId')))}`,
  )

  // ── the ✕, and the two surfaces staying one filter ────────────────────────
  console.log('\n▶ the ✕ on the face puts the whole list back')
  await page.getByTestId('list-assignee-clear').click()
  chk(
    await rowsBecome(everything),
    'clearing the face restores every row',
    `after the ✕ it drew ${JSON.stringify(await drawn())}, expected ${JSON.stringify(everything.sort())}`,
  )
  chk(
    await page.getByTestId('list-assignee-selected').count() === 0 &&
      (await page.getByTestId('list-assignee-filter').inputValue()) === '',
    'and both surfaces know it — no face on the chip, nothing in the select',
    `the chip drew ${await page.getByTestId('list-assignee-selected').count()} face(s) and the select reads ` +
      `${JSON.stringify(await page.getByTestId('list-assignee-filter').inputValue())}`,
  )
  /*
   * AND THE OTHER DIRECTION. The native select is what a screen reader
   * announces and what `list-empty-states.mjs` drives; if it wrote to state
   * the picker did not read, the two controls would be two filters wearing one
   * label.
   */
  await page.getByTestId('list-assignee-filter').selectOption(ME)
  chk(
    await waitUntil(() => picker().getAttribute('data-value').then((v) => v === ME), { timeoutMs: 8_000 }),
    'and choosing in the select moves the picker too',
    `the picker reports data-value=${JSON.stringify(await picker().getAttribute('data-value'))} after the select was set to ${ME}`,
  )

  await ctx.close()
} catch (e) {
  bad(`threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  for (const id of Object.values(made)) await api(`/tasks/${id}`, { method: 'DELETE' })
  await api(`/lists/${listId}`, { method: 'DELETE' })
  await stack?.close?.()
}

const failed = () => results.filter((x) => !x).length
if (results.length !== EXPECTED_CHECKS) {
  console.log(`  \x1b[31mFAIL\x1b[0m ran ${results.length} checks, expected exactly ${EXPECTED_CHECKS}`)
  results.push(0)
}
console.log(`\n${results.length - failed()} passed, ${failed()} failed`)
process.exit(failed() ? 1 : 0)

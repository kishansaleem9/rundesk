/**
 * §V2-S16 frames `18:45` / `18:48` / `20:10` — what an AI answer LOOKS like.
 *
 * `20:10`: *"**Project status:** 13 open tasks total: **11 To Do, 1 In
 * Progress, 1 Complete**. The biggest block is six high-priority onboarding
 * tasks due **Aug 7 to Aug 11**:"* — four bold runs in one paragraph — followed
 * by a row of grey chip skeletons that hydrate into task references, each
 * carrying that task's own **status badge**. `18:45` draws a status word above
 * the step log and **"Working on it…"** in the composer.
 *
 * Rundesk rendered `{message.content}` inside a `whitespace-pre-wrap` div while
 * a block-markdown renderer shipped one import away for comments. Line breaks
 * survived; every other mark did not.
 *
 * WHAT THIS SUITE IS GUARDING:
 *
 *   1. THE MARKS RENDER, AND ONLY ON ANSWERS. Bold, headings and lists become
 *      elements. A QUESTION is left alone: running somebody's own words through
 *      a parser would eat an asterisk out of a question about globbing.
 *
 *   2. THE BADGE IS LIVE, NOT QUOTED. The whole point of a chip over a name is
 *      that the status is read from the database when the answer is drawn. So
 *      this moves a task AFTER the answer was written and asserts the badge
 *      follows while the stored answer does not change one character. A badge
 *      copied into the prose would pass every other check on this page.
 *
 *   3. AN UNRESOLVABLE REFERENCE DEGRADES. An id the reader may not see, or one
 *      the model invented, must not become a chip asserting a title.
 *
 *   4. THE BUSY STATE IS A REPORT. Observed while a real request is genuinely
 *      in flight, and the composer's placeholder with it.
 *
 * NO PROVIDER KEY EXISTS HERE, so `/ai/chat` 503s (checked in
 * `ai-create-containers.mjs`, where it belongs). Phase A below is entirely real
 * — real API, real Postgres, real browser — because the panel renders STORED
 * thread messages, which is the production path for reopening a conversation.
 * Phase B intercepts exactly one endpoint, the one that cannot work in this
 * environment, and replays the frame format `chatStream` genuinely writes; the
 * server half of those frames is asserted against Postgres in the other suite.
 *
 *   node test/e2e/ai-answer-rendering.mjs --api 3011 --dist apps/web/dist
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
const EXPECTED_CHECKS = 30

const EMAIL = process.env.E2E_EMAIL ?? 'admin@rundesk.internal'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123!'
const REPO = path.resolve(import.meta.dirname, '../..')
const VIEWPORT = { width: 1440, height: 1000 }

const TAG = `e2e-air-${Date.now()}`
/** An id shaped like ours that addresses nothing — the degrade case. */
const GHOST_ID = '00000000-0000-4000-8000-0000000000aa'

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

let browser = null
let ctx = null
let threadId = null
let taskA = null
let taskB = null

try {
  console.log('\n▶ two tasks with DIFFERENT statuses, so a chip cannot be a constant')
  const fixture = await ensureSweepFixture(api, WS, { minTasks: 1 })
  const listId = fixture.listId
  const mk = async (title, status) => {
    const res = await api('/tasks', { method: 'POST', body: { listId, title, status } })
    return res.status < 400 ? res.data : null
  }
  taskA = await mk(`${TAG}-a`, 'todo')
  taskB = await mk(`${TAG}-b`, 'in_progress')
  chk(
    !!taskA?.id && !!taskB?.id,
    'the suite owns two tasks it can move independently',
    `creating them gave ${JSON.stringify([taskA?.id ?? null, taskB?.id ?? null])}`,
  )
  if (!taskA?.id || !taskB?.id) throw new Error('no fixture tasks; every chip check would be vacuous')

  /*
   * THE ANSWER, WRITTEN THE WAY THE SERVER WRITES ONE. Markdown plus reference
   * tokens, stored through the ordinary append endpoint — which is exactly what
   * `chatStream` does at the end of a turn, so this is the production shape and
   * not a fixture shape.
   */
  const ANSWER = [
    '## Project status',
    '',
    `**Project status:** 2 open tasks total: **1 To Do, 1 In Progress**. The biggest block is these:`,
    '',
    `- [[task:${taskA.id}]] is where the work starts`,
    `- [[task:${taskB.id}]] is already moving`,
    `- [[task:${GHOST_ID}]] is a reference to nothing`,
    '',
    `They all live in [[list:${listId}]].`,
  ].join('\n')
  const QUESTION = 'What is my **project status** right now?'

  const thread = await api(`/workspaces/${WS}/ai-chats`, { method: 'POST', body: {} })
  threadId = thread.data?.id ?? null
  chk(!!threadId, 'a thread exists to hold the conversation', `creating one returned ${thread.status}`)
  if (!threadId) throw new Error('no thread; nothing can be rendered')

  const userMsg = await api(`/workspaces/${WS}/ai-chats/${threadId}/messages`, {
    method: 'POST',
    body: { role: 'user', content: QUESTION },
  })
  const answerMsg = await api(`/workspaces/${WS}/ai-chats/${threadId}/messages`, {
    method: 'POST',
    body: { role: 'assistant', content: ANSWER },
  })
  const answerId = answerMsg.data?.message?.id
  const questionId = userMsg.data?.message?.id
  chk(
    !!answerId && !!questionId,
    'with a question and an answer stored in it',
    `append returned ${userMsg.status}/${answerMsg.status} — ${JSON.stringify(answerMsg.data).slice(0, 160)}`,
  )
  if (!answerId) throw new Error('no stored answer; nothing to render')

  // ── On screen ──────────────────────────────────────────────────────────────
  console.log('\n▶ `20:10` — the answer renders as marks, not as asterisks')
  browser = await chromium.launch(launchOptions())
  ctx = await browser.newContext({ viewport: VIEWPORT })
  const page = await ctx.newPage()

  /*
   * ATTACHED BEFORE THE FIRST NAVIGATION, and asserted non-empty. The client's
   * `staleTime` is 30s, so "a request went out" is a claim that can be true of
   * an empty array on a warm cache; a listener installed before the page has
   * loaded at all cannot miss the first one, and an empty array fails.
   */
  const refCalls = []
  page.on('request', (req) => {
    if (req.url().includes('/api/v1/ai/refs')) refCalls.push(req.postData() ?? '')
  })

  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click().catch(() => {})

  const openThread = async (extra = '') => {
    await page.goto(`${B}/app/${WS}/ai?thread=${threadId}${extra}`, { waitUntil: 'domcontentloaded' })
    return waitUntil(() => page.getByTestId(`ai-answer-${answerId}`).isVisible().catch(() => false), {
      timeoutMs: 25_000,
    })
  }
  chk(await openThread(), 'the stored answer is on screen', 'the answer bubble never appeared')

  const answer = page.getByTestId(`ai-answer-${answerId}`)
  chk(
    (await answer.locator('strong').count()) >= 2,
    'its bold runs are <strong> elements',
    `${await answer.locator('strong').count()} <strong> element(s) — the answer is still a string`,
  )
  /*
   * ANY heading element, and its text — not a tag name guessed at.
   *
   * `markdown.tsx` DEMOTES: `#` becomes an `h3`, `##` an `h4`, `###` an `h5`,
   * deliberately, so an answer cannot inject an `h1` into the panel's heading
   * hierarchy. A first version of this check asserted `h3` and failed against a
   * renderer that was working correctly. What the row actually claims is that a
   * heading becomes a heading rather than a line beginning with two hashes, so
   * that is what is asserted — pinned by its TEXT, so "some element exists"
   * cannot pass for it.
   */
  const headings = answer.locator('h1, h2, h3, h4, h5, h6')
  const headingCount = await headings.count()
  const headingText = headingCount ? (await headings.first().innerText()).trim() : null
  const itemCount = await answer.locator('li').count()
  chk(
    headingCount === 1 && headingText === 'Project status' && itemCount === 3,
    'and its heading and three-item list are real block elements',
    `found ${headingCount} heading(s) reading ${JSON.stringify(headingText)} and ${itemCount} list item(s)`,
  )
  const answerText = (await answer.innerText()).replace(/\s+/g, ' ')
  chk(
    !answerText.includes('**') && !answerText.includes('## '),
    'with none of the syntax left visible',
    `the answer reads ${JSON.stringify(answerText.slice(0, 180))}`,
  )
  chk(
    !/\[\[task:/.test(answerText) && !/\[\[list:/.test(answerText),
    'and no raw reference token on screen',
    `a reference token is still visible in ${JSON.stringify(answerText.slice(0, 180))}`,
  )
  /*
   * THE QUESTION IS NOT PARSED. Asserted against the same page, because the
   * split is the interesting part: "answers render markdown" is only safe if
   * "questions do not" is also true.
   */
  const questionText = await page.getByTestId(`ai-question-${questionId}`).innerText()
  chk(
    questionText.includes('**project status**'),
    'while the QUESTION keeps its asterisks exactly as they were typed',
    `the question rendered as ${JSON.stringify(questionText)} — your own words must not be reformatted`,
  )

  console.log('\n▶ each chip carries that task’s own status, read from the database')
  /*
   * WAIT FOR HYDRATION, THEN COUNT — and wait on the right thing.
   *
   * `openThread` resolves as soon as the answer bubble is on screen, which is
   * BEFORE the batched `/ai/refs` read comes back: at that instant every
   * reference is a skeleton, so a count of `ai-ref-task-…` is 0 for a panel
   * that is working perfectly. A count is a sample at a moment; the first
   * version of this check sampled too early and the checks after it passed only
   * because Playwright's auto-waiting quietly waited for them.
   *
   * The gate is "no skeletons left", not "chip A exists", so it stays
   * falsifiable in every direction: a panel that never renders a reference has
   * no skeletons either and fails the count below, a reference that resolves to
   * nothing leaves an `ai-ref-unresolved-…` and fails it too, and one that
   * never resolves leaves a skeleton and times out here.
   */
  const skeletons = page.locator('[data-testid^="ai-ref-skeleton-"]')
  const awaitHydration = () => waitUntil(async () => (await skeletons.count()) === 0, { timeoutMs: 20_000 })
  const hydrated = await awaitHydration()
  const chipA = page.getByTestId(`ai-ref-task-${taskA.id}`)
  const chipB = page.getByTestId(`ai-ref-task-${taskB.id}`)
  const [countA, countB] = [await chipA.count(), await chipB.count()]
  chk(
    hydrated && countA === 1 && countB === 1,
    'both referenced tasks became chips',
    `chip counts were ${countA} and ${countB} with ${await skeletons.count()} skeleton(s) still on screen ` +
      `and ${await page.locator('[data-testid^="ai-ref-unresolved-"]').count()} reference(s) unresolved`,
  )
  chk(
    (await chipA.innerText()).includes(`${TAG}-a`) && (await chipB.innerText()).includes(`${TAG}-b`),
    'each showing its own real title',
    `they read ${JSON.stringify([await chipA.innerText(), await chipB.innerText()])}`,
  )
  const statusA = await chipA.getAttribute('data-ref-status')
  const statusB = await chipB.getAttribute('data-ref-status')
  chk(
    statusA === 'todo' && statusB === 'in_progress',
    'and its own status — the two are not the same value',
    `the chips reported ${JSON.stringify([statusA, statusB])}; two chips that always agree are a facade`,
  )
  const catA = await chipA.getAttribute('data-ref-status-category')
  const catB = await chipB.getAttribute('data-ref-status-category')
  chk(
    catA === 'open' && catB === 'in_progress',
    'with the category that drives the badge colour, which is not the status key',
    `the categories were ${JSON.stringify([catA, catB])} — keying colour on the key breaks the moment ` +
      'a workspace renames a status',
  )
  chk(
    (await page.getByTestId(`ai-ref-task-badge-${taskA.id}`).innerText()).trim().toLowerCase() === 'todo',
    'and a person can read the badge',
    `the badge read ${JSON.stringify(await page.getByTestId(`ai-ref-task-badge-${taskA.id}`).innerText())}`,
  )
  chk(
    (await page.getByTestId(`ai-ref-list-${listId}`).count()) === 1,
    'the list reference became a chip too',
    'the list reference did not resolve',
  )
  chk(
    (await page.getByTestId(`ai-ref-unresolved-${GHOST_ID}`).count()) === 1 &&
      (await page.getByTestId(`ai-ref-task-${GHOST_ID}`).count()) === 0,
    'a reference to nothing degrades to inert text instead of asserting a title',
    'the ghost reference either vanished or became a chip — both are worse than showing it unresolved',
  )
  chk(
    refCalls.length > 0 &&
      refCalls.some((b) => b.includes(taskA.id) && b.includes(taskB.id) && b.includes(listId)),
    'and all of it came from ONE batch request carrying every id in the answer',
    `the /ai/refs calls captured were ${JSON.stringify(refCalls)} — an empty array here means the check ` +
      'asserted over nothing, which is the shape this suite exists to avoid',
  )

  // ── The badge is live ──────────────────────────────────────────────────────
  console.log('\n▶ the badge follows the task, and the stored answer never changes')
  const moved = await api(`/tasks/${taskA.id}`, { method: 'PATCH', body: { status: 'done' } })
  chk(
    moved.status < 400,
    'task A is moved to done AFTER the answer was written',
    `PATCH returned ${moved.status} ${JSON.stringify(moved.data).slice(0, 140)}`,
  )
  /*
   * A FULL RELOAD, which is what forces the cache miss BY CONSTRUCTION: the
   * query client is a module-level instance created on load and is not
   * persisted anywhere, so a reloaded page starts with nothing cached. Waiting
   * 30 seconds for `staleTime` would be a bet on a clock.
   */
  chk(await openThread(), 'the thread reopens', 'the answer did not come back after the reload')
  // The same gate as above, for the same reason: the reload re-renders the
  // answer before the fresh `/ai/refs` read lands, and a `getAttribute` against
  // a chip that is still a skeleton blocks on Playwright's own timeout rather
  // than on this poll's.
  await awaitHydration()
  const movedBadge = await waitUntil(
    async () =>
      (await page.getByTestId(`ai-ref-task-${taskA.id}`).getAttribute('data-ref-status')) === 'done',
    { timeoutMs: 15_000 },
  )
  chk(
    movedBadge,
    'the chip now reads `done` — the badge is read at render time, not quoted from the answer',
    `the chip still reports ${JSON.stringify(await page.getByTestId(`ai-ref-task-${taskA.id}`).getAttribute('data-ref-status'))}`,
  )
  chk(
    (await page.getByTestId(`ai-ref-task-${taskA.id}`).getAttribute('data-ref-status-category')) === 'closed' &&
      (await page.getByTestId(`ai-ref-task-${taskB.id}`).getAttribute('data-ref-status')) === 'in_progress',
    'its category moved with it, and the OTHER chip did not move at all',
    'either the category lagged the status or both chips changed together',
  )
  const stored = await api(`/workspaces/${WS}/ai-chats/${threadId}`)
  const storedAnswer = (stored.data?.messages ?? []).find((m) => m.id === answerId)?.content ?? ''
  chk(
    storedAnswer === ANSWER,
    'while the stored answer is byte-identical — nothing rewrote the conversation',
    'the stored message changed; a badge that updates by editing history is not a live badge',
  )

  // ── The busy state ─────────────────────────────────────────────────────────
  console.log('\n▶ `18:45` — the busy state, while a request is genuinely in flight')
  const composer = page.getByTestId('ai-composer-input')
  const restingPlaceholder = await composer.getAttribute('placeholder')
  chk(
    !!restingPlaceholder && !/anything/i.test(restingPlaceholder),
    'a composer disabled because no model is configured no longer invites you to type',
    `the placeholder on a disabled input read ${JSON.stringify(restingPlaceholder)}`,
  )

  /*
   * ONE ENDPOINT INTERCEPTED — the one that cannot work without a provider key
   * — replaying the frames `chatStream` genuinely writes. The handler holds the
   * request open, which is what makes the in-flight state observable at all.
   */
  let release = () => {}
  const held = new Promise((resolve) => { release = resolve })
  const CREATED = { kind: 'list', id: listId, name: `${TAG}-list`, path: `space > ${TAG}-list` }
  await page.route('**/api/v1/ai/chat', async (route) => {
    await held
    const frames = [
      { step: 'create_list' },
      { created: CREATED },
      { delta: `Done, created **${TAG}-list**. ` },
      { delta: `See [[task:${taskB.id}]] for what is next.` },
    ]
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: `${frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('')}data: [DONE]\n\n`,
    })
  })

  await page.goto(`${B}/app/${WS}/ai?thread=${threadId}&prompt=${encodeURIComponent('create a list')}`, {
    waitUntil: 'domcontentloaded',
  })
  const busyUp = await waitUntil(
    () => page.getByTestId('ai-busy-state').isVisible().catch(() => false),
    { timeoutMs: 25_000 },
  )
  chk(busyUp, 'a busy state appears above the step log', 'nothing said the assistant was doing anything')
  chk(
    (await page.getByTestId('ai-busy-state').getAttribute('data-state')) === 'thinking' &&
      (await page.getByTestId('ai-busy-label').innerText()).trim().length > 0,
    'and before the first frame arrives it says it is thinking, in words',
    `it reported data-state=${JSON.stringify(await page.getByTestId('ai-busy-state').getAttribute('data-state'))} ` +
      `with the label ${JSON.stringify(await page.getByTestId('ai-busy-label').innerText())}`,
  )
  const busyPlaceholder = await page.getByTestId('ai-composer-input').getAttribute('placeholder')
  chk(
    busyPlaceholder !== restingPlaceholder && !/anything/i.test(busyPlaceholder ?? ''),
    'and the composer says it is working, not what it says at rest',
    `it read ${JSON.stringify(busyPlaceholder)} against ${JSON.stringify(restingPlaceholder)}`,
  )

  release()
  const settled = await waitUntil(
    () => page.getByTestId('ai-trace-step-create_list').isVisible().catch(() => false),
    { timeoutMs: 20_000 },
  )
  chk(
    settled,
    'when the tool step arrives the step log names it — not a generic "Working"',
    'the create_list step never appeared in the trace',
  )
  chk(
    !/^working$/i.test((await page.getByTestId('ai-trace-step-create_list').innerText()).trim()),
    'with its own words, so a missing translation cannot pass as a present one',
    `the step read ${JSON.stringify(await page.getByTestId('ai-trace-step-create_list').innerText())} — ` +
      'the unknown-step fallback is "Working", and a check for "a step is present" would pass on it',
  )
  const createdUp = await waitUntil(
    () => page.getByTestId(`ai-created-list-${listId}`).isVisible().catch(() => false),
    { timeoutMs: 20_000 },
  )
  chk(
    createdUp,
    'and what the server said it created is shown beside the answer, from the id it returned',
    'the created container was never shown — the only account of it would be the sentence',
  )
  chk(
    (await page.getByTestId('ai-busy-state').count()) === 0,
    'the busy state goes away once the answer has landed',
    'the assistant still says it is busy after the answer arrived',
  )
} catch (e) {
  bad(`threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  await ctx?.close().catch(() => {})
  await browser?.close().catch(() => {})
  // Every row this run made, taken back.
  for (const t of [taskA, taskB]) {
    if (t?.id) await api(`/tasks/${t.id}`, { method: 'DELETE' }).catch(() => {})
  }
  if (threadId) await api(`/workspaces/${WS}/ai-chats/${threadId}`, { method: 'DELETE' }).catch(() => {})
}

const failed = () => results.filter((x) => !x).length
if (results.length !== EXPECTED_CHECKS) {
  console.log(`  \x1b[31mFAIL\x1b[0m ran ${results.length} checks, expected ${EXPECTED_CHECKS}`)
  results.push(0)
}
console.log(`\n${results.length - failed()} passed, ${failed()} failed`)
await stack?.close?.()
process.exit(failed() ? 1 : 0)

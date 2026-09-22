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
 *   5. §V2-S16 `18:48` — THE PATH CHIPS ARE DESTINATIONS. *"Use the `rundesk >
 *      ddddd > List` for task details or the `rundesk > ddddd > Board` to
 *      manage work by status."* Both halves of that sentence tell you to go
 *      somewhere, and until `0163` the chip was a `<span>`: a path that looked
 *      like a link, could not be pressed, could not be middle-clicked and did
 *      not exist to a keyboard. The dead control, in the one place the answer
 *      is telling you to act. A view the space does not have is not offered.
 *
 *   6. §V2-S17/S22 `16:32` / `21:15` — THE STARTER CARDS CHANGE. Four cards
 *      both times and not one card in common. What was here was five `const`
 *      translation keys with no input that could have changed them, so this
 *      asserts the set moves WITH A NUMBER: the overdue count in the card's own
 *      `data-because` must track the overdue tasks this run creates.
 *
 *   7. §V2-S18 `17:42`–`17:50` — THE WORD BAR CHANGES TOO. Three words above
 *      the composer, and the three frames show three different sets. A fixed
 *      three would photograph identically at `17:42`.
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
const EXPECTED_CHECKS = 51

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

/*
 * READING AN ELEMENT THAT IS NOT THERE IS A REPORT, NOT THE END OF THE RUN.
 *
 * Four of this suite's 22 break patches came back as SHORT runs and all four
 * have one shape: the check aimed at reddens correctly, and then the NEXT line
 * reads a locator the failure has just shown to be absent. Playwright waits its
 * default thirty seconds and throws, the throw ends the section, and the run
 * reports 16, 32 or 45 of 51 checks. `aar-7-list-refs-never-sent` lost
 * thirty-five checks to one `getAttribute`.
 *
 * A patch credited with reddening one check while silencing thirty-five is
 * worse than a patch that reddens nothing, because the number beside it looks
 * like evidence. So every read that follows a check which is allowed to fail
 * goes through these: absent reads as null, the check below reports null in its
 * own sentence, and the section keeps going.
 *
 * THE SHORT TIMEOUT IS THE POINT, not an optimisation. Every one of these reads
 * comes after a `waitUntil` that has already settled whether the element is
 * there, so three seconds is a grace period rather than a race — and thirty
 * seconds × ten reads is five minutes added to a suite that runs in four.
 */
const GRACE_MS = 3_000
const textOf = (loc) => loc.innerText({ timeout: GRACE_MS }).catch(() => null)
const attrOf = (loc, name) => loc.getAttribute(name, { timeout: GRACE_MS }).catch(() => null)

const auth = await login(`${B}/api/v1`, EMAIL, PASSWORD)
const api = apiClient(`${B}/api/v1`, auth.accessToken)
const WS = process.env.E2E_WS ?? (await pickWorkspace(api)).id

let browser = null
let ctx = null
let threadId = null
let taskA = null
let taskB = null
/**
 * The overdue tasks the starter-card block creates.
 *
 * Declared out here and cleaned up in `finally`: they sit on this account's own
 * overdue count, which every other suite's starter cards and workload figures
 * read, and a run that threw halfway would otherwise leave them there for good.
 */
const lateTasks = []

try {
  console.log('\n▶ two tasks with DIFFERENT statuses, so a chip cannot be a constant')
  const fixture = await ensureSweepFixture(api, WS, { minTasks: 1 })
  const listId = fixture.listId
  // The route a chip has to address: `/app/:workspaceId/:spaceId/:projectId/:listId`.
  const listRoute = `/app/${WS}/${fixture.spaceId}/${fixture.projectId}/${listId}`
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
    '',
    /*
     * §V2-S16 `18:48`'s own sentence, in the shape `describeContainerResult`
     * writes it. `mindmap` is deliberate: it is a view key this build cannot
     * render at all, so it exercises the degrade path without touching the
     * space's shared view config — which every other suite reads.
     */
    `Use [[view:${listId}:list]] for task details or [[view:${listId}:board]] to manage work by status.`,
    `[[view:${listId}:mindmap]] is a view this build does not draw.`,
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
  /*
   * `serviceWorkers: 'block'`, AND IT IS LOAD-BEARING — this suite has two
   * `page.route` stubs and one of them silently did nothing without it.
   *
   * `apps/web` is a PWA (`vite-plugin-pwa`; `sw.js` ships in the bundle), and
   * Playwright's `page.route` cannot intercept a request the service worker
   * serves. `page.on('request')` still REPORTS that request, which is what
   * makes this so hard to see from the outside: the URL appears in the log,
   * looks exactly like the glob, and the handler never runs.
   *
   * The reason only one stub was affected is worth keeping, because it is the
   * shape of the trap: Workbox handles **GET** and passes **POST** straight
   * through. So the `/ai/chat` interception in phase B worked from the day it
   * was written, and the `/ai/status` interception — a GET — did not. The
   * suite was internally consistent and wrong in one half. It surfaced as
   * `locator.fill: Timeout 30000ms exceeded` on a composer that was correctly
   * disabled, thirty seconds and one section away from the cause.
   *
   * Seven other suites in this directory already pass this. It is not optional
   * for anything that stubs a GET.
   */
  ctx = await browser.newContext({ viewport: VIEWPORT, serviceWorkers: 'block' })
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
  const answerText = ((await textOf(answer)) ?? '').replace(/\s+/g, ' ')
  chk(
    !answerText.includes('**') && !answerText.includes('## '),
    'with none of the syntax left visible',
    `the answer reads ${JSON.stringify(answerText.slice(0, 180))}`,
  )
  chk(
    !/\[\[(task|list|view):/.test(answerText),
    'and no raw reference token on screen, of any of the three kinds',
    `a reference token is still visible in ${JSON.stringify(answerText.slice(0, 180))}`,
  )
  /*
   * THE QUESTION IS NOT PARSED. Asserted against the same page, because the
   * split is the interesting part: "answers render markdown" is only safe if
   * "questions do not" is also true.
   */
  const questionText = (await textOf(page.getByTestId(`ai-question-${questionId}`))) ?? ''
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
  const [textA, textB] = [await textOf(chipA), await textOf(chipB)]
  chk(
    (textA ?? '').includes(`${TAG}-a`) && (textB ?? '').includes(`${TAG}-b`),
    'each showing its own real title',
    `they read ${JSON.stringify([textA, textB])}`,
  )
  const statusA = await attrOf(chipA, 'data-ref-status')
  const statusB = await attrOf(chipB, 'data-ref-status')
  chk(
    statusA === 'todo' && statusB === 'in_progress',
    'and its own status — the two are not the same value',
    `the chips reported ${JSON.stringify([statusA, statusB])}; two chips that always agree are a facade`,
  )
  const catA = await attrOf(chipA, 'data-ref-status-category')
  const catB = await attrOf(chipB, 'data-ref-status-category')
  chk(
    catA === 'open' && catB === 'in_progress',
    'with the category that drives the badge colour, which is not the status key',
    `the categories were ${JSON.stringify([catA, catB])} — keying colour on the key breaks the moment ` +
      'a workspace renames a status',
  )
  const badgeText = await textOf(page.getByTestId(`ai-ref-task-badge-${taskA.id}`))
  chk(
    (badgeText ?? '').trim().toLowerCase() === 'todo',
    'and a person can read the badge',
    `the badge read ${JSON.stringify(badgeText)}`,
  )
  chk(
    (await page.getByTestId(`ai-ref-list-${listId}`).count()) === 1,
    'the list reference became a chip too',
    'the list reference did not resolve',
  )

  // ── `18:48` — the path chips are destinations ──────────────────────────────
  console.log('\n▶ `18:48` — "Use the rundesk > ddddd > List … or the Board …"')
  const listChip = page.getByTestId(`ai-ref-list-${listId}`)
  /*
   * A REAL `href`, not an onClick. The browser's own affordances — middle
   * click, copy link, focus — all come from the attribute, and the attribute is
   * also the only thing a check can read without navigating. It has to carry
   * the WHOLE route: a chip holding just the list id can be drawn and not
   * opened, which is how a label starts pretending to be a control.
   */
  const listHref = await attrOf(listChip, 'href')
  chk(
    listHref === listRoute,
    'the list chip is a link to that list’s real route, space and project included',
    `its href was ${JSON.stringify(listHref)}, expected ${JSON.stringify(listRoute)}`,
  )
  const viewList = page.getByTestId(`ai-ref-view-${listId}-list`)
  const viewBoard = page.getByTestId(`ai-ref-view-${listId}-board`)
  chk(
    (await viewList.count()) === 1 && (await viewBoard.count()) === 1,
    'and the sentence’s two VIEW chips resolved as well',
    `list-view chips: ${await viewList.count()}, board-view chips: ${await viewBoard.count()}`,
  )
  const boardHref = await attrOf(viewBoard, 'href')
  const listViewHref = await attrOf(viewList, 'href')
  chk(
    listViewHref === `${listRoute}?view=list` && boardHref === `${listRoute}?view=board`,
    'each opening its OWN tab of that list — two chips, two different links',
    `they pointed at ${JSON.stringify([listViewHref, boardHref])}`,
  )
  const boardText = (await textOf(viewBoard))?.trim() ?? null
  const listPath = (await textOf(listChip))?.trim() ?? null
  chk(
    boardText !== null &&
      listPath !== null &&
      boardText.startsWith(listPath) &&
      boardText.split('>').length === 3,
    'and reading as the frame reads them — the list’s path with the view’s name on the end',
    `the board chip read ${JSON.stringify(boardText)} against a list path of ${JSON.stringify(listPath)}`,
  )
  /*
   * THE VIEW THIS BUILD CANNOT DRAW. `enabledViewsFor` filters unknown keys
   * out, so the chip degrades to the list it belongs to rather than linking to
   * a tab the page will not render. Both halves are asserted: that it did NOT
   * become a mindmap link, and that it still goes somewhere real.
   */
  const ghostView = page.getByTestId(`ai-ref-view-${listId}-mindmap`)
  const ghostEnabled = await attrOf(ghostView, 'data-view-enabled')
  const ghostHref = await attrOf(ghostView, 'href')
  chk(
    ghostEnabled === 'false' && ghostHref === listRoute,
    'a view this build does not draw degrades to the list instead of linking to a missing tab',
    `it reported data-view-enabled=${JSON.stringify(ghostEnabled)} with href ${JSON.stringify(ghostHref)}`,
  )
  /*
   * AND IT ACTUALLY GOES. An `href` proves the attribute; only a click proves
   * the router accepts it. Done last in this block, because it leaves the page.
   */
  // `aar-7-list-refs-never-sent` stops the list references being sent, so there
  // is no view chip to press — the two checks above say exactly that, and this
  // press then spent its thirty seconds and ended the run at 21 of 51. Bounded,
  // the check below reports the address the browser is actually at (ledger §10).
  await viewBoard.click({ timeout: 8000 }).catch(() => {})
  const landed = await waitUntil(
    () => Promise.resolve(page.url().includes(listId) && page.url().includes('view=board')),
    { timeoutMs: 15_000 },
  )
  chk(
    landed,
    'and pressing one opens that view of that list',
    `the browser ended up at ${JSON.stringify(page.url())}`,
  )
  chk(await openThread(), 'the thread reopens after following a chip', 'the answer did not come back')
  await awaitHydration()
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
    `the chip still reports ${JSON.stringify(await attrOf(page.getByTestId(`ai-ref-task-${taskA.id}`), 'data-ref-status'))}`,
  )
  chk(
    (await attrOf(page.getByTestId(`ai-ref-task-${taskA.id}`), 'data-ref-status-category')) === 'closed' &&
      (await attrOf(page.getByTestId(`ai-ref-task-${taskB.id}`), 'data-ref-status')) === 'in_progress',
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
  const restingPlaceholder = await attrOf(composer, 'placeholder')
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
  const busyState = await attrOf(page.getByTestId('ai-busy-state'), 'data-state')
  const busyLabel = await textOf(page.getByTestId('ai-busy-label'))
  chk(
    busyState === 'thinking' && (busyLabel ?? '').trim().length > 0,
    'and before the first frame arrives it says it is thinking, in words',
    `it reported data-state=${JSON.stringify(busyState)} with the label ${JSON.stringify(busyLabel)}`,
  )
  const busyPlaceholder = await attrOf(page.getByTestId('ai-composer-input'), 'placeholder')
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
  /*
   * READ ONLY IF IT IS THERE, and it was read unconditionally. The check above
   * had never passed, so this `innerText()` spent Playwright's default thirty
   * seconds on an element that was not on the page, threw, and ended the run on
   * `33 passed, 3 failed` with `ran 35 checks, expected 51`. Sixteen checks
   * never reported, and the twenty-one break patches aimed at this suite were
   * every one of them measured against a run that stopped here.
   */
  const stepWords = settled
    ? (await page.getByTestId('ai-trace-step-create_list').innerText().catch(() => '')).trim()
    : null
  chk(
    stepWords !== null && stepWords.length > 0 && !/^working$/i.test(stepWords),
    'with its own words, so a missing translation cannot pass as a present one',
    settled
      ? `the step read ${JSON.stringify(stepWords)} — the unknown-step fallback is "Working", and a ` +
        'check for "a step is present" would pass on it'
      : 'there was no create_list step on the page to read, so what it says could not be checked — ' +
        'reported as failed because UNKNOWN is not the same as fine',
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

  // ── `16:32` / `21:15` — the starter cards ──────────────────────────────────
  console.log('\n▶ `16:32` → `21:15` — four starter cards, and they CHANGE')
  /*
   * A THREAD-LESS PANEL, which is the only state the cards are drawn in. The
   * `?thread=` above put a conversation on screen; dropping it is what gets
   * back to the empty state, and a full navigation is also what forces the
   * cache miss BY CONSTRUCTION — the query client is a module-level instance
   * created on load, so a fresh document starts with nothing cached. Waiting
   * out the 30s `staleTime` would be a bet on a clock.
   */
  const openEmptyPanel = async () => {
    await page.goto(`${B}/app/${WS}/ai`, { waitUntil: 'domcontentloaded' })
    return waitUntil(() => page.getByTestId('ai-starters').isVisible().catch(() => false), { timeoutMs: 25_000 })
  }
  chk(await openEmptyPanel(), 'the empty panel draws a row of starter cards', 'no starter cards appeared')
  /*
   * `ai-starter-` does not match the container `ai-starters` — the character
   * after `ai-starter` is `s`, not `-` — and the exact count below is what
   * would catch it if that ever stopped being true. A testid prefix is a
   * namespace, and this one is separated from its container by one byte.
   */
  const cards = page.locator('[data-testid^="ai-starter-"]')
  chk(
    (await cards.count()) === 4,
    'four of them, as both frames draw four',
    `${await cards.count()} card(s) were drawn`,
  )
  const titles = await cards.evaluateAll((els) =>
    els.map((el) => ({
      testid: el.getAttribute('data-testid'),
      because: el.getAttribute('data-because'),
      lines: [...el.querySelectorAll('span')].map((s) => s.textContent?.trim() ?? ''),
    })),
  )
  chk(
    titles.every((c) => c.lines.length === 2 && c.lines[0].length > 0 && c.lines[1].length > 0 && c.lines[0] !== c.lines[1]),
    'each a title over its own one line, as `16:32` draws them',
    `the cards read ${JSON.stringify(titles.map((c) => c.lines))}`,
  )
  chk(
    new Set(titles.map((c) => c.testid)).size === 4 && titles.every((c) => !!c.because),
    'four distinct cards, each carrying the fact that put it there',
    `the cards were ${JSON.stringify(titles.map((c) => [c.testid, c.because]))}`,
  )
  /*
   * THE SET MOVES WITH A NUMBER, and the number is this run's.
   *
   * The e2e database is shared, so "Find Blockers is on screen" is not this
   * suite's to assert — somebody else's overdue task could have put it there.
   * What IS this suite's is the DELTA: read the count the card names, create two
   * overdue tasks assigned to this account, and require the card to name
   * exactly two more. A card that is always present fails this; so does one
   * whose `because` is a constant.
   */
  const overdueBefore = Number(
    (await page.getByTestId('ai-starter-findBlockers').getAttribute('data-because').catch(() => null))
      ?.split(':')[1] ?? 0,
  )
  const yesterday = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString()
  const me = (await api('/users/me')).data?.id
  for (let i = 0; i < 2; i++) {
    const res = await api('/tasks', {
      method: 'POST',
      body: { listId, title: `${TAG}-late-${i}`, dueDate: yesterday },
    })
    if (res.status < 400 && res.data?.id) {
      lateTasks.push(res.data.id)
      if (me) await api(`/tasks/${res.data.id}/assignees`, { method: 'POST', body: { userId: me } })
    }
  }
  chk(
    lateTasks.length === 2 && !!me,
    'the suite puts two overdue tasks of its own on this account',
    `it created ${lateTasks.length} and resolved its own user id as ${JSON.stringify(me ?? null)}`,
  )
  await openEmptyPanel()
  const blockers = page.getByTestId('ai-starter-findBlockers')
  const overdueAfter = Number((await blockers.getAttribute('data-because').catch(() => null))?.split(':')[1] ?? -1)
  chk(
    (await blockers.count()) === 1 && overdueAfter === overdueBefore + 2,
    'and "Find Blockers" now names exactly two more overdue tasks than before',
    `the card reported overdue:${overdueAfter} where overdue:${overdueBefore + 2} was owed ` +
      `(${await blockers.count()} card(s) present) — a set that does not move with the number is a fixed list`,
  )
  /*
   * THE SURFACE MOVES IT TOO, asked of the API directly: the cards for a list
   * and the cards for the workspace are different sets, and this is a pure
   * function of facts plus surface, so it needs no browser.
   */
  const wsCards = await api(`/ai/starters?workspaceId=${WS}&surface=workspace`)
  const listCards = await api(`/ai/starters?workspaceId=${WS}&surface=list`)
  const idsOf = (r) => (r.data?.cards ?? []).map((c) => c.id).join(',')
  chk(
    wsCards.status === 200 && listCards.status === 200 && idsOf(wsCards) !== idsOf(listCards),
    'and asking from a list gives a different four than asking from the workspace',
    `workspace gave ${idsOf(wsCards)} and list gave ${idsOf(listCards)}`,
  )
  /*
   * A CARD IS A CONTROL. Pressing it must send ITS OWN prompt — not its title,
   * which is a label and would ask the assistant "Project Status".
   */
  const pressed = page.getByTestId('ai-starter-projectStatus')
  // `aar-18-starters-are-a-fixed-list` replaces the card set, so this card is
  // gone and this read was the throw that cost that patch six checks.
  const pressedTitle = ((await textOf(pressed)) ?? '').split('\n')[0].trim()
  // AND THE PRESS, not only the read. I guarded the read for this same patch
  // this morning and left the press one line under it, which is precisely the
  // shape that keeps turning up: `aar-18-starters-are-a-fixed-list` replaces
  // the card set, so this card is gone, and the click spent its thirty seconds
  // and ended the section — the read above it having been spared (ledger §10).
  await pressed.click({ timeout: 8000 }).catch(() => {})
  const asked = await waitUntil(
    async () => (await page.locator('[data-testid^="ai-question-"]').count()) > 0,
    { timeoutMs: 15_000 },
  )
  const askedText = asked ? (await page.locator('[data-testid^="ai-question-"]').first().innerText()).trim() : ''
  chk(
    asked && askedText.length > pressedTitle.length && askedText !== pressedTitle,
    'pressing a card asks its prompt, which is a sentence and not the card’s label',
    `pressing ${JSON.stringify(pressedTitle)} asked ${JSON.stringify(askedText)}`,
  )

  // ── `17:42`–`17:50` — the word bar ─────────────────────────────────────────
  console.log('\n▶ `17:42`–`17:50` — three words above the composer, and they change')
  /*
   * ONE ENDPOINT INTERCEPTED, and it is the one that cannot answer honestly
   * here: with no provider key `GET /ai/status` reports `available: false` and
   * the composer is correctly disabled, so there is no way to type. Everything
   * the bar does is client-side and real; this only opens the door.
   *
   * THE BODY IS THE ENVELOPE, NOT THE PAYLOAD. This stub used to fulfil with
   * `{"available":true}`, and every API response in this product is wrapped —
   * the real route answers `{"data":{"available":false},"error":null}` and the
   * client reads `.data`. So the flat body unwrapped to `undefined`, the
   * composer stayed disabled, and the run died thirty seconds later on
   * `locator.fill` with nothing to say about why. Copy the shape from the live
   * route, never from the handler's `return`: the response interceptor sits
   * between them.
   */
  await page.route('**/api/v1/ai/status', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: '{"data":{"available":true},"error":null}',
    }),
  )
  await page.goto(`${B}/app/${WS}/ai`, { waitUntil: 'domcontentloaded' })
  const box = page.getByTestId('ai-composer-input')
  /*
   * ASSERTED, NOT AWAITED AND DISCARDED. This was a bare `await waitUntil(…)`
   * whose result nobody read, so a composer that never enabled carried on into
   * `box.fill` and failed there — a timeout in the middle of the word-bar
   * section, pointing at the wrong thing. A precondition that can fail is a
   * check; if it is not worth a line, it is not worth waiting for.
   */
  const typeable = await waitUntil(() => box.isEnabled().catch(() => false), { timeoutMs: 25_000 })
    .then(() => true)
    .catch(() => false)
  chk(
    typeable,
    'the composer is typeable once the product reports AI available',
    'the composer stayed disabled with `/ai/status` stubbed available — the stub is not reaching ' +
      'the client, and every word-bar check below would fail as a timeout rather than as itself',
  )
  chk(
    (await page.getByTestId('ai-word-suggestions').count()) === 0,
    'an empty composer offers nothing — the frames show no bar before anything is typed',
    'the word bar was up over an empty composer',
  )
  const wordsNow = async () =>
    page.locator('[data-testid^="ai-word-suggestion-"]').evaluateAll((els) =>
      els.map((el) => el.textContent?.trim() ?? ''),
    )
  await box.fill('create a ')
  const barUp = await waitUntil(async () => (await wordsNow()).length === 3, { timeoutMs: 8_000 })
  const afterA = await wordsNow()
  chk(
    barUp && afterA.join('|') === 'new|list|list of',
    'after "create a " it offers the frame’s own three: new · list · list of',
    `it offered ${JSON.stringify(afterA)} — \`17:42\` draws new, list, list of`,
  )
  await box.fill('create a folder name as ')
  const afterAs = await waitUntil(async () => (await wordsNow()).join('|') === 'the|a|you', { timeoutMs: 8_000 })
  chk(
    afterAs,
    'and after "…name as " it offers the frame’s other three: the · a · you',
    `it offered ${JSON.stringify(await wordsNow())} — \`17:46\` draws the, a, you; three words that never ` +
      'change would have photographed identically at both timecodes',
  )
  await box.fill('create a fol')
  const mid = await waitUntil(async () => (await wordsNow()).includes('folder'), { timeoutMs: 8_000 })
  chk(
    mid,
    'a half-typed word is COMPLETED from what the product can be asked to do',
    `mid-word it offered ${JSON.stringify(await wordsNow())}`,
  )
  await page.getByTestId('ai-word-suggestion-folder').click({ timeout: 8000 }).catch(() => {})
  const filled = await waitUntil(async () => (await box.inputValue()) === 'create a folder ', { timeoutMs: 8_000 })
  chk(
    filled,
    'and pressing it REPLACES the stem rather than appending after it',
    `the composer read ${JSON.stringify(await box.inputValue())}, not "create a folder " — ` +
      '"create a fol folder" is the version of this that looks right in a screenshot',
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
  for (const id of lateTasks) await api(`/tasks/${id}`, { method: 'DELETE' }).catch(() => {})
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

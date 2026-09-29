/**
 * BRAIN FROM A TASK AND FROM A COMMENT — `ledger-rows/row-743` and
 * `ledger-rows/row-751`.
 *
 * Frame `03:40` draws the task header's right side as "Created 7 Aug · Brain² ·
 * Share · ⋯", and frame `04:50` the comment "+" menu with Brain between Add
 * emoji and New Doc. Both were absent for a reason that had gone stale — "the
 * Brain² hub does not exist" — while an AI destination stood behind each: the
 * shell's AI dock for the header, the comment AI panel for the menu.
 *
 * WHAT CLICKUP DOES (help.clickup.com: "Use Brain AI on tasks", "Collaborate
 * with ClickUp Brain anywhere in your Workspace", "Use Brain on task
 * comments"). The task's upper-right Brain opens Brain in a side panel that by
 * default reads only the location it was opened from; in a comment, the Brain
 * icon in the field and Space on an empty comment both open Brain, to
 * summarize the context, take action or craft a reply.
 *
 * WHAT RUNDESK DOES, AND WHAT IS MEASURED HERE:
 *
 *   · Brain² opens the shell's AI dock pointed at the task — a chip naming it,
 *     and the task's title and id in the view every turn carries to the
 *     server — beside the sheet rather than under it. Closing the task hands
 *     the dock back to the page. The turn carries the task's id, and the
 *     server reads the task into the model's context once it has checked the
 *     reader may open it (checks 15 and 16, `found-29-sep/ai-chat-takes-no-task`).
 *   · Brain in the "+" menu opens the comment AI panel the space bar opens, and
 *     the panel's Summarize this task sends the task's id to
 *     `POST /ai/summarize`, which drafts from what is in the task.
 *
 * ON A LANE WITH NO MODEL, WHICH IS THE POINT. The dock and the panel open and
 * carry the task whether or not anything can answer, so every check here holds
 * on such a lane: what reaches the server is read off the wire, and what comes
 * back is asserted as `/ai/status` says it will be — the server's own sentence,
 * "AI features are not configured", where there is no model. The status is
 * read first and printed, so a run says which kind of lane it measured.
 *
 * AND ON A LANE WITH ONE, since 29 September. The model branch had never run:
 * it expected 200 where the routes answer a POST 201, and the model stub could
 * not stream, so the dock's turn ended in "request ended without sending any
 * chunks" (`found-29-sep/model-stub-never-streams`). Measured there, the dock
 * shows exactly the deltas the stream carried, and the panel the draft the
 * server sent. The fourteenth check is the dock's answer to a provider that
 * fails once the stream is open — an empty bubble until then
 * (`found-29-sep/dock-answers-a-failed-stream-with-nothing`): arranged at the
 * model stub where there is a model, and handed to the dock in the server's
 * own frames where there is none.
 *
 *   node test/e2e/brain-entry-points.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil, readText } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 16

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

/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`. */
const apiAs = (token) => async (route, init = {}) => {
  const headers = { authorization: `Bearer ${token}` }
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, { ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined }).catch(() => null)
  if (!res) return { status: 0, data: null, error: { message: 'no answer' } }
  const text = await res.text().catch(() => '')
  let json = null
  try { json = JSON.parse(text) } catch { /* no body */ }
  return { status: res.status, data: json?.data, error: json?.error }
}
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

/** The server's sentence where no model is configured (`AiService.assertAvailable`, and `/ai/chat`'s own 503). */
const REFUSAL = 'AI features are not configured'
/** The dock's own line for a turn that failed with no sentence of the server's to show. */
const HOUSE_LINE = 'Sorry, I encountered an error. Please try again.'

const stamp = Date.now()
const TAG = `bep${stamp}`
const TITLE = `Brain subject ${TAG}`
/** The task's description: what the model is given when the dock reads the task. */
const DESCRIPTION = `Kick-off notes from the vendor call ${TAG}.`
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
let WS = null
let A = null
let browser = null

try {
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const space = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} space` } })
  const project = await A('/projects', { method: 'POST', body: { spaceId: space.data?.id, name: `${TAG} project` } })
  const list = await A('/lists', { method: 'POST', body: { projectId: project.data?.id, name: `${TAG} list` } })
  const made2 = await A('/tasks', {
    method: 'POST',
    body: { listId: list.data?.id, title: TITLE, description: DESCRIPTION },
  })
  if (!made2.data?.id) {
    throw new Error(`could not stage the task: space ${said(space)}, project ${said(project)}, list ${said(list)}, task ${said(made2)}`)
  }
  const TASK = made2.data.id
  const LIST_URL = `${B}/app/${WS}/${space.data.id}/${project.data.id}/${list.data.id}`

  // Which kind of lane this is, read the way the dock and the panel read it.
  const aiStatus = await A('/ai/status')
  if (aiStatus.status !== 200 || typeof aiStatus.data?.available !== 'boolean') {
    throw new Error(`GET /ai/status answered ${said(aiStatus)}`)
  }
  const modelOn = aiStatus.data.available
  console.log(`  (/ai/status: available=${modelOn} — this lane ${modelOn ? 'has' : 'has NO'} model)`)

  const chromium = await resolveChromium()
  browser = await chromium.launch(launchOptions())
  // Wide enough that the dock is the shell's third column, as it is from md up.
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, serviceWorkers: 'block' })
  /*
   * THE COOKIE CARD IS DECIDED BEFORE THE APP LOADS. It is drawn in the
   * bottom-right corner after the app mounts, which is where the dock's
   * composer row is, and `settleCookies` below looked once, right after a
   * navigation: on a slower lane the card arrived after the look and covered
   * the scope chip (check 4 read "covered by div.card-glass" on lane 1). The
   * card's own decision, stored as the card stores it, so it is never drawn.
   */
  await ctx.addInitScript(() => {
    try { localStorage.setItem('rundesk.cookieConsent', 'accepted') } catch { /* storage refused: settleCookies still looks */ }
  })
  const page = await ctx.newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ADMIN.email)
  await page.fill('input[type=password]', ADMIN.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  const settleCookies = async () => {
    const accept = page.getByTestId('cookie-accept').first()
    if (await accept.isVisible().catch(() => false)) await accept.click({ timeout: 3000 }).catch(() => {})
  }
  await settleCookies()
  const openTask = async () => {
    await page.goto(`${LIST_URL}?task=${TASK}`, { waitUntil: 'domcontentloaded' })
    await settleCookies()
    return waitUntil(() => page.getByTestId('task-tab-overview').isVisible().catch(() => false), { timeoutMs: 25_000 })
  }
  if (!(await openTask())) throw new Error('the task sheet never opened')

  // ══ 1. THE HEADER OFFERS IT, WHERE THE FRAME PUTS IT ═════════════════════
  console.log('\n▶ frame `03:40` — the task header reads Created · Brain² · Share · ⋯')
  const brain = page.getByTestId('task-header-brain')
  const brainShown = await waitUntil(() => brain.isVisible().catch(() => false), { timeoutMs: 15_000 })
  const brainLabel = (await readText(brain.filter({ visible: true }), { timeoutMs: 3000 })).trim()
  const afterCreated = await page
    .evaluate(() => document.querySelector('[data-testid="task-created-chip"]')?.nextElementSibling?.getAttribute('data-testid') ?? null)
    .catch(() => null)
  chk(
    brainShown && brainLabel === 'Brain²' && afterCreated === 'task-header-brain',
    'the task header offers Brain², straight after its Created chip, as frame `03:40` draws it',
    `shown ${brainShown}, reading ${JSON.stringify(brainLabel)}; after the Created chip comes ${JSON.stringify(afterCreated)}`,
  )

  // ══ 2–4. PRESSED, IT OPENS THE DOCK: POINTED AT THE TASK, BESIDE IT ═══════
  console.log('\n▶ pressing Brain² opens the shell’s AI dock, on this task')
  await brain.click({ timeout: 8000 }).catch(() => {})
  const dock = page.getByTestId('ai-dock')
  const dockOpen = await waitUntil(() => dock.isVisible().catch(() => false), { timeoutMs: 15_000 })
  chk(dockOpen, 'pressing Brain² opens the shell’s AI dock', 'no dock appeared: a header button that opens nothing')

  const chip = page.getByTestId('ai-scope-chip')
  const chipShown = await waitUntil(() => chip.isVisible().catch(() => false), { timeoutMs: 15_000 })
  const chipText = (await readText(chip.filter({ visible: true }), { timeoutMs: 3000 })).trim()
  const chipId = await chip.getAttribute('data-scope-id', { timeout: 3000 }).catch(() => null)
  chk(
    chipShown && chipText.includes(TITLE) && chipId === TASK,
    'and the dock is pointed at this task: the chip over its composer names the task and carries its id',
    `chip shown ${chipShown}, reading ${JSON.stringify(chipText)}, id ${JSON.stringify(chipId)} (the task is ${TASK})`,
  )

  /*
   * BESIDE, NOT UNDER. The sheet's layer covers the viewport at z-50 and the
   * dock stood at z-40, so a dock opened from the sheet opened UNDER it —
   * in the DOM, `isVisible()` true, and out of reach. So this asks the page
   * what a press at each place would land on, which is the question a person
   * asks, and measures that the two panels do not overlap.
   */
  const measure = () =>
    page
      .evaluate(() => {
        const chipEl = document.querySelector('[data-testid="ai-scope-chip"]')
        const brainEl = document.querySelector('[data-testid="task-header-brain"]')
        const sheetEl = document.querySelector('[data-testid="task-sheet"]')
        const dockEl = document.querySelector('[data-testid="ai-dock"]')
        if (!chipEl || !brainEl || !sheetEl || !dockEl) return null
        const hitAt = (el) => {
          const r = el.getBoundingClientRect()
          return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        }
        const reached = (el) => {
          const at = hitAt(el)
          return !!at && el.contains(at)
        }
        // What is painted over the chip when it is not the chip, so a failure
        // names what covered it.
        const named = (at) =>
          at ? `${at.tagName.toLowerCase()}${at.getAttribute('data-testid') ? `[${at.getAttribute('data-testid')}]` : ''}.${String(at.className?.baseVal ?? at.className ?? '').slice(0, 60)}` : 'nothing'
        return {
          chipReached: reached(chipEl),
          ...(reached(chipEl) ? {} : { chipCoveredBy: named(hitAt(chipEl)) }),
          brainReached: reached(brainEl),
          sheetRight: Math.round(sheetEl.getBoundingClientRect().right),
          dockLeft: Math.round(dockEl.getBoundingClientRect().left),
        }
      })
      .catch(() => null)
  let layout = null
  const beside = await waitUntil(async () => {
    layout = await measure()
    return !!layout && layout.chipReached && layout.brainReached && layout.sheetRight <= layout.dockLeft
  }, { timeoutMs: 8000 })
  chk(
    beside,
    'and the dock stands beside the task, not under it: a press on its chip reaches the chip, the sheet’s own Brain² is still within reach, and the sheet ends where the dock begins',
    `measured ${JSON.stringify(layout)}`,
  )

  // ══ 5–6. A TURN FROM THE DOCK NAMES THE TASK ══════════════════════════════
  console.log('\n▶ a turn asked from the dock carries the task to the server')
  /*
   * The composer is disabled where there is no model, so the turn is asked by
   * a starter card, which sends through the same `sendMessage` the composer
   * does. Matched on the exact path: `/ai/chat-threads`, where the dock mints
   * its thread first, begins with the same characters.
   */
  const chatTurn = () =>
    page
      .waitForResponse((r) => new URL(r.url()).pathname === '/api/v1/ai/chat' && r.request().method() === 'POST', {
        timeout: 20_000,
      })
      .catch(() => null)
  const sentView = (res) => {
    try {
      return JSON.parse(res?.request().postData() ?? 'null')?.currentView ?? null
    } catch {
      return null
    }
  }
  /*
   * The lane's model stub, where there is a model: it keeps every call made to
   * it, so what the model was GIVEN can be read, and it can be told to fail.
   * Reset before the first turn, because it outlives every run.
   */
  const stubAt = `http://127.0.0.1:${9200 + (API_PORT - 3020)}`
  const stubCtl = (route, body) =>
    fetch(`${stubAt}/__control/${route}`, { method: 'POST', ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) })
      .then((r) => r.ok)
      .catch(() => false)
  if (modelOn) await stubCtl('reset')
  const starter = page.locator('[data-testid^="ai-starter-"]').first()
  await waitUntil(() => starter.isVisible().catch(() => false), { timeoutMs: 15_000 })
  const firstTurn = chatTurn()
  await starter.click({ timeout: 8000 }).catch(() => {})
  const turn = await firstTurn
  const view = sentView(turn)
  chk(
    view === `list / task ${JSON.stringify(TITLE)} (id ${TASK})`,
    'a turn asked from the dock goes to the server naming this task — its title and its id — beside the list it is over',
    turn ? `currentView went out as ${JSON.stringify(view)}` : 'no turn reached /ai/chat at all',
  )

  const turnStatus = turn?.status() ?? 0
  const turnSaid = turn ? await turn.text().catch(() => '') : ''
  const answer = dock.locator('[data-testid^="ai-answer-"]').filter({ visible: true }).last()
  const answered = await waitUntil(async () => (await readText(answer, { timeoutMs: 1000 })).trim().length > 0, {
    timeoutMs: 15_000,
  })
  const answerText = answered ? (await readText(answer, { timeoutMs: 3000 })).trim() : ''
  /*
   * WITH A MODEL, WHAT THE STREAM CARRIED. The route answers a POST 201, and
   * the dock's answer is the deltas the server sent, joined — measured on a
   * model lane on 29 September, where this read 200 and "anything at all" and
   * failed on both (`found-29-sep/model-stub-never-streams` had kept every
   * streamed turn from answering there).
   */
  const deltasSent = turnSaid
    .split('\n')
    .filter((l) => l.startsWith('data: '))
    .map((l) => { try { return JSON.parse(l.slice(6))?.delta ?? '' } catch { return '' } })
    .join('')
    .trim()
  chk(
    modelOn
      ? turnStatus === 201 && deltasSent.length > 0 && answerText === deltasSent
      : turnStatus === 503 && turnSaid.includes(REFUSAL) && answerText === REFUSAL,
    'and the dock answers that turn as /ai/status says it will — with no model, in the server’s own words: “AI features are not configured”',
    `the turn answered ${turnStatus} ${JSON.stringify(turnSaid.slice(0, 120))}${modelOn ? `, its deltas joining to ${JSON.stringify(deltasSent.slice(0, 80))}` : ''}; the dock said ${JSON.stringify(answerText.slice(0, 120))}`,
  )

  // ══ 15–16. THE TASK ITSELF, NOT ONLY ITS NAME ═════════════════════════════
  /*
   * `found-29-sep/ai-chat-takes-no-task`: the dock named the task and the server
   * never read it. The turn carries the task's id now; where a model answers,
   * what the model was given holds the task's description, read at the stub,
   * and the trace names the step. Without a model nothing reaches one, so the
   * wire is what can be read there.
   */
  const sentTaskId = (() => {
    try {
      return JSON.parse(turn?.request().postData() ?? 'null')?.taskId ?? null
    } catch {
      return null
    }
  })()
  const seenCalls = modelOn
    ? await fetch(`${stubAt}/__control/seen`).then((r) => r.json()).then((j) => j.calls ?? []).catch(() => [])
    : []
  const promptHadTask = seenCalls.some((c) => JSON.stringify(c.system ?? '').includes(DESCRIPTION))
  const traced = /"step":"task"/.test(turnSaid)
  chk(
    sentTaskId === TASK && (modelOn ? promptHadTask && traced : true),
    'and the turn carries the task itself: its id goes to the server, and where a model answers, the task’s description is in what the model is given, with the task step in the trace',
    `taskId went out as ${JSON.stringify(sentTaskId)}` +
      (modelOn ? `; ${seenCalls.length} call(s) reached the model, ${promptHadTask ? 'one' : 'none'} holding the description; the trace ${traced ? 'named' : 'did not name'} the task step` : ''),
  )

  /*
   * A turn about a task is answered only for a task its asker may open, in the
   * workspace the turn names — refused before anything is streamed, and before
   * whether a model is configured, so it reads the same on every lane.
   */
  const others = await A('/workspaces')
  // Each entry is `{ workspace, role }`.
  const OTHER_WS = (Array.isArray(others.data) ? others.data : []).map((w) => w.workspace?.id ?? w.id).find((id) => id && id !== WS) ?? null
  const aboutTask = (extra) => ({ messages: [{ role: 'user', content: 'What is this task about?' }], ...extra })
  const notThere = await A('/ai/chat', { method: 'POST', body: aboutTask({ workspaceId: WS, taskId: '00000000-0000-4000-8000-000000000000' }) })
  const elsewhere = OTHER_WS
    ? await A('/ai/chat', { method: 'POST', body: aboutTask({ workspaceId: OTHER_WS, taskId: TASK }) })
    : { status: 0, error: { message: 'the admin belongs to no other workspace' } }
  chk(
    notThere.status === 404 && elsewhere.status === 400 && /not in this workspace/.test(elsewhere.error?.message ?? ''),
    'a turn about a task is refused before anything is streamed when the task is not there (404) or is not in the workspace the turn names (400), with or without a model',
    `a task that is not there answered ${said(notThere)}; this task, named from another workspace, answered ${said(elsewhere)}`,
  )

  // ══ 7–8. CLOSING THE TASK HANDS THE DOCK BACK TO THE PAGE ═════════════════
  console.log('\n▶ closing the task hands the dock back to the page')
  // The overlay's top-left corner: the dim strip of page left of the sheet.
  await page
    .getByRole('button', { name: 'Close sheet overlay' })
    .first()
    .click({ position: { x: 12, y: 12 }, timeout: 8000 })
    .catch(() => {})
  const released = await waitUntil(
    async () =>
      !(await page.getByTestId('task-sheet').isVisible().catch(() => false)) && (await chip.count()) === 0,
    { timeoutMs: 10_000 },
  )
  const dockStayed = await dock.isVisible().catch(() => false)
  // `chipShown` carried in: "the chip is gone" says nothing about a chip that never came.
  chk(
    chipShown && released && dockStayed,
    'closing the task leaves the dock open and hands it back to the page: the chip naming the task is gone',
    `the chip had been shown ${chipShown}; sheet closed and chip gone ${released}; dock still open ${dockStayed}`,
  )

  /*
   * AND THE WIRE AGREES WITH THE CHIP. Once a turn has been asked the starter
   * cards are gone, and with no model the composer is disabled, so the next
   * turn is the last answer's regenerate — the same question through the same
   * `sendMessage`, carrying whatever the dock is pointed at NOW.
   */
  const secondTurn = chatTurn()
  await dock.getByTestId('ai-action-regenerate').last().click({ timeout: 8000 }).catch(() => {})
  const turn2 = await secondTurn
  const view2 = sentView(turn2)
  chk(
    view2 === 'list',
    'and the dock’s next turn names no task: it goes out with the list’s view alone',
    turn2 ? `currentView went out as ${JSON.stringify(view2)}` : 'no second turn reached /ai/chat',
  )

  /*
   * A TURN THE PROVIDER FAILS AFTER THE STREAM OPENED. The server writes its
   * steps, then `{ error }`, and the dock answered that with an empty bubble
   * (`found-29-sep/dock-answers-a-failed-stream-with-nothing`). With a model,
   * the provider's failure is real: the stub fails the calls, as many times as
   * the SDK retries. Without one, the server refuses before any stream opens,
   * so the same frames are handed to the dock in the server's own shape — the
   * one `chatStream`'s catch writes.
   */
  /*
   * THE LAST TURN HAS FINISHED FIRST. `chatTurn` resolves on the response's
   * headers, and the model is called after them: a failure staged while the
   * turn before was still on its way failed THAT turn, and the last answer
   * read the house line before this one was asked (lane 7, 29 September).
   */
  if (turn2) await turn2.text().catch(() => '')
  await waitUntil(async () => (await dock.getByTestId('ai-answer-streaming').count()) === 0, { timeoutMs: 15_000 })
  let arrangedFailure = false
  if (modelOn) {
    arrangedFailure = (await stubCtl('reset')) && (await stubCtl('next', { status: 500, message: `arranged by brain-entry-points ${stamp}`, count: 8 }))
  } else {
    await page.route('**/api/v1/ai/chat', (route) =>
      route.fulfill({
        status: 201,
        headers: { 'content-type': 'text/event-stream' },
        body: `data: ${JSON.stringify({ step: 'workspace' })}\n\ndata: ${JSON.stringify({ error: `arranged by brain-entry-points ${stamp}` })}\n\n`,
      }),
    )
    arrangedFailure = true
  }
  /*
   * Read by what the last answer SAYS, not by a count: a regenerate drops the
   * answer it replaces before the new one lands, so the count ends where it
   * began (the first version of this check counted, and failed on a fixed
   * build). What the last answer said before is kept, so an answer already
   * reading the house line cannot pass for this turn's.
   */
  const failedAnswer = dock.locator('[data-testid^="ai-answer-"]').filter({ visible: true }).last()
  const lastBefore = (await readText(failedAnswer, { timeoutMs: 2000 })).trim()
  const thirdTurn = chatTurn()
  await dock.getByTestId('ai-action-regenerate').last().click({ timeout: 8000 }).catch(() => {})
  const turn3 = await thirdTurn
  const turn3Said = turn3 ? await turn3.text().catch(() => '') : ''
  const failedShown = await waitUntil(
    async () => (await readText(failedAnswer, { timeoutMs: 1000 })).trim() === HOUSE_LINE,
    { timeoutMs: 20_000 },
  )
  const failedText = (await readText(failedAnswer, { timeoutMs: 3000 })).trim()
  if (modelOn) await stubCtl('reset')
  else await page.unroute('**/api/v1/ai/chat').catch(() => {})
  chk(
    arrangedFailure && /"error"/.test(turn3Said) && lastBefore !== HOUSE_LINE && failedShown && failedText === HOUSE_LINE,
    'and a turn the provider fails once its stream is open is answered in words — “Sorry, I encountered an error. Please try again.” — not with an empty bubble',
    `the failure was ${arrangedFailure ? '' : 'NOT '}arranged${modelOn ? ' at the model stub' : ' in the server’s frames'}; the turn said ${JSON.stringify(turn3Said.slice(0, 160))}; the last answer read ${JSON.stringify(lastBefore.slice(0, 60))} before and ${JSON.stringify(failedText.slice(0, 120))} after`,
  )

  // ══ 9–10. THE COMMENT "+" MENU OFFERS BRAIN, AND IT OPENS THE PANEL ═══════
  console.log('\n▶ frame `04:50` — Brain in the comment “+” menu')
  if (!(await openTask())) throw new Error('the task sheet did not open a second time')
  await page.getByTestId('task-tab-comments').click({ timeout: 15_000 }).catch(() => {})
  await page.getByTestId('comment-plus').click({ timeout: 15_000 }).catch(() => {})
  const plusBrain = page.getByTestId('comment-plus-brain')
  const offered = await waitUntil(() => plusBrain.isVisible().catch(() => false), { timeoutMs: 10_000 })
  const itemLabel = (await readText(plusBrain.filter({ visible: true }), { timeoutMs: 3000 })).trim()
  const order = await page
    .evaluate(() =>
      [...document.querySelectorAll('[role="menu"] [data-testid^="comment-plus-"]')].map((el) => el.getAttribute('data-testid')),
    )
    .catch(() => [])
  const at = order.indexOf('comment-plus-brain')
  chk(
    offered && itemLabel === 'Brain' && at > 0 && order[at - 1] === 'comment-plus-emoji',
    'the comment “+” menu offers Brain, beside Add emoji where frame `04:50` draws it',
    `offered ${offered}, reading ${JSON.stringify(itemLabel)}; the menu runs ${order.join(' · ') || '(nothing)'}`,
  )

  await plusBrain.click({ timeout: 8000 }).catch(() => {})
  const panel = page.getByTestId('comment-ai-panel')
  const panelOpen = await waitUntil(() => panel.isVisible().catch(() => false), { timeoutMs: 10_000 })
  const panels = await panel.count()
  /*
   * THE CURSOR, READ ONCE THE MENU IS GONE AND READ AGAIN A MOMENT LATER. A
   * closing menu hands focus back to its trigger a tick after it unmounts, so a
   * prompt that has focus while the menu is still animating out can lose it to
   * the "+" — and a check that sampled the early moment would pass on it.
   */
  await waitUntil(async () => (await page.locator('[role="menu"]').count()) === 0, { timeoutMs: 5000 })
  const focused = () => page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null).catch(() => null)
  const cameIn = await waitUntil(async () => (await focused()) === 'comment-ai-prompt', { timeoutMs: 3000 })
  const wandered = cameIn && (await waitUntil(async () => (await focused()) !== 'comment-ai-prompt', { timeoutMs: 800 }))
  const focusedNow = await focused()
  chk(
    panelOpen && panels === 1 && cameIn && !wandered,
    'choosing Brain opens the comment AI panel — the one the space bar opens, exactly one — with the cursor in its prompt',
    `panel open ${panelOpen} (${panels} of them); the cursor is on ${JSON.stringify(focusedNow)}`,
  )

  // ══ 11–13. ITS SUMMARIZE CARRIES THE TASK, AND NOTHING IS POSTED ══════════
  console.log('\n▶ the panel’s Summarize this task sends the task, and the answer is the server’s')
  const commentsBefore = await A(`/tasks/${TASK}/comments`)
  await page.getByTestId('comment-ai-mode').selectOption('summarize', { timeout: 8000 }).catch(() => {})
  const summarizeCall = page
    .waitForResponse(
      (r) => new URL(r.url()).pathname === '/api/v1/ai/summarize' && r.request().method() === 'POST',
      { timeout: 20_000 },
    )
    .catch(() => null)
  await page.getByTestId('comment-ai-run').click({ timeout: 8000 }).catch(() => {})
  const summarized = await summarizeCall
  let sent = null
  try {
    sent = JSON.parse(summarized?.request().postData() ?? 'null')
  } catch {
    sent = null
  }
  chk(
    sent?.taskId === TASK && sent?.type === 'task',
    'asked to Summarize this task, the panel sends this task’s id to /ai/summarize — the task is what it drafts from, not a typed instruction',
    summarized ? `the request carried ${JSON.stringify(sent)}` : 'nothing reached /ai/summarize',
  )

  const sumStatus = summarized?.status() ?? 0
  // With a model, the draft the panel must show is the one the server sent.
  const sumDraft = modelOn ? String((await summarized?.json().catch(() => null))?.data?.summary ?? '').trim() : ''
  const errorBox = page.getByTestId('comment-ai-error')
  const draftBox = page.getByTestId('comment-ai-draft')
  const replied = await waitUntil(
    async () => (await errorBox.isVisible().catch(() => false)) || (await draftBox.isVisible().catch(() => false)),
    { timeoutMs: 20_000 },
  )
  const errorSaid = (await readText(errorBox.filter({ visible: true }), { timeoutMs: 2000 })).trim()
  const draftSaid = (await readText(draftBox.filter({ visible: true }), { timeoutMs: 2000 })).trim()
  chk(
    replied && (modelOn ? sumStatus === 201 && draftSaid.length > 0 && draftSaid === sumDraft : sumStatus === 503 && errorSaid === REFUSAL),
    'and the panel shows what the server answered, as /ai/status says it will — with no model, its own words: “AI features are not configured”',
    `/ai/summarize answered ${sumStatus}${modelOn ? ` with ${JSON.stringify(sumDraft.slice(0, 80))}` : ''}; the panel said ${JSON.stringify(errorSaid || draftSaid)}`,
  )

  const composerNow = await page.getByTestId('comment-input').inputValue({ timeout: 5000 }).catch(() => null)
  const commentsAfter = await A(`/tasks/${TASK}/comments`)
  const before = Array.isArray(commentsBefore.data) ? commentsBefore.data.length : null
  const after = Array.isArray(commentsAfter.data) ? commentsAfter.data.length : null
  // `replied` carried in: "nothing reached the comment" says nothing about an ask that never ran.
  chk(
    replied && composerNow === '' && before !== null && after === before,
    'and nothing reached the comment: the box is as it was and the task has no new comment — a draft goes in only by Keep',
    `the box reads ${JSON.stringify(composerNow)}; comments ${before} → ${after} (${said(commentsAfter)})`,
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
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}

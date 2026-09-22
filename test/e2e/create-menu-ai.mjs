/**
 * §V2-S07 frame `06:40` — THE CREATE MENU'S SEARCH BOX AND ITS AI ROW.
 *
 * The frame, zoomed: a text box reading **"Describe anything to create"** over
 * a **Create** heading, then Task · List · Space, a rule, then **Create with
 * AI** and **Super Agent ᴴᴼᵀ**, a rule, then Doc · Form · Dashboard ·
 * Whiteboard, and a footer of Import | Templates.
 *
 * And §V2-S11 frame `10:04`, which is the same idea inside the task form: the
 * description box reads **"Add description, or write with ⚡AI"**.
 *
 * Rundesk had neither. The modal opened straight onto a nine-item tab strip,
 * and its description placeholder was "Description — what does done look like?"
 *
 * WHAT THIS SUITE IS ACTUALLY WATCHING FOR:
 *
 *   · A SEARCH THAT NARROWS, BOTH WAYS. Not "a box is present" and not "fewer
 *     tabs appeared": the exact set, before and after, and back again when the
 *     box is cleared. A filter that only ever removes is dead on the second
 *     keystroke, which is the "key on a counter, not on the mode" defect in a
 *     different costume.
 *
 *   · THE AI ROW ACTUALLY CREATES. This is the whole row. A "Create with AI"
 *     that opens the AI page with the text pre-filled is a link wearing a verb.
 *     So the CONFIRM path is driven against the real API and the assertion is
 *     that a list EXISTS in this run's space afterwards — server state, not a
 *     toast and not the absence of an error.
 *
 *   · AND REFUSES HONESTLY WHEN IT CANNOT. There is no provider key in this
 *     environment, so `POST /ai/command` answers 503. That is checked against
 *     the real route first — including its MESSAGE, because a bare `503` is
 *     also what a rate limiter or a dead upstream would produce and the three
 *     are different problems — and then checked again on screen, so a create
 *     surface that goes quiet cannot pass.
 *
 * WHY THE PLANNER IS STUBBED FOR THE SECOND HALF, AND WHY THAT IS NOT THE
 * PLANNER-RAIL DEFECT. That defect was a stub implementing a URL the API does
 * not serve (`/tasks/workspace/:ws/member/:id`), so every check written against
 * it was about a route that could never answer. Here the route being stubbed is
 * asserted to exist and to refuse, unstubbed, in the SAME run — and only the
 * model-facing half is replaced. The half that creates, `POST
 * /ai/command/execute`, makes no model call at all and runs against the real
 * Nest process and the real Postgres, which is the same door
 * `ai-create-containers.mjs` uses.
 *
 * SUPER AGENT is deliberately absent from the build and no check here asks for
 * it: Rundesk has no agents, and the ledger records the Brain²/Super Agents hub
 * as missing. A row naming one would be the dead control.
 *
 * ITS OWN FIXTURES: one space this run makes, and every server-side read
 * narrowed to it.
 *
 *   node test/e2e/create-menu-ai.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { apiClient, login } from './lib/fixture.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil, readText } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a branch that skipped is a failure. */
// 24 since 22 September: one check compares this suite's list of creatable kinds
// against `create-types.ts`, which a DERIVED list cannot do — a patch that edits
// that file would move the expectation with the product.
const EXPECTED_CHECKS = 24

const REPO = path.resolve(import.meta.dirname, '../..')
const EMAIL = process.env.E2E_EMAIL ?? 'admin@rundesk.internal'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123!'

/**
 * `lib/create-types.ts`, in its order — READ FROM IT rather than kept beside it.
 *
 * This was a hand-written array of nine, under a comment saying "if a tenth
 * creatable type is ever added, this line is the place that says so out loud".
 * A tenth was added — `form` — and the line said nothing out loud: it went RED,
 * in a suite whose break set had never been run, so
 * `21 passed, 2 failed` sat on disk for days and the set refused itself. The
 * comment described an intention the mechanism could not carry out, which is
 * the stale reason with the fixture underneath it.
 *
 * Parsed out of the source, so the day a kind is added this suite tracks it and
 * the check keeps the meaning it was written for: the strip renders from
 * `CREATE_TYPES` at runtime, so a strip given its OWN copy of the list drifts
 * from the file and this still reddens — which is exactly what
 * `space-create-menu-5-twolists` does.
 */
const CREATE_TYPES_SRC = path.resolve(REPO, 'apps/web/src/lib/create-types.ts')
/*
 * DECLARED, AND CHECKED AGAINST THE SOURCE — the second correction in a day.
 *
 * The hand-kept array went stale when `form` was added and the baseline went
 * red; deriving it from `create-types.ts` fixed that and introduced a worse
 * problem, because that file is a file PATCHES EDIT. `form-1-not-offered`
 * removes the `form` entry, so a derived list loses it too and the comparison
 * below compares a patched strip against a patched expectation — a check that
 * cannot fail. `space-create-menu` hit the other half of the same mistake and
 * came back `ran 29 checks, expected 28`.
 *
 * So: declared, with a CHECK that the product's list matches. That is what the
 * original comment promised — "the place that says so out loud" — and what a
 * bare array could not do, because nothing compared the two.
 */
const EXPECTED_KINDS = [
  'task', 'doc', 'reminder', 'whiteboard', 'dashboard', 'form', 'list', 'folder', 'project', 'space',
]
const KINDS_IN_SOURCE = [
  ...readFileSync(CREATE_TYPES_SRC, 'utf8').matchAll(/^\s*\{\s*value:\s*'([a-z-]+)'/gm),
].map((m) => m[1])

const results = []
const ok = (m) => { results.push(1); console.log(`  \x1b[32mPASS\x1b[0m ${m}`) }
const bad = (m) => { results.push(0); console.log(`  \x1b[31mFAIL\x1b[0m ${m}`) }
const chk = (c, good, badMsg) => (c ? ok(good) : bad(badMsg ?? good))

/*
 * A GATE THAT REPORTS, AND A READ THAT REPORTS, because this suite's three
 * section openings were both.
 *
 * `cma-16-no-search-box` renames the search box's testid — which is precisely
 * the check the patch claims — and `page.waitForSelector` threw after twenty
 * seconds before a single check had run. Four of 24 checks reported. The read
 * underneath it would have thrown for another thirty on its own.
 *
 * `appears` answers false where it used to throw, and `attrOf` answers null, so
 * the check below each gate reddens with the placeholder it actually found.
 */
const appears = (selector, timeoutMs = 20_000) =>
  page
    .waitForSelector(selector, { timeout: timeoutMs })
    .then(() => true)
    .catch(() => false)
const attrOf = (loc, name) => loc.getAttribute(name, { timeout: 3_000 }).catch(() => null)

const TAG = `e2e-cma-${Date.now()}`
const SPACE_NAME = `AI ${TAG}`
const LIST_NAME = `ailist-${TAG}`
const TASK_TITLE = `Write-up ${TAG}`

const chromium = await resolveChromium()
let stack = null
let B = (process.env.BASE ?? '').replace(/\/$/, '')
if (!B) {
  stack = await startLocalStack({
    dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')),
    apiPort: Number(argOf('--api', process.env.E2E_API_PORT ?? 3011)),
  })
  B = stack.base
}

let browser = null
let page = null
let SPACE = null
let api = null

const tabKinds = (p) =>
  p.locator('[data-testid^="create-tab-"]').evaluateAll((els) =>
    els.map((e) => (e.getAttribute('data-testid') ?? '').replace('create-tab-', '')),
  )

try {
  const auth = await login(`${B}/api/v1`, EMAIL, PASSWORD)
  api = apiClient(`${B}/api/v1`, auth.accessToken)

  // The fixture's apiClient NEVER THROWS — it answers {status, data, error} —
  // so every call is read off `status` or a failure reads as success.
  const wsRes = await api('/workspaces')
  if (wsRes.status >= 300) throw new Error(`GET /workspaces answered ${wsRes.status}`)
  const WS = ((wsRes.data ?? [])[0]?.workspace ?? (wsRes.data ?? [])[0])?.id
  if (!WS) throw new Error('this account can see no workspace')

  const spaceRes = await api('/spaces', { method: 'POST', body: { workspaceId: WS, name: SPACE_NAME } })
  if (spaceRes.status >= 300 || !spaceRes.data?.id) throw new Error(`could not make a space: ${spaceRes.status}`)
  SPACE = spaceRes.data.id

  console.log('\n▶ the planner, against the real route, before anything is stubbed')
  const planned = await api('/ai/command', { method: 'POST', body: { workspaceId: WS, message: 'create a list' } })
  chk(
    planned.status === 503,
    'POST /ai/command exists and refuses rather than pretending to plan',
    `it answered ${planned.status} — a 404 would mean the stub below describes a route the API does not serve`,
  )
  chk(
    // THE MESSAGE TOO. A bare 503 is also what a rate limiter or a dead
    // upstream produces; only the words say which of the three this is.
    /not configured/i.test(String(planned.error?.message ?? '')),
    'and says WHY — "AI features are not configured", not a bare code',
    `the refusal read ${JSON.stringify(planned.error?.message ?? null)}`,
  )

  browser = await chromium.launch(launchOptions())
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  page = await ctx.newPage()

  const planCalls = []
  const execCalls = []
  const writeCalls = []
  page.on('request', (r) => {
    if (r.method() !== 'POST') return
    const url = new URL(r.url())
    if (url.pathname.endsWith('/ai/command')) planCalls.push(r.postData() ?? '')
    if (url.pathname.endsWith('/ai/command/execute')) execCalls.push(r.postData() ?? '')
    if (url.pathname.endsWith('/ai/task/generate')) writeCalls.push(r.postData() ?? '')
  })

  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click().catch(() => {})

  await page.goto(`${B}/app/${WS}`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('quick-create-open').click({ timeout: 25_000 })
  await appears('[data-testid="create-search"]')

  console.log('\n▶ the box frame `06:40` draws, and what it says')
  const placeholder = await attrOf(page.getByTestId('create-search'), 'placeholder')
  chk(
    placeholder === 'Describe anything to create',
    'the create menu opens with the frame\'s own sentence over it',
    `the placeholder read ${JSON.stringify(placeholder)}`,
  )

  chk(
    JSON.stringify(KINDS_IN_SOURCE) === JSON.stringify(EXPECTED_KINDS),
    `lib/create-types.ts declares the ${EXPECTED_KINDS.length} kinds this suite knows, in its order`,
    `create-types.ts declares ${JSON.stringify(KINDS_IN_SOURCE)} where this suite expects ` +
      `${JSON.stringify(EXPECTED_KINDS)} — one of the two has moved, and every comparison below is ` +
      'against the list this suite carries rather than the one the product ships',
  )

  const whole = await tabKinds(page)
  chk(
    JSON.stringify(whole) === JSON.stringify(EXPECTED_KINDS),
    `an empty box offers all ${EXPECTED_KINDS.length} creatable types, in lib/create-types.ts order`,
    `the strip offered ${JSON.stringify(whole)}`,
  )

  console.log('\n▶ and it narrows — to a set, not merely to fewer')
  // `cma-16-no-search-box` renames this box's testid — which is what the
  // placeholder check above reports — so every read and fill of it here is on
  // something that is not there. Bounded, the narrowing checks below report
  // the strip they actually find (ledger §10).
  await page.getByTestId('create-search').fill('fold', { timeout: 8000 }).catch(() => {})
  chk(
    await waitUntil(async () => {
      const now = await tabKinds(page)
      return now.length === 2 && now.includes('folder') && now.includes('task')
    }, { timeoutMs: 8000 }),
    'typing "fold" leaves Folder — and the tab that is open, so the form on screen stays reachable',
    `the strip read ${JSON.stringify(await tabKinds(page))} — the open tab must never be filtered out ` +
      'from under its own form',
  )

  await page.getByTestId('create-search').fill('zzzqq', { timeout: 8000 }).catch(() => {})
  chk(
    (await page.locator('[data-testid="create-search-empty"]').count()) === 1 &&
      JSON.stringify(await tabKinds(page)) === JSON.stringify(['task']),
    'a query that matches nothing SAYS so, instead of drawing an empty strip',
    `it drew ${JSON.stringify(await tabKinds(page))} with ` +
      `${await page.locator('[data-testid="create-search-empty"]').count()} explanation(s)`,
  )

  await page.getByTestId('create-search-clear').click({ timeout: 8000 }).catch(() => {})
  chk(
    await waitUntil(async () => JSON.stringify(await tabKinds(page)) === JSON.stringify(EXPECTED_KINDS), { timeoutMs: 8000 }),
    'clearing the box brings every type back — the narrowing goes both ways',
    `after clearing, the strip read ${JSON.stringify(await tabKinds(page))} — a one-way filter is ` +
      'dead on the second keystroke',
  )

  console.log('\n▶ Create with AI needs something to create from')
  // The disabled read opens the condition, so there is no `&&` in front of it to
  // short-circuit: a button that is gone would sit out the default timeout and
  // end the section here instead (ledger §10). Bounded and caught, then compared
  // against `true` — a missing control is not a disabled one, and null has to
  // fail this check rather than be read as "dead".
  const aiOpenDisabled = await page.getByTestId('create-ai-open').isDisabled({ timeout: 8000 }).catch(() => null)
  chk(
    aiOpenDisabled === true &&
      (await page.locator('[data-testid="create-ai-hint"]').count()) === 1,
    'with the box empty the button is not pressable, and says why',
    'the button was live with nothing to describe — it would send an empty prompt and render ' +
      'whatever came back',
  )

  await page.getByTestId('create-search').fill(`create a list called ${LIST_NAME} in ${SPACE_NAME}`, { timeout: 8000 }).catch(() => {})
  chk(
    await waitUntil(async () => !(await page.getByTestId('create-ai-open').isDisabled()), { timeoutMs: 8000 }),
    'and it becomes pressable once there is something to describe',
    'the button stayed dead with text in the box',
  )

  console.log('\n▶ pressed, it asks the real planner — and the refusal reaches the person')
  // Bounded and caught: the check above it is allowed to fail, and an unbounded
  // press on a control that is not there ends the section instead (ledger §10).
  await page.getByTestId('create-ai-open').click({ timeout: 10_000 }).catch(() => {})
  chk(
    await waitUntil(() => planCalls.length === 1, { timeoutMs: 20_000 }),
    'pressing it sends exactly one POST /ai/command',
    `${planCalls.length} planner request(s) went out`,
  )
  let sentPlan = null
  try { sentPlan = JSON.parse(planCalls[0] ?? '{}') } catch { /* reported below */ }
  chk(
    // NON-EMPTY FIRST, in the same check: "no request carried the wrong text"
    // is vacuously true when nothing was requested.
    planCalls.length === 1 && sentPlan?.message === `create a list called ${LIST_NAME} in ${SPACE_NAME}`,
    'carrying the TYPED TEXT as the message — the box is the prompt, not a label over a filter',
    `the body was ${JSON.stringify(sentPlan)}`,
  )

  const shownError = await readText(page.getByTestId('create-ai-error'))
  chk(
    /503/.test(shownError) && /not configured/i.test(shownError),
    'the 503 is shown with the provider\'s own words, not swallowed and not reduced to a code',
    `the panel read ${JSON.stringify(shownError)} — a create surface that goes quiet is ` +
      'indistinguishable from one that is working',
  )
  chk(
    (await page.locator('[data-testid="create-ai-confirm"]').count()) === 0 &&
      (await page.locator('[data-testid="create-ai-result-0"]').count()) === 0,
    'and nothing on screen claims anything was created',
    'a confirm button or a result row survived a refused plan',
  )

  console.log('\n▶ with a plan in hand, the confirm path creates for real')
  /*
   * ONLY the model-facing half is replaced, with a plan of exactly the shape
   * `PlanAction` declares. `/ai/command/execute` below is untouched and runs
   * against the real API.
   */
  const PLAN = {
    summary: `Create the list ${LIST_NAME} in ${SPACE_NAME}.`,
    actions: [
      {
        tool: 'create_list',
        args: { spaceId: SPACE, name: LIST_NAME },
        // Deliberately shares no text with the container the server will make,
        // so the result check below cannot pass by echoing the plan back.
        humanLabel: 'Set that up',
      },
    ],
    readOnlyResults: [],
    warnings: [],
  }
  await ctx.route(
    (url) => url.pathname.endsWith('/ai/command'),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: PLAN, error: null }),
      }),
  )

  // `cma-16-no-search-box` renames the testid this section needs, so the panel
  // never opens and this press ended the run at 15 of 24.
  await page.getByTestId('create-ai-open').click({ timeout: 8000 }).catch(() => {})
  await appears('[data-testid="create-ai-confirm"]')
  chk(
    (await readText(page.getByTestId('create-ai-step-0'))).includes('Set that up') &&
      (await page.locator('[data-testid="create-ai-step-1"]').count()) === 0,
    'the panel lists one line per planned action, in the planner\'s own words',
    `it drew ${JSON.stringify(await readText(page.getByTestId('create-ai-step-0')))} for a one-action plan`,
  )

  // And the press under it, for the same patch: bounding one step of a
  // sequence moves the exception one line down.
  await page.getByTestId('create-ai-confirm').click({ timeout: 8000 }).catch(() => {})
  chk(
    await waitUntil(() => execCalls.length === 1, { timeoutMs: 25_000 }),
    'Create posts once to /ai/command/execute — the door that makes no model call',
    `${execCalls.length} execute request(s) went out`,
  )
  let sentExec = null
  try { sentExec = JSON.parse(execCalls[0] ?? '{}') } catch { /* reported below */ }
  chk(
    execCalls.length === 1 &&
      Array.isArray(sentExec?.actions) &&
      sentExec.actions.length === 1 &&
      sentExec.actions[0]?.tool === 'create_list' &&
      sentExec.actions[0]?.args?.name === LIST_NAME &&
      sentExec.actions[0]?.args?.spaceId === SPACE,
    'carrying exactly the actions that were previewed — nothing added, nothing dropped',
    `it posted ${JSON.stringify(sentExec?.actions ?? null)}`,
  )

  chk(
    await waitUntil(
      async () =>
        (await page.locator('[data-testid="create-ai-result-0"]').getAttribute('data-status')) === 'succeeded',
      { timeoutMs: 20_000 },
    ),
    'and the panel reports what happened per action, read off the answer',
    `the result row came back data-status=` +
      `${await page.locator('[data-testid="create-ai-result-0"]').getAttribute('data-status').catch(() => null)}`,
  )

  /*
   * BOTH DOORS INTO THE SPACE, because a list can legitimately arrive through
   * either one and "it exists in this run's space" must not depend on which.
   *
   * §G15-10: a list created by naming a SPACE and stopping — which is what
   * `create_list {spaceId, name}` is — lands in that space's hidden default
   * container (`ListsService.defaultContainerForSpace`), and
   * `getProjectsBySpace` excludes `isDefaultContainer` rows on purpose so the
   * container never shows up as a project in any of the fourteen surfaces that
   * render a space's projects. So walking `/projects/space` alone answers `[]`
   * for a list that genuinely exists — the endpoint the tree reads for those is
   * `/lists/space/:id`, which is exactly what `workspace-sidebar.tsx` calls
   * beside `/projects/space` for this reason.
   *
   * Counting across both and demanding EXACTLY ONE keeps the claim sharp in
   * both directions: nothing created, created in the wrong space, or created
   * twice all redden it.
   */
  const spaceLists = await api(`/lists/space/${SPACE}`)
  const projects = await api(`/projects/space/${SPACE}`)
  const found = []
  for (const list of spaceLists.data ?? []) if (list.name === LIST_NAME) found.push(list)
  for (const project of projects.data ?? []) {
    const lists = await api(`/lists/project/${project.id}`)
    for (const list of lists.data ?? []) if (list.name === LIST_NAME) found.push(list)
  }
  chk(
    spaceLists.status < 300 && projects.status < 300 && found.length === 1,
    `"${LIST_NAME}" really exists in this run's own space — the button created something`,
    `this run's space holds ${found.length} list(s) by that name ` +
      `(GET /lists/space/${SPACE} answered ${spaceLists.status}, ` +
      `GET /projects/space/${SPACE} answered ${projects.status})`,
  )
  chk(
    // `${SPACE_NAME} > ${LIST_NAME}` is the server's `container.path`; the plan's
    // own wording is "Set that up", so this cannot pass by echoing the plan.
    (await readText(page.getByTestId('create-ai-result-0'))).includes(`${SPACE_NAME} > ${LIST_NAME}`),
    'and the result names the container the SERVER made, not the sentence that asked for it',
    `the result row read ${JSON.stringify(await readText(page.getByTestId('create-ai-result-0')))}`,
  )

  console.log('\n▶ frame `10:04` — "Add description, or write with ⚡AI"')
  /*
   * The planner stub stays in place; nothing below calls `/ai/command`. It is
   * left rather than unrouted because `unroute` matches on handler identity and
   * a near-miss would silently leave the route live while reading as removed.
   */
  await page.goto(`${B}/app/${WS}`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('quick-create-open').click({ timeout: 25_000 })
  await page.getByTestId('create-tab-task').click({ timeout: 20_000 })
  await appears('[data-testid="quick-create-description"]')

  const descPlaceholder = await attrOf(page.getByTestId('quick-create-description'), 'placeholder')
  chk(
    descPlaceholder === 'Add description, or write with ⚡AI',
    'the description box carries the frame\'s placeholder',
    `it read ${JSON.stringify(descPlaceholder)}`,
  )
  // Same shape as the Create-with-AI read above: first in the condition, nothing
  // short-circuits it, and an absent ⚡AI control would stall the run out here.
  // Bounded and caught, and `=== true` so that null — no such button at all —
  // fails, instead of a missing control passing as a disabled one.
  const describeAiDisabled = await page.getByTestId('quick-create-describe-ai').isDisabled({ timeout: 8000 }).catch(() => null)
  chk(
    describeAiDisabled === true,
    'and the ⚡AI control is dead until the task has a title — that title IS the prompt',
    'it was live with no title, so it would have asked the model to write about nothing',
  )

  await page.getByTestId('quick-create-task-title').fill(TASK_TITLE)
  await page.getByTestId('quick-create-describe-ai').click()
  let sentWrite = null
  const wroteOnce = await waitUntil(() => writeCalls.length === 1, { timeoutMs: 20_000 })
  try { sentWrite = JSON.parse(writeCalls[0] ?? '{}') } catch { /* reported below */ }
  chk(
    wroteOnce && sentWrite?.prompt === TASK_TITLE,
    'pressing it asks /ai/task/generate, with the typed title as the prompt',
    `${writeCalls.length} request(s), body ${JSON.stringify(sentWrite)}`,
  )
  chk(
    await waitUntil(
      async () => /not configured/i.test(await readText(page.locator('[data-sonner-toast]').first())),
      { timeoutMs: 20_000 },
    ),
    'and a refused write reaches the person as a toast, in the provider\'s words',
    'the ⚡AI button failed silently — a control that does nothing and says nothing is the ' +
      'dead control with extra steps',
  )
} catch (e) {
  bad(`threw: ${String(e?.message ?? e).split('\n')[0]}`)
  await page?.screenshot({ path: '/tmp/claude-0/shots/create-menu-ai-fail.png', fullPage: true }).catch(() => {})
} finally {
  if (SPACE && api) {
    const del = await api(`/spaces/${SPACE}`, { method: 'DELETE' })
    if (del.status >= 400) console.log(`\x1b[2m  could not clean up space ${SPACE} (${del.status})\x1b[0m`)
  }
  await browser?.close?.().catch(() => {})
  await stack?.close?.()
}

const failed = () => results.filter((x) => !x).length
if (results.length !== EXPECTED_CHECKS) {
  console.log(`  \x1b[31mFAIL\x1b[0m ran ${results.length} checks, expected ${EXPECTED_CHECKS}`)
  results.push(0)
}
console.log(`\n${results.length - failed()} passed, ${failed()} failed`)
process.exit(failed() ? 1 : 0)

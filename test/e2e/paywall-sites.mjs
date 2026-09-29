/**
 * §V2-13 — THE PAYWALL THAT TEACHES, at the two sites she NAMES.
 *
 * `[09:26]` "Is ke baad TEAM VIEW — yeh cheez ke liye humein of course BUY
 * karna parega." Frame `09:26` is the modal: the plain line "That feature
 * isn't available on your current plan", the heading "Try Business for FREE to
 * unlock Team View", a panel that DESCRIBES and PREVIEWS the view, the tier
 * beside it with its free trial and what else it includes, and one button —
 * "Contact your admin".
 *
 * `[10:42]` "agar aap ke paas woh hai PREMIUM ACCESS … to aap ke paas board
 * view download karne ka bhi option hoga." And immediately after, `[10:49]`,
 * the boundary that matters more than the gate: "Lekin agar aap ke paas
 * premium nahi [hai] to aap LIST VIEW download karo."
 *
 * WHY THIS SUITE RUNS AS TWO ACTORS. A paywall checked only while blocked is
 * indistinguishable from a broken page: a Team tab that draws nothing and a
 * Download that does nothing would pass every "the gate appeared" assertion
 * ever written. So every gated claim here is made TWICE — once in a workspace
 * whose plan includes the feature, where it must WORK, and once in a workspace
 * whose plan does not, where it must be REFUSED. The two workspaces are built
 * by the same code in the same run and differ in exactly one column.
 *
 * AND WHY IT ASKS THE SERVER FIRST. A gate drawn in a browser is a
 * `display:none` with a price on it. The first section here never opens a
 * browser at all: it is the same two HTTP calls a determined person would
 * make, and if those answer 200 the modal is decoration.
 *
 *   node test/e2e/paywall-sites.mjs --api 3011 --dist apps/web/dist
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

/** "0 failed" is not "it ran". Exact, so a skipped branch is a failure. */
const EXPECTED_CHECKS = 30

const EMAIL = process.env.E2E_EMAIL ?? 'admin@rundesk.internal'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123!'
const REPO = path.resolve(import.meta.dirname, '../..')
const TAG = `pw-${Date.now()}`

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

/** Bytes, for the two exports — `apiClient` parses JSON and an export is not JSON. */
const raw = async (route) => {
  const res = await fetch(`${API}${route}`, { headers: { authorization: `Bearer ${auth.accessToken}` } })
  const text = await res.text()
  return { status: res.status, text }
}

let sql = null
let browser = null

/**
 * A workspace of this suite's own, with one list and a known set of tasks.
 *
 * TWO OF THESE ARE BUILT AND THEY ARE BUILT IDENTICALLY. Reusing the shared
 * seeded workspace for the entitled half would mean the two sides differed in
 * their plan AND in everything else about them, and an assertion that passes
 * on one and fails on the other would not say which difference did it.
 */
async function makeWorkspace(label) {
  const ws = (await api('/workspaces', { method: 'POST', body: { name: `${label} ${TAG}` } })).data
  if (!ws?.id) throw new Error(`could not create the ${label} workspace`)
  const spaces = (await api(`/spaces/workspace/${ws.id}`)).data ?? []
  const spaceId = spaces[0]?.id
  const projects = spaceId ? ((await api(`/projects/space/${spaceId}`)).data ?? []) : []
  const projectId = projects[0]?.id
  if (!spaceId || !projectId) throw new Error(`${label} workspace came up without a project`)
  /*
   * A list made through the API rather than the starter one. `POST /lists`
   * seeds the default status pipeline; the starter list is written straight
   * into the table by the workspace transaction and has none, which would
   * leave the board export naming columns by key instead of by name — a
   * difference in the fixture, not in the feature.
   */
  const list = (await api('/lists', { method: 'POST', body: { projectId, name: `Paywall list ${TAG}` } })).data
  const listId = list?.id
  if (!listId) throw new Error(`could not make a list in the ${label} workspace`)

  // Two tasks, one of them assigned and finished, so the Team rollup has a
  // non-trivial "n of m" to be right about and the board export has rows.
  const made = []
  for (const [title, done] of [[`open ${TAG}`, false], [`shut ${TAG}`, true]]) {
    const task = (await api('/tasks', { method: 'POST', body: { listId, title } })).data
    if (!task?.id) throw new Error(`could not seed a task in the ${label} workspace`)
    made.push(task.id)
    const assigned = await api(`/tasks/${task.id}/assignees`, { method: 'POST', body: { userId: auth.user?.id ?? auth.userId } })
    if (assigned.status >= 300) throw new Error(`could not assign a seeded task (${assigned.status})`)
    if (done) {
      const patched = await api(`/tasks/${task.id}`, { method: 'PATCH', body: { status: 'done' } })
      if (patched.status >= 300) throw new Error(`could not close a seeded task (${patched.status})`)
    }
  }
  return { id: ws.id, spaceId, projectId, listId, taskIds: made, path: `${spaceId}/${projectId}/${listId}` }
}

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — this suite sets a workspace plan directly')

  const OK = await makeWorkspace('Entitled')
  const LOCKED = await makeWorkspace('Blocked')

  /*
   * THE ONE DIFFERENCE. `workspaces.plan` is written by a super-admin endpoint
   * this account may not hold, and the column is the whole independent
   * variable, so it is set here and nothing else about the two workspaces is
   * touched.
   */
  await sql`update workspaces set plan = 'free' where id = ${LOCKED.id}`
  const lockedPlan = (await api(`/workspaces/${LOCKED.id}/plan`)).data
  const okPlan = (await api(`/workspaces/${OK.id}/plan`)).data
  console.log(`\x1b[2m  entitled ${OK.id} (${okPlan?.plan}), blocked ${LOCKED.id} (${lockedPlan?.plan})\x1b[0m`)

  console.log('\n▶ the fixture is actually two different plans')
  chk(
    okPlan?.features?.teamView === true && lockedPlan?.features?.teamView === false,
    'one workspace’s plan includes Team View and the other’s does not',
    `entitled teamView=${okPlan?.features?.teamView}, blocked teamView=${lockedPlan?.features?.teamView} — ` +
      'without this the two halves below are the same test run twice',
  )

  console.log('\n▶ `[09:26]` Team View — the SERVER decides')
  const teamOk = await api(`/tasks/list/${OK.listId}/team`)
  chk(teamOk.status === 200, 'the entitled workspace gets the rollup',
    `GET /tasks/list/:id/team returned ${teamOk.status} for a plan that includes it`)
  chk(
    Array.isArray(teamOk.data) && teamOk.data.some((r) => r.total === 2 && r.done === 1),
    'and it is this list’s own arithmetic, not a stub',
    `the rollup read ${JSON.stringify(teamOk.data)} — expected a row with 1 of 2 done`,
  )
  const teamLocked = await api(`/tasks/list/${LOCKED.listId}/team`)
  chk(teamLocked.status === 403, 'the blocked workspace is refused outright',
    `GET /tasks/list/:id/team returned ${teamLocked.status} for a Free plan — a client-only gate is not a gate`)
  // `error` is the API's envelope object, not a string — `{status, message,
  // details}`. Reading it as a string would compare `undefined` to a regex and
  // fail for the wrong reason.
  chk(
    typeof teamLocked.error?.message === 'string' && /free/i.test(teamLocked.error.message),
    'and the refusal says which plan refused it',
    `the 403 body was ${JSON.stringify(teamLocked.error)}`,
  )

  console.log('\n▶ `[10:42]` the board download — the SERVER decides')
  const boardOk = await raw(`/tasks/list/${OK.listId}/export?view=board`)
  chk(boardOk.status === 200, 'the entitled workspace downloads the board',
    `the board export returned ${boardOk.status} for a plan that includes it`)
  const boardLocked = await raw(`/tasks/list/${LOCKED.listId}/export?view=board`)
  // NOT "the blocked workspace is refused" — that is the TEAM export's sentence
  // sixteen lines up, and this one was a prefix of it. Two checks whose
  // sentences overlap cannot be told apart in a log, and a patch cannot name
  // one of them: `paywall-sites-2-server-board` reddens this and its claim
  // matched the passing one.
  chk(boardLocked.status === 403, 'the blocked workspace is refused the board too',
    `the board export returned ${boardLocked.status} for a Free plan`)

  /*
   * THE CHECK THAT STOPS THE GATE SPREADING, and the reason it is here rather
   * than only in `list-export.mjs`: `[10:49]` makes the free list download
   * part of the SAME sentence as the paid board one. A gate on `view=board`
   * that quietly also caught the default is the likeliest way this row goes
   * wrong, and it would go wrong silently — the board half would still pass.
   */
  console.log('\n▶ `[10:49]` "agar premium nahi to LIST VIEW download karo"')
  const listLocked = await raw(`/tasks/list/${LOCKED.listId}/export`)
  chk(listLocked.status === 200, 'the list download is still free on the blocked plan',
    `the plain list export returned ${listLocked.status} — the gate has spread to the free export`)
  chk(
    listLocked.text.includes(`open ${TAG}`) && listLocked.text.includes(`shut ${TAG}`),
    'and it is the whole list, not an empty file with a 200 on it',
    `the free export carried ${JSON.stringify(listLocked.text.slice(0, 120))}`,
  )
  const listExplicit = await raw(`/tasks/list/${LOCKED.listId}/export?view=list`)
  chk(listExplicit.status === 200, 'asking for view=list by name is free too',
    `view=list returned ${listExplicit.status} — the gate keys on something other than "board"`)

  console.log('\n▶ and the paid download is a different artifact, not the same file renamed')
  const listHeader = listLocked.text.split('\r\n')[0]
  const boardHeader = boardOk.text.split('\r\n')[0]
  chk(
    boardHeader.startsWith('"Board column",'),
    'the board export leads with the column each card is sitting in',
    `the board header row was ${JSON.stringify(boardHeader)}`,
  )
  chk(
    !listHeader.includes('Board column'),
    'and the free list export does not — charging for the same bytes would be the facade',
    `the list header row was ${JSON.stringify(listHeader)}`,
  )
  const statuses = (await api(`/lists/${OK.listId}/statuses`)).data ?? []
  // Names when the list has a pipeline (it does — `POST /lists` seeds one) and
  // raw keys as the fallback, because a list whose statuses live on its space
  // or project is a legitimate shape and the column is still the column.
  const expectedLabels = statuses.length
    ? statuses.map((s) => s.name).filter(Boolean)
    : ['todo', 'done', 'in_progress', 'backlog', 'in_review', 'cancelled']
  const firstCells = boardOk.text
    .split('\r\n')
    .slice(1)
    .filter(Boolean)
    .map((line) => (line.match(/^"([^"]*)"/) ?? [])[1] ?? '')
  chk(
    firstCells.length === 2 && firstCells.every((cell) => expectedLabels.includes(cell)),
    'and every row names a real board column',
    `the first cells read ${JSON.stringify(firstCells)}, none of ${JSON.stringify(expectedLabels)}`,
  )

  // ——— the browser ———
  browser = await chromium.launch(launchOptions())
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
  const page = await ctx.newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click().catch(() => {})

  const openList = async (ws) => {
    await page.goto(`${B}/app/${ws.id}/${ws.path}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="list-view-controls"]', { timeout: 25_000 })
    await page.waitForTimeout(1200)
  }

  /*
   * Press a `<details>` open by ITS OWN toggle.
   *
   * `locator('summary')` is a DESCENDANT search, and the Customize panel is a
   * `<details>` with another `<details>` inside it — the export section. So
   * that expression matches two summaries and Playwright refuses in strict
   * mode, which is the right refusal: "a summary somewhere under this panel"
   * is not what the suite means.
   *
   * `> summary` is the direct child, and it stays correct however the panel
   * grows. `.first()` would also have worked today and would have quietly
   * started pressing the wrong control the day the two swapped order.
   */
  const openDetails = async (details, settleMs = 400) => {
    await details.locator('> summary').click()
    await page.waitForTimeout(settleMs)
  }

  console.log('\n▶ the entitled actor just gets the feature')
  await openList(OK)
  await page.getByTestId('work-view-tab-type-team').click()
  chk(
    await waitUntil(() => page.getByTestId('team-view').isVisible().catch(() => false), { timeoutMs: 15_000 }),
    'Team draws the view on a plan that includes it',
    'the Team tab drew nothing for an entitled workspace — the gate has caught a paying customer',
  )
  chk(
    await page.getByTestId('feature-gate').count() === 0,
    'and no paywall is shown to somebody who has already paid',
    'the paywall opened in a workspace whose plan includes Team View',
  )

  console.log('\n▶ the blocked actor gets the paywall `[09:26]`')
  await openList(LOCKED)
  await page.getByTestId('work-view-tab-type-team').click()
  const gateOpened = await waitUntil(
    () => page.getByTestId('feature-gate').isVisible().catch(() => false),
    { timeoutMs: 15_000 },
  )
  chk(gateOpened, 'pressing Team opens the gate', 'the Team tab on a Free plan opened nothing at all')
  /*
   * ASKED THREE WAYS, because each one alone is satisfiable by a build that
   * handed the view over: the tab must not have become current, the view must
   * not be drawn, and the locked placeholder must not be drawn either — a
   * "this is locked" card behind a "this is locked" modal is still a tab that
   * navigated when it was told not to.
   */
  /*
   * BOUNDED, WITH THE TAB'S EXISTENCE CARRIED INTO THE CHECK.
   *
   * The check below asserts a NEGATIVE — the Team tab is not current and no
   * team view was drawn. Unbounded, an absent tab threw and ended the
   * section; caught, `null !== 'true'` is TRUE and the whole condition
   * passes on a page that never rendered the tab at all. Trading a thrown
   * section for a vacuous pass is the confident zero, so the tab being THERE
   * is measured and required: it is the tab this section just pressed.
   */
  const teamTabThere = (await page.getByTestId('work-view-tab-type-team').count()) === 1
  const teamTabCurrent = await page
    .getByTestId('work-view-tab-type-team')
    .getAttribute('aria-current', { timeout: 8000 })
    .catch(() => null)
  const drewTeam = await page.getByTestId('team-view').count()
  const drewLocked = await page.getByTestId('team-view-locked').count()
  chk(
    teamTabThere && teamTabCurrent !== 'true' && drewTeam === 0 && drewLocked === 0,
    'and leaves you where you were rather than on an empty view',
    `the tab reported aria-current=${JSON.stringify(teamTabCurrent)} with ${drewTeam} team view(s) and ` +
      `${drewLocked} locked placeholder(s) on screen — the tab switched and the modal is decoration over it`,
  )
  // Read once, bounded and caught. It sat first in the condition with no `&&`
  // ahead of it to short-circuit, so a gate that never opened spent the default
  // thirty seconds waiting and then threw, taking every check below with it.
  // Compared against the literal, so a caught `null` is not 'plan' and fails.
  const gateKind = await page
    .getByTestId('feature-gate')
    .getAttribute('data-gate-kind', { timeout: 8000 })
    .catch(() => null)
  chk(
    gateKind === 'plan',
    'it is the PLAN talking, not a switched-off flag',
    'the dialog reported itself as a flag gate — "buy Business" is the wrong instruction for a toggle',
  )
  const eyebrow = await readText(page.getByTestId('feature-gate-eyebrow'))
  chk(
    /current plan/i.test(eyebrow),
    'and it opens with the frame’s own sentence about the plan',
    `the eyebrow read ${JSON.stringify(eyebrow)}`,
  )
  // Read once, bounded and caught. The eyebrow above goes through `readText`,
  // which already answers rather than throws; this read had nothing, and it was
  // written twice — the second time in the message, which `chk` evaluates
  // whether the check passes or fails.
  const offeredTier = await page
    .getByTestId('feature-gate-plan')
    .getAttribute('data-plan', { timeout: 6000 })
    .catch(() => null)
  chk(
    offeredTier === 'business',
    'it names Business, the cheapest tier that includes Team View',
    `the offered tier was ${JSON.stringify(offeredTier)}`,
  )
  /*
   * THE HALF THE ROW IS NAMED FOR. A gate that only says no is a wall; the
   * frame's gate previews the thing, lists what the tier adds, and gives you
   * somebody to ask. Counted, because "a list is present" passes on a list
   * with nothing in it.
   */
  chk(
    await page.locator('[data-testid="feature-gate-preview"] li').count() === 3,
    'the gate PREVIEWS the feature — three concrete lines about what it does',
    `the preview had ${await page.locator('[data-testid="feature-gate-preview"] li').count()} lines`,
  )
  chk(
    await page.locator('[data-testid="feature-gate-includes"] li').count() > 0,
    'and says what else the tier would bring',
    'the offer panel listed nothing the upgrade includes',
  )
  await page.getByTestId('feature-gate-contact').click()
  chk(
    await waitUntil(() => page.getByTestId('feature-gate-result').isVisible().catch(() => false), { timeoutMs: 10_000 }),
    'and "Contact your admin" answers instead of doing nothing',
    'pressing Contact your admin produced no outcome — a dead control in the one place a person acts',
  )

  console.log('\n▶ the blocked actor and the board download `[10:42]`')
  // Bounded and caught: what stands above it — a check, or a gate whose answer
  // nobody reads — is allowed to fail, so this has to report rather than throw.
  // Bounding one step and leaving the next unbounded only moves the thirty
  // seconds one line down (ledger §10).
  await page.getByTestId('feature-gate-close').click({ timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(400)
  await page.getByTestId('work-view-tab-type-board').click({ timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(1200)
  await openDetails(page.getByTestId('list-customize'))
  const exportSection = page.getByTestId('list-export-section')
  // Bounded and caught, once: a chk message is built whether the check passes
  // or fails, and this panel is a locator held in a variable — the shape rule
  // six could not see until it learnt to track locator variables.
  const boardExportView = await exportSection
    .getAttribute('data-export-view', { timeout: 8000 })
    .catch(() => null)
  chk(
    boardExportView === 'board',
    'standing on Board, the panel is about the board download',
    `the panel said it would export ${JSON.stringify(boardExportView)}`,
  )
  chk(
    await exportSection.getAttribute('data-export-locked') === 'true',
    'and says up front that this one is not on your plan',
    'the board export gave no sign of being locked until the button was pressed',
  )
  await openDetails(exportSection, 300)
  await page.getByTestId('list-export-download').click()
  chk(
    await waitUntil(() => page.getByTestId('feature-gate').isVisible().catch(() => false), { timeoutMs: 10_000 }),
    'pressing Download opens the gate rather than failing quietly',
    'the board Download did nothing visible on a plan that does not include it',
  )
  chk(
    (await readText(page.getByTestId('feature-gate-name'))).length > 0 &&
      (await readText(page.getByTestId('feature-gate-title'))).toLowerCase().includes('board'),
    'and the gate is about the board export, not about Team View',
    `the gate was headed ${JSON.stringify(await readText(page.getByTestId('feature-gate-title')))}`,
  )

  /*
   * THE ANTI-SPREAD CHECK, IN THE UI. Same panel, same button, same workspace
   * and the same Free plan — only the view underneath changed. If this one
   * ever reports `true` the gate has leaked onto the download she explicitly
   * says stays free.
   */
  console.log('\n▶ and on the list, the same panel is not locked at all')
  await page.getByTestId('feature-gate-close').click()
  await page.waitForTimeout(400)
  await page.getByTestId('work-view-tab-type-list').click()
  await page.waitForTimeout(1200)
  await openDetails(page.getByTestId('list-customize'))
  const exportView = await page
    .getByTestId('list-export-section')
    .getAttribute('data-export-view', { timeout: 6000 })
    .catch(() => null)
  chk(
    exportView === 'list',
    'standing on List, the panel is about the list download',
    `the panel said it would export ${JSON.stringify(exportView)}`,
  )
  // Read once, bounded and caught, like the one above it. First in the
  // condition with nothing to short-circuit it, so a missing section waited out
  // the default thirty seconds and threw. Compared against the literal 'false':
  // a caught `null` is not 'false', so an absent panel fails rather than reads
  // as unlocked.
  const listExportLocked = await page
    .getByTestId('list-export-section')
    .getAttribute('data-export-locked', { timeout: 8000 })
    .catch(() => null)
  chk(
    listExportLocked === 'false',
    'which is free, on the same plan that cannot have the board one',
    'the list export is marked locked — the paywall has spread to the download that must stay free',
  )
  chk(
    await page.getByTestId('list-export-lock').count() === 0,
    'and carries no padlock',
    'a padlock is drawn over the free list export',
  )

  await ctx.close()
} catch (e) {
  bad(`threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  if (sql) {
    /*
     * Both workspaces, gone. `workspaces` cascades to spaces → projects →
     * lists → tasks, so this is the whole fixture; and it matters more than
     * usual here because one of them carries a `free` plan that another
     * suite's `pickWorkspace` could otherwise wander into.
     */
    await sql`delete from workspaces where name like ${'%' + TAG}`.catch(() => {})
    await sql.end({ timeout: 5 }).catch(() => {})
  }
  await stack?.close?.()
}

const failed = () => results.filter((x) => !x).length
if (results.length !== EXPECTED_CHECKS) {
  console.log(`  \x1b[31mFAIL\x1b[0m ran ${results.length} checks, expected ${EXPECTED_CHECKS}`)
  results.push(0)
}
console.log(`\n${results.length - failed()} passed, ${failed()} failed`)
process.exit(failed() ? 1 : 0)

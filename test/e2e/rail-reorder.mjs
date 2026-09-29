/**
 * THE PLANNER RAIL IS DRAWN IN THE ORDER ITS SIDEBAR PAGE SETS, AND KEEPS IT
 * OVER A RELOAD.
 *
 * Frames `14:13`–`14:16`, Calendar settings › Sidebar: "Sidebar sections —
 * Show, hide and reorder the sections that appear in the planner sidebar", a
 * box and a grip on each of Priorities · Meet with · Assigned to me · Today &
 * overdue · Backlog, and at `14:13` the open hand over Priorities' row.
 *
 * `ledger-rows/row-835-reorder`: reorder was recorded as built and did not
 * exist. The page drew a switch per section and no grip, the rail was drawn in
 * a fixed order, and `railSections` kept an order that only `.includes()`
 * read. So every check here moves a section and then looks at the RAIL, and
 * the order is read back out of Postgres: a page that shuffled its own rows
 * and saved nothing fails, and so does one that saved an order the rail does
 * not draw.
 *
 * ClickUp (help centre, from search snippets): the Planner's settings open from
 * the gear at its top right, and the Home Sidebar's sections are reordered by
 * dragging them in Customize › Sections. No snippet describes the Planner's
 * own Sidebar page; the frames are the reference for it.
 *
 * ITS OWN PERSON, IN ITS OWN WORKSPACE. Planner settings are a person's own
 * (`users.planner_settings`), and `planner-rail` reads the shared admin's rail
 * in the frame's order. So this suite signs a newcomer up, adds them to a
 * workspace it makes, and orders only their rail; nothing of the admin's is
 * written.
 *
 *   node test/e2e/rail-reorder.mjs --api 3024 --dist /tmp/claude-0/dist-4
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 13

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
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/** Frame `13:05`'s five, top to bottom — the order with nothing stored. */
const FRAME = ['priorities', 'meetWith', 'assignedToMe', 'todayOverdue', 'backlog']

const stamp = Date.now()
const TAG = `rro${stamp}`
const PASSWORD = 'RailOrder@12345!'
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the stored order is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const email = `${TAG}-planner@rundesk.invalid`
  const signed = await signUpApi(API, {
    fullName: 'Rail Order', email, password: PASSWORD,
    organizationName: `Rail order ${stamp}`, organizationSlug: `rail-order-${stamp}`,
  })
  const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'member' } })
  if (added.status >= 300) throw new Error(`could not add the newcomer: ${said(added)}`)
  const newcomer = apiAs(signed.accessToken)
  const userId = signed.user?.id
  if (!userId) throw new Error('the sign-up answered with no user id')

  /** The order as Postgres holds it: null while nothing is stored. */
  const stored = async () =>
    (await sql`select planner_settings from users where id = ${userId}`)[0]?.planner_settings?.railSections ?? null

  const chromium = await resolveChromium()
  browser = await chromium.launch(launchOptions())
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', email)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})

  /** The rail's sections as drawn, top to bottom. */
  const rail = () =>
    page
      .locator('[data-testid="planner-rail"] [data-rail-section]')
      .evaluateAll((els) => els.filter((el) => el.checkVisibility()).map((el) => el.getAttribute('data-rail-section')))
      .catch(() => [])
  /** The same, with Team schedules, which the rail draws beside them. */
  const wholeRail = () =>
    page
      .locator('[data-testid="planner-rail"] > section')
      .evaluateAll((els) =>
        els
          .filter((el) => el.checkVisibility())
          .map((el) => el.getAttribute('data-rail-section') ?? el.getAttribute('data-testid')),
      )
      .catch(() => [])
  /** The Sidebar page's rows, top to bottom: which section, shown, ticked, gripped. */
  const rows = () =>
    page
      .locator('[data-testid="planner-rail-row"]')
      .evaluateAll((els) =>
        els
          .filter((el) => el.checkVisibility())
          .map((el) => ({
            section: el.getAttribute('data-section'),
            shown: el.getAttribute('data-shown') === 'true',
            ticked: el.querySelector('[role="checkbox"]')?.getAttribute('aria-checked') === 'true',
            grip: !!el.querySelector('[data-testid^="planner-rail-handle-"]'),
          })),
      )
      .catch(() => [])

  /**
   * The planner, with its settings answered. Until they are, the rail is drawn
   * in the frame's order whatever is stored, so a read before them is a read of
   * the default — which is how a first version of this suite passed a patch
   * for the wrong reason.
   */
  const openPlanner = async () => {
    const answered = page
      .waitForResponse(
        (res) => res.request().method() === 'GET' && /\/api\/v1\/planner\/[^/]+\/settings$/.test(new URL(res.url()).pathname),
        { timeout: 25_000 },
      )
      .then((res) => res.status() === 200, () => false)
    await page.goto(`${B}/app/${WS}/calendar`, { waitUntil: 'domcontentloaded' })
    const drawn = await waitUntil(async () => (await page.locator('[data-testid="planner-rail"] [data-rail-section]').count()) > 0, { timeoutMs: 25_000 })
    return (await answered) && drawn
  }
  const openSidebarPage = async () => {
    await page.getByTestId('planner-settings').click({ timeout: 10_000 }).catch(() => {})
    await page.getByTestId('planner-settings-nav-sidebar').click({ timeout: 10_000 }).catch(() => {})
    return waitUntil(async () => (await page.locator('[data-testid="planner-rail-row"]').count()) === FRAME.length, { timeoutMs: 10_000 })
  }
  /**
   * A drag by the row's name, where `14:13` draws the open hand, onto another
   * row: past the six pixels that tell a drag from a press, then down to the
   * target's middle in small steps, as a hand moves.
   */
  const dragRow = async (from, onto) => {
    const row = (section) => page.locator(`[data-testid="planner-rail-row"][data-section="${section}"]`)
    // The dialog opens with an animation, and a box read mid-way is a box the
    // pointer will not find: wait until two reads a moment apart agree.
    await waitUntil(async () => {
      const one = await row(from).boundingBox({ timeout: 2000 }).catch(() => null)
      await new Promise((resolve) => setTimeout(resolve, 150))
      const two = await row(from).boundingBox({ timeout: 2000 }).catch(() => null)
      return !!one && !!two && one.x === two.x && one.y === two.y && one.width === two.width
    }, { timeoutMs: 5000 })
    const a = await row(from).boundingBox({ timeout: 5000 }).catch(() => null)
    const b = await row(onto).boundingBox({ timeout: 5000 }).catch(() => null)
    if (!a || !b) return false
    const x = a.x + a.width / 2
    const y = a.y + a.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x, y - 10, { steps: 4 })
    await page.mouse.move(x, b.y + b.height / 2, { steps: 20 })
    await page.mouse.up()
    return true
  }

  // ══ 1. NOTHING STORED ═════════════════════════════════════════════════════
  console.log('\n▶ nothing stored: the frame’s five, in the frame’s order')
  const loaded = await openPlanner()
  const firstRail = await rail()
  const firstStored = await stored()
  chk(
    loaded && firstStored === null && same(firstRail, FRAME),
    'with no order stored, the rail draws the five sections in the frame’s order',
    `loaded ${loaded}; stored ${JSON.stringify(firstStored)}; the rail read ${JSON.stringify(firstRail)}`,
  )
  const pageOpened = await openSidebarPage()
  const firstRows = await rows()
  chk(
    pageOpened && same(firstRows.map((r) => r.section), FRAME) && firstRows.every((r) => r.shown && r.ticked && r.grip),
    'and the Sidebar page lists the same five in the same order, each ticked and each with a grip',
    `the page listed ${JSON.stringify(firstRows)}`,
  )

  // ══ 2. A DRAG ═════════════════════════════════════════════════════════════
  console.log('\n▶ Backlog, dragged above Priorities')
  const DRAGGED = ['backlog', 'priorities', 'meetWith', 'assignedToMe', 'todayOverdue']
  const dragMade = await dragRow('backlog', 'priorities')
  const dragSaved = await waitUntil(async () => same(await stored(), DRAGGED), { timeoutMs: 10_000 })
  const afterDrag = await stored()
  chk(
    dragSaved,
    'dragging Backlog above Priorities stores the new order, Backlog first and the rest as they were',
    `${dragMade ? 'the drag was made' : 'there was no row to drag'}; stored ${JSON.stringify(afterDrag)}`,
  )
  const railFollowed = await waitUntil(async () => same(await rail(), DRAGGED), { timeoutMs: 8000 })
  const railAfterDrag = await rail()
  chk(
    railFollowed,
    'and the rail behind the dialog is redrawn in it without a reload',
    `the rail read ${JSON.stringify(railAfterDrag)}`,
  )

  // ══ 3. A RELOAD ═══════════════════════════════════════════════════════════
  console.log('\n▶ a reload')
  const reloaded = await openPlanner()
  const drawnAsStored = await waitUntil(async () => same(await rail(), DRAGGED), { timeoutMs: 8000 })
  const railReloaded = await rail()
  chk(
    reloaded && drawnAsStored,
    'after a reload the rail is drawn in the stored order, Backlog first',
    `loaded ${reloaded}; the rail read ${JSON.stringify(railReloaded)}`,
  )
  const wholeReloaded = await wholeRail()
  const meetAt = wholeReloaded.indexOf('meetWith')
  chk(
    meetAt >= 0 && wholeReloaded[meetAt + 1] === 'planner-team-schedules',
    'and Team schedules rides directly under Meet with, where the order has moved it',
    `the rail read ${JSON.stringify(wholeReloaded)}`,
  )
  const reopened = await openSidebarPage()
  const rowsReloaded = await rows()
  chk(
    reopened && same(rowsReloaded.map((r) => r.section), DRAGGED) && rowsReloaded.every((r) => r.shown && r.ticked),
    'and the Sidebar page lists its rows in that order',
    `the page listed ${JSON.stringify(rowsReloaded)}`,
  )

  // ══ 4. THE KEYBOARD ═══════════════════════════════════════════════════════
  console.log('\n▶ ↓ on Backlog’s grip')
  const STEPPED = ['priorities', 'backlog', 'meetWith', 'assignedToMe', 'todayOverdue']
  await page.getByTestId('planner-rail-handle-backlog').focus({ timeout: 5000 }).catch(() => {})
  await page.keyboard.press('ArrowDown')
  const stepped = await waitUntil(async () => same(await stored(), STEPPED) && same(await rail(), STEPPED), { timeoutMs: 10_000 })
  const storedStepped = await stored()
  const railStepped = await rail()
  chk(
    stepped,
    'pressing ↓ on Backlog’s grip moves it one place down, in the stored order and on the rail',
    `stored ${JSON.stringify(storedStepped)}; the rail read ${JSON.stringify(railStepped)}`,
  )

  // ══ 5. HIDING ONE ═════════════════════════════════════════════════════════
  console.log('\n▶ Meet with hidden')
  const HIDDEN = ['priorities', 'backlog', 'assignedToMe', 'todayOverdue']
  await page.getByTestId('planner-rail-meetWith').click({ timeout: 5000 }).catch(() => {})
  const hid = await waitUntil(async () => same(await stored(), HIDDEN) && same(await rail(), HIDDEN), { timeoutMs: 10_000 })
  const storedHidden = await stored()
  const railHidden = await rail()
  chk(
    hid,
    'clearing Meet with’s box takes it off the rail, and the others keep their order',
    `stored ${JSON.stringify(storedHidden)}; the rail read ${JSON.stringify(railHidden)}`,
  )
  const sank = await waitUntil(async () => same((await rows()).map((r) => r.section), [...HIDDEN, 'meetWith']), { timeoutMs: 8000 })
  const rowsHidden = await rows()
  const last = rowsHidden[rowsHidden.length - 1]
  chk(
    sank && last?.shown === false && last?.ticked === false && last?.grip === false,
    'and its row sinks under the shown ones, unticked and with no grip',
    `the page listed ${JSON.stringify(rowsHidden)}`,
  )
  const wholeHidden = await wholeRail()
  chk(
    wholeHidden[wholeHidden.length - 1] === 'planner-team-schedules'
      && same(wholeHidden.filter((s) => s !== 'planner-team-schedules'), HIDDEN),
    'with Meet with hidden, Team schedules is still drawn, at the foot of the rail',
    `the rail read ${JSON.stringify(wholeHidden)}`,
  )

  // ══ 6. AN ORDER THIS PAGE DID NOT WRITE ═══════════════════════════════════
  // The server keeps only the five, each once (`found-29-sep/rail-sections-kept-as-sent`);
  // an order from before that rule, or written past it, is still passed over
  // by the rail, so that one is written in Postgres.
  console.log('\n▶ an order the Sidebar page did not write')
  const ODD = ['todayOverdue', 'nonsense', 'priorities', 'todayOverdue']
  const refusedStranger = await newcomer(`/planner/${WS}/settings`, { method: 'PATCH', body: { railSections: ['priorities', 'nonsense'] } })
  const refusedRepeat = await newcomer(`/planner/${WS}/settings`, { method: 'PATCH', body: { railSections: ['backlog', 'backlog'] } })
  const keptHidden = await stored()
  chk(
    refusedStranger.status === 400 && /sections are/.test(refusedStranger.error?.message ?? '')
      && refusedRepeat.status === 400 && /twice/.test(refusedRepeat.error?.message ?? '')
      && same(keptHidden, HIDDEN),
    'the server stores no name that is no section and no repeat — each is refused, saying which, and the stored order stays as it was',
    `a stranger answered ${said(refusedStranger)}, a repeat ${said(refusedRepeat)}; stored ${JSON.stringify(keptHidden)}`,
  )
  await sql`update users set planner_settings = jsonb_set(coalesce(planner_settings, '{}'::jsonb), '{railSections}', ${sql.json(ODD)}) where id = ${userId}`
  const written = await stored()
  const reread = await openPlanner()
  const passedOver = await waitUntil(async () => same(await rail(), ['todayOverdue', 'priorities']), { timeoutMs: 8000 })
  const railOdd = await rail()
  chk(
    same(written, ODD) && reread && passedOver,
    'a stored name that is no section, and a repeat, are passed over: the rail draws Today & overdue, then Priorities, once each',
    `Postgres held ${JSON.stringify(written)}; the rail read ${JSON.stringify(railOdd)}`,
  )
  await ctx.close().catch(() => {})
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
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}

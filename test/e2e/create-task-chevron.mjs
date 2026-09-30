/**
 * CREATE TASK ▾ — THE CHEVRON BESIDE THE CREATE MODAL'S BUTTON, AND ITS FOUR
 * ENDINGS.
 *
 * Frame `00:05` draws the create modal's footer as `Templates` · 📎 · 🔔 ·
 * **Create Task ▾**, a split button, and no frame opens the chevron. The ledger
 * held the menu back on that ground (`resume-defects/row-730-create-task-chevron`,
 * `ledger-rows/row-730`, `commit-log/log-6b140c5-1`); what is behind it is
 * ClickUp's own (help centre "Create a task" and "Create tasks and subtasks on
 * mobile", from search snippets): Create and close, Create and open, Create and
 * start another ("resets the task creation modal") and Create and duplicate
 * ("keeps its content open in the task creation modal").
 *
 * Each ending is measured the same way: how many tasks the press made (one, read
 * back by SQL, in the list and by title), whether the modal is still open and
 * what it holds, and where the page is. The primary button is measured first,
 * because it keeps what it did before there was a menu.
 *
 *   node test/e2e/create-task-chevron.mjs --api 3022 --dist /tmp/claude-0/dist-2
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil } from './lib/wait.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 9

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

const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `ctc${stamp}`
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the tasks each press made are counted by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const space = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} space` } })
  if (!space.ok || !space.data?.id) throw new Error(`could not make the space: ${said(space)}`)
  const SPACE = space.data.id
  const project = await A('/projects', { method: 'POST', body: { spaceId: SPACE, name: `${TAG} project` } })
  if (!project.ok || !project.data?.id) throw new Error(`could not make the project: ${said(project)}`)
  const PROJECT = project.data.id
  const LIST_NAME = `${TAG} list`
  const list = await A('/lists', { method: 'POST', body: { projectId: PROJECT, name: LIST_NAME } })
  if (!list.ok || !list.data?.id) throw new Error(`could not make the list: ${said(list)}`)
  const LIST = list.data.id
  // A list made by choosing the space and stopping: it lives in the space's
  // hidden container, which is the project id its page is addressed by.
  const spaceList = await A('/lists', { method: 'POST', body: { spaceId: SPACE, name: `${TAG} space list` } })
  if (!spaceList.ok || !spaceList.data?.id) throw new Error(`could not make the space's own list: ${said(spaceList)}`)
  const SLIST = spaceList.data.id
  const CONTAINER = (await sql`select project_id from lists where id = ${SLIST}`)[0]?.project_id ?? null
  if (!CONTAINER) throw new Error('the space’s own list has no container')

  const titled = (title) => sql`select id, description, priority::text as priority from tasks where title = ${title}`
  const countIn = async (listId) => (await sql`select count(*)::int as n from tasks where list_id = ${listId}`)[0].n
  /** Until the task titled so exists, then long enough for a second one to land as well. */
  const settle = async (title) => {
    await waitUntil(async () => (await titled(title)).length > 0, { timeoutMs: 15_000 })
    await new Promise((resolve) => setTimeout(resolve, 2000))
    return titled(title)
  }

  browser = await (await resolveChromium()).launch(launchOptions())
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 }, serviceWorkers: 'block' })).newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ADMIN.email)
  await page.fill('input[type=password]', ADMIN.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})

  const titleBox = page.getByTestId('quick-create-task-title')
  const modalOpen = () => titleBox.isVisible().catch(() => false)
  /** The workspace's home, the create modal open on it, and the task form filled in. */
  const openAndFill = async ({ list: listId, project: projectId, title, description, priority }) => {
    await page.goto(`${B}/app/${WS}`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('quick-create-open').click({ timeout: 25_000 }).catch(() => {})
    await page.getByTestId('create-tab-task').click({ timeout: 10_000 }).catch(() => {})
    await waitUntil(modalOpen, { timeoutMs: 15_000 })
    await page.getByTestId('quick-create-space').selectOption(SPACE, { timeout: 10_000 }).catch(() => {})
    if (projectId) await page.getByTestId('quick-create-project').selectOption(projectId, { timeout: 10_000 }).catch(() => {})
    await page.getByTestId('quick-create-list').selectOption(listId, { timeout: 10_000 }).catch(() => {})
    await titleBox.fill(title, { timeout: 5000 }).catch(() => {})
    await page.getByTestId('quick-create-description').fill(description, { timeout: 5000 }).catch(() => {})
    await page.getByTestId('quick-create-priority').selectOption(priority, { timeout: 5000 }).catch(() => {})
    await waitUntil(() => page.getByTestId('quick-create-submit').isEnabled(), { timeoutMs: 8000 })
  }
  /** The chevron, then one of its items. */
  const choose = async (then) => {
    await page.getByTestId('quick-create-chevron').click({ timeout: 8000 }).catch(() => {})
    await page.getByTestId(`quick-create-then-${then}`).click({ timeout: 5000 }).catch(() => {})
  }
  /** What the modal's form holds; `null` for a field that is not on screen. */
  const formState = async () => {
    const read = (testId) => page.getByTestId(testId).inputValue({ timeout: 3000 }).catch(() => null)
    return {
      open: await modalOpen(),
      title: await read('quick-create-task-title'),
      description: await read('quick-create-description'),
      priority: await read('quick-create-priority'),
      space: await read('quick-create-space'),
      project: await read('quick-create-project'),
      list: await read('quick-create-list'),
    }
  }
  /** Whether the task sheet is drawn with this title in it. */
  const sheetShows = (title) =>
    waitUntil(async () => (await page.getByTestId('task-sheet').filter({ visible: true }).first().innerText({ timeout: 2000 })).includes(title), { timeoutMs: 15_000 })
  const toasts = () => page.locator('[data-sonner-toast]').filter({ visible: true }).allInnerTexts().catch(() => [])
  const where = (url) => { const u = new URL(url); return `${u.pathname}${u.search}` }

  // ══ 1. THE PRIMARY BUTTON, AS BEFORE ═════════════════════════════════════
  console.log('\n▶ the primary Create task, as it was before the menu')
  const MAIN = `${TAG} main`
  const mainBefore = await countIn(LIST)
  await openAndFill({ list: LIST, project: PROJECT, title: MAIN, description: `${MAIN} body`, priority: 'high' })
  await page.getByTestId('quick-create-submit').click({ timeout: 8000 }).catch(() => {})
  const mainRows = await settle(MAIN)
  const mainId = mainRows[0]?.id ?? null
  await waitUntil(() => page.url().includes(`task=${mainId}`), { timeoutMs: 10_000 })
  const mainShows = await sheetShows(MAIN)
  const mainAt = new URL(page.url())
  const mainModal = await modalOpen()
  const mainMade = (await countIn(LIST)) - mainBefore
  chk(
    mainRows.length === 1 && mainMade === 1 && !mainModal && mainShows
      && mainAt.pathname === `/app/${WS}/${SPACE}/${PROJECT}/${LIST}` && mainAt.searchParams.get('task') === mainId,
    'the primary Create task still makes one task, closes the modal and opens the task on its list',
    `${mainRows.length} task(s) so titled, ${mainMade} more in the list; the modal open ${mainModal}; the page is ${where(page.url())}; the sheet drew the title ${mainShows}`,
  )

  // ══ 2–3. THE CHEVRON'S MENU, AND ESCAPE ══════════════════════════════════
  console.log('\n▶ the chevron beside Create task')
  const MENU = `${TAG} menu`
  await openAndFill({ list: LIST, project: PROJECT, title: MENU, description: '', priority: 'normal' })
  await page.getByTestId('quick-create-chevron').click({ timeout: 8000 }).catch(() => {})
  const menu = page.getByTestId('quick-create-options')
  const menuOpen = await waitUntil(() => menu.isVisible(), { timeoutMs: 5000 })
  const offered = (await page.locator('[data-testid^="quick-create-then-"]').filter({ visible: true }).allInnerTexts().catch(() => []))
    .map((s) => s.trim())
  const CLICKUP = ['Create and close', 'Create and open', 'Create and start another', 'Create and duplicate']
  /*
   * DRAWN OVER THE MODAL, which Playwright cannot say. While the menu is open
   * the page beneath it takes no pointer events, so a menu drawn under the
   * modal is still "visible" and its items still take a click: measured, a
   * build with the menu at the dropdown's own z-50 passed all seven. So the
   * page is asked what is painted at the first item's middle, with its pointer
   * events back on for that one question.
   */
  const onTop = menuOpen && await page.evaluate(() => {
    const first = document.querySelector('[data-testid="quick-create-then-close"]')
    if (!first) return false
    const box = first.getBoundingClientRect()
    const was = document.body.style.pointerEvents
    document.body.style.pointerEvents = 'auto'
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
    document.body.style.pointerEvents = was
    return Boolean(hit && first.contains(hit))
  }).catch(() => false)
  chk(
    menuOpen && onTop && JSON.stringify(offered) === JSON.stringify(CLICKUP),
    'the chevron beside Create task opens, over the modal, a menu of ClickUp’s four: Create and close, Create and open, Create and start another, Create and duplicate',
    `the menu opened ${menuOpen}${menuOpen ? `, drawn ${onTop ? 'over' : 'beneath'} the modal` : ''}, offering ${JSON.stringify(offered)}`,
  )

  console.log('\n▶ Escape, with that menu open')
  await page.keyboard.press('Escape').catch(() => {})
  const menuShut = await waitUntil(async () => !(await menu.isVisible()), { timeoutMs: 5000 })
  await page.waitForTimeout(1000)
  const afterEscape = await formState()
  const menuMade = (await titled(MENU)).length
  // `menuOpen` first: with no menu to close, a closed menu proves nothing.
  chk(
    menuOpen && menuShut && afterEscape.open && afterEscape.title === MENU && menuMade === 0,
    'Escape closes that menu and leaves the modal open with what was typed in it, having made nothing',
    `the menu opened ${menuOpen} and closed ${menuShut}; the modal open ${afterEscape.open}, its title ${JSON.stringify(afterEscape.title)}; ${menuMade} task(s) made`,
  )

  // ══ 4. CREATE AND CLOSE ══════════════════════════════════════════════════
  console.log('\n▶ Create and close')
  const CLOSE = `${TAG} close`
  const closeBefore = await countIn(LIST)
  await openAndFill({ list: LIST, project: PROJECT, title: CLOSE, description: `${CLOSE} body`, priority: 'high' })
  const closeFrom = page.url()
  await choose('close')
  // Watched from the press: a toast lasts seconds, and settling takes two.
  const closeToastSeen = waitUntil(async () => (await toasts()).some((s) => s.includes(CLOSE) && s.includes(LIST_NAME)), { timeoutMs: 15_000 })
  const closeRows = await settle(CLOSE)
  const closeToast = await closeToastSeen
  const closeShut = await waitUntil(async () => !(await modalOpen()), { timeoutMs: 5000 })
  const closeMade = (await countIn(LIST)) - closeBefore
  const closeToasts = closeToast ? [] : await toasts()
  chk(
    closeRows.length === 1 && closeMade === 1 && closeShut && page.url() === closeFrom && closeToast,
    'Create and close makes one task, closes the modal and leaves the page where it was, with a toast naming the task and its list',
    `${closeRows.length} task(s) so titled, ${closeMade} more in the list; the modal closed ${closeShut}; the page went from ${where(closeFrom)} to ${where(page.url())}; ` +
      (closeToast ? 'the toast named both' : `the toasts read ${JSON.stringify(closeToasts)}`),
  )

  // ══ 5. CREATE AND OPEN ═══════════════════════════════════════════════════
  console.log('\n▶ Create and open, on a list picked under the space alone')
  const OPEN = `${TAG} open`
  const openBefore = await countIn(SLIST)
  await openAndFill({ list: SLIST, title: OPEN, description: `${OPEN} body`, priority: 'low' })
  await choose('open')
  const openRows = await settle(OPEN)
  const openId = openRows[0]?.id ?? null
  await waitUntil(() => page.url().includes(`task=${openId}`), { timeoutMs: 10_000 })
  const openShows = await sheetShows(OPEN)
  const openAt = new URL(page.url())
  const openModal = await modalOpen()
  const openMade = (await countIn(SLIST)) - openBefore
  chk(
    openRows.length === 1 && openMade === 1 && !openModal && openShows
      && openAt.pathname === `/app/${WS}/${SPACE}/${CONTAINER}/${SLIST}` && openAt.searchParams.get('task') === openId,
    'Create and open makes one task, closes the modal and opens the new task’s sheet on its list, here a list picked under the space alone',
    `${openRows.length} task(s) so titled, ${openMade} more in the list; the modal open ${openModal}; the page is ${where(page.url())}; the sheet drew the title ${openShows}`,
  )

  // ══ 6. CREATE AND START ANOTHER ══════════════════════════════════════════
  console.log('\n▶ Create and start another')
  const ANOTHER = `${TAG} another`
  const anotherBefore = await countIn(LIST)
  await openAndFill({ list: LIST, project: PROJECT, title: ANOTHER, description: `${ANOTHER} body`, priority: 'urgent' })
  const anotherFrom = page.url()
  await choose('another')
  const anotherRows = await settle(ANOTHER)
  const anotherMade = (await countIn(LIST)) - anotherBefore
  const blank = await formState()
  chk(
    anotherRows.length === 1 && anotherMade === 1 && anotherRows[0]?.description === `${ANOTHER} body` && anotherRows[0]?.priority === 'urgent'
      && blank.open && blank.title === '' && blank.description === '' && blank.priority === 'normal'
      && blank.space === SPACE && blank.project === PROJECT && blank.list === LIST && page.url() === anotherFrom,
    'Create and start another makes one task from what was typed and leaves the modal open on an empty form, in the same space, project and list',
    `${anotherRows.length} task(s) so titled (${JSON.stringify(anotherRows[0] ?? null)}), ${anotherMade} more in the list; the form now ${JSON.stringify(blank)}; ` +
      `the page went from ${where(anotherFrom)} to ${where(page.url())}`,
  )

  // ══ 7. CREATE AND DUPLICATE ══════════════════════════════════════════════
  console.log('\n▶ Create and duplicate')
  const DUPLICATE = `${TAG} duplicate`
  const duplicateBefore = await countIn(LIST)
  await openAndFill({ list: LIST, project: PROJECT, title: DUPLICATE, description: `${DUPLICATE} body`, priority: 'urgent' })
  const duplicateFrom = page.url()
  await choose('duplicate')
  const duplicateRows = await settle(DUPLICATE)
  const duplicateMade = (await countIn(LIST)) - duplicateBefore
  const kept = await formState()
  chk(
    duplicateRows.length === 1 && duplicateMade === 1 && duplicateRows[0]?.description === `${DUPLICATE} body` && duplicateRows[0]?.priority === 'urgent'
      && kept.open && kept.title === DUPLICATE && kept.description === `${DUPLICATE} body` && kept.priority === 'urgent'
      && kept.list === LIST && page.url() === duplicateFrom,
    'Create and duplicate makes one task and leaves the modal open holding the content it was made from, in the same list',
    `${duplicateRows.length} task(s) so titled (${JSON.stringify(duplicateRows[0] ?? null)}), ${duplicateMade} more in the list; the form now ${JSON.stringify(kept)}; ` +
      `the page went from ${where(duplicateFrom)} to ${where(page.url())}`,
  )

  // ══ 8. THE PRIMARY, ON A LIST PICKED UNDER THE SPACE ALONE ═══════════════
  // It went to the task only when a project had been picked, so here it closed
  // the modal and said nothing (`found-29-sep/primary-create-silent-under-a-space`).
  console.log('\n▶ the primary Create task, on a list picked under the space alone')
  const BARE = `${TAG} bare`
  const bareBefore = await countIn(SLIST)
  await openAndFill({ list: SLIST, title: BARE, description: `${BARE} body`, priority: 'low' })
  await page.getByTestId('quick-create-submit').click({ timeout: 8000 }).catch(() => {})
  const bareRows = await settle(BARE)
  const bareId = bareRows[0]?.id ?? null
  await waitUntil(() => page.url().includes(`task=${bareId}`), { timeoutMs: 10_000 })
  const bareShows = await sheetShows(BARE)
  const bareAt = new URL(page.url())
  const bareModal = await modalOpen()
  const bareMade = (await countIn(SLIST)) - bareBefore
  chk(
    bareRows.length === 1 && bareMade === 1 && !bareModal && bareShows
      && bareAt.pathname === `/app/${WS}/${SPACE}/${CONTAINER}/${SLIST}` && bareAt.searchParams.get('task') === bareId,
    'and the primary does the same on a list picked under the space alone: one task, the modal closed, and the task opened on its list',
    `${bareRows.length} task(s) so titled, ${bareMade} more in the list; the modal open ${bareModal}; the page is ${where(page.url())}; the sheet drew the title ${bareShows}`,
  )

  // ══ 9. A CREATE THE SERVER REFUSES ═══════════════════════════════════════
  // The create had no `onError`: a refusal said nothing, and the button came
  // back as if it had not been pressed (`found-29-sep/task-create-fails-silently`).
  // The refusal is the server's shape, answered in the page for this one POST.
  console.log('\n▶ a create the server refuses')
  const REFUSED = `${TAG} refused`
  const SAID = `Refused by create-task-chevron ${stamp}`
  await openAndFill({ list: LIST, project: PROJECT, title: REFUSED, description: `${REFUSED} body`, priority: 'high' })
  await page.route('**/api/v1/tasks', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ data: null, error: { message: SAID } }) })
      : route.fallback(),
  )
  const refusedToastSeen = waitUntil(async () => (await toasts()).some((s) => s.includes(SAID)), { timeoutMs: 10_000 })
  await page.getByTestId('quick-create-submit').click({ timeout: 8000 }).catch(() => {})
  const refusedToast = await refusedToastSeen
  await page.unroute('**/api/v1/tasks').catch(() => {})
  const refusedForm = await formState()
  const refusedMade = (await titled(REFUSED)).length
  const refusedToasts = refusedToast ? [] : await toasts()
  chk(
    refusedToast && refusedForm.open && refusedForm.title === REFUSED && refusedForm.description === `${REFUSED} body` && refusedMade === 0,
    'a create the server refuses says so in the server’s words, and leaves the modal open holding what was typed',
    `${refusedToast ? 'the toast said the server’s sentence' : `the toasts read ${JSON.stringify(refusedToasts)}`}; the form now ${JSON.stringify(refusedForm)}; ${refusedMade} task(s) made`,
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
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}

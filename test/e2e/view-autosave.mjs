/**
 * "AUTOSAVE FOR ME" SAVES A CHANGED LAYOUT TO THE VIEW, FOR WHOEVER MAY CHANGE IT.
 *
 * NOT A FRAME ROW: `found-6-oct/autosave-switch-saves-nothing`. The switch in
 * the Customize panel stored `task_view_prefs.autosave` and nothing in the web
 * read it: the grouping changed to priority, six seconds later the Save view
 * chip was still up, the view's grouping read status by SQL, and a reload read
 * status. Its tooltip says it "will automatically save any layout changes you
 * make to this view".
 *
 * ClickUp ("Save view changes", help centre, read through search excerpts):
 * "Save view" saves for everyone with access to the view; "Autosave" saves
 * any future changes to it, automatically. Each person turns it on for
 * themselves. So with the switch on, a change is saved as Save view would
 * save it — by whoever may change the view. One who may only read it changes
 * their own screen and nothing else.
 *
 *   node test/e2e/view-autosave.mjs --api 3021 --dist /tmp/claude-0/dist-1
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil } from './lib/wait.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 2

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

const stamp = Date.now()
const TAG = `vas${stamp}`
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`. */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — what a view keeps is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const email = `${TAG}-member@rundesk.invalid`
  const password = 'ViewAutosave@12345!'
  const signed = await signUpApi(API, { fullName: 'View reader', email, password, organizationName: `Views ${stamp}`, organizationSlug: `views-${stamp}` })
  const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'member' } })
  if (!added.ok) throw new Error(`could not add the member: ${said(added)}`)
  const M = apiAs(signed.accessToken)

  // A space the member may only read, its list, a task, and a saved view grouped by status.
  const space = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} space`, defaultPermission: 'view' } })
  const project = await A('/projects', { method: 'POST', body: { spaceId: space.data?.id, name: `${TAG} project` } })
  const list = await A('/lists', { method: 'POST', body: { projectId: project.data?.id, name: `${TAG} list` } })
  if (!list.ok || !list.data?.id) throw new Error(`could not make the list: ${said(space)} ${said(project)} ${said(list)}`)
  const task = await A('/tasks', { method: 'POST', body: { listId: list.data.id, title: `${TAG} task`, priority: 'high' } })
  if (!task.ok) throw new Error(`could not make the task: ${said(task)}`)
  const view = await A(`/lists/${list.data.id}/views`, {
    method: 'POST',
    body: { name: `${TAG} view`, type: 'list', config: { activeView: 'list', groupBy: 'status', statusFilter: 'all', sort: { field: 'created', dir: 'desc' } } },
  })
  if (!view.ok || !view.data?.id) throw new Error(`could not make the view: ${said(view)}`)
  const VIEW = view.data.id
  const url = `${B}/app/${WS}/${space.data.id}/${project.data.id}/${list.data.id}?view=${VIEW}`
  const groupingOf = async () => (await sql`select config->>'groupBy' as g from task_views where id = ${VIEW}`)[0]?.g ?? null

  browser = await (await resolveChromium()).launch(launchOptions())
  /** Signed in as `who`, on the list, on the view; the view's writes counted. */
  const open = async (who) => {
    const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage()
    const writes = []
    page.on('request', (r) => { if (r.method() === 'PATCH' && r.url().includes(`/views/${VIEW}`) && !r.url().endsWith('/autosave')) writes.push(r.postData() ?? '') })
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', who.email)
    await page.fill('input[type=password]', who.password)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('list-group-by').waitFor({ state: 'visible', timeout: 20_000 })
    await page.getByText(`${TAG} task`, { exact: true }).first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
    return { page, writes }
  }

  // ══ 1. THE ADMIN, WHO MAY CHANGE THE VIEW ═════════════════════════════════
  console.log('\n▶ the admin, with Autosave for me on, changes the grouping')
  const on = await A(`/views/${VIEW}/autosave`, { method: 'PATCH', body: { autosave: true } })
  if (!on.ok) throw new Error(`could not turn Autosave on: ${said(on)}`)
  const admin = await open(ADMIN)
  const groupedBefore = await groupingOf()
  await admin.page.getByTestId('list-group-by').selectOption('priority')
  const saved = await waitUntil(async () => (await groupingOf()) === 'priority', { timeoutMs: 10_000 })
  const chip = await admin.page.getByTestId('list-save-view').count()
  await admin.page.reload({ waitUntil: 'domcontentloaded' })
  await admin.page.getByTestId('list-group-by').waitFor({ state: 'visible', timeout: 20_000 })
  const shownAfter = await waitUntil(async () => (await admin.page.getByTestId('list-group-by').inputValue().catch(() => null)) === 'priority', { timeoutMs: 10_000 })
  chk(
    on.ok && groupedBefore === 'status' && saved && chip === 0 && admin.writes.length >= 1 && shownAfter,
    'with Autosave for me on, a grouping changed on a saved view is saved to it — read back by SQL — with no Save view chip to press, and the view opens on it after a reload',
    `the view grouped ${groupedBefore} before, ${await groupingOf()} after; the chip ${chip}; writes ${admin.writes.length}; after a reload the control read ${await admin.page.getByTestId('list-group-by').inputValue().catch(() => null)}`,
  )

  // ══ 2. A MEMBER WHO MAY ONLY READ IT ═════════════════════════════════════
  console.log('\n▶ a member who may only read the view, with Autosave for me on')
  const memberOn = await M(`/views/${VIEW}/autosave`, { method: 'PATCH', body: { autosave: true } })
  const member = await open({ email, password })
  const memberBefore = await groupingOf()
  const theirs = memberBefore === 'priority' ? 'status' : 'priority'
  await member.page.getByTestId('list-group-by').selectOption(theirs)
  await member.page.waitForTimeout(4000)
  const after = await groupingOf()
  const refusals = await member.page.locator('[data-sonner-toast]').filter({ visible: true }).count()
  chk(
    memberOn.ok && after === memberBefore && member.writes.length === 0 && refusals === 0,
    'a member who may only read the view, with Autosave for me on, changes their own screen and nothing else: no write to the view, which keeps its grouping, and no refusal to read',
    `their switch ${said(memberOn)}; they grouped by ${theirs}; the view grouped ${memberBefore} before, ${after} after; writes ${member.writes.length}; toasts ${refusals}`,
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
  stack.close()
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}

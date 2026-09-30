/**
 * A VIEW-ONLY SPACE'S MENUS OFFER A MEMBER NOTHING IT WOULD REFUSE THEM.
 *
 * NOT A FRAME ROW: `found-24-sep/view-only-space-offers-members-what-it-refuses`.
 * A space whose default permission is "View only" (or "Comment") refuses its
 * members anything added to it — the create gate asks `edit` of the space —
 * and its own "+" offered them a list, a task, a folder, a project and a form
 * all the same, and the List form's space picker named it. Each was a 403.
 *
 * ClickUp (help centre, search snippets): in a view-only location the create
 * entry leads to a "Request edit access" modal rather than to a thing made.
 * Rundesk has no request for a space's access, so the menus withhold what the
 * space refuses, as they do a guest's (`useCreatable`).
 *
 * A member reads each menu beside the admin, and the API is asked the same.
 *
 *   node test/e2e/view-only-space-menus.mjs --api 3021 --dist /tmp/claude-0/dist-1
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 3

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
const TAG = `vsm${stamp}`
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, data}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)

let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — what is made is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${made.status}`)
  WS = made.data.id
  const email = `${TAG}-member@rundesk.invalid`
  const password = 'Viewer@12345!'
  const signed = await signUpApi(API, {
    fullName: 'Viewing member', email, password,
    organizationName: `Viewing ${stamp}`, organizationSlug: `viewing-${stamp}`,
  })
  const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'member' } })
  if (added.status >= 300) throw new Error(`could not add the member: ${added.status}`)
  const M = apiAs(signed.accessToken)
  const member = { email, password }
  const place = async (name, defaultPermission) => {
    const space = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} ${name}`, ...(defaultPermission ? { defaultPermission } : {}) } })
    if (space.status >= 300 || !space.data?.id) throw new Error(`could not make the ${name} space: ${space.status}`)
    const project = await A('/projects', { method: 'POST', body: { spaceId: space.data.id, name: `${TAG} ${name}` } })
    const [list] = await sql`insert into lists (project_id, name) values (${project.data?.id}, ${`${TAG} ${name} list`}) returning id`
    return { id: space.data.id, project: project.data?.id, list: list.id }
  }
  const VIEW = await place('view only', 'view')
  const EDIT = await place('open')

  browser = await (await resolveChromium()).launch(launchOptions())
  const signIn = async (who) => {
    const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage()
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', who.email)
    await page.fill('input[type=password]', who.password)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
    return page
  }
  /** A space's own "+" menu, once the answer about the spaces this person may add to is in. */
  const spaceMenu = async (page, spaceId) => {
    await page.goto(`${B}/app/${WS}`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId(`space-create-open-${spaceId}`).click({ timeout: 20_000 }).catch(() => {})
    await page.getByTestId('space-create-menu').waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(2500)
    const items = await page.locator('[data-testid="space-create-menu"] [data-testid^="space-create-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid').replace('space-create-', '')))
    await page.keyboard.press('Escape').catch(() => {})
    return items.filter((i) => !i.startsWith('label-') && i !== 'menu-title')
  }
  const PLACED = ['task', 'form', 'list', 'folder', 'project']

  // ══ 1. THE SPACE'S OWN "+" ═══════════════════════════════════════════════
  console.log('\n▶ the "+" of a view-only space and of an open one, for the member and the admin')
  const mPage = await signIn(member)
  const mView = await spaceMenu(mPage, VIEW.id)
  const mEdit = await spaceMenu(mPage, EDIT.id)
  const aPage = await signIn(ADMIN)
  const aView = await spaceMenu(aPage, VIEW.id)
  chk(
    mView.length > 0 && !PLACED.some((k) => mView.includes(k)) && ['task', 'list', 'form'].every((k) => mEdit.includes(k))
      && ['task', 'list', 'folder', 'form'].every((k) => aView.includes(k)),
    'a view-only space’s own menu offers a member nothing that goes in it (a task, a form, a list, a folder, a project) — the open space’s offers them, and the view-only space’s offers them to the admin',
    `the member on the view-only space ${JSON.stringify(mView)}, on the open one ${JSON.stringify(mEdit)}; the admin on the view-only space ${JSON.stringify(aView)}`,
  )

  // ══ 2. THE CREATORS' SPACES ══════════════════════════════════════════════
  console.log('\n▶ the spaces the Task, List, Folder and Form creators offer the member')
  /** A creator's space picker, once the open space is among its options. */
  const pickerSpaces = async (tab, testid) => {
    await mPage.goto(`${B}/app/${WS}`, { waitUntil: 'domcontentloaded' })
    await mPage.getByTestId('quick-create-open').click({ timeout: 20_000 }).catch(() => {})
    await mPage.getByTestId(`create-tab-${tab}`).click({ timeout: 10_000 }).catch(() => {})
    const picker = mPage.getByTestId(testid)
    await picker.locator(`option[value="${EDIT.id}"]`).waitFor({ state: 'attached', timeout: 15_000 }).catch(() => {})
    await mPage.waitForTimeout(2000)
    const ids = await picker.locator('option').evaluateAll((els) => els.map((e) => e.value).filter(Boolean)).catch(() => [])
    await mPage.keyboard.press('Escape').catch(() => {})
    return ids
  }
  const pickers = {
    task: await pickerSpaces('task', 'quick-create-space'),
    list: await pickerSpaces('list', 'quick-create-list-space'),
    folder: await pickerSpaces('folder', 'quick-create-folder-space'),
    form: await pickerSpaces('form', 'quick-create-form-space'),
  }
  const named2 = (ids) => ids.map((id) => (id === EDIT.id ? 'OPEN' : id === VIEW.id ? 'VIEW ONLY' : id))
  chk(
    Object.values(pickers).every((ids) => ids.includes(EDIT.id) && !ids.includes(VIEW.id)),
    'the Task, List, Folder and Form creators offer the member the open space and not the view-only one',
    Object.entries(pickers).map(([k, ids]) => `${k}: ${JSON.stringify(named2(ids))}`).join('; '),
  )

  // ══ 3. THE API AGREES ════════════════════════════════════════════════════
  console.log('\n▶ what the API answers the member')
  const named = async (name) => (await sql`select count(*)::int as n from lists where name = ${name}`)[0].n
  const inView = await M('/lists', { method: 'POST', body: { projectId: VIEW.project, name: `${TAG} listinview` } })
  const inEdit = await M('/lists', { method: 'POST', body: { projectId: EDIT.project, name: `${TAG} listinopen` } })
  const taskInView = await M('/tasks', { method: 'POST', body: { listId: VIEW.list, title: `${TAG} taskinview` } })
  const rows = {
    view: await named(`${TAG} listinview`),
    open: await named(`${TAG} listinopen`),
    task: (await sql`select count(*)::int as n from tasks where title = ${`${TAG} taskinview`}`)[0].n,
  }
  chk(
    inView.status === 403 && rows.view === 0 && inEdit.status < 300 && rows.open === 1 && taskInView.status === 403 && rows.task === 0,
    'the API refuses the member what the menus withhold — a list or a task in the view-only space (403, none made) — and makes the list in the open one',
    `a list in the view-only space ${inView.status} (${rows.view}); in the open one ${inEdit.status} (${rows.open}); a task in the view-only space ${taskInView.status} (${rows.task})`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
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

/**
 * THE WORKSPACE'S ARCHIVED TASKS ARE READ BY EVERY MEMBER, EACH SEEING THOSE
 * THEY MAY OPEN, AND RESTORED BY WHOEVER MAY EDIT THE TASK.
 *
 * NOT A FRAME ROW: `found-25-sep/admin-guard-admits-managers-where-the-web-says-admin`,
 * its archived-tasks slice. `GET /workspaces/:id/archived-tasks` stood behind
 * `WorkspaceAdminGuard`, which admits managers, and Settings offered its
 * Archived tab to admins alone: a manager read the list by the API with no page
 * offering it, and a plain member was refused (403) the archived tasks of the
 * very lists they work in. Its filter asked the private-task rule
 * (`taskVisibilityFilter`) and not the container rule, so opening it to a
 * member as it stood would have named the tasks of a private space they are
 * not in. Restoring (`POST /tasks/:id/restore`) already asked the task's write
 * rule, and the Archived tab offered Restore on every row regardless.
 *
 * ClickUp (search snippets for "Archive a task" and "Archive or restore
 * Folders and Lists", help.clickup.com): archived tasks are shown by the
 * "Show archived" / Archived filter to anyone who can open the location, and
 * archiving or unarchiving a task needs Edit on the Space, Folder or List —
 * "anyone, including guests with edit or full permissions". There is no
 * permission of its own for either, so this is no key: every member reads the
 * list through the task read rule (`taskReadFilterFor`), a manager reading as
 * the read rule has it (everything), and each row says whether its reader may
 * restore it (the write rule, and a manager's own-spaces scope), so Settings
 * offers Restore exactly where it will be accepted and says "view only"
 * elsewhere. Video 1 [03:52]: "agar hum ne koi cheez ARCHIVE ki to woh bhi
 * show aati hai" — archived things stay findable.
 *
 *   node test/e2e/archived-tasks-access.mjs --api 3025 --dist /tmp/claude-0/dist-5
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
const EXPECTED_CHECKS = 7

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
  try { json = JSON.parse(text) } catch { /* not JSON */ }
  return { status: res.status, data: json?.data, error: json?.error }
}
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `ata${stamp}`
const PASSWORD = 'ArchivedTasks@12345!'
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — what is archived is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id

  const person = async (key, role) => {
    const email = `${TAG}-${key}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `Archived ${key}`, email, password: PASSWORD, organizationName: `Archived ${key} ${stamp}`, organizationSlug: `archived-${key}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (added.status >= 300) throw new Error(`could not add the ${key}: ${said(added)}`)
    return { email, password: PASSWORD, as: apiAs(signed.accessToken) }
  }
  const member = await person('member', 'member')
  const manager = await person('manager', 'manager')

  /** A space of the admin's, its project and list, and a task in it — archived. */
  const archivedIn = async (name, extra = {}) => {
    const space = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} ${name}`, ...extra } })
    const project = await A('/projects', { method: 'POST', body: { spaceId: space.data?.id, name: `${TAG} ${name}` } })
    const list = await A('/lists', { method: 'POST', body: { projectId: project.data?.id, name: `${TAG} ${name}` } })
    const title = `${TAG} archived in the ${name} space`
    const task = await A('/tasks', { method: 'POST', body: { listId: list.data?.id, title } })
    if (task.status >= 300 || !task.data?.id) throw new Error(`could not make the ${name} task: ${said(space)} ${said(project)} ${said(list)} ${said(task)}`)
    const archived = await A(`/tasks/${task.data.id}`, { method: 'DELETE' })
    if (archived.status >= 300) throw new Error(`could not archive the ${name} task: ${said(archived)}`)
    return { id: task.data.id, title }
  }
  const OPEN = await archivedIn('open')
  const VIEW = await archivedIn('view-only', { defaultPermission: 'view' })
  const PRIV = await archivedIn('private', { visibility: 'private' })
  const isArchived = async (id) => (await sql`select is_archived from tasks where id = ${id}`)[0]?.is_archived === true
  for (const t of [OPEN, VIEW, PRIV]) if (!(await isArchived(t.id))) throw new Error(`the ${t.title} task is not archived`)

  const listing = async (who) => {
    const r = await who(`/workspaces/${WS}/archived-tasks`)
    const rows = Array.isArray(r.data) ? r.data : []
    const row = (t) => rows.find((x) => x.id === t.id)
    return { status: r.status, said: said(r), rows, row, has: (t) => !!row(t) }
  }
  const shape = (l) => `${l.status} [${l.rows.map((x) => `${x.title.replace(`${TAG} `, '')}${'canRestore' in x ? ` canRestore=${x.canRestore}` : ''}`).join('; ')}]`

  // ══ 1–3. THE LISTING ═════════════════════════════════════════════════════
  console.log('\n▶ the workspace’s archived tasks, read by the member, the manager and the admin')
  const byMember = await listing(member.as)
  const byManager = await listing(manager.as)
  const byAdmin = await listing(A)
  chk(
    byMember.status === 200 && byMember.has(OPEN) && byMember.has(VIEW) && !byMember.has(PRIV),
    'a plain member reads the workspace’s archived tasks (200): those of the open and view-only spaces, and not the one in a private space they are not in',
    `member ${byMember.status === 200 ? shape(byMember) : byMember.said}`,
  )
  chk(
    byAdmin.status === 200 && [OPEN, VIEW, PRIV].every(byAdmin.has)
      && byManager.status === 200 && [OPEN, VIEW, PRIV].every(byManager.has),
    'the admin and the manager each read all three archived tasks, the private space’s included, as the task read rule lets them',
    `admin ${shape(byAdmin)}; manager ${shape(byManager)}`,
  )
  const may = (l, t) => l.row(t)?.canRestore
  chk(
    byMember.status === 200 && may(byMember, OPEN) === true && may(byMember, VIEW) === false
      && [OPEN, VIEW, PRIV].every((t) => may(byAdmin, t) === true)
      && [OPEN, VIEW, PRIV].every((t) => may(byManager, t) === false),
    'each archived row says whether its reader may restore it: the member the open space’s and not the view-only one’s, the admin all three, the manager none (they belong to none of these spaces)',
    `member ${shape(byMember)}; admin ${shape(byAdmin)}; manager ${shape(byManager)}`,
  )

  // ══ 4–6. SETTINGS → ARCHIVED ═════════════════════════════════════════════
  browser = await (await resolveChromium()).launch(launchOptions())
  const archivedTab = async (who) => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } })
    const page = await ctx.newPage()
    try {
      await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
      await page.fill('input[type=email]', who.email)
      await page.fill('input[type=password]', who.password)
      await page.click('button[type=submit]')
      await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
      await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
      await page.goto(`${B}/app/${WS}/settings?tab=archived`, { waitUntil: 'domcontentloaded' })
      await waitUntil(async () => (await page.locator('[data-testid^="settings-tab-"]').count()) > 0 || !page.url().includes('/settings'), { timeoutMs: 15_000 })
      await waitUntil(async () => (await page.getByText(OPEN.title, { exact: true }).count()) > 0, { timeoutMs: 8000 })
      await page.waitForTimeout(500)
      const row = (t) => page.locator('li').filter({ has: page.getByText(t.title, { exact: true }) })
      const seen = async (t) => ({
        listed: await row(t).count(),
        restore: await row(t).getByRole('button', { name: /^Restore$/ }).count(),
        viewOnly: await row(t).getByTestId('archived-task-view-only').count(),
      })
      return {
        url: new URL(page.url()).pathname + new URL(page.url()).search,
        tab: await page.getByTestId('settings-tab-archived').count(),
        workspacesCard: await page.getByRole('heading', { name: /^Archived workspaces$/ }).count(),
        open: await seen(OPEN),
        view: await seen(VIEW),
        priv: await seen(PRIV),
      }
    } finally {
      await ctx.close().catch(() => {})
    }
  }

  console.log('\n▶ Settings → Archived, for the member')
  const memberSees = await archivedTab(member)
  chk(
    memberSees.url.includes('tab=archived') && memberSees.tab === 1
      && memberSees.open.listed >= 1 && memberSees.open.restore === 1 && memberSees.priv.listed === 0,
    'Settings offers a plain member its Archived tab, listing the open space’s archived task with Restore and never the private space’s',
    `member ${JSON.stringify(memberSees)}`,
  )
  chk(
    memberSees.url.includes('tab=archived') && memberSees.view.listed >= 1 && memberSees.view.restore === 0
      && memberSees.view.viewOnly >= 1 && memberSees.workspacesCard === 0,
    'on the member’s Archived tab the view-only space’s task is listed without Restore and marked view only, and no Archived workspaces card is offered to restore from',
    `member ${JSON.stringify(memberSees)}`,
  )

  console.log('\n▶ Settings → Archived, for the manager')
  const managerSees = await archivedTab(manager)
  chk(
    managerSees.url.includes('tab=archived') && managerSees.tab === 1
      && managerSees.open.listed >= 1 && managerSees.view.listed >= 1 && managerSees.priv.listed >= 1
      && managerSees.open.restore + managerSees.view.restore + managerSees.priv.restore === 0
      && managerSees.priv.viewOnly >= 1,
    'Settings offers the manager its Archived tab too, listing all three archived tasks and offering Restore on none of them, since the manager restores only in spaces they belong to',
    `manager ${JSON.stringify(managerSees)}`,
  )

  // ══ 7. RESTORING ═════════════════════════════════════════════════════════
  // Last, because it changes what is archived.
  console.log('\n▶ the member restores: the open space’s task, the view-only one, the private one')
  const restoreOpen = await member.as(`/tasks/${OPEN.id}/restore`, { method: 'POST' })
  const restoreView = await member.as(`/tasks/${VIEW.id}/restore`, { method: 'POST' })
  const restorePriv = await member.as(`/tasks/${PRIV.id}/restore`, { method: 'POST' })
  const after = { open: await isArchived(OPEN.id), view: await isArchived(VIEW.id), priv: await isArchived(PRIV.id) }
  chk(
    restoreOpen.status >= 200 && restoreOpen.status < 300 && after.open === false
      && restoreView.status === 403 && after.view === true
      && restorePriv.status === 404 && after.priv === true,
    'a member restores the archived task of a space they may edit (2xx, back in its list), and is refused the view-only space’s (403) and the private space’s (404), which stay archived',
    `open ${said(restoreOpen)}, view-only ${said(restoreView)}, private ${said(restorePriv)}; archived after ${JSON.stringify(after)}`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  stack.close()
  if (WS && A) await A(`/workspaces/${WS}`, { method: 'DELETE' }).catch(() => {})
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}

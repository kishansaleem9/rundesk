/**
 * AN ARCHIVED TASK IS UNARCHIVED WHERE IT IS SHOWN, BY WHOEVER THE RESTORE
 * RULE LETS.
 *
 * NOT A FRAME ROW: `found-28-sep/archived-tasks-unarchived-in-place`, found by
 * the archived-tasks research. An archived task opened from search or a link
 * said nothing of being archived and offered no way back: only Settings →
 * Archived restored it. And that list asked the restore rule once per row, up
 * to 200 times.
 *
 * ClickUp: Unarchive is on the task, and unarchiving needs Edit on its
 * location. The sheet reads `restore` from the task's capabilities — the rule
 * `POST /tasks/:id/restore` asks — and Settings → Archived answers the same,
 * asked once for a role that decides it.
 *
 *   node test/e2e/unarchive-in-place.mjs --api 3027 --dist /tmp/claude-0/dist-7
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
const EXPECTED_CHECKS = 5

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
const TAG = `uip${stamp}`
const PASSWORD = 'Unarchive@12345!'
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
  if (!sql) throw new Error('no DATABASE_URL — what is archived is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const person = async (key, role) => {
    const email = `${TAG}-${key}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `Unarchive ${key}`, email, password: PASSWORD, organizationName: `Unarchive ${key} ${stamp}`, organizationSlug: `unarchive-${key}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (!added.ok) throw new Error(`could not add the ${key}: ${said(added)}`)
    return { email, id: signed.user?.id, as: apiAs(signed.accessToken) }
  }
  const member = await person('member', 'member')
  const manager = await person('manager', 'manager')

  /** A space of the admin's, its project and list, and a task in it — archived unless `live`. */
  const taskIn = async (name, extra = {}, live = false) => {
    const space = (await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} ${name}`, ...extra } })).data?.id
    const project = (await A('/projects', { method: 'POST', body: { spaceId: space, name: `${TAG} ${name}` } })).data?.id
    const list = (await A('/lists', { method: 'POST', body: { projectId: project, name: `${TAG} ${name}` } })).data?.id
    const title = `${TAG} ${live ? 'live' : 'archived'} in the ${name} space`
    const task = await A('/tasks', { method: 'POST', body: { listId: list, title } })
    if (!task.ok || !task.data?.id) throw new Error(`could not make the ${name} task: ${said(task)}`)
    if (!live) {
      const archived = await A(`/tasks/${task.data.id}`, { method: 'DELETE' })
      if (!archived.ok) throw new Error(`could not archive the ${name} task: ${said(archived)}`)
    }
    return { id: task.data.id, title, space, project, list }
  }
  const OPEN = await taskIn('open')
  const VIEW = await taskIn('view-only', { defaultPermission: 'view' })
  const LIVE = await taskIn('live', {}, true)
  const isArchived = async (id) => (await sql`select is_archived from tasks where id = ${id}`)[0]?.is_archived === true
  const restoreOf = async (who, task) => (await who(`/tasks/${task.id}/capabilities`)).data?.restore

  // ══ 1–2. THE TASK'S CAPABILITIES SAY WHO UNARCHIVES ══════════════════════
  console.log('\n▶ the capabilities of an archived task, and of a live one')
  const offered = { member: await restoreOf(member.as, OPEN), admin: await restoreOf(A, OPEN), live: await restoreOf(member.as, LIVE) }
  chk(
    offered.member === true && offered.admin === true && offered.live === false,
    'an archived task’s capabilities offer Unarchive to a member at Edit and to the admin, and a live task offers it to nobody',
    JSON.stringify(offered),
  )
  const refused = { viewOnly: await restoreOf(member.as, VIEW), managerOutside: await restoreOf(manager.as, OPEN) }
  chk(
    refused.viewOnly === false && refused.managerOutside === false,
    'they offer it to no member of a view-only space, nor to a manager outside the task’s space — the restore route’s own refusals',
    JSON.stringify(refused),
  )

  // ══ 3. SETTINGS → ARCHIVED ANSWERS THE SAME ══════════════════════════════
  console.log('\n▶ Settings → Archived, for the admin, a manager outside and inside the space, and the member')
  const canRestore = async (who) => {
    const r = await who(`/workspaces/${WS}/archived-tasks`)
    const rows = Array.isArray(r.data) ? r.data : []
    const of = (t) => rows.find((row) => row.id === t.id)?.canRestore ?? null
    return { open: of(OPEN), view: of(VIEW) }
  }
  const admins = await canRestore(A)
  const outside = await canRestore(manager.as)
  const joined = await A(`/spaces/${OPEN.space}/members`, { method: 'POST', body: { userId: manager.id, role: 'edit' } })
  const inside = await canRestore(manager.as)
  const members = await canRestore(member.as)
  chk(
    admins.open === true && admins.view === true && outside.open === false && outside.view === false
      && joined.ok && inside.open === true && inside.view === false && members.open === true && members.view === false,
    'Settings → Archived offers Restore as the rule does: the admin every row, a manager the rows of their own spaces, a member where they may edit',
    `admin ${JSON.stringify(admins)}; manager outside ${JSON.stringify(outside)}; joined ${said(joined)}; inside ${JSON.stringify(inside)}; member ${JSON.stringify(members)}`,
  )

  // ══ 4–5. THE TASK SHEET ══════════════════════════════════════════════════
  const chromium = await resolveChromium()
  browser = await chromium.launch(launchOptions())
  const sheetAs = async (who, task) => {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, serviceWorkers: 'block' })
    const page = await ctx.newPage()
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', who.email)
    await page.fill('input[type=password]', PASSWORD)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
    await page.goto(`${B}/app/${WS}/${task.space}/${task.project}/${task.list}?task=${task.id}`, { waitUntil: 'domcontentloaded' })
    // The sheet is open once it draws the task's title.
    await waitUntil(() => page.getByText(task.title, { exact: true }).first().isVisible().catch(() => false), { timeoutMs: 20_000 })
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
    return page
  }

  console.log('\n▶ the member opens the archived task of the open space')
  const mp = await sheetAs(member, OPEN)
  const banner = await mp.getByTestId('task-archived-banner').count()
  const button = await mp.getByTestId('task-unarchive').count()
  await mp.getByTestId('task-unarchive').click({ timeout: 5000 }).catch(() => {})
  const restored = await waitUntil(async () => !(await isArchived(OPEN.id)), { timeoutMs: 10_000 })
  const bannerGone = restored && await waitUntil(async () => (await mp.getByTestId('task-archived-banner').count()) === 0, { timeoutMs: 10_000 })
  chk(
    banner === 1 && button === 1 && restored && bannerGone,
    'the task sheet says the task is archived and offers Unarchive, which restores it there, and the notice goes',
    `banner ${banner}; Unarchive ${button}; restored ${restored}; the notice gone ${bannerGone}`,
  )
  await mp.context().close().catch(() => {})

  console.log('\n▶ the member opens the archived task of the view-only space')
  const vp = await sheetAs(member, VIEW)
  const viewBanner = await vp.getByTestId('task-archived-banner').count()
  const viewButton = await vp.getByTestId('task-unarchive').count()
  chk(
    viewBanner === 1 && viewButton === 0 && (await isArchived(VIEW.id)),
    'in a view-only space the sheet says the task is archived and offers no Unarchive',
    `banner ${viewBanner}; Unarchive ${viewButton}`,
  )
  await vp.context().close().catch(() => {})
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

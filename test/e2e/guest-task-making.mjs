/**
 * A GUEST ADDS A TASK WHERE THEY HOLD FULL EDIT, AND NOWHERE ELSE.
 *
 * NOT A FRAME ROW: `found-25-sep/guests-with-full-edit-make-no-tasks`, found
 * closing `guests-edit-no-shared-task`. Making a task refused every guest before
 * the create gate read what was shared with them, so a guest given a list at
 * Full edit could not add to it.
 *
 * ClickUp (help centre, "Permissions in detail"; the feature request "Option
 * for guests to have access to create tasks in a list but not be able to
 * delete the list"): Full edit creates tasks and subtasks, a guest may hold
 * Full edit on what is shared with them, and with it they add tasks — the
 * request is for a level that adds without deleting. Edit adds none. The tasks
 * are read back by SQL.
 *
 *   node test/e2e/guest-task-making.mjs --api 3021 --dist /tmp/claude-0/dist-1
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
const TAG = `gtm${stamp}`
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the tasks are read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const email = `${TAG}-guest@rundesk.invalid`
  const password = 'GuestTasks@12345!'
  const signed = await signUpApi(API, { fullName: 'Task guest', email, password, organizationName: `Guest ${stamp}`, organizationSlug: `guest-${stamp}` })
  const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'guest' } })
  if (!added.ok) throw new Error(`could not add the guest: ${said(added)}`)
  const G = apiAs(signed.accessToken)
  const [guest] = await sql`select id from users where email = ${email}`

  /** A space (Full edit, the default), a project and lists of the admin's. */
  const space = async (name, listNames) => {
    const sp = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} ${name}` } })
    const project = await A('/projects', { method: 'POST', body: { spaceId: sp.data?.id, name: `${TAG} ${name}` } })
    const out = { id: sp.data?.id, project: project.data?.id, lists: {} }
    for (const l of listNames) {
      const list = await A('/lists', { method: 'POST', body: { projectId: project.data?.id, name: `${TAG} ${name} ${l}` } })
      if (!list.ok || !list.data?.id) throw new Error(`could not make the ${l} list: ${said(sp)} ${said(project)} ${said(list)}`)
      out.lists[l] = { id: list.data.id, url: `/app/${WS}/${sp.data.id}/${project.data.id}/${list.data.id}` }
    }
    return out
  }
  const OPEN = await space('open', ['full edit', 'edit', 'nothing'])
  const SHARED = await space('shared whole', ['inside'])
  const share = (type, id, level) => sql`insert into object_shares (workspace_id, object_type, object_id, user_id, level) values (${WS}, ${type}, ${id}, ${guest.id}, ${level})`
  await share('list', OPEN.lists['full edit'].id, 'admin')
  await share('list', OPEN.lists.edit.id, 'edit')
  await sql`insert into space_members (space_id, user_id, role) values (${SHARED.id}, ${guest.id}, 'admin')`
  const makes = async (list, title) => {
    const r = await G('/tasks', { method: 'POST', body: { listId: list.id, title: `${TAG} ${title}` } })
    const [row] = await sql`select count(*)::int as n from tasks where title = ${`${TAG} ${title}`}`
    return { status: r.status, ok: r.ok, made: row.n }
  }

  // ══ 1. SHARED LISTS ══════════════════════════════════════════════════════
  console.log('\n▶ the guest adds a task to a list shared at Full edit, at Edit, and to one not shared')
  const full = await makes(OPEN.lists['full edit'], 'at full edit')
  const edit = await makes(OPEN.lists.edit, 'at edit')
  const none = await makes(OPEN.lists.nothing, 'not shared')
  chk(
    full.ok && full.made === 1 && edit.status === 403 && edit.made === 0 && none.status >= 400 && none.made === 0,
    'a guest adds a task to a list shared with them at Full edit — and not at Edit (403), nor to a list not shared with them, none made',
    `Full edit ${JSON.stringify(full)}; Edit ${JSON.stringify(edit)}; not shared ${JSON.stringify(none)}`,
  )

  // ══ 2. A SPACE ═══════════════════════════════════════════════════════════
  console.log('\n▶ the guest, given a whole space at Full edit, adds a task in it')
  const inSpace = await makes(SHARED.lists.inside, 'in the space')
  chk(
    inSpace.ok && inSpace.made === 1,
    'given a whole space at Full edit, a guest adds a task in it',
    JSON.stringify(inSpace),
  )

  // ══ 3. THE LIST PAGE ═════════════════════════════════════════════════════
  console.log('\n▶ the list page, for the guest, in the list at Full edit and the one at Edit')
  browser = await (await resolveChromium()).launch(launchOptions())
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', email)
  await page.fill('input[type=password]', password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
  const offered = async (list, taskTitle) => {
    await page.goto(`${B}${list.url}`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('work-view-tab-type-list').click({ timeout: 20_000 }).catch(() => {})
    if (taskTitle) await page.getByText(taskTitle, { exact: true }).first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
    await page.waitForTimeout(2500)
    return {
      headerAdd: await page.getByRole('button', { name: /^Add task$/ }).count().catch(() => -1),
      groupAdd: await page.getByTestId('list-group-add-task').count().catch(() => -1),
    }
  }
  const pf = await offered(OPEN.lists['full edit'], `${TAG} at full edit`)
  const pe = await offered(OPEN.lists.edit)
  chk(
    pf.headerAdd >= 1 && pf.groupAdd >= 1 && pe.headerAdd === 0 && pe.groupAdd === 0,
    'the list page offers the guest Add task and the add rows in the list at Full edit, and neither in the one at Edit',
    `Full edit ${JSON.stringify(pf)}; Edit ${JSON.stringify(pe)}`,
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

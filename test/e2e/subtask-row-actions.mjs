/**
 * A SUBTASK'S ROW OFFERS ARCHIVE AND DELETE, AS THE TASK'S MENU DOES, AND EACH
 * DOES WHAT IT SAYS.
 *
 * NOT A FRAME ROW: `found-25-sep/subtask-delete-archives`, found closing
 * `full-edit-enforced-nowhere`. The row's one button said Delete and called
 * `DELETE /tasks/:id`, which archives; the task's menu keeps the two apart —
 * Archive at Edit, Delete to the Trash at Full edit.
 *
 * ClickUp (help centre, "Archive a task", "Delete a task", search snippets): a
 * subtask's menu archives it — cleared from view, found by a filter — or deletes
 * it to the Trash, restorable for thirty days. What happened is read back by SQL.
 *
 *   node test/e2e/subtask-row-actions.mjs --api 3021 --dist /tmp/claude-0/dist-1
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'

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
const TAG = `sra${stamp}`
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`. */
const apiAs = (token) => async (route, init = {}) => {
  const headers = { authorization: `Bearer ${token}` }
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, { ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined }).catch(() => null)
  if (!res) return { status: 0, data: null, error: { message: 'no answer' } }
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — what each press did is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const email = `${TAG}-member@rundesk.invalid`
  const password = 'SubtaskRows@12345!'
  await signUpApi(API, { fullName: 'Subtask member', email, password, organizationName: `Subtask ${stamp}`, organizationSlug: `subtask-${stamp}` })
  const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'member' } })
  if (added.status >= 300) throw new Error(`could not add the member: ${said(added)}`)

  /** A space at `level` (or the default, Full edit), a parent task and its subtasks. */
  const place = async (name, level, subtaskNames) => {
    const space = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} ${name}`, ...(level ? { defaultPermission: level } : {}) } })
    const project = await A('/projects', { method: 'POST', body: { spaceId: space.data?.id, name: `${TAG} ${name}` } })
    const list = await A('/lists', { method: 'POST', body: { projectId: project.data?.id, name: `${TAG} ${name}` } })
    const parent = await A('/tasks', { method: 'POST', body: { listId: list.data?.id, title: `${TAG} ${name} parent` } })
    if (parent.status >= 300) throw new Error(`could not make the ${name} parent: ${said(space)} ${said(list)} ${said(parent)}`)
    const subs = []
    for (const n of subtaskNames) {
      const title = `${TAG} ${name} ${n}`
      const sub = await A('/tasks', { method: 'POST', body: { listId: list.data.id, title, parentTaskId: parent.data.id } })
      if (sub.status >= 300) throw new Error(`could not make "${title}": ${said(sub)}`)
      subs.push({ id: sub.data.id, title })
    }
    return { url: `/app/${WS}/${space.data.id}/${project.data.id}/${list.data.id}?task=${parent.data.id}`, subs }
  }
  const FULL = await place('full edit', null, ['to archive', 'to delete'])
  const EDIT = await place('edit', 'edit', ['only one'])
  const stateOf = async (id) => (await sql`select is_archived, deleted_at from tasks where id = ${id}`)[0] ?? null

  browser = await (await resolveChromium()).launch(launchOptions())
  const signIn = async (who, pass) => {
    const page = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage()
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', who)
    await page.fill('input[type=password]', pass)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
    return page
  }
  /** The subtask's row in the parent's sheet, and the two buttons it offers. */
  const rowOf = (page, sub) => page.getByTestId('task-sheet').locator('li', { hasText: sub.title }).first()
  const offers = async (page, sub) => {
    // The subtasks are the sheet's Subtasks tab.
    await page.getByTestId('task-tab-subtasks').click({ timeout: 20_000 }).catch(() => {})
    const row = rowOf(page, sub)
    await row.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
    return {
      row: await row.count().catch(() => -1),
      archive: await row.getByRole('button', { name: /^Archive$/ }).count().catch(() => -1),
      delete: await row.getByRole('button', { name: /^Delete$/ }).count().catch(() => -1),
    }
  }

  // ══ 1. AT FULL EDIT ══════════════════════════════════════════════════════
  console.log('\n▶ the admin’s parent task, with two subtasks: Archive one, Delete the other')
  const admin = await signIn(ADMIN.email, ADMIN.password)
  await admin.goto(`${B}${FULL.url}`, { waitUntil: 'domcontentloaded' })
  const [toArchive, toDelete] = FULL.subs
  const o1 = await offers(admin, toArchive)
  await rowOf(admin, toArchive).getByRole('button', { name: /^Archive$/ }).click({ timeout: 5000 }).catch(() => {})
  await admin.waitForTimeout(2000)
  await rowOf(admin, toDelete).getByRole('button', { name: /^Delete$/ }).click({ timeout: 5000 }).catch(() => {})
  await admin.waitForTimeout(2500)
  const archived = await stateOf(toArchive.id)
  const deleted = await stateOf(toDelete.id)
  chk(
    o1.row === 1 && o1.archive === 1 && o1.delete === 1
      && archived?.is_archived === true && archived?.deleted_at === null && deleted?.deleted_at != null,
    'a subtask’s row offers Archive and Delete, as the task’s menu does: Archive archives one (archived, not in the Trash), and Delete puts the other in the Trash',
    `offered ${JSON.stringify(o1)}; archived ${JSON.stringify(archived)}; deleted ${JSON.stringify(deleted)}`,
  )

  // ══ 2. AT EDIT ═══════════════════════════════════════════════════════════
  console.log('\n▶ a member in a space whose default is Edit, on the same kind of row')
  const member = await signIn(email, password)
  await member.goto(`${B}${EDIT.url}`, { waitUntil: 'domcontentloaded' })
  const o2 = await offers(member, EDIT.subs[0])
  chk(
    o2.row === 1 && o2.archive === 1 && o2.delete === 0,
    'at Edit a subtask’s row offers Archive and not Delete, which takes Full edit',
    JSON.stringify(o2),
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

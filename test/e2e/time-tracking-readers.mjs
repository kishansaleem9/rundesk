/**
 * TIME IS TRACKED BY WHOEVER MAY READ THE TASK, AND AI BELONGS TO THE
 * WORKSPACE'S MEMBERS BY THEIR ROLE THERE — THE ACCOUNT'S OWN ROLE DECIDES
 * NEITHER.
 *
 * NOT A FRAME ROW: `found-25-sep/guest-guard-reads-the-account-role`, found
 * closing `task-rows-changed-by-id-anywhere`. The time routes and the AI routes
 * carried a guard that said "Guests cannot use this feature" and read the
 * ACCOUNT's role, which no product path sets to guest: a workspace's guests
 * keep the account role `member`. It refused nobody who was a guest of a
 * workspace, and refused an account marked guest everywhere, whatever its
 * workspaces made it.
 *
 * ClickUp (help centre, "Manage individual permissions for view only users",
 * search snippets): view-only members and guests have four individual
 * permissions; time tracking is one, on by default. A guest tracks time on
 * what is shared with them, and a view-only member on what they read. Time
 * entries and the knowledge index are read back by SQL.
 *
 *   node test/e2e/time-tracking-readers.mjs --api 3021 --dist /tmp/claude-0/dist-1
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
const EXPECTED_CHECKS = 4

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
const TAG = `ttr${stamp}`
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
  if (!sql) throw new Error('no DATABASE_URL — time entries and the index are read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id

  /** Signs a person up and adds them to the workspace as `role`. */
  const person = async (key, role) => {
    const email = `${TAG}-${key}@rundesk.invalid`
    const password = 'TimeReaders@12345!'
    const signed = await signUpApi(API, { fullName: `Time ${key}`, email, password, organizationName: `Time ${key} ${stamp}`, organizationSlug: `time-${key}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (added.status >= 300) throw new Error(`could not add the ${key}: ${said(added)}`)
    const [row] = await sql`select id from users where email = ${email}`
    return { id: row.id, email, password, as: apiAs(signed.accessToken) }
  }
  const guest = await person('guest', 'guest')
  const member = await person('member', 'member')
  // An account whose OWN role is guest, and a member of this workspace. The
  // enum allows the value and no product path sets it; the role rides in the
  // token, so it is signed in again after.
  const marked = await person('marked', 'member')
  await sql`update users set role = 'guest' where id = ${marked.id}`
  marked.as = apiAs((await signInApi(API, marked.email, marked.password)).accessToken)

  const listIn = async (name, level) => {
    const space = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} ${name}`, ...(level ? { defaultPermission: level } : {}) } })
    const project = await A('/projects', { method: 'POST', body: { spaceId: space.data?.id, name: `${TAG} ${name}` } })
    const list = await A('/lists', { method: 'POST', body: { projectId: project.data?.id, name: `${TAG} ${name}` } })
    if (list.status >= 300 || !list.data?.id) throw new Error(`could not make the ${name} list: ${said(space)} ${said(list)}`)
    return { id: list.data.id, url: `/app/${WS}/${space.data.id}/${project.data.id}/${list.data.id}` }
  }
  const OPEN = await listIn('open')
  const VIEW = await listIn('view only', 'view')
  const task = async (list, title) => {
    const t = await A('/tasks', { method: 'POST', body: { listId: list.id, title: `${TAG} ${title}` } })
    if (t.status >= 300 || !t.data?.id) throw new Error(`could not make "${title}": ${said(t)}`)
    return t.data.id
  }
  const shared = await task(OPEN, 'shared with the guest')
  const notShared = await task(OPEN, 'not shared')
  const inView = await task(VIEW, 'in the view-only space')
  const forMarked = await task(OPEN, 'for the marked account')
  const forSheet = await task(OPEN, 'the guest opens')
  for (const id of [shared, forSheet]) {
    await sql`insert into object_shares (workspace_id, object_type, object_id, user_id, level) values (${WS}, 'task', ${id}, ${guest.id}, 'view')`
  }
  const entries = async (userId, taskId) => sql`select ended_at from time_entries where user_id = ${userId} and task_id = ${taskId}`
  const hour = (h) => new Date(Date.UTC(2026, 8, 1, h)).toISOString()
  const track = async (who, taskId) => {
    const start = await who.as(`/tasks/${taskId}/time-entries/start`, { method: 'POST', body: { description: `${TAG} timer` } })
    const stop = start.data?.id ? await who.as(`/tasks/${taskId}/time-entries/stop/${start.data.id}`, { method: 'POST' }) : { status: 0, error: { message: 'nothing started' } }
    const manual = await who.as(`/tasks/${taskId}/time-entries/manual`, { method: 'POST', body: { startedAt: hour(9), endedAt: hour(10), description: `${TAG} manual` } })
    const rows = await entries(who.id, taskId)
    return { start: start.status, stop: stop.status, manual: manual.status, made: rows.length, running: rows.filter((r) => r.ended_at === null).length }
  }

  // ══ 1. READERS TRACK TIME ════════════════════════════════════════════════
  console.log('\n▶ a guest on a task shared with them at View, and on one not shared; a member in a view-only space')
  const g = await track(guest, shared)
  const gNot = await track(guest, notShared)
  const v = await track(member, inView)
  chk(
    g.start === 201 && g.stop < 300 && g.manual === 201 && g.made === 2 && g.running === 0
      && gNot.start === 403 && gNot.manual === 403 && gNot.made === 0
      && v.start === 201 && v.stop < 300 && v.manual === 201 && v.made === 2,
    'a guest starts, stops and logs time on a task shared with them at View — not on one that is not (403, none made) — and a member of a view-only space does as the guest does',
    `guest, shared ${JSON.stringify(g)}; guest, not shared ${JSON.stringify(gNot)}; view-only member ${JSON.stringify(v)}`,
  )

  // ══ 2. THE ACCOUNT'S ROLE ════════════════════════════════════════════════
  console.log('\n▶ an account whose own role is guest, a member of the workspace: a timer, and a question')
  const markedStart = await marked.as(`/tasks/${forMarked}/time-entries/start`, { method: 'POST', body: { description: `${TAG} marked` } })
  const markedRows = await entries(marked.id, forMarked)
  const markedAsks = await marked.as('/ai/knowledge', { method: 'POST', body: { workspaceId: WS, question: `${TAG} what is in this workspace?` } })
  chk(
    markedStart.status === 201 && markedRows.length === 1 && markedAsks.status < 300,
    'an account marked guest on its own, and a member of the workspace, is what the workspace makes it: it tracks time and asks the knowledge base',
    `timer ${said(markedStart)} (${markedRows.length} made); knowledge ${said(markedAsks)}`,
  )

  // ══ 3. AI BY THE WORKSPACE'S ROLE ════════════════════════════════════════
  console.log('\n▶ the knowledge base: asked by the guest, reindexed by the guest, the member and the admin')
  const indexed = async () => (await sql`select count(*)::int as n from knowledge_embeddings where workspace_id = ${WS}`)[0].n
  const guestAsks = await guest.as('/ai/knowledge', { method: 'POST', body: { workspaceId: WS, question: `${TAG} what is in this workspace?` } })
  const guestIndexes = await guest.as(`/workspaces/${WS}/knowledge/reindex`, { method: 'POST' })
  const memberIndexes = await member.as(`/workspaces/${WS}/knowledge/reindex`, { method: 'POST' })
  const refusedLeft = await indexed()
  const adminIndexes = await A(`/workspaces/${WS}/knowledge/reindex`, { method: 'POST' })
  const adminLeft = await indexed()
  chk(
    guestAsks.status === 403 && guestIndexes.status === 403 && memberIndexes.status === 403 && refusedLeft === 0
      && adminIndexes.status < 300 && adminLeft > 0,
    'a guest of the workspace neither asks its knowledge base nor reindexes it, a member does not reindex it (403 each, nothing indexed) — and its admin does',
    `guest asks ${said(guestAsks)}, reindexes ${said(guestIndexes)}; member reindexes ${said(memberIndexes)}; ${refusedLeft} indexed; admin ${said(adminIndexes)}, ${adminLeft} indexed`,
  )

  // ══ 4. THE SHEET ═════════════════════════════════════════════════════════
  console.log('\n▶ the task sheet’s Time tab, for the guest, on a task shared with them at View')
  browser = await (await resolveChromium()).launch(launchOptions())
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', guest.email)
  await page.fill('input[type=password]', guest.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
  await page.goto(`${B}${OPEN.url}?task=${forSheet}`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('task-tab-time').click({ timeout: 20_000 }).catch(() => {})
  const startButton = page.getByTestId('task-sheet').getByRole('button', { name: /^Start timer$/ })
  await startButton.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
  const offered = await startButton.isEnabled({ timeout: 5000 }).catch(() => null)
  if (offered) await startButton.click({ timeout: 5000 }).catch(() => {})
  await page.getByTestId('task-sheet').getByRole('button', { name: /^Stop$/ }).waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
  const sheetRows = await entries(guest.id, forSheet)
  chk(
    offered === true && sheetRows.length === 1 && sheetRows[0].ended_at === null,
    'the sheet offers the guest Start timer on a task shared with them at View, and the timer runs',
    `Start timer ${offered === null ? 'not found' : offered ? 'offered' : 'disabled'}; ${sheetRows.length} entry, running ${sheetRows.filter((r) => r.ended_at === null).length}`,
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

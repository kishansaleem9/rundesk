/**
 * A DEPENDENCY NAMES ONLY TASKS ITS READER MAY OPEN.
 *
 * NOT A FRAME ROW: `found-23-sep/workspace-reads-skip-the-container-rule`, its
 * dependencies. A dependency can join a task a member may open to one they may
 * not — a task in a space they are refused, or somebody's private task. It
 * stays real: the member's task is still blocked by it. What must not reach
 * them is its title or its id.
 *
 * Measured on lane 1 before the fix, as a member refused a private space whose
 * task blocks the member's own: the dependency graph of the member's task
 * named the hidden blocker; marking the task done was refused with
 * "Task is blocked by open dependencies: <its title> (<its id>)"; and the
 * notification sent when the dependency was made said `Blocked by "<title>"`.
 *
 *   node test/e2e/dependency-read-access.mjs --api 3021
 */
import { signInApi, signUpApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 3

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
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

/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.error ?? null).slice(0, 160)}`
/** Poll `ok` until it holds or `ms` pass; never throws. */
const waitFor = async (ok, ms) => {
  const until = Date.now() + ms
  while (Date.now() < until) {
    if (await ok()) return true
    await new Promise((r) => setTimeout(r, 250))
  }
  return ok()
}

const stamp = Date.now()
const TAG = `dra-${stamp}`
let sql = null
let WS = null
let A = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the private blocker and the dependencies are written by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id

  const email = `${TAG}-member@rundesk.invalid`
  const signed = await signUpApi(API, {
    fullName: 'Dependency member', email, password: 'Member@12345!',
    organizationName: `Dependency member ${stamp}`, organizationSlug: `dependency-member-${stamp}`,
  })
  const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'member' } })
  if (added.status >= 300) throw new Error(`could not add the member: ${said(added)}`)
  const M = apiAs(signed.accessToken)
  const memberId = signed.user?.id

  const make = async (C, route, body, what) => {
    const res = await C(route, { method: 'POST', body })
    if (res.status >= 300 || !res.data?.id) throw new Error(`could not make ${what}: ${said(res)}`)
    return res.data.id
  }
  const listIn = async (side, visibility) => {
    const space = await make(A, '/spaces', { workspaceId: WS, name: `${TAG} ${side} space`, ...(visibility ? { visibility } : {}) }, `the ${side} space`)
    const project = await make(A, '/projects', { spaceId: space, name: `${TAG} ${side} project` }, `the ${side} project`)
    return make(A, '/lists', { projectId: project, name: `${TAG} ${side} list` }, `the ${side} list`)
  }
  const HIDDEN_LIST = await listIn('hidden', 'private')
  const OPEN_LIST = await listIn('open')
  // Three blockers: one in the refused space, one private task of the open
  // space that is not the member's, and one the member may open.
  const HIDDEN = await make(A, '/tasks', { listId: HIDDEN_LIST, title: `${TAG} hidden blocker` }, 'the hidden blocker')
  const PRIVATE = await make(A, '/tasks', { listId: OPEN_LIST, title: `${TAG} private blocker` }, 'the private blocker')
  await sql`update tasks set visibility = 'private' where id = ${PRIVATE}`
  const OPEN = await make(A, '/tasks', { listId: OPEN_LIST, title: `${TAG} open blocker` }, 'the open blocker')
  // The member's own task, held up by all three. And a task of the open space
  // that touches the graph ONLY through the hidden blocker, which it blocks:
  // shown alone, it would tell the member of the link it was reached by.
  const MINE = await make(M, '/tasks', { listId: OPEN_LIST, title: `${TAG} the member's task` }, 'the member’s task')
  const FAR = await make(A, '/tasks', { listId: OPEN_LIST, title: `${TAG} reached through the hidden one` }, 'the far task')
  await sql`
    insert into task_dependencies (task_id, related_task_id, type)
    values (${MINE}, ${HIDDEN}, 'blocked_by'), (${MINE}, ${PRIVATE}, 'blocked_by'), (${MINE}, ${OPEN}, 'blocked_by'),
           (${HIDDEN}, ${FAR}, 'blocked_by')`
  const gate = await M(`/tasks/${HIDDEN}`)
  if (gate.ok) throw new Error(`the member could open the hidden blocker (${said(gate)}), so nothing here would mean anything`)
  const namesHidden = (text) => [HIDDEN, PRIVATE, `${TAG} hidden blocker`, `${TAG} private blocker`].filter((s) => text.includes(s))

  // ══ 1. THE GRAPH ═════════════════════════════════════════════════════════
  console.log('\n▶ the dependency graph')
  const memberGraph = await M(`/tasks/${MINE}/dependencies/graph?depth=6`)
  const adminGraph = await A(`/tasks/${MINE}/dependencies/graph?depth=6`)
  const graphText = (res) => JSON.stringify(res.data ?? null)
  chk(
    memberGraph.status === 200 && namesHidden(graphText(memberGraph)).length === 0 && !graphText(memberGraph).includes(FAR) &&
      graphText(memberGraph).includes(OPEN) &&
      adminGraph.status === 200 && namesHidden(graphText(adminGraph)).length === 4 && graphText(adminGraph).includes(FAR),
    'a task’s dependency graph shows the member no task they may not open, by title or id, nor one reached only through such a task — while it shows the open blocker, and the admin’s shows them all',
    `the member's graph (${memberGraph.status}) names ${JSON.stringify(namesHidden(graphText(memberGraph)).map((s) => s.replace(`${TAG} `, '')))}` +
      `, the task reached through the hidden one: ${graphText(memberGraph).includes(FAR)}, the open blocker: ${graphText(memberGraph).includes(OPEN)}; ` +
      `the admin's names ${namesHidden(graphText(adminGraph)).length} of 4 and the far task: ${graphText(adminGraph).includes(FAR)}`,
  )

  // ══ 2. THE REFUSAL ═══════════════════════════════════════════════════════
  console.log('\n▶ closing a task that is still blocked')
  const done = await M(`/tasks/${MINE}`, { method: 'PATCH', body: { status: 'done' } })
  const refusal = JSON.stringify(done.error ?? null)
  const [{ status: stillOpen }] = await sql`select status_category as status from tasks where id = ${MINE}`
  chk(
    done.status === 400 && stillOpen !== 'closed' && namesHidden(refusal).length === 0 && refusal.includes(`${TAG} open blocker`),
    'closing a task blocked by tasks the member may not open is still refused, and the refusal names only the blocker they may open',
    `it answered ${said(done)}; the task is ${stillOpen}; the refusal names ${JSON.stringify(namesHidden(refusal).map((s) => s.replace(`${TAG} `, '')))}`,
  )

  // ══ 3. THE NOTIFICATION ══════════════════════════════════════════════════
  console.log('\n▶ the notice that a task is blocked')
  // A task the admin made and gave the member, blocked by the admin through
  // the route, which is what sends the notice.
  const GIVEN = await make(A, '/tasks', { listId: OPEN_LIST, title: `${TAG} given to the member`, assigneeIds: [memberId] }, 'the given task')
  const linkHidden = await A(`/tasks/${GIVEN}/dependencies`, { method: 'POST', body: { relatedTaskId: HIDDEN, type: 'blocked_by' } })
  const linkOpen = await A(`/tasks/${GIVEN}/dependencies`, { method: 'POST', body: { relatedTaskId: OPEN, type: 'blocked_by' } })
  if (linkHidden.status >= 300 || linkOpen.status >= 300) throw new Error(`the admin could not link the given task: ${said(linkHidden)} / ${said(linkOpen)}`)
  const blockedNotices = async () =>
    sql`select title, body from notifications where user_id = ${memberId} and type = 'task_blocked' and workspace_id = ${WS}`
  await waitFor(async () => (await blockedNotices()).length >= 2, 8000)
  const notices = await blockedNotices()
  const noticeText = JSON.stringify(notices)
  chk(
    notices.length === 2 && namesHidden(noticeText).length === 0 && noticeText.includes(`${TAG} open blocker`),
    'the member is told their task is blocked each time, and the notice names only a blocker they may open',
    `${notices.length} notice(s): ${JSON.stringify(notices.map((n) => n.body))}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  if (WS && A) {
    const gone = await A(`/workspaces/${WS}`, { method: 'DELETE' })
    if (gone.status >= 300 || gone.status === 0) console.log(`  \x1b[33mnote\x1b[0m cleanup answered ${gone.status}`)
  }
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}

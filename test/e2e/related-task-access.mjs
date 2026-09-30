/**
 * A TASK SHOWS ONLY THE RELATED TASKS ITS READER MAY OPEN.
 *
 * NOT A FRAME ROW: `found-23-sep/related-tasks-ignore-private-containers`.
 * `getTask` returned each dependency with the related task's whole row.
 * Measured on lane 1 before the fix: a member opening their own task, which
 * the admin had tied to a task in a private space, was handed that task's
 * title and its DESCRIPTION, in two dependency rows; the same came back from
 * every write that answers with the task.
 *
 * The task now keeps the related tasks its reader may open, and says how many
 * it left out (`hiddenDependencies`), so a dependency they cannot see is
 * still known to be there — as `dependency-read-access` has the graph do.
 *
 * The bulk editor answered with each task read as nobody in particular: a
 * relationship-only change (an assignee, a label, a dependency) re-read the
 * task with no reader, so every related task came back whole
 * (`found-24-sep/bulk-edit-answers-unfiltered`).
 *
 *   node test/e2e/related-task-access.mjs --api 3021
 */
import { signInApi, signUpApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 4

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

/* NEVER THROWS — `{status, data, error, text}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `rta-${stamp}`
const WORD = `okapi${stamp}`
let sql = null
let WS = null
let A = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the dependencies are planted by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const email = `${TAG}-member@rundesk.invalid`
  const signed = await signUpApi(API, {
    fullName: 'Related member', email, password: 'Member@12345!',
    organizationName: `Related ${stamp}`, organizationSlug: `related-${stamp}`,
  })
  const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'member' } })
  if (added.status >= 300) throw new Error(`could not add the member: ${said(added)}`)
  const M = apiAs(signed.accessToken)
  const memberId = signed.user?.id
  const adminId = auth.user?.id

  const make = async (route, body, what) => {
    const res = await A(route, { method: 'POST', body })
    if (res.status >= 300 || !res.data?.id) throw new Error(`could not make ${what}: ${said(res)}`)
    return res.data.id
  }
  const listIn = async (name, visibility) => {
    const space = await make('/spaces', { workspaceId: WS, name: `${TAG} ${name}`, ...(visibility ? { visibility } : {}) }, `the ${name} space`)
    const project = await make('/projects', { spaceId: space, name: `${TAG} ${name}` }, `the ${name} project`)
    return make('/lists', { projectId: project, name: `${TAG} ${name}` }, `the ${name} list`)
  }
  const hiddenList = await listIn('private', 'private')
  const openList = await listIn('open')
  const HIDDEN = await make('/tasks', { listId: hiddenList, title: `${WORD} private task`, description: `${WORD} private description` }, 'the private task')
  const NEAR = await make('/tasks', { listId: openList, title: `${TAG} an open task` }, 'the open related task')
  const MINE = await make('/tasks', { listId: openList, title: `${TAG} the member's task`, assigneeIds: [memberId] }, "the member's task")
  const gate = await M(`/tasks/${HIDDEN}`)
  if (gate.ok) throw new Error(`the member was not refused the private task (${said(gate)}), so nothing here would mean anything`)
  // Two ties to the hidden task and one to the open one, planted by SQL.
  for (const [related, type] of [[HIDDEN, 'blocks'], [HIDDEN, 'related_to'], [NEAR, 'related_to']]) {
    await sql`insert into task_dependencies (task_id, related_task_id, type) values (${MINE}, ${related}, ${type})`
  }
  const relatedIds = (res) => (res.data?.dependencies ?? []).map((d) => d.related?.id ?? d.dep?.relatedTaskId)

  // ══ 1. READING THE TASK ══════════════════════════════════════════════════
  console.log('\n▶ the member opens their own task')
  const mine = await M(`/tasks/${MINE}`)
  const adminView = await A(`/tasks/${MINE}`)
  chk(
    mine.status === 200 && !mine.text.includes(WORD) && relatedIds(mine).includes(NEAR) &&
      relatedIds(adminView).filter((id) => id === HIDDEN).length === 2,
    'the member’s task names no related task they may not open — not its title, not its description — and keeps the open one; the admin’s keeps all three',
    `the member's ${said(mine)} ${mine.text.includes(WORD) ? 'CARRIES the private task' : 'is clean'}, related ${JSON.stringify(relatedIds(mine).map((id) => (id === NEAR ? 'open' : id === HIDDEN ? 'PRIVATE' : id)))}; the admin's ${relatedIds(adminView).length}`,
  )
  chk(
    mine.data?.hiddenDependencies === 2 && (adminView.data?.hiddenDependencies ?? 0) === 0,
    'and says how many it left out: two for the member, none for the admin',
    `the member's count ${JSON.stringify(mine.data?.hiddenDependencies)}, the admin's ${JSON.stringify(adminView.data?.hiddenDependencies)}`,
  )

  // ══ 2. A WRITE THAT ANSWERS WITH THE TASK ════════════════════════════════
  console.log('\n▶ the member renames their task, and reads the answer')
  const renamed = await M(`/tasks/${MINE}`, { method: 'PATCH', body: { title: `${TAG} the member's task, renamed` } })
  chk(
    renamed.status === 200 && !renamed.text.includes(WORD) && relatedIds(renamed).includes(NEAR),
    'the answer to the member’s own edit names no related task they may not open either — the open one is there',
    `${said(renamed)} ${renamed.text.includes(WORD) ? 'CARRIES the private task' : 'clean'}`,
  )

  // ══ 3. THE BULK EDITOR ═══════════════════════════════════════════════════
  console.log('\n▶ the member assigns the admin to their task through the bulk editor, and reads the answer')
  const bulk = await M('/tasks/bulk/update', { method: 'PATCH', body: { taskIds: [MINE], patch: { assigneeIdsAdd: [adminId] } } })
  const bulkTask = bulk.data?.updated?.[0]
  chk(
    bulk.status === 200 && bulk.data?.updatedCount === 1 && !bulk.text.includes(WORD) && relatedIds({ data: bulkTask }).includes(NEAR),
    'the bulk editor’s answer names no related task the member may not open — the open one is there',
    `${said(bulk)} updated ${JSON.stringify(bulk.data?.updatedCount)}, failed ${JSON.stringify(bulk.data?.failed ?? null)}; ${bulk.text.includes(WORD) ? 'CARRIES the private task' : 'clean'}, related ${JSON.stringify(relatedIds({ data: bulkTask }).map((id) => (id === NEAR ? 'open' : id === HIDDEN ? 'PRIVATE' : id)))}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  if (WS && A) {
    const gone = await A(`/workspaces/${WS}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${WS} answered ${gone.status || 'nothing'}`)
  }
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}

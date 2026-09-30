/**
 * A CHANGE THAT BINDS ANOTHER TASK ASKS THAT TASK'S RULE: A TASK ONE MAY ONLY
 * READ IS NOT BLOCKED, NOR GIVEN A SUBTASK, FROM A TASK ONE MAY EDIT.
 *
 * NOT A FRAME ROW: `found-25-sep/read-only-tasks-blocked-and-parented`, found
 * closing `task-rows-changed-by-id-anywhere`. Measured on lane 3: a member
 * marked their own task as blocking the admin's task in a view-only space
 * (201) — the admin then could not close their own task (400, "blocked by
 * open dependencies") — moved their task under it as a subtask (200), and made
 * a new subtask under it (201).
 *
 * ClickUp (help centre, "Intro to Dependency Relationships", "Permissions in
 * detail", search snippets): creating a dependency takes edit permission; Full
 * edit creates tasks and subtasks. A task may still wait on one the person only
 * reads — that binds nobody else's task. What is made is read back by SQL.
 *
 *   node test/e2e/other-task-rules.mjs --api 3021
 */
import { signInApi, signUpApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 2

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
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `otr${stamp}`
let sql = null
let WS = null
let A = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — what is made is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const email = `${TAG}-member@rundesk.invalid`
  const signed = await signUpApi(API, { fullName: 'Other tasks', email, password: 'OtherTasks@12345!', organizationName: `Other ${stamp}`, organizationSlug: `other-${stamp}` })
  const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'member' } })
  if (!added.ok) throw new Error(`could not add the member: ${said(added)}`)
  const M = apiAs(signed.accessToken)

  const listIn = async (name, level) => {
    const space = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} ${name}`, ...(level ? { defaultPermission: level } : {}) } })
    const project = await A('/projects', { method: 'POST', body: { spaceId: space.data?.id, name: `${TAG} ${name}` } })
    const list = await A('/lists', { method: 'POST', body: { projectId: project.data?.id, name: `${TAG} ${name}` } })
    if (!list.ok || !list.data?.id) throw new Error(`could not make the ${name} list: ${said(space)} ${said(list)}`)
    return list.data.id
  }
  const FULL = await listIn('full edit')
  const VIEW = await listIn('view', 'view')
  const EDIT = await listIn('edit', 'edit')
  const task = async (as, listId, title) => {
    const t = await as('/tasks', { method: 'POST', body: { listId, title: `${TAG} ${title}` } })
    if (!t.ok || !t.data?.id) throw new Error(`could not make "${title}": ${said(t)}`)
    return t.data.id
  }
  const mine = await task(M, FULL, 'mine')
  const alsoMine = await task(M, FULL, 'also mine')
  const readOnly = await task(A, VIEW, 'read-only')
  const theirsAtFullEdit = await task(A, FULL, 'at full edit')
  const theirsAtEdit = await task(A, EDIT, 'at edit')
  const deps = async (a, b) => (await sql`select type from task_dependencies where (task_id = ${a} and related_task_id = ${b}) or (task_id = ${b} and related_task_id = ${a})`).map((r) => r.type)

  // ══ 1. BLOCKING ══════════════════════════════════════════════════════════
  console.log('\n▶ the member’s task, marked as blocking the admin’s read-only task — and as waiting on it')
  const blocks = await M(`/tasks/${mine}/dependencies`, { method: 'POST', body: { relatedTaskId: readOnly, type: 'blocks' } })
  const afterBlocks = await deps(mine, readOnly)
  const close = await A(`/tasks/${readOnly}`, { method: 'PATCH', body: { status: 'done' } })
  const waits = await M(`/tasks/${alsoMine}/dependencies`, { method: 'POST', body: { relatedTaskId: readOnly, type: 'blocked_by' } })
  const afterWaits = await deps(alsoMine, readOnly)
  chk(
    blocks.status === 403 && afterBlocks.length === 0 && close.ok && waits.ok && afterWaits.includes('blocked_by'),
    'a member blocks no task they may only read — refused (403), none made, and its owner closes it — while their own task may wait on it',
    `blocks ${said(blocks)} (${JSON.stringify(afterBlocks)}); the admin closes theirs ${said(close)}; waits on it ${said(waits)} (${JSON.stringify(afterWaits)})`,
  )

  // ══ 2. PARENTING ═════════════════════════════════════════════════════════
  console.log('\n▶ subtasks under the admin’s read-only task, and under one at Full edit')
  const newUnderRead = await M('/tasks', { method: 'POST', body: { listId: FULL, title: `${TAG} new under read-only`, parentTaskId: readOnly } })
  const [madeUnderRead] = await sql`select count(*)::int as n from tasks where parent_task_id = ${readOnly}`
  const moveUnderRead = await M(`/tasks/${mine}`, { method: 'PATCH', body: { parentTaskId: readOnly } })
  const [mineNow] = await sql`select parent_task_id from tasks where id = ${mine}`
  // At Edit the member changes the admin's task, and adds no subtask to it: that is Full edit's.
  const newUnderEdit = await M('/tasks', { method: 'POST', body: { listId: FULL, title: `${TAG} new under edit`, parentTaskId: theirsAtEdit } })
  const [madeUnderEdit] = await sql`select count(*)::int as n from tasks where parent_task_id = ${theirsAtEdit}`
  const newUnderFull = await M('/tasks', { method: 'POST', body: { listId: FULL, title: `${TAG} new under full edit`, parentTaskId: theirsAtFullEdit } })
  const moveUnderFull = await M(`/tasks/${alsoMine}`, { method: 'PATCH', body: { parentTaskId: theirsAtFullEdit } })
  const [madeUnderFull] = await sql`select count(*)::int as n from tasks where parent_task_id = ${theirsAtFullEdit}`
  chk(
    newUnderRead.status === 403 && madeUnderRead.n === 0 && moveUnderRead.status === 403 && mineNow?.parent_task_id === null
      && newUnderEdit.status === 403 && madeUnderEdit.n === 0
      && newUnderFull.ok && moveUnderFull.ok && madeUnderFull.n === 2,
    'a member hangs no subtask under a task they may only read — neither a new one nor their own task moved there (403 each, nothing under it) — nor under one they may only Edit, and under one at Full edit they do both',
    `under the read-only task: new ${said(newUnderRead)}, moved ${said(moveUnderRead)}, ${madeUnderRead.n} under it; under Edit: new ${said(newUnderEdit)}, ${madeUnderEdit.n} under it; under Full edit: new ${said(newUnderFull)}, moved ${said(moveUnderFull)}, ${madeUnderFull.n} under it`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
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

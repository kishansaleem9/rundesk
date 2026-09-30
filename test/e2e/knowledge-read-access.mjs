/**
 * THE AI'S KNOWLEDGE ANSWER CITES ONLY WHAT ITS ASKER MAY OPEN.
 *
 * NOT A FRAME ROW: `found-24-sep/ai-knowledge-filter-copies-the-container-rule`.
 * The answer's sources pass `filterAccessibleHits`, which stated the container
 * rule in its own words — a private space, a private project — and stopped
 * there. Measured on lane 1 before the fix, with the workspace reindexed (the
 * local embedder needs no provider): a member refused a private list, and a
 * private task, asked about them and was cited the private list's task and a
 * comment on the private task.
 *
 * No model is needed: without one the answer is the deterministic one, made
 * of its sources, which are what this reads.
 *
 *   node test/e2e/knowledge-read-access.mjs --api 3021
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

/* NEVER THROWS — `{status, data, error, text}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `kra-${stamp}`
const WORD = `okapi${stamp}`
let sql = null
let WS = null
let A = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the private task is made private by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const adminId = (await A('/users/me')).data?.id
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const email = `${TAG}-member@rundesk.invalid`
  const signed = await signUpApi(API, {
    fullName: 'Knowledge member', email, password: 'Member@12345!',
    organizationName: `Knowledge ${stamp}`, organizationSlug: `knowledge-${stamp}`,
  })
  const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'member' } })
  if (!added.ok) throw new Error(`could not add the member: ${said(added)}`)
  const M = apiAs(signed.accessToken)

  const make = async (route, body, what) => {
    const res = await A(route, { method: 'POST', body })
    if (!res.ok || !res.data?.id) throw new Error(`could not make ${what}: ${said(res)}`)
    return res.data.id
  }
  const space = await make('/spaces', { workspaceId: WS, name: `${TAG} open` }, 'the open space')
  const project = await make('/projects', { spaceId: space, name: `${TAG} open` }, 'the open project')
  const privateList = await make('/lists', { projectId: project, name: `${WORD} private list`, visibility: 'private' }, 'the private list')
  const openList = await make('/lists', { projectId: project, name: `${TAG} open list` }, 'the open list')
  await make('/tasks', { listId: privateList, title: `${WORD} quokka plan in a private list` }, 'the private list’s task')
  const privateTask = await make('/tasks', { listId: openList, title: `${TAG} a task made private` }, 'the task made private')
  await sql`update tasks set visibility = 'private', created_by_id = ${adminId} where id = ${privateTask}`
  const comment = await A(`/tasks/${privateTask}/comments`, { method: 'POST', body: { body: `${WORD} quokka secret, said on a private task` } })
  if (!comment.ok) throw new Error(`could not comment on the private task: ${said(comment)}`)
  await make('/tasks', { listId: openList, title: `${TAG} quokka open task` }, 'the open task')
  const gates = await Promise.all([M(`/tasks/list/${privateList}`), M(`/tasks/${privateTask}`)])
  // Refused as ids that name nothing are (404, `found-30-sep/private-task-reads-say-403`).
  if (!gates.every((g) => g.status === 404)) throw new Error(`the member was not refused the private list and task (${gates.map((g) => g.status).join(', ')})`)
  const reindexed = await A(`/workspaces/${WS}/knowledge/reindex`, { method: 'POST' })
  if (!reindexed.ok) throw new Error(`could not reindex: ${said(reindexed)}`)

  const ask = (C) => C('/ai/knowledge', { method: 'POST', body: { workspaceId: WS, question: 'quokka' } })
  const mine = await ask(M)
  const theirs = await ask(A)
  const cites = (res, text) => JSON.stringify(res.data?.sources ?? []).includes(text) || (res.data?.answer ?? '').includes(text)
  const openCited = (res) => JSON.stringify(res.data?.sources ?? []).includes(`${TAG} quokka open task`)

  // ══ 1. A PRIVATE LIST ════════════════════════════════════════════════════
  console.log('\n▶ a private list in an open space')
  chk(
    mine.ok && !cites(mine, `${WORD} quokka plan`) && openCited(mine) && cites(theirs, `${WORD} quokka plan`),
    'a member’s knowledge answer cites no task of a private list they are refused, and cites the open one — the admin’s cites it',
    `the member's ${said(mine)} ${cites(mine, `${WORD} quokka plan`) ? 'CITES the private list’s task' : 'is clean'}, the open task ${openCited(mine) ? 'cited' : 'NOT cited'}; the admin's cites it: ${cites(theirs, `${WORD} quokka plan`)}`,
  )

  // ══ 2. A PRIVATE TASK'S COMMENT ══════════════════════════════════════════
  console.log('\n▶ a comment on a private task')
  const commentCited = (res) => (res.data?.sources ?? []).some((s) => String(s.id ?? '').includes(comment.data?.id ?? '§') || JSON.stringify(s).includes(`${WORD} quokka secret`))
  chk(
    !commentCited(mine) && !(mine.data?.answer ?? '').includes(`${WORD} quokka secret`) && commentCited(theirs),
    'nor a comment on a private task they may not open — the admin’s cites it',
    `the member's cites it: ${commentCited(mine)}; the admin's: ${commentCited(theirs)} (sources ${JSON.stringify((mine.data?.sources ?? []).map((s) => s.title)).slice(0, 160)})`,
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

/**
 * THE AI'S SUGGESTIONS AND COUNTS ARE MADE FROM WHAT THEIR ASKER MAY OPEN.
 *
 * NOT A FRAME ROW: `found-24-sep/ai-suggestions-read-the-whole-workspace`,
 * the audit's "AI suggest-tasks and workload-balance", and
 * `found-24-sep/reach-skipped-private-lists`, found beside it. Measured on lane
 * 1 before the fix, as a member refused a private space and a private list:
 *   - "suggest tasks" handed the member the private space's six task titles
 *     word for word, and its project's name in the "learned from" line; and a
 *     project named by id was read whatever it was;
 *   - "workload balance" gave the member exactly the admin's answer: counts of
 *     the private tasks, and two of their ids to move;
 *   - "Assign with AI" counted each colleague's load across the workspace;
 *   - and the rule the reports were fixed with stopped at the space and the
 *     project: the overview counted a private list's tasks, and the activity
 *     feed named them.
 *
 * None of these needs a model: each has a deterministic answer, which is what
 * a server with no model gives and what is checked here. Every "is not there"
 * sits beside the admin's answer, where it is.
 *
 *   node test/e2e/ai-read-access.mjs --api 3021
 */
import { signInApi, signUpApi } from './lib/signin.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 5

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

/* NEVER THROWS — `{status, data, error, text}`. Every call site reads `status`. */
const apiAs = (token) => async (route, init = {}) => {
  const headers = token ? { authorization: `Bearer ${token}` } : {}
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, { ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined })
    .catch(() => null)
  if (!res) return { status: 0, data: null, error: { message: 'no answer' }, text: '' }
  const text = await res.text().catch(() => '')
  let json = null
  try { json = JSON.parse(text) } catch {}
  return { status: res.status, data: json?.data, error: json?.error, text }
}
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `ars-${stamp}`
const WORD = `okapi${stamp}`
let WS = null
let A = null

try {
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const adminId = (await A('/users/me')).data?.id
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const email = `${TAG}-member@rundesk.invalid`
  const signed = await signUpApi(API, {
    fullName: 'AI reader', email, password: 'Member@12345!',
    organizationName: `AI reader ${stamp}`, organizationSlug: `ai-reader-${stamp}`,
  })
  const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'member' } })
  if (added.status >= 300) throw new Error(`could not add the member: ${said(added)}`)
  const M = apiAs(signed.accessToken)
  const memberId = signed.user?.id

  const make = async (route, body, what) => {
    const res = await A(route, { method: 'POST', body })
    if (res.status >= 300 || !res.data?.id) throw new Error(`could not make ${what}: ${said(res)}`)
    return res.data.id
  }
  const day = 24 * 60 * 60 * 1000
  const yesterday = new Date(Date.now() - day).toISOString()
  const tomorrow = new Date(Date.now() + day).toISOString()
  // The private space: a project named like the one being planned, six overdue
  // steps, all the admin's.
  const PS = await make('/spaces', { workspaceId: WS, name: `${WORD} private space`, visibility: 'private' }, 'the private space')
  const PP = await make('/projects', { spaceId: PS, name: `Website launch ${WORD}` }, 'the private project')
  const PSL = await make('/lists', { projectId: PP, name: `${WORD} list` }, 'the private space’s list')
  for (let i = 0; i < 6; i++) await make('/tasks', { listId: PSL, title: `${WORD} secret step ${i}`, assigneeIds: [adminId], dueDate: yesterday }, 'a private step')
  // The open space: the member's own project, with a PRIVATE list of the admin's in it.
  const OS = await make('/spaces', { workspaceId: WS, name: `${TAG} open space` }, 'the open space')
  const OP = await make('/projects', { spaceId: OS, name: 'Website launch' }, 'the open project')
  // And a second open project, named like nothing here, with a task of its own
  // (the basis names only projects that have tasks). With one candidate there is
  // nothing to rank, so a private project's name leaking into the plan changed
  // nothing and `ars-3` measured nothing (green twice); with two, a leaked
  // "Website launch …" keeps only the project it matches, where naming none keeps
  // both. Unassigned, so no one's load changes; the overview counts it.
  const SHED = await make('/projects', { spaceId: OS, name: `Garden shed ${TAG}` }, 'the second open project')
  const SHEDL = await make('/lists', { projectId: SHED, name: `${TAG} shed list` }, 'the second project’s list')
  await make('/tasks', { listId: SHEDL, title: `${TAG} shed step` }, 'the second project’s task')
  const OL = await make('/lists', { projectId: OP, name: `${TAG} open list` }, 'the open list')
  const PL = await make('/lists', { projectId: OP, name: `${WORD} private list`, visibility: 'private' }, 'the private list')
  for (let i = 0; i < 3; i++) await make('/tasks', { listId: PL, title: `${WORD} private-list task ${i}`, assigneeIds: [adminId], dueDate: tomorrow }, 'a private-list task')
  await make('/tasks', { listId: OL, title: `${TAG} open step`, assigneeIds: [memberId], dueDate: tomorrow }, 'the member’s task')
  const TARGET = await make('/tasks', { listId: OL, title: `${TAG} who should take this` }, 'the task to assign')
  const gates = await Promise.all([M(`/tasks/list/${PSL}`), M(`/tasks/list/${PL}`)])
  if (!gates.every((g) => g.status === 403)) {
    throw new Error(`the member was not refused the private space's list and the private list (${gates.map((g) => g.status).join(', ')}), so nothing here would mean anything`)
  }
  const privateIds = [
    ...((await A(`/tasks/list/${PSL}`)).data ?? []).map((t) => t.id),
    ...((await A(`/tasks/list/${PL}`)).data ?? []).map((t) => t.id),
  ]
  if (privateIds.length !== 9) throw new Error(`expected nine private tasks, found ${privateIds.length}`)

  // ══ 1. SUGGEST TASKS ═════════════════════════════════════════════════════
  console.log('\n▶ "suggest tasks" for a project like the private one')
  const suggest = (C, body) => C('/ai/suggest-tasks', { method: 'POST', body: { workspaceId: WS, ...body } })
  const mSug = await suggest(M, { projectName: 'Website launch' })
  const aSug = await suggest(A, { projectName: 'Website launch' })
  chk(
    mSug.status < 300 && Array.isArray(mSug.data?.suggestions) && !mSug.text.includes(WORD) &&
      aSug.text.includes(`${WORD} secret step`) && aSug.text.includes(`${WORD} private-list task`),
    'a member’s suggestions carry no title or name from a space or a list they are refused — the admin’s carry both',
    `the member's ${said(mSug)} ${mSug.text.includes(WORD) ? 'CARRIES them' : 'is clean'} (basis: ${JSON.stringify(mSug.data?.basis)}); the admin's carries the steps: ${aSug.text.includes(`${WORD} secret step`)}, the list's: ${aSug.text.includes(`${WORD} private-list task`)}`,
  )
  // The project a caller names by id is only a name to plan by — so one the
  // caller may not open must be no name at all: the same answer as naming none.
  const byNothing = await suggest(M, {})
  const byPrivateId = await suggest(M, { projectId: PP })
  const byOpenId = await suggest(M, { projectId: OP })
  const same = (x, y) => JSON.stringify(x.data) === JSON.stringify(y.data)
  chk(
    byPrivateId.status < 300 && same(byPrivateId, byNothing) && byOpenId.status < 300 && !same(byOpenId, byNothing),
    'a project the member may not open, named by id, is planned as no project at all — the open one, named by id, is planned by its name',
    `naming the private project answered as naming none: ${same(byPrivateId, byNothing)} (${JSON.stringify(byPrivateId.data?.basis)} vs ${JSON.stringify(byNothing.data?.basis)}); naming the open one differed: ${!same(byOpenId, byNothing)}`,
  )

  // ══ 2. WORKLOAD ══════════════════════════════════════════════════════════
  console.log('\n▶ "workload balance"')
  const load = (res, who) => res.data?.loads?.find((l) => l.userId === who)?.open
  const mBal = await M('/ai/workload-balance', { method: 'POST', body: { workspaceId: WS } })
  const aBal = await A('/ai/workload-balance', { method: 'POST', body: { workspaceId: WS } })
  const leakedIds = privateIds.filter((id) => mBal.text.includes(id))
  chk(
    mBal.status < 300 && load(mBal, adminId) === 0 && load(mBal, memberId) === 1 && leakedIds.length === 0 &&
      load(aBal, adminId) === 9 && load(aBal, memberId) === 1,
    'workload balance counts, for a member, only tasks they may open, and hands out no id of another — the admin’s counts all nine',
    `the member's ${said(mBal)} counts the admin at ${load(mBal, adminId)} and holds ${leakedIds.length} private id(s); the admin's counts the admin at ${load(aBal, adminId)}`,
  )

  // ══ 3. ASSIGN WITH AI ════════════════════════════════════════════════════
  console.log('\n▶ "Assign with AI", on a task both can open')
  const candidate = (res, who) => res.data?.ranked?.find((c) => c.userId === who)
  const mPick = await M(`/ai/assignee-suggestion?taskId=${TARGET}`)
  const aPick = await A(`/ai/assignee-suggestion?taskId=${TARGET}`)
  const mAdmin = candidate(mPick, adminId)
  const aAdmin = candidate(aPick, adminId)
  chk(
    mPick.status < 300 && mAdmin && mAdmin.openTasks === 0 && mAdmin.overdue === 0 &&
      aAdmin && aAdmin.openTasks === 9 && aAdmin.overdue === 6,
    'Assign with AI, asked by a member, counts a colleague’s open and overdue work as the member may see it — asked by the admin, it counts all of it',
    `the member sees the admin at ${JSON.stringify(mAdmin ? { open: mAdmin.openTasks, overdue: mAdmin.overdue } : mPick.data ?? said(mPick))}; the admin at ${JSON.stringify(aAdmin ? { open: aAdmin.openTasks, overdue: aAdmin.overdue } : aPick.data ?? said(aPick))}`,
  )

  // ══ 4. A PRIVATE LIST IN THE REPORTS ═════════════════════════════════════
  console.log('\n▶ the reports, and a private list in an open space')
  const [mOver, aOver, mAct, aAct] = await Promise.all([
    M(`/workspaces/${WS}/reports/overview`), A(`/workspaces/${WS}/reports/overview`),
    M(`/workspaces/${WS}/reports/activity`), A(`/workspaces/${WS}/reports/activity`),
  ])
  chk(
    mOver.data?.total === 3 && aOver.data?.total === 12 && !mAct.text.includes(`${WORD} private-list task`) && aAct.text.includes(`${WORD} private-list task`),
    'a member’s overview counts none of a private list’s tasks and their activity feed names none — the admin’s count and name them',
    `the overview: the member ${mOver.data?.total}, the admin ${aOver.data?.total}; the member's feed names them: ${mAct.text.includes(`${WORD} private-list task`)}, the admin's: ${aAct.text.includes(`${WORD} private-list task`)}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  if (WS && A) await A(`/workspaces/${WS}`, { method: 'DELETE' }).catch(() => {})
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}

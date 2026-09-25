/**
 * A GUEST CHANGES ONLY WHAT IS SHARED WITH THEM, AT THE LEVEL IT WAS SHARED AT.
 *
 * NOT A FRAME ROW: `found-24-sep/guest-makes-lists-where-nothing-is-shared`.
 * A space's level for somebody with no grant on it is the space's DEFAULT —
 * the members' — and the create gate, the comment gate and the Move picker
 * read it for a guest too. Measured on lane 2: a guest with nothing shared
 * made a list in an open space (201). Docs already refused to count the
 * default for a guest.
 *
 * ClickUp's rule (help.clickup.com "Use ClickUp as a guest or limited
 * member", "Permissions in detail", search snippets): a guest sees and changes
 * only what is shared with them, at the level it was shared at. Writes are
 * asked here; what a guest READS is `guest-read-scope`'s. Each refusal is read
 * back by SQL beside a member doing the same, and beside the guest doing it
 * where a grant allows. Lists, tasks and grants are planted by SQL. Making
 * anything takes Full edit, so the grants that let a guest make one are Full
 * edit (`found-25-sep/full-edit-enforced-nowhere`).
 *
 *   node test/e2e/guest-space-level.mjs --api 3021
 */
import { signInApi, signUpApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'

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

/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`. */
const apiAs = (token) => async (route, init = {}) => {
  const headers = token ? { authorization: `Bearer ${token}` } : {}
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, { ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined })
    .catch(() => null)
  if (!res) return { status: 0, data: null, error: { message: 'no answer' } }
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `gsl-${stamp}`
let sql = null
let WS = null
let A = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — lists, tasks and grants are planted and read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const adminId = (await A('/users/me')).data?.id
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const person = async (who, role) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const signed = await signUpApi(API, {
      fullName: `Level ${who}`, email, password: 'Member@12345!',
      organizationName: `Level ${who} ${stamp}`, organizationSlug: `level-${who}-${stamp}`,
    })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (added.status >= 300) throw new Error(`could not add the ${who}: ${said(added)}`)
    return { id: signed.user?.id, as: apiAs(signed.accessToken) }
  }
  const member = await person('member', 'member')
  const guest = await person('guest', 'guest')
  const M = member.as
  const G = guest.as

  // Three open spaces, each on the default, Full edit: one shared with nobody,
  // one shared with the guest with Full edit, one to comment. A project and a
  // list in each, and a task in each list.
  const space = async (name) => {
    const res = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} ${name}` } })
    if (res.status >= 300 || !res.data?.id) throw new Error(`could not make the ${name} space: ${said(res)}`)
    const project = await A('/projects', { method: 'POST', body: { spaceId: res.data.id, name: `${TAG} ${name} project` } })
    if (project.status >= 300 || !project.data?.id) throw new Error(`could not make the ${name} project: ${said(project)}`)
    const [list] = await sql`insert into lists (project_id, name) values (${project.data.id}, ${`${TAG} ${name} list`}) returning id`
    const [task] = await sql`insert into tasks (list_id, title, created_by_id) values (${list.id}, ${`${TAG} ${name} task`}, ${adminId}) returning id`
    return { id: res.data.id, project: project.data.id, list: list.id, task: task.id }
  }
  const OPEN = await space('open')
  const EDIT = await space('shared with full edit')
  const COMMENT = await space('shared to comment')
  await sql`insert into space_members (space_id, user_id, role) values (${EDIT.id}, ${guest.id}, 'admin'), (${COMMENT.id}, ${guest.id}, 'comment')`
  const listsNamed = async (name) => (await sql`select count(*)::int as n from lists where name = ${name}`)[0].n
  const commentsSaying = async (body) => (await sql`select count(*)::int as n from task_comments where body = ${body}`)[0].n

  // ══ 1. MAKING A LIST ═════════════════════════════════════════════════════
  console.log('\n▶ a list, in the open space, by the guest and by the member; and by the guest where the space is shared with Full edit')
  const gList = await G('/lists', { method: 'POST', body: { projectId: OPEN.project, name: `${TAG} the guest's list` } })
  const mList = await M('/lists', { method: 'POST', body: { projectId: OPEN.project, name: `${TAG} the member's list` } })
  const gShared = await G('/lists', { method: 'POST', body: { projectId: EDIT.project, name: `${TAG} the guest's list where shared` } })
  const [gN, mN, gSharedN] = [
    await listsNamed(`${TAG} the guest's list`),
    await listsNamed(`${TAG} the member's list`),
    await listsNamed(`${TAG} the guest's list where shared`),
  ]
  chk(
    gList.status === 403 && gN === 0 && mList.status === 201 && mN === 1 && gShared.status === 201 && gSharedN === 1,
    'a guest makes no list in an open space not shared with them (403, none made) — a member does, and so does the guest where the space is shared with them with Full edit',
    `the guest ${said(gList)}, lists made ${gN}; the member ${said(mList)}, ${mN}; the guest where shared ${said(gShared)}, ${gSharedN}`,
  )

  // ══ 2. COMMENTING ════════════════════════════════════════════════════════
  console.log('\n▶ a comment, on the open space’s task, by the guest and by the member; and by the guest where the space is shared to comment')
  const say = (C, taskId, body) => C(`/tasks/${taskId}/comments`, { method: 'POST', body: { body } })
  const gSay = await say(G, OPEN.task, `${TAG} the guest says`)
  const mSay = await say(M, OPEN.task, `${TAG} the member says`)
  const gSharedSay = await say(G, COMMENT.task, `${TAG} the guest says where shared`)
  const [gC, mC, gSharedC] = [
    await commentsSaying(`${TAG} the guest says`),
    await commentsSaying(`${TAG} the member says`),
    await commentsSaying(`${TAG} the guest says where shared`),
  ]
  chk(
    gSay.status === 403 && gC === 0 && mSay.status === 201 && mC === 1 && gSharedSay.status === 201 && gSharedC === 1,
    'a guest comments on no task of an open space not shared with them (403, none written) — a member does, and so does the guest where the space is shared with them to comment',
    `the guest ${said(gSay)}, written ${gC}; the member ${said(mSay)}, ${mC}; the guest where shared ${said(gSharedSay)}, ${gSharedC}`,
  )

  // ══ 3. THE MOVE PICKER ═══════════════════════════════════════════════════
  console.log('\n▶ where the Move picker offers to move things to')
  const targets = async (C) => {
    const res = await C(`/spaces/workspace/${WS}/move-targets`)
    return { status: res.status, ids: (Array.isArray(res.data) ? res.data : []).map((s) => s.id) }
  }
  const gTargets = await targets(G)
  const mTargets = await targets(M)
  chk(
    gTargets.status === 200 && gTargets.ids.includes(EDIT.id) && !gTargets.ids.includes(OPEN.id) && !gTargets.ids.includes(COMMENT.id)
      && mTargets.status === 200 && mTargets.ids.includes(OPEN.id),
    'the Move picker offers a guest only the space shared with them with Full edit — a member, the open space',
    `the guest ${gTargets.status}: open ${gTargets.ids.includes(OPEN.id)}, shared with full edit ${gTargets.ids.includes(EDIT.id)}, shared to comment ${gTargets.ids.includes(COMMENT.id)}; the member ${mTargets.status}: open ${mTargets.ids.includes(OPEN.id)}`,
  )

  // ══ 4. AN ITEM SHARED, NOT ITS SPACE ═════════════════════════════════════
  console.log('\n▶ in the open space, a task shared with the guest to comment, a list likewise, and a project with Full edit')
  const [sharedTask] = await sql`insert into tasks (list_id, title, created_by_id) values (${OPEN.list}, ${`${TAG} a task shared with the guest`}, ${adminId}) returning id`
  const [sharedList] = await sql`insert into lists (project_id, name) values (${OPEN.project}, ${`${TAG} a list shared with the guest`}) returning id`
  const [inSharedList] = await sql`insert into tasks (list_id, title, created_by_id) values (${sharedList.id}, ${`${TAG} a task of the shared list`}, ${adminId}) returning id`
  const [sharedProject] = await sql`insert into projects (space_id, name) values (${OPEN.id}, ${`${TAG} a project shared with the guest`}) returning id`
  await sql`insert into object_shares (workspace_id, object_type, object_id, user_id, level) values
    (${WS}, 'task', ${sharedTask.id}, ${guest.id}, 'comment'),
    (${WS}, 'list', ${sharedList.id}, ${guest.id}, 'comment'),
    (${WS}, 'project', ${sharedProject.id}, ${guest.id}, 'admin')`
  const onTask = await say(G, sharedTask.id, `${TAG} the guest says on the shared task`)
  const onList = await say(G, inSharedList.id, `${TAG} the guest says in the shared list`)
  const inProject = await G('/lists', { method: 'POST', body: { projectId: sharedProject.id, name: `${TAG} the guest's list in the shared project` } })
  const beside = await say(G, OPEN.task, `${TAG} the guest says beside them`)
  const [onTaskC, onListC, inProjectN, besideC] = [
    await commentsSaying(`${TAG} the guest says on the shared task`),
    await commentsSaying(`${TAG} the guest says in the shared list`),
    await listsNamed(`${TAG} the guest's list in the shared project`),
    await commentsSaying(`${TAG} the guest says beside them`),
  ]
  chk(
    onTask.status === 201 && onTaskC === 1 && onList.status === 201 && onListC === 1 && inProject.status === 201 && inProjectN === 1
      && beside.status === 403 && besideC === 0,
    'where only an item is shared with a guest, its level is theirs there — they comment on the shared task and in the shared list, and make a list in the shared project — and not on the task beside them',
    `the shared task ${said(onTask)}, ${onTaskC}; the shared list's task ${said(onList)}, ${onListC}; a list in the shared project ${said(inProject)}, ${inProjectN}; the task beside them ${said(beside)}, ${besideC}`,
  )

  // ══ 5. PASSING THROUGH ═══════════════════════════════════════════════════
  // The open space holds a list shared with the guest now, so its project is on
  // the way to it: the guest reaches the project, and nothing grants them it.
  console.log('\n▶ the open space, which the guest now passes through to the list shared with them')
  const through = await G('/lists', { method: 'POST', body: { projectId: OPEN.project, name: `${TAG} the guest's list passing through` } })
  const throughN = await listsNamed(`${TAG} the guest's list passing through`)
  const gTargets2 = await targets(G)
  chk(
    through.status === 403 && throughN === 0 && gTargets2.status === 200 && !gTargets2.ids.includes(OPEN.id) && gTargets2.ids.includes(EDIT.id),
    'a guest who only passes through a space — a list in it shared with them — makes no list beside it, and the Move picker does not offer them the space',
    `a list beside the shared one ${said(through)}, made ${throughN}; the picker ${gTargets2.status}: the open space ${gTargets2.ids.includes(OPEN.id)}, the space shared with full edit ${gTargets2.ids.includes(EDIT.id)}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  if (WS && A) await A(`/workspaces/${WS}`, { method: 'DELETE' }).catch(() => {})
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}

/**
 * WHAT A READER MAY NOT OPEN IS REFUSED, 403, IN THE WORDS OF WHAT STANDS IN
 * FRONT OF IT; AN ID THAT NAMES NOTHING IS 404.
 *
 * NOT A FRAME ROW: `found-30-sep/private-task-reads-say-403`. On 30 September
 * every refusal of a task, list, project or space the caller may not open was
 * made to answer as an id naming nothing (404, "Resource not found"). The owner
 * decided on 1 October that it goes back to how it was: the resource guard
 * refuses a member a private task with 403 "This task is private", a task or
 * list in a private list with "This list is private", anything in a private
 * space with "This space or project is private", a guest with "This is not
 * shared with you", and a user of another organisation with "You are not a
 * member of this workspace" — and an id that names nothing is 404. The task
 * sheet's Request access card is drawn on that 403 (`request-access`).
 *
 * The paths that refused in their own words before follow it again: a
 * dependency on a private task is "This task is private", Draft a reply "You do
 * not have access to this task", managing the portals of a project in a private
 * space "This space or project is private".
 *
 * WHAT STAYED from that change: a member moving their own task into another
 * member's PRIVATE LIST in an open space was taken (201) — the move asked the
 * container rule and not the private-list rule — and the task went where its
 * mover could no longer open it. That move is refused, as the guard refuses the
 * list: 403 "This list is private", and the task stays.
 *
 * Every refusal is read beside the same ask of an id naming nothing, which must
 * stay 404 and in other words; and every refusal has somebody for whom the
 * thing is there (section 11).
 *
 * WRITES AND DOCS TOO, 8 October: the rule named reads, and a change or move of
 * a task its caller may not open was 404 "Task not found", a doc they may not
 * open 404 "Doc not found", each as an id naming nothing
 * (`found-6-oct/task-writes-answer-a-refusal-as-not-found`,
 * `found-6-oct/doc-refusals-answer-not-found`). They are refused in the read's
 * words now (sections 13 and 14). And a platform super_admin, whom the guard
 * lets read every workspace, makes no task where they are no member, imports
 * none, and changes none there (`found-6-oct/super-admin-outside-makes-what-it-cannot-change`,
 * section 15).
 *
 *   node test/e2e/refused-as-forbidden.mjs --api 3021
 */
import { signInApi, signUpApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt, must } from './lib/fixture.mjs'
import { waitUntil } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 15

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

/* NEVER THROWS — `{status, ok, data, message}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.message ?? null)}`
/**
 * The refusal is 403 in the words given, and the same ask of an id naming
 * nothing is a 404 that says something else. A 0 (nothing answered) is neither.
 */
const refusedSaying = (refused, words, miss) =>
  refused.status === 403 && refused.message === words && miss.status === 404 && miss.message !== '' && miss.message !== refused.message
const pairSaid = (refused, miss) => `refused ${said(refused)}, nothing ${said(miss)}`

const stamp = Date.now()
const TAG = `raf${stamp}`
const NONE = '00000000-0000-4000-8000-0000000000aa'
let sql = null
let WS = null
let A = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — what a refusal leaves behind is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  WS = must(await A('/workspaces', { method: 'POST', body: { name: TAG } }), 'make the workspace').id
  const person = async (who, role) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const signed = await signUpApi(API, {
      fullName: `Refused ${who}`, email, password: 'Member@12345!',
      organizationName: `Refused ${who} ${stamp}`, organizationSlug: `refused-${who}-${stamp}`,
    })
    if (role) must(await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } }), `add the ${who}`)
    return { id: signed.user?.id, as: apiAs(signed.accessToken) }
  }
  const member = await person('member', 'member')
  const guest = await person('guest', 'guest')
  const stranger = await person('stranger', null)
  const M = member.as
  const G = guest.as
  const S = stranger.as
  const make = async (route, body, what) => must(await A(route, { method: 'POST', body }), `make ${what}`).id

  // The open space, its project and list, a task in it; a private list beside
  // it with a task; a private task in the open list, the admin's, unassigned.
  const OS = await make('/spaces', { workspaceId: WS, name: `${TAG} open` }, 'the open space')
  const OP = await make('/projects', { spaceId: OS, name: `${TAG} open project` }, 'the open project')
  const OL = await make('/lists', { projectId: OP, name: `${TAG} open list` }, 'the open list')
  const OT = await make('/tasks', { listId: OL, title: `${TAG} open task` }, 'the open task')
  const PL = await make('/lists', { projectId: OP, name: `${TAG} private list`, visibility: 'private' }, 'the private list')
  const PLT = await make('/tasks', { listId: PL, title: `${TAG} in the private list` }, 'the private list’s task')
  const PT = await make('/tasks', { listId: OL, title: `${TAG} private task` }, 'the task to make private')
  must(await A(`/tasks/${PT}`, { method: 'PATCH', body: { visibility: 'private' } }), 'make the task private')
  // A private space, its project, list and task.
  const PS = await make('/spaces', { workspaceId: WS, name: `${TAG} private space`, visibility: 'private' }, 'the private space')
  const PSP = await make('/projects', { spaceId: PS, name: `${TAG} private space project` }, 'the private space’s project')
  const PSL = await make('/lists', { projectId: PSP, name: `${TAG} private space list` }, 'the private space’s list')
  const PST = await make('/tasks', { listId: PSL, title: `${TAG} in the private space` }, 'the private space’s task')
  // A view-only space: a task the member reads and may not change.
  const VS = await make('/spaces', { workspaceId: WS, name: `${TAG} view only`, defaultPermission: 'view' }, 'the view-only space')
  const VP = await make('/projects', { spaceId: VS, name: `${TAG} view project` }, 'the view-only project')
  const VL = await make('/lists', { projectId: VP, name: `${TAG} view list` }, 'the view-only list')
  const VT = await make('/tasks', { listId: VL, title: `${TAG} view task` }, 'the view-only task')
  // The member's own task, to point from and to move.
  const MINE = must(await M('/tasks', { method: 'POST', body: { listId: OL, title: `${TAG} the member's own` } }), 'make the member’s task').id
  // The admin's portal on the private space's project.
  const PORTAL = must(await A(`/projects/${PSP}/portal`, { method: 'POST', body: {} }), 'make the admin’s portal').id

  // ══ 1. A PRIVATE TASK ════════════════════════════════════════════════════
  console.log('\n▶ a private task, read by a member it refuses')
  const t1 = await M(`/tasks/${PT}`)
  const t0 = await M(`/tasks/${NONE}`)
  chk(
    refusedSaying(t1, 'This task is private', t0),
    'a member refused a private task is told 403 “This task is private” — and an id naming nothing is 404',
    pairSaid(t1, t0),
  )

  // ══ 2. A PRIVATE LIST ════════════════════════════════════════════════════
  console.log('\n▶ a private list, and a task in it')
  const l1 = await M(`/lists/${PL}`)
  const l0 = await M(`/lists/${NONE}`)
  const lt1 = await M(`/tasks/${PLT}`)
  const lTasks = await M(`/tasks/list/${PL}`)
  const lTasks0 = await M(`/tasks/list/${NONE}`)
  chk(
    refusedSaying(l1, 'This list is private', l0) && refusedSaying(lt1, 'This list is private', t0) && refusedSaying(lTasks, 'This list is private', lTasks0),
    'a member refused a private list is told 403 “This list is private” for it, its task and its tasks’ listing — and ids naming nothing are 404',
    `the list: ${pairSaid(l1, l0)}; its task: ${pairSaid(lt1, t0)}; its tasks: ${pairSaid(lTasks, lTasks0)}`,
  )

  // ══ 3. A PRIVATE SPACE ═══════════════════════════════════════════════════
  console.log('\n▶ a private space, its project, list and task')
  const s1 = await M(`/spaces/${PS}`)
  const s0 = await M(`/spaces/${NONE}`)
  const p1 = await M(`/projects/${PSP}`)
  const p0 = await M(`/projects/${NONE}`)
  const sl1 = await M(`/lists/${PSL}`)
  const st1 = await M(`/tasks/${PST}`)
  const SAYS = 'This space or project is private'
  chk(
    refusedSaying(s1, SAYS, s0) && refusedSaying(p1, SAYS, p0) && refusedSaying(sl1, SAYS, l0) && refusedSaying(st1, SAYS, t0),
    'a member refused a private space is told 403 “This space or project is private” for it and its project, list and task — and ids naming nothing are 404',
    `space: ${pairSaid(s1, s0)}; project: ${pairSaid(p1, p0)}; list: ${pairSaid(sl1, l0)}; task: ${pairSaid(st1, t0)}`,
  )

  // ══ 4. A GUEST ═══════════════════════════════════════════════════════════
  console.log('\n▶ a guest, with nothing shared')
  const g = { task: await G(`/tasks/${OT}`), list: await G(`/lists/${OL}`), space: await G(`/spaces/${OS}`) }
  const g0 = { task: await G(`/tasks/${NONE}`), list: await G(`/lists/${NONE}`), space: await G(`/spaces/${NONE}`) }
  chk(
    Object.keys(g).every((k) => refusedSaying(g[k], 'This is not shared with you', g0[k])),
    'a guest is told 403 “This is not shared with you” for an open task, list and space not shared with them — and ids naming nothing are 404',
    Object.keys(g).map((k) => `${k}: ${pairSaid(g[k], g0[k])}`).join('; '),
  )

  // ══ 5. ANOTHER ORGANISATION ══════════════════════════════════════════════
  console.log('\n▶ a user of another organisation')
  const x = { task: await S(`/tasks/${OT}`), list: await S(`/lists/${OL}`), project: await S(`/projects/${OP}`), space: await S(`/spaces/${OS}`) }
  const x0 = { task: await S(`/tasks/${NONE}`), list: await S(`/lists/${NONE}`), project: await S(`/projects/${NONE}`), space: await S(`/spaces/${NONE}`) }
  chk(
    Object.keys(x).every((k) => refusedSaying(x[k], 'You are not a member of this workspace', x0[k])),
    'a user of another organisation is told 403 “You are not a member of this workspace” for this workspace’s task, list, project and space — and ids naming nothing are 404',
    Object.keys(x).map((k) => `${k}: ${pairSaid(x[k], x0[k])}`).join('; '),
  )

  // ══ 6. A DEPENDENCY ══════════════════════════════════════════════════════
  console.log('\n▶ the member’s task, blocked by the private task')
  const d1 = await M(`/tasks/${MINE}/dependencies`, { method: 'POST', body: { relatedTaskId: PT, type: 'blocked_by' } })
  const d0 = await M(`/tasks/${MINE}/dependencies`, { method: 'POST', body: { relatedTaskId: NONE, type: 'blocked_by' } })
  const [deps] = await sql`select count(*)::int as n from task_dependencies where task_id = ${MINE}`
  chk(
    refusedSaying(d1, 'This task is private', d0) && deps.n === 0,
    'a dependency on a task the member may not open is refused 403 “This task is private”, and none is written — one on an id naming nothing is 404',
    `${pairSaid(d1, d0)}; dependencies on the member's task ${deps.n}`,
  )

  // ══ 7. DRAFT A REPLY ═════════════════════════════════════════════════════
  // Asked before whether a model answers, so the same on every lane.
  console.log('\n▶ Draft a reply, for the private task')
  const a1 = await M('/ai/comment-reply', { method: 'POST', body: { taskId: PT, workspaceId: WS } })
  const a0 = await M('/ai/comment-reply', { method: 'POST', body: { taskId: NONE, workspaceId: WS } })
  chk(
    refusedSaying(a1, 'You do not have access to this task', a0),
    'Draft a reply refuses a task the member may not open, 403 “You do not have access to this task” — and an id naming nothing is 404',
    pairSaid(a1, a0),
  )

  // ══ 8. A MOVE ════════════════════════════════════════════════════════════
  console.log('\n▶ the member’s own task, moved into lists they may not open')
  const intoPrivate = await M(`/tasks/${MINE}/move`, { method: 'POST', body: { listId: PL, position: 0 } })
  const [afterPrivate] = await sql`select list_id from tasks where id = ${MINE}`
  if (afterPrivate?.list_id !== OL) await sql`update tasks set list_id = ${OL} where id = ${MINE}`
  const intoSpace = await M(`/tasks/${MINE}/move`, { method: 'POST', body: { listId: PSL, position: 0 } })
  const [afterSpace] = await sql`select list_id from tasks where id = ${MINE}`
  if (afterSpace?.list_id !== OL) await sql`update tasks set list_id = ${OL} where id = ${MINE}`
  const intoNothing = await M(`/tasks/${MINE}/move`, { method: 'POST', body: { listId: NONE, position: 0 } })
  chk(
    refusedSaying(intoPrivate, 'This list is private', intoNothing) && refusedSaying(intoSpace, 'You do not have access to that list', intoNothing)
      && afterPrivate?.list_id === OL && afterSpace?.list_id === OL,
    'a member cannot move their task into another’s private list (403 “This list is private”) or a list in a private space (403 “You do not have access to that list”) — the task stays in its list, and a list that does not exist is 404',
    `into the private list ${said(intoPrivate)} (the task then in ${afterPrivate?.list_id === OL ? 'its list' : afterPrivate?.list_id === PL ? 'THE PRIVATE LIST' : afterPrivate?.list_id}); ` +
      `into the private space's list ${said(intoSpace)} (${afterSpace?.list_id === OL ? 'its list' : afterSpace?.list_id}); into nothing ${said(intoNothing)}`,
  )

  // ══ 9. A CLIENT PORTAL ═══════════════════════════════════════════════════
  console.log('\n▶ the portal of a project in the private space')
  const po1 = await M(`/projects/${PSP}/portal`)
  const po0 = await M(`/projects/${NONE}/portal`)
  const rv1 = await M(`/portals/${PORTAL}`, { method: 'DELETE' })
  const rv0 = await M(`/portals/${NONE}`, { method: 'DELETE' })
  const [portalLeft] = await sql`select count(*)::int as n from client_portals where id = ${PORTAL}`
  chk(
    refusedSaying(po1, SAYS, po0) && refusedSaying(rv1, SAYS, rv0) && portalLeft.n === 1,
    'a client portal of a project the member may not open is refused, 403 “This space or project is private” — listing the project’s portals, or revoking one by id — and it stays; ids naming nothing are 404',
    `the project's portals: ${pairSaid(po1, po0)}; revoking: ${pairSaid(rv1, rv0)}; the portal left ${portalLeft.n}`,
  )

  // ══ 10. A REFUSAL OF SOMETHING THE MEMBER MAY OPEN ═══════════════════════
  console.log('\n▶ a task the member reads and may not change')
  const vRead = await M(`/tasks/${VT}`)
  const vWrite = await M(`/tasks/${VT}`, { method: 'PATCH', body: { title: `${TAG} renamed in view only` } })
  const [vRow] = await sql`select title from tasks where id = ${VT}`
  chk(
    vRead.status === 200 && vWrite.status === 403 && /view only/i.test(vWrite.message) && vRow?.title === `${TAG} view task`,
    'a write to a task the member may open but not change is refused with 403, saying why',
    `read ${said(vRead)}; write ${said(vWrite)}; title now ${JSON.stringify(vRow?.title)}`,
  )

  // ══ 11. WHAT IS THERE FOR THEM ═══════════════════════════════════════════
  console.log('\n▶ what the member may open')
  const open = {
    task: await M(`/tasks/${OT}`), list: await M(`/lists/${OL}`), project: await M(`/projects/${OP}`), space: await M(`/spaces/${OS}`), mine: await M(`/tasks/${MINE}`),
    adminsTask: await A(`/tasks/${PT}`), adminsList: await A(`/lists/${PL}`), adminsSpace: await A(`/spaces/${PS}`),
  }
  chk(
    Object.values(open).every((r) => r.status === 200),
    'and what may be opened is: the member opens the open task, list, project and space and their own task, and the admin opens the private ones — so every refusal above is about the thing refused',
    Object.entries(open).map(([k, r]) => `${k} ${r.status}`).join(', '),
  )

  // ══ 12. THE WORKSPACE ITSELF ═════════════════════════════════════════════
  console.log('\n▶ a route naming the workspace, asked by the user of another organisation')
  const w1 = await S(`/spaces/workspace/${WS}`)
  const w0 = await S(`/spaces/workspace/${NONE}`)
  chk(
    w1.status === 403 && w0.status === 403 && w1.message === w0.message && !JSON.stringify(w1.data ?? null).includes(TAG),
    'a route naming the workspace itself refuses a stranger 403 — alike for this workspace and for an id naming none, since it is not looked up — and names nothing in it',
    `this workspace ${said(w1)}; an id naming none ${said(w0)}`,
  )

  // ══ 13. A CHANGE OF A TASK ITS CALLER MAY NOT OPEN ═══════════════════════
  console.log('\n▶ changes and a move of tasks the member, a guest and a stranger may not open')
  const titleOf = async (id) => (await sql`select title from tasks where id = ${id}`)[0]?.title
  const changes = {
    privateTask: [await M(`/tasks/${PT}`, { method: 'PATCH', body: { title: `${TAG} changed 1` } }), 'This task is private'],
    privateList: [await M(`/tasks/${PLT}`, { method: 'PATCH', body: { title: `${TAG} changed 2` } }), 'This list is private'],
    privateSpace: [await M(`/tasks/${PST}`, { method: 'PATCH', body: { title: `${TAG} changed 3` } }), SAYS],
    moved: [await M(`/tasks/${PST}/move`, { method: 'POST', body: { listId: OL, position: 0 } }), SAYS],
    guest: [await G(`/tasks/${OT}`, { method: 'PATCH', body: { title: `${TAG} changed 4` } }), 'This is not shared with you'],
    stranger: [await S(`/tasks/${OT}`, { method: 'PATCH', body: { title: `${TAG} changed 5` } }), 'You are not a member of this workspace'],
  }
  const change0 = await M(`/tasks/${NONE}`, { method: 'PATCH', body: { title: `${TAG} changed 0` } })
  const titles = [await titleOf(PT), await titleOf(PLT), await titleOf(PST), await titleOf(OT)]
  const [movedTo] = await sql`select list_id from tasks where id = ${PST}`
  const kept = titles.join('|') === [`${TAG} private task`, `${TAG} in the private list`, `${TAG} in the private space`, `${TAG} open task`].join('|')
  chk(
    Object.values(changes).every(([res, words]) => refusedSaying(res, words, change0)) && kept && movedTo?.list_id === PSL,
    'a change or a move of a task its caller may not open is refused 403 in the read’s words — a private task, list or space, a guest’s, a stranger’s — and nothing changes (SQL); a change of an id naming nothing is 404',
    `${Object.entries(changes).map(([k, [res]]) => `${k} ${said(res)}`).join('; ')}; nothing ${said(change0)}; titles ${kept ? 'kept' : JSON.stringify(titles)}; the private space's task ${movedTo?.list_id === PSL ? 'in its list' : `moved to ${movedTo?.list_id}`}`,
  )

  // ══ 14. A DOC ITS CALLER MAY NOT OPEN ════════════════════════════════════
  console.log('\n▶ docs the member, a guest and a stranger may not open')
  const spaceDoc = must(await A(`/workspaces/${WS}/docs`, { method: 'POST', body: { spaceId: PS, title: `${TAG} the private space's doc` } }), 'make the private space’s doc').id
  const openDoc = must(await A(`/workspaces/${WS}/docs`, { method: 'POST', body: { spaceId: OS, title: `${TAG} the open space's doc` } }), 'make the open space’s doc').id
  const docs = {
    privateSpace: [await M(`/docs/${spaceDoc}`), SAYS],
    privateSpaceChange: [await M(`/docs/${spaceDoc}`, { method: 'PATCH', body: { title: `${TAG} doc changed` } }), SAYS],
    guest: [await G(`/docs/${openDoc}`), 'This is not shared with you'],
    stranger: [await S(`/docs/${openDoc}`), 'You are not a member of this workspace'],
  }
  const doc0 = await M(`/docs/${NONE}`)
  const [docTitle] = await sql`select title from docs where id = ${spaceDoc}`
  const docsOpen = { member: await M(`/docs/${openDoc}`), admin: await A(`/docs/${spaceDoc}`) }
  chk(
    Object.values(docs).every(([res, words]) => refusedSaying(res, words, doc0)) && docTitle?.title === `${TAG} the private space's doc`
      && docsOpen.member.status === 200 && docsOpen.admin.status === 200,
    'a doc its caller may not open is refused 403 in the read’s words — read or changed by a member refused its space, a guest’s, a stranger’s — and is not changed (SQL); an id naming nothing is 404, and the open doc and the admin’s are read',
    `${Object.entries(docs).map(([k, [res]]) => `${k} ${said(res)}`).join('; ')}; nothing ${said(doc0)}; title ${JSON.stringify(docTitle?.title)}; the member's open doc ${docsOpen.member.status}, the admin's ${docsOpen.admin.status}`,
  )

  // ══ 15. A PLATFORM ADMIN OUTSIDE A WORKSPACE ═════════════════════════════
  console.log('\n▶ the platform’s admin, in a workspace it is no member of')
  const theirs = must(await S('/workspaces', { method: 'POST', body: { name: `${TAG} the stranger's` } }), 'make the stranger’s workspace').id
  const theirSpace = must(await S('/spaces', { method: 'POST', body: { workspaceId: theirs, name: `${TAG} theirs` } }), 'make the stranger’s space').id
  const theirProject = must(await S('/projects', { method: 'POST', body: { spaceId: theirSpace, name: `${TAG} theirs` } }), 'make the stranger’s project').id
  const theirList = must(await S('/lists', { method: 'POST', body: { projectId: theirProject, name: `${TAG} theirs` } }), 'make the stranger’s list').id
  const theirTask = must(await S('/tasks', { method: 'POST', body: { listId: theirList, title: `${TAG} the stranger's task` } }), 'make the stranger’s task').id
  const [notIn] = await sql`select count(*)::int as n from workspace_members m join users u on u.id = m.user_id where m.workspace_id = ${theirs} and u.email = ${ADMIN.email}`
  const madeThere = await A('/tasks', { method: 'POST', body: { listId: theirList, title: `${TAG} made by the platform admin` } })
  const changedThere = await A(`/tasks/${theirTask}`, { method: 'PATCH', body: { title: `${TAG} changed by the platform admin` } })
  const readThere = await A(`/tasks/${theirTask}`)
  const [madeRows] = await sql`select count(*)::int as n from tasks where list_id = ${theirList} and title = ${`${TAG} made by the platform admin`}`
  // And an import there, which makes a project and its tasks: the importers' own rule (`assertMayImport`).
  const IMPORTED = `${TAG} imported by the platform admin`
  const importedThere = await A(`/workspaces/${theirs}/import/clickup`, {
    method: 'POST',
    body: { csv: `Task Name\n${IMPORTED}\n`, targetSpaceId: theirSpace, targetProjectName: IMPORTED },
  })
  // A job it started is waited out, so "nothing written" is not read before the job writes.
  const jobId = importedThere.data?.jobId
  if (jobId) {
    await waitUntil(async () => ['completed', 'failed'].includes((await A(`/workspaces/${theirs}/import/clickup/jobs/${jobId}`)).data?.status), { timeoutMs: 30_000 })
  }
  const [importLeft] = await sql`select (select count(*)::int from clickup_import_jobs where workspace_id = ${theirs}) as jobs, (select count(*)::int from projects where space_id = ${theirSpace} and name = ${IMPORTED}) as projects`
  const OUTSIDE = 'You are not a member of this workspace'
  chk(
    notIn.n === 0 && madeThere.status === 403 && madeThere.message === OUTSIDE && madeRows.n === 0
      && importedThere.status === 403 && importedThere.message === OUTSIDE && importLeft.jobs === 0 && importLeft.projects === 0
      && changedThere.status === 403 && changedThere.message === OUTSIDE && (await titleOf(theirTask)) === `${TAG} the stranger's task`
      && readThere.status === 200,
    'the platform’s admin, no member of a workspace, makes no task there, imports nothing and changes none, each refused 403 “You are not a member of this workspace” with nothing written (SQL) — as before, it may read there',
    `a member there: ${notIn.n}; made ${said(madeThere)} (${madeRows.n} written); imported ${said(importedThere)} (${importLeft.jobs} job row(s), ${importLeft.projects} project(s)); changed ${said(changedThere)}; read ${said(readThere)}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  // The database is the one thing held open; closed, the run ends by itself
  // (`process.exitCode`, not `process.exit`, so nothing is cut off mid-write).
  await sql?.end?.({ timeout: 5 }).catch?.(() => {})
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ only ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached and nothing else.`)
    process.exitCode = 1
  } else {
    process.exitCode = failed === 0 ? 0 : 1
  }
}

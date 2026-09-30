/**
 * WHAT A READER MAY NOT OPEN IS ANSWERED AS WHAT IS NOT THERE.
 *
 * NOT A FRAME ROW: `found-30-sep/private-task-reads-say-403`. Measured on
 * lane 2 before the fix, three runs alike (23 of 30 pairs apart):
 *   - `GET /tasks/:id` refused a member a private task with 403 "This task is
 *     private", a task in a private list with "This list is private", one in a
 *     private space with "This space or project is private" — and an id naming
 *     nothing with 404 "Resource not found". The same for a list, a project and
 *     a space by id; 403 "This is not shared with you" to a guest; 403 "You are
 *     not a member of this workspace" to a user of another organisation. So any
 *     id said whether it named something, what kind of wall stood in front of
 *     it, and where it lived.
 *   - The service reads of a task (Download all, Duplicate, a reminder, custom
 *     fields, a calendar push) answered 404, so one task said two things
 *     depending on the route asked; Duplicate's 404 still said "in this
 *     workspace" for a task it found and plain "Task not found" for none.
 *   - A dependency on a private task was 403 "This task is private", on
 *     nothing 404 "Related task not found"; Draft a reply 403 "You do not have
 *     access to this task" against 404; a move into a list in a private space
 *     403 "You do not have access to that list" against 404 — and a move into
 *     another's PRIVATE LIST in an open space was taken (201): the container
 *     rule was asked, the private-list rule was not, and the mover lost their
 *     own task in a list they could not open.
 *   - A client portal of a project in a private space: 403 for the project,
 *     where a portal id naming nothing was 404 "Portal not found".
 *   - Found by the review, measured the same way (21 of 21 pairs apart, three
 *     runs): the task WRITE rule told a user of another organisation "Workspace
 *     not found" for a real task and "Task not found" for none, on every write
 *     route with no guard (a change, a move, the bin, assignees, recurrence, the
 *     bulk editor's reasons); a binned task answered 409 "This task is in the
 *     bin" to a stranger, a guest and a member refused it; a merge into a
 *     private task said "Task not found" where nothing said "The task to merge
 *     into was not found", into a private subtask "Subtasks only nest one level
 *     deep" (400), and a binned source "A task in the bin cannot be merged"
 *     (400), to people who may not open either.
 *
 * THE ONE ANSWER is 404, in the words of the miss the route itself makes. RFC
 * 9110 §15.5.4: a server that "wishes to 'hide' the current existence of a
 * forbidden target resource MAY instead respond with a status code of 404".
 * OWASP's IDOR cheat sheet: where existence is sensitive, "map both cases to
 * the same public response, such as a 404". ClickUp's API answers one refusal,
 * "Team not authorized", for a task its token may not reach and for an id that
 * is not a task. (Its app keeps a door, Request access on a link to a private
 * item, which `request-access` holds the task sheet to — offered on the 404.)
 *
 * WHAT STAYS 403: a refusal of something the caller may open — a write their
 * level does not allow — and a route naming the WORKSPACE itself, which is not
 * looked up and so answers a stranger alike whether it exists or not.
 *
 * Every refused ask is paired with the same ask of an id naming nothing, and
 * read as equal: status and words. Every refusal has somebody for whom the
 * thing is there (section 12).
 *
 *   node test/e2e/refused-as-missing.mjs --api 3021
 */
import { signInApi, signUpApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt, must } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 17

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
/** The refusal and the miss: both 404, in the same words, and some words. A 0 (nothing answered) is neither. */
const alike = (refused, miss) => refused.status === 404 && miss.status === 404 && refused.message === miss.message && refused.message !== ''
const pairSaid = (refused, miss) => `refused ${said(refused)}, nothing ${said(miss)}`

const stamp = Date.now()
const TAG = `ram${stamp}`
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
  // And one with a subtask of its own, to merge from; and one in the bin.
  const MINE2 = must(await M('/tasks', { method: 'POST', body: { listId: OL, title: `${TAG} the member's with a subtask` } }), 'make the member’s second task').id
  must(await M('/tasks', { method: 'POST', body: { listId: OL, title: `${TAG} the member's subtask`, parentTaskId: MINE2 } }), 'make the member’s subtask')
  const MINEBIN = must(await M('/tasks', { method: 'POST', body: { listId: OL, title: `${TAG} the member's binned` } }), 'make the member’s binned task').id
  must(await M(`/tasks/${MINEBIN}/trash`, { method: 'POST', body: {} }), 'bin the member’s task')
  // The admin's private subtask, and two of the admin's tasks in the bin: a private one and an open one.
  const PARENT = await make('/tasks', { listId: OL, title: `${TAG} the admin's parent` }, 'the admin’s parent task')
  const PSUB = await make('/tasks', { listId: OL, title: `${TAG} the admin's private subtask`, parentTaskId: PARENT }, 'the admin’s subtask')
  must(await A(`/tasks/${PSUB}`, { method: 'PATCH', body: { visibility: 'private' } }), 'make the subtask private')
  const BPT = await make('/tasks', { listId: OL, title: `${TAG} binned private` }, 'the binned private task')
  must(await A(`/tasks/${BPT}`, { method: 'PATCH', body: { visibility: 'private' } }), 'make it private')
  const BOT = await make('/tasks', { listId: OL, title: `${TAG} binned open` }, 'the binned open task')
  for (const id of [BPT, BOT]) must(await A(`/tasks/${id}/trash`, { method: 'POST', body: {} }), 'bin the admin’s task')
  // The admin's portal on the private space's project.
  const PORTAL = must(await A(`/projects/${PSP}/portal`, { method: 'POST', body: {} }), 'make the admin’s portal').id

  // ══ 1. A PRIVATE TASK ════════════════════════════════════════════════════
  console.log('\n▶ a private task, read by a member it refuses')
  const t1 = await M(`/tasks/${PT}`)
  const t0 = await M(`/tasks/${NONE}`)
  chk(
    alike(t1, t0),
    'a member refused a private task is told it is not there — the 404 an id naming nothing gets, in the same words',
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
    alike(l1, l0) && alike(lt1, t0) && alike(lTasks, lTasks0),
    'a member refused a private list is told it is not there, and so are its task and its tasks’ listing, each as an id naming nothing',
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
  chk(
    alike(s1, s0) && alike(p1, p0) && alike(sl1, l0) && alike(st1, t0),
    'a member refused a private space is told neither it nor its project, list or task is there, each as an id naming nothing',
    `space: ${pairSaid(s1, s0)}; project: ${pairSaid(p1, p0)}; list: ${pairSaid(sl1, l0)}; task: ${pairSaid(st1, t0)}`,
  )

  // ══ 4. A GUEST ═══════════════════════════════════════════════════════════
  console.log('\n▶ a guest, with nothing shared')
  const g = { task: await G(`/tasks/${OT}`), list: await G(`/lists/${OL}`), space: await G(`/spaces/${OS}`) }
  const g0 = { task: await G(`/tasks/${NONE}`), list: await G(`/lists/${NONE}`), space: await G(`/spaces/${NONE}`) }
  chk(
    alike(g.task, g0.task) && alike(g.list, g0.list) && alike(g.space, g0.space),
    'a guest is told an open task, list and space not shared with them are not there, as ids naming nothing',
    Object.keys(g).map((k) => `${k}: ${pairSaid(g[k], g0[k])}`).join('; '),
  )

  // ══ 5. ANOTHER ORGANISATION ══════════════════════════════════════════════
  console.log('\n▶ a user of another organisation')
  const x = { task: await S(`/tasks/${OT}`), list: await S(`/lists/${OL}`), project: await S(`/projects/${OP}`), space: await S(`/spaces/${OS}`) }
  const x0 = { task: await S(`/tasks/${NONE}`), list: await S(`/lists/${NONE}`), project: await S(`/projects/${NONE}`), space: await S(`/spaces/${NONE}`) }
  chk(
    Object.keys(x).every((k) => alike(x[k], x0[k])),
    'a user of another organisation is told this workspace’s task, list, project and space are not there, as ids naming nothing — not that they are somebody else’s',
    Object.keys(x).map((k) => `${k}: ${pairSaid(x[k], x0[k])}`).join('; '),
  )

  // ══ 6. THE TASK'S OTHER ROUTES AGREE ═════════════════════════════════════
  console.log('\n▶ the private task’s other routes, and the service reads of it')
  const at = new Date(Date.now() + 86_400_000).toISOString()
  const both = async (route, init) => [await M(route(PT), init?.(PT)), await M(route(NONE), init?.(NONE))]
  const routes = {
    attachments: await both((id) => `/tasks/${id}/attachments`),
    follow: await both((id) => `/tasks/${id}/watchers`, () => ({ method: 'POST', body: {} })),
    downloadAll: await both((id) => `/tasks/${id}/attachments/zip`),
    duplicate: await both((id) => `/workspaces/${WS}/task-templates/duplicate/${id}`, () => ({ method: 'POST', body: {} })),
    reminder: await both(() => `/workspaces/${WS}/reminders`, (id) => ({ method: 'POST', body: { taskId: id, remindAt: at } })),
    fields: await both((id) => `/workspaces/${WS}/tasks/${id}/custom-fields`),
    calendarPush: await both((id) => `/workspaces/${WS}/calendar-sync/tasks/${id}/push`, () => ({ method: 'POST', body: {} })),
  }
  const [copies] = await sql`select count(*)::int as n from tasks where list_id = ${OL} and title = ${`${TAG} private task (copy)`}`
  chk(
    Object.values(routes).every(([r, n]) => alike(r, n)) && copies.n === 0,
    'the private task’s own routes answer as its service reads do — its files, following it, Download all, Duplicate, a reminder, its fields and a calendar push each tell the member it is not there, as for an id naming nothing, and nothing is copied',
    `${Object.entries(routes).map(([k, [r, n]]) => `${k}: ${pairSaid(r, n)}`).join('; ')}; copies ${copies.n}`,
  )

  // ══ 7. A DEPENDENCY ══════════════════════════════════════════════════════
  console.log('\n▶ the member’s task, blocked by the private task')
  const d1 = await M(`/tasks/${MINE}/dependencies`, { method: 'POST', body: { relatedTaskId: PT, type: 'blocked_by' } })
  const d0 = await M(`/tasks/${MINE}/dependencies`, { method: 'POST', body: { relatedTaskId: NONE, type: 'blocked_by' } })
  const [deps] = await sql`select count(*)::int as n from task_dependencies where task_id = ${MINE}`
  chk(
    alike(d1, d0) && deps.n === 0,
    'a dependency on a task the member may not open is refused as one on an id naming nothing, and none is written',
    `${pairSaid(d1, d0)}; dependencies on the member's task ${deps.n}`,
  )

  // ══ 8. DRAFT A REPLY ═════════════════════════════════════════════════════
  // Asked before whether a model answers, so the same on every lane.
  console.log('\n▶ Draft a reply, for the private task')
  const a1 = await M('/ai/comment-reply', { method: 'POST', body: { taskId: PT, workspaceId: WS } })
  const a0 = await M('/ai/comment-reply', { method: 'POST', body: { taskId: NONE, workspaceId: WS } })
  chk(
    alike(a1, a0),
    'Draft a reply refuses a task the member may not open as a task that is not there',
    pairSaid(a1, a0),
  )

  // ══ 9. A MOVE ════════════════════════════════════════════════════════════
  console.log('\n▶ the member’s own task, moved into lists they may not open')
  const intoPrivate = await M(`/tasks/${MINE}/move`, { method: 'POST', body: { listId: PL, position: 0 } })
  const [afterPrivate] = await sql`select list_id from tasks where id = ${MINE}`
  if (afterPrivate?.list_id !== OL) await sql`update tasks set list_id = ${OL} where id = ${MINE}`
  const intoSpace = await M(`/tasks/${MINE}/move`, { method: 'POST', body: { listId: PSL, position: 0 } })
  const [afterSpace] = await sql`select list_id from tasks where id = ${MINE}`
  if (afterSpace?.list_id !== OL) await sql`update tasks set list_id = ${OL} where id = ${MINE}`
  const intoNothing = await M(`/tasks/${MINE}/move`, { method: 'POST', body: { listId: NONE, position: 0 } })
  chk(
    alike(intoPrivate, intoNothing) && alike(intoSpace, intoNothing) && afterPrivate?.list_id === OL && afterSpace?.list_id === OL,
    'a member cannot move their task into another’s private list, or a list in a private space, and is told the list is not there, as for one that does not exist — the task stays in its list',
    `into the private list ${said(intoPrivate)} (the task then in ${afterPrivate?.list_id === OL ? 'its list' : afterPrivate?.list_id === PL ? 'THE PRIVATE LIST' : afterPrivate?.list_id}); ` +
      `into the private space's list ${said(intoSpace)} (${afterSpace?.list_id === OL ? 'its list' : afterSpace?.list_id}); into nothing ${said(intoNothing)}`,
  )

  // ══ 10. A CLIENT PORTAL ══════════════════════════════════════════════════
  console.log('\n▶ the portal of a project in the private space')
  const po1 = await M(`/projects/${PSP}/portal`)
  const po0 = await M(`/projects/${NONE}/portal`)
  const rv1 = await M(`/portals/${PORTAL}`, { method: 'DELETE' })
  const rv0 = await M(`/portals/${NONE}`, { method: 'DELETE' })
  const [portalLeft] = await sql`select count(*)::int as n from client_portals where id = ${PORTAL}`
  chk(
    alike(po1, po0) && alike(rv1, rv0) && portalLeft.n === 1,
    'a client portal of a project the member may not open is not there for them — listing the project’s portals, or revoking one by id — as for ids naming nothing, and it stays',
    `the project's portals: ${pairSaid(po1, po0)}; revoking: ${pairSaid(rv1, rv0)}; the portal left ${portalLeft.n}`,
  )

  // ══ 11. A REFUSAL THE MEMBER MAY KNOW ABOUT ══════════════════════════════
  console.log('\n▶ a task the member reads and may not change')
  const vRead = await M(`/tasks/${VT}`)
  const vWrite = await M(`/tasks/${VT}`, { method: 'PATCH', body: { title: `${TAG} renamed in view only` } })
  const [vRow] = await sql`select title from tasks where id = ${VT}`
  chk(
    vRead.status === 200 && vWrite.status === 403 && /view only/i.test(vWrite.message) && vRow?.title === `${TAG} view task`,
    'a write to a task the member may open but not change is still refused with 403, saying why — it is theirs to know about',
    `read ${said(vRead)}; write ${said(vWrite)}; title now ${JSON.stringify(vRow?.title)}`,
  )

  // ══ 12. WHAT IS THERE FOR THEM ═══════════════════════════════════════════
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

  // ══ 13. THE WORKSPACE ITSELF ═════════════════════════════════════════════
  console.log('\n▶ a route naming the workspace, asked by the user of another organisation')
  const w1 = await S(`/spaces/workspace/${WS}`)
  const w0 = await S(`/spaces/workspace/${NONE}`)
  chk(
    w1.status === 403 && w0.status === 403 && w1.message === w0.message && !JSON.stringify(w1.data ?? null).includes(TAG),
    'a route naming the workspace itself still refuses a stranger 403 — alike for this workspace and for an id naming none, since it is not looked up — and names nothing in it',
    `this workspace ${said(w1)}; an id naming none ${said(w0)}`,
  )

  // ══ 14. A STRANGER'S WRITES ══════════════════════════════════════════════
  // The write routes with no guard in front of them ask the task write rule first.
  console.log('\n▶ a user of another organisation, writing to this workspace’s open task')
  const writes = {
    change: ['', { method: 'PATCH', body: { title: `${TAG} renamed by a stranger` } }],
    move: ['/move', { method: 'POST', body: { listId: OL, position: 0 } }],
    bin: ['/trash', { method: 'POST', body: {} }],
    restore: ['/restore', { method: 'POST', body: {} }],
    archive: ['', { method: 'DELETE' }],
    takeOn: ['/assignees', { method: 'POST', body: { userId: stranger.id } }],
    repeat: ['/recurrence', { method: 'PUT', body: { cadenceDays: 7 } }],
  }
  const xw = {}
  for (const [k, [tail, init]] of Object.entries(writes)) xw[k] = [await S(`/tasks/${OT}${tail}`, init), await S(`/tasks/${NONE}${tail}`, init)]
  const bulkX = await S('/tasks/bulk/update', { method: 'PATCH', body: { taskIds: [OT, NONE], patch: { priority: 'urgent' } } })
  const why = Object.fromEntries((bulkX.data?.failed ?? []).map((f) => [f.taskId, f.reason]))
  const [otRow] = await sql`select title, is_archived, priority from tasks where id = ${OT}`
  chk(
    Object.values(xw).every(([r, n]) => alike(r, n)) && typeof why[OT] === 'string' && why[OT] !== '' && why[OT] === why[NONE]
      && otRow?.title === `${TAG} open task` && otRow?.is_archived === false && otRow?.priority !== 'urgent',
    'a user of another organisation writing to this workspace’s task — changing, moving, binning, restoring or archiving it, taking it on, setting it to repeat, or in the bulk editor — is told it is not there, in the words an id naming nothing gets, and nothing changes',
    `${Object.entries(xw).map(([k, [r, n]]) => `${k}: ${pairSaid(r, n)}`).join('; ')}; the bulk editor's reasons: this task ${JSON.stringify(why[OT] ?? null)}, nothing ${JSON.stringify(why[NONE] ?? null)}; the task now ${JSON.stringify(otRow ?? null)}`,
  )

  // ══ 15. A TASK IN THE BIN ════════════════════════════════════════════════
  console.log('\n▶ a task in the bin, changed by people who may not open it, and by one who may')
  const rename = { method: 'PATCH', body: { title: `${TAG} renamed in the bin` } }
  const binned = {
    member: [await M(`/tasks/${BPT}`, rename), await M(`/tasks/${NONE}`, rename)],
    guest: [await G(`/tasks/${BOT}`, rename), await G(`/tasks/${NONE}`, rename)],
    stranger: [await S(`/tasks/${BOT}`, rename), await S(`/tasks/${NONE}`, rename)],
  }
  const ownBinned = await M(`/tasks/${MINEBIN}`, rename)
  chk(
    Object.values(binned).every(([r, n]) => alike(r, n)) && ownBinned.status === 409 && /in the bin/i.test(ownBinned.message),
    'a task in the bin is in the bin only to somebody who may open it — the member’s own says so (409) — and to the member refused a binned private task, a guest and a user of another organisation it is not there, as an id naming nothing',
    `${Object.entries(binned).map(([k, [r, n]]) => `${k}: ${pairSaid(r, n)}`).join('; ')}; the member's own ${said(ownBinned)}`,
  )

  // ══ 16. A MERGE'S TARGET ═════════════════════════════════════════════════
  console.log('\n▶ the member’s tasks, merged into tasks they may not open')
  const mergeInto = (from, target) => M(`/tasks/${from}/merge`, { method: 'POST', body: { targetTaskId: target } })
  const intoPT = await mergeInto(MINE, PT)
  const intoPLT = await mergeInto(MINE, PLT)
  const intoPSUB = await mergeInto(MINE2, PSUB)
  const intoNone = await mergeInto(MINE, NONE)
  const intoNone2 = await mergeInto(MINE2, NONE)
  const [kept] = await sql`select count(*)::int as n from tasks where id in (${MINE}, ${MINE2}) and is_archived = false`
  chk(
    alike(intoPT, intoNone) && alike(intoPLT, intoNone) && alike(intoPSUB, intoNone2) && kept?.n === 2,
    'merging into a task the member may not open — a private task, one in a private list, and somebody’s private subtask from a task with subtasks of its own — is refused as merging into an id naming nothing, and nothing is merged',
    `into the private task: ${pairSaid(intoPT, intoNone)}; into the private list's: ${pairSaid(intoPLT, intoNone)}; into the private subtask: ${pairSaid(intoPSUB, intoNone2)}; the member's tasks left ${kept?.n}`,
  )

  // ══ 17. A MERGE'S SOURCE ═════════════════════════════════════════════════
  console.log('\n▶ a task merged away by somebody who may not open it')
  const awayX = await S(`/tasks/${OT}/merge`, { method: 'POST', body: { targetTaskId: NONE } })
  const awayXBinned = await S(`/tasks/${BOT}/merge`, { method: 'POST', body: { targetTaskId: OT } })
  const awayX0 = await S(`/tasks/${NONE}/merge`, { method: 'POST', body: { targetTaskId: NONE } })
  const awayM = await M(`/tasks/${BPT}/merge`, { method: 'POST', body: { targetTaskId: MINE } })
  const awayM0 = await M(`/tasks/${NONE}/merge`, { method: 'POST', body: { targetTaskId: MINE } })
  const [otLeft] = await sql`select is_archived from tasks where id = ${OT}`
  chk(
    alike(awayX, awayX0) && alike(awayXBinned, awayX0) && alike(awayM, awayM0) && otLeft?.is_archived === false,
    'a task merged away by somebody who may not open it is not there — a user of another organisation merging this workspace’s task into nothing, or its binned task into another, and the member merging a binned private task, are each answered as for an id naming nothing, not by the merge rule',
    `stranger, into nothing: ${pairSaid(awayX, awayX0)}; stranger, a binned task: ${pairSaid(awayXBinned, awayX0)}; member, a binned private task: ${pairSaid(awayM, awayM0)}`,
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

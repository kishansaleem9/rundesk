/**
 * A SUPER_ADMIN WHO IS A PLAIN MEMBER CHANGES THE TASKS THEY MAY OPEN.
 *
 * NOT A FRAME ROW: `found-5-oct/super-admin-cannot-write-a-task-it-reads`,
 * reported by the revert of `found-30-sep/private-task-reads-say-403`. Measured
 * on lane 1: a super_admin account, a plain member of somebody else's
 * workspace, moved its own task into another member's private list (201) and
 * opened it there (200); moving it back answered 404 "Task not found", and so
 * did renaming it. A task it made in a private space's list (201) it opened
 * (200) and commented on (201), and could not rename (404). The guard, the
 * task read and the create gate ask the ACCOUNT's role, which lets a
 * super_admin open everything; the write rule asked the WORKSPACE role, which
 * is never super_admin, and so refused what the same person had just read.
 *
 * The write rule asks the read rule with the account's role, as they do. The
 * space's level is still asked of them as of any member, as the create gate
 * asks it; and a plain member is still refused a private list's task.
 *
 * And the task's other edits, found by the review: with its edits offered
 * (Full edit), the task sheet drew "Add subtask", and a subtask under the
 * private space's task answered 403 "This space is private", as did following
 * it, linking it as what blocks another task, and listing its files and linked
 * docs; assigning them to it answered 400 "That person can't see this task".
 * Each asked the tasks module's own read gate, which asked the workspace role.
 *
 * The workspace is a signed-up owner's; the platform's admin account
 * (`admin@rundesk.internal`, a super_admin) is added to it as a member.
 *
 *   node test/e2e/super-admin-task-writes.mjs --api 3021
 */
import { signInApi, signUpApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt, must } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 6

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
const said = (res) => `${res.status} ${JSON.stringify(res.message || null)}`

const stamp = Date.now()
const TAG = `saw${stamp}`
let sql = null
let WS = null
let O = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — every change is read back by SQL')
  const person = async (who) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const signed = await signUpApi(API, {
      fullName: `Writes ${who}`, email, password: 'Writes@12345!',
      organizationName: `Writes ${who} ${stamp}`, organizationSlug: `writes-${who}-${stamp}`,
    })
    return { email, as: apiAs(signed.accessToken) }
  }
  const owner = await person('owner')
  O = owner.as
  WS = must(await O('/workspaces', { method: 'POST', body: { name: TAG } }), 'make the owner’s workspace').id
  const member = await person('member')
  const M = member.as
  must(await O(`/workspaces/${WS}/members`, { method: 'POST', body: { email: member.email, role: 'member' } }), 'add the member')
  must(await O(`/workspaces/${WS}/members`, { method: 'POST', body: { email: ADMIN.email, role: 'member' } }), 'add the super_admin as a member')
  const saAuth = await signInApi(API, ADMIN.email, ADMIN.password)
  const SA = apiAs(saAuth.accessToken)
  const [{ id: SA_ID }] = await sql`select id from users where email = ${ADMIN.email}`
  const [roles] = await sql`select u.role as account, m.role as workspace from users u join workspace_members m on m.user_id = u.id and m.workspace_id = ${WS} where u.email = ${ADMIN.email}`
  if (roles?.account !== 'super_admin' || roles?.workspace !== 'member') throw new Error(`the admin account should be a super_admin and a plain member here: ${JSON.stringify(roles)}`)

  const make = async (C, route, body, what) => must(await C(route, { method: 'POST', body }), `make ${what}`).id
  // An open space, project and list; the member's private list beside it; a private space with a list; a view-only space.
  const OS = await make(O, '/spaces', { workspaceId: WS, name: `${TAG} open` }, 'the open space')
  const OP = await make(O, '/projects', { spaceId: OS, name: `${TAG} open` }, 'the open project')
  const OL = await make(O, '/lists', { projectId: OP, name: `${TAG} open list` }, 'the open list')
  const LB = await make(M, '/lists', { projectId: OP, name: `${TAG} the member's private list`, visibility: 'private' }, 'the member’s private list')
  const PS = await make(O, '/spaces', { workspaceId: WS, name: `${TAG} private`, visibility: 'private' }, 'the private space')
  const PP = await make(O, '/projects', { spaceId: PS, name: `${TAG} private` }, 'the private project')
  const PSL = await make(O, '/lists', { projectId: PP, name: `${TAG} private list` }, 'the private space’s list')
  const VS = await make(O, '/spaces', { workspaceId: WS, name: `${TAG} view only`, defaultPermission: 'view' }, 'the view-only space')
  const VP = await make(O, '/projects', { spaceId: VS, name: `${TAG} view only` }, 'the view-only project')
  const VL = await make(O, '/lists', { projectId: VP, name: `${TAG} view list` }, 'the view-only list')
  const VT = await make(O, '/tasks', { listId: VL, title: `${TAG} view task` }, 'the view-only task')
  const row = async (id) => (await sql`select title, list_id from tasks where id = ${id}`)[0] ?? null

  // ══ 1. INTO ANOTHER MEMBER'S PRIVATE LIST, AND BACK ══════════════════════
  console.log('\n▶ the super_admin’s own task, moved into the member’s private list, opened, moved back and renamed')
  const TW = await make(SA, '/tasks', { listId: OL, title: `${TAG} the super_admin's task` }, 'the super_admin’s task')
  const into = await SA(`/tasks/${TW}/move`, { method: 'POST', body: { listId: LB, position: 0 } })
  const opened = await SA(`/tasks/${TW}`)
  const renamed = await SA(`/tasks/${TW}`, { method: 'PATCH', body: { title: `${TAG} renamed in the private list` } })
  const afterRename = await row(TW)
  const back = await SA(`/tasks/${TW}/move`, { method: 'POST', body: { listId: OL, position: 0 } })
  const afterBack = await row(TW)
  chk(
    into.ok && opened.status === 200 && renamed.status === 200 && afterRename?.title === `${TAG} renamed in the private list`
      && back.ok && afterBack?.list_id === OL,
    'a super_admin who is a plain member moves their task into a member’s private list, opens it there, renames it and moves it back — each change made (SQL)',
    `into ${said(into)}; opened ${said(opened)}; renamed ${said(renamed)} (title ${JSON.stringify(afterRename?.title)}); back ${said(back)} (in ${afterBack?.list_id === OL ? 'the open list' : afterBack?.list_id === LB ? 'THE PRIVATE LIST' : JSON.stringify(afterBack?.list_id)})`,
  )

  // ══ 2. MADE IN A PRIVATE SPACE THEY ARE NOT IN ═══════════════════════════
  console.log('\n▶ a task the super_admin makes in a private space’s list, opened, commented on and renamed')
  const T2 = await make(SA, '/tasks', { listId: PSL, title: `${TAG} in the private space` }, 'the private space’s task')
  const read2 = await SA(`/tasks/${T2}`)
  const comment2 = await SA(`/tasks/${T2}/comments`, { method: 'POST', body: { body: `${TAG} a comment` } })
  const rename2 = await SA(`/tasks/${T2}`, { method: 'PATCH', body: { title: `${TAG} renamed in the private space` } })
  const caps2 = await SA(`/tasks/${T2}/capabilities`)
  const after2 = await row(T2)
  chk(
    read2.status === 200 && comment2.status === 201 && rename2.status === 200 && after2?.title === `${TAG} renamed in the private space`
      && caps2.data?.edit === true && caps2.data?.progress === true,
    'a task they made in a private space they are not in, they open, comment on and rename (SQL) — and the task sheet is offered its edits',
    `opened ${said(read2)}; commented ${said(comment2)}; renamed ${said(rename2)} (title ${JSON.stringify(after2?.title)}); capabilities ${caps2.status} ${JSON.stringify(caps2.data ?? null)}`,
  )

  /** What each of the task's other edits answers the super_admin, and what was made (SQL). */
  const otherEdits = async (task, listId) => {
    const sub = await SA('/tasks', { method: 'POST', body: { listId, title: `${TAG} a subtask of ${task}`, parentTaskId: task } })
    const assign = await SA(`/tasks/${task}/assignees`, { method: 'POST', body: { userId: SA_ID } })
    const follow = await SA(`/tasks/${task}/watchers`, { method: 'POST', body: { userId: SA_ID } })
    const blocker = await make(SA, '/tasks', { listId: OL, title: `${TAG} blocked by ${task}` }, 'the open task it blocks')
    const blocks = await SA(`/tasks/${blocker}/dependencies`, { method: 'POST', body: { relatedTaskId: task, type: 'blocked_by' } })
    const files = await SA(`/tasks/${task}/attachments`)
    const docs = await SA(`/tasks/${task}/linked-docs`)
    const [{ n: subs }] = await sql`select count(*)::int as n from tasks where parent_task_id = ${task}`
    const [{ n: assigned }] = await sql`select count(*)::int as n from task_assignees where task_id = ${task} and user_id = ${SA_ID}`
    const [{ n: following }] = await sql`select count(*)::int as n from task_watchers where task_id = ${task} and user_id = ${SA_ID}`
    const [{ n: linked }] = await sql`select count(*)::int as n from task_dependencies where task_id = ${blocker} and related_task_id = ${task}`
    return {
      ok: sub.status === 201 && subs === 1 && assign.ok && assigned === 1 && follow.ok && following === 1
        && blocks.ok && linked === 1 && files.status === 200 && docs.status === 200,
      said: `subtask ${said(sub)} (${subs} made); assigned ${said(assign)} (${assigned}); followed ${said(follow)} (${following}); blocked by it ${said(blocks)} (${linked}); files ${said(files)}; linked docs ${said(docs)}`,
    }
  }

  // ══ 3. THE PRIVATE SPACE'S TASK: ITS OTHER EDITS ═════════════════════════
  console.log('\n▶ the private space’s task: a subtask, an assignee, a follower, a blocked task, its files and docs')
  const edits5 = await otherEdits(T2, PSL)
  chk(
    edits5.ok,
    'and the private space’s task takes the super_admin’s other edits too — a subtask under it, themself as its assignee and follower, another task blocked by it (each made, SQL) — and its files and linked docs are listed to them (200)',
    edits5.said,
  )

  // ══ 4. ANOTHER MEMBER'S PRIVATE LIST: ITS OTHER EDITS ════════════════════
  console.log('\n▶ a task in the member’s private list: the same edits, and a task made there assigned to themself')
  const TL = await make(SA, '/tasks', { listId: OL, title: `${TAG} into the private list` }, 'the task for the private list')
  const intoLB = await SA(`/tasks/${TL}/move`, { method: 'POST', body: { listId: LB, position: 0 } })
  const edits6 = await otherEdits(TL, LB)
  const bornAssigned = await SA('/tasks', { method: 'POST', body: { listId: LB, title: `${TAG} born assigned in the private list`, assigneeIds: [SA_ID] } })
  const [{ n: bornRows }] = await sql`select count(*)::int as n from tasks t join task_assignees a on a.task_id = t.id where t.title = ${`${TAG} born assigned in the private list`} and a.user_id = ${SA_ID}`
  chk(
    intoLB.ok && edits6.ok && bornAssigned.status === 201 && bornRows === 1,
    'and so does a task in another member’s private list, and a task made there assigned to themself (SQL)',
    `moved in ${said(intoLB)}; ${edits6.said}; made assigned ${said(bornAssigned)} (${bornRows})`,
  )

  // ══ 5. THE SPACE'S LEVEL IS STILL ASKED OF THEM ══════════════════════════
  console.log('\n▶ a task of a view-only space, opened and changed by the super_admin')
  const readV = await SA(`/tasks/${VT}`)
  const writeV = await SA(`/tasks/${VT}`, { method: 'PATCH', body: { title: `${TAG} renamed in view only` } })
  const afterV = await row(VT)
  chk(
    readV.status === 200 && writeV.status === 403 && /View only/.test(writeV.message) && afterV?.title === `${TAG} view task`,
    'the space’s level is still asked of a super_admin who is a plain member: in a view-only space they open the task and are refused its change, 403 saying why, the title kept',
    `opened ${said(readV)}; changed ${said(writeV)}; title ${JSON.stringify(afterV?.title)}`,
  )

  // ══ 6. NOBODY ELSE IS LET IN ═════════════════════════════════════════════
  // `PATCH /tasks/:id` has no route guard in front of it: the write rule alone
  // refuses a plain member here, so this is the rule's to keep shut.
  console.log('\n▶ the same change, by a plain member and by the owner')
  const T3 = await make(O, '/tasks', { listId: PSL, title: `${TAG} the owner's private-space task` }, 'the owner’s private-space task')
  const memberRead = await M(`/tasks/${T3}`)
  const memberWrite = await M(`/tasks/${T3}`, { method: 'PATCH', body: { title: `${TAG} renamed by the member` } })
  const afterMember = await row(T3)
  const ownerWrite = await O(`/tasks/${T3}`, { method: 'PATCH', body: { title: `${TAG} renamed by the owner` } })
  const after3 = await row(T3)
  chk(
    memberRead.status === 403 && (memberWrite.status === 403 || memberWrite.status === 404) && afterMember?.title === `${TAG} the owner's private-space task`
      && ownerWrite.status === 200 && after3?.title === `${TAG} renamed by the owner`,
    'and a plain member is still refused the private space’s task — its read 403, its change refused and not made (SQL) — while its owner changes it',
    `the member read ${said(memberRead)}, wrote ${said(memberWrite)} (title then ${JSON.stringify(afterMember?.title)}); the owner ${said(ownerWrite)}; title ${JSON.stringify(after3?.title)}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  if (WS && O) {
    const gone = await O(`/workspaces/${WS}`, { method: 'DELETE' })
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

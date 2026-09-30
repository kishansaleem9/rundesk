/**
 * A PRIVATE LIST'S TASKS REACH NOBODY IT REFUSES, WHICHEVER READ ASKS.
 *
 * NOT A FRAME ROW: `found-24-sep/private-lists-skipped-by-task-reads`. The task
 * reads that applied the container rule stopped at the space and the project
 * (`containerVisibilityFilter`), so a private list — its maker's and the
 * managers' — had its tasks listed, searched and named to every member of an
 * open space. Measured before the fix: the workspace list behind every task
 * picker, its search, the timeline and a colleague's tasks all named the
 * private list's task to a member refused the list. And the workspace list,
 * filtered in JavaScript by its own copy of the rule, hid a private task from
 * the member it was assigned to.
 *
 * One private list, made by the admin, holding a task with a word only it
 * carries, dated, assigned to the admin, commented on, blocking the member's
 * own task and in a sprint; another of its tasks assigned to the member and
 * dated; and a private task assigned to the member. Each
 * read is asked by the member and by the admin, so every "not there" has
 * somebody entitled for whom it is there.
 *
 *   node test/e2e/private-list-reach.mjs --api 3021
 */
import { signInApi, signUpApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 13

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
const TAG = `plr-${stamp}`
const WORD = `quokka${stamp}`
let sql = null
let WS = null
let A = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the fixtures are planted by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const adminId = (await A('/users/me')).data?.id
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const email = `${TAG}-member@rundesk.invalid`
  const signed = await signUpApi(API, {
    fullName: 'Private list member', email, password: 'Member@12345!',
    organizationName: `Private list ${stamp}`, organizationSlug: `private-list-${stamp}`,
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
  const space = await make('/spaces', { workspaceId: WS, name: `${TAG} open space` }, 'the open space')
  const project = await make('/projects', { spaceId: space, name: `${TAG} open project` }, 'the project')
  const PL = await make('/lists', { projectId: project, name: `${WORD} private list`, visibility: 'private' }, 'the private list')
  const OL = await make('/lists', { projectId: project, name: `${TAG} open list` }, 'the open list')
  const PT = await make('/tasks', { listId: PL, title: `${WORD} the private list's task` }, 'the private list’s task')
  const OT = await make('/tasks', { listId: OL, title: `${TAG} an open task` }, 'the open task')
  const MINE = await make('/tasks', { listId: OL, title: `${TAG} the member's own task` }, 'the member’s task')
  const PA = await make('/tasks', { listId: OL, title: `${TAG} a private task assigned to the member` }, 'the private task')
  await sql`update tasks set start_date = now(), due_date = now() + interval '2 days' where id in ${sql([PT, OT])}`
  await sql`insert into task_assignees (task_id, user_id) values (${PT}, ${adminId}), (${OT}, ${adminId}), (${MINE}, ${memberId}), (${PA}, ${memberId})`
  await sql`update tasks set visibility = 'private', created_by_id = ${adminId} where id = ${PA}`
  await sql`update tasks set created_by_id = ${memberId} where id = ${MINE}`
  await sql`insert into task_comments (task_id, author_id, body) values (${PT}, ${adminId}, ${`${WORD} said on the private list's task`})`
  await sql`insert into task_dependencies (task_id, related_task_id, type) values (${MINE}, ${PT}, 'blocked_by')`
  // The admin's private-list task, blocked by an open one: a standup's "held up by".
  await sql`insert into task_dependencies (task_id, related_task_id, type) values (${PT}, ${OT}, 'blocked_by')`
  // A task of the private list assigned to the member, dated: their own feed.
  const PFEED = await make('/tasks', { listId: PL, title: `${WORD} assigned to the member in the private list` }, 'the private list’s other task')
  await sql`update tasks set start_date = now(), due_date = now() + interval '1 day' where id in ${sql([PFEED, MINE])}`
  await sql`insert into task_assignees (task_id, user_id) values (${PFEED}, ${memberId})`
  const [sprintRow] = await sql`insert into sprints (workspace_id, name, status, start_date, end_date)
                                values (${WS}, ${`${TAG} the workspace's sprint`}, 'active', now() - interval '1 day', now() + interval '6 days') returning id`
  await sql`insert into sprint_tasks (sprint_id, task_id) values (${sprintRow.id}, ${PT}), (${sprintRow.id}, ${OT})`
  const gates = await Promise.all([M(`/tasks/list/${PL}`), M(`/tasks/${PT}`), M(`/tasks/${PA}`)])
  if (gates[0].status !== 403 || gates[1].status !== 403 || gates[2].status !== 200) {
    throw new Error(`the fixture is not what it claims: the member's private list ${gates[0].status}, its task ${gates[1].status}, the private task assigned to them ${gates[2].status}`)
  }
  const names = (res) => res.text.includes(WORD)
  const ids = (res) => (Array.isArray(res.data) ? res.data : []).map((t) => t.id)

  // ══ 1. THE WORKSPACE LIST, AND ITS SEARCH ════════════════════════════════
  console.log('\n▶ the workspace list behind the task pickers')
  const [mAll, aAll, mFind, aFind] = await Promise.all([
    M(`/tasks/workspace/${WS}`), A(`/tasks/workspace/${WS}`),
    M(`/tasks/workspace/${WS}?q=${WORD}`), A(`/tasks/workspace/${WS}?q=${WORD}`),
  ])
  chk(
    mAll.status === 200 && !names(mAll) && ids(mAll).includes(OT) && ids(mAll).includes(PA) && ids(aAll).includes(PT) &&
      mFind.status === 200 && ids(mFind).length === 0 && ids(aFind).includes(PT),
    'the member’s workspace list has no task of the private list, even searched for, and has the private task assigned to them — the admin’s has it',
    `the member's list ${said(mAll)} names it: ${names(mAll)}, has the open task: ${ids(mAll).includes(OT)}, the private one assigned to them: ${ids(mAll).includes(PA)}; ` +
      `searched: ${JSON.stringify(ids(mFind))}; the admin's has it: ${ids(aAll).includes(PT)}, searched: ${ids(aFind).includes(PT)}`,
  )

  // ══ 2. THE TIMELINE ══════════════════════════════════════════════════════
  console.log('\n▶ the timeline')
  const [mLine, aLine] = await Promise.all([M(`/tasks/workspace/${WS}/timeline`), A(`/tasks/workspace/${WS}/timeline`)])
  chk(
    mLine.status === 200 && !names(mLine) && mLine.text.includes(OT) && names(aLine),
    'the timeline gives the member no task of the private list, and the open one — the admin’s has it',
    `the member's ${said(mLine)} names it: ${names(mLine)}, has the open task: ${mLine.text.includes(OT)}; the admin's names it: ${names(aLine)}`,
  )

  // ══ 3. A COLLEAGUE'S TASKS ═══════════════════════════════════════════════
  console.log('\n▶ the admin’s tasks, read by the member')
  const [mTheirs, aOwn] = await Promise.all([M(`/tasks/workspace/${WS}/members/${adminId}`), A(`/tasks/workspace/${WS}/members/${adminId}`)])
  chk(
    mTheirs.status === 200 && !names(mTheirs) && ids(mTheirs).includes(OT) && ids(aOwn).includes(PT),
    'a colleague’s tasks, read by the member, have none of the private list’s — and the open one; the admin’s own have it',
    `the member's read ${said(mTheirs)} names it: ${names(mTheirs)}, has the open task: ${ids(mTheirs).includes(OT)}; the admin's has it: ${ids(aOwn).includes(PT)}`,
  )

  // ══ 4. A RELATED TASK ════════════════════════════════════════════════════
  console.log('\n▶ the member’s own task, blocked by the private list’s')
  const [mTask, aTask] = await Promise.all([M(`/tasks/${MINE}`), A(`/tasks/${MINE}`)])
  chk(
    mTask.status === 200 && !names(mTask) && (mTask.data?.hiddenDependencies ?? 0) === 1 && names(aTask),
    'the member’s task names no blocker of the private list, and counts it as one left out — the admin’s names it',
    `the member's ${said(mTask)} names it: ${names(mTask)}, left out: ${JSON.stringify(mTask.data?.hiddenDependencies)}; the admin's names it: ${names(aTask)}`,
  )

  // ══ 5. A PERSON'S PAGES ══════════════════════════════════════════════════
  console.log('\n▶ the admin’s profile, calendar and the tasks the two share')
  const person = `/workspaces/${WS}/people/${adminId}`
  const [mProfile, mCalendar, mShared, aProfile] = await Promise.all([
    M(person), M(`${person}/calendar`), M(`${person}/shared`), A(person),
  ])
  chk(
    [mProfile, mCalendar, mShared].every((r) => r.status === 200 && !names(r)) && mProfile.text.includes(OT) && names(aProfile),
    'the admin’s profile, calendar and shared tasks, read by the member, name none of the private list’s — the profile has the open one, and the admin’s own has it',
    `the member's profile ${said(mProfile)} names it: ${names(mProfile)} (the open task: ${mProfile.text.includes(OT)}), calendar ${said(mCalendar)}: ${names(mCalendar)}, shared ${said(mShared)}: ${names(mShared)}; the admin's own: ${names(aProfile)}`,
  )

  // ══ 6. SEARCH ════════════════════════════════════════════════════════════
  console.log('\n▶ search, for the private list’s word')
  const [mSearch, aSearch] = await Promise.all([M(`/search/${WS}?q=${WORD}&limit=100`), A(`/search/${WS}?q=${WORD}&limit=100`)])
  chk(
    mSearch.status === 200 && !names(mSearch) && names(aSearch),
    'search finds the member nothing of the private list — its task, its comment, its name — and finds the admin them',
    `the member's ${said(mSearch)} names it: ${names(mSearch)} ${mSearch.text.slice(0, 160)}; the admin's: ${names(aSearch)}`,
  )

  // ══ 7. A SPRINT'S TASKS ══════════════════════════════════════════════════
  console.log('\n▶ the workspace’s sprint, holding both')
  const [mSprint, aSprint] = await Promise.all([M(`/sprints/${sprintRow.id}/tasks`), A(`/sprints/${sprintRow.id}/tasks`)])
  chk(
    mSprint.status === 200 && !names(mSprint) && ids(mSprint).includes(OT) && ids(aSprint).includes(PT),
    'a sprint’s tasks, read by the member, have none of the private list’s — and the open one; the admin’s have it',
    `the member's ${said(mSprint)} ${JSON.stringify(ids(mSprint))}; the admin's has it: ${ids(aSprint).includes(PT)}`,
  )

  // ══ 8. AN AI ANSWER'S REFERENCES ═════════════════════════════════════════
  console.log('\n▶ an AI answer’s task and list chips')
  const refs = { workspaceId: WS, taskIds: [PT, OT], listIds: [PL, OL] }
  const [mRefs, aRefs] = await Promise.all([M('/ai/refs', { method: 'POST', body: refs }), A('/ai/refs', { method: 'POST', body: refs })])
  chk(
    mRefs.status === 200 && !names(mRefs) && mRefs.text.includes(OT) && names(aRefs),
    'an AI answer’s chips resolve nothing of the private list for the member — the open task resolves, and the admin’s resolve it',
    `the member's ${said(mRefs)} names it: ${names(mRefs)}, resolves the open task: ${mRefs.text.includes(OT)}; the admin's: ${names(aRefs)}`,
  )

  // ══ 9. THE DEPENDENCY GRAPH ══════════════════════════════════════════════
  console.log('\n▶ the dependency graph of the member’s task')
  const [mGraph, aGraph] = await Promise.all([M(`/tasks/${MINE}/dependencies/graph`), A(`/tasks/${MINE}/dependencies/graph`)])
  chk(
    mGraph.status === 200 && !names(mGraph) && names(aGraph),
    'the member’s dependency graph names no task of the private list — the admin’s does',
    `the member's ${said(mGraph)} names it: ${names(mGraph)}; the admin's: ${names(aGraph)}`,
  )

  // ══ 10. THE AI'S STATUS COUNT ════════════════════════════════════════════
  console.log('\n▶ the AI’s count of the workspace’s tasks')
  const [mCount, aCount] = await Promise.all([M(`/ai/project-status?workspaceId=${WS}`), A(`/ai/project-status?workspaceId=${WS}`)])
  const total = (res) => Number(res.data?.total ?? NaN)
  chk(
    mCount.status === 200 && total(mCount) === total(aCount) - 2,
    'the AI’s status count leaves the private list’s two tasks out of the member’s total — and counts them in the admin’s',
    `the member's ${said(mCount)} total ${total(mCount)}; the admin's ${total(aCount)}`,
  )

  // ══ 11. THE MEMBER'S OWN CALENDAR FEED ═══════════════════════════════════
  console.log('\n▶ the member’s own calendar feed')
  const minted = await M(`/workspaces/${WS}/calendar-sync/ical-token`, { method: 'POST', body: {} })
  const token = minted.data?.token ?? minted.data?.icalToken ?? null
  const feed = token
    ? await fetch(`${API}/ical/${token}.ics`).then(async (r) => ({ status: r.status, text: await r.text() }), () => ({ status: 0, text: '' }))
    : { status: 0, text: '' }
  chk(
    feed.status === 200 && !feed.text.includes(WORD) && feed.text.includes(`${TAG} the member's own task`),
    'the member’s own feed carries none of the private list’s tasks, even one assigned to them — and carries their own',
    `token ${said(minted)}; the feed ${feed.status} carries the private list's: ${feed.text.includes(WORD)}, their own task: ${feed.text.includes(`${TAG} the member's own task`)}`,
  )

  // ══ 12. A COLLEAGUE'S STANDUP ════════════════════════════════════════════
  console.log('\n▶ the admin’s standup, asked for by the member')
  const [mStandup, aStandup] = await Promise.all([
    M(`/workspaces/${WS}/people/${adminId}/standup`, { method: 'POST', body: { days: 7 } }),
    A(`/workspaces/${WS}/people/${adminId}/standup`, { method: 'POST', body: { days: 7 } }),
  ])
  chk(
    mStandup.ok && !names(mStandup) && names(aStandup),
    'the admin’s standup, asked for by the member, names none of the private list’s tasks — nor what holds them up — and the admin’s own does',
    `the member's ${said(mStandup)} names it: ${names(mStandup)}; the admin's own: ${names(aStandup)}`,
  )

  // ══ 13. THE PROMPT A MODEL IS SENT ═══════════════════════════════════════
  /*
   * Where a model answers. On a lane with RUNDESK_LANE_MODEL the API talks to
   * `model-stub.mjs`, which records every prompt it is sent; chat and command
   * build their contexts separately. With no model (CI) no prompt is built,
   * and the member is refused with 503 before it would be — one check either
   * way, as `workspace-read-access` §3 has it.
   */
  console.log('\n▶ the prompts AI chat and the command assistant send a model')
  const modelOn = (await A('/ai/status')).data?.available === true
  const MODEL = `http://127.0.0.1:${argOf('--model', process.env.E2E_MODEL_PORT ?? String(9200 + (API_PORT - 3020)))}`
  const chatBody = { workspaceId: WS, messages: [{ role: 'user', content: 'What is everyone working on? List every list and task.' }] }
  if (modelOn) {
    const seen = async () => (await fetch(`${MODEL}/__control/seen`).then((r) => r.json()).catch(() => null))?.calls ?? null
    const before = (await seen())?.length ?? null
    await M('/ai/chat', { method: 'POST', body: chatBody })
    await M('/ai/command', { method: 'POST', body: { workspaceId: WS, message: 'list every list and task' } })
    const memberPrompts = ((await seen()) ?? []).slice(before ?? 0)
    const mid = (await seen())?.length ?? null
    await A('/ai/chat', { method: 'POST', body: chatBody })
    await A('/ai/command', { method: 'POST', body: { workspaceId: WS, message: 'list every list and task' } })
    const adminPrompts = ((await seen()) ?? []).slice(mid ?? 0)
    const named = (calls) => calls.some((c) => JSON.stringify(c).includes(WORD))
    chk(
      before !== null && memberPrompts.length >= 2 && !named(memberPrompts) && named(adminPrompts),
      'the prompts a model is sent name, for the member, nothing of the private list — the admin’s name it',
      before === null
        ? `a model is configured but its stub could not be read at ${MODEL}`
        : `the member's ${memberPrompts.length} prompt(s) ${named(memberPrompts) ? 'NAME' : 'do not name'} it; the admin's ${adminPrompts.length} ${named(adminPrompts) ? 'name' : 'do not name'} it`,
    )
  } else {
    const memberChat = await M('/ai/chat', { method: 'POST', body: chatBody })
    chk(
      memberChat.status === 503,
      'the prompts a model is sent name, for the member, nothing of the private list — the admin’s name it',
      `no model is configured here, so no prompt is built; the member's chat answered ${said(memberChat)}, not the 503 that says so`,
    )
  }
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

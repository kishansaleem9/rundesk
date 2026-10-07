/**
 * AN AUTOMATION'S NOTIFICATION REACHES ONLY THOSE WHO MAY OPEN ITS TASK.
 *
 * NOT A FRAME ROW: `found-7-oct/automation-notifications-reach-every-member`.
 * The "Send notification" action wrote a notification for every member of the
 * workspace but the one who made the change: a guest with nothing shared, and a
 * member outside a private list, each heard of a task the API refuses them
 * (403), by its id and the rule's message.
 *
 * A rule on status changes, with that action; a task in an open list, assigned
 * to a member, and one in the admin's private list, each moved by the admin.
 * Who was notified is read by SQL, and whether each may open the task, by the
 * API as them.
 *
 *   node test/e2e/automation-notices.mjs --api 3021
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
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `atn${stamp}`
let sql = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — who was notified is read by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  const A = apiAs(auth.accessToken)
  const WS = must(await A('/workspaces', { method: 'POST', body: { name: TAG } }), 'make the workspace').id
  const person = async (who, role) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const signed = await signUpApi(API, {
      fullName: `Notices ${who}`, email, password: 'Member@12345!',
      organizationName: `Notices ${who} ${stamp}`, organizationSlug: `notices-${who}-${stamp}`,
    })
    must(await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } }), `add the ${who}`)
    return { who, id: signed.user?.id, as: apiAs(signed.accessToken) }
  }
  // A member the open list's task is assigned to, a member it is not, and a guest with nothing shared.
  const assignee = await person('assignee', 'member')
  const member = await person('member', 'member')
  const guest = await person('guest', 'guest')
  const people = [assignee, member, guest]
  const make = async (route, body, what) => must(await A(route, { method: 'POST', body }), `make ${what}`).id
  const SPACE = await make('/spaces', { workspaceId: WS, name: `${TAG} space` }, 'the space')
  const PROJECT = await make('/projects', { spaceId: SPACE, name: `${TAG} project` }, 'the project')
  const OPEN = await make('/lists', { projectId: PROJECT, name: `${TAG} open list` }, 'the open list')
  const PRIVATE = await make('/lists', { projectId: PROJECT, name: `${TAG} private list`, visibility: 'private' }, 'the private list')
  const OPEN_TASK = await make('/tasks', { listId: OPEN, title: `${TAG} open task` }, 'the open list’s task')
  const PRIVATE_TASK = await make('/tasks', { listId: PRIVATE, title: `${TAG} private task` }, 'the private list’s task')
  must(await A(`/tasks/${OPEN_TASK}/assignees`, { method: 'POST', body: { userId: assignee.id } }), 'assign the open list’s task')
  const MESSAGE = `${TAG} moved`
  const RULE = must(await A(`/workspaces/${WS}/automations`, {
    method: 'POST',
    body: { name: `${TAG} rule`, trigger: { type: 'task.status_changed' }, actions: [{ type: 'send_notification', params: { message: MESSAGE } }] },
  }), 'make the rule').id

  for (const [task, what] of [[PRIVATE_TASK, 'private'], [OPEN_TASK, 'open']]) {
    must(await A(`/tasks/${task}`, { method: 'PATCH', body: { status: 'in_progress' } }), `move the ${what} list’s task`)
  }
  // The rule runs after the change is answered; both runs are logged, notified or not.
  const ran = await waitUntil(async () => (await sql`select count(*)::int as n from automation_runs where automation_id = ${RULE}`)[0].n >= 2, { timeoutMs: 15_000 })
  const runs = await sql`select outcome, error_msg from automation_runs where automation_id = ${RULE}`
  const notified = await sql`
    select user_id::text as "userId", target->>'entityId' as "taskId" from notifications
    where workspace_id = ${WS} and body = ${MESSAGE}`
  const heard = (p, task) => notified.filter((n) => n.userId === p.id && n.taskId === task).length
  const opens = async (p, task) => (await p.as(`/tasks/${task}`)).status === 200
  const said2 = async (task) => (await Promise.all(people.map(async (p) => `${p.who} ${heard(p, task)} (opens it: ${await opens(p, task)})`))).join(', ')

  console.log('\n▶ a rule notifies on status changes; the admin moves a task in their private list')
  chk(
    ran && runs.every((r) => r.outcome === 'success'),
    'the rule ran for each change, and each run succeeded',
    `runs: ${JSON.stringify(runs)}`,
  )
  chk(
    people.every((p) => heard(p, PRIVATE_TASK) === 0),
    'a task in a private list is told to nobody it is closed to: not a member outside the list, not a guest, not a member assigned elsewhere',
    `notified: ${await said2(PRIVATE_TASK)}`,
  )
  console.log('\n▶ and a task in an open list')
  chk(
    heard(assignee, OPEN_TASK) === 1 && heard(member, OPEN_TASK) === 1 && heard(guest, OPEN_TASK) === 0
      && (await opens(assignee, OPEN_TASK)) && (await opens(member, OPEN_TASK)) && !(await opens(guest, OPEN_TASK)),
    'a task in an open list is told once to each member who may open it, and not to a guest it is not shared with',
    `notified: ${await said2(OPEN_TASK)}`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  await sql?.end({ timeout: 5 }).catch(() => {})
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}

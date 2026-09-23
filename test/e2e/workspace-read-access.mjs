/**
 * WORKSPACE-WIDE READS SHOW ONLY WHAT THE CALLER MAY OPEN.
 *
 * NOT A FRAME ROW: `found-23-sep/workspace-reads-skip-the-container-rule`.
 * Routes that list tasks from across a workspace are guarded by workspace
 * membership alone, so each has to apply the caller's access itself: the
 * container rule (a private space or project is its members'; managers see
 * all; `containerVisibilityFilter` is the guard's own SQL twin) and the
 * private-item rule (a private task is its creator's, its assignees' and the
 * managers'). Measured on lane 1 before the fix, as a member who gets 403 on a
 * private space's list, and as a guest:
 *
 *   · `GET /tasks/workspace/:ws/members/:userId` applied neither rule. Asking
 *     for the admin's assigned tasks returned the private space's task, with
 *     the space's and the list's names.
 *   · `GET /tasks/workspace/:ws/timeline` applied only the private-item rule.
 *     The private space's dated task was on the member's timeline.
 *
 * Each read is made three times: by a member refused the private space, by a
 * guest, and by the admin, who may open everything and must still see it all.
 *
 *   node test/e2e/workspace-read-access.mjs --api 3021
 */
import { signInApi, signUpApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'

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
const PERSON_PASSWORD = 'Member@12345!'

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
const said = (res) => `${res.status} ${JSON.stringify(res.error ?? null).slice(0, 120)}`

const stamp = Date.now()
const TAG = `wra-${stamp}`
const day = 24 * 60 * 60 * 1000
let sql = null
let WS = null
let A = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the private task is marked private by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const adminId = (await A('/users/me')).data?.id
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id

  const person = async (label, role) => {
    const email = `${TAG}-${label}@rundesk.invalid`
    const data = await signUpApi(API, {
      fullName: `Reads ${label}`, email, password: PERSON_PASSWORD,
      organizationName: `Reads ${label} ${stamp}`, organizationSlug: `reads-${label}-${stamp}`,
    })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (added.status >= 300) throw new Error(`could not add the ${label}: ${said(added)}`)
    return apiAs(data.accessToken)
  }
  const M = await person('member', 'member')
  const G = await person('guest', 'guest')

  const make = async (route, body, what) => {
    const res = await A(route, { method: 'POST', body })
    if (res.status >= 300 || !res.data?.id) throw new Error(`could not make ${what}: ${said(res)}`)
    return res.data.id
  }
  const listIn = async (spaceBody, what) => {
    const space = await make('/spaces', { workspaceId: WS, ...spaceBody }, `the ${what} space`)
    const project = await make('/projects', { spaceId: space, name: `${TAG} ${what}` }, `the ${what} project`)
    return make('/lists', { projectId: project, name: `${TAG} ${what} list` }, `the ${what} list`)
  }
  const OPEN_LIST = await listIn({ name: `${TAG} open` }, 'open')
  const PRIVATE_LIST = await listIn({ name: `${TAG} private`, visibility: 'private' }, 'private')
  // Dated, so the timeline has them; assigned to the admin, whose list is read.
  const adminTask = (listId, title) =>
    make('/tasks', {
      listId, title: `${TAG} ${title}`, assigneeIds: [adminId],
      dueDate: new Date(Date.now() + 2 * day).toISOString(),
    }, title)
  const OPEN = await adminTask(OPEN_LIST, 'in the open space')
  const HIDDEN = await adminTask(PRIVATE_LIST, 'in the private space')
  const PRIVATE = await adminTask(OPEN_LIST, 'a private task')
  await sql`update tasks set visibility = 'private' where id = ${PRIVATE}`

  const refused = await M(`/tasks/list/${PRIVATE_LIST}`)
  if (refused.status !== 403) throw new Error(`the member was not refused the private list (${said(refused)}), so nothing here would mean anything`)

  const ids = (res) => (res.data ?? []).map((t) => t.id)
  const shown = (res) => JSON.stringify((res.data ?? []).map((t) => `${t.title}${t.spaceName ? ` [${t.spaceName}]` : ''}`)).slice(0, 220)
  const holdsOnly = (res) => res.status === 200 && ids(res).includes(OPEN) && !ids(res).includes(HIDDEN) && !ids(res).includes(PRIVATE)

  // ══ 1. SOMEBODY ELSE'S ASSIGNED TASKS ════════════════════════════════════
  console.log('\n▶ another member’s assigned tasks, read as the caller may see them')

  const memberReads = await M(`/tasks/workspace/${WS}/members/${adminId}`)
  chk(
    holdsOnly(memberReads),
    'a member reading the admin’s tasks gets none from a space they are refused, nor a private task — while the rest are listed',
    `it answered ${memberReads.status} with ${shown(memberReads)}`,
  )
  const guestReads = await G(`/tasks/workspace/${WS}/members/${adminId}`)
  chk(
    holdsOnly(guestReads),
    'and so does a guest',
    `it answered ${guestReads.status} with ${shown(guestReads)}`,
  )
  const adminReads = await A(`/tasks/workspace/${WS}/members/${adminId}`)
  chk(
    adminReads.status === 200 && [OPEN, HIDDEN, PRIVATE].every((id) => ids(adminReads).includes(id)),
    'while the admin, whose tasks they are and who may open everything, reads all three',
    `it answered ${adminReads.status} with ${shown(adminReads)}`,
  )

  // ══ 2. THE WORKSPACE TIMELINE ════════════════════════════════════════════
  console.log('\n▶ the workspace timeline, drawn as the caller may see it')

  const memberTimeline = await M(`/tasks/workspace/${WS}/timeline`)
  chk(
    holdsOnly(memberTimeline),
    'a member’s timeline has nothing from a space they are refused, nor a private task — while the rest are on it',
    `it answered ${memberTimeline.status} with ${shown(memberTimeline)}`,
  )
  const guestTimeline = await G(`/tasks/workspace/${WS}/timeline`)
  chk(
    holdsOnly(guestTimeline),
    'and neither does a guest’s',
    `it answered ${guestTimeline.status} with ${shown(guestTimeline)}`,
  )
  const adminTimeline = await A(`/tasks/workspace/${WS}/timeline`)
  chk(
    adminTimeline.status === 200 && [OPEN, HIDDEN, PRIVATE].every((id) => ids(adminTimeline).includes(id)),
    'while the admin’s timeline has all three',
    `it answered ${adminTimeline.status} with ${shown(adminTimeline)}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  if (WS && A) {
    const gone = await A(`/workspaces/${WS}`, { method: 'DELETE' })
    if (gone.status >= 300 || gone.status === 0) console.log(`  \x1b[33mnote\x1b[0m cleanup answered ${gone.status}`)
  }
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}

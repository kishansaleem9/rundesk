/**
 * A SPRINT IS READ AND CHANGED WHERE ITS SPACE LETS ITS READER.
 *
 * NOT A FRAME ROW: `found-24-sep/sprints-open-to-any-member`. A private space's
 * sprint was listed, named and opened to every member (its tasks alone were
 * filtered), and the sprint report listed it too. Any member, or guest, could
 * make a sprint anywhere — in a private space they were refused, a "view only"
 * space, or under another workspace's space id — and rename or delete any
 * sprint, a private space's included: the writes took no actor at all. And a
 * rename spread its whole body into the row, so naming `spaceId` or
 * `workspaceId` in it moved the sprint into a private space, or out of the
 * workspace altogether.
 *
 * The rule, ClickUp's (a sprint is a list in a space's Sprint folder): seen by
 * whoever may see its space, made and changed by whoever holds "edit" there; a
 * guest is given no sprint. A sprint of no space is the workspace's members'.
 *
 * Sprints and their tasks are planted by SQL; every refusal is read back from
 * the row, beside a twin the same person is allowed.
 *
 *   node test/e2e/sprint-access.mjs --api 3021
 */
import { signInApi, signUpApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 7

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
const TAG = `spa-${stamp}`
const WORD = `SECRET${stamp}`
let sql = null
let A = null
const workspaces = []

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the sprints are planted by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const newWorkspace = async (name) => {
    const made = await A('/workspaces', { method: 'POST', body: { name } })
    if (made.status >= 300 || !made.data?.id) throw new Error(`could not make a workspace: ${said(made)}`)
    workspaces.push(made.data.id)
    return made.data.id
  }
  const WS = await newWorkspace(TAG)
  const OTHER = await newWorkspace(`${TAG} other`)
  const person = async (who, role) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const signed = await signUpApi(API, {
      fullName: `Sprint ${who}`, email, password: 'Member@12345!',
      organizationName: `Sprint ${who} ${stamp}`, organizationSlug: `sprint-${who}-${stamp}`,
    })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (added.status >= 300) throw new Error(`could not add the ${who}: ${said(added)}`)
    return apiAs(signed.accessToken)
  }
  const M = await person('member', 'member')
  const G = await person('guest', 'guest')
  const make = async (route, body, what) => {
    const res = await A(route, { method: 'POST', body })
    if (res.status >= 300 || !res.data?.id) throw new Error(`could not make ${what}: ${said(res)}`)
    return res.data.id
  }
  const OPEN = await make('/spaces', { workspaceId: WS, name: `${TAG} open` }, 'the open space')
  const PRIVATE = await make('/spaces', { workspaceId: WS, name: `${WORD} space`, visibility: 'private' }, 'the private space')
  const VIEW = await make('/spaces', { workspaceId: WS, name: `${TAG} view only` }, 'the view-only space')
  await sql`update spaces set default_permission = 'view' where id = ${VIEW}`
  const FOREIGN = await make('/spaces', { workspaceId: OTHER, name: `${TAG} another workspace's space` }, 'the other workspace’s space')
  const project = await make('/projects', { spaceId: OPEN, name: `${TAG} project` }, 'the project')
  const list = await make('/lists', { projectId: project, name: `${TAG} list` }, 'the list')
  const task = await make('/tasks', { listId: list, title: `${TAG} an open task` }, 'the open task')
  const sprint = async (spaceId, name) =>
    (await sql`insert into sprints (workspace_id, space_id, name, goal, status, start_date, end_date)
               values (${WS}, ${spaceId}, ${name}, ${`${name}, its goal`}, 'active', now() - interval '2 days', now() + interval '5 days')
               returning id`)[0].id
  const sOpen = await sprint(OPEN, `${TAG} open space's sprint`)
  const sPriv = await sprint(PRIVATE, `${WORD} sprint`)
  const sNone = await sprint(null, `${TAG} the workspace's sprint`)
  const sView = await sprint(VIEW, `${TAG} view-only space's sprint`)
  await sql`insert into sprint_tasks (sprint_id, task_id) values (${sPriv}, ${task}), (${sOpen}, ${task})`
  const nameOf = async (id) => (await sql`select name from sprints where id = ${id}`)[0]?.name ?? null
  const namesIn = (res) => JSON.stringify(res.data ?? []).includes(WORD)

  // ══ 1. THE LIST ══════════════════════════════════════════════════════════
  console.log('\n▶ the workspace’s sprints')
  const [mList, gList, aList] = await Promise.all([M(`/workspaces/${WS}/sprints`), G(`/workspaces/${WS}/sprints`), A(`/workspaces/${WS}/sprints`)])
  const ids = (res) => (res.data ?? []).map((s) => s.id)
  chk(
    mList.status === 200 && !namesIn(mList) && ids(mList).includes(sOpen) && ids(mList).includes(sNone) &&
      gList.status === 200 && ids(gList).length === 0 && ids(aList).includes(sPriv),
    'a member’s sprints are the open space’s and the workspace’s, not the private space’s; a guest is given none; the admin all',
    `the member ${said(mList)} names the private one: ${namesIn(mList)} (${ids(mList).length} listed); the guest ${said(gList)} ${ids(gList).length} listed; the admin lists it: ${ids(aList).includes(sPriv)}`,
  )

  // ══ 2. ONE SPRINT ════════════════════════════════════════════════════════
  console.log('\n▶ a private space’s sprint, opened by id')
  const [mDetail, mTasks, mOpenDetail, aDetail] = await Promise.all([
    M(`/sprints/${sPriv}`), M(`/sprints/${sPriv}/tasks`), M(`/sprints/${sOpen}`), A(`/sprints/${sPriv}`),
  ])
  chk(
    mDetail.status === 404 && !namesIn(mDetail) && mTasks.status === 404 && mOpenDetail.status === 200 && aDetail.status === 200,
    'a private space’s sprint is not found for a member refused the space, nor its tasks — the open one opens, and the admin opens it',
    `the member: detail ${said(mDetail)}, tasks ${said(mTasks)}, the open one ${mOpenDetail.status}; the admin ${aDetail.status}`,
  )

  // ══ 3. THE SPRINT REPORT ═════════════════════════════════════════════════
  console.log('\n▶ the sprint report')
  const [mReport, aReport] = await Promise.all([M(`/workspaces/${WS}/reports/sprints`), A(`/workspaces/${WS}/reports/sprints`)])
  const reported = (res) => (res.data ?? []).map((s) => s.sprintId)
  chk(
    mReport.status === 200 && !namesIn(mReport) && reported(mReport).includes(sOpen) && reported(aReport).includes(sPriv),
    'the sprint report names no sprint of a space the member is refused — it has the open one, and the admin’s has the private one',
    `the member ${said(mReport)} names it: ${namesIn(mReport)}, has the open one: ${reported(mReport).includes(sOpen)}; the admin's has it: ${reported(aReport).includes(sPriv)}`,
  )

  // ══ 4. MAKING ONE ════════════════════════════════════════════════════════
  console.log('\n▶ making a sprint')
  const window = { startDate: new Date().toISOString(), endDate: new Date(Date.now() + 7 * 864e5).toISOString() }
  const attempt = async (C, spaceId, name) => {
    const res = await C(`/workspaces/${WS}/sprints`, { method: 'POST', body: { spaceId, name, ...window } })
    const [row] = await sql`select count(*)::int as n from sprints where name = ${name}`
    return { res, made: row.n }
  }
  const inPrivate = await attempt(M, PRIVATE, `${TAG} member's, in the private space`)
  const inForeign = await attempt(M, FOREIGN, `${TAG} member's, under another workspace's space`)
  const inView = await attempt(M, VIEW, `${TAG} member's, in the view-only space`)
  const byGuest = await attempt(G, OPEN, `${TAG} guest's, in the open space`)
  const inOpen = await attempt(M, OPEN, `${TAG} member's, in the open space`)
  const refused = [inPrivate, inForeign, inView, byGuest]
  chk(
    refused.every((r) => r.res.status >= 400 && r.res.status < 500 && r.made === 0) && inOpen.res.status === 201 && inOpen.made === 1,
    'a sprint is not made in a private space the member is refused, under another workspace’s space, in a view-only space, or by a guest — a member makes one in the open space',
    `private ${said(inPrivate.res)} (${inPrivate.made} made), foreign ${said(inForeign.res)} (${inForeign.made}), view-only ${said(inView.res)} (${inView.made}), guest ${said(byGuest.res)} (${byGuest.made}); the open space ${said(inOpen.res)} (${inOpen.made})`,
  )

  // ══ 5. CHANGING ONE ══════════════════════════════════════════════════════
  console.log('\n▶ renaming and deleting sprints')
  const renamePriv = await M(`/sprints/${sPriv}`, { method: 'PATCH', body: { name: `${TAG} renamed by the member` } })
  const deletePriv = await M(`/sprints/${sPriv}`, { method: 'DELETE' })
  const renameView = await M(`/sprints/${sView}`, { method: 'PATCH', body: { name: `${TAG} renamed in view only` } })
  const guestRename = await G(`/sprints/${sOpen}`, { method: 'PATCH', body: { name: `${TAG} renamed by the guest` } })
  const privName = await nameOf(sPriv)
  const viewName = await nameOf(sView)
  const openAfterGuest = await nameOf(sOpen)
  const memberRename = await M(`/sprints/${sOpen}`, { method: 'PATCH', body: { name: `${TAG} renamed by the member, in the open` } })
  const openName = await nameOf(sOpen)
  chk(
    renamePriv.status === 404 && deletePriv.status === 404 && privName === `${WORD} sprint` &&
      renameView.status === 403 && viewName === `${TAG} view-only space's sprint` &&
      guestRename.status === 404 && openAfterGuest === `${TAG} open space's sprint` &&
      memberRename.status === 200 && openName === `${TAG} renamed by the member, in the open`,
    'a member neither renames nor deletes a private space’s sprint, nor renames a view-only space’s, and a guest, given no sprint, renames none — a member renames the open one',
    `private: rename ${said(renamePriv)}, delete ${said(deletePriv)}, now ${JSON.stringify(privName)}; view-only: ${said(renameView)}, now ${JSON.stringify(viewName)}; ` +
      `the guest: ${said(guestRename)}, now ${JSON.stringify(openAfterGuest)}; the member in the open: ${said(memberRename)}, now ${JSON.stringify(openName)}`,
  )

  // ══ 6. ITS TASKS ═════════════════════════════════════════════════════════
  console.log('\n▶ a sprint’s tasks')
  const removeFromPriv = await M(`/sprints/${sPriv}/tasks/${task}`, { method: 'DELETE' })
  const addToPriv = await M(`/sprints/${sPriv}/tasks`, { method: 'POST', body: { taskId: task } })
  const [{ n: stillIn }] = await sql`select count(*)::int as n from sprint_tasks where sprint_id = ${sPriv} and task_id = ${task}`
  const removeFromOpen = await M(`/sprints/${sOpen}/tasks/${task}`, { method: 'DELETE' })
  const [{ n: openLeft }] = await sql`select count(*)::int as n from sprint_tasks where sprint_id = ${sOpen} and task_id = ${task}`
  chk(
    removeFromPriv.status === 404 && addToPriv.status === 404 && stillIn === 1 && removeFromOpen.status < 300 && openLeft === 0,
    'a member moves no task in or out of a private space’s sprint — and takes one out of the open one',
    `the private sprint: remove ${said(removeFromPriv)}, add ${said(addToPriv)}, the task still in: ${stillIn}; the open sprint: remove ${said(removeFromOpen)}, left ${openLeft}`,
  )

  // ══ 7. A RENAME THAT NAMES MORE ══════════════════════════════════════════
  console.log('\n▶ a rename that also names a space and a workspace')
  const [before] = await sql`select space_id, workspace_id from sprints where id = ${sNone}`
  const renamedMore = await M(`/sprints/${sNone}`, { method: 'PATCH', body: { name: `${TAG} renamed with more`, spaceId: PRIVATE, workspaceId: OTHER } })
  const [after] = await sql`select name, space_id, workspace_id from sprints where id = ${sNone}`
  chk(
    renamedMore.status === 200 && after?.name === `${TAG} renamed with more` && after?.space_id === before?.space_id && after?.workspace_id === WS,
    'a rename changes the name, and moves the sprint neither into a private space nor to another workspace',
    `${said(renamedMore)}; now named ${JSON.stringify(after?.name ?? null)}, in space ${after?.space_id === PRIVATE ? 'THE PRIVATE ONE' : JSON.stringify(after?.space_id ?? null)}, workspace ${after?.workspace_id === OTHER ? 'THE OTHER ONE' : after?.workspace_id === WS ? 'its own' : JSON.stringify(after?.workspace_id ?? null)}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  for (const ws of A ? workspaces : []) {
    const gone = await A(`/workspaces/${ws}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${ws} answered ${gone.status || 'nothing'}`)
  }
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}

/**
 * A CONTAINER'S STATUSES ARE SHAPED BY WHOEVER MAY ADD TO IT — NOT BY WHOEVER CAN READ IT.
 *
 * NOT A FRAME ROW: `found-25-sep/statuses-written-by-readers`. The status
 * routes of a space, a project and a list — create, rename, delete, reorder,
 * and a list's choice of whose statuses it uses — asked only whether the
 * caller could READ the container (`ResourceMemberGuard`). Measured on lane 5:
 * a guest with one list shared with them to view passed through its project
 * and made a status on it (201, the row made). Deleting a status moves every
 * task in it, so a reader could change other people's tasks.
 *
 * ClickUp (help centre, search snippets): owners, admins and members manage
 * statuses by default, because a location's default permission is Full edit;
 * a guest does so only where an advanced permission allows it. So: somebody
 * who may add to the space (the create gate's `edit`), and never a guest.
 *
 * Every refusal is read back by SQL beside the same write succeeding for
 * somebody it is theirs to make.
 *
 *   node test/e2e/status-write-access.mjs --api 3021
 */
import { signInApi, signUpApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 4

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

/* NEVER THROWS — `{status, data}`. Every call site reads `status`. */
const apiAs = (token) => async (route, init = {}) => {
  const headers = { authorization: `Bearer ${token}` }
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, { ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined }).catch(() => null)
  if (!res) return { status: 0, data: null }
  return { status: res.status, data: (await res.json().catch(() => null))?.data }
}
const refused = (status) => status === 403 || status === 404

const stamp = Date.now()
const TAG = `swa${stamp}`
let sql = null
let WS = null
let A = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — every refusal is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${made.status}`)
  WS = made.data.id
  const person = async (who, role) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const signed = await signUpApi(API, {
      fullName: `Shaper ${who}`, email, password: 'Shaper@12345!',
      organizationName: `Shaper ${who} ${stamp}`, organizationSlug: `shaper-${who}-${stamp}`,
    })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (added.status >= 300) throw new Error(`could not add the ${who}: ${added.status}`)
    return { id: signed.user?.id, as: apiAs(signed.accessToken) }
  }
  const member = await person('member', 'member')
  const guest = await person('guest', 'guest')
  const M = member.as
  const G = guest.as
  const place = async (name, defaultPermission) => {
    const space = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} ${name}`, ...(defaultPermission ? { defaultPermission } : {}) } })
    if (space.status >= 300 || !space.data?.id) throw new Error(`could not make the ${name} space: ${space.status}`)
    const project = await A('/projects', { method: 'POST', body: { spaceId: space.data.id, name: `${TAG} ${name}` } })
    const [list] = await sql`insert into lists (project_id, name) values (${project.data?.id}, ${`${TAG} ${name} list`}) returning id`
    const [other] = await sql`insert into lists (project_id, name) values (${project.data?.id}, ${`${TAG} ${name} other list`}) returning id`
    return { space: space.data.id, project: project.data?.id, list: list.id, other: other.id }
  }
  const OPEN = await place('open')
  const VIEW = await place('view only', 'view')
  // The guest passes through OPEN's project (a list shared to view), and edits another of its lists.
  await sql`insert into object_shares (workspace_id, object_type, object_id, user_id, level) values (${WS}, 'list', ${OPEN.list}, ${guest.id}, 'view')`
  await sql`insert into object_shares (workspace_id, object_type, object_id, user_id, level) values (${WS}, 'list', ${OPEN.other}, ${guest.id}, 'edit')`
  const named = async (table, col, id, name) =>
    (await sql.unsafe(`select count(*)::int as n from ${table} where ${col} = $1 and name = $2`, [id, name]))[0].n

  // ══ 1. A GUEST PASSING THROUGH A PROJECT ═════════════════════════════════
  console.log('\n▶ the project a guest passes through, and its statuses')
  const gMade = await G(`/projects/${OPEN.project}/statuses`, { method: 'POST', body: { name: `${TAG} byguest`, category: 'in_progress' } })
  const aMade = await A(`/projects/${OPEN.project}/statuses`, { method: 'POST', body: { name: `${TAG} byadmin`, category: 'in_progress' } })
  const [adminStatus] = await sql`select id, name from project_statuses where project_id = ${OPEN.project} and name = ${`${TAG} byadmin`}`
  const gRename = adminStatus ? await G(`/projects/${OPEN.project}/statuses/${adminStatus.id}`, { method: 'PATCH', body: { name: `${TAG} renamedbyguest` } }) : { status: 0 }
  const gDelete = adminStatus ? await G(`/projects/${OPEN.project}/statuses/${adminStatus.id}`, { method: 'DELETE' }) : { status: 0 }
  const gReorder = await G(`/projects/${OPEN.project}/statuses/reorder`, { method: 'POST', body: { orderedIds: adminStatus ? [adminStatus.id] : [] } })
  const [still] = await sql`select name from project_statuses where id = ${adminStatus?.id ?? '00000000-0000-0000-0000-000000000000'}`
  const byGuest = await named('project_statuses', 'project_id', OPEN.project, `${TAG} byguest`)
  chk(
    refused(gMade.status) && byGuest === 0 && aMade.status < 300 && Boolean(adminStatus)
      && refused(gRename.status) && refused(gDelete.status) && refused(gReorder.status) && still?.name === `${TAG} byadmin`,
    'a guest who passes through a project makes, renames, deletes and reorders none of its statuses (refused, all unchanged) — the admin makes one',
    `the guest: made ${gMade.status} (${byGuest}), renamed ${gRename.status}, deleted ${gDelete.status}, reordered ${gReorder.status}; the admin made ${aMade.status}; the status is now ${JSON.stringify(still?.name ?? null)}`,
  )

  // ══ 2. A MEMBER IN A VIEW-ONLY SPACE ═════════════════════════════════════
  console.log('\n▶ a member, in a view-only space and in an open one')
  const mSpace = await M(`/spaces/${VIEW.space}/statuses`, { method: 'POST', body: { name: `${TAG} viewspace` } })
  const mProject = await M(`/projects/${VIEW.project}/statuses`, { method: 'POST', body: { name: `${TAG} viewproject` } })
  const mList = await M(`/lists/${VIEW.list}/statuses`, { method: 'POST', body: { name: `${TAG} viewlist` } })
  const mOpen = await M(`/spaces/${OPEN.space}/statuses`, { method: 'POST', body: { name: `${TAG} openspace` } })
  const rows = {
    space: await named('space_statuses', 'space_id', VIEW.space, `${TAG} viewspace`),
    project: await named('project_statuses', 'project_id', VIEW.project, `${TAG} viewproject`),
    list: await named('list_statuses', 'list_id', VIEW.list, `${TAG} viewlist`),
    open: await named('space_statuses', 'space_id', OPEN.space, `${TAG} openspace`),
  }
  chk(
    mSpace.status === 403 && mProject.status === 403 && mList.status === 403 && rows.space + rows.project + rows.list === 0
      && mOpen.status < 300 && rows.open === 1,
    'a member of a view-only space makes no status on it, its project or its list (403, none made) — in an open space the same member makes one',
    `in the view-only space: ${mSpace.status}, ${mProject.status}, ${mList.status}, made ${rows.space + rows.project + rows.list}; in the open one ${mOpen.status}, made ${rows.open}`,
  )

  // ══ 3. A GUEST WITH EDIT ══════════════════════════════════════════════
  // Given a list to edit, and then the whole space: the level would let them in
  // there, so what refuses them is that guests do not change statuses at all.
  console.log('\n▶ a guest given a list, then a space, to edit')
  const gList = await G(`/lists/${OPEN.other}/statuses`, { method: 'POST', body: { name: `${TAG} guestlist` } })
  await sql`insert into space_members (space_id, user_id, role) values (${OPEN.space}, ${guest.id}, 'edit')`
  const gSpace = await G(`/spaces/${OPEN.space}/statuses`, { method: 'POST', body: { name: `${TAG} guestspace` } })
  const mList2 = await M(`/lists/${OPEN.other}/statuses`, { method: 'POST', body: { name: `${TAG} memberlist` } })
  const [gRows, gSpaceRows, mRows] = [
    await named('list_statuses', 'list_id', OPEN.other, `${TAG} guestlist`),
    await named('space_statuses', 'space_id', OPEN.space, `${TAG} guestspace`),
    await named('list_statuses', 'list_id', OPEN.other, `${TAG} memberlist`),
  ]
  chk(
    gList.status === 403 && gRows === 0 && gSpace.status === 403 && gSpaceRows === 0 && mList2.status < 300 && mRows === 1,
    'a guest given a list, or a whole space, to edit still shapes none of their statuses (403, none made) — a member makes one there',
    `the guest: on the list ${gList.status} (${gRows}), on the space ${gSpace.status} (${gSpaceRows}); the member ${mList2.status} (${mRows})`,
  )

  // ══ 4. WHOSE STATUSES A LIST USES ════════════════════════════════════════
  console.log('\n▶ a list’s choice of statuses, switched')
  const scopeOf = async (id) => (await sql`select status_scope from lists where id = ${id}`)[0]?.status_scope ?? null
  // The project has statuses of its own to switch to (a scope with none is refused, 400).
  const projectStatus = await A(`/projects/${VIEW.project}/statuses`, { method: 'POST', body: { name: `${TAG} projectstatus`, category: 'open' } })
  if (projectStatus.status >= 300) throw new Error(`could not give the project a status: ${projectStatus.status}`)
  const before = await scopeOf(VIEW.list)
  const mScope = await M(`/lists/${VIEW.list}/status-scope`, { method: 'PATCH', body: { scope: 'project' } })
  const afterMember = await scopeOf(VIEW.list)
  const aScope = await A(`/lists/${VIEW.list}/status-scope`, { method: 'PATCH', body: { scope: 'project' } })
  const afterAdmin = await scopeOf(VIEW.list)
  chk(
    mScope.status === 403 && afterMember === before && aScope.status < 300 && afterAdmin === 'project',
    'a list in a view-only space keeps its statuses when a member switches them (403, unchanged) — the admin switches them',
    `was ${JSON.stringify(before)}; the member ${mScope.status}, now ${JSON.stringify(afterMember)}; the admin ${aScope.status}, now ${JSON.stringify(afterAdmin)}`,
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

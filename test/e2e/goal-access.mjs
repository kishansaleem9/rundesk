/**
 * A GOAL IS READ AND WRITTEN ONLY BY THOSE WHO MAY SEE IT.
 *
 * NOT A FRAME ROW: `found-24-sep/goals-open-across-workspaces`. Goals took no
 * reader at all. Measured on lane 1 before the fix:
 *   - a member refused a private space listed its goal, opened it, read its
 *     history and key results, renamed it, filed goals in the space and under
 *     the goal, moved an open goal into the space, and deleted its key result;
 *     the goals report counted it;
 *   - a guest listed every goal, created one and deleted one;
 *   - a user of ANOTHER organisation renamed and deleted this workspace's key
 *     results through a goal of their own (the route named both ids and read
 *     only the key result's), filed goals in this workspace's space and under
 *     its goal, made anyone the owner, and moved their own goal into this
 *     workspace by patching its `workspaceId`.
 *
 * The rule (ClickUp's: goals are the workspace's unless their location is
 * private, and a guest sees only what is shared with them — goals are not
 * shared here): a goal filed in a space is read by that space's rule, one in
 * no space by every member, and a guest reads none. Whoever may read a goal
 * may edit it. A key result is reached only through its own goal. A PATCH
 * changes only the fields it may. An owner must be able to read the goal.
 *
 * Every refusal is read back from the row as well as from the status, beside
 * a positive twin that the same route still does its work.
 *
 *   node test/e2e/goal-access.mjs --api 3021
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
const said = (res) => `${res.status} ${JSON.stringify(res.error ?? null).slice(0, 100)}`

const stamp = Date.now()
const TAG = `gac-${stamp}`
const WORD = `okapi${stamp}`
let sql = null
let WS = null
let SWS = null
let A = null
let S = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the goals are planted and read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const adminId = (await A('/users/me')).data?.id
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id

  const person = async (who, role) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const signed = await signUpApi(API, {
      fullName: `Goal ${who}`, email, password: 'Member@12345!',
      organizationName: `Goal ${who} ${stamp}`, organizationSlug: `goal-${who}-${stamp}`,
    })
    if (role) {
      const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
      if (added.status >= 300) throw new Error(`could not add the ${who}: ${said(added)}`)
    }
    return { id: signed.user?.id, as: apiAs(signed.accessToken) }
  }
  const member = await person('member', 'member')
  const guest = await person('guest', 'guest')
  const stranger = await person('stranger', null)
  const M = member.as
  const G = guest.as
  S = stranger.as

  const space = async (name, visibility) => {
    const res = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name, ...(visibility ? { visibility } : {}) } })
    if (res.status >= 300 || !res.data?.id) throw new Error(`could not make the space "${name}": ${said(res)}`)
    return res.data.id
  }
  const PS = await space(`${WORD} private space`, 'private')
  const OS = await space(`${TAG} open space`)
  const gate = await M(`/spaces/${PS}`)
  if (gate.ok) throw new Error(`the member was not refused the private space (${said(gate)}), so nothing here would mean anything`)

  // The goals and key results under test are planted by SQL, not made through
  // the routes this suite is about.
  const goal = async (workspaceId, title, spaceId = null) =>
    (await sql`insert into goals (workspace_id, space_id, title, owner_id) values (${workspaceId}, ${spaceId}, ${title}, ${adminId}) returning id`)[0].id
  const keyResult = async (goalId, workspaceId, title) =>
    (await sql`insert into goal_key_results (goal_id, workspace_id, title) values (${goalId}, ${workspaceId}, ${title}) returning id`)[0].id
  const gPriv = await goal(WS, `${WORD} private goal`, PS)
  const gOpen = await goal(WS, `${TAG} open goal`, OS)
  const gWs = await goal(WS, `${TAG} workspace goal`)
  const krPriv = await keyResult(gPriv, WS, `${WORD} private kr`)
  const krOpen = await keyResult(gOpen, WS, `${TAG} open kr`)
  await sql`insert into goal_updates (goal_id, author_id, from_value, to_value) values (${gPriv}, ${adminId}, 0, 10)`
  const rowOf = async (table, id) => (await sql`select * from ${sql(table)} where id = ${id}`)[0] ?? null
  const ids = (res) => (Array.isArray(res.data) ? res.data.map((g) => g.id) : [])

  // ══ 1. READS ═════════════════════════════════════════════════════════════
  console.log('\n▶ what a member refused the private space reads')
  const mList = await M(`/workspaces/${WS}/goals`)
  const aList = await A(`/workspaces/${WS}/goals`)
  chk(
    mList.status === 200 && ids(mList).includes(gOpen) && ids(mList).includes(gWs) && !ids(mList).includes(gPriv) && !mList.text.includes(WORD) &&
      [gPriv, gOpen, gWs].every((id) => ids(aList).includes(id)),
    'a member’s goal list holds the open space’s goal and the workspace’s, not the private space’s — the admin’s holds all three',
    `the member's list ${said(mList)}: ${JSON.stringify(ids(mList).map((id) => ({ [gPriv]: 'private', [gOpen]: 'open', [gWs]: 'workspace' })[id] ?? 'other'))}; the admin's has ${ids(aList).length}`,
  )
  const reads = await Promise.all([`/goals/${gPriv}`, `/goals/${gPriv}/history`, `/goals/${gPriv}/key-results`].map((r) => M(r)))
  const openRead = await M(`/goals/${gOpen}`)
  chk(
    reads.every((r) => r.status === 404 && !r.text.includes(WORD)) && openRead.status === 200 && openRead.data?.id === gOpen,
    'the private space’s goal, its history and its key results are not found for the member (404 each) — the open goal opens (200)',
    `the goal, history, key results: ${reads.map((r) => r.status).join(', ')}; the open goal ${said(openRead)}`,
  )
  const mReport = await M(`/workspaces/${WS}/reports/goals`)
  const aReport = await A(`/workspaces/${WS}/reports/goals`)
  chk(
    mReport.data?.total === 2 && aReport.data?.total === 3 && !mReport.text.includes(WORD),
    'the goals report counts two goals for the member, three for the admin, and names no private one to the member',
    `the member's total ${mReport.data?.total} (${said(mReport)}), the admin's ${aReport.data?.total}`,
  )

  // ══ 2. THE MEMBER'S WRITES ═══════════════════════════════════════════════
  console.log('\n▶ what a member refused the private space may change')
  const inPriv = await M(`/workspaces/${WS}/goals`, { method: 'POST', body: { title: `${TAG} filed in the private space`, spaceId: PS } })
  const underPriv = await M(`/workspaces/${WS}/goals`, { method: 'POST', body: { title: `${TAG} filed under the private goal`, parentGoalId: gPriv } })
  const inOpen = await M(`/workspaces/${WS}/goals`, { method: 'POST', body: { title: `${TAG} filed in the open space`, spaceId: OS } })
  const [{ n: madeInPriv }] = await sql`select count(*)::int as n from goals where workspace_id = ${WS} and (space_id = ${PS} or parent_goal_id = ${gPriv}) and title like ${`${TAG} filed%`}`
  chk(
    inPriv.status === 404 && underPriv.status === 404 && madeInPriv === 0 && inOpen.status === 201 && inOpen.data?.spaceId === OS,
    'the member can file no goal in the private space or under its goal (404 each, and no row made) — one filed in the open space is made (201)',
    `in the private space ${said(inPriv)}, under its goal ${said(underPriv)}, rows made there ${madeInPriv}; in the open space ${said(inOpen)}`,
  )
  const renamePriv = await M(`/goals/${gPriv}`, { method: 'PATCH', body: { title: 'renamed by the member' } })
  const deletePriv = await M(`/goals/${gPriv}`, { method: 'DELETE' })
  const privAfter = await rowOf('goals', gPriv)
  const renameOpen = await M(`/goals/${gOpen}`, { method: 'PATCH', body: { title: `${TAG} open goal, renamed` } })
  chk(
    renamePriv.status === 404 && deletePriv.status === 404 && privAfter?.title === `${WORD} private goal` &&
      renameOpen.status === 200 && (await rowOf('goals', gOpen))?.title === `${TAG} open goal, renamed`,
    'the member can neither rename nor delete the private goal (404 each), which is unchanged — the open goal is renamed (200)',
    `rename ${said(renamePriv)}, delete ${said(deletePriv)}, the row ${privAfter ? `"${privAfter.title}"` : 'GONE'}; renaming the open goal ${said(renameOpen)}`,
  )
  const smuggle = await M(`/goals/${gWs}`, { method: 'PATCH', body: { title: `${TAG} workspace goal, renamed`, spaceId: PS, parentGoalId: gPriv } })
  const wsAfter = await rowOf('goals', gWs)
  chk(
    smuggle.status === 200 && wsAfter?.title === `${TAG} workspace goal, renamed` && wsAfter.space_id === null && wsAfter.parent_goal_id === null && wsAfter.workspace_id === WS,
    'a PATCH that names spaceId and parentGoalId changes neither, while its title is changed',
    `${said(smuggle)}; the row: ${JSON.stringify({ title: wsAfter?.title, space: wsAfter?.space_id === PS ? 'PRIVATE' : wsAfter?.space_id, parent: wsAfter?.parent_goal_id === gPriv ? 'PRIVATE GOAL' : wsAfter?.parent_goal_id })}`,
  )
  const krThrough = await M(`/goals/${gOpen}/key-results/${krPriv}`, { method: 'PATCH', body: { title: 'renamed through another goal' } })
  const krDelThrough = await M(`/goals/${gOpen}/key-results/${krPriv}`, { method: 'DELETE' })
  const krPrivAfter = await rowOf('goal_key_results', krPriv)
  const krOwn = await M(`/goals/${gOpen}/key-results/${krOpen}`, { method: 'PATCH', body: { title: `${TAG} open kr, renamed` } })
  chk(
    krThrough.status === 404 && krDelThrough.status === 404 && krPrivAfter?.title === `${WORD} private kr` &&
      krOwn.status === 200 && (await rowOf('goal_key_results', krOpen))?.title === `${TAG} open kr, renamed`,
    'a key result is reached only through its own goal: the private goal’s, named through the open goal, is neither renamed nor deleted (404 each) — the open goal’s own is renamed (200)',
    `rename ${said(krThrough)}, delete ${said(krDelThrough)}, the row ${krPrivAfter ? `"${krPrivAfter.title}"` : 'GONE'}; the open goal's own ${said(krOwn)}`,
  )
  const child = await A(`/workspaces/${WS}/goals`, { method: 'POST', body: { title: `${WORD} sub-goal`, parentGoalId: gPriv } })
  const mAfterChild = await M(`/workspaces/${WS}/goals`)
  chk(
    child.status === 201 && child.data?.spaceId === PS && !ids(mAfterChild).includes(child.data?.id) && ids(await A(`/workspaces/${WS}/goals`)).includes(child.data?.id),
    'a sub-goal made under the private goal, naming no space, is filed in the private space — the admin lists it, the member does not',
    `${said(child)}, filed in ${child.data?.spaceId === PS ? 'the private space' : JSON.stringify(child.data?.spaceId)}; the member lists it: ${ids(mAfterChild).includes(child.data?.id)}`,
  )

  // ══ 3. THE GUEST ═════════════════════════════════════════════════════════
  console.log('\n▶ a guest, with no goal shared with them')
  const gList = await G(`/workspaces/${WS}/goals`)
  const gOpenRead = await G(`/goals/${gWs}`)
  const mOpenRead = await M(`/goals/${gWs}`)
  chk(
    gList.status === 200 && Array.isArray(gList.data) && gList.data.length === 0 && gOpenRead.status === 404 && mOpenRead.status === 200,
    'a guest lists no goals and opens none (200 with none; 404) — the member opens the same goal (200)',
    `the guest's list ${said(gList)} with ${gList.data?.length}; the guest opens the workspace goal ${said(gOpenRead)}, the member ${said(mOpenRead)}`,
  )
  const gCreate = await G(`/workspaces/${WS}/goals`, { method: 'POST', body: { title: `${TAG} the guest's goal` } })
  const gDelete = await G(`/goals/${gWs}`, { method: 'DELETE' })
  const [{ n: guestMade }] = await sql`select count(*)::int as n from goals where title = ${`${TAG} the guest's goal`}`
  chk(
    gCreate.status === 403 && guestMade === 0 && gDelete.status === 404 && (await rowOf('goals', gWs)) !== null,
    'a guest can neither create a goal (403) nor delete one (404), which stays',
    `create ${said(gCreate)} (rows ${guestMade}), delete ${said(gDelete)}`,
  )

  // ══ 4. ANOTHER ORGANISATION ══════════════════════════════════════════════
  console.log('\n▶ a user of another organisation, with a workspace and a goal of their own')
  const theirs = await S('/workspaces', { method: 'POST', body: { name: `${TAG} theirs` } })
  if (theirs.status >= 300 || !theirs.data?.id) throw new Error(`the stranger could not make a workspace: ${said(theirs)}`)
  SWS = theirs.data.id
  const sGoal = await goal(SWS, `${TAG} their goal`)
  const sKr = await keyResult(sGoal, SWS, `${TAG} their kr`)
  const sRename = await S(`/goals/${sGoal}/key-results/${krOpen}`, { method: 'PATCH', body: { title: 'renamed from another workspace', currentValue: 99 } })
  const sDelete = await S(`/goals/${sGoal}/key-results/${krOpen}`, { method: 'DELETE' })
  const victimKr = await rowOf('goal_key_results', krOpen)
  const sOwnKr = await S(`/goals/${sGoal}/key-results/${sKr}`, { method: 'PATCH', body: { title: `${TAG} their kr, renamed` } })
  chk(
    sRename.status === 404 && sDelete.status === 404 && victimKr?.title === `${TAG} open kr, renamed` && victimKr.current_value === 0 &&
      sOwnKr.status === 200 && (await rowOf('goal_key_results', sKr))?.title === `${TAG} their kr, renamed`,
    'a user of another organisation can neither rename nor delete this workspace’s key result through a goal of their own (404 each), and it is unchanged — their own is renamed (200)',
    `rename ${said(sRename)}, delete ${said(sDelete)}, the row ${victimKr ? JSON.stringify({ title: victimKr.title, value: victimKr.current_value }) : 'GONE'}; their own ${said(sOwnKr)}`,
  )
  const sInSpace = await S(`/workspaces/${SWS}/goals`, { method: 'POST', body: { title: `${TAG} theirs, in this space`, spaceId: OS } })
  const sUnder = await S(`/workspaces/${SWS}/goals`, { method: 'POST', body: { title: `${TAG} theirs, under this goal`, parentGoalId: gOpen } })
  const sMove = await S(`/goals/${sGoal}`, { method: 'PATCH', body: { workspaceId: WS } })
  const sGoalAfter = await rowOf('goals', sGoal)
  const sPlain = await S(`/workspaces/${SWS}/goals`, { method: 'POST', body: { title: `${TAG} theirs, plain` } })
  const [{ n: planted }] = await sql`select count(*)::int as n from goals where title in (${`${TAG} theirs, in this space`}, ${`${TAG} theirs, under this goal`})`
  chk(
    sInSpace.status === 404 && sUnder.status === 404 && planted === 0 && sGoalAfter?.workspace_id === SWS && sPlain.status === 201,
    'they can file no goal in this workspace’s space or under its goal (404 each), and patching their goal’s workspaceId leaves it in their own — a plain goal of their own is made (201)',
    `in this space ${said(sInSpace)}, under this goal ${said(sUnder)}, rows ${planted}; the move ${said(sMove)} left it in ${sGoalAfter?.workspace_id === WS ? 'THIS WORKSPACE' : 'their own'}; their plain goal ${said(sPlain)}`,
  )

  // ══ 5. OWNERS ════════════════════════════════════════════════════════════
  console.log('\n▶ who may own a goal')
  const memberOwnsPriv = await A(`/goals/${gPriv}`, { method: 'PATCH', body: { ownerId: member.id } })
  const strangerOwns = await A(`/goals/${gOpen}`, { method: 'PATCH', body: { ownerId: stranger.id } })
  const adminOwnsPriv = await A(`/goals/${gPriv}`, { method: 'PATCH', body: { ownerId: adminId } })
  const memberOwnsOpen = await A(`/goals/${gOpen}`, { method: 'PATCH', body: { ownerId: member.id } })
  const owners = { priv: (await rowOf('goals', gPriv))?.owner_id, open: (await rowOf('goals', gOpen))?.owner_id }
  chk(
    memberOwnsPriv.status === 400 && strangerOwns.status === 400 && adminOwnsPriv.status === 200 && memberOwnsOpen.status === 200 &&
      owners.priv === adminId && owners.open === member.id,
    'an owner must be able to read the goal: the member refused the private space cannot own its goal, nor a stranger any (400 each) — the admin owns the private goal, the member the open one (200 each)',
    `the member of the private goal ${said(memberOwnsPriv)}, the stranger ${said(strangerOwns)}, the admin ${said(adminOwnsPriv)}, the member of the open goal ${said(memberOwnsOpen)}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  if (WS && A) {
    const gone = await A(`/workspaces/${WS}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${WS} answered ${gone.status || 'nothing'}`)
  }
  if (SWS && S) {
    const gone = await S(`/workspaces/${SWS}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${SWS} answered ${gone.status || 'nothing'}`)
  }
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}

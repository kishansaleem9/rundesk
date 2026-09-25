/**
 * A WORKSPACE'S ROLES ARE GIVEN BY THOSE WHO HOLD THE PERMISSION TO GIVE THEM,
 * AND NOBODY GIVES MORE THAN THEY HOLD.
 *
 * NOT A FRAME ROW: `found-25-sep/managers-grant-themselves-admin`, found
 * mapping `role-editor-offers-unenforced-permissions`. `WorkspaceAdminGuard`
 * admits managers, and changing a member's role, adding a member, removing
 * one, and making or assigning a custom role asked nothing past it. So a
 * manager could make themself a workspace admin, make a custom role holding
 * every permission and take it, add somebody under any role string, and
 * remove members — where the permission catalog, and the web, give all of
 * that to admins.
 *
 * ClickUp (help centre, "Manage Custom Role permissions", "Intro to user
 * roles", search snippets): only the owner and admins change roles, and by
 * default only the owner makes custom roles, delegating it to custom admins.
 * Here each action asks its catalog key — `members.role.change`,
 * `roles.manage`, `members.remove`, `members.invite` — whose defaults give each
 * base role what the catalog says, and a custom grant counts; and nobody makes
 * anybody an admin, or hands out a permission, that they do not hold
 * themselves. Every outcome is read back by SQL.
 *
 *   node test/e2e/member-role-grants.mjs --api 3021
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
  const headers = { authorization: `Bearer ${token}` }
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, { ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined }).catch(() => null)
  if (!res) return { status: 0, data: null, error: { message: 'no answer' } }
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `mrg${stamp}`
let sql = null
let WS = null
let A = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — roles and memberships are read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id

  const account = async (key) => {
    const email = `${TAG}-${key}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `Grants ${key}`, email, password: 'RoleGrants@12345!', organizationName: `Grants ${key} ${stamp}`, organizationSlug: `grants-${key}-${stamp}` })
    const [row] = await sql`select id from users where email = ${email}`
    return { id: row.id, email, as: apiAs(signed.accessToken) }
  }
  const person = async (key, role) => {
    const who = await account(key)
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email: who.email, role } })
    if (added.status >= 300) throw new Error(`could not add the ${key}: ${said(added)}`)
    return who
  }
  const manager = await person('manager', 'manager')
  const target = await person('target', 'member')
  const other = await person('other', 'member')
  const delegate = await person('delegate', 'member')
  const outsider = await account('outsider')
  const roleOf = async (userId) => (await sql`select role from workspace_members where workspace_id = ${WS} and user_id = ${userId}`)[0]?.role ?? null
  const memberRowId = async (userId) => (await sql`select id from workspace_members where workspace_id = ${WS} and user_id = ${userId}`)[0]?.id ?? null
  const rolesNamed = async (name) => (await sql`select count(*)::int as n from custom_roles where workspace_id = ${WS} and name = ${name}`)[0].n
  const assigned = async (userId) => (await sql`
    select r.name from workspace_member_custom_roles a
    join custom_roles r on r.id = a.role_id
    join workspace_members m on m.id = a.workspace_member_id
    where m.workspace_id = ${WS} and m.user_id = ${userId}`).map((r) => r.name)
  // The admin's own custom role, carrying a key no manager holds by default.
  const hooks = await A(`/workspaces/${WS}/roles`, { method: 'POST', body: { name: `${TAG} hooks`, permissions: ['webhook.manage'] } })
  if (hooks.status >= 300 || !hooks.data?.id) throw new Error(`could not make the admin's role: ${said(hooks)}`)

  // ══ 1. ROLES ═════════════════════════════════════════════════════════════
  console.log('\n▶ a manager changes roles: their own to admin, a member’s to manager — and the admin does')
  const selfToAdmin = await manager.as(`/workspaces/${WS}/members/${manager.id}`, { method: 'PATCH', body: { role: 'workspace_admin' } })
  const targetToManager = await manager.as(`/workspaces/${WS}/members/${target.id}`, { method: 'PATCH', body: { role: 'manager' } })
  const afterManager = { manager: await roleOf(manager.id), target: await roleOf(target.id) }
  const adminChanges = await A(`/workspaces/${WS}/members/${other.id}`, { method: 'PATCH', body: { role: 'manager' } })
  chk(
    selfToAdmin.status === 403 && targetToManager.status === 403 && afterManager.manager === 'manager' && afterManager.target === 'member'
      && adminChanges.status < 300 && (await roleOf(other.id)) === 'manager',
    'a manager changes nobody’s role — not their own to admin, not a member’s (403 each, both unchanged) — and the admin does',
    `own to admin ${said(selfToAdmin)}, a member's to manager ${said(targetToManager)}; now ${JSON.stringify(afterManager)}; the admin's change ${said(adminChanges)}`,
  )

  // ══ 2. CUSTOM ROLES ══════════════════════════════════════════════════════
  console.log('\n▶ a manager makes a custom role holding every permission, and takes the admin’s')
  const everything = `${TAG} everything`
  const makes = await manager.as(`/workspaces/${WS}/roles`, { method: 'POST', body: { name: everything, permissions: ['webhook.manage', 'sso.manage', 'roles.manage', 'members.role.change'] } })
  const takes = await manager.as(`/workspaces/${WS}/members/${await memberRowId(manager.id)}/roles/${hooks.data.id}`, { method: 'POST', body: {} })
  chk(
    makes.status === 403 && (await rolesNamed(everything)) === 0 && takes.status === 403 && (await assigned(manager.id)).length === 0,
    'a manager makes no custom role and assigns none, themself included (403 each, none made, none held)',
    `makes ${said(makes)} (${await rolesNamed(everything)} made); takes the admin's ${said(takes)} (holds ${JSON.stringify(await assigned(manager.id))})`,
  )

  // ══ 3. NOBODY GIVES MORE THAN THEY HOLD ══════════════════════════════════
  console.log('\n▶ a member granted roles.manage and members.role.change: what they may give')
  const delegation = await A(`/workspaces/${WS}/roles`, { method: 'POST', body: { name: `${TAG} delegation`, permissions: ['roles.manage', 'members.role.change'] } })
  const granted = delegation.data?.id ? await A(`/workspaces/${WS}/members/${await memberRowId(delegate.id)}/roles/${delegation.data.id}`, { method: 'POST', body: {} }) : { status: 0 }
  if (granted.status >= 300) throw new Error(`could not grant the delegate: ${said(delegation)} ${said(granted)}`)
  const beyond = `${TAG} beyond`
  const within = `${TAG} within`
  const makesBeyond = await delegate.as(`/workspaces/${WS}/roles`, { method: 'POST', body: { name: beyond, permissions: ['webhook.manage'] } })
  const makesWithin = await delegate.as(`/workspaces/${WS}/roles`, { method: 'POST', body: { name: within, permissions: ['report.export'] } })
  const takesHooks = await delegate.as(`/workspaces/${WS}/members/${await memberRowId(delegate.id)}/roles/${hooks.data.id}`, { method: 'POST', body: {} })
  const promotes = await delegate.as(`/workspaces/${WS}/members/${target.id}`, { method: 'PATCH', body: { role: 'workspace_admin' } })
  const demotes = await delegate.as(`/workspaces/${WS}/members/${target.id}`, { method: 'PATCH', body: { role: 'guest' } })
  chk(
    makesBeyond.status === 403 && (await rolesNamed(beyond)) === 0 && makesWithin.status < 300 && (await rolesNamed(within)) === 1
      && takesHooks.status === 403 && !(await assigned(delegate.id)).includes(`${TAG} hooks`)
      && promotes.status === 403 && demotes.status < 300 && (await roleOf(target.id)) === 'guest',
    'a member granted roles.manage makes a role only of permissions they hold, assigns none holding more, and with members.role.change makes nobody an admin — while changing a member within their own rank',
    `a role beyond ${said(makesBeyond)}, within ${said(makesWithin)}; takes the hooks role ${said(takesHooks)}; promotes to admin ${said(promotes)}, demotes to guest ${said(demotes)} (now ${await roleOf(target.id)})`,
  )

  // ══ 4. REMOVING ══════════════════════════════════════════════════════════
  console.log('\n▶ a manager removes a member — and the admin does')
  const managerRemoves = await manager.as(`/workspaces/${WS}/members/${other.id}`, { method: 'DELETE' })
  const stillThere = (await roleOf(other.id)) !== null
  const adminRemoves = await A(`/workspaces/${WS}/members/${other.id}`, { method: 'DELETE' })
  chk(
    managerRemoves.status === 403 && stillThere && adminRemoves.status < 300 && (await roleOf(other.id)) === null,
    'a manager removes nobody from the workspace (403, still a member) — and the admin does',
    `manager ${said(managerRemoves)} (still there: ${stillThere}); admin ${said(adminRemoves)}`,
  )

  // ══ 5. ADDING ════════════════════════════════════════════════════════════
  console.log('\n▶ adding an existing account: as a platform role, and as an admin by a manager')
  const asPlatform = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email: outsider.email, role: 'super_admin' } })
  const platformRow = await roleOf(outsider.id)
  const managerAddsAdmin = await manager.as(`/workspaces/${WS}/members`, { method: 'POST', body: { email: outsider.email, role: 'workspace_admin' } })
  const managerRow = await roleOf(outsider.id)
  const managerAddsMember = await manager.as(`/workspaces/${WS}/members`, { method: 'POST', body: { email: outsider.email, role: 'member' } })
  chk(
    asPlatform.status === 400 && platformRow === null && managerAddsAdmin.status === 403 && managerRow === null
      && managerAddsMember.status < 300 && (await roleOf(outsider.id)) === 'member',
    'nobody is added under a role a workspace does not give (400, no row), and a manager adds nobody as an admin (403, no row) — though they add a member',
    `as super_admin ${said(asPlatform)} (row ${platformRow}); a manager adding an admin ${said(managerAddsAdmin)} (row ${managerRow}); a member ${said(managerAddsMember)} (row ${await roleOf(outsider.id)})`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
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

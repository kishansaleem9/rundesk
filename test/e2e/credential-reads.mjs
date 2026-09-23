/**
 * CREDENTIALS STAY WITH THE PEOPLE THEY BELONG TO, AND AN INVITATION GRANTS
 * ONLY WHAT ITS ORGANISATION OWNS.
 *
 * NOT A FRAME ROW: found on 23 September by a read-only sweep of every column
 * that holds a secret, and each measured on lane 1 before the fix:
 *
 *   - `GET /tasks/:id/activity` embedded each actor's WHOLE `users` row — the
 *     password hash, lockout counters and private preferences — for anyone who
 *     could open the task, guests included.
 *   - `GET /tasks/:id/email-address` needed a sign-in and nothing else: anybody
 *     in any workspace who knew a task id read the list's secret inbound address.
 *   - An organisation's owner — anybody who signs up — could write an
 *     invitation naming ANOTHER organisation's workspace, with any role, and
 *     claiming it inserted the membership. Invitations could also grant
 *     `super_admin` as a workspace role and `owner` of an organisation, and a
 *     manager could invite a workspace admin.
 *   - The custom domain's `rundesk-verify=…` secret went to every member through
 *     the workspace reads and the sign-in answer.
 *
 * Every refusal is paired with the grant that makes the same request succeed,
 * and invitations are checked against the ROWS they leave, not the status.
 *
 *   node test/e2e/credential-reads.mjs --api 3011
 */
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { apiClient, login } from './lib/fixture.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { openDb } from './lib/db.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a branch that skipped is a failure. */
const EXPECTED_CHECKS = 11

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
const EMAIL = process.env.E2E_EMAIL ?? 'admin@rundesk.internal'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123!'
const PERSON_PASSWORD = 'Member@12345!'

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

/** Columns of `users` that must never reach another person. */
const PRIVATE_USER_KEYS = ['passwordHash', 'failedLoginAttempts', 'lockedUntil', 'notificationPreferences', 'emailVerified', 'isActive']

const stamp = Date.now()
const TAG = `crd-${stamp}`
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
let api = null
let WS = null
let sql = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — invitations are checked against the rows they leave, and that cannot be skipped')
  const auth = await login(`${B}/api/v1`, EMAIL, PASSWORD)
  // The fixture's apiClient NEVER THROWS — every call below is read off `status`.
  api = apiClient(`${B}/api/v1`, auth.accessToken)
  const admin = (await api('/users/me')).data
  const made = await api('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${made.status}`)
  WS = made.data.id

  /** A fresh account — which is also the owner of a fresh organisation and its workspace. */
  const signUp = async (label) => {
    const email = `${TAG}-${label}@rundesk.invalid`
    const res = await fetch(`${B}/api/v1/auth/signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fullName: `Creds ${label}`, email, password: PERSON_PASSWORD, organizationName: `Creds ${label} ${stamp}`, organizationSlug: `creds-${label}-${stamp}` }),
    })
    const data = (await res.json().catch(() => null))?.data
    if (!data?.accessToken) throw new Error(`signup of ${label} failed: ${res.status}`)
    return {
      email,
      id: data.user?.id,
      client: apiClient(`${B}/api/v1`, data.accessToken),
      orgId: data.organizations?.[0]?.id,
      ownWorkspaceId: data.workspaces?.[0]?.id,
    }
  }
  const join = async (person, role) => {
    const added = await api(`/workspaces/${WS}/members`, { method: 'POST', body: { email: person.email, role } })
    if (added.status >= 300) throw new Error(`could not add ${person.email} as ${role}: ${added.status}`)
  }
  const member = await signUp('member')
  const guest = await signUp('guest')
  const manager = await signUp('manager')
  const outsider = await signUp('outsider')
  await join(member, 'member')
  await join(guest, 'guest')
  await join(manager, 'manager')
  if (!outsider.orgId || !outsider.ownWorkspaceId) throw new Error('the outsider’s signup answered without its organisation or workspace')

  const make = async (route, body, what) => {
    const res = await api(route, { method: 'POST', body })
    if (res.status >= 300 || !res.data?.id) throw new Error(`could not make ${what}: ${res.status}`)
    return res.data.id
  }
  const space = await make('/spaces', { workspaceId: WS, name: `${TAG} space`, defaultPermission: 'edit' }, 'the space')
  const project = await make('/projects', { spaceId: space, name: `${TAG} project` }, 'the project')
  const list = await make('/lists', { projectId: project, name: `${TAG} list` }, 'the list')
  const task = await make('/tasks', { listId: list, title: `${TAG} task` }, 'the task')
  // Something for the activity to say, done by the admin.
  const renamed = await api(`/tasks/${task}`, { method: 'PATCH', body: { title: `${TAG} task renamed` } })
  if (renamed.status >= 300) throw new Error(`could not rename the task: ${renamed.status}`)

  // ══ 1. TASK ACTIVITY ═════════════════════════════════════════════════════
  console.log('\n▶ task activity says who acted, and nothing private about them')

  const activity = await member.client(`/tasks/${task}/activity`)
  const actors = (activity.data ?? []).map((a) => a.actor).filter(Boolean)
  const leaked = [...new Set(actors.flatMap((a) => PRIVATE_USER_KEYS.filter((k) => k in a)))]
  chk(
    activity.status === 200 && actors.length > 0 && actors.some((a) => a.id === admin?.id && a.displayName) && leaked.length === 0,
    'a member reads who acted on the task — the admin, by name — and not one private column of their account',
    `it answered ${activity.status} with ${actors.length} actor(s); private columns present: ${JSON.stringify(leaked)}`,
  )

  // ══ 2. A TASK'S EMAIL ADDRESS ════════════════════════════════════════════
  console.log('\n▶ a task’s email address is for the people who can open the task')

  const alias = await api(`/lists/${list}/inbound-email`, { method: 'POST', body: {} })
  if (alias.status >= 300) throw new Error(`could not give the list an address: ${alias.status}`)
  const outsiderAddress = await outsider.client(`/tasks/${task}/email-address`)
  const memberAddress = await member.client(`/tasks/${task}/email-address`)
  chk(
    [403, 404].includes(outsiderAddress.status) && !JSON.stringify(outsiderAddress.data ?? null).includes('@'),
    'somebody from another organisation asking for it is refused, with no address in the answer',
    `it answered ${outsiderAddress.status} ${JSON.stringify(outsiderAddress.data)}`,
  )
  chk(
    memberAddress.status === 200 && /^list-.+\+task-/.test(memberAddress.data?.address ?? ''),
    'while a member of the workspace gets it',
    `it answered ${memberAddress.status} ${JSON.stringify(memberAddress.data)}`,
  )

  // ══ 3. INVITATIONS ═══════════════════════════════════════════════════════
  console.log('\n▶ an invitation grants only what its organisation owns, and only what its sender holds')

  /** Invitation rows for an address, whatever the answer said. */
  const invitesFor = (email) => sql`select org_role, workspace_memberships from invitations where email = ${email.toLowerCase()}`
  const bulk = (who, orgId, email, memberships, orgRole) =>
    who.client(`/invitations/${orgId}/bulk`, { method: 'POST', body: { invites: [{ email, workspaceMemberships: memberships, ...(orgRole ? { orgRole } : {}) }] } })

  const foreignEmail = `${TAG}-foreign@rundesk.invalid`
  const foreign = await bulk(outsider, outsider.orgId, foreignEmail, [{ workspaceId: WS, role: 'workspace_admin' }])
  const foreignRows = await invitesFor(foreignEmail)
  chk(
    foreign.status === 400 && foreignRows.length === 0,
    'an organisation’s owner may not put another organisation’s workspace into an invitation — none is written',
    `it answered ${foreign.status}; ${foreignRows.length} invitation row(s) for that address`,
  )
  const ownEmail = `${TAG}-own@rundesk.invalid`
  const own = await bulk(outsider, outsider.orgId, ownEmail, [{ workspaceId: outsider.ownWorkspaceId, role: 'member' }])
  const ownRows = await invitesFor(ownEmail)
  chk(
    own.status < 300 && ownRows.length === 1 && ownRows[0].workspace_memberships?.[0]?.workspaceId === outsider.ownWorkspaceId,
    'while the same owner inviting someone to their own workspace is written as asked',
    `it answered ${own.status} ${JSON.stringify(own.error ?? '')}; ${ownRows.length} row(s)`,
  )

  const superEmail = `${TAG}-super@rundesk.invalid`
  const ownerEmail = `${TAG}-owner@rundesk.invalid`
  const asSuper = await bulk(outsider, outsider.orgId, superEmail, [{ workspaceId: outsider.ownWorkspaceId, role: 'super_admin' }])
  const asOwner = await bulk(outsider, outsider.orgId, ownerEmail, [], 'owner')
  const overreach = [...(await invitesFor(superEmail)), ...(await invitesFor(ownerEmail))]
  chk(
    asSuper.status === 400 && asOwner.status === 400 && overreach.length === 0,
    'nor may an invitation grant `super_admin` in a workspace, or ownership of the organisation',
    `super_admin answered ${asSuper.status}, owner ${asOwner.status}; ${overreach.length} row(s) written`,
  )

  const promoteEmail = `${TAG}-promoted@rundesk.invalid`
  const plainEmail = `${TAG}-plain@rundesk.invalid`
  const managerPromotes = await manager.client('/invitations', { method: 'POST', body: { email: promoteEmail, workspaceId: WS, role: 'workspace_admin' } })
  const managerInvites = await manager.client('/invitations', { method: 'POST', body: { email: plainEmail, workspaceId: WS, role: 'member' } })
  chk(
    managerPromotes.status === 403 && (await invitesFor(promoteEmail)).length === 0 && managerInvites.status < 300 && (await invitesFor(plainEmail)).length === 1,
    'a manager may invite a member but not a workspace admin — nobody grants more than they hold',
    `admin invite answered ${managerPromotes.status}; member invite ${managerInvites.status} ${JSON.stringify(managerInvites.error ?? '')}`,
  )

  // An invitation written BEFORE these rules — straight into the table, the
  // way the old route wrote it — is held to them when it is claimed.
  const legacyEmail = `${TAG}-legacy@rundesk.invalid`
  const legacyToken = randomBytes(32).toString('base64url')
  await sql`
    insert into invitations (organization_id, email, org_role, workspace_memberships, invited_by_user_id, token, expires_at)
    values (${outsider.orgId}, ${legacyEmail}, 'owner',
            ${sql.json([{ workspaceId: WS, role: 'workspace_admin' }, { workspaceId: outsider.ownWorkspaceId, role: 'member' }])},
            ${outsider.id}, ${legacyToken}, now() + interval '1 day')`
  const claimed = await fetch(`${B}/api/v1/invitations/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: legacyToken, password: PERSON_PASSWORD, fullName: 'Creds legacy' }),
  })
  const [claimer] = await sql`select id from users where email = ${legacyEmail}`
  const joinedWs = claimer ? await sql`select workspace_id, role from workspace_members where user_id = ${claimer.id}` : []
  const joinedOrg = claimer ? await sql`select role from organization_members where user_id = ${claimer.id} and organization_id = ${outsider.orgId}` : []
  const inForeign = joinedWs.some((m) => m.workspace_id === WS)
  const inOwn = joinedWs.find((m) => m.workspace_id === outsider.ownWorkspaceId)
  chk(
    claimed.status < 300 && Boolean(claimer) && !inForeign && inOwn?.role === 'member' && joinedOrg[0]?.role === 'member',
    'and an invitation written before these rules, claimed, joins its own workspace as asked — not the other organisation’s, and not as owner',
    `claim answered ${claimed.status}; in the other organisation’s workspace: ${inForeign}; own workspace role ${inOwn?.role}; organisation role ${joinedOrg[0]?.role}`,
  )

  // ══ 4. THE CUSTOM DOMAIN'S SECRET ════════════════════════════════════════
  console.log('\n▶ the custom domain’s verification secret goes to the people who may change the domain')

  const domain = await api(`/workspaces/${WS}`, { method: 'PATCH', body: { customDomain: `${TAG}.example.com` } })
  const secret = domain.data?.customDomainToken
  if (domain.status >= 300 || !secret) throw new Error(`could not set the custom domain: ${domain.status}`)
  const carries = (body) => JSON.stringify(body ?? null).includes(secret)
  const signIn = async (who) => {
    const res = await fetch(`${B}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: who.email, password: PERSON_PASSWORD }),
    })
    return (await res.json().catch(() => null))?.data
  }
  // And an ARCHIVED workspace with a domain of its own, for the one list the
  // three reads below do not reach.
  const archivedWs = (await api('/workspaces', { method: 'POST', body: { name: `${TAG} archived` } })).data?.id
  if (!archivedWs) throw new Error('could not make the workspace to archive')
  const archivedJoin = await api(`/workspaces/${archivedWs}/members`, { method: 'POST', body: { email: member.email, role: 'member' } })
  const archivedDomain = await api(`/workspaces/${archivedWs}`, { method: 'PATCH', body: { customDomain: `${TAG}-archived.example.com` } })
  const archivedSecret = archivedDomain.data?.customDomainToken
  const archived = await api(`/workspaces/${archivedWs}`, { method: 'DELETE' })
  if (archivedJoin.status >= 300 || !archivedSecret || archived.status >= 300) {
    throw new Error(`could not stage the archived workspace: join ${archivedJoin.status}, domain ${archivedDomain.status}, archive ${archived.status}`)
  }
  const seen = []
  const memberArchived = await member.client('/workspaces/archived')
  const listedArchived = (memberArchived.data ?? []).some((r) => (r.workspace?.id ?? r.id) === archivedWs)
  if (memberArchived.status !== 200 || !listedArchived) seen.push(`member: the archived list did not list it (${memberArchived.status})`)
  if (JSON.stringify(memberArchived.data ?? null).includes(archivedSecret)) seen.push('member: GET /workspaces/archived')
  for (const [who, label] of [[member, 'member'], [guest, 'guest']]) {
    const one = await who.client(`/workspaces/${WS}`)
    const all = await who.client('/workspaces')
    const bundle = await signIn(who)
    if (one.status !== 200 || all.status !== 200 || !bundle?.workspaces) seen.push(`${label}: a read failed (${one.status}, ${all.status}, bundle ${Boolean(bundle?.workspaces)})`)
    if (carries(one.data)) seen.push(`${label}: GET /workspaces/:id`)
    if (carries(all.data)) seen.push(`${label}: GET /workspaces`)
    if (carries(bundle)) seen.push(`${label}: the sign-in answer`)
  }
  chk(
    seen.length === 0,
    'a member and a guest read the workspace every way it is listed — by id, in their list, in the sign-in answer, among archived ones — and none carries it',
    `carried by: ${JSON.stringify(seen)}`,
  )
  const adminOne = await api(`/workspaces/${WS}`)
  const managerOne = await manager.client(`/workspaces/${WS}`)
  chk(
    adminOne.status === 200 && adminOne.data?.customDomainToken === secret && managerOne.data?.customDomainToken === secret,
    'while the admin and the manager, who may change the domain, still read it for the DNS record',
    `admin ${adminOne.status} ${adminOne.data?.customDomainToken === secret}; manager ${managerOne.status} ${managerOne.data?.customDomainToken === secret}`,
  )
  const adminAll = await api('/workspaces')
  chk(
    adminAll.status === 200 && !carries(adminAll.data),
    'and even their list of workspaces leaves it out — it is read where it is used',
    `the admin’s list answered ${adminAll.status}; carries it: ${carries(adminAll.data)}`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  if (api && WS) {
    const res = await api(`/workspaces/${WS}`, { method: 'DELETE' })
    if (res.status >= 300) console.log(`  \x1b[33mnote\x1b[0m cleanup answered ${res.status}`)
  }
  await sql?.end({ timeout: 5 }).catch(() => {})
  stack.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}

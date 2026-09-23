/**
 * SSO, SCIM TOKENS AND INTEGRATION CONNECTIONS ARE GATED BY THE PERMISSION
 * THAT NAMES THEM — and by nothing standing in front of it.
 *
 * NOT A FRAME ROW: found on 23 September mapping the routes the custom-role
 * permissions guard. SSO configuration and integration connections put an
 * admin-or-manager guard IN FRONT of `sso.manage` / `integrations.manage`, so a
 * custom role granting either to anybody else was saved, shown and useless.
 * SCIM token management had the admin-or-manager guard and NO permission at
 * all — so every manager held it, though the catalog puts SCIM provisioning
 * under `sso.manage`, which a manager does not hold by default.
 *
 * Four people: the admin; a plain MEMBER; a MANAGER; and a member given the
 * permissions through a custom role. Every refusal is paired with the grant
 * that makes the same request succeed.
 *
 *   node test/e2e/permission-guards.mjs --api 3011
 */
import path from 'node:path'
import { apiClient, login } from './lib/fixture.mjs'
import { startLocalStack } from './lib/local-stack.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a branch that skipped is a failure. */
const EXPECTED_CHECKS = 8

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
const EMAIL = process.env.E2E_EMAIL ?? 'admin@rundesk.internal'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123!'

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

const stamp = Date.now()
const TAG = `pg-${stamp}`
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
let api = null
let WS = null
/** The permission guard's own refusal, as opposed to a provider answering. */
const refusedByPermission = (res) => res.status === 403

try {
  const auth = await login(`${B}/api/v1`, EMAIL, PASSWORD)
  // The fixture's apiClient NEVER THROWS — every call below is read off `status`.
  api = apiClient(`${B}/api/v1`, auth.accessToken)
  const made = await api('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${made.status}`)
  WS = made.data.id

  const person = async (label, role) => {
    const email = `pg-${label}-${stamp}@rundesk.invalid`
    const res = await fetch(`${B}/api/v1/auth/signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fullName: `Guards ${label}`, email, password: 'Member@12345!', organizationName: `Guards ${label} ${stamp}`, organizationSlug: `guards-${label}-${stamp}` }),
    })
    const data = (await res.json().catch(() => null))?.data
    if (!data?.accessToken) throw new Error(`signup of ${label} failed: ${res.status}`)
    const added = await api(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (added.status >= 300) throw new Error(`could not add ${label}: ${added.status}`)
    return { client: apiClient(`${B}/api/v1`, data.accessToken), id: data.user?.id }
  }
  const member = await person('member', 'member')
  const manager = await person('manager', 'manager')
  const holder = await person('holder', 'member')

  const role = await api(`/workspaces/${WS}/roles`, {
    method: 'POST',
    body: { name: `${TAG} guards`, permissions: ['sso.manage', 'integrations.manage', 'integrations.access_requests.manage'] },
  })
  if (role.status >= 300 || !role.data?.id) throw new Error(`could not make the role: ${role.status}`)
  const holderRow = ((await api(`/workspaces/${WS}/members`)).data ?? []).find((m) => m.userId === holder.id)
  const given = holderRow
    ? await api(`/workspaces/${WS}/members/${holderRow.workspaceMemberId}/roles/${role.data.id}`, { method: 'POST' })
    : { status: 0 }
  if (given.status >= 300 || given.status === 0) throw new Error(`could not give the holder the role: ${given.status}`)
  const M = member.client
  const G = manager.client
  const H = holder.client

  // ══ 1. SSO ═══════════════════════════════════════════════════════════════
  console.log('\n▶ SSO configuration is read by whoever holds `sso.manage`')

  const memberSso = await M(`/workspaces/${WS}/sso`)
  chk(refusedByPermission(memberSso) && memberSso.data == null, 'a plain member is refused the SSO configuration', `it answered ${memberSso.status}`)
  const holderSso = await H(`/workspaces/${WS}/sso`)
  chk(holderSso.status === 200, 'while a member granted `sso.manage` by a custom role reads it', `it answered ${holderSso.status} ${JSON.stringify(holderSso.error ?? '')}`)

  // ══ 2. SCIM TOKENS ═══════════════════════════════════════════════════════
  console.log('\n▶ SCIM tokens belong to `sso.manage`, not to the manager role')

  // Counted just before EACH attempt, so one wrong answer cannot move the
  // baseline the next check is measured against.
  const tokens = async () => ((await api(`/workspaces/${WS}/scim/tokens`)).data ?? []).length
  const before = await tokens()
  const managerToken = await G(`/workspaces/${WS}/scim/tokens`, { method: 'POST', body: { name: `${TAG} manager's` } })
  chk(
    refusedByPermission(managerToken) && (await tokens()) === before,
    'a manager, who does not hold `sso.manage`, may not mint a SCIM token — none is made',
    `it answered ${managerToken.status}; ${(await tokens()) - before} token(s) appeared`,
  )
  const beforeAdmin = await tokens()
  const adminToken = await api(`/workspaces/${WS}/scim/tokens`, { method: 'POST', body: { name: `${TAG} admin's` } })
  chk(
    adminToken.status < 300 && (await tokens()) === beforeAdmin + 1,
    'the admin may',
    `it answered ${adminToken.status} ${JSON.stringify(adminToken.error ?? '')}`,
  )
  const beforeHolder = await tokens()
  const holderToken = await H(`/workspaces/${WS}/scim/tokens`, { method: 'POST', body: { name: `${TAG} holder's` } })
  chk(
    holderToken.status < 300 && (await tokens()) === beforeHolder + 1,
    'and so may the member granted `sso.manage` — the permission decides, not the role',
    `it answered ${holderToken.status} ${JSON.stringify(holderToken.error ?? '')}`,
  )

  // ══ 3. INTEGRATION CONNECTIONS ═══════════════════════════════════════════
  console.log('\n▶ integration connections answer to `integrations.manage`')

  const memberStart = await M(`/workspaces/${WS}/integrations/connections/github/oauth/start`, { method: 'POST', body: {} })
  chk(refusedByPermission(memberStart), 'a plain member is refused before the provider is asked', `it answered ${memberStart.status}`)
  // The provider may answer that it is not configured here; what matters is
  // that the permission let the holder through to ask.
  const holderStart = await H(`/workspaces/${WS}/integrations/connections/github/oauth/start`, { method: 'POST', body: {} })
  chk(
    !refusedByPermission(holderStart),
    'while the member granted `integrations.manage` gets past the guard to the provider',
    `it answered ${holderStart.status} ${JSON.stringify(holderStart.error ?? '')}`,
  )
  const holderReview = await H(`/workspaces/${WS}/integrations/connections/access-requests/github`, {
    method: 'PATCH',
    body: { status: 'approved' },
  })
  chk(
    !refusedByPermission(holderReview),
    'and the member granted `integrations.access_requests.manage` may answer an access request',
    `it answered ${holderReview.status} ${JSON.stringify(holderReview.error ?? '')}`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  if (api && WS) {
    const res = await api(`/workspaces/${WS}`, { method: 'DELETE' })
    if (res.status >= 300) console.log(`  \x1b[33mnote\x1b[0m cleanup answered ${res.status}`)
  }
  stack.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}

/**
 * A GUEST SEES NOBODY'S INVITATION, AND AN INVITATION'S TOKEN REACHES ONLY
 * THOSE WHO MAY COPY ITS LINK.
 *
 * NOT A FRAME ROW: `found-25-sep/guests-read-pending-invitations`, found
 * closing what was left of `found-23-sep/secret-and-credential-reads`.
 * Measured on lane 5: `GET /invitations/workspace/:id` answered a guest every
 * pending invitee's email and the role they were offered (a workspace admin's,
 * here). Members read the list so the assignee and mention pickers can offer
 * people who were invited; a guest sees no people list at all (ClickUp).
 *
 * The token half: the list answers carry none, and the link — the token in a
 * URL — is refused to a member, given to an admin.
 *
 *   node test/e2e/guest-invitations.mjs --api 3021
 */
import { signInApi, signUpApi } from './lib/signin.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 2

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
const TAG = `gin${stamp}`
let WS = null
let A = null

try {
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const person = async (who, role) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `Invites ${who}`, email, password: 'Invites@12345!', organizationName: `Invites ${who} ${stamp}`, organizationSlug: `invites-${who}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (!added.ok) throw new Error(`could not add the ${who}: ${said(added)}`)
    return apiAs(signed.accessToken)
  }
  const G = await person('guest', 'guest')
  const M = await person('member', 'member')
  const INVITEE = `${TAG}-invitee@rundesk.invalid`
  const inv = await A('/invitations', { method: 'POST', body: { email: INVITEE, workspaceId: WS, role: 'workspace_admin' } })
  if (!inv.ok || !inv.data?.id) throw new Error(`could not invite: ${said(inv)}`)

  // ══ 1. WHO READS THE PENDING LIST ════════════════════════════════════════
  console.log('\n▶ the pending invitations, read by a guest and by a member')
  const g = await G(`/invitations/workspace/${WS}`)
  const m = await M(`/invitations/workspace/${WS}`)
  const holds = (res) => JSON.stringify(res.data ?? null).includes(INVITEE)
  chk(
    g.status === 200 && Array.isArray(g.data) && g.data.length === 0 && !holds(g) && m.status === 200 && holds(m),
    'a guest reads no pending invitation — no invitee, no role — while a member reads them, for the pickers that offer people invited',
    `the guest ${g.status} ${JSON.stringify(g.data)?.slice(0, 120)}; the member ${m.status}, the invitee listed ${holds(m)}`,
  )

  // ══ 2. THE TOKEN ═════════════════════════════════════════════════════════
  console.log('\n▶ the invitation’s token: in the member’s list, and its link asked by a member and by the admin')
  const mLink = await M(`/invitations/${inv.data.id}/link`)
  const aLink = await A(`/invitations/${inv.data.id}/link`)
  const tokenInList = JSON.stringify(m.data ?? null).includes(inv.data.token ?? '<no token>')
  chk(
    !tokenInList && !JSON.stringify(m.data ?? null).includes('"token"') && mLink.status === 403 && aLink.status === 200,
    'an invitation’s token reaches only those who may copy its link: the member’s list carries none, and the link is refused to a member and given to the admin',
    `the token in the member's list ${tokenInList}; the member's link ${said(mLink)}; the admin's ${aLink.status}`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  if (WS && A) {
    const gone = await A(`/workspaces/${WS}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${WS} answered ${gone.status || 'nothing'}`)
  }
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}

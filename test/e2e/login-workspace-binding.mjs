/**
 * Which workspace governs a session — and whether that answer is stable.
 *
 * `WorkspacesService.findByMember` had no `ORDER BY` at all. Postgres is free
 * to return an unordered join in whatever order the plan produces, and for a
 * small table that is heap order — so an UPDATE, which writes a new tuple at
 * the end of the heap under MVCC, physically MOVES a row to the back of the
 * list. Renaming a workspace could therefore reorder a person's switcher.
 *
 * That would be a cosmetic annoyance on its own. It was not cosmetic, because
 * `AuthService.login` took `memberships[0]` from that same unordered query and
 * used it for four things:
 *
 *   · the `workspaceId` claim baked into the access token,
 *   · the feature flags resolved and baked in beside it,
 *   · the refresh-token TTL and the concurrent-session cap,
 *   · whether the IP allowlist applied, and whether the admin exemption did.
 *
 * So for anyone in more than one workspace, Postgres was choosing the security
 * policy. Meanwhile `validateUser`, seventy lines earlier in the same file,
 * already asked the right question through `getEffectiveForUser`, which orders
 * by `joinedAt` — so the password-lockout policy and the IP allowlist could
 * come from two different workspaces in the same sign-in.
 *
 * Both paths now resolve identically, and `findByMember` is ordered to match.
 *
 * WHAT THIS SUITE DOES NOT COVER, said plainly: the archived-workspace half of
 * the fix. `getEffectiveForUser` used to select straight from `workspace_members`
 * with no join, so it could hand back a workspace the person had archived and
 * which their own switcher no longer showed. Observing that end-to-end means
 * archiving the OLDEST workspace of the shared admin account, and a suite that
 * leaves the shared account's first workspace archived when it is killed mid-run
 * would break every later suite on the lane. It is covered by the unit test at
 * `apps/api/src/modules/security/effective-workspace.test.ts` instead.
 *
 *   node test/e2e/login-workspace-binding.mjs --api 3011
 */
import { signInApi } from './lib/signin.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 8

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
const ME = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  // The SENTENCE, then the reason. This printed `${bad ?? good}`, so a failing
  // check named only its reason and never itself — and for a check inside a
  // loop the reason is all a reader (or `check-break-reddened.mjs`) has to go
  // on. Seventy suites shared the line.
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` \u2014 ${bad}` : ''}`) }
}

const apiAs = (token) => async (route, init = {}) => {
  const headers = token ? { authorization: `Bearer ${token}` } : {}
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, {
    ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}

/** The `workspaceId` claim, read straight out of the JWT the server issued. */
const claimOf = (accessToken) => {
  const part = String(accessToken).split('.')[1]
  if (!part) return null
  const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
  return JSON.parse(json).workspaceId ?? null
}

const idsOf = (rows) => rows.map((r) => r.workspace?.id ?? r.id)
const TAG = `lwb-${Date.now()}`
const made = []
let A

try {
  const auth = await signInApi(API, ME.email, ME.password)
  A = apiAs(auth.accessToken)

  /*
   * Two workspaces made HERE, in a known order, rather than reasoning about
   * whatever this account already carries. A is joined before B, always.
   */
  const mkA = await A('/workspaces', { method: 'POST', body: { name: `WS ${TAG} a` } })
  if (mkA.status >= 300 || !mkA.data?.id) throw new Error(`could not create workspace A: ${mkA.status}`)
  made.push(mkA.data.id)
  const mkB = await A('/workspaces', { method: 'POST', body: { name: `WS ${TAG} b` } })
  if (mkB.status >= 300 || !mkB.data?.id) throw new Error(`could not create workspace B: ${mkB.status}`)
  made.push(mkB.data.id)
  const [wa, wb] = made

  const first = await A('/workspaces')
  if (first.status !== 200) throw new Error(`GET /workspaces answered ${first.status}`)
  const rows = first.data ?? []
  const ids = idsOf(rows)

  chk(
    ids.includes(wa) && ids.includes(wb),
    'both new workspaces are in the member list',
    `the list is missing one of them: has A=${ids.includes(wa)} B=${ids.includes(wb)}`,
  )

  chk(
    ids.indexOf(wa) !== -1 && ids.indexOf(wa) < ids.indexOf(wb),
    'the older membership comes first',
    `A is at ${ids.indexOf(wa)} and B at ${ids.indexOf(wb)} — joined order is not honoured`,
  )

  /*
   * Five reads, no writes between them. An unordered query on a table this
   * small usually IS stable while nothing changes, so this check alone proves
   * little — it is here to separate "stable until touched" from "stable".
   */
  const repeats = []
  for (let i = 0; i < 5; i++) repeats.push(idsOf((await A('/workspaces')).data ?? []).join(','))
  chk(
    new Set(repeats).size === 1,
    'five consecutive reads give the same order',
    `the order changed without a write: ${[...new Set(repeats)].length} distinct sequences`,
  )

  /*
   * THE CHECK WITH TEETH.
   *
   * Under MVCC an UPDATE writes a NEW tuple at the end of the heap, so with no
   * `ORDER BY` a renamed workspace physically moves to the back of a sequential
   * scan. Renaming A — the one that must stay first — is the cheapest way to
   * reorder the list, and it is exactly what a person renaming their workspace
   * would do without expecting their switcher to rearrange itself.
   */
  const renA = await A(`/workspaces/${wa}`, { method: 'PATCH', body: { name: `WS ${TAG} a2` } })
  chk(
    renA.status === 200,
    'renaming the older workspace is accepted',
    `rename answered ${renA.status} — the check below would pass vacuously`,
  )

  const afterA = idsOf((await A('/workspaces')).data ?? [])
  chk(
    afterA.indexOf(wa) !== -1 && afterA.indexOf(wa) < afterA.indexOf(wb),
    'renaming the older workspace does not move it behind the newer one',
    `after the rename A is at ${afterA.indexOf(wa)} and B at ${afterA.indexOf(wb)} — the list reordered on an UPDATE`,
  )

  const renB = await A(`/workspaces/${wb}`, { method: 'PATCH', body: { name: `WS ${TAG} b2` } })
  const afterB = idsOf((await A('/workspaces')).data ?? [])
  chk(
    renB.status === 200 && afterB.indexOf(wa) < afterB.indexOf(wb),
    'renaming the newer workspace leaves the order alone too',
    `after renaming B: A at ${afterB.indexOf(wa)}, B at ${afterB.indexOf(wb)} (rename ${renB.status})`,
  )

  /*
   * The token claim is the part that actually decides policy. It must name the
   * SAME workspace the switcher puts first — not merely "a workspace the person
   * belongs to", which is what `memberships[0]` guaranteed and no more.
   */
  const fresh = await signInApi(API, ME.email, ME.password)
  const claim = claimOf(fresh.accessToken)
  const listNow = idsOf((await apiAs(fresh.accessToken)('/workspaces')).data ?? [])
  chk(
    claim != null && listNow[0] != null && claim === listNow[0],
    'the access token is bound to the workspace the switcher lists first',
    `the token says ${claim} and the list starts with ${listNow[0]}`,
  )

  /*
   * A newly created workspace is the NEWEST membership, so it must not capture
   * the session. Under the old code a fresh insert landing early in the heap
   * could take over the policy for every subsequent login.
   */
  const mkC = await A('/workspaces', { method: 'POST', body: { name: `WS ${TAG} c` } })
  if (mkC.status < 300 && mkC.data?.id) made.push(mkC.data.id)
  const after = await signInApi(API, ME.email, ME.password)
  chk(
    claimOf(after.accessToken) === claim,
    'creating another workspace does not re-bind the session to it',
    `the claim moved from ${claim} to ${claimOf(after.accessToken)} because a new workspace was made`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mSUITE ERROR\x1b[0m ${err?.message ?? err}`)
} finally {
  for (const id of made) {
    // `apiAs` never throws, so a status check is the only way to know.
    const res = await A(`/workspaces/${id}`, { method: 'DELETE' })
    if (res.status >= 300 && res.status !== 404) {
      console.log(`  \x1b[33mCLEANUP\x1b[0m could not archive ${id}: ${res.status}`)
    }
  }
}

const ran = passed + failed
console.log(`\n${passed} passed, ${failed} failed`)
if (ran !== EXPECTED_CHECKS) {
  console.log(`\x1b[31monly ${ran} of ${EXPECTED_CHECKS} checks ran — the suite stopped early\x1b[0m`)
  process.exit(1)
}
process.exit(failed === 0 ? 0 : 1)

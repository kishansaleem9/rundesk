/**
 * A FEATURE FLAG RESOLVES THE SAME EVERYWHERE: THE PLATFORM'S SWITCH REACHES A
 * WORKSPACE, A WORKSPACE'S OWN SWITCH WINS, A ROLE OVERRIDE READS THE
 * WORKSPACE ROLE, AND A SWITCH IS ONE ROW.
 *
 * NOT FRAME ROWS: `found-28-sep/role-flags-read-the-account-role`, found by the
 * ClickApps research, and `found-29-sep/platform-flag-switches-apply-nowhere`,
 * found closing it. A role override was matched against the account's role
 * (`user.role`) in the navigation and the guard, and against the membership's
 * in "Contact your admin", so a manager's override read on in one and off in
 * the other. A workspace read loaded that workspace's rows alone, so the
 * platform console's switch (no workspace) applied in none; and with NULLs
 * distinct in the unique key, every such switch inserted another row.
 *
 * ClickUp: ClickApps are switched per Workspace by its owner and admins; the
 * platform's own defaults sit under that. Here the order is the platform's
 * switch, then the workspace's, then a role's, then a person's.
 *
 * It switches `forms` for the whole platform, so every exit puts it back on.
 *
 *   node test/e2e/flag-resolution.mjs --api 3027
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
  const text = await res.text().catch(() => '')
  let json = null
  try { json = JSON.parse(text) } catch { /* no body */ }
  return { status: res.status, data: json?.data, error: json?.error }
}
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `flr${stamp}`
let sql = null
let WS = null
let A = null
/** The platform's forms switch, put back on however the run ends. */
const platformOn = async () => { if (A) await A('/feature-flags/forms', { method: 'PUT', body: { enabled: true, scope: 'global' } }) }

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the switches stored are counted by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  // A run killed half-way leaves the platform's forms off: healed before anything is read.
  await platformOn()
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const person = async (key, role) => {
    const email = `${TAG}-${key}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `Flags ${key}`, email, password: 'FlagRules@12345!', organizationName: `Flags ${key} ${stamp}`, organizationSlug: `flags-${key}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (added.status >= 300) throw new Error(`could not add the ${key}: ${said(added)}`)
    return apiAs(signed.accessToken)
  }
  const member = await person('member', 'member')
  const manager = await person('manager', 'manager')
  /** What `who` is told about forms here — the navigation's read — and what the guard answers. */
  const forms = async (who) => {
    const nav = await who(`/feature-flags/resolved?workspaceId=${WS}`)
    const route = await who(`/workspaces/${WS}/forms`)
    return { nav: nav.data?.flags?.forms ?? null, route: route.status }
  }

  // ══ 1. THE PLATFORM'S SWITCH REACHES A WORKSPACE ═════════════════════════
  console.log('\n▶ the platform console switches Forms off')
  const off = await A('/feature-flags/forms', { method: 'PUT', body: { enabled: false, scope: 'global' } })
  const underPlatform = await forms(member)
  chk(
    off.status === 200 && underPlatform.nav === false && underPlatform.route === 404,
    'a platform switch turning Forms off reaches a workspace that says nothing of its own: the member is told it is off, and its routes answer 404',
    `switch ${said(off)}; the member ${JSON.stringify(underPlatform)}`,
  )

  // ══ 2. THE WORKSPACE'S OWN SWITCH WINS ═══════════════════════════════════
  console.log('\n▶ the workspace switches Forms on for itself')
  const own = await A('/feature-flags/forms', { method: 'PUT', body: { enabled: true, scope: 'workspace', scopeId: WS, workspaceId: WS } })
  const underOwn = await forms(member)
  chk(
    own.status === 200 && underOwn.nav === true && underOwn.route === 200,
    'the workspace’s own switch turning Forms on wins over the platform’s off — told on, and its routes answer',
    `switch ${said(own)}; the member ${JSON.stringify(underOwn)}`,
  )

  // ══ 3. A SWITCH IS ONE ROW ═══════════════════════════════════════════════
  console.log('\n▶ the platform switches Forms three more times')
  for (const enabled of [true, false, true]) await A('/feature-flags/forms', { method: 'PUT', body: { enabled, scope: 'global' } })
  const [{ n: rows }] = await sql`select count(*)::int as n from feature_flags where flag_key = 'forms' and scope = 'global' and scope_id is null and workspace_id is null`
  const [{ enabled: stored }] = await sql`select enabled from feature_flags where flag_key = 'forms' and scope = 'global' and scope_id is null and workspace_id is null order by updated_at desc limit 1`
  chk(
    rows === 1 && stored === true,
    'the platform’s switch is one row, updated each time — not another row per switch, with the read left to the table’s order',
    `${rows} row(s) for the platform’s forms switch; the newest says ${stored}`,
  )

  // ══ 4. A ROLE OVERRIDE READS THE WORKSPACE ROLE ══════════════════════════
  console.log('\n▶ the platform turns Forms off for managers in this workspace')
  const byRole = await A('/feature-flags/forms', { method: 'PUT', body: { enabled: false, scope: 'role', scopeId: 'manager', workspaceId: WS } })
  const managerSees = await forms(manager)
  const memberSees = await forms(member)
  chk(
    byRole.status === 200 && managerSees.nav === false && managerSees.route === 404 && memberSees.nav === true && memberSees.route === 200,
    'an override for managers reaches the workspace’s manager — told off, its routes 404 — and not a plain member, who keeps Forms',
    `switch ${said(byRole)}; the manager ${JSON.stringify(managerSees)}; the member ${JSON.stringify(memberSees)}`,
  )

  // ══ 5. THE NAVIGATION AND THE ASK AGREE ══════════════════════════════════
  console.log('\n▶ the manager asks for Forms')
  const ask = await manager('/feature-flags/request/forms', { method: 'POST', body: { workspaceId: WS } })
  chk(
    ask.status === 200 && ask.data?.status !== 'already_enabled' && managerSees.nav === false,
    'the manager’s “Contact your admin” agrees with their navigation: Forms is off in both, so the ask goes out rather than saying it is already on',
    `the ask ${said(ask)} ${JSON.stringify(ask.data ?? null)}; the navigation says ${managerSees.nav}`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  await platformOn().catch(() => {})
  if (WS && A) await A(`/workspaces/${WS}`, { method: 'DELETE' }).catch(() => {})
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}

/**
 * A WORKSPACE'S CLICKAPPS ARE TURNED ON AND OFF — AND THEIR OVERRIDES READ — BY
 * WHOEVER HOLDS `workspace.clickapps.manage`; WHICH ARE ON IS READ BY EVERYBODY.
 *
 * NOT A FRAME ROW: `found-25-sep/admin-guard-admits-managers-where-the-web-says-admin`,
 * its ClickApps slice. `GET /feature-flags/workspace/:id` (the workspace's raw
 * overrides: who switched what, and when) stood behind `WorkspaceAdminGuard`,
 * which admits managers, while `PUT /feature-flags/:flag` asked the membership
 * row for `workspace_admin` and nothing else, so no key could hand either to
 * anyone. Settings offered the Features tab to admins alone; a member's "ask the
 * admins" told the base-role admins only, and linked them to the platform
 * console, which sends a workspace admin away.
 *
 * ClickUp (help centre "Intro to ClickApps", search snippets): "Only Workspace
 * owners and admins can activate or deactivate ClickApps. Members can view, but
 * not activate or deactivate ClickApps. Guests cannot view…". No snippet names a
 * ClickApps permission of its own among the custom-role permissions; a custom
 * role built on Admin carries it. So the switch and its override list are one
 * key, an admin's by default and grantable: a manager does neither, a member
 * granted it does both, and every member still reads which ClickApps are on
 * (`GET /feature-flags/resolved`, which every page's navigation reads).
 *
 *   node test/e2e/clickapp-flags-access.mjs --api 3022 --dist /tmp/claude-0/dist-2
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 7

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
const ADMIN = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}
const KEY = 'workspace.clickapps.manage'

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
  try { json = JSON.parse(text) } catch { /* not JSON */ }
  return { status: res.status, data: json?.data, error: json?.error }
}
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `cfa${stamp}`
const PASSWORD = 'ClickAppFlags@12345!'
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — who switched a flag, and who was told, are read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id

  const person = async (key, role, keys = []) => {
    const email = `${TAG}-${key}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `Flags ${key}`, email, password: PASSWORD, organizationName: `Flags ${key} ${stamp}`, organizationSlug: `flags-${key}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (added.status >= 300) throw new Error(`could not add the ${key}: ${said(added)}`)
    const [row] = await sql`select m.id, m.user_id from workspace_members m join users u on u.id = m.user_id where m.workspace_id = ${WS} and u.email = ${email}`
    let granted = keys.length === 0
    if (keys.length > 0) {
      // A key the catalog does not know is refused (400): recorded, so the checks say so.
      const r = await A(`/workspaces/${WS}/roles`, { method: 'POST', body: { name: `${TAG} ${key}`, permissions: keys } })
      const given = r.data?.id ? await A(`/workspaces/${WS}/members/${row.id}/roles/${r.data.id}`, { method: 'POST', body: {} }) : { status: 0 }
      granted = given.status > 0 && given.status < 300
      if (!granted) console.log(`    (the ${key} was not granted ${keys.join(', ')}: ${said(r)})`)
    }
    return { key, email, password: PASSWORD, userId: row.user_id, granted, as: apiAs(signed.accessToken) }
  }
  // A workspace admin by role, not the platform admin who made the workspace: a
  // super_admin passes every key by definition, so it proves nothing here.
  const admin = await person('admin', 'workspace_admin')
  const manager = await person('manager', 'manager')
  const member = await person('member', 'member')
  const switcher = await person('switcher', 'member', [KEY])

  // ══ 1. THE OVERRIDE LIST ═════════════════════════════════════════════════
  console.log('\n▶ reading the workspace’s ClickApp overrides: the manager, a member, the member granted the key, the admin')
  const listOf = async (who) => (await who.as(`/feature-flags/workspace/${WS}`)).status
  const lists = {
    manager: await listOf(manager),
    member: await listOf(member),
    switcher: await listOf(switcher),
    admin: await listOf(admin),
  }
  chk(
    lists.manager === 403 && lists.member === 403 && switcher.granted && lists.switcher === 200 && lists.admin === 200,
    `the workspace’s ClickApp overrides are read by the member granted ${KEY} and the admin (200) — not by the manager or a plain member (403)`,
    `${JSON.stringify(lists)}${switcher.granted ? '' : '; the switcher was NOT GRANTED'}`,
  )

  // ══ 2. TURNING ONE OFF ═══════════════════════════════════════════════════
  console.log('\n▶ turning Forms off: the manager, a member, then the member granted the key; the admin turns Goals off')
  const turn = (who, flag, enabled) => who.as(`/feature-flags/${flag}`, { method: 'PUT', body: { enabled, scope: 'workspace', scopeId: WS, workspaceId: WS } })
  const rowsOf = (flag) => sql`select enabled, updated_by from feature_flags where workspace_id = ${WS} and flag_key = ${flag} and scope = 'workspace'`
  const managerTurns = await turn(manager, 'forms', false)
  const memberTurns = await turn(member, 'forms', false)
  const untouched = (await rowsOf('forms')).length === 0
  const switcherTurns = await turn(switcher, 'forms', false)
  const [formsRow] = await rowsOf('forms')
  const adminTurns = await turn(admin, 'goals', false)
  const [goalsRow] = await rowsOf('goals')
  chk(
    managerTurns.status === 403 && memberTurns.status === 403 && untouched
      && switcher.granted && switcherTurns.status === 200 && formsRow?.enabled === false && formsRow?.updated_by === switcher.userId
      && adminTurns.status === 200 && goalsRow?.enabled === false,
    `a member granted ${KEY} turns a ClickApp off for the workspace, and so does the admin — the manager and a plain member are refused (403) and write nothing`,
    `manager ${said(managerTurns)}; member ${said(memberTurns)}; untouched before the switcher ${untouched}; switcher ${switcher.granted ? said(switcherTurns) : 'NOT GRANTED'} → ${JSON.stringify(formsRow ?? null)}; admin ${said(adminTurns)} → ${JSON.stringify(goalsRow ?? null)}`,
  )

  // ══ 3. WHICH ARE ON, FOR EVERYBODY ═══════════════════════════════════════
  // What the navigation reads on every page. Locking the override list must not lock this.
  console.log('\n▶ which ClickApps are on: a plain member and the manager read it')
  const resolvedOf = async (who) => {
    const r = await who.as(`/feature-flags/resolved?workspaceId=${WS}`)
    return { status: r.status, goals: r.data?.flags?.goals, docs: r.data?.flags?.docs }
  }
  const memberResolved = await resolvedOf(member)
  const managerResolved = await resolvedOf(manager)
  chk(
    memberResolved.status === 200 && memberResolved.goals === false && memberResolved.docs !== false
      && managerResolved.status === 200 && managerResolved.goals === false,
    'a plain member and the manager still read which ClickApps are on (200): Goals, switched off by the admin, reads off for them, and Docs stays on',
    `member ${JSON.stringify(memberResolved)}; manager ${JSON.stringify(managerResolved)}`,
  )

  // ══ 4. ASKING FOR ONE ════════════════════════════════════════════════════
  // "Contact your admin" asks whoever may switch it on, and takes them where they can.
  console.log('\n▶ a plain member asks for Goals: who is told, and where the note leads')
  const asked = await member.as('/feature-flags/request/goals', { method: 'POST', body: { workspaceId: WS } })
  const told = await sql`select user_id, target from notifications where workspace_id = ${WS} and type = 'access_requested' and actor_id = ${member.userId}`
  const toldIds = new Set(told.map((n) => n.user_id))
  const switcherNote = told.find((n) => n.user_id === switcher.userId)
  const adminNote = told.find((n) => n.user_id === admin.userId)
  const where = `/app/${WS}/settings?tab=features`
  chk(
    asked.status === 200 && switcher.granted && toldIds.has(switcher.userId) && toldIds.has(admin.userId) && !toldIds.has(manager.userId)
      && switcherNote?.target?.url === where && adminNote?.target?.url === where,
    `a member’s ask for a ClickApp reaches the member granted ${KEY} and the admin, not the manager — and leads to this workspace’s Features tab`,
    `${said(asked)} ${JSON.stringify(asked.data ?? null)}; told ${JSON.stringify(told.map((n) => ({ who: [admin, manager, member, switcher].find((p) => p.userId === n.user_id)?.key ?? n.user_id, url: n.target?.url })))}`,
  )

  // ══ 5–7. THE PAGES ═══════════════════════════════════════════════════════
  browser = await (await resolveChromium()).launch(launchOptions())
  const pageAs = async (who, route, probe, onPage) => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } })
    const page = await ctx.newPage()
    onPage?.(page)
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', who.email)
    await page.fill('input[type=password]', who.password)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
    await page.goto(`${B}${route}`, { waitUntil: 'domcontentloaded' })
    const seen = await probe(page)
    await ctx.close().catch(() => {})
    return seen
  }
  const featuresOffered = async (page) => {
    await waitUntil(async () => (await page.locator('[data-testid^="settings-tab-"]').count()) > 0 || !page.url().includes('/settings'), { timeoutMs: 15_000 })
    // The switches are disabled while the flags load: wait for them to settle.
    await waitUntil(async () => (await page.locator('button[role=switch]:not([disabled])').count()) > 0, { timeoutMs: 5000 })
    const u = new URL(page.url())
    return {
      url: u.pathname + u.search,
      tab: await page.getByTestId('settings-tab-features').count(),
      switches: await page.locator('button[role=switch]').count(),
      live: await page.locator('button[role=switch]:not([disabled])').count(),
      notice: await page.getByText(/can change these settings/i).count(),
    }
  }

  console.log('\n▶ Settings → Features, for the member granted the key')
  const switcherSees = await pageAs(switcher, `/app/${WS}/settings?tab=features`, featuresOffered)
  chk(
    switcherSees.url.includes('tab=features') && switcherSees.tab === 1 && switcherSees.switches >= 12
      && switcherSees.live === switcherSees.switches && switcherSees.notice === 0,
    `Settings opens Features to the member granted ${KEY}, every ClickApp switch live and no “admins only” notice`,
    JSON.stringify(switcherSees),
  )

  console.log('\n▶ Settings → Features, for the admin, the manager and a plain member')
  const adminSees = await pageAs(admin, `/app/${WS}/settings?tab=features`, featuresOffered)
  const managerSees = await pageAs(manager, `/app/${WS}/settings?tab=features`, featuresOffered)
  const memberSees = await pageAs(member, `/app/${WS}/settings?tab=features`, featuresOffered)
  // Features opens read-only to every member but a guest — ClickUp: "Members can
  // view, but not activate or deactivate ClickApps" (`members-see-no-clickapps-list`).
  chk(
    adminSees.tab === 1 && adminSees.switches >= 12 && adminSees.live === adminSees.switches && adminSees.notice === 0
      && managerSees.url.includes('tab=features') && managerSees.tab === 1 && managerSees.switches >= 12 && managerSees.live === 0 && managerSees.notice > 0
      && memberSees.url.includes('tab=features') && memberSees.tab === 1 && memberSees.switches >= 12 && memberSees.live === 0 && memberSees.notice > 0,
    'Settings offers the admin every ClickApp switch live — and shows the manager and a plain member the same list with every switch disabled and the reason said',
    `admin ${JSON.stringify(adminSees)}; manager ${JSON.stringify(managerSees)}; member ${JSON.stringify(memberSees)}`,
  )

  // ══ 7. A MEMBER'S PAGES ══════════════════════════════════════════════════
  console.log('\n▶ a plain member’s home: what it reads to decide which ClickApps to show')
  const heard = []
  const memberHome = await pageAs(member, `/app/${WS}`, async (page) => {
    await waitUntil(async () => heard.some((h) => h.url.includes('/feature-flags/resolved') && h.url.includes(WS) && h.body), { timeoutMs: 15_000 })
    await page.waitForTimeout(1500)
    const resolved = heard.find((h) => h.url.includes('/feature-flags/resolved') && h.url.includes(WS) && h.body)
    return {
      resolved: resolved ? { status: resolved.status, goals: resolved.body?.data?.flags?.goals } : null,
      overrides: heard.filter((h) => h.url.includes('/feature-flags/workspace/')).length,
      refused: heard.filter((h) => h.status >= 400).map((h) => `${h.status} ${new URL(h.url).pathname}`),
    }
  }, (page) => {
    page.on('response', async (res) => {
      if (!res.url().includes('/feature-flags/')) return
      const entry = { url: res.url(), status: res.status(), body: null }
      heard.push(entry)
      entry.body = await res.json().catch(() => ({}))
    })
  })
  chk(
    memberHome.resolved?.status === 200 && memberHome.resolved?.goals === false && memberHome.overrides === 0 && memberHome.refused.length === 0,
    'a plain member’s pages learn which ClickApps are on from /feature-flags/resolved (200, Goals off) and never ask for the override list or meet a refusal',
    JSON.stringify(memberHome),
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  if (WS && A) {
    const gone = await A(`/workspaces/${WS}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${WS} answered ${gone.status || 'nothing'}`)
  }
  // Only now: the DELETE above goes through this proxy, and a closed one refuses it.
  stack.close()
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}

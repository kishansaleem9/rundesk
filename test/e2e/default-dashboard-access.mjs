/**
 * THE WORKSPACE'S DEFAULT DASHBOARD IS SET AND CLEARED BY WHOEVER HOLDS
 * `dashboard.workspace_default.manage` — AN ADMIN'S BY DEFAULT, NOT A MANAGER'S,
 * AND GRANTABLE — AND ONLY TO A DASHBOARD ITS SETTER MAY SEE. EVERY MEMBER READS IT.
 *
 * NOT A FRAME ROW: `found-25-sep/admin-guard-admits-managers-where-the-web-says-admin`,
 * its dashboard slice. Setting and clearing stood behind `WorkspaceAdminGuard`,
 * which admits managers. Setting then asked `isAdminRole` in the service, so a
 * manager was refused it; clearing asked nothing more, so a manager cleared the
 * default an admin had set, with no page offering it (the dashboard offers both
 * controls to `useWorkspaceRole().isAdmin`). No key could hand either to anyone,
 * and setting took any preset id in the workspace, a colleague's unshared one too.
 *
 * ClickUp (help centre "Set a default view", search snippets): "On the Business
 * Plan and above, owners and admins can set default views for everyone in
 * specific Workspace locations"; "Share Dashboards" / "Permissions in detail":
 * members make and share their own dashboards, a guest gets View only, and a
 * dashboard shows each viewer the data of the locations they may see. No
 * dashboard-specific custom-role toggle was found ("Manage Custom Role
 * permissions": on Business Plus and up the default permissions can be edited
 * into custom roles). So choosing what everybody lands on is an admin's, a
 * manager keeps no part of it, a custom role may grant it, and reading it stays
 * every member's.
 *
 *   node test/e2e/default-dashboard-access.mjs --api 3025 --dist /tmp/claude-0/dist-5
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil } from './lib/wait.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 8

const KEY = 'dashboard.workspace_default.manage'
const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
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

const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `dda${stamp}`
const PASSWORD = 'DefaultDash@12345!'
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — which dashboard is the default is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id

  const person = async (key, role, keys = []) => {
    const email = `${TAG}-${key}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `Dash ${key}`, email, password: PASSWORD, organizationName: `Dash ${key} ${stamp}`, organizationSlug: `dash-${key}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (added.status >= 300) throw new Error(`could not add the ${key}: ${said(added)}`)
    let granted = keys.length === 0
    if (keys.length > 0) {
      // A key the catalog does not know is refused (400): recorded, so the checks say so.
      const [row] = await sql`select m.id from workspace_members m join users u on u.id = m.user_id where m.workspace_id = ${WS} and u.email = ${email}`
      const r = await A(`/workspaces/${WS}/roles`, { method: 'POST', body: { name: `${TAG} ${key}`, permissions: keys } })
      const given = r.data?.id ? await A(`/workspaces/${WS}/members/${row.id}/roles/${r.data.id}`, { method: 'POST', body: {} }) : { status: 0 }
      granted = given.status > 0 && given.status < 300
      if (!granted) console.log(`    (the ${key} was not granted ${keys.join(', ')}: ${said(r)})`)
    }
    const as = apiAs(signed.accessToken)
    // Each person's own dashboard in this workspace: private to them, and not their own default.
    const preset = await as('/dashboards', { method: 'POST', body: { workspaceId: WS, name: `${TAG} ${key}'s dashboard`, layout: [] } })
    if (preset.status >= 300 || !preset.data?.id) throw new Error(`could not make the ${key}'s dashboard: ${said(preset)}`)
    return { key, email, password: PASSWORD, granted, as, preset: preset.data.id }
  }
  // A workspace admin who is NOT a super-admin, so the admin's side is the role's, not the platform's bypass.
  const admin = await person('admin', 'workspace_admin')
  const manager = await person('manager', 'manager')
  const member = await person('member', 'member')
  const setter = await person('setter', 'member', [KEY])

  const current = async () => (await sql`select id from dashboard_presets where workspace_id = ${WS} and is_workspace_default = true`).map((r) => r.id)
  const setAs = (who, presetId) => who.as(`/dashboards/workspace/${WS}/preset/${presetId}/workspace-default`, { method: 'PUT' })
  const clearAs = (who) => who.as(`/dashboards/workspace/${WS}/workspace-default`, { method: 'DELETE' })
  /** Back to the admin's dashboard as the default, whatever a check before left. */
  const restore = async () => {
    const now = await current()
    if (now.length === 1 && now[0] === admin.preset) return
    const r = await setAs(admin, admin.preset)
    if (r.status < 300) return
    // The route under test may be what is broken (a patch that refuses the
    // admin, as dda-1 does): put it back by SQL, so that refusal reddens its
    // own check and does not end the run before the others are measured.
    await sql`update dashboard_presets set is_workspace_default = (id = ${admin.preset}) where workspace_id = ${WS}`
  }

  // ══ 1. THE ADMIN ═════════════════════════════════════════════════════════
  console.log('\n▶ the workspace admin sets, clears and sets again')
  const adminSets = await setAs(admin, admin.preset)
  const afterSet = await current()
  const adminClears = await clearAs(admin)
  const afterClear = await current()
  const adminSetsAgain = await setAs(admin, admin.preset)
  const afterAgain = await current()
  chk(
    adminSets.status === 200 && afterSet.length === 1 && afterSet[0] === admin.preset
      && adminClears.status < 300 && afterClear.length === 0
      && adminSetsAgain.status === 200 && afterAgain[0] === admin.preset,
    'a workspace admin who is not a super-admin sets their dashboard as the workspace default, clears it, and sets it again',
    `set ${said(adminSets)} → ${JSON.stringify(afterSet)}; clear ${said(adminClears)} → ${JSON.stringify(afterClear)}; again ${said(adminSetsAgain)} → ${JSON.stringify(afterAgain)}`,
  )

  // ══ 2. SETTING, REFUSED ══════════════════════════════════════════════════
  console.log('\n▶ the manager and the plain member try to make their own dashboard the default')
  await restore()
  const managerSets = await setAs(manager, manager.preset)
  const memberSets = await setAs(member, member.preset)
  const afterRefusedSets = await current()
  chk(
    managerSets.status === 403 && memberSets.status === 403 && afterRefusedSets.length === 1 && afterRefusedSets[0] === admin.preset,
    'neither a manager nor a plain member makes their own dashboard the workspace default (403 each), and the admin’s stays it',
    `manager ${said(managerSets)}; member ${said(memberSets)}; default now ${JSON.stringify(afterRefusedSets)}`,
  )

  // ══ 3. CLEARING, REFUSED ═════════════════════════════════════════════════
  console.log('\n▶ the manager and the plain member try to clear the admin’s default')
  await restore()
  const managerClears = await clearAs(manager)
  const afterManagerClears = await current()
  const memberClears = await clearAs(member)
  const afterMemberClears = await current()
  chk(
    managerClears.status === 403 && afterManagerClears[0] === admin.preset
      && memberClears.status === 403 && afterMemberClears[0] === admin.preset,
    'a manager clears no workspace default an admin set (403), no more than a plain member does — it is still the admin’s dashboard',
    `manager ${said(managerClears)} → ${JSON.stringify(afterManagerClears)}; member ${said(memberClears)} → ${JSON.stringify(afterMemberClears)}`,
  )

  // ══ 4. THE KEY ═══════════════════════════════════════════════════════════
  console.log(`\n▶ the member granted ${KEY} sets their dashboard and clears it`)
  await restore()
  const setterSets = await setAs(setter, setter.preset)
  const afterSetterSets = await current()
  const setterClears = await clearAs(setter)
  const afterSetterClears = await current()
  chk(
    setter.granted && setterSets.status === 200 && afterSetterSets.length === 1 && afterSetterSets[0] === setter.preset
      && setterClears.status < 300 && afterSetterClears.length === 0,
    `a member granted ${KEY} makes their own dashboard the workspace default, replacing the admin’s, and clears it`,
    `${setter.granted ? '' : 'NOT GRANTED; '}set ${said(setterSets)} → ${JSON.stringify(afterSetterSets)}; clear ${said(setterClears)} → ${JSON.stringify(afterSetterClears)}`,
  )

  // ══ 5. ONLY A DASHBOARD ITS SETTER MAY SEE ═══════════════════════════════
  // The manager's dashboard is private to the manager. Made the default, it would be listed to everybody.
  console.log('\n▶ the member granted the key tries to make the manager’s private dashboard the default')
  await restore()
  const setterSetsOthers = await setAs(setter, manager.preset)
  const afterOthers = await current()
  chk(
    setter.granted && setterSetsOthers.status === 404 && afterOthers.length === 1 && afterOthers[0] === admin.preset,
    'even granted the key, a member cannot make a colleague’s unshared dashboard the workspace default — it is not found for them (404), and the default does not move',
    `${setter.granted ? '' : 'NOT GRANTED; '}${said(setterSetsOthers)}; default now ${JSON.stringify(afterOthers)}`,
  )

  // ══ 6. EVERY MEMBER READS IT ═════════════════════════════════════════════
  console.log('\n▶ the plain member and the manager read the workspace default')
  await restore()
  const readsOf = async (who) => {
    const def = await who.as(`/dashboards/workspace/${WS}/default`)
    const list = await who.as(`/dashboards/workspace/${WS}`)
    const row = Array.isArray(list.data) ? list.data.find((p) => p.id === admin.preset) : null
    return { def: def.status, defId: def.data?.id ?? null, list: list.status, listed: !!row, flagged: row?.isWorkspaceDefault === true }
  }
  const memberReads = await readsOf(member)
  const managerReads = await readsOf(manager)
  const reads = (x) => x.def === 200 && x.defId === admin.preset && x.list === 200 && x.listed && x.flagged
  chk(
    reads(memberReads) && reads(managerReads),
    'a plain member and a manager with no default of their own each read the admin’s dashboard as their default, and find it in their list marked as the workspace’s',
    `member ${JSON.stringify(memberReads)}; manager ${JSON.stringify(managerReads)}`,
  )

  // ══ 7–8. THE DASHBOARD PAGE ══════════════════════════════════════════════
  browser = await (await resolveChromium()).launch(launchOptions())
  const pageAs = async (who, probe) => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } })
    const page = await ctx.newPage()
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', who.email)
    await page.fill('input[type=password]', who.password)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
    const seen = await probe(page)
    await ctx.close().catch(() => {})
    return seen
  }
  /**
   * The controls on the Custom dashboard tab, with `presetId` the one on screen. The index row
   * of that preset is waited for, so a count of 0 is a page that loaded and offered nothing.
   */
  const controlsOn = async (page, presetId, expectAControl) => {
    await page.goto(`${B}/app/${WS}/dashboard?mode=custom&preset=${presetId}`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId(`dashboard-preset-${presetId}`).waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
    const set = page.getByRole('button', { name: /^Set as workspace default$/ })
    const clear = page.getByRole('button', { name: /^Clear workspace default$/ })
    if (expectAControl) await waitUntil(async () => (await set.count()) + (await clear.count()) > 0, { timeoutMs: 8000 })
    else await page.waitForTimeout(2000) // what this person may do has loaded by now
    return {
      row: await page.getByTestId(`dashboard-preset-${presetId}`).count(),
      set: await set.count(),
      clear: await clear.count(),
      badge: await page.getByText('Workspace default', { exact: true }).count(),
    }
  }

  console.log(`\n▶ the dashboard page, for the member granted ${KEY}`)
  await restore()
  const setterPage = await pageAs(setter, async (page) => ({
    onDefault: await controlsOn(page, admin.preset, true),
    onOwn: await controlsOn(page, setter.preset, true),
  }))
  chk(
    setterPage.onDefault.row === 1 && setterPage.onDefault.clear === 1 && setterPage.onDefault.set === 0
      && setterPage.onOwn.row === 1 && setterPage.onOwn.set === 1 && setterPage.onOwn.clear === 0,
    `the dashboard offers the member granted ${KEY} “Clear workspace default” on the admin’s default and “Set as workspace default” on their own`,
    `on the default ${JSON.stringify(setterPage.onDefault)}; on their own ${JSON.stringify(setterPage.onOwn)}`,
  )

  console.log('\n▶ the dashboard page, for the admin, the manager and the plain member')
  await restore()
  const adminPage = await pageAs(admin, (page) => controlsOn(page, admin.preset, true))
  const managerPage = await pageAs(manager, async (page) => ({
    onDefault: await controlsOn(page, admin.preset, false),
    onOwn: await controlsOn(page, manager.preset, false),
  }))
  const memberPage = await pageAs(member, (page) => controlsOn(page, admin.preset, false))
  const none = (x) => x.row === 1 && x.set === 0 && x.clear === 0
  chk(
    adminPage.clear === 1
      && none(managerPage.onDefault) && managerPage.onDefault.badge >= 1 && none(managerPage.onOwn)
      && none(memberPage) && memberPage.badge >= 1,
    'the dashboard offers the workspace admin “Clear workspace default”, and the manager and the plain member only the “Workspace default” badge — no set or clear control on the default or on their own',
    `admin ${JSON.stringify(adminPage)}; manager on the default ${JSON.stringify(managerPage.onDefault)}, on their own ${JSON.stringify(managerPage.onOwn)}; member ${JSON.stringify(memberPage)}`,
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

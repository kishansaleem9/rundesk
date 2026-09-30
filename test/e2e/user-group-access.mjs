/**
 * USER GROUPS ARE MADE, RENAMED, DELETED AND GIVEN THEIR MEMBERS BY WHOEVER
 * HOLDS `groups.manage` — AN ADMIN'S BY DEFAULT, GRANTABLE BY A CUSTOM ROLE —
 * AND READ BY EVERY MEMBER.
 *
 * NOT A FRAME ROW: `found-25-sep/admin-guard-admits-managers-where-the-web-says-admin`,
 * its user-groups slice. Making a group, renaming it, deleting it, and adding,
 * replacing or removing its members (six routes on
 * `workspace-groups.controller.ts`) stood behind `WorkspaceAdminGuard`, which
 * admits managers. Settings offered its Groups tab to admins alone, and the
 * Teams page offered Create Team to managers while saying "Only a workspace
 * admin can create a team". No key could hand any of it to anyone.
 *
 * ClickUp (help centre "Use Teams in your organization" and "Teams (User
 * Groups)", changelog "Teams: Assign User Groups", search snippets): "Only
 * Workspace owners and admins can create a Team"; owners, admins and members
 * all use the Teams Hub; custom roles (Business Plus, Enterprise) add role
 * permissions beyond the defaults. So it is one key, an admin's by default and
 * grantable: a manager manages no group, a member granted the key does, and the
 * groups stay readable by every member — chat's @team picker, the Teams page
 * and My Teams read them.
 *
 *   node test/e2e/user-group-access.mjs --api 3026 --dist /tmp/claude-0/dist-6
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
const ok = (res) => res.status >= 200 && res.status < 300

const stamp = Date.now()
const TAG = `uga${stamp}`
const PASSWORD = 'UserGroups@12345!'
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
  if (!sql) throw new Error('no DATABASE_URL — what the routes did is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id

  const person = async (key, role, keys = []) => {
    const email = `${TAG}-${key}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `Groups ${key}`, email, password: PASSWORD, organizationName: `Groups ${key} ${stamp}`, organizationSlug: `groups-${key}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (!added.ok) throw new Error(`could not add the ${key}: ${said(added)}`)
    const [row] = await sql`select m.id as member_id, u.id as user_id from workspace_members m join users u on u.id = m.user_id where m.workspace_id = ${WS} and u.email = ${email}`
    let granted = keys.length === 0
    if (keys.length > 0) {
      // A key the catalog does not know is refused (400): recorded, so the checks say so.
      const r = await A(`/workspaces/${WS}/roles`, { method: 'POST', body: { name: `${TAG} ${key}`, permissions: keys } })
      const given = r.data?.id ? await A(`/workspaces/${WS}/members/${row.member_id}/roles/${r.data.id}`, { method: 'POST', body: {} }) : { status: 0 }
      granted = ok(given)
      if (!granted) console.log(`    (the ${key} was not granted ${keys.join(', ')}: ${said(r)})`)
    }
    return { email, password: PASSWORD, userId: row.user_id, granted, as: apiAs(signed.accessToken) }
  }
  const manager = await person('manager', 'manager')
  const grouper = await person('grouper', 'member', ['groups.manage'])
  const plain = await person('plain', 'member')

  const groupNamed = async (name) => (await sql`select id, name from workspace_groups where workspace_id = ${WS} and name = ${name}`)[0] ?? null
  const membersOf = async (groupId) =>
    (await sql`select user_id from workspace_group_members where group_id = ${groupId}`).map((r) => r.user_id).sort()
  const same = (a, b) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i])

  // The admin's group, which the others read, rename and staff.
  const base = await A(`/workspaces/${WS}/groups`, { method: 'POST', body: { name: `${TAG} base`, alias: `${TAG}-base`, memberIds: [plain.userId] } })
  if (!ok(base) || !base.data?.id) throw new Error(`the admin could not make the base group: ${said(base)}`)
  const BASE = base.data.id

  // ══ 1. READING ═══════════════════════════════════════════════════════════
  // Chat's @team picker, the Teams page and My Teams all read `GET /groups`: every member needs it.
  console.log('\n▶ reading the groups: a plain member and the manager, the list and one by id')
  const readsOf = async (who) => {
    const list = await who(`/workspaces/${WS}/groups`)
    const one = await who(`/workspaces/${WS}/groups/${BASE}`)
    const row = (list.data ?? []).find?.((g) => g.id === BASE)
    return {
      list: list.status,
      listed: !!row && (row.members ?? []).some((m) => m.userId === plain.userId),
      one: one.status,
      oneMembers: (one.data?.members ?? []).length,
    }
  }
  const plainReads = await readsOf(plain.as)
  const managerReads = await readsOf(manager.as)
  const readsOk = (r) => r.list === 200 && r.listed && r.one === 200 && r.oneMembers === 1
  chk(
    readsOk(plainReads) && readsOk(managerReads),
    'a plain member and the manager still read the workspace’s user groups — the list with each group’s members, and one group by id (200 each) — as mentions and the Teams page need',
    `plain ${JSON.stringify(plainReads)}; manager ${JSON.stringify(managerReads)}`,
  )

  // ══ 2. MAKING ════════════════════════════════════════════════════════════
  console.log('\n▶ making a group: the manager, a plain member, the member granted groups.manage')
  const managerMakes = await manager.as(`/workspaces/${WS}/groups`, { method: 'POST', body: { name: `${TAG} by manager` } })
  const plainMakes = await plain.as(`/workspaces/${WS}/groups`, { method: 'POST', body: { name: `${TAG} by plain` } })
  const grouperMakes = await grouper.as(`/workspaces/${WS}/groups`, { method: 'POST', body: { name: `${TAG} by grouper`, memberIds: [grouper.userId] } })
  const madeBy = {
    manager: !!(await groupNamed(`${TAG} by manager`)),
    plain: !!(await groupNamed(`${TAG} by plain`)),
    grouper: !!(await groupNamed(`${TAG} by grouper`)),
  }
  chk(
    managerMakes.status === 403 && plainMakes.status === 403 && !madeBy.manager && !madeBy.plain
      && grouper.granted && ok(grouperMakes) && madeBy.grouper && ok(base),
    'a manager and a plain member make no user group (403 each, none written) — the member granted groups.manage makes one, as the admin does',
    `manager ${said(managerMakes)}; plain ${said(plainMakes)}; grouper ${grouper.granted ? said(grouperMakes) : 'NOT GRANTED'}; written ${JSON.stringify(madeBy)}`,
  )

  // ══ 3. RENAMING ══════════════════════════════════════════════════════════
  console.log('\n▶ renaming the admin’s group and its @-handle')
  const managerRenames = await manager.as(`/workspaces/${WS}/groups/${BASE}`, { method: 'PATCH', body: { name: `${TAG} renamed by manager` } })
  const plainRenames = await plain.as(`/workspaces/${WS}/groups/${BASE}`, { method: 'PATCH', body: { name: `${TAG} renamed by plain`, alias: 'plainhandle' } })
  const afterRefused = (await sql`select name from workspace_groups where id = ${BASE}`)[0]?.name
  const grouperRenames = await grouper.as(`/workspaces/${WS}/groups/${BASE}`, { method: 'PATCH', body: { name: `${TAG} renamed by grouper`, description: 'kept by the key' } })
  const afterGrouper = (await sql`select name, description from workspace_groups where id = ${BASE}`)[0] ?? {}
  chk(
    managerRenames.status === 403 && plainRenames.status === 403 && afterRefused === `${TAG} base`
      && grouper.granted && ok(grouperRenames) && afterGrouper.name === `${TAG} renamed by grouper` && afterGrouper.description === 'kept by the key',
    'a manager and a plain member rename no user group (403 each, its name unchanged) — the member granted groups.manage renames it and sets its description',
    `manager ${said(managerRenames)}; plain ${said(plainRenames)}; name after them "${afterRefused}"; grouper ${grouper.granted ? said(grouperRenames) : 'NOT GRANTED'} → ${JSON.stringify(afterGrouper)}`,
  )

  // ══ 4. SETTING ITS MEMBERS ═══════════════════════════════════════════════
  // Add (POST), replace (PUT) and remove one (DELETE): three routes, one question.
  console.log('\n▶ adding, replacing and removing the admin’s group’s members')
  const membershipOf = async (who, adding) => ({
    add: (await who(`/workspaces/${WS}/groups/${BASE}/members`, { method: 'POST', body: { userIds: [adding] } })).status,
    replace: (await who(`/workspaces/${WS}/groups/${BASE}/members`, { method: 'PUT', body: { userIds: [adding] } })).status,
    remove: (await who(`/workspaces/${WS}/groups/${BASE}/members/${plain.userId}`, { method: 'DELETE' })).status,
  })
  const managerSets = await membershipOf(manager.as, manager.userId)
  const plainSets = await membershipOf(plain.as, grouper.userId)
  const afterRefusedSet = await membersOf(BASE)
  // The grouper: add themself, replace with three, remove the manager — leaving the plain member and themself.
  const grouperAdds = await grouper.as(`/workspaces/${WS}/groups/${BASE}/members`, { method: 'POST', body: { userIds: [grouper.userId] } })
  const grouperReplaces = await grouper.as(`/workspaces/${WS}/groups/${BASE}/members`, { method: 'PUT', body: { userIds: [plain.userId, grouper.userId, manager.userId] } })
  const grouperRemoves = await grouper.as(`/workspaces/${WS}/groups/${BASE}/members/${manager.userId}`, { method: 'DELETE' })
  const afterGrouperSet = await membersOf(BASE)
  const all403 = (x) => x.add === 403 && x.replace === 403 && x.remove === 403
  chk(
    all403(managerSets) && all403(plainSets) && same(afterRefusedSet, [plain.userId])
      && grouper.granted && ok(grouperAdds) && ok(grouperReplaces) && ok(grouperRemoves)
      && same(afterGrouperSet, [plain.userId, grouper.userId]),
    'a manager and a plain member neither add, replace nor remove a group’s members (403 on all three routes, the set unchanged) — the member granted groups.manage does all three',
    `manager ${JSON.stringify(managerSets)}; plain ${JSON.stringify(plainSets)}; set after them ${afterRefusedSet.length} (plain only: ${same(afterRefusedSet, [plain.userId])}); grouper ${grouper.granted ? `add ${grouperAdds.status}, replace ${grouperReplaces.status}, remove ${grouperRemoves.status}` : 'NOT GRANTED'} → ${afterGrouperSet.length} left`,
  )

  // ══ 5. DELETING ══════════════════════════════════════════════════════════
  console.log('\n▶ deleting a group the admin made to be deleted')
  const doomed = await A(`/workspaces/${WS}/groups`, { method: 'POST', body: { name: `${TAG} doomed` } })
  if (!ok(doomed) || !doomed.data?.id) throw new Error(`the admin could not make the doomed group: ${said(doomed)}`)
  const DOOMED = doomed.data.id
  const exists = async () => (await sql`select count(*)::int as n from workspace_groups where id = ${DOOMED}`)[0].n
  const managerDeletes = await manager.as(`/workspaces/${WS}/groups/${DOOMED}`, { method: 'DELETE' })
  const plainDeletes = await plain.as(`/workspaces/${WS}/groups/${DOOMED}`, { method: 'DELETE' })
  const leftAfterRefused = await exists()
  const grouperDeletes = await grouper.as(`/workspaces/${WS}/groups/${DOOMED}`, { method: 'DELETE' })
  const leftAfterGrouper = await exists()
  chk(
    managerDeletes.status === 403 && plainDeletes.status === 403 && leftAfterRefused === 1
      && grouper.granted && ok(grouperDeletes) && leftAfterGrouper === 0,
    'a manager and a plain member delete no user group (403 each, it stays) — the member granted groups.manage deletes it',
    `manager ${said(managerDeletes)}; plain ${said(plainDeletes)}; ${leftAfterRefused} left after them; grouper ${grouper.granted ? said(grouperDeletes) : 'NOT GRANTED'} → ${leftAfterGrouper} left`,
  )

  // ══ 6–8. THE PAGES ═══════════════════════════════════════════════════════
  browser = await (await resolveChromium()).launch(launchOptions())
  const pageAs = async (who, route, probe) => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } })
    const page = await ctx.newPage()
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

  console.log('\n▶ Settings → Groups, for the member granted groups.manage and for the manager')
  const groupsTabOffered = async (page) => {
    await waitUntil(async () => (await page.locator('[data-testid^="settings-tab-"]').count()) > 0 || !page.url().includes('/settings'), { timeoutMs: 15_000 })
    await waitUntil(async () => (await page.getByPlaceholder('New group name').count()) > 0, { timeoutMs: 5000 })
    // The list is its own read, after the field: wait for what is counted, not
    // for the field beside it (under four parallel break builds it drew late).
    if ((await page.getByPlaceholder('New group name').count()) > 0) {
      await waitUntil(async () => (await page.getByText(`${TAG} renamed by grouper`, { exact: true }).count()) > 0, { timeoutMs: 15_000 })
    }
    const u = new URL(page.url())
    return {
      url: u.pathname + u.search,
      groupsTab: await page.locator('[data-testid="settings-tab-groups"]').count(),
      newGroup: await page.getByPlaceholder('New group name').count(),
      listed: await page.getByText(`${TAG} renamed by grouper`, { exact: true }).count(),
    }
  }
  const grouperSettings = await pageAs(grouper, `/app/${WS}/settings?tab=groups`, groupsTabOffered)
  const managerSettings = await pageAs(manager, `/app/${WS}/settings?tab=groups`, groupsTabOffered)
  chk(
    grouperSettings.url.includes('tab=groups') && grouperSettings.groupsTab === 1 && grouperSettings.newGroup === 1 && grouperSettings.listed >= 1
      && !managerSettings.url.includes('tab=groups') && managerSettings.groupsTab === 0 && managerSettings.newGroup === 0,
    'Settings opens its Groups tab to the member granted groups.manage, with the new-group field and the groups listed — and sends the manager, asking for it, to a tab of theirs with no Groups tab in the rail',
    `grouper ${JSON.stringify(grouperSettings)}; manager ${JSON.stringify(managerSettings)}`,
  )

  const teamsProbe = (makeName) => async (page) => {
    await page.getByTestId('teams-page').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
    await waitUntil(async () => (await page.getByTestId('teams-row').count()) > 0, { timeoutMs: 12_000 })
    const button = page.getByTestId('teams-create-open')
    // What the page offers waits on the person's keys.
    await waitUntil(async () => (await button.count()) > 0 && (await button.isEnabled().catch(() => false)), { timeoutMs: 5000 })
    const seen = {
      rows: await page.getByTestId('teams-row').count(),
      button: await button.count(),
      enabled: (await button.count()) > 0 && (await button.isEnabled().catch(() => false)),
      reason: (await button.count()) > 0 ? ((await button.getAttribute('title').catch(() => null)) ?? '') : '',
      made: false,
    }
    if (makeName && seen.enabled) {
      await button.click().catch(() => {})
      await page.getByTestId('teams-create-name').fill(makeName).catch(() => {})
      await page.getByTestId('teams-create-submit').click().catch(() => {})
      await waitUntil(async () => !!(await groupNamed(makeName)), { timeoutMs: 8000 })
      seen.made = !!(await groupNamed(makeName))
    }
    return seen
  }

  console.log('\n▶ the Teams page’s Create Team, for the member granted groups.manage')
  const grouperTeams = await pageAs(grouper, `/app/${WS}/teams`, teamsProbe(`${TAG} from the Teams page`))
  chk(
    grouperTeams.rows >= 1 && grouperTeams.enabled && grouperTeams.made,
    'the Teams page offers the member granted groups.manage an enabled Create Team, and the team they name through it is made',
    JSON.stringify(grouperTeams),
  )

  console.log('\n▶ the Teams page’s Create Team, for the manager and for a plain member')
  const managerTeams = await pageAs(manager, `/app/${WS}/teams`, teamsProbe(null))
  const plainTeams = await pageAs(plain, `/app/${WS}/teams`, teamsProbe(null))
  const refusedWithReason = (x) => x.rows >= 1 && x.button === 1 && !x.enabled && x.reason.trim().length > 0
  chk(
    refusedWithReason(managerTeams) && refusedWithReason(plainTeams),
    'the Teams page lists the teams to the manager and to a plain member, but offers neither of them Create Team — it is disabled and says why',
    `manager ${JSON.stringify(managerTeams)}; plain ${JSON.stringify(plainTeams)}`,
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

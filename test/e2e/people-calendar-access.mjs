/**
 * THE WORKSPACE'S CALENDAR — ITS WORKING DAYS AND ITS HOLIDAYS — IS SET BY
 * WHOEVER HOLDS `workspace.schedule.manage`; A MEMBER'S CAPACITY AND WHO THEY
 * REPORT TO ARE SET BY WHOEVER HOLDS `members.profile.manage`. EVERY MEMBER
 * READS BOTH.
 *
 * NOT A FRAME ROW: `found-25-sep/admin-guard-admits-managers-where-the-web-says-admin`,
 * its people-and-calendar slice. `PATCH work-schedule`, `POST holidays`,
 * `DELETE holidays/:id`, `PATCH members/:userId/capacity` and
 * `PATCH members/:userId/manager` stood behind `WorkspaceAdminGuard`, which
 * admits managers. The web offered the Work schedule tab to admins alone, and
 * a member's capacity and reports-to to managers and up (`isManagerOrAbove`),
 * and no key could hand either to anyone.
 *
 * ClickUp (help centre "Set a work schedule for your Workspace", "Set capacity
 * limits in Workload view", "Use Team Org Charts", from search snippets):
 * "Only owners and admins can set up work schedules", and the holidays and
 * non-working days belong to that schedule. "Admins, Workspace owners, and
 * managers can set capacity for themselves and others", and the manager field
 * is updated "for yourself or other people" from the org chart. So the
 * calendar is an admin's by default and grantable: a manager does not set it,
 * and a member granted the key does. Capacity and reporting lines stay a
 * manager's and up, and a member granted their key sets them too. Reads stay
 * every member's: the planner draws the working week and the holidays, and
 * the roster and org chart show capacity and reports-to.
 *
 *   node test/e2e/people-calendar-access.mjs --api 3024 --dist /tmp/claude-0/dist-4
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
const ok = (s) => s >= 200 && s < 300

const stamp = Date.now()
const TAG = `pca${stamp}`
const PASSWORD = 'PeopleCalendar@12345!'
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`);
 * like the copy's, its `data` is the whole body when that has no `data`, so a
 * refusal's detail below still prints what the API said. */
const apiAs = apiAsAt(API, { dataOrBody: true })
let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — what is written is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id

  const person = async (key, role, keys = []) => {
    const email = `${TAG}-${key}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `Cal ${key}`, email, password: PASSWORD, organizationName: `Cal ${key} ${stamp}`, organizationSlug: `cal-${key}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (added.status >= 300) throw new Error(`could not add the ${key}: ${said(added)}`)
    const [row] = await sql`select m.id as member_id, u.id as user_id from workspace_members m join users u on u.id = m.user_id where m.workspace_id = ${WS} and u.email = ${email}`
    let granted = keys.length === 0
    if (keys.length > 0) {
      // A key the catalog does not know is refused (400): recorded, so the checks say so.
      const r = await A(`/workspaces/${WS}/roles`, { method: 'POST', body: { name: `${TAG} ${key}`, permissions: keys } })
      const given = r.data?.id ? await A(`/workspaces/${WS}/members/${row.member_id}/roles/${r.data.id}`, { method: 'POST', body: {} }) : { status: 0 }
      granted = given.status > 0 && given.status < 300
      if (!granted) console.log(`    (the ${key} was not granted ${keys.join(', ')}: ${said(r)})`)
    }
    return { key, email, password: PASSWORD, userId: row.user_id, granted, as: apiAs(signed.accessToken) }
  }
  const manager = await person('manager', 'manager')
  const member = await person('member', 'member')
  const scheduler = await person('scheduler', 'member', ['workspace.schedule.manage'])
  const keeper = await person('keeper', 'member', ['members.profile.manage'])
  const peer = await person('peer', 'member')

  const workDays = async () => (await sql`select work_days from workspaces where id = ${WS}`)[0].work_days
  const holidayOn = async (day) => (await sql`select id, name from workspace_holidays where workspace_id = ${WS} and day = ${day}`)[0] ?? null
  const profileOf = async (userId) => {
    const [r] = await sql`select weekly_capacity_hours as cap, manager_id as mgr from workspace_members where workspace_id = ${WS} and user_id = ${userId}`
    return { cap: r?.cap ?? null, mgr: r?.mgr ?? null }
  }

  // The week starts Monday to Friday; holidays the admin made for the others to try to remove.
  const set0 = await A(`/workspaces/${WS}/work-schedule`, { method: 'PATCH', body: { workDays: [1, 2, 3, 4, 5] } })
  if (!ok(set0.status)) throw new Error(`the admin could not set the week: ${said(set0)}`)
  const addAs = async (who, day, name) => who(`/workspaces/${WS}/holidays`, { method: 'POST', body: { day, name } })
  const forManager = await addAs(A, '2031-01-02', `${TAG} manager target`)
  const forMember = await addAs(A, '2031-01-03', `${TAG} member target`)
  if (!forManager.data?.id || !forMember.data?.id) throw new Error(`the admin could not add holidays: ${said(forManager)} / ${said(forMember)}`)

  const scheduleWrites = async (who, week, day, targetId) => ({
    days: (await who(`/workspaces/${WS}/work-schedule`, { method: 'PATCH', body: { workDays: week } })).status,
    add: (await addAs(who, day, `${TAG} ${day}`)).status,
    remove: (await who(`/workspaces/${WS}/holidays/${targetId}`, { method: 'DELETE' })).status,
  })

  // ══ 1. THE MANAGER AND THE ADMIN ON THE CALENDAR ═════════════════════════
  console.log('\n▶ the working week and holidays: the manager, then the admin')
  const managerTries = await scheduleWrites(manager.as, [1, 2, 3, 4, 5, 6], '2031-02-10', forManager.data.id)
  const afterManager = { week: (await workDays()).join(','), added: !!(await holidayOn('2031-02-10')), kept: !!(await holidayOn('2031-01-02')) }
  const adminOwn = await addAs(A, '2031-02-11', `${TAG} admin own`)
  const adminTries = {
    days: (await A(`/workspaces/${WS}/work-schedule`, { method: 'PATCH', body: { workDays: [1, 2, 3, 4] } })).status,
    add: adminOwn.status,
    remove: adminOwn.data?.id ? (await A(`/workspaces/${WS}/holidays/${adminOwn.data.id}`, { method: 'DELETE' })).status : 0,
  }
  const afterAdmin = (await workDays()).join(',')
  chk(
    managerTries.days === 403 && managerTries.add === 403 && managerTries.remove === 403
      && afterManager.week === '1,2,3,4,5' && !afterManager.added && afterManager.kept
      && ok(adminTries.days) && ok(adminTries.add) && ok(adminTries.remove) && afterAdmin === '1,2,3,4',
    'a manager sets no working days, adds no holiday and removes none (403 each, the calendar unchanged) — the admin does all three',
    `manager ${JSON.stringify(managerTries)} → ${JSON.stringify(afterManager)}; admin ${JSON.stringify(adminTries)} → week ${afterAdmin}`,
  )

  // ══ 2. THE MEMBER GRANTED workspace.schedule.manage ══════════════════════
  console.log('\n▶ the working week and holidays: the member granted workspace.schedule.manage')
  const schedOwn = scheduler.granted ? await addAs(scheduler.as, '2031-03-12', `${TAG} scheduler own`) : { status: 0 }
  const schedTries = {
    days: scheduler.granted ? (await scheduler.as(`/workspaces/${WS}/work-schedule`, { method: 'PATCH', body: { workDays: [7, 1, 2, 3, 4] } })).status : 0,
    add: schedOwn.status,
    remove: schedOwn.data?.id ? (await scheduler.as(`/workspaces/${WS}/holidays/${schedOwn.data.id}`, { method: 'DELETE' })).status : 0,
  }
  const afterSched = { week: (await workDays()).join(','), left: !!(await holidayOn('2031-03-12')) }
  chk(
    scheduler.granted && ok(schedTries.days) && ok(schedTries.add) && ok(schedTries.remove)
      && afterSched.week === '1,2,3,4,7' && !afterSched.left,
    'a member granted workspace.schedule.manage sets a Sunday-to-Thursday week, adds a holiday and removes it',
    `scheduler ${scheduler.granted ? JSON.stringify(schedTries) : 'NOT GRANTED'} → ${JSON.stringify(afterSched)}`,
  )

  // ══ 3. A PLAIN MEMBER: REFUSED THE WRITES, READS THE CALENDAR ════════════
  console.log('\n▶ the working week and holidays: a plain member writes nothing and reads them')
  const weekBefore = (await workDays()).join(',')
  const memberTries = await scheduleWrites(member.as, [1, 2, 3], '2031-04-14', forMember.data.id)
  const memberReads = await member.as(`/workspaces/${WS}/work-schedule`)
  const readHolidays = (memberReads.data?.holidays ?? []).map((h) => h.name)
  chk(
    memberTries.days === 403 && memberTries.add === 403 && memberTries.remove === 403
      && (await workDays()).join(',') === weekBefore && !(await holidayOn('2031-04-14'))
      && memberReads.status === 200 && Array.isArray(memberReads.data?.workDays) && readHolidays.includes(`${TAG} member target`),
    'a plain member is refused every calendar write (403 each) yet reads the working week and the holidays the planner draws',
    `member writes ${JSON.stringify(memberTries)}; read ${memberReads.status} ${JSON.stringify(memberReads.data)}`,
  )

  // ══ 4. CAPACITY AND REPORTS-TO: THE MANAGER AND THE ADMIN ════════════════
  console.log('\n▶ a member’s capacity and reports-to: the manager, then the admin')
  const setCap = (who, target, hours) => who(`/workspaces/${WS}/members/${target.userId}/capacity`, { method: 'PATCH', body: { weeklyCapacityHours: hours } })
  const setMgr = (who, target, managerId) => who(`/workspaces/${WS}/members/${target.userId}/manager`, { method: 'PATCH', body: { managerId } })
  const managerCap = (await setCap(manager.as, peer, 32)).status
  const managerMgr = (await setMgr(manager.as, peer, manager.userId)).status
  const afterManagerSets = await profileOf(peer.userId)
  const adminCap = (await setCap(A, peer, 36)).status
  const adminMgr = (await setMgr(A, peer, null)).status
  const afterAdminSets = await profileOf(peer.userId)
  chk(
    ok(managerCap) && ok(managerMgr) && afterManagerSets.cap === 32 && afterManagerSets.mgr === manager.userId
      && ok(adminCap) && ok(adminMgr) && afterAdminSets.cap === 36 && afterAdminSets.mgr === null,
    'a manager sets a member’s weekly capacity and whom they report to, and so does the admin',
    `manager cap ${managerCap} mgr ${managerMgr} → ${JSON.stringify(afterManagerSets)}; admin cap ${adminCap} mgr ${adminMgr} → ${JSON.stringify(afterAdminSets)}`,
  )

  // ══ 5. A PLAIN MEMBER: REFUSED BOTH, READS THE ROSTER WITH THEM ══════════
  console.log('\n▶ a colleague’s capacity and reports-to: a plain member')
  const memberCap = (await setCap(member.as, peer, 8)).status
  const memberMgr = (await setMgr(member.as, peer, member.userId)).status
  const afterMemberSets = await profileOf(peer.userId)
  const roster = await member.as(`/workspaces/${WS}/members`)
  const peerRow = (Array.isArray(roster.data) ? roster.data : []).find((m) => m.userId === peer.userId)
  chk(
    memberCap === 403 && memberMgr === 403 && afterMemberSets.cap === 36 && afterMemberSets.mgr === null
      && roster.status === 200 && peerRow?.weeklyCapacityHours === 36 && 'managerId' in (peerRow ?? {}),
    'a plain member sets no colleague’s capacity or reporting line (403 each) yet reads the roster with both',
    `member cap ${memberCap} mgr ${memberMgr} → ${JSON.stringify(afterMemberSets)}; roster ${roster.status} ${JSON.stringify(peerRow ?? null)}`,
  )

  // ══ 6. THE MEMBER GRANTED members.profile.manage ═════════════════════════
  console.log('\n▶ a colleague’s capacity and reports-to: the member granted members.profile.manage')
  const keeperCap = keeper.granted ? (await setCap(keeper.as, peer, 24)).status : 0
  const keeperMgr = keeper.granted ? (await setMgr(keeper.as, peer, manager.userId)).status : 0
  const afterKeeperSets = await profileOf(peer.userId)
  chk(
    keeper.granted && ok(keeperCap) && ok(keeperMgr) && afterKeeperSets.cap === 24 && afterKeeperSets.mgr === manager.userId,
    'a member granted members.profile.manage sets a colleague’s capacity to 24 hours and their reporting line to the manager',
    `keeper ${keeper.granted ? `cap ${keeperCap} mgr ${keeperMgr}` : 'NOT GRANTED'} → ${JSON.stringify(afterKeeperSets)}`,
  )

  // ══ 7–8. THE PAGES ═══════════════════════════════════════════════════════
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
  const where = (page) => { const u = new URL(page.url()); return u.pathname + u.search }

  console.log('\n▶ Settings → Work schedule, for the scheduler and for the manager')
  // The weekday toggles are the buttons pressed or not whose names are the days; the holiday
  // form is the date field labelled Date. Neither is anywhere on the Members tab.
  const weekdayButtons = (page) => page.locator('button[aria-pressed]', { hasText: /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/ })
  const scheduleOffered = async (page) => {
    await waitUntil(async () => (await page.locator('[data-testid^="settings-tab-"]').count()) > 0 || !page.url().includes('/settings'), { timeoutMs: 15_000 })
    await waitUntil(async () => (await weekdayButtons(page).count()) >= 7, { timeoutMs: 5000 })
    return {
      url: where(page),
      tab: await page.getByTestId('settings-tab-workSchedule').count(),
      weekdays: await weekdayButtons(page).count(),
      holidayDate: await page.locator('input[type=date][aria-label="Date"]').count(),
    }
  }
  const schedulerPage = await pageAs(scheduler, `/app/${WS}/settings?tab=workSchedule`, scheduleOffered)
  const managerSchedule = await pageAs(manager, `/app/${WS}/settings?tab=workSchedule`, scheduleOffered)
  chk(
    schedulerPage.url.includes('tab=workSchedule') && schedulerPage.tab === 1 && schedulerPage.weekdays === 7 && schedulerPage.holidayDate === 1
      && managerSchedule.tab === 0 && managerSchedule.weekdays === 0 && managerSchedule.holidayDate === 0 && !managerSchedule.url.includes('tab=workSchedule'),
    'Settings opens Work schedule to the member granted workspace.schedule.manage, with the seven weekdays and the holiday form — and sends the manager to a tab of theirs instead',
    `scheduler ${JSON.stringify(schedulerPage)}; manager ${JSON.stringify(managerSchedule)}`,
  )

  console.log('\n▶ Settings → Members: capacity and reports-to, for the keeper and for the manager')
  const profileControls = async (page) => {
    await waitUntil(async () => (await page.locator('[data-testid^="settings-tab-"]').count()) > 0 || !page.url().includes('/settings'), { timeoutMs: 15_000 })
    await waitUntil(async () => (await page.getByText(peer.email).count()) > 0, { timeoutMs: 8000 })
    await page.waitForTimeout(600)
    return {
      url: where(page),
      roster: await page.getByText(peer.email).count(),
      capacity: await page.locator('input[type=number][title="Weekly capacity in hours"]').count(),
      reportsTo: await page.locator('select[aria-label^="Who "][aria-label$=" reports to"]').count(),
    }
  }
  const keeperPage = await pageAs(keeper, `/app/${WS}/settings?tab=members`, profileControls)
  const managerMembers = await pageAs(manager, `/app/${WS}/settings?tab=members`, profileControls)
  chk(
    keeperPage.url.includes('tab=members') && keeperPage.roster >= 1 && keeperPage.capacity >= 6 && keeperPage.reportsTo >= 6
      && managerMembers.roster >= 1 && managerMembers.capacity >= 6 && managerMembers.reportsTo >= 6,
    'Settings opens Members to the member granted members.profile.manage with every person’s capacity and reports-to to set — as it does for the manager',
    `keeper ${JSON.stringify(keeperPage)}; manager ${JSON.stringify(managerMembers)}`,
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

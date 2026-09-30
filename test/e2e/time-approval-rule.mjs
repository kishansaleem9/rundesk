/**
 * TIMESHEETS ARE APPROVED BY WHOEVER HOLDS `time.approval.manage`, AND BY
 * NOBODY ELSE — THE ROUTES, THE PAGE AND THE NOTICE ALIKE.
 *
 * NOT A FRAME ROW: `role-editor-offers-unenforced-permissions`, its third
 * group. Three rules answered "who approves time", and each differently:
 *   - the permission catalog gives the key to managers;
 *   - approve and reject let managers through `WorkspaceAdminGuard`, and
 *     refused a member granted the key by a custom role;
 *   - `canModerateApprovals` — what the approvals page reads — said admins only,
 *     so a manager the API let approve was shown a read-only page, while the
 *     "awaiting approval" notice went to managers and to no one granted the key.
 *
 * ClickUp (help centre "Timesheet approvals", search snippets; the page itself
 * is not reachable from here): an owner or admin sets approvals up and names
 * each submitter's approvers; approvers see the timesheets they review, and
 * approve them or send them back. The "All timesheets" tab is the owner's and
 * the admins'. Here the approver is whoever holds the key, and the Time page's
 * everyone-views stay the admins'.
 *
 * An approver may be a member who cannot open every project, so what they are
 * shown of an entry in a project they cannot open is its hours, not its
 * project or its note.
 *
 *   node test/e2e/time-approval-rule.mjs --api 3021 --dist /tmp/claude-0/dist-1
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
const EXPECTED_CHECKS = 9

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
const TAG = `tar${stamp}`
const PASSWORD = 'TimeApprovals@12345!'
/** A Monday two weeks back (UTC), so every entry of the week is in the past and in one week. */
const WEEK = (() => {
  const now = new Date()
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 14))
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
})()
const at = (hh) => `${WEEK}T${hh}:00:00.000Z`

const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, data, error, text}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — what is written is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const [adminRow] = await sql`select id from users where email = ${ADMIN.email}`
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id

  const signUp = async (key) => {
    const email = `${TAG}-${key}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `Approvals ${key}`, email, password: PASSWORD, organizationName: `Approvals ${key} ${stamp}`, organizationSlug: `approvals-${key}-${stamp}` })
    const [row] = await sql`select id from users where email = ${email}`
    return { id: row.id, email, password: PASSWORD, as: apiAs(signed.accessToken) }
  }
  const person = async (key, role) => {
    const who = await signUp(key)
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email: who.email, role } })
    if (!added.ok) throw new Error(`could not add the ${key}: ${said(added)}`)
    return who
  }
  const manager = await person('manager', 'manager')
  const delegate = await person('delegate', 'member')
  const submitter = await person('submitter', 'member')
  const bystander = await person('bystander', 'member')
  const outsider = await signUp('outsider')
  // The delegate holds the key by a custom role, granted before any request of theirs.
  const role = await A(`/workspaces/${WS}/roles`, { method: 'POST', body: { name: `${TAG} approvers`, permissions: ['time.approval.manage'] } })
  const [delegateRow] = await sql`select id from workspace_members where workspace_id = ${WS} and user_id = ${delegate.id}`
  const granted = role.data?.id ? await A(`/workspaces/${WS}/members/${delegateRow.id}/roles/${role.data.id}`, { method: 'POST', body: {} }) : { status: 0 }
  if (!granted.ok) throw new Error(`could not grant the delegate: ${said(role)} ${said(granted)}`)

  // An open list, and a private one the submitter made: the manager sees it, the delegate does not.
  const listIn = async (name) => {
    const space = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} ${name}` } })
    const project = await A('/projects', { method: 'POST', body: { spaceId: space.data?.id, name: `${TAG} ${name} project` } })
    const list = await A('/lists', { method: 'POST', body: { projectId: project.data?.id, name: `${TAG} ${name}` } })
    if (!list.ok || !list.data?.id) throw new Error(`could not make the ${name} list: ${said(space)} ${said(project)} ${said(list)}`)
    return list.data.id
  }
  const OPEN_LIST = await listIn('open')
  const SECRET_LIST = await listIn('secret')
  const SECRET_PROJECT = `${TAG} secret project`
  const task = async (listId, title) => {
    const t = await A('/tasks', { method: 'POST', body: { listId, title } })
    if (!t.ok || !t.data?.id) throw new Error(`could not make "${title}": ${said(t)}`)
    return t.data.id
  }
  const openTask = await task(OPEN_LIST, `${TAG} open task`)
  const secretTask = await task(SECRET_LIST, `${TAG} secret task`)
  await sql`update lists set visibility = 'private', created_by_id = ${submitter.id} where id = ${SECRET_LIST}`

  const SECRET_NOTE = `${TAG}secretnote`
  const log = async (who, taskId, from, to, description) => {
    const r = await who.as(`/tasks/${taskId}/time-entries/manual`, { method: 'POST', body: { startedAt: at(from), endedAt: at(to), description, isBillable: true } })
    if (!r.ok) throw new Error(`could not log time: ${said(r)}`)
  }
  await log(submitter, openTask, '09', '11', `${TAG} open note`)
  await log(submitter, secretTask, '13', '14', SECRET_NOTE)
  await log(bystander, openTask, '15', '16', `${TAG} bystander note`)
  const submitted = await submitter.as(`/workspaces/${WS}/time-approvals/submit`, { method: 'POST', body: { weekStart: WEEK } })
  const bystanderSubmitted = await bystander.as(`/workspaces/${WS}/time-approvals/submit`, { method: 'POST', body: { weekStart: WEEK } })
  if (!submitted.ok || !bystanderSubmitted.ok) throw new Error(`could not submit: ${said(submitted)} ${said(bystanderSubmitted)}`)
  const sheet = async (userId) => (await sql`select status, rejection_reason, approved_by_id from time_approvals where workspace_id = ${WS} and user_id = ${userId} and week_start = ${WEEK}`)[0] ?? null

  // ══ 1. THE NOTICE ════════════════════════════════════════════════════════
  console.log('\n▶ a submitted timesheet: who is told it awaits approval')
  const told = async () => new Set((await sql`select user_id from notifications where workspace_id = ${WS} and type = 'approval_needed' and actor_id = ${submitter.id}`).map((r) => r.user_id))
  await waitUntil(async () => (await told()).size >= 3, { timeoutMs: 6000 })
  const notified = await told()
  chk(
    notified.has(adminRow.id) && notified.has(manager.id) && notified.has(delegate.id) && !notified.has(bystander.id) && !notified.has(submitter.id),
    'the submitter’s "awaiting approval" notice reaches the admin, the manager and the member granted time.approval.manage — and not a member without it, nor the submitter',
    `told: admin ${notified.has(adminRow.id)}, manager ${notified.has(manager.id)}, delegate ${notified.has(delegate.id)}, bystander ${notified.has(bystander.id)}, submitter ${notified.has(submitter.id)}`,
  )

  // ══ 2. THE APPROVALS LIST ════════════════════════════════════════════════
  console.log('\n▶ the approvals list: whose timesheets each is shown, and whether they may act')
  const approvalsOf = async (who) => {
    const r = await who.as(`/workspaces/${WS}/time-approvals`)
    const items = r.data?.items ?? []
    return { r, canModerate: r.data?.canModerate, people: new Set(items.map((i) => i.userId)), items }
  }
  const managerList = await approvalsOf(manager)
  const delegateList = await approvalsOf(delegate)
  const bystanderList = await approvalsOf(bystander)
  const shape = (l) => `${l.r.status} canModerate ${l.canModerate}, sheets of ${l.people.size} (submitter ${l.people.has(submitter.id)}, bystander ${l.people.has(bystander.id)})`
  chk(
    managerList.canModerate === true && managerList.people.has(submitter.id) && managerList.people.has(bystander.id)
      && delegateList.canModerate === true && delegateList.people.has(submitter.id) && delegateList.people.has(bystander.id)
      && bystanderList.canModerate === false && bystanderList.people.size === 1 && bystanderList.people.has(bystander.id),
    'the manager and the member granted time.approval.manage are shown every timesheet and may act on them — a member without it sees their own, read-only',
    `manager ${shape(managerList)}; delegate ${shape(delegateList)}; bystander ${shape(bystanderList)}`,
  )

  // ══ 3. WHAT AN APPROVER IS SHOWN OF A PROJECT THEY CANNOT OPEN ═══════════
  console.log('\n▶ the submitter’s week, as the delegate (who cannot open the private list) and as the manager')
  const weekOf = (l) => l.items.find((i) => i.userId === submitter.id && i.weekStart === WEEK) ?? null
  const delegateSheet = weekOf(delegateList)
  const managerSheet = weekOf(managerList)
  const named = (s, name) => (s?.entries ?? []).some((e) => e.project === name)
  chk(
    delegateSheet !== null && delegateSheet.total === 3 && (delegateSheet.entries ?? []).length === 2
      && !delegateList.r.text.includes(SECRET_PROJECT) && !delegateList.r.text.includes(SECRET_NOTE) && named(delegateSheet, `${TAG} open project`)
      && managerSheet !== null && named(managerSheet, SECRET_PROJECT),
    'the delegate is shown the submitter’s three hours and both entries, but neither the name nor the note of the private project’s — the manager, who may open it, is shown its name',
    `delegate: ${delegateSheet ? `${delegateSheet.total}h, ${JSON.stringify(delegateSheet.entries)}` : 'no such sheet'}${delegateList.r.text.includes(SECRET_PROJECT) ? ', the PRIVATE PROJECT NAMED' : ''}${delegateList.r.text.includes(SECRET_NOTE) ? ', its NOTE SHOWN' : ''}; manager: ${managerSheet ? JSON.stringify(managerSheet.entries) : 'no such sheet'}`,
  )

  // ══ 4. THE APPROVALS PAGE ════════════════════════════════════════════════
  console.log('\n▶ the approvals page, for the delegate and for the bystander')
  browser = await (await resolveChromium()).launch(launchOptions())
  const signedIn = async (who) => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } })
    const page = await ctx.newPage()
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', who.email)
    await page.fill('input[type=password]', who.password)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
    return { ctx, page }
  }
  const approvalsPage = async (who) => {
    const { ctx, page } = await signedIn(who)
    await page.goto(`${B}/app/${WS}/time/approvals`, { waitUntil: 'domcontentloaded' })
    // Every viewer is shown the bystander's sheet (their own, or one to review), so the page has drawn.
    await page.getByText('Approvals bystander', { exact: true }).first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
    await page.waitForTimeout(800)
    const body = (await page.locator('main').filter({ visible: true }).innerText().catch(() => '')) || (await page.locator('body').innerText().catch(() => ''))
    // The submitter's sheet, where there is one, shows its private entry by its hours. The page opens
    // the first pending sheet by itself, and a click on an open one closes it — so click only a closed one.
    const submitterRow = page.getByText('Approvals submitter', { exact: true }).first()
    const hiddenShown = async () => (await page.getByTestId('time-approval-hidden-entry').count()) > 0
    if ((await submitterRow.count().catch(() => 0)) > 0) {
      if (!(await hiddenShown().catch(() => false))) await submitterRow.click().catch(() => {})
      await waitUntil(hiddenShown, { timeoutMs: 4000 })
    } else {
      console.log('    (no submitter’s sheet on this page to open)')
    }
    const seen = {
      approve: await page.getByRole('button', { name: /^Approve$/ }).count().catch(() => -1),
      readOnly: /read-only/i.test(body),
      adminsOnly: /only workspace admins|available to workspace admins|require admin access/i.test(body),
      hiddenEntry: await page.getByTestId('time-approval-hidden-entry').count().catch(() => -1),
    }
    await ctx.close().catch(() => {})
    return seen
  }
  const delegatePage = await approvalsPage(delegate)
  const bystanderPage = await approvalsPage(bystander)
  chk(
    delegatePage.approve >= 2 && !delegatePage.readOnly && !delegatePage.adminsOnly && delegatePage.hiddenEntry === 1
      && bystanderPage.approve === 0 && bystanderPage.readOnly && !bystanderPage.adminsOnly,
    'the approvals page offers the delegate Approve on each timesheet, and shows the private entry as a task they cannot open — and offers the bystander none, saying they are read-only without claiming only admins approve',
    `delegate ${JSON.stringify(delegatePage)}; bystander ${JSON.stringify(bystanderPage)}`,
  )

  // ══ 5. APPROVING ═════════════════════════════════════════════════════════
  console.log('\n▶ approving: the bystander, the manager, the delegate')
  const bystanderApproves = await bystander.as(`/workspaces/${WS}/time-approvals/${submitter.id}/${WEEK}/approve`, { method: 'POST', body: {} })
  const afterBystander = await sheet(submitter.id)
  const managerApproves = await manager.as(`/workspaces/${WS}/time-approvals/${submitter.id}/${WEEK}/approve`, { method: 'POST', body: {} })
  const afterManager = await sheet(submitter.id)
  const delegateApproves = await delegate.as(`/workspaces/${WS}/time-approvals/${bystander.id}/${WEEK}/approve`, { method: 'POST', body: {} })
  const afterDelegate = await sheet(bystander.id)
  chk(
    bystanderApproves.status === 403 && afterBystander?.status === 'submitted'
      && managerApproves.ok && afterManager?.status === 'approved' && afterManager?.approved_by_id === manager.id
      && delegateApproves.ok && afterDelegate?.status === 'approved' && afterDelegate?.approved_by_id === delegate.id,
    'a member without time.approval.manage approves nothing (403, still submitted) — the manager approves, and so does the member granted it (each recorded as the approver)',
    `bystander ${said(bystanderApproves)} (${afterBystander?.status}); manager ${said(managerApproves)} (${afterManager?.status} by ${afterManager?.approved_by_id === manager.id ? 'them' : afterManager?.approved_by_id}); delegate ${said(delegateApproves)} (${afterDelegate?.status} by ${afterDelegate?.approved_by_id === delegate.id ? 'them' : afterDelegate?.approved_by_id})`,
  )

  // ══ 6. SENDING BACK ══════════════════════════════════════════════════════
  console.log('\n▶ sending a timesheet back, with a reason')
  const REASON = `${TAG} add the missing hours`
  const bystanderRejects = await bystander.as(`/workspaces/${WS}/time-approvals/${submitter.id}/${WEEK}/reject`, { method: 'POST', body: { reason: 'no' } })
  const afterBystanderRejects = await sheet(submitter.id)
  const delegateRejects = await delegate.as(`/workspaces/${WS}/time-approvals/${submitter.id}/${WEEK}/reject`, { method: 'POST', body: { reason: REASON } })
  const afterDelegateRejects = await sheet(submitter.id)
  chk(
    bystanderRejects.status === 403 && afterBystanderRejects?.status === 'approved'
      && delegateRejects.ok && afterDelegateRejects?.status === 'rejected' && afterDelegateRejects?.rejection_reason === REASON && afterDelegateRejects?.approved_by_id === delegate.id,
    'a member without the key sends nothing back (403, unchanged) — the member granted it does, and the reason is kept',
    `bystander ${said(bystanderRejects)} (${afterBystanderRejects?.status}); delegate ${said(delegateRejects)} (${JSON.stringify(afterDelegateRejects)})`,
  )

  // ══ 7. ONLY A MEMBER'S TIMESHEET ═════════════════════════════════════════
  console.log('\n▶ approving the timesheet of someone outside the workspace, and of no one')
  const outsiderApproved = await delegate.as(`/workspaces/${WS}/time-approvals/${outsider.id}/${WEEK}/approve`, { method: 'POST', body: {} })
  const outsiderRows = (await sql`select count(*)::int as n from time_approvals where workspace_id = ${WS} and user_id = ${outsider.id}`)[0].n
  const nobodyApproved = await delegate.as(`/workspaces/${WS}/time-approvals/not-a-person/${WEEK}/approve`, { method: 'POST', body: {} })
  chk(
    outsiderApproved.status === 404 && outsiderRows === 0 && (nobodyApproved.status === 400 || nobodyApproved.status === 404),
    'an approver approves no timesheet of someone outside the workspace (404, no row written), and a malformed person is refused by name, not a 500',
    `outsider ${said(outsiderApproved)} (${outsiderRows} row(s)); malformed ${said(nobodyApproved)}`,
  )

  // ══ 8. THE TIME PAGE'S EVERYONE-VIEWS STAY THE ADMINS' ═══════════════════
  console.log('\n▶ the team week and the monthly rollup: the manager, the delegate, the admin')
  const people = async (who, route) => new Set(((await who.as(route)).data ?? []).map((r) => r.userId))
  const teamRoute = `/workspaces/${WS}/time-team-week?weekStart=${WEEK}`
  const monthRoute = `/workspaces/${WS}/time-monthly?months=6`
  const others = (set, self) => [...set].filter((id) => id !== self).length
  const managerTeam = await people(manager, teamRoute)
  const delegateTeam = await people(delegate, teamRoute)
  const managerMonth = await people(manager, monthRoute)
  const adminTeam = await people({ as: A }, teamRoute)
  const adminMonth = await people({ as: A }, monthRoute)
  chk(
    others(managerTeam, manager.id) === 0 && others(delegateTeam, delegate.id) === 0 && others(managerMonth, manager.id) === 0
      && adminTeam.has(submitter.id) && adminTeam.has(bystander.id) && adminMonth.has(submitter.id),
    'approving gives no one else’s week or month on the Time page: the manager and the delegate see no other person’s hours there — the admin sees everyone’s',
    `others seen: manager team ${others(managerTeam, manager.id)}, delegate team ${others(delegateTeam, delegate.id)}, manager month ${others(managerMonth, manager.id)}; admin team has submitter ${adminTeam.has(submitter.id)}, bystander ${adminTeam.has(bystander.id)}, month ${adminMonth.has(submitter.id)}`,
  )

  // ══ 9. THE TIME PAGE ═════════════════════════════════════════════════════
  console.log('\n▶ the Time page: the Approvals link, and whose months the rollup says it holds')
  const timePage = async (who) => {
    const { ctx, page } = await signedIn(who)
    await page.goto(`${B}/app/${WS}/time`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: /^Monthly$/ }).first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
    // The link waits on what the server says this person may do; give it the time a slow answer takes.
    await waitUntil(async () => (await page.getByRole('link', { name: /Approvals/ }).count()) > 0, { timeoutMs: 6000 })
    const link = await page.getByRole('link', { name: /Approvals/ }).count().catch(() => -1)
    await page.getByRole('button', { name: /^Monthly$/ }).first().click().catch(() => {})
    await page.getByText('Monthly timesheet', { exact: true }).first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
    await page.waitForTimeout(800)
    const allMembers = await page.getByText(/Last 6 months · all members/).count().catch(() => -1)
    await ctx.close().catch(() => {})
    return { link, allMembers }
  }
  const managerTime = await timePage(manager)
  const adminTime = await timePage({ email: ADMIN.email, password: ADMIN.password })
  chk(
    managerTime.link >= 1 && managerTime.allMembers === 0 && adminTime.link >= 1 && adminTime.allMembers >= 1,
    'the Time page links the manager to Approvals and does not call their own months "all members" — the admin’s rollup, which is everyone’s, says so',
    `manager ${JSON.stringify(managerTime)}; admin ${JSON.stringify(adminTime)}`,
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

/**
 * THE TEAMS HUB'S ANALYTICS, AS CLICKUP'S (formerly Pulse)
 * (`ledger-rows/section3-team-analytics`).
 *
 * ClickUp (help centre, "View analytics for your organization", and its
 * feedback board, through search excerpts, 8 October): each member's online
 * status and activity, the tasks they viewed (task views are logged) and their
 * most-viewed tasks, a roll-up by team, and the Lineup — a task landing in
 * somebody's priority queue; a period moved by arrows or picked; a name
 * searched; a ClickApp an owner or admin turns on, and an audience they set on
 * the page — everyone but guests, or owners and admins only. Never guests.
 *
 * Measured before it was built (8 October, batch 20's build): the Teams hub had
 * three tabs and `teams-destination` asserted that Analytics was absent; no
 * route answered `GET /workspaces/:id/analytics` (404) and no task view was
 * kept anywhere.
 *
 * A workspace of this run's own: the admin, two members in a team, and a
 * guest; an open list with two tasks, and a private list the members are not
 * in, with one. What is counted is read back by SQL.
 *
 *   node test/e2e/teams-analytics.mjs --api 3011 --dist /tmp/claude-0/dist-1
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'
import { waitUntil, readText } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 12

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

const REFUSED = {
  guest: 'Analytics is not open to guests',
  admins: "Analytics is open to this workspace's owners and admins only",
}

const stamp = Date.now()
const TAG = `tan${stamp}`
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, data, error, message}`. Every call site reads `status`. */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.message || null)}`

let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — what Analytics counts is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const [adminRow] = await sql`select id from users where email = ${ADMIN.email}`
  const adminId = adminRow?.id

  const person = async (who, role) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const password = 'TeamPulse@12345!'
    const signed = await signUpApi(API, { fullName: `Pulse ${who} ${stamp}`, email, password, organizationName: `Pulse ${who} ${stamp}`, organizationSlug: `pulse-${who}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (!added.ok) throw new Error(`could not add the ${who}: ${said(added)}`)
    const [row] = await sql`select id from users where email = ${email}`
    return { email, password, id: row?.id, name: `Pulse ${who} ${stamp}`, api: apiAs(signed.accessToken) }
  }
  const member = await person('member', 'member')
  const other = await person('other', 'member')
  const guest = await person('guest', 'guest')

  const space = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} space`, defaultPermission: 'admin' } })
  const project = await A('/projects', { method: 'POST', body: { spaceId: space.data?.id, name: `${TAG} project` } })
  const list = await A('/lists', { method: 'POST', body: { projectId: project.data?.id, name: `${TAG} open` } })
  const hidden = await A('/lists', { method: 'POST', body: { projectId: project.data?.id, name: `${TAG} private`, visibility: 'private' } })
  if (!list.ok || !hidden.ok) throw new Error(`could not make the lists: ${said(list)} ${said(hidden)}`)
  const task = async (listId, title) => {
    const t = await A('/tasks', { method: 'POST', body: { listId, title: `${TAG} ${title}` } })
    if (!t.ok || !t.data?.id) throw new Error(`could not make "${title}": ${said(t)}`)
    return { id: t.data.id, title: `${TAG} ${title}` }
  }
  const T1 = await task(list.data.id, 'first')
  const T2 = await task(list.data.id, 'second')
  const TP = await task(hidden.data.id, 'private')
  const team = await A(`/workspaces/${WS}/groups`, { method: 'POST', body: { name: `${TAG} crew` } })
  if (!team.ok || !team.data?.id) throw new Error(`could not make the team: ${said(team)}`)
  const joined = await A(`/workspaces/${WS}/groups/${team.data.id}/members`, { method: 'POST', body: { userIds: [member.id, other.id] } })
  if (!joined.ok) throw new Error(`could not fill the team: ${said(joined)}`)
  const analytics = (P, query = '') => P(`/workspaces/${WS}/analytics${query}`)

  // ══ 1. OFF UNTIL TURNED ON ═════════════════════════════════════════════════
  console.log('\n▶ before the ClickApp is turned on')
  const off = { admin: await analytics(A), member: await analytics(member.api), guest: await analytics(guest.api) }
  chk(
    off.admin.status === 200 && off.admin.data?.enabled === false && off.admin.data?.mayManage === true && off.admin.data?.people?.length === 0
      && off.member.status === 200 && off.member.data?.enabled === false && off.member.data?.mayManage === false
      && off.guest.status === 403 && off.guest.message === REFUSED.guest,
    'Analytics is off until turned on: the admin is told so and may turn it on, a member is told so and may not, and a guest is refused in words (403)',
    JSON.stringify(Object.fromEntries(Object.entries(off).map(([k, r]) => [k, { s: r.status, enabled: r.data?.enabled, mayManage: r.data?.mayManage, m: r.message }]))),
  )

  const on = await A(`/feature-flags/teams.analytics`, { method: 'PUT', body: { enabled: true, scope: 'workspace', scopeId: WS, workspaceId: WS } })
  if (on.status !== 200) throw new Error(`could not turn Analytics on: ${said(on)}`)

  // ══ 2. A VIEW IS COUNTED ONCE ══════════════════════════════════════════════
  console.log('\n▶ task views: one a person a task in five minutes, and never of a task one cannot open')
  const views = async (p, t) => (await sql`select count(*)::int as n from task_view_events where user_id = ${p} and task_id = ${t}`)[0].n
  const v1 = await member.api(`/tasks/${T1.id}/viewed`, { method: 'POST' })
  const v1again = await member.api(`/tasks/${T1.id}/viewed`, { method: 'POST' })
  const v2 = await member.api(`/tasks/${T2.id}/viewed`, { method: 'POST' })
  const vHidden = await member.api(`/tasks/${TP.id}/viewed`, { method: 'POST' })
  const vAdmin = await A(`/tasks/${TP.id}/viewed`, { method: 'POST' })
  const counted = { t1: await views(member.id, T1.id), t2: await views(member.id, T2.id), hidden: await views(member.id, TP.id), admin: await views(adminId, TP.id) }
  chk(
    v1.status === 201 && v1.data?.logged === true && v1again.data?.logged === false && v2.data?.logged === true
      && vHidden.status === 403 && vAdmin.data?.logged === true
      && counted.t1 === 1 && counted.t2 === 1 && counted.hidden === 0 && counted.admin === 1,
    'a task opened twice in five minutes is one view, a second task another, and a task in a private list the member is not in is refused (403) and not counted (read by SQL)',
    `${said(v1)} ${JSON.stringify(v1.data)}, again ${JSON.stringify(v1again.data)}, second ${JSON.stringify(v2.data)}, private ${said(vHidden)}, the admin's ${JSON.stringify(vAdmin.data)}; held ${JSON.stringify(counted)}`,
  )

  // Their activity and their Lineup, made through the product.
  const changed = await member.api(`/tasks/${T2.id}`, { method: 'PATCH', body: { priority: 'high' } })
  const lined = await member.api(`/workspaces/${WS}/priorities`, { method: 'POST', body: { taskId: T1.id } })
  if (changed.status !== 200 || !(lined.status === 200 || lined.status === 201)) throw new Error(`could not make the member's activity and Lineup: ${said(changed)} ${said(lined)}`)
  const actionsHeld = async (p) => (await sql`
    select count(*)::int as n from task_activity a
      join tasks t on t.id = a.task_id join lists l on l.id = t.list_id join projects pr on pr.id = l.project_id join spaces s on s.id = pr.space_id
    where s.workspace_id = ${WS} and a.actor_id = ${p} and a.created_at >= now() - interval '7 days'`)[0].n

  // ══ 3. WHAT IT ANSWERS ═════════════════════════════════════════════════════
  console.log('\n▶ what Analytics answers, read by a member')
  const asMember = await analytics(member.api)
  const rowOf = (r, p) => (r.data?.people ?? []).find((x) => x.userId === p.id)
  const m3 = rowOf(asMember, member)
  const expectActions = await actionsHeld(member.id)
  chk(
    asMember.status === 200 && asMember.data?.enabled === true && !!m3
      && m3.views === 2 && m3.actions === expectActions && m3.actions >= 1 && m3.lineup === 1
      && ['online', 'away', 'busy', 'offline'].includes(m3.status),
    'turned on, it answers a member each person’s task views, their activity and their Lineup in the period, as the database holds them, and their status',
    `${said(asMember)}; the member's row ${JSON.stringify(m3)}; activity held ${expectActions}`,
  )
  const listed = (asMember.data?.people ?? []).map((x) => x.userId)
  chk(
    listed.includes(adminId) && listed.includes(member.id) && listed.includes(other.id) && !listed.includes(guest.id),
    'it lists the workspace’s members and not its guest',
    JSON.stringify((asMember.data?.people ?? []).map((x) => x.displayName)),
  )
  const adminByMember = rowOf(asMember, { id: adminId })
  const asAdmin = await analytics(A)
  const adminByAdmin = rowOf(asAdmin, { id: adminId })
  const mostOf = (row) => (row?.mostViewed ?? []).map((t) => t.taskId).sort()
  chk(
    JSON.stringify(mostOf(m3)) === JSON.stringify([T1.id, T2.id].sort())
      && adminByMember?.views === 1 && mostOf(adminByMember).length === 0
      && JSON.stringify(mostOf(adminByAdmin)) === JSON.stringify([TP.id]),
    'a person’s most-viewed tasks are named only where the reader may open them: the admin’s view of the private task is counted for the member reading, and not named to them, while the admin reading sees it named',
    `member's ${JSON.stringify(mostOf(m3))}; the admin's read by the member ${JSON.stringify(adminByMember)}; read by the admin ${JSON.stringify(mostOf(adminByAdmin))}`,
  )
  const crew = (asMember.data?.teams ?? []).find((t) => t.groupId === team.data.id)
  const otherRow = rowOf(asMember, other)
  chk(
    !!crew && crew.members === 2 && crew.views === m3.views + (otherRow?.views ?? 0) && crew.actions === m3.actions + (otherRow?.actions ?? 0),
    'and the team rolls its two members up: their number, their activity and their task views summed',
    `${JSON.stringify(crew)}; the other member ${JSON.stringify(otherRow)}`,
  )

  // ══ 4. THE PERIOD ══════════════════════════════════════════════════════════
  console.log('\n▶ the period: a view ten days ago, and periods refused')
  await sql`insert into task_view_events (workspace_id, task_id, user_id, viewed_at) values (${WS}, ${T2.id}, ${other.id}, now() - interval '10 days')`
  const days = (n) => new Date(Date.now() - n * 86_400_000).toISOString()
  const week = await analytics(member.api)
  const older = await analytics(member.api, `?from=${encodeURIComponent(days(14))}&to=${encodeURIComponent(days(7))}`)
  const backwards = await analytics(member.api, `?from=${encodeURIComponent(days(1))}&to=${encodeURIComponent(days(2))}`)
  const tooLong = await analytics(member.api, `?from=${encodeURIComponent(days(100))}&to=${encodeURIComponent(days(0))}`)
  chk(
    rowOf(week, other)?.views === 0 && rowOf(older, other)?.views === 1
      && backwards.status === 400 && backwards.message === 'from must be before to'
      && tooLong.status === 400 && tooLong.message === 'A period is 92 days at most',
    'a view counts in its own period: not in the last seven days, and in the week before; a period that ends before it begins, or is longer than a quarter, is refused in words (400)',
    `other's views this week ${rowOf(week, other)?.views}, the week before ${rowOf(older, other)?.views}; ${said(backwards)}; ${said(tooLong)}`,
  )

  // ══ 5. WHO SEES IT ═════════════════════════════════════════════════════════
  console.log('\n▶ the audience: owners and admins only, and back')
  const byMember = await member.api(`/workspaces/${WS}/analytics/settings`, { method: 'PATCH', body: { audience: 'admins' } })
  const bad = await A(`/workspaces/${WS}/analytics/settings`, { method: 'PATCH', body: { audience: 'everyone' } })
  const narrowed = await A(`/workspaces/${WS}/analytics/settings`, { method: 'PATCH', body: { audience: 'admins' } })
  const [held5] = await sql`select analytics_audience as a from workspaces where id = ${WS}`
  const memberAfter = await analytics(member.api)
  const adminAfter = await analytics(A)
  chk(
    byMember.status === 403 && bad.status === 400 && narrowed.status === 200 && held5?.a === 'admins'
      && memberAfter.status === 403 && memberAfter.message === REFUSED.admins && adminAfter.status === 200 && adminAfter.data?.enabled === true,
    'set to owners and admins only — by the admin, not a member (403), and only to a known audience (400) — Analytics refuses a member in words (403) and answers the admin',
    `member's set ${said(byMember)}; unknown ${said(bad)}; admin's ${said(narrowed)}, held ${held5?.a}; member reads ${said(memberAfter)}; admin reads ${adminAfter.status}`,
  )
  const back = await A(`/workspaces/${WS}/analytics/settings`, { method: 'PATCH', body: { audience: 'members' } })
  if (back.status !== 200) throw new Error(`could not open Analytics to members again: ${said(back)}`)

  // ══ THE PAGES ══════════════════════════════════════════════════════════════
  browser = await (await resolveChromium()).launch(launchOptions())
  const signedIn = async (p) => {
    const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage()
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', p.email)
    await page.fill('input[type=password]', p.password)
    await page.click('button[type=submit]', { timeout: 10_000 }).catch(() => {})
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
    return page
  }
  const count = async (loc) => loc.count().catch(() => -1)

  // ══ 6. THE SHEET LOGS A VIEW ═══════════════════════════════════════════════
  console.log('\n▶ the other member opens a task’s sheet')
  const oPage = await signedIn(other)
  const before6 = await views(other.id, T1.id)
  await oPage.goto(`${B}/app/${WS}/${space.data.id}/${project.data.id}/${list.data.id}?task=${T1.id}`, { waitUntil: 'domcontentloaded' })
  const logged = await waitUntil(async () => (await views(other.id, T1.id)) === before6 + 1, { timeoutMs: 20_000 })
  chk(
    logged === true,
    'opening a task’s sheet logs one view of it, read by SQL',
    `their views of it ${before6} → ${await views(other.id, T1.id)}`,
  )

  // ══ 7. THE PAGE, AS THE ADMIN ══════════════════════════════════════════════
  console.log('\n▶ the admin’s Teams › Analytics')
  const aPage = await signedIn(ADMIN)
  await aPage.goto(`${B}/app/${WS}/teams`, { waitUntil: 'domcontentloaded' })
  await aPage.getByTestId('teams-tab-analytics').click({ timeout: 20_000 }).catch(() => {})
  const memberRow = aPage.getByTestId(`teams-analytics-person-${member.id}`)
  await memberRow.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
  const p7 = {
    rows: await count(aPage.locator('[data-testid^="teams-analytics-person-"]')),
    guestRow: await count(aPage.getByTestId(`teams-analytics-person-${guest.id}`)),
    views: (await readText(memberRow.getByTestId('teams-analytics-views').filter({ visible: true }), { timeoutMs: 3000 })).trim(),
    lineup: (await readText(memberRow.getByTestId('teams-analytics-lineup').filter({ visible: true }), { timeoutMs: 3000 })).trim(),
    named: [await count(memberRow.getByTestId(`teams-analytics-viewed-${T1.id}`)), await count(memberRow.getByTestId(`teams-analytics-viewed-${T2.id}`))],
    team: await count(aPage.getByTestId(`teams-analytics-team-${team.data.id}`)),
  }
  chk(
    p7.rows === 3 && p7.guestRow === 0 && p7.views === '2' && p7.lineup === '1' && p7.named.every((n) => n === 1) && p7.team === 1,
    'the Analytics tab draws a row a member — not the guest — with the member’s two task views, their Lineup and both tasks named, and the team’s roll-up',
    JSON.stringify(p7),
  )

  // ══ 8. THE PERIOD AND THE SEARCH, ON THE PAGE ═════════════════════════════
  console.log('\n▶ the arrows and the search')
  const period = aPage.getByTestId('teams-analytics-period').filter({ visible: true })
  const thisWeek = (await readText(period, { timeoutMs: 3000 })).trim()
  const nextDisabled = await aPage.getByTestId('teams-analytics-next').isDisabled({ timeout: 3000 }).catch(() => null)
  await aPage.getByTestId('teams-analytics-prev').click({ timeout: 5000 }).catch(() => {})
  const moved = await waitUntil(async () => (await readText(period, { timeoutMs: 1000 })).trim() !== thisWeek, { timeoutMs: 10_000 })
  const otherRowEl = aPage.getByTestId(`teams-analytics-person-${other.id}`)
  // The week before holds the other member's older view.
  const olderViews = await waitUntil(async () => (await readText(otherRowEl.getByTestId('teams-analytics-views').filter({ visible: true }), { timeoutMs: 1000 })).trim() === '1', { timeoutMs: 10_000 })
  await aPage.getByTestId('teams-analytics-search').fill(other.name, { timeout: 5000 }).catch(() => {})
  const narrowedTo = await waitUntil(async () => (await count(aPage.locator('[data-testid^="teams-analytics-person-"]'))) === 1, { timeoutMs: 5000 })
  const which = await count(otherRowEl)
  chk(
    nextDisabled === true && moved && olderViews && narrowedTo && which === 1,
    'the arrows move the period — no further on than this week — and the week before shows the other member’s older view; a name searched leaves that person alone',
    JSON.stringify({ thisWeek, nextDisabled, moved, olderViews, narrowedTo, which }),
  )

  // ══ 9. WHO SEES IT, AND OFF, FROM THE PAGE ═════════════════════════════════
  console.log('\n▶ the admin sets the audience and turns Analytics off, from the page')
  await aPage.getByTestId('teams-analytics-search').fill('', { timeout: 5000 }).catch(() => {})
  await aPage.getByTestId('teams-analytics-audience').selectOption('admins', { timeout: 5000 }).catch(() => {})
  const audienceSaved = await waitUntil(async () => (await sql`select analytics_audience as a from workspaces where id = ${WS}`)[0]?.a === 'admins', { timeoutMs: 10_000 })
  const mPage = await signedIn(member)
  await mPage.goto(`${B}/app/${WS}/teams`, { waitUntil: 'domcontentloaded' })
  await mPage.getByTestId('teams-tab-analytics').click({ timeout: 20_000 }).catch(() => {})
  const refusal = mPage.getByTestId('teams-analytics-refused').filter({ visible: true })
  await refusal.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  const refusedText = (await readText(refusal, { timeoutMs: 3000 })).trim()
  await aPage.getByTestId('teams-analytics-turn-off').click({ timeout: 5000 }).catch(() => {})
  const offState = await waitUntil(() => aPage.getByTestId('teams-analytics-off').isVisible().catch(() => false), { timeoutMs: 10_000 })
  const [flagRow] = await sql`select enabled from feature_flags where flag_key = 'teams.analytics' and workspace_id = ${WS} and scope = 'workspace'`
  const turnOnOffered = await count(aPage.getByTestId('teams-analytics-turn-on'))
  chk(
    audienceSaved && refusedText === REFUSED.admins && offState && flagRow?.enabled === false && turnOnOffered === 1,
    'the admin’s audience is saved from the page and a member opening Analytics then reads why not; turned off from the page, it says it is off and offers the admin Turn on again (read by SQL)',
    JSON.stringify({ audienceSaved, refusedText, offState, flag: flagRow ?? null, turnOnOffered }),
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

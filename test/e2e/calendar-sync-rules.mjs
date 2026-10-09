/**
 * A PERSON'S SYNCS DECIDE WHICH TASKS GO TO THEIR CALENDAR — ClickUp's "Sync
 * tasks to calendar" (`ledger-rows/row-1962`).
 *
 * Frame `14:32` draws the planner's Automations page: "Sync ClickUp tasks to
 * Google Calendar", "Pick a list, folder, or space…", "+ Add sync". ClickUp's
 * help centre ("Google Calendar integration", through search excerpts): tasks
 * sync from a Space, Folder, Subfolder or List, to a calendar of one's own,
 * all of them or only those assigned to you; a task needs a start or due date
 * to be on the calendar, a date with no time is a day's event, and a due date
 * alone begins an hour before it. Here the push wrote every dated task of a
 * workspace into every calendar connected to it, with no table saying where
 * and no switch to stop it.
 *
 * Against the lane's calendar stub (`scripts/e2e-lanes/calendar-stub.mjs`), in
 * which a calendar is a bearer token: a member of the run's own with a Google
 * calendar connected, the admin with one of their own, and a workspace of
 * spaces, a folder, projects and lists — one of them the admin's private list
 * inside the folder the member syncs. The member's first sync is made on the
 * page; the rest through the routes the page calls.
 *
 *   node test/e2e/calendar-sync-rules.mjs --api 3027 --dist /tmp/claude-0/dist-7
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil } from './lib/wait.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'
import { calendarBase, seedCalendar, readCalendar, forgetCalendar } from './lib/calendar.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 12

const REPO = path.resolve(import.meta.dirname, '../..')
const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const CAL = calendarBase(API_PORT, argOf('--calendar', undefined))
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

const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
// lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). Never throws: `{status, data, error}`.
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `csr${stamp}`
const PASSWORD = 'CalendarSync@12345!'
const TOKENS = { member: `${TAG}-member`, admin: `${TAG}-admin` }

/* The days the tasks fall on, in UTC: tomorrow and the day after. */
const DAY = 86_400_000
const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z')
const at = (days, hh, mm = 0) => new Date(today.getTime() + days * DAY + (hh * 60 + mm) * 60_000)
const dayOf = (d) => d.toISOString().slice(0, 10)

let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the calendars are connected by SQL, as a grant leaves them')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const [admin] = await sql`select id from users where email = ${ADMIN.email}`

  const memberEmail = `${TAG}-member@rundesk.invalid`
  const signed = await signUpApi(API, { fullName: 'Sync member', email: memberEmail, password: PASSWORD, organizationName: `Sync member ${stamp}`, organizationSlug: `sync-member-${stamp}` })
  const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email: memberEmail, role: 'member' } })
  if (!added.ok) throw new Error(`could not add the member: ${said(added)}`)
  const M = apiAs(signed.accessToken)
  const [member] = await sql`select id from users where email = ${memberEmail}`

  // ── The places: a space with a folder (a project and two lists in it, one the admin's private list), a
  //    folderless project with a list, a second folderless project, a second space, and a private space. ──
  const must = (res, what) => {
    if (!res.ok || !res.data?.id) throw new Error(`could not make ${what}: ${said(res)}`)
    return res.data.id
  }
  const S1 = must(await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} Studio` } }), 'the space')
  const F1 = must(await A(`/spaces/${S1}/folders`, { method: 'POST', body: { name: `${TAG} Launch folder` } }), 'the folder')
  const P1 = must(await A('/projects', { method: 'POST', body: { spaceId: S1, folderId: F1, name: `${TAG} Launch` } }), 'the folder’s project')
  const L1 = must(await A('/lists', { method: 'POST', body: { projectId: P1, name: `${TAG} Launch list` } }), 'the folder’s list')
  const LP = must(await A('/lists', { method: 'POST', body: { projectId: P1, name: `${TAG} Admin only`, visibility: 'private' } }), 'the private list')
  const P2 = must(await A('/projects', { method: 'POST', body: { spaceId: S1, name: `${TAG} Mine` } }), 'the second project')
  const L2 = must(await A('/lists', { method: 'POST', body: { projectId: P2, name: `${TAG} Mine list` } }), 'its list')
  const P4 = must(await A('/projects', { method: 'POST', body: { spaceId: S1, name: `${TAG} Stays` } }), 'the third project')
  const L4 = must(await A('/lists', { method: 'POST', body: { projectId: P4, name: `${TAG} Stays list` } }), 'its list')
  const S2 = must(await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} Elsewhere` } }), 'the second space')
  const P3 = must(await A('/projects', { method: 'POST', body: { spaceId: S2, name: `${TAG} Elsewhere` } }), 'its project')
  const L3 = must(await A('/lists', { method: 'POST', body: { projectId: P3, name: `${TAG} Elsewhere list` } }), 'its list')
  const SP = must(await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} Closed`, visibility: 'private' } }), 'the private space')
  const task = async (listId, title, extra = {}) =>
    must(await A('/tasks', { method: 'POST', body: { listId, title: `${TAG} ${title}`, ...extra } }), `the task “${title}”`)

  // ── Their calendars: seeded at the stub, and connected as a grant leaves them ──
  await seedCalendar(CAL, { token: TOKENS.member, provider: 'gcal', events: [] })
  await seedCalendar(CAL, { token: TOKENS.admin, provider: 'gcal', events: [] })
  const plant = async (userId, key, token) => (await sql`
      insert into user_calendar_accounts
        (user_id, workspace_id, provider, external_account_id, external_account_email, access_token, token_expires_at, is_default, status)
      values (${userId}, ${WS}, 'gcal', ${`${TAG}-${key}`}, ${`${key}-${stamp}@calendar.test`}, ${token},
              ${new Date(Date.now() + 3_600_000)}, true, 'connected')
      returning id::text as id`)[0].id
  const M_CAL = await plant(member.id, 'member', TOKENS.member)
  const A_CAL = await plant(admin.id, 'admin', TOKENS.admin)
  const memberCalEmail = `member-${stamp}@calendar.test`
  // And the workspace's own Google Calendar, connected by the admin without a token, as the App Center leaves one.
  await sql`insert into workspace_integration_connections (workspace_id, provider, status, scopes, access_token, metadata, connected_by_id)
            values (${WS}, 'gcal', 'connected', ${sql.array([])}, null, ${sql.json({})}, ${admin.id})`

  const eventsOf = async (token) => (await readCalendar(CAL, token))?.events ?? []
  const named = async (token, title) => (await eventsOf(token)).filter((e) => e.title === `${TAG} ${title}`)
  const shows = (token, title) => waitUntil(async () => (await named(token, title)).length === 1, { timeoutMs: 20_000 })
  const gone = (token, title) => waitUntil(async () => (await named(token, title)).length === 0, { timeoutMs: 20_000 })
  const push = (taskId) => A(`/workspaces/${WS}/calendar-sync/tasks/${taskId}/push`, { method: 'POST' })

  // A task due tomorrow at three, and one with no date, before any sync.
  const EARLY = await task(L1, 'Early plan', { dueDate: at(1, 15).toISOString() })
  const UNDATED = await task(L1, 'Someday')

  // ══ 1. NOTHING SYNCS UNTIL A SYNC IS ADDED ═══════════════════════════════
  console.log('\n▶ a dated task, pushed before the member has added any sync')
  const firstPush = await push(EARLY)
  const skippedConnection = (firstPush.data?.skipped ?? []).filter((s) => /^(gcal|outlook):/.test(s))
  const firstEvents = (await eventsOf(TOKENS.member)).length
  browser = await chromium.launch(launchOptions())
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', memberEmail)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
  await page.goto(`${B}/app/${WS}/calendar?settings=automations`, { waitUntil: 'domcontentloaded' })
  const automations = page.getByTestId('planner-settings-automations')
  const emptyShown = await page.getByTestId('planner-sync-empty').waitFor({ state: 'visible', timeout: 20_000 }).then(() => true, () => false)
  const emptySaid = emptyShown ? await page.getByTestId('planner-sync-empty').innerText({ timeout: 5000 }).catch(() => '') : ''
  const addOffered = await page.getByTestId('planner-sync-add').isVisible().catch(() => false)
  chk(
    firstPush.status === 201 && skippedConnection.length === 0 && firstEvents === 0
      && emptySaid.startsWith('Pick a list, folder, or space') && addOffered,
    'nothing syncs until a sync is added: a dated task’s push writes to no calendar — not the member’s own, which no sync names, nor the workspace’s connected Google Calendar — and the Automations page says to pick a list, folder, or space, offering + Add sync',
    `the push answered ${firstPush.status} ${JSON.stringify(firstPush.data ?? firstPush.error?.message ?? null)}; the member’s calendar holds ${firstEvents} event(s); the page said ${JSON.stringify(emptySaid)}, + Add sync offered: ${addOffered}`,
  )

  // ══ 2. A SYNC ADDED ON THE PAGE ══════════════════════════════════════════
  console.log('\n▶ the member adds a sync of the folder on the Automations page')
  await page.getByTestId('planner-sync-add').click({ timeout: 8000 }).catch(() => {})
  const placeSelect = page.getByTestId('planner-sync-place')
  const folderOffered = await waitUntil(async () => (await placeSelect.locator(`option[value="folder:${F1}"]`).count().catch(() => 0)) === 1, { timeoutMs: 20_000 })
  await placeSelect.selectOption(`folder:${F1}`, { timeout: 5000 }).catch(() => {})
  await page.getByTestId('planner-sync-calendar').selectOption(M_CAL, { timeout: 5000 }).catch(() => {})
  await page.getByTestId('planner-sync-which-all').check({ timeout: 5000 }).catch(() => {})
  await page.getByTestId('planner-sync-save').click({ timeout: 8000 }).catch(() => {})
  const folderRow = automations.locator(`[data-place="folder:${F1}"]`)
  const rowShown = await folderRow.waitFor({ state: 'visible', timeout: 20_000 }).then(() => true, () => false)
  const rowSaid = rowShown ? await folderRow.innerText({ timeout: 5000 }).catch(() => '') : ''
  const listed = await M(`/workspaces/${WS}/calendar-sync/rules`)
  const folderRule = (listed.data ?? []).find((r) => r.scopeType === 'folder' && r.scopeId === F1)
  chk(
    folderOffered && rowSaid.includes(`${TAG} Launch folder`) && rowSaid.includes(memberCalEmail) && rowSaid.includes('All tasks')
      && listed.status === 200 && folderRule?.account?.id === M_CAL && folderRule?.assignedOnly === false,
    'the member adds a sync of a folder on the Automations page — the folder, their calendar, all tasks — and it is listed, naming the folder and the calendar',
    `the folder offered: ${folderOffered}; the row read ${JSON.stringify(rowSaid)}; the syncs answered ${listed.status} ${JSON.stringify(listed.data ?? null)}`,
  )

  // ══ 3. WHAT IS ALREADY THERE ══════════════════════════════════════════════
  console.log('\n▶ the folder’s tasks, once the sync is made')
  const earlyShown = await shows(TOKENS.member, 'Early plan')
  const [early] = await named(TOKENS.member, 'Early plan')
  const undatedThere = (await named(TOKENS.member, 'Someday')).length
  chk(
    earlyShown && early?.allDay === false && early?.start === at(1, 14).toISOString() && early?.end === at(1, 15).toISOString() && undatedThere === 0,
    'the tasks already in the folder are written to that calendar once the sync is made: a task due at a time is the hour before it, under its name — and an undated one is not',
    `the early task’s event ${JSON.stringify(early ?? null)} (want ${at(1, 14).toISOString()} → ${at(1, 15).toISOString()}); the undated task’s events: ${undatedThere}`,
  )

  // ══ 4. A DAY'S TASK ═══════════════════════════════════════════════════════
  console.log('\n▶ a task made in the folder afterwards, due on a day with no time')
  const DAYTASK = await task(L1, 'Launch day', { dueDate: at(2, 0).toISOString() })
  const dayShown = await shows(TOKENS.member, 'Launch day')
  const [dayEvent] = await named(TOKENS.member, 'Launch day')
  chk(
    dayShown && dayEvent?.allDay === true && dayEvent?.start === dayOf(at(2, 0)) && dayEvent?.end === dayOf(at(3, 0)),
    'a task made there afterwards with a due day and no time is that day’s event',
    `its event ${JSON.stringify(dayEvent ?? null)} (want the day ${dayOf(at(2, 0))})`,
  )

  // ══ 5. A CHANGE TO THE TASK ═══════════════════════════════════════════════
  console.log('\n▶ the early task renamed and moved to half past five; then given a priority')
  const renamed = await A(`/tasks/${EARLY}`, { method: 'PATCH', body: { title: `${TAG} Early plan, moved`, dueDate: at(1, 17, 30).toISOString() } })
  const movedShown = await shows(TOKENS.member, 'Early plan, moved')
  const [moved] = await named(TOKENS.member, 'Early plan, moved')
  const oldTitleLeft = (await named(TOKENS.member, 'Early plan')).length
  const writesBefore = (await readCalendar(CAL, TOKENS.member))?.writes?.length ?? -1
  const prioritised = await A(`/tasks/${EARLY}`, { method: 'PATCH', body: { priority: 'high' } })
  const quietPush = await push(EARLY)
  const writesAfter = (await readCalendar(CAL, TOKENS.member))?.writes?.length ?? -2
  chk(
    renamed.status >= 200 && renamed.status < 300 && movedShown && moved?.id === early?.id
      && moved?.start === at(1, 16, 30).toISOString() && moved?.end === at(1, 17, 30).toISOString() && oldTitleLeft === 0
      && prioritised.status >= 200 && prioritised.status < 300 && quietPush.status === 201
      && (quietPush.data?.unchanged ?? []).includes(M_CAL) && writesAfter === writesBefore,
    'renaming a task and moving its due time changes its event — the same event, not a second — and a change the event does not show writes nothing',
    `renamed ${said(renamed)}; the event ${JSON.stringify(moved ?? null)} (was ${JSON.stringify(early?.id ?? null)}); ${oldTitleLeft} left under the old name; a priority change pushed ${quietPush.status} ${JSON.stringify(quietPush.data ?? null)}, the calendar’s writes ${writesBefore} → ${writesAfter}`,
  )

  // ══ 6. WHERE THE TASK IS ══════════════════════════════════════════════════
  console.log('\n▶ a task outside the synced places; one moved out of the folder and back')
  const OUTSIDE = await task(L3, 'Elsewhere plan', { dueDate: at(1, 11).toISOString() })
  const outsidePush = await push(OUTSIDE)
  const outsideThere = (await named(TOKENS.member, 'Elsewhere plan')).length
  const MOVER = await task(L1, 'Mover', { dueDate: at(1, 12).toISOString() })
  const moverIn = await shows(TOKENS.member, 'Mover')
  const movedOut = await A(`/tasks/${MOVER}/move`, { method: 'POST', body: { listId: L3, position: 0 } })
  const moverOut = await gone(TOKENS.member, 'Mover')
  const movedBack = await A(`/tasks/${MOVER}/move`, { method: 'POST', body: { listId: L1, position: 0 } })
  const moverBack = await shows(TOKENS.member, 'Mover')
  chk(
    outsidePush.status === 201 && !(outsidePush.data?.written ?? []).includes(M_CAL) && outsideThere === 0
      && moverIn && movedOut.status >= 200 && movedOut.status < 300 && moverOut
      && movedBack.status >= 200 && movedBack.status < 300 && moverBack,
    'a task in a place no sync holds is not written; moved out of the folder its event comes off, and moved back it is written again',
    `outside: pushed ${outsidePush.status} ${JSON.stringify(outsidePush.data ?? null)}, ${outsideThere} event(s); the mover written ${moverIn}, moved out ${said(movedOut)} and taken off ${moverOut}, moved back ${said(movedBack)} and written ${moverBack}`,
  )

  // ══ 7. A DATE CLEARED, A TASK ARCHIVED ════════════════════════════════════
  console.log('\n▶ a task’s due date cleared; another archived')
  const CLEARED = await task(L1, 'Undated later', { dueDate: at(1, 9).toISOString() })
  const ARCHIVED = await task(L1, 'Archived later', { dueDate: at(1, 10).toISOString() })
  const bothIn = (await shows(TOKENS.member, 'Undated later')) && (await shows(TOKENS.member, 'Archived later'))
  const cleared = await A(`/tasks/${CLEARED}`, { method: 'PATCH', body: { dueDate: null } })
  const archived = await A(`/tasks/${ARCHIVED}`, { method: 'PATCH', body: { isArchived: true } })
  const clearedOff = await gone(TOKENS.member, 'Undated later')
  const archivedOff = await gone(TOKENS.member, 'Archived later')
  chk(
    bothIn && cleared.status >= 200 && cleared.status < 300 && archived.status >= 200 && archived.status < 300 && clearedOff && archivedOff,
    'a task whose due date is cleared comes off the calendar, and so does an archived one',
    `both written ${bothIn}; cleared ${said(cleared)} → off ${clearedOff}; archived ${said(archived)} → off ${archivedOff}`,
  )

  // ══ 8. ONLY THE TASKS ASSIGNED TO ME ══════════════════════════════════════
  console.log('\n▶ a sync of a list, of only the tasks assigned to the member')
  const mineRule = await M(`/workspaces/${WS}/calendar-sync/rules`, { method: 'POST', body: { scopeType: 'list', scopeId: L2, accountId: M_CAL, assignedOnly: true } })
  const MINE = await task(L2, 'Mine to do', { dueDate: at(1, 13).toISOString() })
  const unassignedPush = await push(MINE)
  const unassignedThere = (await named(TOKENS.member, 'Mine to do')).length
  const assigned = await A(`/tasks/${MINE}/assignees`, { method: 'POST', body: { userId: member.id } })
  const mineIn = await shows(TOKENS.member, 'Mine to do')
  const unassigned = await A(`/tasks/${MINE}/assignees/${member.id}`, { method: 'DELETE' })
  const mineOut = await gone(TOKENS.member, 'Mine to do')
  chk(
    mineRule.status === 201 && mineRule.data?.assignedOnly === true
      && unassignedPush.status === 201 && unassignedThere === 0
      && assigned.status >= 200 && assigned.status < 300 && mineIn
      && unassigned.status >= 200 && unassigned.status < 300 && mineOut,
    'a sync of only the tasks assigned to its owner takes a task once they are assigned it, and gives it up when they are not',
    `the sync ${said(mineRule)} ${JSON.stringify(mineRule.data?.assignedOnly ?? null)}; unassigned: ${unassignedThere} event(s); assigned ${said(assigned)} → written ${mineIn}; unassigned ${said(unassigned)} → off ${mineOut}`,
  )

  // ══ 9. WHAT THE OWNER MAY OPEN ════════════════════════════════════════════
  console.log('\n▶ the admin’s private list in the folder the member syncs; the admin syncs the folder too')
  const adminRule = await A(`/workspaces/${WS}/calendar-sync/rules`, { method: 'POST', body: { scopeType: 'folder', scopeId: F1, accountId: A_CAL } })
  const PRIVATE = await task(LP, 'Admin’s own', { dueDate: at(1, 8).toISOString() })
  const privateInAdmin = await shows(TOKENS.admin, 'Admin’s own')
  const privatePush = await push(PRIVATE)
  const privateInMember = (await named(TOKENS.member, 'Admin’s own')).length
  const memberReads = await M(`/tasks/${PRIVATE}`)
  chk(
    adminRule.status === 201 && privateInAdmin && memberReads.status === 403
      && privatePush.status === 201 && !(privatePush.data?.written ?? []).includes(M_CAL) && privateInMember === 0,
    'a sync takes only what its owner may open: the admin’s private list in the synced folder is not written to the member’s calendar — the member is refused it — while the admin’s own sync of the folder writes it to theirs',
    `the admin’s sync ${said(adminRule)}; in the admin’s calendar ${privateInAdmin}; the member reading it ${said(memberReads)}; pushed ${privatePush.status} ${JSON.stringify(privatePush.data ?? null)}; in the member’s calendar ${privateInMember}`,
  )

  // ══ 10. WHAT A SYNC MAY NAME ══════════════════════════════════════════════
  console.log('\n▶ syncs the member may not make, and whose syncs they are shown')
  const closedSpace = await M(`/workspaces/${WS}/calendar-sync/rules`, { method: 'POST', body: { scopeType: 'space', scopeId: SP, accountId: M_CAL } })
  const noSuchList = await M(`/workspaces/${WS}/calendar-sync/rules`, { method: 'POST', body: { scopeType: 'list', scopeId: '00000000-0000-4000-8000-000000000000', accountId: M_CAL } })
  const theirCalendar = await M(`/workspaces/${WS}/calendar-sync/rules`, { method: 'POST', body: { scopeType: 'list', scopeId: L4, accountId: A_CAL } })
  const twice = await M(`/workspaces/${WS}/calendar-sync/rules`, { method: 'POST', body: { scopeType: 'folder', scopeId: F1, accountId: M_CAL } })
  const mineListed = await M(`/workspaces/${WS}/calendar-sync/rules`)
  const listedIds = (mineListed.data ?? []).map((r) => r.id).sort()
  const [{ n: adminRules }] = await sql`select count(*)::int as n from calendar_sync_rules where workspace_id = ${WS} and user_id = ${admin.id}`
  chk(
    closedSpace.status === 403 && closedSpace.error?.message === 'You cannot open that space, so its tasks cannot be synced to your calendar'
      && noSuchList.status === 404 && noSuchList.error?.message === 'List not found'
      && theirCalendar.status === 404 && theirCalendar.error?.message === 'Calendar account not found'
      && twice.status === 409
      && mineListed.status === 200 && JSON.stringify(listedIds) === JSON.stringify([folderRule?.id, mineRule.data?.id].sort()) && adminRules === 1,
    'a place the member may not open is refused, saying so — a private space they are not in, 403 — one that is not there is 404, a colleague’s calendar is not found, the same place twice to one calendar is refused; and the member is shown their own syncs alone',
    `closed space ${said(closedSpace)}; no such list ${said(noSuchList)}; the admin’s calendar ${said(theirCalendar)}; twice ${said(twice)}; listed ${mineListed.status} ${JSON.stringify(listedIds)} (the admin holds ${adminRules})`,
  )

  // ══ 11. A SYNC REMOVED ON THE PAGE ════════════════════════════════════════
  console.log('\n▶ the member removes the folder’s sync on the page')
  await page.reload({ waitUntil: 'domcontentloaded' })
  const removeButton = page.getByTestId(`planner-sync-remove-${folderRule?.id ?? 'none'}`)
  await removeButton.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
  await removeButton.click({ timeout: 8000 }).catch(() => {})
  const rowGone = await folderRow.waitFor({ state: 'detached', timeout: 20_000 }).then(() => true, () => false)
  const allOff = await waitUntil(async () => {
    const left = await eventsOf(TOKENS.member)
    return !left.some((e) => [`${TAG} Early plan, moved`, `${TAG} Launch day`, `${TAG} Mover`].includes(e.title))
  }, { timeoutMs: 20_000 })
  const renamedAfter = await A(`/tasks/${DAYTASK}`, { method: 'PATCH', body: { title: `${TAG} Launch day, renamed` } })
  const afterPush = await push(DAYTASK)
  const afterThere = (await named(TOKENS.member, 'Launch day, renamed')).length
  chk(
    rowGone && allOff && renamedAfter.status >= 200 && renamedAfter.status < 300
      && afterPush.status === 201 && !(afterPush.data?.written ?? []).includes(M_CAL) && afterThere === 0,
    'removing the sync on the page takes its events off the calendar, and a change to a task there afterwards writes nothing',
    `the row gone ${rowGone}; its events off ${allOff} (left ${JSON.stringify((await eventsOf(TOKENS.member)).map((e) => e.title))}); renamed ${said(renamedAfter)} and pushed ${afterPush.status} ${JSON.stringify(afterPush.data ?? null)}; ${afterThere} event(s)`,
  )

  // ══ 12. THE MEMBER LEAVES ═════════════════════════════════════════════════
  console.log('\n▶ the member syncs a project, then is removed from the workspace')
  const staysRule = await M(`/workspaces/${WS}/calendar-sync/rules`, { method: 'POST', body: { scopeType: 'project', scopeId: P4, accountId: M_CAL } })
  const STAYS = await task(L4, 'Stays plan', { dueDate: at(1, 16).toISOString() })
  const staysIn = await shows(TOKENS.member, 'Stays plan')
  const removed = await A(`/workspaces/${WS}/members/${member.id}`, { method: 'DELETE' })
  const renamedGone = await A(`/tasks/${STAYS}`, { method: 'PATCH', body: { title: `${TAG} Stays plan, renamed` } })
  const gonePush = await push(STAYS)
  const staysLeft = (await eventsOf(TOKENS.member)).filter((e) => e.title.startsWith(`${TAG} Stays plan`)).length
  const [{ n: memberRules }] = await sql`select count(*)::int as n from calendar_sync_rules where workspace_id = ${WS} and user_id = ${member.id}`
  chk(
    staysRule.status === 201 && staysIn && removed.ok && renamedGone.status >= 200 && renamedGone.status < 300
      && gonePush.status === 201 && !(gonePush.data?.written ?? []).includes(M_CAL) && staysLeft === 0 && memberRules === 2,
    'once the member has left the workspace their sync writes nothing more — the task it held comes off their calendar when it changes — and their syncs are kept, not deleted',
    `the sync ${said(staysRule)}, written ${staysIn}; removed ${said(removed)}; renamed ${said(renamedGone)}, pushed ${gonePush.status} ${JSON.stringify(gonePush.data ?? null)}; ${staysLeft} of its events left; ${memberRules} sync(s) of theirs kept`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  if (WS && A) {
    const gone = await A(`/workspaces/${WS}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${WS} answered ${gone.status || 'nothing'}`)
  }
  for (const token of Object.values(TOKENS)) await forgetCalendar(CAL, token).catch(() => {})
  // Only now: the calls above go through this proxy, and a closed one refuses them.
  stack.close()
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}

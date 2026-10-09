/**
 * WHAT A PERSON MAY DO WHERE THEY ONLY VIEW, PERSON BY PERSON — ClickUp's
 * individual permissions for view-only users
 * (`found-25-sep/view-only-individual-permissions`).
 *
 * ClickUp (help centre, "Manage individual permissions for view only users",
 * read through search excerpts, 8 October): four switches govern view-only
 * members and guests alike — time estimates and time tracking, on by default;
 * adding or removing tags and creating views, off by default — and an owner or
 * admin turns each on or off for a person, on the Manage people page.
 *
 * Measured before it was built (25 September, and again on 8 October on the
 * batch-19 build): nothing stored a person's switches, and there was no route
 * to set one. Time was tracked by whoever could read a task; a time estimate
 * and a tag asked the write rule, so a member who only views set no estimate,
 * which ClickUp's default lets them; and anybody who read a list made views of
 * their own there, which ClickUp's default does not let a view-only person do.
 *
 * A workspace of this run's own: a member, a guest and a manager; a space whose
 * default is View only, its list shared with the guest at View, and one whose
 * default is Comment. A switch is asked only where the person's level is View:
 * at Comment and above the level's own rule decides, as it did. What each
 * person changes is read back by SQL.
 *
 *   node test/e2e/view-only-permissions.mjs --api 3011 --dist /tmp/claude-0/dist-1
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'
import { waitUntil } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 13

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

/** ClickUp's defaults, and the words each switch refuses in. */
const DEFAULTS = { timeEstimates: true, timeTracking: true, tags: false, createViews: false }
const REFUSED = {
  timeEstimates: 'You can only view here, and your workspace has not allowed you to set time estimates',
  timeTracking: 'You can only view here, and your workspace has not allowed you to track time',
  tags: 'You can only view here, and your workspace has not allowed you to add or remove tags',
  createViews: 'You can only view here, and your workspace has not allowed you to create views',
}

const stamp = Date.now()
const TAG = `vop${stamp}`
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, data, error, message}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.message || null)}`
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — what each person changes is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id

  const person = async (who, role) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const password = 'ViewOnly@12345!'
    const signed = await signUpApi(API, { fullName: `View-only ${who}`, email, password, organizationName: `View-only ${who} ${stamp}`, organizationSlug: `view-only-${who}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (!added.ok) throw new Error(`could not add the ${who}: ${said(added)}`)
    const [row] = await sql`select id from users where email = ${email}`
    return { email, password, id: row?.id, api: apiAs(signed.accessToken) }
  }
  const member = await person('member', 'member')
  const guest = await person('guest', 'guest')
  const manager = await person('manager', 'manager')
  // Somebody who is no member of this workspace, for the route's 404.
  const stranger = await person('stranger', 'member')
  const gone = await A(`/workspaces/${WS}/members/${stranger.id}`, { method: 'DELETE' })
  if (gone.status !== 200 && gone.status !== 204) throw new Error(`could not take the stranger out again: ${said(gone)}`)

  /** A space at `level`, its project, a list and one task in it, made by the admin. */
  const place = async (name, level) => {
    const space = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} ${name}`, defaultPermission: level } })
    const project = await A('/projects', { method: 'POST', body: { spaceId: space.data?.id, name: `${TAG} ${name}` } })
    const list = await A('/lists', { method: 'POST', body: { projectId: project.data?.id, name: `${TAG} ${name}` } })
    if (!list.ok || !list.data?.id) throw new Error(`could not make the ${name} list: ${said(space)} ${said(project)} ${said(list)}`)
    const task = await A('/tasks', { method: 'POST', body: { listId: list.data.id, title: `${TAG} ${name} task` } })
    if (!task.ok || !task.data?.id) throw new Error(`could not make the ${name} task: ${said(task)}`)
    return { space: space.data.id, project: project.data.id, list: list.data.id, task: task.data.id, url: `/app/${WS}/${space.data.id}/${project.data.id}/${list.data.id}` }
  }
  const VIEW = await place('view', 'view')
  const COMMENT = await place('comment', 'comment')
  const shared = await A(`/shares/list/${VIEW.list}`, { method: 'POST', body: { email: guest.email, level: 'view' } })
  if (!shared.ok) throw new Error(`could not share the view-only list with the guest: ${said(shared)}`)
  const label = await A(`/workspaces/${WS}/labels`, { method: 'POST', body: { name: `${TAG} tag`, color: '#2563eb' } })
  if (!label.ok || !label.data?.id) throw new Error(`could not make the tag: ${said(label)}`)
  const LABEL = label.data.id

  /** What the database holds of a person's time, tags and views on the run's list and task. */
  const held = async (p, at = VIEW) => {
    const [time] = await sql`select count(*)::int as n from time_entries where task_id = ${at.task} and user_id = ${p.id}`
    const [tagged] = await sql`select count(*)::int as n from task_label_assignments where task_id = ${at.task} and label_id = ${LABEL}`
    const views = await sql`select visibility from task_views where list_id = ${at.list} and created_by_id = ${p.id}`
    const [task] = await sql`select time_estimate, title from tasks where id = ${at.task}`
    return { time: time.n, tagged: tagged.n, views: views.map((v) => v.visibility).sort().join(','), estimate: task?.time_estimate ?? null, title: task?.title }
  }
  const switchesOf = async (p) => {
    const [row] = await sql`select view_only_time_estimates as "timeEstimates", view_only_time_tracking as "timeTracking", view_only_tags as tags, view_only_create_views as "createViews" from workspace_members where workspace_id = ${WS} and user_id = ${p.id}`
      .catch((err) => [{ error: String(err?.message ?? err).split('\n')[0] }])
    return row ?? null
  }
  const hour = (h) => new Date(Date.UTC(2026, 9, 1, h)).toISOString()

  /** Each thing the four switches are about, tried once by `p` on the view-only list's task. */
  const tryAll = async (p, n) => {
    const before = await held(p)
    const estimate = await p.api(`/tasks/${VIEW.task}`, { method: 'PATCH', body: { timeEstimate: 3600 * n } })
    const start = await p.api(`/tasks/${VIEW.task}/time-entries/start`, { method: 'POST', body: { description: `${TAG} timer ${n}` } })
    const stop = start.data?.id ? await p.api(`/tasks/${VIEW.task}/time-entries/stop/${start.data.id}`, { method: 'POST', body: {} }) : null
    const manual = await p.api(`/tasks/${VIEW.task}/time-entries/manual`, { method: 'POST', body: { startedAt: hour(9), endedAt: hour(10), description: `${TAG} manual ${n}` } })
    const tag = await p.api(`/tasks/${VIEW.task}/labels/${LABEL}`, { method: 'POST' })
    const view = await p.api(`/lists/${VIEW.list}/views`, { method: 'POST', body: { name: `${TAG} own ${n}`, type: 'list', visibility: 'private' } })
    const title = await p.api(`/tasks/${VIEW.task}`, { method: 'PATCH', body: { title: `${TAG} renamed by a reader` } })
    const after = await held(p)
    return {
      before, after,
      estimate: estimate.status, start: start.status, stop: stop?.status ?? null, manual: manual.status, tag: tag.status, view: view.status, title: title.status,
      said: { estimate: estimate.message, start: start.message, manual: manual.message, tag: tag.message, view: view.message, title: title.message },
    }
  }

  // ══ 1. EACH PERSON AT CLICKUP'S DEFAULTS ═══════════════════════════════════
  console.log('\n▶ the People list: each member’s and guest’s switches')
  const roster = await A(`/workspaces/${WS}/members`)
  const listed = (p) => (Array.isArray(roster.data) ? roster.data.find((m) => m.userId === p.id)?.viewOnlyPermissions : undefined)
  chk(
    roster.status === 200 && same(listed(member), DEFAULTS) && same(listed(guest), DEFAULTS)
      && same(await switchesOf(member), DEFAULTS) && same(await switchesOf(guest), DEFAULTS),
    'the People list answers each member’s and guest’s view-only permissions at ClickUp’s defaults — time estimates and time tracking on, tags and creating views off — as the database holds them',
    `${said(roster)}; listed member ${JSON.stringify(listed(member))}, guest ${JSON.stringify(listed(guest))}; held member ${JSON.stringify(await switchesOf(member))}`,
  )

  // ══ 2. THE DEFAULTS, WHERE THEY ONLY VIEW ══════════════════════════════════
  console.log('\n▶ the member in the view-only space, and the guest on the list shared at View, at the defaults')
  for (const [who, p, n] of [['member', member, 1], ['guest', guest, 2]]) {
    const r = await tryAll(p, n)
    chk(
      r.estimate === 200 && r.after.estimate === 3600 * n
        && r.start === 201 && r.stop === 201 && r.manual === 201 && r.after.time === r.before.time + 2
        && r.tag === 403 && r.said.tag === REFUSED.tags && r.after.tagged === 0
        && r.view === 403 && r.said.view === REFUSED.createViews && r.after.views === ''
        && r.title === 403 && /View only/.test(r.said.title) && r.after.title === r.before.title,
      `the ${who}, who only views, sets a time estimate and tracks time — a timer and a logged entry — and is refused a tag and a view of their own in the switches’ words (403), and a title in the level’s; the database holds the estimate and the time and nothing else`,
      JSON.stringify(r),
    )
  }

  // ══ 3. AN ADMIN TURNS THE MEMBER'S FOUR THE OTHER WAY ═════════════════════
  console.log('\n▶ the admin turns the member’s four the other way')
  const flipped = { timeEstimates: false, timeTracking: false, tags: true, createViews: true }
  const flip = await A(`/workspaces/${WS}/members/${member.id}/view-only-permissions`, { method: 'PATCH', body: flipped })
  const [audit] = await sql`select actor_id, description from audit_logs where workspace_id = ${WS} and action = 'member.view_only_permissions_updated' and resource_id = ${member.id} order by created_at desc limit 1`
  chk(
    flip.status === 200 && same(flip.data?.viewOnlyPermissions, flipped) && same(await switchesOf(member), flipped)
      && same(await switchesOf(guest), DEFAULTS)
      && audit?.description === 'View-only permissions changed: timeEstimates off, timeTracking off, tags on, createViews on',
    'an admin turns the member’s time estimates and time tracking off and tags and views on: the answer and the database hold the four, the guest’s stay as they were, and the audit log says what changed',
    `${said(flip)} ${JSON.stringify(flip.data)}; held ${JSON.stringify(await switchesOf(member))}; guest ${JSON.stringify(await switchesOf(guest))}; audit ${JSON.stringify(audit ?? null)}`,
  )

  // ══ 4. THE SAME MEMBER, THE SWITCHES TURNED ═══════════════════════════════
  console.log('\n▶ the member tries each again')
  const m4 = await tryAll(member, 3)
  const bulk = await member.api('/tasks/bulk/update', { method: 'PATCH', body: { taskIds: [VIEW.task], patch: { labelIdsRemove: [LABEL] } } })
  const untagged = (await held(member)).tagged
  const sharedView = await member.api(`/lists/${VIEW.list}/views`, { method: 'POST', body: { name: `${TAG} shared by a reader`, type: 'list' } })
  chk(
    m4.estimate === 403 && m4.said.estimate === REFUSED.timeEstimates && m4.after.estimate === m4.before.estimate
      && m4.start === 403 && m4.said.start === REFUSED.timeTracking && m4.manual === 403 && m4.said.manual === REFUSED.timeTracking
      && m4.after.time === m4.before.time
      && m4.tag === 201 && m4.after.tagged === 1 && bulk.status === 200 && bulk.data?.updatedCount === 1 && untagged === 0
      && m4.view === 201 && m4.after.views === 'private'
      && sharedView.status === 403 && sharedView.message.endsWith('does not allow adding a shared view'),
    'then the member is refused a time estimate, a timer and a logged entry in the switches’ words (403), and nothing of them is saved; puts the tag on and takes it off again, the second by the bulk editor; and makes a view of their own, while a view everybody shares is still refused for the level',
    `${JSON.stringify(m4)}; bulk ${said(bulk)} updated ${bulk.data?.updatedCount}, tagged after ${untagged}; shared view ${said(sharedView)}`,
  )

  // ══ 5. WHAT THE API SAYS EACH MAY DO ═══════════════════════════════════════
  console.log('\n▶ the task’s and the list’s capabilities, for the member and the guest')
  const capsOf = async (p) => {
    const task = await p.api(`/tasks/${VIEW.task}/capabilities`)
    const list = await p.api(`/tasks/list/${VIEW.list}/capabilities`)
    return { estimate: task.data?.estimate, tags: task.data?.tags, track: task.data?.track, edit: task.data?.edit, privateViews: list.data?.privateViews, views: list.data?.views }
  }
  const mCaps = await capsOf(member)
  const gCaps = await capsOf(guest)
  chk(
    same(mCaps, { estimate: false, tags: true, track: false, edit: false, privateViews: true, views: false })
      && same(gCaps, { estimate: true, tags: false, track: true, edit: false, privateViews: false, views: false }),
    'the API says what each may do there, by their own switches: the member no estimate and no time but tags and a view of their own, the guest the estimate and time but no tag and no view; neither may edit the task or add a shared view',
    `member ${JSON.stringify(mCaps)}; guest ${JSON.stringify(gCaps)}`,
  )

  // ══ 6. AT COMMENT, THE LEVEL'S OWN RULE ════════════════════════════════════
  console.log('\n▶ the member where the default is Comment, with tags turned on')
  const cBefore = await held(member, COMMENT)
  const cTag = await member.api(`/tasks/${COMMENT.task}/labels/${LABEL}`, { method: 'POST' })
  const cAfter = await held(member, COMMENT)
  chk(
    cTag.status === 403 && cTag.message === 'This space\'s default permission is "Comment", which does not allow changing its tasks'
      && cAfter.tagged === cBefore.tagged,
    'a switch is asked only where the person only views: at Comment the member with tags on is refused a tag in the level’s words (403), as before, and nothing is saved',
    `${said(cTag)}; tagged ${cBefore.tagged} → ${cAfter.tagged}`,
  )

  // ══ 7. WHO SETS THEM, AND WHAT IS REFUSED ══════════════════════════════════
  console.log('\n▶ the member and a manager setting them, and what the route refuses')
  const route = (userId) => `/workspaces/${WS}/members/${userId}/view-only-permissions`
  const before7 = await switchesOf(member)
  const tries = {
    self: await member.api(route(member.id), { method: 'PATCH', body: { timeTracking: true } }),
    manager: await manager.api(route(member.id), { method: 'PATCH', body: { timeTracking: true } }),
    unknown: await A(route(member.id), { method: 'PATCH', body: { timeTracking: true, role: 'workspace_admin' } }),
    notBoolean: await A(route(member.id), { method: 'PATCH', body: { timeTracking: 'yes' } }),
    nothing: await A(route(member.id), { method: 'PATCH', body: {} }),
    stranger: await A(route(stranger.id), { method: 'PATCH', body: { tags: true } }),
  }
  const after7 = await switchesOf(member)
  const [strangerRow] = await sql`select count(*)::int as n from workspace_members where workspace_id = ${WS} and user_id = ${stranger.id}`
  chk(
    tries.self.status === 403 && tries.manager.status === 403
      && tries.unknown.status === 400 && tries.unknown.message === 'Unknown view-only permission: role'
      && tries.notBoolean.status === 400 && tries.notBoolean.message === 'View-only permission timeTracking must be true or false'
      && tries.nothing.status === 400 && tries.nothing.message === 'Send the permissions to change, each true or false'
      && tries.stranger.status === 404 && strangerRow.n === 0
      && same(after7, before7),
    'only those who may change roles set them: the member themself and a manager are refused (403); a name that is no switch, a value that is not true or false and an empty change are refused in words (400), somebody who is no member is not found (404), and the member’s switches are as they were',
    `${JSON.stringify(Object.fromEntries(Object.entries(tries).map(([k, r]) => [k, said(r)])))}; switches ${JSON.stringify(before7)} → ${JSON.stringify(after7)}`,
  )

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
  const mPage = await signedIn(member)

  /**
   * The task's sheet, which draws nothing until it knows what this person may
   * do: its estimate and tags on the Overview tab it opens on, then its Time tab.
   */
  const sheetTime = async () => {
    await mPage.goto(`${B}${VIEW.url}?task=${VIEW.task}`, { waitUntil: 'domcontentloaded' })
    await mPage.getByTestId('task-tags').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
    const estimate = mPage.getByTestId('task-estimate-input')
    await estimate.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
    const estimateDisabled = await estimate.isDisabled({ timeout: 5000 }).catch(() => null)
    const tagAdd = await count(mPage.getByTestId('task-tag-add'))
    await mPage.getByTestId('task-tab-time').click({ timeout: 20_000 }).catch(() => {})
    const startTimer = mPage.getByTestId('task-sheet').getByRole('button', { name: /^Start timer$/ })
    const note = mPage.getByTestId('task-time-tracking-off')
    // Whichever the panel draws, once it has drawn one of them.
    await waitUntil(async () => (await count(startTimer)) > 0 || (await count(note)) > 0, { timeoutMs: 20_000 })
    return {
      startTimer: await count(startTimer),
      note: await count(note),
      manual: await count(mPage.getByTestId('task-time-manual')),
      estimateDisabled,
      tagAdd,
    }
  }

  // ══ 8. THE TASK SHEET OFFERS WHAT THE SWITCHES ALLOW ══════════════════════
  console.log('\n▶ the member’s task sheet, time estimates and tracking off, tags on')
  const s8 = await sheetTime()
  chk(
    s8.startTimer === 0 && s8.note === 1 && s8.manual === 0 && s8.estimateDisabled === true && s8.tagAdd === 1,
    'the member’s sheet offers no Start timer and no manual entry, and says their workspace has not allowed them to track time there; the estimate cannot be typed in; and a tag can be added',
    JSON.stringify(s8),
  )

  // ══ 9. + VIEW MAKES A VIEW OF THEIR OWN ════════════════════════════════════
  console.log('\n▶ the member’s list page: + View, with creating views on')
  await mPage.goto(`${B}${VIEW.url}`, { waitUntil: 'domcontentloaded' })
  const addView = mPage.getByTestId('list-add-view')
  await addView.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
  const offered = await count(addView)
  const viewsBefore = (await held(member)).views
  const NAME = `${TAG} from the page`
  mPage.once('dialog', (d) => d.accept(NAME).catch(() => {}))
  if (offered > 0) await addView.click({ timeout: 5000 }).catch(() => {})
  const byName = async () => (await sql`select visibility, created_by_id from task_views where list_id = ${VIEW.list} and name = ${NAME}`)[0] ?? null
  await waitUntil(async () => (await byName()) !== null, { timeoutMs: 10_000 })
  const ownView = await byName()
  const viewsAfter = (await held(member)).views
  chk(
    offered === 1 && ownView?.visibility === 'private' && ownView?.created_by_id === member.id
      && viewsAfter === [viewsBefore, 'private'].filter(Boolean).join(','),
    'the member’s list page offers + View, and pressing it makes a view of their own (private), which their level allows where a shared one it does not',
    `+ View ${offered}; the view made ${JSON.stringify(ownView)}; their views ${JSON.stringify(viewsBefore)} → ${JSON.stringify(viewsAfter)}`,
  )

  // ══ 10. THE PEOPLE TAB ════════════════════════════════════════════════════
  console.log('\n▶ the admin’s People tab: the member’s four, a manager’s none; time estimates and tracking turned on, tags off')
  const aPage = await signedIn(ADMIN)
  await aPage.goto(`${B}/app/${WS}/settings?tab=members`, { waitUntil: 'domcontentloaded' })
  const memberButton = aPage.getByTestId(`settings-member-view-only-${member.id}`)
  await memberButton.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
  const p10 = {
    member: await count(memberButton),
    guest: await count(aPage.getByTestId(`settings-member-view-only-${guest.id}`)),
    manager: await count(aPage.getByTestId(`settings-member-view-only-${manager.id}`)),
  }
  if (p10.member > 0) await memberButton.click({ timeout: 5000 }).catch(() => {})
  const panel = aPage.getByTestId('settings-member-view-only-panel')
  await panel.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  const stateOf = async (key) => panel.getByTestId(`settings-view-only-${key}`).getAttribute('data-state', { timeout: 5000 }).catch(() => null)
  p10.shown = {
    timeEstimates: await stateOf('timeEstimates'),
    timeTracking: await stateOf('timeTracking'),
    tags: await stateOf('tags'),
    createViews: await stateOf('createViews'),
  }
  const turned = { timeEstimates: true, timeTracking: true, tags: false, createViews: true }
  // One at a time, each once the one before it is saved and drawn again: a
  // press while a save is out lands on a switch that is not taking presses.
  for (const key of ['timeTracking', 'timeEstimates', 'tags']) {
    const control = panel.getByTestId(`settings-view-only-${key}`)
    await control.click({ timeout: 5000 }).catch(() => {})
    await waitUntil(async () => (await switchesOf(member))?.[key] === turned[key], { timeoutMs: 10_000 })
    await waitUntil(
      async () => (await stateOf(key)) === (turned[key] ? 'checked' : 'unchecked') && (await control.isEnabled({ timeout: 1000 }).catch(() => false)),
      { timeoutMs: 10_000 },
    )
  }
  p10.held = await switchesOf(member)
  chk(
    p10.member === 1 && p10.guest === 1 && p10.manager === 0
      && same(p10.shown, { timeEstimates: 'unchecked', timeTracking: 'unchecked', tags: 'checked', createViews: 'checked' })
      && same(p10.held, turned),
    'the People tab offers the admin each member’s and guest’s view-only permissions and a manager’s none, draws the member’s four as the server holds them, and turning time tracking and estimates on and tags off there saves each, creating views as it was',
    JSON.stringify(p10),
  )

  // ══ 11. AND THE SHEET FOLLOWS ═════════════════════════════════════════════
  console.log('\n▶ the member’s sheet again: time estimates and tracking on, tags off')
  const s11 = await sheetTime()
  chk(
    s11.startTimer === 1 && s11.note === 0 && s11.manual === 1 && s11.estimateDisabled === false && s11.tagAdd === 0,
    'and the member’s sheet follows: Start timer and a manual entry again, no word that they may not track time, an estimate to type, and no tag to add',
    JSON.stringify(s11),
  )

  // ══ 12. AND A TIMER STARTED FROM IT RUNS ══════════════════════════════════
  console.log('\n▶ the member starts a timer from the sheet')
  const t12Before = (await held(member)).time
  await mPage.getByTestId('task-sheet').getByRole('button', { name: /^Start timer$/ }).click({ timeout: 5000 }).catch(() => {})
  const running = await waitUntil(async () => (await sql`select count(*)::int as n from time_entries where task_id = ${VIEW.task} and user_id = ${member.id} and ended_at is null`)[0].n === 1, { timeoutMs: 10_000 })
  chk(
    running === true && (await held(member)).time === t12Before + 1,
    'and a timer the member starts from it runs, read back by SQL',
    `running ${running}; their entries ${t12Before} → ${(await held(member)).time}`,
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

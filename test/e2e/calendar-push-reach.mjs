/**
 * A TASK IS PUSHED ONLY INTO THE CALENDAR OF SOMEBODY WHO MAY READ IT NOW, AND
 * NOT INTO THE CALENDAR OF SOMEBODY WHO HAS LEFT.
 *
 * NOT A FRAME ROW: `found-5-oct/calendar-push-ignores-who-may-read`, found by
 * the triage beside `ledger-rows/row-1962`. Measured on lane 7: a plain member
 * granted `integrations.manage` connected the workspace's Google Calendar; the
 * admin's push of a dated task in a private space the member is refused chose
 * the member's connection, and went on choosing it after the member was
 * removed from the workspace. Every task write pushes, so with a real token the
 * title and description of every dated task there would have been written into
 * the calendar of a person refused it, and of a person gone.
 *
 * A connection is its owner's own account: it takes what its owner may open,
 * by the task read rule, asked at every push, and it stops when its owner
 * leaves, as the iCal feed does. Which lists push at all is the unbuilt
 * Automations feature (`ledger-rows/row-1962`), not this.
 *
 * And the task's own Google Meet and Zoom buttons, which make a meeting in the
 * same connected account under the task's title: found by the review, the
 * admin's Google Meet and Zoom on the private space's task were made in the
 * keeper's Google Calendar and Zoom, and went on being made there after the
 * keeper had left. Each is refused now, saying why — and the task sheet says it
 * in those words. And the rule's membership half, which only a platform admin
 * who has left needs (the read rule lets a super_admin through wherever they
 * are): a super_admin's connection takes a workspace's tasks while they are in
 * it, and none once they are removed.
 *
 * NOTHING LEAVES THE MACHINE. Each connection is staged by SQL WITHOUT a token,
 * so a push that chooses one stops at "No access token" before any request is
 * made: which connections a push chose is read from what it says it skipped.
 * The member's is the workspace's Google Calendar and Zoom, the admin's its
 * Outlook. A meeting whose connection's owner may open the task stops at
 * "Connect … first", for want of the token, also before any request.
 *
 *   node test/e2e/calendar-push-reach.mjs --api 3021 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

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

/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

/** What a task's meeting button answers when its connection's owner may not open the task. */
const OWNER_REFUSED = {
  google_meet: 'The Google Calendar connected to this workspace belongs to somebody who cannot open this task, so no meeting is made in it.',
  zoom: 'The Zoom account connected to this workspace belongs to somebody who cannot open this task, so no meeting is made in it.',
}
/** …and when it is somebody who may, with no token to make it with. */
const CONNECT_FIRST = { google_meet: 'Connect Google Meet first', zoom: 'Connect Zoom first' }

const stamp = Date.now()
const TAG = `cpr${stamp}`
let sql = null
let WS = null
let WS2 = null
let A = null
let O = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the connections are staged, and read back, by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const [admin] = await sql`select id from users where email = ${ADMIN.email}`

  // The keeper: a plain member who holds `integrations.manage` through a custom role, as the triage's did.
  const email = `${TAG}-keeper@rundesk.invalid`
  const signed = await signUpApi(API, { fullName: 'Calendar keeper', email, password: 'CalendarPush@12345!', organizationName: `Calendar keeper ${stamp}`, organizationSlug: `calendar-keeper-${stamp}` })
  const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'member' } })
  if (!added.ok) throw new Error(`could not add the keeper: ${said(added)}`)
  const K = apiAs(signed.accessToken)
  const [keeper] = await sql`select id from users where email = ${email}`
  const role = await A(`/workspaces/${WS}/roles`, { method: 'POST', body: { name: `${TAG} integrations`, permissions: ['integrations.manage'] } })
  const keeperRow = ((await A(`/workspaces/${WS}/members`)).data ?? []).find((m) => (m.userId ?? m.user?.id) === keeper.id)
  const granted = keeperRow && role.data?.id
    ? await A(`/workspaces/${WS}/members/${keeperRow.workspaceMemberId}/roles/${role.data.id}`, { method: 'POST', body: {} })
    : { status: 0 }
  if (!granted.ok) throw new Error(`could not grant integrations.manage: ${said(role)} ${said(granted)}`)

  // A dated task in a private space the keeper is not in, and one in an open space.
  const due = new Date(Date.now() + 86_400_000).toISOString()
  const placeIn = async (C, workspaceId, name, space = {}) => {
    const sp = await C('/spaces', { method: 'POST', body: { workspaceId, name: `${TAG} ${name}`, ...space } })
    const pr = await C('/projects', { method: 'POST', body: { spaceId: sp.data?.id, name: `${TAG} ${name}` } })
    const li = await C('/lists', { method: 'POST', body: { projectId: pr.data?.id, name: `${TAG} ${name}` } })
    const tk = await C('/tasks', { method: 'POST', body: { listId: li.data?.id, title: `${TAG} ${name} plan`, description: `the ${name} plan, word for word`, dueDate: due } })
    if (!tk.ok || !tk.data?.id) throw new Error(`could not make the ${name} task: ${said(sp)} ${said(pr)} ${said(li)} ${said(tk)}`)
    return { id: tk.data.id, url: `/app/${workspaceId}/${sp.data.id}/${pr.data.id}/${li.data.id}?task=${tk.data.id}` }
  }
  const privatePlace = await placeIn(A, WS, 'private', { visibility: 'private' })
  const PRIVATE = privatePlace.id
  const OPEN = (await placeIn(A, WS, 'open')).id
  const kPrivate = await K(`/tasks/${PRIVATE}`)
  const kOpen = await K(`/tasks/${OPEN}`)
  if (kPrivate.status !== 403 || kOpen.status !== 200) throw new Error(`the keeper should be refused the private task and open the open one: ${said(kPrivate)}, ${said(kOpen)}`)

  // The workspace's calendars, staged without a token: Google connected by the keeper, Outlook by the admin;
  // and its Zoom, connected by the keeper.
  await sql`insert into workspace_integration_connections (workspace_id, provider, status, scopes, access_token, metadata, connected_by_id)
            values (${WS}, 'gcal', 'connected', ${sql.array([])}, null, ${sql.json({})}, ${keeper.id}),
                   (${WS}, 'outlook', 'connected', ${sql.array([])}, null, ${sql.json({})}, ${admin.id}),
                   (${WS}, 'zoom', 'connected', ${sql.array([])}, null, ${sql.json({})}, ${keeper.id})`
  const push = (task) => A(`/workspaces/${WS}/calendar-sync/tasks/${task}/push`, { method: 'POST' })
  /** Which calendars a push reached for: each one it chose stops at its missing token. */
  const triedBy = (res) => ['gcal', 'outlook'].filter((p) => (res.data?.skipped ?? []).includes(`${p}:No access token for ${p}`))
  const tried = (res) => `${res.status} tried ${JSON.stringify(triedBy(res))} (${JSON.stringify(res.data ?? res.error?.message ?? null)})`

  // ══ 1. A TASK ITS CONNECTION'S OWNER MAY NOT OPEN ════════════════════════
  console.log('\n▶ the admin pushes a dated task of a private space the keeper is refused')
  const privatePush = await push(PRIVATE)
  chk(
    privatePush.status === 201 && JSON.stringify(triedBy(privatePush)) === JSON.stringify(['outlook']),
    'a dated task in a private space goes only to the calendar of somebody who may open it: the admin’s Outlook is tried, the keeper’s Google Calendar — the keeper is refused the task — is not',
    tried(privatePush),
  )

  // ══ 2. A TASK THEY MAY BOTH OPEN ═════════════════════════════════════════
  console.log('\n▶ the admin pushes a dated task of an open space, which the keeper may open')
  const openPush = await push(OPEN)
  chk(
    openPush.status === 201 && JSON.stringify(triedBy(openPush)) === JSON.stringify(['gcal', 'outlook']),
    'a dated task both may open goes to both calendars: the keeper’s Google Calendar and the admin’s Outlook are each tried',
    tried(openPush),
  )

  // The task's meeting buttons, while the keeper is a member: on the private task, and on the open one.
  const meeting = (task, provider) => A(`/tasks/${task}/meeting`, { method: 'POST', body: { provider } })
  const asked = {}
  for (const provider of ['google_meet', 'zoom']) {
    asked[provider] = { private: await meeting(PRIVATE, provider), open: await meeting(OPEN, provider) }
  }

  // The task sheet's own Google Meet button, pressed by the admin on the private task.
  browser = await chromium.launch(launchOptions())
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ADMIN.email)
  await page.fill('input[type=password]', ADMIN.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
  await page.goto(`${B}${privatePlace.url}`, { waitUntil: 'domcontentloaded' })
  const meetButton = page.getByTestId('task-sheet').getByRole('button', { name: /^Google Meet$/ }).first()
  // Enabled once the sheet has read the workspace's connections.
  await meetButton.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
  const meetEnabled = await waitUntil(() => meetButton.isEnabled().catch(() => false), { timeoutMs: 15_000 })
  await meetButton.scrollIntoViewIfNeeded().catch(() => {})
  await meetButton.click({ timeout: 8000 }).catch(() => {})
  const toldOnSheet = await page.getByText(OWNER_REFUSED.google_meet, { exact: true }).first()
    .waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false)
  const genericOnSheet = await page.getByText('Could not create the meeting', { exact: true }).count().catch(() => 0)

  // ══ 3. THE KEEPER LEAVES ═════════════════════════════════════════════════
  console.log('\n▶ the keeper is removed from the workspace, and the open task pushed again')
  const removed = await A(`/workspaces/${WS}/members/${keeper.id}`, { method: 'DELETE' })
  const [{ n: stillMember }] = await sql`select count(*)::int as n from workspace_members where workspace_id = ${WS} and user_id = ${keeper.id}`
  const afterPush = await push(OPEN)
  const [kept] = await sql`select status, connected_by_id = ${keeper.id} as by_keeper from workspace_integration_connections where workspace_id = ${WS} and provider = 'gcal'`
  chk(
    removed.ok && stillMember === 0 && afterPush.status === 201 && JSON.stringify(triedBy(afterPush)) === JSON.stringify(['outlook'])
      && kept?.status === 'connected' && kept?.by_keeper === true,
    'once the keeper has left the workspace their calendar takes nothing from it — the open task goes to the admin’s Outlook alone — and their connection is kept, not deleted, for an admin to see and remove',
    `removed ${said(removed)} (${stillMember} member rows left); then ${tried(afterPush)}; the connection ${JSON.stringify(kept ?? null)}`,
  )

  // The meeting buttons again, on the open task, now the keeper has left.
  for (const provider of ['google_meet', 'zoom']) asked[provider].after = await meeting(OPEN, provider)
  const meetings = async (provider) =>
    (await sql`select count(*)::int as n from task_external_links where task_id in (${PRIVATE}, ${OPEN}) and kind = 'meeting' and provider = ${provider}`)[0].n
  const answered = (res, words) => res.status === 400 && res.error?.message === words
  const meetingCheck = async (provider) => {
    const a = asked[provider]
    const made = await meetings(provider)
    return {
      ok: answered(a.private, OWNER_REFUSED[provider]) && answered(a.open, CONNECT_FIRST[provider]) && answered(a.after, OWNER_REFUSED[provider]) && made === 0,
      said: `on the private task ${said(a.private)}; on the open task, the keeper a member, ${said(a.open)}; after they left ${said(a.after)}; ${made} meeting links made`,
    }
  }

  // ══ 4. THE TASK'S GOOGLE MEET ════════════════════════════════════════════
  console.log('\n▶ the task’s Google Meet, made in the workspace’s Google Calendar — the keeper’s')
  const meet = await meetingCheck('google_meet')
  chk(
    meet.ok,
    'a task’s Google Meet is not made in the Google Calendar of a connection owner who may not open the task, nor once they have left: refused, 400, saying whose calendar it is — and on a task they may open while a member, the rule lets it through to the token',
    meet.said,
  )

  // ══ 5. THE TASK'S ZOOM ═══════════════════════════════════════════════════
  console.log('\n▶ the task’s Zoom meeting, made in the workspace’s Zoom — the keeper’s')
  const zoom = await meetingCheck('zoom')
  chk(
    zoom.ok,
    'nor its Zoom meeting in the Zoom of such an owner: refused, 400, saying whose Zoom it is — and let through to the token on a task they may open while a member',
    zoom.said,
  )

  // ══ 6. THE TASK SHEET SAYS SO ═════════════════════════════════════════════
  console.log('\n▶ the task sheet’s Google Meet button, pressed on the private task')
  chk(
    meetEnabled && toldOnSheet && genericOnSheet === 0,
    'and the task sheet’s Google Meet button says why, in the server’s words — not that the meeting could not be created',
    `the button enabled: ${meetEnabled}; the server’s words shown: ${toldOnSheet}; "Could not create the meeting" shown ${genericOnSheet} times`,
  )

  // ══ 7. A PLATFORM ADMIN'S CONNECTION, ONCE THEY HAVE LEFT ═════════════════
  // The read rule lets a super_admin through wherever they are, so only the
  // rule's membership half stops their connection once they have left a
  // workspace — the iCal feed's rule, asked of a platform admin too.
  console.log('\n▶ a signed-up owner’s workspace, the platform admin a member with a calendar connected, then removed')
  const ownerEmail = `${TAG}-owner@rundesk.invalid`
  const owner = await signUpApi(API, { fullName: 'Calendar owner', email: ownerEmail, password: 'CalendarPush@12345!', organizationName: `Calendar owner ${stamp}`, organizationSlug: `calendar-owner-${stamp}` })
  O = apiAs(owner.accessToken)
  const made2 = await O('/workspaces', { method: 'POST', body: { name: `${TAG} owner` } })
  if (!made2.ok || !made2.data?.id) throw new Error(`could not make the owner’s workspace: ${said(made2)}`)
  WS2 = made2.data.id
  const joined = await O(`/workspaces/${WS2}/members`, { method: 'POST', body: { email: ADMIN.email, role: 'member' } })
  if (!joined.ok) throw new Error(`could not add the platform admin: ${said(joined)}`)
  const [roles] = await sql`select u.role as account, m.role as workspace from users u join workspace_members m on m.user_id = u.id and m.workspace_id = ${WS2} where u.id = ${admin.id}`
  if (roles?.account !== 'super_admin' || roles?.workspace !== 'member') throw new Error(`the admin account should be a super_admin and a plain member there: ${JSON.stringify(roles)}`)
  const OWNERS = (await placeIn(O, WS2, 'owner open')).id
  await sql`insert into workspace_integration_connections (workspace_id, provider, status, scopes, access_token, metadata, connected_by_id)
            values (${WS2}, 'gcal', 'connected', ${sql.array([])}, null, ${sql.json({})}, ${admin.id})`
  const ownerPush = (task) => O(`/workspaces/${WS2}/calendar-sync/tasks/${task}/push`, { method: 'POST' })
  const whileIn = await ownerPush(OWNERS)
  const left = await O(`/workspaces/${WS2}/members/${admin.id}`, { method: 'DELETE' })
  const [{ n: adminRows }] = await sql`select count(*)::int as n from workspace_members where workspace_id = ${WS2} and user_id = ${admin.id}`
  const whenGone = await ownerPush(OWNERS)
  const [keptAdmin] = await sql`select status, connected_by_id = ${admin.id} as by_admin from workspace_integration_connections where workspace_id = ${WS2} and provider = 'gcal'`
  chk(
    whileIn.status === 201 && JSON.stringify(triedBy(whileIn)) === JSON.stringify(['gcal'])
      && left.ok && adminRows === 0
      && whenGone.status === 201 && JSON.stringify(triedBy(whenGone)) === JSON.stringify([])
      && keptAdmin?.status === 'connected' && keptAdmin?.by_admin === true,
    'a platform admin’s calendar takes a workspace’s task while they are a member of it, and nothing once they have been removed — the read rule would let them in wherever they are, so the membership is asked of them too — and their connection is kept',
    `while a member ${tried(whileIn)}; removed ${said(left)} (${adminRows} member rows left); then ${tried(whenGone)}; the connection ${JSON.stringify(keptAdmin ?? null)}`,
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
  if (WS2 && O) {
    const gone = await O(`/workspaces/${WS2}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${WS2} answered ${gone.status || 'nothing'}`)
  }
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

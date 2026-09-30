/**
 * THE WORKSPACE'S CALENDAR IS PULLED BY THOSE WHO MANAGE ITS INTEGRATIONS, AND
 * BY NOBODY ELSE.
 *
 * NOT A FRAME ROW: `found-25-sep/calendar-pull-for-any-member`, found closing
 * `task-rows-changed-by-id-anywhere`. `POST …/calendar-sync/:provider/pull`
 * asked only for membership: any member, and any guest, set the workspace's
 * calendar connection — an admin's account — to create tasks in its inbox list
 * and overwrite the title, description and dates of every task linked to one
 * of its events. The integrations page offered each of them "Sync now".
 *
 * ClickUp (help centre, "Google Calendar integration", search snippets): the
 * calendar integration is private — no one else in the workspace can reach a
 * person's calendar through it. The workspace's connection here is made and
 * removed under `integrations.manage`; using it asks the same.
 *
 * The provider cannot be reached from a lane, so a pull that is let through
 * ends at the provider's failure, and one that is refused ends at 403 before
 * the connection is used — that difference is what is measured. The inbox is
 * read back by SQL.
 *
 *   node test/e2e/calendar-pull-access.mjs --api 3021 --dist /tmp/claude-0/dist-1
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 3

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

const stamp = Date.now()
const TAG = `cpa${stamp}`
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the connection is staged, and the inbox read back, by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const [admin] = await sql`select id from users where email = ${ADMIN.email}`

  const person = async (key, role) => {
    const email = `${TAG}-${key}@rundesk.invalid`
    const password = 'CalendarPull@12345!'
    const signed = await signUpApi(API, { fullName: `Calendar ${key}`, email, password, organizationName: `Calendar ${key} ${stamp}`, organizationSlug: `calendar-${key}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (!added.ok) throw new Error(`could not add the ${key}: ${said(added)}`)
    const [row] = await sql`select id from users where email = ${email}`
    return { id: row.id, email, password, as: apiAs(signed.accessToken) }
  }
  const member = await person('member', 'member')
  const keeper = await person('keeper', 'member')
  const guest = await person('guest', 'guest')
  // The keeper holds `integrations.manage` through a custom role, before any request of theirs.
  const role = await A(`/workspaces/${WS}/roles`, { method: 'POST', body: { name: `${TAG} integrations`, permissions: ['integrations.manage'] } })
  const keeperRow = ((await A(`/workspaces/${WS}/members`)).data ?? []).find((m) => (m.userId ?? m.user?.id) === keeper.id)
  const granted = keeperRow && role.data?.id
    ? await A(`/workspaces/${WS}/members/${keeperRow.workspaceMemberId}/roles/${role.data.id}`, { method: 'POST', body: {} })
    : { status: 0 }
  if (!granted.ok) throw new Error(`could not grant integrations.manage: ${said(role)} ${said(granted)}`)

  // The workspace's own Google Calendar connection, an inbox list for it, and a token that has not expired.
  const space = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} calendar` } })
  const project = await A('/projects', { method: 'POST', body: { spaceId: space.data?.id, name: `${TAG} calendar` } })
  const inbox = await A('/lists', { method: 'POST', body: { projectId: project.data?.id, name: `${TAG} inbox` } })
  if (!inbox.ok || !inbox.data?.id) throw new Error(`could not make the inbox: ${said(space)} ${said(inbox)}`)
  await sql`insert into workspace_integration_connections
    (workspace_id, provider, status, scopes, external_account_email, access_token, refresh_token, token_expires_at, metadata, connected_by_id)
    values (${WS}, 'gcal', 'connected', ${sql.array([])}, ${`${TAG}@calendar.invalid`}, 'staged-token', 'staged-refresh',
            ${new Date(Date.now() + 3_600_000)}, ${sql.json({ inboxListId: inbox.data.id })}, ${admin.id})`
  const inboxTasks = async () => (await sql`select count(*)::int as n from tasks where list_id = ${inbox.data.id}`)[0].n
  const pull = (who) => who(`/workspaces/${WS}/calendar-sync/gcal/pull`, { method: 'POST' })
  // Let through, a pull reaches for the calendar, which no lane can reach: the provider's failure.
  const reached = (res) => res.status >= 500

  // ══ 1. WHO IS REFUSED ════════════════════════════════════════════════════
  console.log('\n▶ a pull of the workspace’s Google Calendar, by a member and by a guest')
  const byMember = await pull(member.as)
  const byGuest = await pull(guest.as)
  const madeByThem = await inboxTasks()
  chk(
    byMember.status === 403 && byGuest.status === 403 && madeByThem === 0,
    'a member who may not manage the workspace’s integrations, and a guest, pull nothing from its calendar — refused (403) before the connection is used, nothing made in its inbox',
    `member ${said(byMember)}; guest ${said(byGuest)}; ${madeByThem} made in the inbox`,
  )

  // ══ 2. WHO IS LET THROUGH ════════════════════════════════════════════════
  console.log('\n▶ the same pull, by a member granted integrations.manage, and by the admin')
  const byKeeper = await pull(keeper.as)
  const byAdmin = await pull(A)
  chk(
    reached(byKeeper) && reached(byAdmin),
    'a member granted integrations.manage, and the admin, are let through to the calendar — here, where it cannot be reached, to the provider’s failure rather than a refusal',
    `keeper ${said(byKeeper)}; admin ${said(byAdmin)}`,
  )

  // ══ 3. THE PAGE ══════════════════════════════════════════════════════════
  console.log('\n▶ the integrations page’s Calendar sync, for the member and for the keeper')
  browser = await (await resolveChromium()).launch(launchOptions())
  const syncNowFor = async (who) => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } })
    const page = await ctx.newPage()
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', who.email)
    await page.fill('input[type=password]', who.password)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
    await page.goto(`${B}/app/${WS}/integrations`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('integrations-calendar-sync').click({ timeout: 20_000 }).catch(() => {})
    const dialog = page.getByRole('dialog')
    // The row says whose calendar it is before anything else is read.
    const connected = await dialog.getByText(`${TAG}@calendar.invalid`, { exact: false }).first()
      .waitFor({ state: 'visible', timeout: 20_000 }).then(() => true, () => false)
    await page.waitForTimeout(1500)
    const offered = await dialog.getByRole('button', { name: /^Sync now$/ }).count().catch(() => -1)
    await ctx.close().catch(() => {})
    return { connected, offered }
  }
  const memberSees = await syncNowFor(member)
  const keeperSees = await syncNowFor(keeper)
  chk(
    memberSees.connected && memberSees.offered === 0 && keeperSees.connected && keeperSees.offered === 1,
    'the Calendar sync dialog shows the member the connected calendar without offering them Sync now — and offers it to the member who manages integrations',
    `member ${JSON.stringify(memberSees)}; keeper ${JSON.stringify(keeperSees)}`,
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

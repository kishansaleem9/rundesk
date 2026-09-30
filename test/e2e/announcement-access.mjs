/**
 * THE WORKSPACE'S ANNOUNCEMENTS — THE BANNER PINNED ACROSS IT — ARE PUBLISHED,
 * PAUSED, DELETED AND LISTED IN FULL BY WHOEVER HOLDS `announcement.manage`,
 * AN ADMIN'S BY DEFAULT AND GRANTABLE. THE LIVE BANNER IS READ BY EVERY MEMBER.
 *
 * NOT A FRAME ROW: `found-25-sep/admin-guard-admits-managers-where-the-web-says-admin`,
 * its announcements slice. Publishing, editing, deleting and the full list
 * (paused ones, views and dismissals) stood behind `WorkspaceAdminGuard`, which
 * admits managers, while the web offered them nowhere but the platform console
 * (`/app/admin/announcements`, super admins alone): no workspace admin had a
 * page for them, a manager could do by the API what no page offered, and no key
 * could hand them to anyone.
 *
 * ClickUp has no workspace banner. Its nearest is a Chat Post of the
 * "Announcement" type (help centre "Create a Post": the default post type is
 * Announcement) and @everyone in a Channel ("Use @mentions"). Posting
 * permissions are ClickUp's still-coming control: its Chat feedback board
 * ("Restricting Posting in Channels") says the general Workspace Chat is being
 * restricted to members, admins and the owner, with posting permissions for any
 * Chat "soon", asked for so that "only higher-ups" speak in announcement
 * channels. Nothing there is a manager's. So the banner, which reaches every
 * page of every member and cannot be muted per channel, is a key of its own, an
 * admin's by default: a manager does not publish, and a member granted it does.
 *
 *   node test/e2e/announcement-access.mjs --api 3024 --dist /tmp/claude-0/dist-4
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
const TAG = `ann${stamp}`
const PASSWORD = 'Announcement@12345!'
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
  if (!sql) throw new Error('no DATABASE_URL — what is saved is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id

  const person = async (key, role, keys = []) => {
    const email = `${TAG}-${key}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `Announce ${key}`, email, password: PASSWORD, organizationName: `Announce ${key} ${stamp}`, organizationSlug: `announce-${key}-${stamp}` })
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
    return { email, password: PASSWORD, granted, as: apiAs(signed.accessToken) }
  }
  const admin = await person('admin', 'workspace_admin')
  const manager = await person('manager', 'manager')
  const member = await person('member', 'member')
  const announcer = await person('announcer', 'member', ['announcement.manage'])

  // The platform's super admin publishes the fixtures: one live banner nobody else touches, one
  // paused, one for the manager and the plain member to try their hands on, one for the announcer.
  const publish = async (title, extra = {}) => {
    const r = await A(`/workspaces/${WS}/announcements`, { method: 'POST', body: { title, body: `${title} body`, tone: 'info', ...extra } })
    if (!ok(r) || !r.data?.id) throw new Error(`could not publish "${title}": ${said(r)}`)
    return r.data
  }
  const live = await publish(`${TAG} live`)
  const paused = await publish(`${TAG} paused`, { isActive: false })
  const target = await publish(`${TAG} not theirs`)
  const editable = await publish(`${TAG} for the announcer`)
  const rowOf = async (id) => (await sql`select is_active, title from announcements where id = ${id}`)[0] ?? null
  const titled = async (title) => (await sql`select count(*)::int as n from announcements where workspace_id = ${WS} and title = ${title}`)[0].n

  // ══ 1. PUBLISHING ════════════════════════════════════════════════════════
  console.log('\n▶ publishing: the manager, the plain member, the member granted announcement.manage, the workspace admin')
  const publishAs = async (who, key) => {
    const title = `${TAG} by the ${key}`
    const r = await who(`/workspaces/${WS}/announcements`, { method: 'POST', body: { title, body: 'hello', tone: 'celebrate' } })
    return { status: r.status, ok: r.ok, saved: await titled(title) }
  }
  const managerPublishes = await publishAs(manager.as, 'manager')
  const memberPublishes = await publishAs(member.as, 'member')
  const announcerPublishes = await publishAs(announcer.as, 'announcer')
  const adminPublishes = await publishAs(admin.as, 'admin')
  chk(
    managerPublishes.status === 403 && managerPublishes.saved === 0
      && memberPublishes.status === 403 && memberPublishes.saved === 0
      && announcer.granted && announcerPublishes.ok && announcerPublishes.saved === 1
      && adminPublishes.ok && adminPublishes.saved === 1,
    'publishing a workspace announcement is refused to a manager and to a plain member (403 each, nothing saved) — the member granted announcement.manage publishes one, and so does a workspace admin',
    `manager ${JSON.stringify(managerPublishes)}; member ${JSON.stringify(memberPublishes)}; announcer ${announcer.granted ? JSON.stringify(announcerPublishes) : 'NOT GRANTED'}; admin ${JSON.stringify(adminPublishes)}`,
  )

  // ══ 2. PAUSING (EDITING) ═════════════════════════════════════════════════
  console.log('\n▶ pausing somebody else’s announcement: the manager, the plain member, the announcer')
  const managerPauses = await manager.as(`/workspaces/${WS}/announcements/${target.id}`, { method: 'PATCH', body: { isActive: false, title: `${TAG} renamed by the manager` } })
  const memberPauses = await member.as(`/workspaces/${WS}/announcements/${target.id}`, { method: 'PATCH', body: { isActive: false } })
  const targetAfterPauses = await rowOf(target.id)
  const announcerPauses = await announcer.as(`/workspaces/${WS}/announcements/${editable.id}`, { method: 'PATCH', body: { isActive: false } })
  const editableAfterPause = await rowOf(editable.id)
  chk(
    managerPauses.status === 403 && memberPauses.status === 403
      && targetAfterPauses?.is_active === true && targetAfterPauses?.title === target.title
      && announcer.granted && ok(announcerPauses) && editableAfterPause?.is_active === false,
    'a manager and a plain member can neither pause nor rename another’s announcement (403 each, it stays live and named) — the member granted announcement.manage pauses one',
    `manager ${said(managerPauses)}; member ${said(memberPauses)}; target now ${JSON.stringify(targetAfterPauses)}; announcer ${announcer.granted ? `${said(announcerPauses)}, now ${JSON.stringify(editableAfterPause)}` : 'NOT GRANTED'}`,
  )

  // ══ 3. DELETING ══════════════════════════════════════════════════════════
  console.log('\n▶ deleting somebody else’s announcement: the manager, the plain member, the announcer')
  const managerDeletes = await manager.as(`/workspaces/${WS}/announcements/${target.id}`, { method: 'DELETE' })
  const memberDeletes = await member.as(`/workspaces/${WS}/announcements/${target.id}`, { method: 'DELETE' })
  const targetAfterDeletes = await rowOf(target.id)
  const announcerDeletes = await announcer.as(`/workspaces/${WS}/announcements/${editable.id}`, { method: 'DELETE' })
  const editableAfterDelete = await rowOf(editable.id)
  chk(
    managerDeletes.status === 403 && memberDeletes.status === 403 && targetAfterDeletes !== null
      && announcer.granted && ok(announcerDeletes) && editableAfterDelete === null,
    'a manager and a plain member delete no announcement (403 each, the row stays) — the member granted announcement.manage deletes one, and it is gone',
    `manager ${said(managerDeletes)}; member ${said(memberDeletes)}; target ${targetAfterDeletes ? 'still there' : 'GONE'}; announcer ${announcer.granted ? `${said(announcerDeletes)}, ${editableAfterDelete ? 'still there' : 'gone'}` : 'NOT GRANTED'}`,
  )

  // ══ 4. THE FULL LIST ═════════════════════════════════════════════════════
  // Paused ones, and each one's views and dismissals: what the managing page reads, no one else.
  console.log('\n▶ the full list, paused ones and counts included: the manager, the plain member, the announcer')
  const managerLists = await manager.as(`/workspaces/${WS}/announcements`)
  const memberLists = await member.as(`/workspaces/${WS}/announcements`)
  const announcerLists = await announcer.as(`/workspaces/${WS}/announcements`)
  const holdsPaused = Array.isArray(announcerLists.data) && announcerLists.data.some((a) => a.id === paused.id && a.isActive === false && typeof a.views === 'number')
  chk(
    managerLists.status === 403 && memberLists.status === 403 && announcer.granted && announcerLists.status === 200 && holdsPaused,
    'the full list of announcements, paused ones and their view counts included, is refused to a manager and a plain member (403) — the member granted announcement.manage reads it, the paused one with it',
    `manager ${said(managerLists)}; member ${said(memberLists)}; announcer ${announcer.granted ? `${said(announcerLists)}, paused one ${holdsPaused ? 'listed' : 'MISSING'}` : 'NOT GRANTED'}`,
  )

  // ══ 5. THE LIVE BANNER, READ BY EVERYBODY ════════════════════════════════
  // Every page of the workspace home and the planner's What's new read `announcements/active`:
  // it must stay open to every member, with the paused one kept out.
  console.log('\n▶ the live banner: read by the plain member, the manager and the announcer; dismissed by the manager')
  const activeFor = async (who) => {
    const r = await who(`/workspaces/${WS}/announcements/active`)
    const ids = Array.isArray(r.data) ? r.data.map((a) => a.id) : []
    return { status: r.status, live: ids.includes(live.id), paused: ids.includes(paused.id) }
  }
  const reads = { member: await activeFor(member.as), manager: await activeFor(manager.as), announcer: await activeFor(announcer.as) }
  const dismissed = await manager.as(`/workspaces/${WS}/announcements/${live.id}/dismiss`, { method: 'POST' })
  const afterDismiss = { manager: await activeFor(manager.as), member: await activeFor(member.as) }
  chk(
    Object.values(reads).every((x) => x.status === 200 && x.live && !x.paused)
      && ok(dismissed) && !afterDismiss.manager.live && afterDismiss.member.live,
    'every member reads the live banner — the plain member, the manager and the granted member get it (200), never the paused one — and a dismissal hides it for the one who dismissed it alone',
    `reads ${JSON.stringify(reads)}; manager dismisses ${said(dismissed)}; then ${JSON.stringify(afterDismiss)}`,
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
  const where = (page) => new URL(page.url()).pathname + new URL(page.url()).search
  const announcementsTab = async (page) => {
    await waitUntil(async () => (await page.locator('[data-testid^="settings-tab-"]').count()) > 0 || !page.url().includes('/settings'), { timeoutMs: 15_000 })
    await waitUntil(async () => (await page.getByRole('button', { name: /^Publish$/ }).count()) > 0, { timeoutMs: 5000 })
    await waitUntil(async () => (await page.getByText(paused.title, { exact: true }).count()) > 0, { timeoutMs: 3000 })
    return {
      url: where(page),
      tab: await page.getByTestId('settings-tab-announcements').count(),
      publish: await page.getByRole('button', { name: /^Publish$/ }).count(),
      pausedListed: await page.getByText(paused.title, { exact: true }).count(),
    }
  }

  console.log('\n▶ Settings › Announcements, for the announcer and for the workspace admin')
  const announcerSees = await pageAs(announcer, `/app/${WS}/settings?tab=announcements`, announcementsTab)
  const adminSees = await pageAs(admin, `/app/${WS}/settings?tab=announcements`, announcementsTab)
  const offered = (x) => x.url.includes('tab=announcements') && x.tab === 1 && x.publish === 1 && x.pausedListed >= 1
  chk(
    offered(announcerSees) && offered(adminSees),
    'workspace Settings offers an Announcements tab — Publish, and the list with the paused one — to the member granted announcement.manage and to a workspace admin who is no platform admin',
    `announcer ${JSON.stringify(announcerSees)}; admin ${JSON.stringify(adminSees)}`,
  )

  console.log('\n▶ Settings › Announcements and the platform console, for the manager')
  const managerSettings = await pageAs(manager, `/app/${WS}/settings?tab=announcements`, async (page) => {
    await waitUntil(async () => (await page.locator('[data-testid^="settings-tab-"]').count()) > 0 || !page.url().includes('/settings'), { timeoutMs: 15_000 })
    await page.waitForTimeout(800)
    return {
      url: where(page),
      tab: await page.getByTestId('settings-tab-announcements').count(),
      publish: await page.getByRole('button', { name: /^Publish$/ }).count(),
    }
  })
  const managerConsole = await pageAs(manager, '/app/admin/announcements', async (page) => {
    await waitUntil(async () => !page.url().includes('/app/admin'), { timeoutMs: 10_000 })
    await page.waitForTimeout(500)
    return { url: where(page), publish: await page.getByRole('button', { name: /^Publish$/ }).count() }
  })
  chk(
    !managerSettings.url.includes('tab=announcements') && managerSettings.tab === 0 && managerSettings.publish === 0
      && !managerConsole.url.includes('/app/admin') && managerConsole.publish === 0,
    'the manager is offered no Announcements tab and no Publish — Settings takes them to a tab of theirs instead — and the platform console turns them away',
    `settings ${JSON.stringify(managerSettings)}; console ${JSON.stringify(managerConsole)}`,
  )

  // ══ 8. THE BANNER ON THE HOME PAGE ═══════════════════════════════════════
  console.log('\n▶ the workspace home, for the plain member: the newest live banner and its Dismiss')
  const newest = (await member.as(`/workspaces/${WS}/announcements/active`)).data?.[0] ?? null
  const memberHome = await pageAs(member, `/app/${WS}`, async (page) => {
    if (newest) await waitUntil(async () => (await page.getByText(newest.title, { exact: true }).count()) > 0, { timeoutMs: 15_000 })
    return {
      banner: newest ? await page.getByText(newest.title, { exact: true }).count() : 0,
      dismiss: await page.getByRole('button', { name: /^Dismiss$/ }).count(),
      paused: await page.getByText(paused.title, { exact: true }).count(),
    }
  })
  chk(
    newest !== null && memberHome.banner >= 1 && memberHome.dismiss >= 1 && memberHome.paused === 0,
    'the plain member’s workspace home shows the newest live banner with its Dismiss, and never the paused one',
    `newest ${newest ? JSON.stringify(newest.title) : 'NONE'}; home ${JSON.stringify(memberHome)}`,
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

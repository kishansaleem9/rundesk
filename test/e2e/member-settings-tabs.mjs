/**
 * EVERY MEMBER OPENS THE TRASH AND RESTORES WHAT THEY DELETED — ONLY AN ADMIN
 * IS OFFERED DELETING FOR GOOD OR EMPTYING IT — AND SEES WHICH CLICKAPPS ARE
 * ON, WITHOUT THE SWITCHES.
 *
 * NOT A FRAME ROW: `found-28-sep/members-have-no-trash-to-open`, found closing
 * `trash-deletes-for-good-wider-than-clickup`. The API lists a member their
 * own deletions and restores them, but Settings → Trash opened to admins
 * alone, so a member who deleted a list had no way back. And the tab offered
 * Empty trash to a manager, whom the API refuses since that item.
 *
 * And `found-28-sep/members-see-no-clickapps-list`: Features opened to the
 * holders of `workspace.clickapps.manage` alone, so a member learned a ClickApp
 * was off only when its page was missing.
 *
 * ClickUp (help centre "Restore items from the Trash", search snippet): "The
 * Workspace owner and admins can see, restore, or permanently delete any
 * public items. Members and guests can only see and restore items they have
 * deleted." And "Members can view, but not activate or deactivate ClickApps."
 * Guests stay out of Settings here, as they are out of Archived.
 *
 * And `found-28-sep/settings-blank-on-a-slow-permission-read`, found by the
 * flaky-suite work: with the permission read held back 4.5 s, Settings went
 * blank for a non-admin on every load (6 of 6), a late redirect escaping the
 * router. The last section holds the read back and asks for the tabs anyway.
 *
 *   node test/e2e/member-settings-tabs.mjs --api 3027 --dist /tmp/claude-0/dist-7
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

const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `mtr${stamp}`
const PASSWORD = 'MemberTrash@12345!'
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
  if (!sql) throw new Error('no DATABASE_URL — what a restore brings back is read by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id

  const person = async (key, role) => {
    const email = `${TAG}-${key}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `Trash ${key}`, email, password: PASSWORD, organizationName: `Trash ${key} ${stamp}`, organizationSlug: `trash-${key}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (!added.ok) throw new Error(`could not add the ${key}: ${said(added)}`)
    return { key, id: signed.user?.id, email, as: apiAs(signed.accessToken) }
  }
  const member = await person('member', 'member')
  const manager = await person('manager', 'manager')
  const guest = await person('guest', 'guest')

  const space = (await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} space` } })).data?.id
  const project = (await A('/projects', { method: 'POST', body: { spaceId: space, name: `${TAG} project` } })).data?.id
  const listOf = async (who, name) => (await who('/lists', { method: 'POST', body: { projectId: project, name: `${TAG} ${name}` } })).data?.id
  const mine = await listOf(member.as, 'the member’s list')
  const theirs = await listOf(A, 'the admin’s list')
  const managers = await listOf(manager.as, 'the manager’s list')
  if (!space || !project || !mine || !theirs || !managers) throw new Error('could not stage the lists')
  const gone = [
    await member.as(`/lists/${mine}`, { method: 'DELETE' }),
    await A(`/lists/${theirs}`, { method: 'DELETE' }),
    await manager.as(`/lists/${managers}`, { method: 'DELETE' }),
  ]
  if (gone.some((r) => !r.ok)) throw new Error(`could not delete the lists: ${gone.map(said).join(', ')}`)
  const archived = async (id) => (await sql`select is_archived from lists where id = ${id}`)[0]?.is_archived === true

  const chromium = await resolveChromium()
  browser = await chromium.launch(launchOptions())
  const pageAs = async (email, password) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
    const page = await ctx.newPage()
    page.on('dialog', (dlg) => void dlg.accept())
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', email)
    await page.fill('input[type=password]', password)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await page.goto(`${B}/app/${WS}/settings?tab=trash`, { waitUntil: 'domcontentloaded' })
    // The tab rail is drawn once the keys are read; the Trash rows once its list is.
    await waitUntil(() => page.getByTestId('settings-tab-archived').isVisible().catch(() => false), { timeoutMs: 15_000 })
    return page
  }
  const rowOf = (page, id) => page.getByTestId(`trash-actions-list-${id}`)
  /*
   * A Radix menu marks the rest of the page aria-hidden while it is open, so a
   * button read by role with a menu still closing is not found at all — which
   * reads as "not offered". Every read below waits for no menu to be open.
   */
  const menusClosed = (page) => waitUntil(async () => (await page.getByRole('menu').count()) === 0, { timeoutMs: 5000 })
  const openRow = async (page, id) => {
    await menusClosed(page)
    await rowOf(page, id).click({ timeout: 8000 }).catch(() => {})
    return waitUntil(() => page.getByRole('menu').first().isVisible().catch(() => false), { timeoutMs: 5000 })
  }
  /** Open a row's menu and answer which of its actions are offered. */
  const rowActions = async (page, id) => {
    const opened = await openRow(page, id)
    const restore = opened && (await page.getByTestId(`trash-restore-list-${id}`).count()) > 0
    const forever = opened && (await page.getByTestId(`trash-delete-forever-list-${id}`).count()) > 0
    await page.keyboard.press('Escape').catch(() => {})
    await menusClosed(page)
    return { opened, restore, forever }
  }
  const emptyOffered = async (page) => {
    await menusClosed(page)
    return (await page.getByRole('button', { name: /^(Empty trash|Emptying…)$/i }).count()) > 0
  }
  const deletedByOffered = async (page) => {
    await menusClosed(page)
    return (await page.getByRole('button', { name: /^Deleted by/i }).count()) > 0
  }

  // ══ 1. THE MEMBER OPENS THE TRASH, AND SEES THEIR OWN ════════════════════
  console.log('\n▶ a plain member')
  const mp = await pageAs(member.email, PASSWORD)
  const tab = (await mp.getByTestId('settings-tab-trash').count()) > 0
  const ownRow = await waitUntil(() => rowOf(mp, mine).isVisible().catch(() => false), { timeoutMs: 15_000 })
  const othersRows = (await rowOf(mp, theirs).count()) + (await rowOf(mp, managers).count())
  chk(
    tab && ownRow && othersRows === 0,
    'a plain member opens Settings → Trash and finds the list they deleted there, and nothing anybody else deleted',
    `tab ${tab}; their own row ${ownRow}; others’ rows ${othersRows}`,
  )

  // ══ 2. AND RESTORES IT, AND IS OFFERED NOTHING PERMANENT ═════════════════
  const m = ownRow ? await rowActions(mp, mine) : { opened: false, restore: false, forever: false }
  const mEmpty = await emptyOffered(mp)
  const mBy = await deletedByOffered(mp)
  chk(
    m.opened && m.restore && !m.forever && !mEmpty && !mBy,
    'the member is offered Restore on their row, and no Delete forever, no Empty trash and no Deleted-by filter',
    `${JSON.stringify(m)}; empty ${mEmpty}; deleted-by ${mBy}`,
  )
  if (m.restore && (await openRow(mp, mine))) {
    await mp.getByTestId(`trash-restore-list-${mine}`).click({ timeout: 8000 }).catch(() => {})
  }
  const back = await waitUntil(async () => !(await archived(mine)), { timeoutMs: 10_000 })
  const leftTab = back && (await waitUntil(async () => (await rowOf(mp, mine).count()) === 0, { timeoutMs: 10_000 }))
  chk(
    back && leftTab,
    'restoring it from the Trash brings the list back, and it leaves the Trash',
    `restored ${back}; left the tab ${leftTab}`,
  )

  // ══ 3. A MANAGER IS A MEMBER HERE ════════════════════════════════════════
  console.log('\n▶ a manager, and the admin')
  const gp = await pageAs(manager.email, PASSWORD)
  const gRow = await waitUntil(() => rowOf(gp, managers).isVisible().catch(() => false), { timeoutMs: 15_000 })
  const g = gRow ? await rowActions(gp, managers) : { opened: false, restore: false, forever: false }
  const gEmpty = await emptyOffered(gp)
  const ap = await pageAs(ADMIN.email, ADMIN.password)
  const aRow = await waitUntil(() => rowOf(ap, theirs).isVisible().catch(() => false), { timeoutMs: 15_000 })
  const a = aRow ? await rowActions(ap, theirs) : { opened: false, restore: false, forever: false }
  const aEmpty = await emptyOffered(ap)
  chk(
    gRow && g.opened && g.restore && !g.forever && !gEmpty && aRow && a.restore && a.forever && aEmpty,
    'a manager restores what they deleted and is offered neither Delete forever nor Empty trash, which the API refuses them — the admin is offered all three',
    `manager ${JSON.stringify({ row: gRow, ...g, empty: gEmpty })}; admin ${JSON.stringify({ row: aRow, ...a, empty: aEmpty })}`,
  )

  // ══ 4. FEATURES, READ-ONLY ═══════════════════════════════════════════════
  console.log('\n▶ Features, for the member and the admin')
  const liveSwitches = (page) => page.getByRole('switch').evaluateAll((els) => els.filter((e) => !e.disabled).length)
  const switchesOn = async (page, expectLive) => {
    await page.goto(`${B}/app/${WS}/settings?tab=features`, { waitUntil: 'domcontentloaded' })
    const drawn = await waitUntil(async () => (await page.getByRole('switch').count()) >= 5, { timeoutMs: 15_000 })
    // The switches are disabled while the flags load: read once they have settled.
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
    if (expectLive) await waitUntil(async () => (await liveSwitches(page)) === (await page.getByRole('switch').count()), { timeoutMs: 8000 })
    const n = await page.getByRole('switch').count()
    const live = await liveSwitches(page)
    const reason = (await page.getByText(/can change these settings/i).count()) > 0
    return { tab: (await page.getByTestId('settings-tab-features').count()) > 0, drawn, switches: n, live, reason }
  }
  const mf = await switchesOn(mp, false)
  const af = await switchesOn(ap, true)
  chk(
    mf.tab && mf.drawn && mf.live === 0 && mf.reason && af.tab && af.live === af.switches && af.switches > 0,
    'a plain member opens Features and sees which ClickApps are on, every switch disabled with the reason said — the admin’s switches are live',
    `member ${JSON.stringify(mf)}; admin ${JSON.stringify(af)}`,
  )

  // ══ 5. A SLOW PERMISSION READ ════════════════════════════════════════════
  console.log('\n▶ the member again, with the permission read held back 4.5 s')
  const HOLD_MS = 4500
  const slow = []
  for (let i = 0; i < 3; i += 1) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
    const page = await ctx.newPage()
    const thrown = []
    page.on('pageerror', (e) => thrown.push(String(e?.message ?? e)))
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', member.email)
    await page.fill('input[type=password]', PASSWORD)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await page.route('**/roles/me/permissions', async (route) => {
      await new Promise((r) => setTimeout(r, HOLD_MS))
      await route.continue().catch(() => {})
    })
    await page.goto(`${B}/app/${WS}/settings`, { waitUntil: 'domcontentloaded' })
    // The answer is held back 4.5 s; the tabs are asked for well past it.
    await waitUntil(async () => new URL(page.url()).searchParams.get('tab') === 'archived'
      && (await page.getByTestId('settings-tab-trash').count()) > 0, { timeoutMs: HOLD_MS + 10_000 })
    const body = (await page.evaluate(() => document.body.innerText).catch(() => '')).trim()
    slow.push({
      tab: new URL(page.url()).searchParams.get('tab'),
      tabs: await page.locator('[data-testid^="settings-tab-"]').count(),
      body: body.length,
      thrown: thrown.length,
    })
    await ctx.close().catch(() => {})
  }
  chk(
    slow.every((r) => r.tab === 'archived' && r.tabs === 3 && r.body > 0 && r.thrown === 0),
    'with the permission read held back 4.5 s, a plain member opening Settings lands on Archived with their three tabs every time, three of three, and nothing throws — the page does not go blank',
    JSON.stringify(slow),
  )

  // ══ 6. A GUEST ═══════════════════════════════════════════════════════════
  console.log('\n▶ a guest')
  const qp = await (async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
    const page = await ctx.newPage()
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', guest.email)
    await page.fill('input[type=password]', PASSWORD)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await page.goto(`${B}/app/${WS}/settings?tab=trash`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
    return page
  })()
  const guestTab = (await qp.getByTestId('settings-tab-trash').count()) + (await qp.getByTestId('settings-tab-features').count()) > 0
  chk(
    !guestTab,
    'a guest is offered no Trash or Features tab, as they are offered no Archived',
    `a tab offered ${guestTab}`,
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

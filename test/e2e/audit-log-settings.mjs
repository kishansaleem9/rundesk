/**
 * A WORKSPACE'S AUDIT LOG IS READ IN ITS OWN SETTINGS, BY WHOEVER HOLDS
 * `workspace.audit.view`.
 *
 * NOT A FRAME ROW: `found-24-sep/workspace-audit-log-not-in-settings`, found
 * fixing the console's audit log. `GET /workspaces/:id/audit-logs` answered a
 * workspace's admins, and the only page that read it was the platform
 * console's, which lets in a super admin alone: a workspace admin had a route
 * and no page.
 *
 * ClickUp ("Workspace audit logs"): generated in the Workspace's Settings,
 * each event with its date, user, role, event and status, filtered by user,
 * event type and date. Here the tab is `workspace.audit.view`'s — an admin's
 * by default, and a custom role's where one grants it.
 *
 *   node test/e2e/audit-log-settings.mjs --api 3027 --dist /tmp/claude-0/dist-7
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 4

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
const TAG = `als${stamp}`
const PASSWORD = 'AuditLog@12345!'
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
let WS = null
let OTHER = null
let A = null
let browser = null

try {
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const workspace = async (name) => {
    const made = await A('/workspaces', { method: 'POST', body: { name } })
    if (!made.ok || !made.data?.id) throw new Error(`could not make ${name}: ${said(made)}`)
    return made.data.id
  }
  WS = await workspace(TAG)
  OTHER = await workspace(`${TAG} other`)
  const person = async (key, role, keys = []) => {
    const email = `${TAG}-${key}@rundesk.invalid`
    await signUpApi(API, { fullName: `Audit ${key}`, email, password: PASSWORD, organizationName: `Audit ${key} ${stamp}`, organizationSlug: `audit-${key}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (!added.ok) throw new Error(`could not add the ${key}: ${said(added)}`)
    if (keys.length) {
      const members = (await A(`/workspaces/${WS}/members`)).data ?? []
      const row = members.find((m) => (m.email ?? m.user?.email) === email)
      const r = await A(`/workspaces/${WS}/roles`, { method: 'POST', body: { name: `${TAG} ${key}`, permissions: keys } })
      const given = row && r.data?.id ? await A(`/workspaces/${WS}/members/${row.workspaceMemberId}/roles/${r.data.id}`, { method: 'POST', body: {} }) : { status: 0 }
      if (given.status === 0 || given.status >= 300) throw new Error(`could not grant the ${key} ${keys.join(', ')}: ${said(r)} ${said(given)}`)
    }
    return { email, password: PASSWORD }
  }
  const admin = await person('admin', 'workspace_admin')
  const auditor = await person('auditor', 'member', ['workspace.audit.view'])
  const member = await person('member', 'member')

  // An event in each workspace, by title, so each trail can be told from the other.
  const OURS = `${TAG} ours`
  const THEIRS = `${TAG} theirs`
  for (const [ws, title] of [[WS, OURS], [OTHER, THEIRS]]) {
    const r = await A(`/workspaces/${ws}/announcements`, { method: 'POST', body: { title } })
    if (!r.ok) throw new Error(`could not record an event in a workspace: ${said(r)}`)
  }

  browser = await (await resolveChromium()).launch(launchOptions())
  const settingsAs = async (who) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, serviceWorkers: 'block' })
    const page = await ctx.newPage()
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', who.email)
    await page.fill('input[type=password]', who.password)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
    await page.goto(`${B}/app/${WS}/settings?tab=auditLog`, { waitUntil: 'domcontentloaded' })
    // Settings has decided once its rail is drawn.
    await waitUntil(async () => (await page.locator('[data-testid^="settings-tab-"]').count()) > 0, { timeoutMs: 20_000 })
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
    return page
  }
  /** What the Audit log tab shows this reader: the tab, and which of the two events it lists. */
  const trail = async (page) => {
    const tab = await page.getByTestId('settings-tab-auditLog').count()
    const listed = tab ? await waitUntil(() => page.getByText(`Created announcement "${OURS}"`).first().isVisible().catch(() => false), { timeoutMs: 15_000 }) : false
    return {
      tab,
      ours: listed,
      theirs: await page.getByText(`Created announcement "${THEIRS}"`).count(),
      url: new URL(page.url()).search,
    }
  }

  // ══ 1. A WORKSPACE ADMIN WHO IS NO PLATFORM ADMIN ════════════════════════
  console.log('\n▶ the workspace admin opens Settings › Audit log')
  const ap = await settingsAs(admin)
  const adminSees = await trail(ap)
  chk(
    adminSees.tab === 1 && adminSees.ours && adminSees.theirs === 0,
    'a workspace admin who is no platform admin reads the workspace’s audit log in its own Settings — its events, and none of another workspace’s',
    JSON.stringify(adminSees),
  )

  // ══ 2. THE EXPORT FROM THERE ═════════════════════════════════════════════
  console.log('\n▶ Export CSV from the tab')
  const answers = []
  ap.on('response', (r) => { if (r.url().includes(`/workspaces/${WS}/audit-logs/export`)) answers.push(r.status()) })
  await ap.getByRole('button', { name: /Export CSV/i }).click({ timeout: 5000 }).catch(() => {})
  await waitUntil(async () => answers.length > 0, { timeoutMs: 10_000 })
  chk(
    answers.includes(200),
    'its Export CSV downloads the workspace’s trail (200)',
    `export answered ${JSON.stringify(answers)}`,
  )
  await ap.context().close().catch(() => {})

  // ══ 3. A MEMBER GRANTED THE KEY ══════════════════════════════════════════
  console.log('\n▶ a member granted workspace.audit.view')
  const gp = await settingsAs(auditor)
  const auditorSees = await trail(gp)
  chk(
    auditorSees.tab === 1 && auditorSees.ours && auditorSees.theirs === 0,
    'a member granted workspace.audit.view by a custom role is offered the Audit log tab and reads the workspace’s events',
    JSON.stringify(auditorSees),
  )
  await gp.context().close().catch(() => {})

  // ══ 4. A PLAIN MEMBER ════════════════════════════════════════════════════
  console.log('\n▶ a plain member')
  const mp = await settingsAs(member)
  const memberSees = await trail(mp)
  const memberRoute = await apiAs((await signInApi(API, member.email, PASSWORD)).accessToken)(`/workspaces/${WS}/audit-logs`)
  chk(
    memberSees.tab === 0 && !memberSees.ours && !memberSees.url.includes('auditLog') && memberRoute.status === 403,
    'a plain member is offered no Audit log tab, is taken to a tab of theirs from its address, and the trail answers them 403',
    `${JSON.stringify(memberSees)}; the route ${said(memberRoute)}`,
  )
  await mp.context().close().catch(() => {})
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  for (const ws of [WS, OTHER]) {
    if (!ws || !A) continue
    const gone = await A(`/workspaces/${ws}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${ws} answered ${gone.status || 'nothing'}`)
  }
  // Only now: the DELETEs above go through this proxy, and a closed one refuses them.
  stack.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}

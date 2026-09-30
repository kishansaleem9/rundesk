/**
 * THE WORKSPACE'S OWN SETTINGS, ITS AUDIT LOG, ITS SECURITY AND ITS AUTOMATIONS
 * ASK THE KEY THE ROLE EDITOR NAMES FOR EACH.
 *
 * NOT A FRAME ROW: `role-editor-offers-unenforced-permissions`, its second
 * group. `WorkspaceAdminGuard` admits managers, and these routes asked nothing
 * past it: a manager renamed and archived the workspace, read and exported its
 * audit log, changed its security policy and made API keys, and made
 * automations — where the permission catalog, and the web, give each to
 * admins. And a member granted the key by a custom role was refused.
 *
 * ClickUp (help centre, "Intro to user roles", "Manage Custom Role
 * permissions", search snippets): workspace settings, security and the audit
 * log are the owner's and the admins', and a custom role carries what it is
 * given. Each route asks its catalog key — `workspace.manage`,
 * `workspace.audit.view`, `security.policy.manage`, `automation.manage` — and
 * what is changed is read back by SQL.
 *
 * The automations page offered New automation, Use, the toggle and Delete to
 * everybody, whom the API then refused; it offers them by the same key now.
 *
 *   node test/e2e/admin-only-keys.mjs --api 3021 --dist /tmp/claude-0/dist-1
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
const EXPECTED_CHECKS = 5

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
const TAG = `aok${stamp}`
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
  if (!sql) throw new Error('no DATABASE_URL — what is changed is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id

  const person = async (key, role) => {
    const email = `${TAG}-${key}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `Keys ${key}`, email, password: 'AdminKeys@12345!', organizationName: `Keys ${key} ${stamp}`, organizationSlug: `keys-${key}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (added.status >= 300) throw new Error(`could not add the ${key}: ${said(added)}`)
    const [row] = await sql`select id from users where email = ${email}`
    return { id: row.id, email, password: 'AdminKeys@12345!', as: apiAs(signed.accessToken) }
  }
  const manager = await person('manager', 'manager')
  const delegate = await person('delegate', 'member')
  // The delegate holds the four keys by a custom role, granted before any request of theirs.
  const role = await A(`/workspaces/${WS}/roles`, { method: 'POST', body: { name: `${TAG} keys`, permissions: ['workspace.manage', 'workspace.audit.view', 'security.policy.manage', 'automation.manage'] } })
  const [memberRow] = await sql`select id from workspace_members where workspace_id = ${WS} and user_id = ${delegate.id}`
  const granted = role.data?.id ? await A(`/workspaces/${WS}/members/${memberRow.id}/roles/${role.data.id}`, { method: 'POST', body: {} }) : { status: 0 }
  if (granted.status >= 300) throw new Error(`could not grant the delegate: ${said(role)} ${said(granted)}`)
  const ws = async () => (await sql`select name, is_archived from workspaces where id = ${WS}`)[0]

  // ══ 1. THE WORKSPACE'S SETTINGS ══════════════════════════════════════════
  console.log('\n▶ renaming and archiving the workspace: the manager, the delegate, the admin')
  const managerRenames = await manager.as(`/workspaces/${WS}`, { method: 'PATCH', body: { name: `${TAG} by the manager` } })
  const managerArchives = await manager.as(`/workspaces/${WS}`, { method: 'DELETE' })
  const afterManager = await ws()
  const delegateRenames = await delegate.as(`/workspaces/${WS}`, { method: 'PATCH', body: { name: `${TAG} by the delegate` } })
  const afterDelegate = await ws()
  const adminRenames = await A(`/workspaces/${WS}`, { method: 'PATCH', body: { name: `${TAG} by the admin` } })
  chk(
    managerRenames.status === 403 && managerArchives.status === 403 && afterManager.name === TAG && afterManager.is_archived === false
      && delegateRenames.ok && afterDelegate.name === `${TAG} by the delegate` && adminRenames.ok && (await ws()).name === `${TAG} by the admin`,
    'a manager neither renames nor archives the workspace (403 each, unchanged) — a member granted workspace.manage renames it, and the admin does',
    `manager: rename ${said(managerRenames)}, archive ${said(managerArchives)}, now ${JSON.stringify(afterManager)}; delegate ${said(delegateRenames)} (${afterDelegate.name}); admin ${said(adminRenames)}`,
  )

  // ══ 2. THE AUDIT LOG ═════════════════════════════════════════════════════
  console.log('\n▶ reading and exporting the audit log')
  const managerReads = await manager.as(`/workspaces/${WS}/audit-logs`)
  const managerExports = await manager.as(`/workspaces/${WS}/audit-logs/export`)
  const delegateReads = await delegate.as(`/workspaces/${WS}/audit-logs`)
  const adminReads = await A(`/workspaces/${WS}/audit-logs`)
  chk(
    managerReads.status === 403 && managerExports.status === 403 && delegateReads.status === 200 && adminReads.status === 200,
    'a manager neither reads nor exports the audit log (403 each) — a member granted workspace.audit.view reads it, and the admin does',
    `manager: read ${said(managerReads)}, export ${said(managerExports)}; delegate ${said(delegateReads)}; admin ${said(adminReads)}`,
  )

  // ══ 3. SECURITY ══════════════════════════════════════════════════════════
  console.log('\n▶ the security policy, and API keys')
  const timeout = async () => (await sql`select session_timeout_minutes from workspace_security_settings where workspace_id = ${WS}`)[0]?.session_timeout_minutes ?? null
  const keys = async (name) => (await sql`select count(*)::int as n from api_keys where workspace_id = ${WS} and name = ${name}`)[0].n
  const before = await timeout()
  const managerPolicy = await manager.as(`/workspaces/${WS}/security-settings`, { method: 'PATCH', body: { sessionTimeoutMinutes: 777 } })
  const afterManagerPolicy = await timeout()
  const managerKey = await manager.as(`/workspaces/${WS}/api-keys`, { method: 'POST', body: { name: `${TAG} manager key` } })
  const delegatePolicy = await delegate.as(`/workspaces/${WS}/security-settings`, { method: 'PATCH', body: { sessionTimeoutMinutes: 888 } })
  const afterDelegatePolicy = await timeout()
  const adminKey = await A(`/workspaces/${WS}/api-keys`, { method: 'POST', body: { name: `${TAG} admin key` } })
  chk(
    managerPolicy.status === 403 && afterManagerPolicy === before && managerKey.status === 403 && (await keys(`${TAG} manager key`)) === 0
      && delegatePolicy.ok && afterDelegatePolicy === 888 && adminKey.ok && (await keys(`${TAG} admin key`)) === 1,
    'a manager neither changes the security policy nor makes an API key (403 each, nothing written) — a member granted security.policy.manage changes the policy, and the admin makes a key',
    `manager: policy ${said(managerPolicy)} (${before} → ${afterManagerPolicy}), key ${said(managerKey)}; delegate ${said(delegatePolicy)} (→ ${afterDelegatePolicy}); admin key ${said(adminKey)}`,
  )

  // ══ 4. AUTOMATIONS ═══════════════════════════════════════════════════════
  console.log('\n▶ making an automation')
  const automations = async (name) => (await sql`select count(*)::int as n from automations where workspace_id = ${WS} and name = ${name}`)[0].n
  const rule = (name) => ({ name, trigger: { type: 'task.created' }, actions: [{ type: 'add_comment', params: { text: `${TAG}` } }] })
  const managerMakes = await manager.as(`/workspaces/${WS}/automations`, { method: 'POST', body: rule(`${TAG} manager rule`) })
  const delegateMakes = await delegate.as(`/workspaces/${WS}/automations`, { method: 'POST', body: rule(`${TAG} delegate rule`) })
  const adminMakes = await A(`/workspaces/${WS}/automations`, { method: 'POST', body: rule(`${TAG} admin rule`) })
  chk(
    managerMakes.status === 403 && (await automations(`${TAG} manager rule`)) === 0
      && delegateMakes.ok && (await automations(`${TAG} delegate rule`)) === 1 && adminMakes.ok && (await automations(`${TAG} admin rule`)) === 1,
    'a manager makes no automation (403, none made) — a member granted automation.manage makes one, and the admin does',
    `manager ${said(managerMakes)}; delegate ${said(delegateMakes)}; admin ${said(adminMakes)}`,
  )

  // ══ 5. THE AUTOMATIONS PAGE ══════════════════════════════════════════════
  console.log('\n▶ the automations page, for the manager and for the delegate')
  browser = await (await resolveChromium()).launch(launchOptions())
  const pageFor = async (who) => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } })
    const page = await ctx.newPage()
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', who.email)
    await page.fill('input[type=password]', who.password)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
    await page.goto(`${B}/app/${WS}/automations`, { waitUntil: 'domcontentloaded' })
    // The delegate's own rule is listed to both, so the page has drawn before anything is counted.
    await page.getByText(`${TAG} delegate rule`, { exact: true }).first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
    await page.waitForTimeout(1500)
    const seen = {
      listed: await page.getByText(`${TAG} delegate rule`, { exact: true }).count().catch(() => -1),
      newAutomation: await page.getByTestId('automations-new').count().catch(() => -1),
      recipeUse: await page.getByTestId('automations-recipe-use').count().catch(() => -1),
      remove: await page.getByTestId('automation-delete').count().catch(() => -1),
    }
    await ctx.close().catch(() => {})
    return seen
  }
  const managerSees = await pageFor(manager)
  const delegateSees = await pageFor(delegate)
  chk(
    managerSees.listed >= 1 && managerSees.newAutomation === 0 && managerSees.recipeUse === 0 && managerSees.remove === 0
      && delegateSees.listed >= 1 && delegateSees.newAutomation === 1 && delegateSees.recipeUse >= 1 && delegateSees.remove >= 1,
    'the automations page lists the workspace’s rules to the manager and offers them nothing to make or delete — and offers New automation, Use and Delete to the member granted automation.manage',
    `manager ${JSON.stringify(managerSees)}; delegate ${JSON.stringify(delegateSees)}`,
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

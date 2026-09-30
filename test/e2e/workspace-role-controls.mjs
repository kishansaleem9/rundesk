/**
 * A MANAGER'S CONTROLS ARE OFFERED BY THE ROLE THEY HOLD IN THE WORKSPACE ON SCREEN.
 *
 * NOT A FRAME ROW: `found-24-sep/workspace-store-never-filled`. Three places
 * read a workspace store — its list and its "active" workspace — that nothing
 * in the app ever wrote to. So Insights' "can manage" was false for everybody,
 * and no manager was offered "Download PDF" or the workload moves; the
 * dashboard's "Set as workspace default" was offered to a super-admin only; and
 * the support widget filed every ticket in the user's FIRST workspace, whatever
 * workspace was open. Found when the export suite could not find the PDF
 * button: measured, the admin's Insights page drew the contribution section and
 * no button.
 *
 * Each is read from the screen as the admin and as a member of the same
 * workspace, and the ticket's workspace is read back by SQL.
 *
 *   node test/e2e/workspace-role-controls.mjs --api 3021
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

const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
const stamp = Date.now()
const TAG = `wrc-${stamp}`
let browser = null
let sql = null
const workspaces = []
let token = null

// lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`).
const apiAs = apiAsAt(API)

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the ticket’s workspace is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  token = auth.accessToken
  const A = apiAs(token)
  const memberEmail = `${TAG}-member@rundesk.invalid`
  const memberPassword = 'Member@12345!'
  const signed = await signUpApi(API, {
    fullName: 'Role member', email: memberEmail, password: memberPassword,
    organizationName: `Role ${stamp}`, organizationSlug: `role-${stamp}`,
  })
  const M = apiAs(signed.accessToken)
  // Two workspaces, the member in both, so "the first one" and "the one on
  // screen" are different answers.
  for (const name of ['first', 'second']) {
    const made = await A('/workspaces', { method: 'POST', body: { name: `${TAG} ${name}` } })
    if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the ${name} workspace: ${made.status}`)
    workspaces.push(made.data.id)
    const added = await A(`/workspaces/${made.data.id}/members`, { method: 'POST', body: { email: memberEmail, role: 'member' } })
    if (added.status >= 300) throw new Error(`could not add the member to ${name}: ${added.status}`)
  }
  const [, WS] = workspaces
  // A workspace admin who is NOT a super-admin: the dashboard offered a
  // super-admin its control through the account's role, so only a workspace
  // admin shows whether the workspace's role is read.
  const wsAdminEmail = `${TAG}-wsadmin@rundesk.invalid`
  const wsAdminSigned = await signUpApi(API, {
    fullName: 'Role workspace admin', email: wsAdminEmail, password: memberPassword,
    organizationName: `Role admin ${stamp}`, organizationSlug: `role-admin-${stamp}`,
  })
  const raised = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email: wsAdminEmail, role: 'workspace_admin' } })
  if (raised.status >= 300) throw new Error(`could not add the workspace admin: ${raised.status}`)
  const W = apiAs(wsAdminSigned.accessToken)
  // A dashboard of each person's own in the workspace on screen.
  for (const [C, who] of [[W, 'workspace admin'], [M, 'member']]) {
    const preset = await C('/dashboards', { method: 'POST', body: { workspaceId: WS, name: `${TAG} ${who}'s dashboard`, layout: [] } })
    if (preset.status >= 300) throw new Error(`could not make the ${who}'s dashboard: ${preset.status}`)
  }

  browser = await chromium.launch(launchOptions())
  const signIn = async (email, password) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', email)
    await page.fill('input[type=password]', password)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
    return page
  }
  const admin = await signIn(ADMIN.email, ADMIN.password)
  const member = await signIn(memberEmail, memberPassword)
  const wsAdmin = await signIn(wsAdminEmail, memberPassword)
  const visible = async (page, locator) => {
    await page.waitForTimeout(3000)
    return locator.first().isVisible().catch(() => false)
  }

  // ══ 1. INSIGHTS ══════════════════════════════════════════════════════════
  console.log('\n▶ Insights')
  for (const p of [admin, member]) await p.goto(`${B}/app/${WS}/insights`, { waitUntil: 'domcontentloaded' })
  const adminPdf = await visible(admin, admin.getByRole('button', { name: /Download PDF/ }))
  const memberPdf = await visible(member, member.getByRole('button', { name: /Download PDF/ }))
  const sectionShown = await member.getByText(/Contribution/i).first().isVisible().catch(() => false)
  chk(
    adminPdf && !memberPdf && sectionShown,
    'Insights offers its admin “Download PDF”, and a member, on the same section, none',
    `the admin sees it: ${adminPdf}; the member: ${memberPdf}; the member's page drew the section: ${sectionShown}`,
  )

  // ══ 2. THE DASHBOARD ═════════════════════════════════════════════════════
  console.log('\n▶ the dashboard')
  for (const p of [wsAdmin, member]) {
    await p.goto(`${B}/app/${WS}/dashboard`, { waitUntil: 'domcontentloaded' })
    // The presets, and their controls, are on the "Custom dashboard" tab.
    await p.getByRole('button', { name: /^Custom dashboard$/ }).first().click({ timeout: 15_000 }).catch(() => p.getByText('Custom dashboard', { exact: true }).first().click({ timeout: 5000 }))
  }
  const adminDefault = await visible(wsAdmin, wsAdmin.getByRole('button', { name: /Set as workspace default/ }))
  const memberDefault = await visible(member, member.getByRole('button', { name: /Set as workspace default/ }))
  chk(
    adminDefault && !memberDefault,
    'the dashboard offers a workspace admin who is not a super-admin “Set as workspace default”, and a member none',
    `the workspace admin sees it: ${adminDefault}; the member: ${memberDefault}`,
  )

  // ══ 3. THE SUPPORT WIDGET ════════════════════════════════════════════════
  console.log('\n▶ a support ticket, filed from the second workspace')
  await member.goto(`${B}/app/${WS}`, { waitUntil: 'domcontentloaded' })
  await member.waitForTimeout(2500)
  await member.getByRole('button', { name: /Open support/ }).click()
  await member.getByRole('button', { name: /New ticket/ }).first().click()
  const subject = `${TAG} filed from the second workspace`
  await member.getByPlaceholder('Briefly, what do you need help with?').fill(subject)
  await member.locator('textarea:visible').last().fill('Where does this go?')
  await member.locator('button[type=submit]').filter({ hasText: /ticket/i }).first().click()
  let ticket = null
  for (let i = 0; i < 40 && !ticket; i++) {
    ;[ticket] = await sql`select workspace_id from support_tickets where subject = ${subject}`
    if (!ticket) await new Promise((res) => setTimeout(res, 250))
  }
  chk(
    ticket?.workspace_id === WS,
    'a support ticket filed from the second workspace is filed in the second workspace, not the member’s first',
    `the ticket ${ticket ? `went to ${ticket.workspace_id === workspaces[0] ? 'the FIRST workspace' : ticket.workspace_id}` : 'was never filed'}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  for (const ws of workspaces) {
    const gone = await fetch(`${API}/workspaces/${ws}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } }).catch(() => null)
    if (![200, 204, 404].includes(gone?.status)) console.log(`  cleanup left behind: DELETE /workspaces/${ws} answered ${gone?.status ?? 'nothing'}`)
  }
  // Only now: the DELETEs above go through this proxy, and a closed one refuses them.
  stack.close()
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}

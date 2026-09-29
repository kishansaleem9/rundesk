/**
 * WORKSPACE SETTINGS OPEN BY THE KEYS THEIR TABS SERVE, AND INVITING ASKS
 * `members.invite` — AS THE ROLE EDITOR NAMES THEM.
 *
 * NOT A FRAME ROW: `role-editor-offers-unenforced-permissions`, its sixth
 * group. Settings opened to admins, and to the holders of the integrations and
 * SSO keys; everybody else was sent back to the start. So a manager, who holds
 * `members.invite` by default, had no way to the invite form, and a member
 * granted `roles.manage`, `workspace.manage` or `security.policy.manage` held
 * it by the API alone. Invitations asked the manager role rather than the key,
 * so a member granted `members.invite` could not invite at all.
 *
 * Now each tab opens to the keys it serves — General `workspace.manage`,
 * Members the three members keys, Roles `roles.manage`, Security
 * `security.policy.manage` — and inside a tab each control asks its own key:
 * the invite form `members.invite`, a member's role `members.role.change`,
 * Remove `members.remove`, the billing card `workspace.billing`. Inviting, and
 * cancelling, resending or copying an invitation, ask `members.invite`, and no
 * one invites above their own role. The onboarding checklist's Invite step
 * starts on Members, where the invite form is, rather than on General.
 *
 *   node test/e2e/settings-tabs-by-key.mjs --api 3021 --dist /tmp/claude-0/dist-1
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil } from './lib/wait.mjs'

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

/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`. */
const apiAs = (token) => async (route, init = {}) => {
  const headers = { authorization: `Bearer ${token}` }
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, { ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined }).catch(() => null)
  if (!res) return { status: 0, data: null, error: { message: 'no answer' } }
  const text = await res.text().catch(() => '')
  let json = null
  try { json = JSON.parse(text) } catch { /* no body */ }
  return { status: res.status, data: json?.data, error: json?.error }
}
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `stk${stamp}`
const PASSWORD = 'SettingsKeys@12345!'
/** The onboarding checklist's Invite step, as the English catalog titles it. */
const INVITE_STEP = 'Invite a teammate'
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
let sql = null
let WS = null
let ALONE = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — invitations are read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id

  const person = async (key, role, keys = []) => {
    const email = `${TAG}-${key}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `Settings ${key}`, email, password: PASSWORD, organizationName: `Settings ${key} ${stamp}`, organizationSlug: `settings-${key}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (added.status >= 300) throw new Error(`could not add the ${key}: ${said(added)}`)
    if (keys.length > 0) {
      const [row] = await sql`select m.id from workspace_members m join users u on u.id = m.user_id where m.workspace_id = ${WS} and u.email = ${email}`
      const made = await A(`/workspaces/${WS}/roles`, { method: 'POST', body: { name: `${TAG} ${key}`, permissions: keys } })
      const given = made.data?.id ? await A(`/workspaces/${WS}/members/${row.id}/roles/${made.data.id}`, { method: 'POST', body: {} }) : { status: 0 }
      if (given.status >= 300) throw new Error(`could not grant the ${key}: ${said(made)} ${said(given)}`)
    }
    return { email, password: PASSWORD, as: apiAs(signed.accessToken) }
  }
  const manager = await person('manager', 'manager')
  const inviter = await person('inviter', 'member', ['members.invite'])
  const keeper = await person('keeper', 'member', ['roles.manage'])
  const steward = await person('steward', 'member', ['workspace.manage'])
  const warden = await person('warden', 'member', ['security.policy.manage'])
  const plain = await person('plain', 'member')
  const invited = async (email) => (await sql`select count(*)::int as n from invitations where email = ${email} and status = 'pending'`)[0].n

  // ══ 1. INVITING ══════════════════════════════════════════════════════════
  console.log('\n▶ inviting: the member granted members.invite, a plain member, the manager')
  const byInviter = `${TAG}-by-inviter@rundesk.invalid`
  const byPlain = `${TAG}-by-plain@rundesk.invalid`
  const inviterInvites = await inviter.as('/invitations', { method: 'POST', body: { email: byInviter, workspaceId: WS, role: 'member' } })
  const inviterInvitesAdmin = await inviter.as('/invitations', { method: 'POST', body: { email: `${TAG}-admin-by-inviter@rundesk.invalid`, workspaceId: WS, role: 'manager' } })
  const plainInvites = await plain.as('/invitations', { method: 'POST', body: { email: byPlain, workspaceId: WS, role: 'member' } })
  const managerInvitesAdmin = await manager.as('/invitations', { method: 'POST', body: { email: `${TAG}-admin-by-manager@rundesk.invalid`, workspaceId: WS, role: 'workspace_admin' } })
  chk(
    inviterInvites.status < 300 && (await invited(byInviter)) === 1 && inviterInvitesAdmin.status === 403
      && plainInvites.status === 403 && (await invited(byPlain)) === 0 && managerInvitesAdmin.status === 403,
    'a member granted members.invite invites a member, and no one above themself (403 for a manager) — a plain member invites no one, and a manager invites no admin',
    `inviter ${said(inviterInvites)}, above their role ${said(inviterInvitesAdmin)}; plain ${said(plainInvites)}; manager an admin ${said(managerInvitesAdmin)}`,
  )

  // ══ 2. A PENDING INVITATION ══════════════════════════════════════════════
  console.log('\n▶ a pending invitation the admin made: its link and its cancellation')
  const byAdmin = `${TAG}-by-admin@rundesk.invalid`
  const adminInvites = await A('/invitations', { method: 'POST', body: { email: byAdmin, workspaceId: WS, role: 'member' } })
  const inviteId = adminInvites.data?.id ?? (await sql`select id from invitations where email = ${byAdmin}`)[0]?.id
  if (!inviteId) throw new Error(`the admin's invitation was not made: ${said(adminInvites)}`)
  const plainLink = await plain.as(`/invitations/${inviteId}/link`)
  const plainCancels = await plain.as(`/invitations/${inviteId}`, { method: 'DELETE' })
  const stillAfterPlain = await invited(byAdmin)
  const inviterLink = await inviter.as(`/invitations/${inviteId}/link`)
  const inviterCancels = await inviter.as(`/invitations/${inviteId}`, { method: 'DELETE' })
  chk(
    plainLink.status === 403 && plainCancels.status === 403 && stillAfterPlain === 1
      && inviterLink.status === 200 && inviterCancels.status < 300 && (await invited(byAdmin)) === 0,
    'a plain member neither reads an invitation’s link nor cancels it (403 each, still pending) — the member granted members.invite reads it and cancels it',
    `plain link ${said(plainLink)}, cancel ${said(plainCancels)} (${stillAfterPlain} pending); inviter link ${said(inviterLink)}, cancel ${said(inviterCancels)}, ${await invited(byAdmin)} still pending`,
  )

  // ══ 3–7. THE SETTINGS PAGE ═══════════════════════════════════════════════
  browser = await (await resolveChromium()).launch(launchOptions())
  const settingsAs = async (who, probe) => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } })
    const page = await ctx.newPage()
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', who.email)
    await page.fill('input[type=password]', who.password)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
    await page.goto(`${B}/app/${WS}/settings`, { waitUntil: 'domcontentloaded' })
    // Either the rail draws, or the route sends them away; give each the time it takes.
    await waitUntil(async () => (await page.locator('[data-testid^="settings-tab-"]').count()) > 0 || !page.url().includes('/settings'), { timeoutMs: 15_000 })
    await page.waitForTimeout(1200)
    const seen = {
      url: new URL(page.url()).pathname + new URL(page.url()).search,
      tabs: await page.locator('[data-testid^="settings-tab-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid').slice('settings-tab-'.length))).catch(() => []),
      ...(await probe(page)),
    }
    await ctx.close().catch(() => {})
    return seen
  }
  const on = (seen, tab) => seen.url.includes('/settings') && seen.tabs.includes(tab)
  /*
   * THE TABS A KEY OPENS, beside the three that open to every member but a
   * guest: Archived (the archived tasks each reader may open), Trash (what
   * they deleted) and Features (read-only)
   * (`admin-guard-admits-managers-where-the-web-says-admin`,
   * `members-have-no-trash-to-open`, `members-see-no-clickapps-list`). So
   * "alone" is read as the one tab the key opens, and the three are required
   * with it.
   */
  const OPEN_TABS = ['features', 'archived', 'trash']
  const keyTabs = (seen) => seen.tabs.filter((t) => !OPEN_TABS.includes(t))
  const onAlone = (seen, tab) => on(seen, tab) && keyTabs(seen).length === 1 && OPEN_TABS.every((t) => seen.tabs.includes(t))

  console.log('\n▶ the manager, who holds members.invite by default')
  const managerSees = await settingsAs(manager, async (page) => ({
    invite: await page.getByRole('button', { name: /^Invite$/ }).count(),
    roleSelects: await page.getByTestId('settings-member-role').count(),
    removes: await page.getByTitle('Remove member').count(),
  }))
  chk(
    onAlone(managerSees, 'members') && managerSees.url.includes('tab=members') && managerSees.invite === 1 && managerSees.roleSelects === 0 && managerSees.removes === 0,
    'the manager opens Settings on Members alone, offered the invite form — and no member’s role to change nor anyone to remove, keys a manager does not hold',
    JSON.stringify(managerSees),
  )

  console.log('\n▶ the member granted roles.manage')
  const keeperSees = await settingsAs(keeper, async (page) => ({ newRole: await page.getByTitle('New role').count() }))
  chk(
    onAlone(keeperSees, 'roles') && keeperSees.newRole >= 1,
    'a member granted roles.manage opens Settings on Roles, offered New role',
    JSON.stringify(keeperSees),
  )

  console.log('\n▶ the member granted workspace.manage')
  const stewardSees = await settingsAs(steward, async (page) => ({
    name: await page.locator('#name').count(),
    billing: await page.getByRole('heading', { name: /^Billing$/ }).count(),
  }))
  chk(
    onAlone(stewardSees, 'general') && stewardSees.name === 1 && stewardSees.billing === 0,
    'a member granted workspace.manage opens Settings on General, offered the workspace’s name — and no billing, which is workspace.billing’s',
    JSON.stringify(stewardSees),
  )

  console.log('\n▶ the member granted security.policy.manage')
  const wardenSees = await settingsAs(warden, async (page) => ({ apiKeys: await page.getByText('API keys', { exact: true }).count() }))
  chk(
    onAlone(wardenSees, 'security') && wardenSees.apiKeys >= 1,
    'a member granted security.policy.manage opens Settings on Security, offered its API keys',
    JSON.stringify(wardenSees),
  )

  console.log('\n▶ the onboarding checklist’s Invite step, in a workspace the admin holds alone')
  // The step is done once a second person is in, so only a workspace's lone maker is shown it undone.
  const alone = await A('/workspaces', { method: 'POST', body: { name: `${TAG} alone` } })
  if (alone.status >= 300 || !alone.data?.id) throw new Error(`could not make the second workspace: ${said(alone)}`)
  ALONE = alone.data.id
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } })
  const page = await ctx.newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ADMIN.email)
  await page.fill('input[type=password]', ADMIN.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
  await page.goto(`${B}/app/${ALONE}`, { waitUntil: 'domcontentloaded' })
  await page.getByText(INVITE_STEP, { exact: true }).first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
  await page.waitForTimeout(800)
  // The step's own Start: the link in the row that holds the step's title.
  const row = page.locator('li').filter({ hasText: INVITE_STEP })
  const step = {
    rows: await row.count(),
    href: (await row.first().getByRole('link').first().getAttribute('href').catch(() => null)) ?? null,
  }
  await ctx.close().catch(() => {})
  chk(
    step.rows === 1 && /\/settings\?tab=members$/.test(step.href ?? ''),
    'the onboarding checklist’s Invite step starts on Settings’ Members tab, where the invite form is — not on General',
    JSON.stringify(step),
  )

  console.log('\n▶ a plain member')
  const plainSees = await settingsAs(plain, async () => ({}))
  chk(
    plainSees.url.includes('tab=archived') && JSON.stringify(plainSees.tabs) === '["features","archived","trash"]',
    'a plain member, who holds none of these keys, opens Settings on Archived, with only Trash and Features beside it — no tab a key opens',
    JSON.stringify(plainSees),
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
  if (ALONE && A) {
    const gone = await A(`/workspaces/${ALONE}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${ALONE} answered ${gone.status || 'nothing'}`)
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

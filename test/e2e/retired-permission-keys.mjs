/**
 * THE ROLE EDITOR OFFERS NO KEY THAT GATES NOTHING — AND A ROLE WRITTEN
 * BEFORE A KEY LEFT IT STILL WORKS.
 *
 * NOT A FRAME ROW: `role-editor-offers-unenforced-permissions`, its fifth
 * group. `workspace.delete` ("Permanently delete the workspace and all data")
 * was offered, saved and shown, and asked by nothing: no route deletes a
 * workspace for good, and archiving is `workspace.manage`'s. ClickUp (help
 * centre "Transfer Workspace ownership", search snippets): only the owner
 * deletes a workspace. Until a permanent delete exists here the key is not
 * offered; `check-permission-keys-asked.mjs` keeps every offered key asked.
 *
 * A role saved while the key was offered still stores it. It gates nothing,
 * so it gives nothing: the role is assigned as before, and grants its other
 * keys. The grant check had read a role's stored keys unfiltered, so a stored
 * key the catalog no longer has would have made such a role unassignable by
 * anyone, admins included.
 *
 *   node test/e2e/retired-permission-keys.mjs --api 3021 --dist /tmp/claude-0/dist-1
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
const EXPECTED_CHECKS = 4

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
const ADMIN = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}
const RETIRED = 'workspace.delete'

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `rpk${stamp}`
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
  if (!sql) throw new Error('no DATABASE_URL — the older role is written by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id

  // ══ 1. WHAT THE EDITOR IS OFFERED ════════════════════════════════════════
  console.log('\n▶ the permission catalog the role editor reads')
  const catalog = await A(`/workspaces/${WS}/roles/catalog`)
  const keys = (catalog.data?.permissions ?? []).map((p) => p.key)
  chk(
    catalog.status === 200 && keys.length > 0 && !keys.includes(RETIRED) && keys.includes('workspace.manage'),
    `the catalog offers ${RETIRED}, which no route asks, no longer — and still offers the keys that gate something (workspace.manage among them)`,
    `${catalog.status}: ${keys.length} key(s)${keys.includes(RETIRED) ? `, ${RETIRED} OFFERED` : ''}`,
  )

  // ══ 2. A ROLE CANNOT BE MADE WITH IT ═════════════════════════════════════
  console.log('\n▶ making a role with the retired key')
  const named = `${TAG} with the retired key`
  const makes = await A(`/workspaces/${WS}/roles`, { method: 'POST', body: { name: named, permissions: [RETIRED] } })
  const madeCount = (await sql`select count(*)::int as n from custom_roles where workspace_id = ${WS} and name = ${named}`)[0].n
  chk(
    makes.status === 400 && madeCount === 0,
    'a role holding the retired key is refused by name (400) and none is made',
    `${said(makes)}; ${madeCount} made`,
  )

  // ══ 3. A ROLE WRITTEN BEFORE STILL WORKS ═════════════════════════════════
  console.log('\n▶ a role saved while the key was offered: assigned, and granting its live key alone')
  const email = `${TAG}-holder@rundesk.invalid`
  const signed = await signUpApi(API, { fullName: `Retired ${TAG}`, email, password: 'RetiredKeys@12345!', organizationName: `Retired ${stamp}`, organizationSlug: `retired-${stamp}` })
  const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'member' } })
  if (added.status >= 300) throw new Error(`could not add the holder: ${said(added)}`)
  const holder = apiAs(signed.accessToken)
  const [memberRow] = await sql`select m.id from workspace_members m join users u on u.id = m.user_id where m.workspace_id = ${WS} and u.email = ${email}`
  const older = await A(`/workspaces/${WS}/roles`, { method: 'POST', body: { name: `${TAG} older`, permissions: ['webhook.manage'] } })
  if (older.status >= 300 || !older.data?.id) throw new Error(`could not make the older role: ${said(older)}`)
  // What a role saved before the key left the catalog holds: the key, stored beside a live one.
  await sql`insert into custom_role_permissions (role_id, permission) values (${older.data.id}, ${RETIRED}) on conflict do nothing`
  const assigned = await A(`/workspaces/${WS}/members/${memberRow.id}/roles/${older.data.id}`, { method: 'POST', body: {} })
  const mine = (await holder(`/workspaces/${WS}/roles/me/permissions`)).data?.permissions ?? []
  chk(
    assigned.ok && mine.includes('webhook.manage') && !mine.includes(RETIRED),
    'the admin assigns the older role as before, and it grants webhook.manage and nothing for the retired key',
    `assign ${said(assigned)}; the holder resolves ${JSON.stringify(mine.filter((k) => k === RETIRED || k === 'webhook.manage'))}`,
  )

  // ══ 4. THE EDITOR ════════════════════════════════════════════════════════
  console.log('\n▶ the role editor in Settings')
  browser = await (await resolveChromium()).launch(launchOptions())
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } })
  const page = await ctx.newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ADMIN.email)
  await page.fill('input[type=password]', ADMIN.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
  await page.goto(`${B}/app/${WS}/settings?tab=roles`, { waitUntil: 'domcontentloaded' })
  await page.getByTitle('New role').first().click({ timeout: 20_000 }).catch(() => {})
  await waitUntil(async () => (await page.getByText('Manage workspace settings', { exact: true }).count()) > 0, { timeoutMs: 10_000 })
  const offered = {
    live: await page.getByText('Manage workspace settings', { exact: true }).count().catch(() => -1),
    retired: await page.getByText('Delete workspace', { exact: true }).count().catch(() => -1),
  }
  await ctx.close().catch(() => {})
  chk(
    offered.live >= 1 && offered.retired === 0,
    'the role editor offers Manage workspace settings and no longer offers Delete workspace',
    JSON.stringify(offered),
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

/**
 * A CLIENT IS RENAMED, GIVEN A CONTACT EMAIL AND DELETED, BY WHOEVER MANAGES
 * CLIENTS.
 *
 * NOT A FRAME ROW: `found-28-sep/clients-cannot-be-edited`, found implementing
 * `client.manage`. There was no update route, so the contact email an invoice
 * prints could be set only through the API's create, and no page renamed or
 * deleted a client: the project's client row made one by name and nothing else.
 *
 * ClickUp has no clients; its nearest library, the Custom Field Manager, is
 * changed by whoever may manage it. Here that is `client.manage`, a manager's
 * and an admin's by default.
 *
 *   node test/e2e/client-edit.mjs --api 3027 --dist /tmp/claude-0/dist-7
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
const EXPECTED_CHECKS = 6

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
const TAG = `cle${stamp}`
const PASSWORD = 'ClientEdit@12345!'
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
  if (!sql) throw new Error('no DATABASE_URL — the clients are read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const person = async (key, role) => {
    const email = `${TAG}-${key}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `Clients ${key}`, email, password: PASSWORD, organizationName: `Clients ${key} ${stamp}`, organizationSlug: `clients-${key}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (!added.ok) throw new Error(`could not add the ${key}: ${said(added)}`)
    return { email, as: apiAs(signed.accessToken) }
  }
  const manager = await person('manager', 'manager')
  const member = await person('member', 'member')
  const client = async (name) => {
    const r = await A(`/workspaces/${WS}/clients`, { method: 'POST', body: { name } })
    if (!r.ok || !r.data?.id) throw new Error(`could not make client "${name}": ${said(r)}`)
    return r.data.id
  }
  const ACME = await client(`${TAG} Acme`)
  const OTHER = await client(`${TAG} Globex`)
  const row = async (id) => (await sql`select name, contact_email from clients where id = ${id}`)[0] ?? null
  const clientPath = (id) => `/workspaces/${WS}/clients/${id}`

  // ══ 1. THE MANAGER RENAMES ONE AND GIVES IT AN EMAIL ═════════════════════
  console.log('\n▶ the manager renames a client and sets its contact email')
  const renamed = await manager.as(clientPath(ACME), { method: 'PATCH', body: { name: `${TAG} Acme Ltd`, contactEmail: 'billing@acme.invalid' } })
  const acme = await row(ACME)
  chk(
    renamed.status === 200 && acme?.name === `${TAG} Acme Ltd` && acme?.contact_email === 'billing@acme.invalid',
    'a manager renames a client and sets the contact email an invoice prints (200)',
    `${said(renamed)}; stored ${JSON.stringify(acme)}`,
  )

  // ══ 2. NOT A PLAIN MEMBER ════════════════════════════════════════════════
  console.log('\n▶ a plain member tries the same')
  const byMember = await member.as(clientPath(ACME), { method: 'PATCH', body: { name: `${TAG} renamed by a member` } })
  chk(
    byMember.status === 403 && (await row(ACME))?.name === `${TAG} Acme Ltd`,
    'a plain member changing a client is refused (403), and nothing changes',
    `${said(byMember)}; the name is ${JSON.stringify((await row(ACME))?.name)}`,
  )

  // ══ 3. NAMES STAY UNIQUE, EMAILS ARE EMAILS, AN EMPTY ONE CLEARS ═════════
  console.log('\n▶ a taken name, a string that is not an email, and an empty email')
  const taken = await manager.as(clientPath(OTHER), { method: 'PATCH', body: { name: `${TAG} Acme Ltd` } })
  const notEmail = await manager.as(clientPath(OTHER), { method: 'PATCH', body: { contactEmail: 'not an address' } })
  const cleared = await manager.as(clientPath(ACME), { method: 'PATCH', body: { contactEmail: '' } })
  const other = await row(OTHER)
  chk(
    taken.status === 400 && /already exists/.test(taken.error?.message ?? '') && notEmail.status === 400
      && other?.name === `${TAG} Globex` && other?.contact_email === null
      && cleared.status === 200 && (await row(ACME))?.contact_email === null,
    'a name another client has is refused (400, “already exists”), a contact email that is not one is refused (400), and an empty one clears it',
    `taken ${said(taken)}; not an email ${said(notEmail)}; cleared ${said(cleared)} → ${JSON.stringify((await row(ACME))?.contact_email)}`,
  )

  // ══ 4–6. THE PROJECT PAGE OFFERS IT ══════════════════════════════════════
  const space = (await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} space` } })).data?.id
  const project = (await A('/projects', { method: 'POST', body: { spaceId: space, name: `${TAG} project` } })).data?.id
  if (!project) throw new Error('could not stage the project')
  const chromium = await resolveChromium()
  browser = await chromium.launch(launchOptions())
  const projectPageAs = async (who) => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, serviceWorkers: 'block' })
    const page = await ctx.newPage()
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', who.email)
    await page.fill('input[type=password]', PASSWORD)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
    await page.goto(`${B}/app/${WS}/${space}/${project}`, { waitUntil: 'domcontentloaded' })
    // The client row is drawn once the clients have answered: the picker lists them.
    await waitUntil(async () => (await page.locator('option', { hasText: `${TAG} Globex` }).count()) > 0, { timeoutMs: 20_000 })
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
    return page
  }

  console.log('\n▶ the plain member’s project page')
  const mp = await projectPageAs(member)
  const memberOffered = await mp.getByTestId('project-manage-clients').count()
  const memberPicker = await mp.locator('option', { hasText: `${TAG} Globex` }).count()
  chk(
    memberPicker > 0 && memberOffered === 0,
    'the plain member’s project page lists the clients and offers no Manage clients',
    `picker lists them ${memberPicker > 0}; Manage clients offered ${memberOffered}`,
  )
  await mp.context().close().catch(() => {})

  console.log('\n▶ the manager’s project page: Manage clients')
  const gp = await projectPageAs(manager)
  await gp.getByTestId('project-manage-clients').click({ timeout: 5000 }).catch(() => {})
  const acmeRow = gp.getByTestId(`client-row-${ACME}`)
  await waitUntil(() => acmeRow.isVisible().catch(() => false), { timeoutMs: 8000 })
  await acmeRow.getByRole('textbox', { name: 'Contact email' }).fill('accounts@acme.invalid', { timeout: 5000 }).catch(() => {})
  await acmeRow.getByRole('button', { name: /^Save$/ }).click({ timeout: 5000 }).catch(() => {})
  const emailSaved = await waitUntil(async () => (await row(ACME))?.contact_email === 'accounts@acme.invalid', { timeoutMs: 10_000 })
  chk(
    emailSaved,
    'the manager sets a client’s contact email from the project page’s Manage clients, and it is saved',
    `stored ${JSON.stringify((await row(ACME))?.contact_email)}`,
  )

  const otherRow = gp.getByTestId(`client-row-${OTHER}`)
  await otherRow.getByRole('button', { name: /Delete/ }).click({ timeout: 5000 }).catch(() => {})
  const deleted = await waitUntil(async () => (await row(OTHER)) === null, { timeoutMs: 10_000 })
  const gone = deleted && await waitUntil(async () => (await gp.getByTestId(`client-row-${OTHER}`).count()) === 0, { timeoutMs: 8000 })
  chk(
    deleted && gone,
    'the manager deletes a client with no invoices from the same dialog, and it leaves the list',
    `deleted ${deleted}; left the dialog ${gone}`,
  )
  await gp.context().close().catch(() => {})
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

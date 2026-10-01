/**
 * THE WORKSPACE'S DATA IS EXPORTED BY WHOEVER HOLDS `workspace.export`, AND
 * IMPORTED — OR SEEDED WITH SAMPLE DATA — BY WHOEVER HOLDS `workspace.import`.
 *
 * NOT A FRAME ROW: `found-25-sep/admin-guard-admits-managers-where-the-web-says-admin`,
 * its data slice. The whole workspace's export (JSON, every task as CSV, the
 * people as CSV), the ClickUp and spreadsheet imports and the sample-data seed
 * stood behind `WorkspaceAdminGuard`, which admits managers, while the web
 * offered the export to admins alone and the import page and the sample-data
 * card to everybody.
 *
 * ClickUp (help centre "Import and export feature availability and limits",
 * "How do I export my Workspace's data?", search snippets): exporting the
 * workspace's task data and its people list is the owner's and the admins',
 * and so is importing, which a custom role can grant. So these are two keys,
 * each an admin's by default and grantable: a manager does neither, and a
 * member granted one does that one.
 *
 *   node test/e2e/data-transfer-keys.mjs --api 3021 --dist /tmp/claude-0/dist-1
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
const TAG = `dtk${stamp}`
const PASSWORD = 'DataTransfer@12345!'
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
let sql = null
let WS = null
let WS2 = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — what is seeded is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id

  const person = async (key, role, keys = []) => {
    const email = `${TAG}-${key}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `Data ${key}`, email, password: PASSWORD, organizationName: `Data ${key} ${stamp}`, organizationSlug: `data-${key}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (!added.ok) throw new Error(`could not add the ${key}: ${said(added)}`)
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
  const manager = await person('manager', 'manager')
  const exporter = await person('exporter', 'member', ['workspace.export'])
  const importer = await person('importer', 'member', ['workspace.import'])
  const space = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} space` } })
  if (!space.ok) throw new Error(`could not make the space: ${said(space)}`)

  // ══ 1. EXPORTING ═════════════════════════════════════════════════════════
  console.log('\n▶ exporting the workspace: the manager, the member granted workspace.export, the admin')
  const exportsOf = async (who) => ({
    json: (await who(`/workspaces/${WS}/export/json`)).status,
    tasks: (await who(`/workspaces/${WS}/export/csv/tasks`)).status,
    people: (await who(`/workspaces/${WS}/export/csv/members`)).status,
  })
  const managerExports = await exportsOf(manager.as)
  const exporterExports = await exportsOf(exporter.as)
  const adminExports = await exportsOf(A)
  const all = (x, s) => x.json === s && x.tasks === s && x.people === s
  chk(
    all(managerExports, 403) && exporter.granted && all(exporterExports, 200) && all(adminExports, 200),
    'a manager exports neither the workspace’s data nor its people (403 each) — a member granted workspace.export exports all three, and the admin does',
    `manager ${JSON.stringify(managerExports)}; exporter ${exporter.granted ? JSON.stringify(exporterExports) : 'NOT GRANTED'}; admin ${JSON.stringify(adminExports)}`,
  )

  // ══ 2. IMPORTING ═════════════════════════════════════════════════════════
  // An empty request: past the gate it is refused as malformed (400); at the gate, 403.
  console.log('\n▶ starting an import: the manager, the member granted workspace.import')
  const importsOf = async (who) => ({
    sheet: (await who(`/workspaces/${WS}/import/spreadsheet`, { method: 'POST', body: {} })).status,
    clickup: (await who(`/workspaces/${WS}/import/clickup`, { method: 'POST', body: {} })).status,
  })
  const managerImports = await importsOf(manager.as)
  const importerImports = await importsOf(importer.as)
  chk(
    managerImports.sheet === 403 && managerImports.clickup === 403
      && importer.granted && importerImports.sheet !== 403 && importerImports.clickup !== 403 && importerImports.sheet !== 0,
    'a manager starts no spreadsheet or ClickUp import (403 each) — a member granted workspace.import passes the gate, to be told the empty request is malformed',
    `manager ${JSON.stringify(managerImports)}; importer ${importer.granted ? JSON.stringify(importerImports) : 'NOT GRANTED'}`,
  )

  // ══ 3. SAMPLE DATA ═══════════════════════════════════════════════════════
  // Sample data loads only into an empty workspace, and this one is not: past the gate the
  // answer is 409 saying so; at the gate, 403.
  console.log('\n▶ seeding sample data')
  const spaces = async () => (await sql`select count(*)::int as n from spaces where workspace_id = ${WS}`)[0].n
  const before = await spaces()
  const managerSeeds = await manager.as(`/workspaces/${WS}/sample-data/seed`, { method: 'POST', body: {} })
  const importerSeeds = await importer.as(`/workspaces/${WS}/sample-data/seed`, { method: 'POST', body: {} })
  chk(
    managerSeeds.status === 403 && (await spaces()) === before && importer.granted && importerSeeds.status !== 403 && importerSeeds.status !== 0,
    'a manager seeds no sample data (403) — a member granted workspace.import passes the gate, to be told the workspace is not empty',
    `manager ${said(managerSeeds)}; importer ${importer.granted ? said(importerSeeds) : 'NOT GRANTED'}; ${before} → ${await spaces()} spaces`,
  )

  // ══ 4–5. THE PAGES ═══════════════════════════════════════════════════════
  browser = await (await resolveChromium()).launch(launchOptions())
  // `holdPermissions` keeps the page's permission read unanswered while the
  // probe looks; the service worker is blocked so the route sees that read.
  const pageAs = async (who, route, probe, { holdPermissions = false } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, serviceWorkers: 'block' })
    const page = await ctx.newPage()
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', who.email)
    await page.fill('input[type=password]', who.password)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
    let release = () => {}
    if (holdPermissions) {
      const held = new Promise((resolve) => (release = resolve))
      await ctx.route('**/roles/me/permissions', async (r) => {
        await held
        await r.continue().catch(() => {})
      })
    }
    await page.goto(`${B}${route}`, { waitUntil: 'domcontentloaded' })
    const seen = await probe(page)
    release()
    await ctx.close().catch(() => {})
    return seen
  }

  console.log('\n▶ Settings: the data export, for the exporter and for the manager')
  const exportOffered = async (page) => {
    await waitUntil(async () => (await page.locator('[data-testid^="settings-tab-"]').count()) > 0 || !page.url().includes('/settings'), { timeoutMs: 15_000 })
    await waitUntil(async () => (await page.getByRole('button', { name: /^Export JSON$/ }).count()) > 0, { timeoutMs: 5000 })
    return {
      url: new URL(page.url()).pathname + new URL(page.url()).search,
      exportJson: await page.getByRole('button', { name: /^Export JSON$/ }).count(),
    }
  }
  const exporterSees = await pageAs(exporter, `/app/${WS}/settings?tab=integrations`, exportOffered)
  const managerRoster = await pageAs(manager, `/app/${WS}/settings?tab=members`, async (page) => {
    await page.getByRole('button', { name: /^Invite$/ }).first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
    await page.waitForTimeout(800)
    return { roster: await page.getByRole('button', { name: /Export members CSV|Export CSV/ }).count() }
  })
  chk(
    exporterSees.url.includes('tab=integrations') && exporterSees.exportJson === 1 && managerRoster.roster === 0,
    'Settings offers the member granted workspace.export the workspace’s data export — and offers the manager no export of the people',
    `exporter ${JSON.stringify(exporterSees)}; manager on Members ${JSON.stringify(managerRoster)}`,
  )

  console.log('\n▶ the import page, for the importer and for the manager')
  const importOffered = async (page) => {
    await page.getByTestId('import-tabs').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
    await waitUntil(async () => (await page.getByTestId('import-sheet-file').count()) > 0 || (await page.getByTestId('import-not-yours').count()) > 0, { timeoutMs: 6000 })
    const sheet = await page.getByTestId('import-sheet-file').count()
    const notYours = await page.getByTestId('import-not-yours').count()
    await page.getByTestId('import-tab-clickup').click().catch(() => {})
    await page.waitForTimeout(600)
    return { sheet, notYours, clickup: await page.getByTestId('import-clickup-panel').count() }
  }
  const importerPage = await pageAs(importer, `/app/${WS}/import`, importOffered)
  const managerPage = await pageAs(manager, `/app/${WS}/import`, importOffered)
  chk(
    importerPage.sheet >= 1 && importerPage.clickup >= 1
      && managerPage.sheet === 0 && managerPage.clickup === 0 && managerPage.notYours >= 1,
    'the import page offers the member granted workspace.import the spreadsheet and ClickUp imports — and tells the manager importing is not theirs, offering neither',
    `importer ${JSON.stringify(importerPage)}; manager ${JSON.stringify(managerPage)}`,
  )

  // While the page still waits for the member's permissions it says neither.
  // It used to say "importing is not yours" until they answered: the check
  // above, read under a full CI run's load, caught that wait (1 October).
  // Holding the read makes the wait as long as it takes to look.
  const whileAsking = await pageAs(importer, `/app/${WS}/import`, async (page) => {
    await page.getByTestId('import-tabs').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
    const settled = await waitUntil(
      async () => (await page.getByTestId('import-not-yours').count()) > 0
        || (await page.getByTestId('import-asking').filter({ visible: true }).count()) > 0,
      { timeoutMs: 6000 },
    )
    return {
      settled,
      asking: await page.getByTestId('import-asking').filter({ visible: true }).count(),
      notYours: await page.getByTestId('import-not-yours').count(),
      sheet: await page.getByTestId('import-sheet-file').count(),
    }
  }, { holdPermissions: true })
  chk(
    whileAsking.settled && whileAsking.asking === 1 && whileAsking.notYours === 0 && whileAsking.sheet === 0,
    'while its permissions are still being asked, the import page waits: it tells the member granted workspace.import neither that importing is not theirs nor offers the import',
    `with the permission read held: ${JSON.stringify(whileAsking)}`,
  )

  // ══ 6. THE SAMPLE-DATA CARD ══════════════════════════════════════════════
  // It shows only in a workspace with no space, so a second one is emptied of its default.
  console.log('\n▶ the dashboard of an empty workspace: its Load demo data, for the importer and for the manager')
  const second = await A('/workspaces', { method: 'POST', body: { name: `${TAG} empty` } })
  if (!second.ok || !second.data?.id) throw new Error(`could not make the empty workspace: ${said(second)}`)
  WS2 = second.data.id
  for (const sp of (await sql`select id from spaces where workspace_id = ${WS2}`)) await sql`delete from spaces where id = ${sp.id}`
  /** Adds `who` to the empty workspace, grants `keys` there, and answers whether they were granted. */
  const join = async (who, role, keys = []) => {
    const added = await A(`/workspaces/${WS2}/members`, { method: 'POST', body: { email: who.email, role } })
    if (!added.ok) throw new Error(`could not add to the empty workspace: ${said(added)}`)
    if (keys.length === 0) return true
    const [row] = await sql`select m.id from workspace_members m join users u on u.id = m.user_id where m.workspace_id = ${WS2} and u.email = ${who.email}`
    const r = await A(`/workspaces/${WS2}/roles`, { method: 'POST', body: { name: `${TAG} empty importers`, permissions: keys } })
    const given = r.data?.id ? await A(`/workspaces/${WS2}/members/${row.id}/roles/${r.data.id}`, { method: 'POST', body: {} }) : { status: 0 }
    // Recorded, as `person` records its grants, so the check says so: a grant never
    // tried stands in as `{ status: 0 }`, and one nobody answered is 0 — neither is granted.
    const granted = given.ok === true
    if (!granted) console.log(`    (not granted in the empty workspace: ${said(r)}; ${said(given)})`)
    return granted
  }
  await join(manager, 'manager')
  const importerGranted = await join(importer, 'member', ['workspace.import'])
  const demoOffered = async (page) => {
    await waitUntil(async () => (await page.getByRole('button', { name: /^Load demo data$/ }).count()) > 0, { timeoutMs: 12_000 })
    return await page.getByRole('button', { name: /^Load demo data$/ }).count()
  }
  const importerDemo = await pageAs(importer, `/app/${WS2}/dashboard`, demoOffered)
  const managerDemo = await pageAs(manager, `/app/${WS2}/dashboard`, demoOffered)
  chk(
    importerGranted && importerDemo === 1 && managerDemo === 0,
    'an empty workspace’s dashboard offers Load demo data to the member granted workspace.import, and not to the manager',
    `importer ${importerGranted ? importerDemo : 'NOT GRANTED'}; manager ${managerDemo}`,
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
  if (WS2 && A) {
    const gone = await A(`/workspaces/${WS2}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${WS2} answered ${gone.status || 'nothing'}`)
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

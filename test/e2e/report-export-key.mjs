/**
 * A REPORT IS EXPORTED BY WHOEVER HOLDS `report.export`, AND VIEWED BY
 * WHOEVER HOLDS `report.view.basic` — TWO KEYS, AS THE ROLE EDITOR SAYS.
 *
 * NOT A FRAME ROW: `role-editor-offers-unenforced-permissions`, its fourth
 * group. The reports API asked `report.view.basic` of every route, the three
 * exports among them, and `report.export` of none; the reports page and the
 * report builder offered Export CSV, Print / PDF and Export PDF to everyone who
 * could open them. So the editor's "Export reports" gated nothing: a guest
 * granted only viewing downloaded every report, and taking the key away (or
 * never giving it) changed nothing.
 *
 * ClickUp (help centre "Default user role permissions", "Export List and Table
 * views", search snippets): exporting is its own permission ("Export Views"),
 * covering dashboard cards among the rest, and a guest exports nothing by
 * default. Here a member holds both keys by default and a guest neither; a
 * custom role gives a guest viewing without exporting, or both.
 *
 *   node test/e2e/report-export-key.mjs --api 3021 --dist /tmp/claude-0/dist-1
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
const TAG = `rek${stamp}`
const PASSWORD = 'ReportExport@12345!'
const DEFINITION = { dimension: 'status', metrics: ['tasks-count'], days: 30 }

const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, type, data, error}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the grants are read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id

  const person = async (key, role) => {
    const email = `${TAG}-${key}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `Reports ${key}`, email, password: PASSWORD, organizationName: `Reports ${key} ${stamp}`, organizationSlug: `reports-${key}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (added.status >= 300) throw new Error(`could not add the ${key}: ${said(added)}`)
    const [row] = await sql`select u.id, m.id as member_id from users u join workspace_members m on m.user_id = u.id and m.workspace_id = ${WS} where u.email = ${email}`
    return { id: row.id, memberId: row.member_id, email, password: PASSWORD, as: apiAs(signed.accessToken) }
  }
  const grant = async (who, name, permissions) => {
    const role = await A(`/workspaces/${WS}/roles`, { method: 'POST', body: { name: `${TAG} ${name}`, permissions } })
    const given = role.data?.id ? await A(`/workspaces/${WS}/members/${who.memberId}/roles/${role.data.id}`, { method: 'POST', body: {} }) : { status: 0 }
    if (given.status >= 300) throw new Error(`could not grant ${name}: ${said(role)} ${said(given)}`)
  }
  // Two guests: one granted viewing alone, one granted viewing and exporting.
  const viewer = await person('viewer', 'guest')
  const exporter = await person('exporter', 'guest')
  const member = await person('member', 'member')
  await grant(viewer, 'viewers', ['report.view.basic'])
  await grant(exporter, 'exporters', ['report.view.basic', 'report.export'])

  // ══ 1. THE CSV EXPORT ════════════════════════════════════════════════════
  console.log('\n▶ a custom report as CSV: the guest who may only view, the guest who may export, a member')
  const csvAs = (who) => who.as(`/workspaces/${WS}/reports/custom/export`, { method: 'POST', body: DEFINITION })
  const viewerCsv = await csvAs(viewer)
  const exporterCsv = await csvAs(exporter)
  const memberCsv = await csvAs(member)
  chk(
    viewerCsv.status === 403 && exporterCsv.status < 300 && /text\/csv/.test(exporterCsv.type) && memberCsv.status < 300,
    'a guest granted report.view.basic alone downloads no CSV (403) — a guest granted report.export too does, and so does a member',
    `viewer ${said(viewerCsv)}; exporter ${exporterCsv.status} ${exporterCsv.type}; member ${memberCsv.status}`,
  )

  // ══ 2. THE PDF EXPORT ════════════════════════════════════════════════════
  console.log('\n▶ a custom report as PDF')
  const pdfAs = (who) => who.as(`/workspaces/${WS}/reports/custom/export.pdf`, { method: 'POST', body: DEFINITION })
  const viewerPdf = await pdfAs(viewer)
  const exporterPdf = await pdfAs(exporter)
  chk(
    viewerPdf.status === 403 && exporterPdf.status < 300 && /application\/pdf/.test(exporterPdf.type),
    'a guest granted report.view.basic alone downloads no PDF (403) — a guest granted report.export too does',
    `viewer ${said(viewerPdf)}; exporter ${exporterPdf.status} ${exporterPdf.type}`,
  )

  // ══ 3. VIEWING IS NOT EXPORTING ══════════════════════════════════════════
  console.log('\n▶ running the report, which is viewing it')
  const viewerRuns = await viewer.as(`/workspaces/${WS}/reports/custom/run`, { method: 'POST', body: DEFINITION })
  const viewerOverview = await viewer.as(`/workspaces/${WS}/reports/overview`)
  chk(
    viewerRuns.status < 300 && Array.isArray(viewerRuns.data?.rows) && viewerOverview.status === 200,
    'the guest who may only view still runs the report and reads the overview — viewing asks report.view.basic alone',
    `run ${said(viewerRuns)}; overview ${said(viewerOverview)}`,
  )

  // ══ 4. THE REPORTS PAGE ══════════════════════════════════════════════════
  console.log('\n▶ the reports page and its builder, for each guest')
  browser = await (await resolveChromium()).launch(launchOptions())
  const reportsPage = async (who) => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } })
    const page = await ctx.newPage()
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', who.email)
    await page.fill('input[type=password]', who.password)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
    await page.goto(`${B}/app/${WS}/reports`, { waitUntil: 'domcontentloaded' })
    // The header draws the moment the page does; what it offers waits on the person's permissions.
    await page.getByRole('heading', { name: 'Reports' }).first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
    await waitUntil(async () => (await page.getByRole('button', { name: /Export CSV|Print \/ PDF/ }).count()) > 0, { timeoutMs: 4000 })
    const header = {
      exportCsv: await page.getByRole('button', { name: /Export CSV/ }).count().catch(() => -1),
      printPdf: await page.getByRole('button', { name: /Print \/ PDF/ }).count().catch(() => -1),
    }
    await page.goto(`${B}/app/${WS}/reports?tab=custom`, { waitUntil: 'domcontentloaded' })
    await page.getByText('Metrics', { exact: false }).first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
    await waitUntil(async () => (await page.getByRole('button', { name: /^Export PDF$/ }).count()) > 0, { timeoutMs: 4000 })
    const builder = {
      exportPdf: await page.getByRole('button', { name: /^Export PDF$/ }).count().catch(() => -1),
      exportCsv: await page.getByRole('button', { name: /^Export CSV$/ }).count().catch(() => -1),
    }
    await ctx.close().catch(() => {})
    return { header, builder }
  }
  const viewerSees = await reportsPage(viewer)
  const exporterSees = await reportsPage(exporter)
  chk(
    viewerSees.header.exportCsv === 0 && viewerSees.header.printPdf === 0
      && exporterSees.header.exportCsv === 1 && exporterSees.header.printPdf === 1,
    'the reports page offers the guest who may only view neither Export CSV nor Print / PDF — and offers both to the guest who may export',
    `viewer ${JSON.stringify(viewerSees.header)}; exporter ${JSON.stringify(exporterSees.header)}`,
  )
  chk(
    viewerSees.builder.exportPdf === 0 && viewerSees.builder.exportCsv === 0
      && exporterSees.builder.exportPdf === 1 && exporterSees.builder.exportCsv >= 1,
    'the report builder offers the guest who may only view no Export PDF or Export CSV — and offers both to the guest who may export',
    `viewer ${JSON.stringify(viewerSees.builder)}; exporter ${JSON.stringify(exporterSees.builder)}`,
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

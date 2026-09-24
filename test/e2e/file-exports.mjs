/**
 * A FILE EXPORT DOWNLOADS THE FILE.
 *
 * NOT A FRAME ROW: `found-24-sep/report-exports-wrapped-in-the-envelope`. The
 * global response envelope wrapped every return value as `{ data, meta, error }`
 * — a `StreamableFile` and a string a handler had declared `text/csv` alike.
 * Measured on lane 1 before the fix, as the admin: the custom report's CSV and
 * the audit log's CSV answered 500 ("Attempted to send payload of invalid type
 * 'object'"), and the custom report's and the contribution report's PDFs came
 * back as JSON describing the file (`{"data":{"options":{"type":
 * "application/pdf"…`), not as the file.
 *
 * Each is downloaded here and read as what it claims to be: a CSV's content
 * type and header row, a PDF's content type and its `%PDF` signature. Then the
 * three export buttons in the app are clicked, and the file each one SAVES is
 * read the same way — the web keeps whatever blob it is handed, so a broken
 * export saved a `.pdf` holding JSON, or nothing at all.
 *
 * And the twin: a report that is not a file still arrives in the envelope,
 * because the fix is "files pass through", not "nothing is wrapped".
 *
 *   node test/e2e/file-exports.mjs --api 3021
 */
import fs from 'node:fs'
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'

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

const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
let browser = null
let WS = null
let token = null

const download = async (method, route, body) => {
  const res = await fetch(`${API}${route}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => null)
  if (!res) return { status: 0, type: '', bytes: Buffer.alloc(0) }
  return { status: res.status, type: res.headers.get('content-type') ?? '', bytes: Buffer.from(await res.arrayBuffer()) }
}
const head = (bytes) => JSON.stringify(bytes.subarray(0, 60).toString())
const said = (d) => `${d.status} ${d.type} ${d.bytes.length} bytes, starting ${head(d.bytes)}`
const isPdfBytes = (bytes) => bytes.subarray(0, 5).toString() === '%PDF-'
const isPdf = (d) => d.status < 300 && /application\/pdf/.test(d.type) && isPdfBytes(d.bytes)
/** A CSV's first row, its cells unquoted: the audit log quotes every cell, which is CSV all the same. */
const headerOf = (bytes) => bytes.toString().split('\n')[0].split(',').map((c) => c.trim().replace(/^"(.*)"$/, '$1')).join(',')

try {
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  token = auth.accessToken
  const api = async (route, init = {}) => {
    const res = await fetch(`${API}${route}`, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: init.body ? JSON.stringify(init.body) : undefined })
    const json = await res.json().catch(() => null)
    return { status: res.status, json, data: json?.data }
  }
  const me = (await api('/users/me')).data?.id
  const made = await api('/workspaces', { method: 'POST', body: { name: `exports-${Date.now()}` } })
  if (!made.data?.id) throw new Error(`could not make the workspace: ${made.status}`)
  WS = made.data.id
  // Something to report on: a space, a list, two tasks assigned to the admin
  // (the report builder opens grouped by assignee, and exports nothing empty).
  const space = (await api('/spaces', { method: 'POST', body: { workspaceId: WS, name: 'Exports' } })).data?.id
  const project = (await api('/projects', { method: 'POST', body: { spaceId: space, name: 'Exports' } })).data?.id
  const list = (await api('/lists', { method: 'POST', body: { projectId: project, name: 'Exports' } })).data?.id
  for (const title of ['first', 'second']) {
    const t = await api('/tasks', { method: 'POST', body: { listId: list, title, assigneeIds: [me] } })
    if (!t.data?.id) throw new Error(`could not make the task "${title}": ${t.status}`)
  }
  const definition = { dimension: 'status', metrics: ['tasks-count'], days: 30 }

  // ══ 1. THE CUSTOM REPORT ═════════════════════════════════════════════════
  console.log('\n▶ a custom report, as a spreadsheet and as a document')
  const csv = await download('POST', `/workspaces/${WS}/reports/custom/export`, definition)
  const firstLine = csv.bytes.toString().split('\n')[0]
  chk(
    csv.status < 300 && /text\/csv/.test(csv.type) && firstLine.startsWith('group,') && firstLine.includes('tasks-count'),
    'a custom report downloads as CSV: text/csv, its header row first',
    said(csv),
  )
  const pdf = await download('POST', `/workspaces/${WS}/reports/custom/export.pdf`, definition)
  chk(isPdf(pdf), 'and as a PDF: application/pdf, a file that begins %PDF-', said(pdf))
  const run = await api(`/workspaces/${WS}/reports/custom/run`, { method: 'POST', body: definition })
  chk(
    run.status < 300 && run.json?.error === null && Array.isArray(run.data?.rows) && run.data.rows.length > 0,
    'while the same report run for the screen still arrives in the envelope: { data: { rows }, error: null }',
    `${run.status} ${JSON.stringify(run.json).slice(0, 120)}`,
  )

  // ══ 2. THE OTHER TWO ═════════════════════════════════════════════════════
  console.log('\n▶ the contribution report and the audit log')
  const contribution = await download('POST', `/workspaces/${WS}/reports/contribution.pdf`, {})
  chk(isPdf(contribution), 'the contribution report downloads as a PDF that begins %PDF-', said(contribution))
  const audit = await download('GET', `/workspaces/${WS}/audit-logs/export`)
  chk(
    audit.status < 300 && /text\/csv/.test(audit.type) && headerOf(audit.bytes).startsWith('Timestamp,Actor,Action'),
    'the audit log downloads as CSV, its header row first',
    said(audit),
  )

  // ══ 3. THE BUTTONS ═══════════════════════════════════════════════════════
  console.log('\n▶ each export button in the app saves the file it names')
  browser = await chromium.launch(launchOptions())
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
  const page = await ctx.newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ADMIN.email)
  await page.fill('input[type=password]', ADMIN.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})

  /** Click, and read what the browser saved — or say that nothing was. */
  const saved = async (button) => {
    await button.waitFor({ state: 'visible', timeout: 20_000 })
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 20_000 }).catch(() => null),
      button.click(),
    ])
    if (!dl) return { name: null, bytes: Buffer.alloc(0) }
    return { name: dl.suggestedFilename(), bytes: fs.readFileSync(await dl.path()) }
  }
  const told = (f) => (f.name ? `saved ${f.name}, ${f.bytes.length} bytes, starting ${head(f.bytes)}` : 'nothing was saved')

  await page.goto(`${B}/app/${WS}/insights`, { waitUntil: 'domcontentloaded' })
  const contribFile = await saved(page.getByRole('button', { name: /Download PDF/ }))
  chk(
    contribFile.name?.endsWith('.pdf') && isPdfBytes(contribFile.bytes),
    'Insights → Download PDF saves a .pdf that begins %PDF-',
    told(contribFile),
  )

  await page.goto(`${B}/app/${WS}/reports?tab=custom`, { waitUntil: 'domcontentloaded' })
  // The builder exports only a report with rows in it: wait for the preview.
  await page.getByRole('button', { name: /^Export PDF$/ }).waitFor({ state: 'visible', timeout: 20_000 })
  await page.waitForFunction(() => !document.body.innerText.includes('Running'), null, { timeout: 20_000 }).catch(() => {})
  const reportFile = await saved(page.getByRole('button', { name: /^Export PDF$/ }))
  chk(
    reportFile.name?.endsWith('.pdf') && isPdfBytes(reportFile.bytes),
    'Reports → custom → Export PDF saves a .pdf that begins %PDF-',
    told(reportFile),
  )

  await page.goto(`${B}/app/admin/audit`, { waitUntil: 'domcontentloaded' })
  const auditFile = await saved(page.getByRole('button', { name: /Export CSV/ }))
  chk(
    auditFile.name?.endsWith('.csv') && headerOf(auditFile.bytes).startsWith('Timestamp,Actor,Action'),
    'Audit log → Export CSV saves a .csv whose first row is the header',
    told(auditFile),
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  if (WS && token) {
    await fetch(`${API}/workspaces/${WS}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } }).catch(() => {})
  }
  await browser?.close().catch(() => {})
  stack.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}

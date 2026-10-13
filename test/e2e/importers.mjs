/**
 * THE IMPORTERS AS CLICKUP HAS THEM (`commit-log/log-601eacc-2`, `ledger-rows/row-816`).
 *
 * Frame `12:08`'s Imports submenu names twelve rows. Rundesk read delimited
 * text and Markdown, and listed Basecamp, Confluence and Slack as words with a
 * reason and no control; an Excel workbook — what Monday and Wrike export —
 * was sent back to be saved as CSV, and a Word document refused. ClickUp reads
 * all of them (help centre, read through search excerpts, 13 October):
 *
 *   · its Spreadsheets Importer takes .xls, .xlsx, .csv, .json, .tsv and .txt;
 *   · its Docs import takes Word, HTML and Markdown;
 *   · Confluence comes in from the space's HTML export, as a Doc;
 *   · Slack from its export, public channels with threads and reactions, the
 *     newest 10 000 messages a channel, into Chat;
 *   · Basecamp by signing in to it: projects as Spaces (lists without Folders)
 *     or as Folders in one Space; to-dos as tasks with their descriptions,
 *     assignees and comments; to-do groups as statuses.
 *
 * This suite does each through the page, and reads back what was made — by
 * SQL where the page says less than the database knows. The workbooks and the
 * Word document are real ones, written by LibreOffice (`fixtures/importers/`);
 * the Confluence and Slack exports are put together here in their tools'
 * shapes; Basecamp is the lane's stub (`calendar-stub.mjs`).
 *
 *   DATABASE_URL=postgres://…/rundesk_v4 node test/e2e/importers.mjs --api 3024 --dist /tmp/claude-0/dist-4
 */
import path from 'node:path'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt, madeWorkspace } from './lib/fixture.mjs'
import { waitUntil, readText } from './lib/wait.mjs'
import { calendarBase, seedConsentCode, seedBasecamp, basecampAsked } from './lib/calendar.mjs'
import { zip } from './lib/unzip.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

const EXPECTED_CHECKS = 25

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
const STUB = calendarBase(API_PORT, argOf('--calendar', undefined))
const FIXTURES = path.resolve(import.meta.dirname, 'fixtures/importers')
const ADMIN = { email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal', password: process.env.E2E_PASSWORD ?? 'Admin@123!' }

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

const stamp = Date.now()
const TAG = `imp${stamp}`
const PASSWORD = 'Importers@12345!'
// The words the page and the server use (`import.sheetAccepted`, `DOC_IMPORT_ACCEPTS`).
const SHEET_ACCEPTED = 'Accepted: .csv · .tsv · .txt · .xlsx · .xls · .json.'
const DOC_ACCEPTED = 'Accepts Word (.docx), HTML (.html, .htm), Markdown (.md, .markdown) and plain text (.txt).'
const NOT_DELIMITED_TEXT = `This is a workbook or another binary file sent as text: upload the file itself and send its key, as the import page does. ${SHEET_ACCEPTED}`
// The person in the workbooks' Person column, and in the exports below: Ana, a member here.
const ANA_NAME = 'Ana Importer'

const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
const apiAs = apiAsAt(API, { emptyBodyOn: ['POST'] })
const said = (res) => `${res.status} ${JSON.stringify(res.message || null)}`

let sql = null
let browser = null
let WS = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — what each importer made is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  const A = apiAs(auth.accessToken)
  const [me] = await sql`select id from users where lower(email) = lower(${ADMIN.email})`
  const made = await A('/workspaces', { method: 'POST', body: { name: `Importers ${TAG}` } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  madeWorkspace(WS)

  const person = async (who, role, displayName) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: displayName, email, password: PASSWORD, organizationName: `Importers ${who} ${stamp}`, organizationSlug: `imp-${who}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (!added.ok) throw new Error(`could not add ${who}: ${said(added)}`)
    const [row] = await sql`select id from users where email = ${email}`
    await sql`update users set display_name = ${displayName} where id = ${row.id}`
    return { id: row.id, email, api: apiAs(signed.accessToken) }
  }
  const ana = await person('ana', 'member', ANA_NAME)
  const mia = await person('mia', 'member', `Mia ${stamp}`)

  /** A file put in the store for an import, as the page puts it: its key, or the refusal. */
  const upload = async (who, bytes, name, purpose, type = 'application/octet-stream') => {
    const signed = await who(`/workspaces/${WS}/import/files`, { method: 'POST', body: { fileName: name, contentType: type, sizeBytes: bytes.length, purpose } })
    if (!signed.ok) return { signed, fileKey: null }
    const put = await fetch(signed.data.uploadUrl, { method: 'PUT', body: bytes, headers: { 'content-type': type } })
    return { signed, put: put.status, fileKey: put.ok ? signed.data.fileKey : null }
  }
  /** An import job, followed to its end on the one job route. */
  const job = async (jobId) => {
    let row = null
    await waitUntil(async () => {
      const res = await A(`/workspaces/${WS}/import/spreadsheet/jobs/${jobId}`)
      row = res.data
      return row?.status === 'completed' || row?.status === 'failed'
    }, { timeoutMs: 60_000, stepMs: 400 })
    return row
  }

  const XLSX = readFileSync(path.join(FIXTURES, 'monday.xlsx'))
  const XLS = readFileSync(path.join(FIXTURES, 'wrike.xls'))
  const DOCX = readFileSync(path.join(FIXTURES, 'notes.docx'))

  // ── the page, as the admin ─────────────────────────────────────────────────
  const chromium = await resolveChromium()
  browser = await chromium.launch(launchOptions())
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  page.setDefaultTimeout(15_000)
  const uploadsAsked = []
  page.on('request', (r) => { if (r.url().includes('/import/files') && r.method() === 'POST') uploadsAsked.push(r.url()) })
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ADMIN.email)
  await page.fill('input[type=password]', ADMIN.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.goto(`${B}/app/${WS}/import`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('import-tabs').waitFor({ timeout: 20_000 })

  // ══ 1. EVERY ROW OF THE SUBMENU IS AN IMPORTER ═══════════════════════════
  console.log('\n▶ the Imports page: an importer for every row, and no list of what cannot be imported')
  await page.getByTestId('import-source-picker').waitFor({ timeout: 15_000 })
  const tabs = {}
  for (const key of ['sheet', 'doc', 'confluence', 'basecamp', 'slack', 'clickup']) tabs[key] = await page.getByTestId(`import-tab-${key}`).count()
  const notImportable = await page.getByTestId('import-unsupported').count()
  chk(
    Object.values(tabs).every((n) => n === 1) && notImportable === 0,
    'the Imports page has a tab for Spreadsheet files, Document files, Confluence, Basecamp, Slack and ClickUp — and no box of tools it cannot import',
    `tabs ${JSON.stringify(tabs)}; ${notImportable} "not importable" box(es)`,
  )

  // ══ 2. AN EXCEL WORKBOOK, AS MONDAY EXPORTS ONE ═══════════════════════════
  console.log('\n▶ a Monday board exported to Excel, imported as it was downloaded')
  await page.getByTestId('import-source-monday').click({ timeout: 5000 }).catch(() => {})
  await page.getByTestId('import-sheet-file').setInputFiles({ name: `monday-${TAG}.xlsx`, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX }, { timeout: 5000 }).catch(() => {})
  const uploaded = await waitUntil(async () => (await page.getByTestId('import-sheet-filename').getAttribute('data-uploaded').catch(() => null)) === 'true', { timeoutMs: 20_000 })
  const previewed = page.waitForResponse((r) => r.url().includes('/import/spreadsheet/preview') && r.request().method() === 'POST', { timeout: 30_000 }).catch(() => null)
  await page.getByTestId('import-sheet-preview').click({ timeout: 5000 }).catch(() => {})
  const previewRes = await previewed.catch(() => null)
  const preview = previewRes ? ((await previewRes.json().catch(() => null))?.data ?? null) : null
  await page.getByTestId('import-sheet-review').waitFor({ timeout: 20_000 }).catch(() => {})
  const readFrom = page.getByTestId('import-sheet-read-from')
  const readFromFormat = await readFrom.getAttribute('data-format').catch(() => null)
  const mapped = {}
  for (const h of preview?.headers ?? []) mapped[h] = await page.locator(`[data-column="${h}"]`).inputValue().catch(() => null)
  chk(
    uploaded && readFromFormat === 'xlsx' && preview?.format === 'xlsx' &&
      mapped.Name === 'title' && mapped.Status === 'status' && mapped.Date === 'dueDate' && mapped.Person === 'assignees' && mapped.Group === 'list',
    'the workbook is uploaded as it is and read from its sheet — the page says which — and Monday’s columns map: Name, Status, Date and Person, and each item’s group as its list',
    JSON.stringify({ uploaded, readFromFormat, format: preview?.format, headers: preview?.headers, mapped }),
  )
  // Monday's export is no one table: the board's name, then each group's name, its column names again, its items and its sums.
  const layout = page.getByTestId('import-sheet-layout')
  const layoutSeen = {
    kind: await layout.getAttribute('data-kind').catch(() => null),
    board: await layout.getAttribute('data-board').catch(() => null),
    groups: await layout.getAttribute('data-groups').catch(() => null),
    leftOut: await layout.getAttribute('data-left-out').catch(() => null),
  }
  const projectPrefill = await page.getByTestId('import-sheet-project').inputValue().catch(() => null)
  chk(
    preview?.importableRows === 3 && preview?.totalRows === 3 && layoutSeen.kind === 'board' && layoutSeen.board === 'Launch board' && layoutSeen.groups === '2' && layoutSeen.leftOut === '1' &&
      projectPrefill === 'Launch board',
    'it is read as Monday writes a board: three items under two groups, the board’s and groups’ names, the repeated column names and the row of sums no task — the page says so, and names the import after the board',
    JSON.stringify({ importable: preview?.importableRows, total: preview?.totalRows, layout: preview?.layout ?? null, layoutSeen, projectPrefill }),
  )
  await page.getByTestId('import-sheet-project').fill(`Monday ${TAG}`, { timeout: 5000 }).catch(() => {})
  await page.getByTestId('import-sheet-start').click({ timeout: 5000 }).catch(() => {})
  const reported = await waitUntil(async () => (await page.getByTestId('import-sheet-report').count()) > 0, { timeoutMs: 45_000 })
  const created = Number(await page.getByTestId('import-sheet-r-created').getAttribute('data-value').catch(() => -1))
  const listsMade = Number(await page.getByTestId('import-sheet-r-lists').getAttribute('data-value').catch(() => -1))
  const linked = Number(await page.getByTestId('import-sheet-r-assignees').getAttribute('data-value').catch(() => -1))
  chk(
    reported && created === 3 && listsMade === 2 && linked === 1,
    'importing it makes its three rows tasks in its two groups’ lists, and puts Ana on the one her name is on',
    JSON.stringify({ reported, created, listsMade, linked }),
  )
  const xlsxTasks = await sql`
    select t.title, t.status, t.status_category, t.due_date, t.due_date_has_time, l.name as list,
           (select count(*)::int from task_assignees a where a.task_id = t.id and a.user_id = ${ana.id}) as ana
    from tasks t join lists l on l.id = t.list_id join projects p on p.id = l.project_id join spaces s on s.id = p.space_id
    where s.workspace_id = ${WS} and s.name = ${`Monday ${TAG}`} order by t.title`
  const byTitle = Object.fromEntries(xlsxTasks.map((t) => [t.title, t]))
  const ship = byTitle['Ship the importer']
  const guide = byTitle['Write the guide']
  chk(
    xlsxTasks.length === 3 && ship?.status === 'done' && ship?.status_category === 'closed' && ship?.ana === 1 && ship?.list === 'Launch' &&
      ship?.due_date?.toISOString?.().startsWith('2026-10-20') && ship?.due_date_has_time === false &&
      guide?.due_date_has_time === true && guide?.status === 'in_progress' && guide?.list === 'Launch' && byTitle['Plan Q4']?.list === 'Backlog',
    'the workbook’s cells come through as Excel shows them: a date as its day, a date with a time as both, Done as done and closed, Working on it as in progress, Ana assigned, each task in its group’s list (read by SQL)',
    JSON.stringify(xlsxTasks.map((t) => ({ ...t, due_date: t.due_date?.toISOString?.() ?? null }))),
  )

  console.log('\n▶ a file of no kind the import reads, put in anyway')
  const uploadsBefore = uploadsAsked.length
  await page.getByTestId('import-sheet-file').setInputFiles({ name: `report-${TAG}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\n%âã\n') }, { timeout: 5000 }).catch(() => {})
  await waitUntil(async () => (await page.getByTestId('import-sheet-not-text').count()) > 0, { timeoutMs: 8000 })
  const refusedSheet = (await readText(page.getByTestId('import-sheet-not-text').filter({ visible: true }))) ?? ''
  chk(
    refusedSheet.includes(SHEET_ACCEPTED) && uploadsAsked.length === uploadsBefore && (await page.getByTestId('import-sheet-filename').count()) === 0,
    'a PDF is refused by its name in the words under the picker — the six kinds read — and nothing is uploaded or kept',
    `the page said ${JSON.stringify(refusedSheet)}; ${uploadsAsked.length - uploadsBefore} upload(s) asked`,
  )

  // ══ 3. A LEGACY WORKBOOK, A JSON LIST, AND WHAT THE API REFUSES ══════════
  console.log('\n▶ a Wrike folder exported to Excel 97–2003, and a JSON list, through the API')
  const xls = await upload(A, XLS, `wrike-${TAG}.xls`, 'sheet', 'application/vnd.ms-excel')
  const xlsPreview = xls.fileKey ? await A(`/workspaces/${WS}/import/spreadsheet/preview`, { method: 'POST', body: { fileKey: xls.fileKey, fileName: `wrike-${TAG}.xls`, preset: 'wrike' } }) : { status: 0 }
  const xlsRun = xls.fileKey ? await A(`/workspaces/${WS}/import/spreadsheet`, { method: 'POST', body: { fileKey: xls.fileKey, fileName: `wrike-${TAG}.xls`, preset: 'wrike', targetProjectName: `Legacy ${TAG}` } }) : { status: 0 }
  const xlsJob = xlsRun.data?.jobId ? await job(xlsRun.data.jobId) : null
  const xlsTasks = await sql`
    select t.title, t.due_date, l.name as list
    from tasks t join lists l on l.id = t.list_id join projects p on p.id = l.project_id join spaces s on s.id = p.space_id
    where s.workspace_id = ${WS} and s.name = ${`Legacy ${TAG}`} order by t.title`
  // Its own titles and folders: a task the Monday board already made in a list of the same name is a duplicate, and is skipped.
  const xlsMoved = xlsTasks.find((t) => t.title === 'Move the backlog over')
  chk(
    xlsPreview.data?.format === 'xls' && xlsPreview.data?.importableRows === 3 && xlsPreview.data?.layout?.kind === 'keyed' && xlsPreview.data?.layout?.repeated === 1 &&
      xlsJob?.status === 'completed' && xlsJob?.createdCount === 3 && xlsTasks.length === 3 &&
      xlsTasks.filter((t) => t.title === 'Write the release notes').length === 1 && xlsMoved?.list === 'Migration' && xlsMoved?.due_date?.toISOString?.().startsWith('2026-10-20'),
    'a legacy .xls is read from its compound file and imported as Wrike exports a folder: the task it lists in two folders made once, each in its folder’s list, the date a date',
    JSON.stringify({ upload: xls.signed?.status, put: xls.put, preview: said(xlsPreview), format: xlsPreview.data?.format, rows: xlsPreview.data?.importableRows, layout: xlsPreview.data?.layout ?? null, job: xlsJob?.status, created: xlsJob?.createdCount, error: xlsJob?.error, tasks: xlsTasks.map((t) => ({ ...t, due_date: t.due_date?.toISOString?.() ?? null })) }),
  )
  const JSON_LIST = Buffer.from(JSON.stringify({ tasks: [{ name: `Json one ${TAG}`, status: 'In progress', tags: ['alpha', 'beta'] }, { name: `Json two ${TAG}`, assignee: { email: ana.email } }] }))
  const js = await upload(A, JSON_LIST, `tasks-${TAG}.json`, 'sheet', 'application/json')
  const jsRun = js.fileKey ? await A(`/workspaces/${WS}/import/spreadsheet`, { method: 'POST', body: { fileKey: js.fileKey, fileName: `tasks-${TAG}.json`, targetProjectName: `Json ${TAG}` } }) : { status: 0 }
  const jsJob = jsRun.data?.jobId ? await job(jsRun.data.jobId) : null
  const jsTasks = await sql`
    select t.title, t.status, (select count(*)::int from task_assignees a where a.task_id = t.id and a.user_id = ${ana.id}) as ana,
           (select count(*)::int from task_label_assignments x where x.task_id = t.id) as tags
    from tasks t join lists l on l.id = t.list_id join projects p on p.id = l.project_id join spaces s on s.id = p.space_id where s.workspace_id = ${WS} and s.name = ${`Json ${TAG}`} order by t.title`
  chk(
    jsJob?.status === 'completed' && jsTasks.length === 2 && jsTasks[0].status === 'in_progress' && jsTasks[0].tags === 2 && jsTasks[1].ana === 1,
    'a JSON list of tasks is read as rows: its keys the columns, a list of tags as tags, a person by their email',
    JSON.stringify({ job: jsJob?.status, error: jsJob?.error, tasks: jsTasks }),
  )
  const asText = new TextDecoder('utf-8').decode(XLSX)
  const textPreview = await A(`/workspaces/${WS}/import/spreadsheet/preview`, { method: 'POST', body: { content: asText } })
  const textRun = await A(`/workspaces/${WS}/import/spreadsheet`, { method: 'POST', body: { content: asText, targetProjectName: `Text ${TAG}` } })
  const [{ n: textSpaces }] = await sql`select count(*)::int as n from spaces where workspace_id = ${WS} and name = ${`Text ${TAG}`}`
  chk(
    textPreview.status === 400 && textPreview.message === NOT_DELIMITED_TEXT && textRun.status === 400 && textRun.message === NOT_DELIMITED_TEXT && textSpaces === 0,
    'a workbook’s bytes sent as text are still refused — preview and import say to send the file itself — and nothing is made',
    `preview ${said(textPreview)}; import ${said(textRun)}; ${textSpaces} space(s)`,
  )
  const miaFile = await upload(mia.api, Buffer.from('Title\nMia row\n'), `mia-${TAG}.csv`, 'sheet', 'text/csv')
  const miaPreview = miaFile.fileKey ? await mia.api(`/workspaces/${WS}/import/spreadsheet/preview`, { method: 'POST', body: { fileKey: miaFile.fileKey, fileName: 'mia.csv' } }) : { status: 0 }
  const othersKey = miaFile.fileKey ? await A(`/workspaces/${WS}/import/spreadsheet/preview`, { method: 'POST', body: { fileKey: miaFile.fileKey, fileName: 'mia.csv' } }) : { status: 0 }
  chk(
    miaPreview.status === 403 && othersKey.status === 403 && /not uploaded by you/.test(othersKey.message ?? ''),
    'a member without the Import data permission is refused the import of her own file, and nobody imports a file somebody else uploaded',
    `Mia’s preview ${said(miaPreview)}; the admin naming Mia’s key ${said(othersKey)}`,
  )

  // ══ 4. WORD, HTML ════════════════════════════════════════════════════════
  console.log('\n▶ a Word document and an HTML page become Docs')
  await page.getByTestId('import-tab-doc').click({ timeout: 5000 }).catch(() => {})
  await page.getByTestId('import-doc-file').setInputFiles({ name: `notes-${TAG}.docx`, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: DOCX }, { timeout: 5000 }).catch(() => {})
  await waitUntil(async () => (await page.getByTestId('import-doc-result').count()) > 0 || (await page.getByTestId('import-doc-error').count()) > 0, { timeoutMs: 25_000 })
  const docxId = await page.getByTestId('import-doc-result').getAttribute('data-doc-id').catch(() => null)
  const docxError = (await readText(page.getByTestId('import-doc-error').filter({ visible: true }), { timeoutMs: 1000 })) ?? null
  const docxDoc = docxId ? await A(`/docs/${docxId}`) : { status: 0, data: null }
  const blocks = docxDoc.data?.content?.content ?? []
  const types = blocks.map((b) => b.type)
  const text = JSON.stringify(blocks)
  chk(
    docxDoc.status === 200 && docxDoc.data?.title === 'Release notes' && types.includes('heading') && types.includes('bulletList') &&
      types.includes('orderedList') && types.includes('table') && text.includes('"bold"') && text.includes('https://example.com/changelog'),
    'a .docx becomes a Doc titled by its Title paragraph, its headings, bulleted and numbered lists, table, bold and link kept',
    JSON.stringify({ status: docxDoc.status, title: docxDoc.data?.title, types, error: docxError }),
  )
  const HTML = `<!doctype html><html><head><title>Handbook ${TAG}</title></head><body><h1>Handbook ${TAG}</h1><h2>Leave</h2><p>Ask <a href="https://example.com/hr">HR</a>.</p></body></html>`
  const html = await upload(A, Buffer.from(HTML), `handbook-${TAG}.html`, 'doc', 'text/html')
  const htmlDoc = html.fileKey ? await A(`/workspaces/${WS}/docs/import`, { method: 'POST', body: { fileKey: html.fileKey, fileName: `handbook-${TAG}.html` } }) : { status: 0 }
  const htmlBlocks = htmlDoc.data?.content?.content ?? []
  chk(
    htmlDoc.status < 300 && htmlDoc.data?.title === `Handbook ${TAG}` && htmlBlocks[0]?.type === 'heading' && htmlBlocks[0]?.attrs?.level === 2,
    'an .html page becomes a Doc titled by its <title>, its first heading not said twice',
    JSON.stringify({ status: htmlDoc.status, title: htmlDoc.data?.title, first: htmlBlocks[0] ?? null, message: htmlDoc.message ?? null }),
  )
  await page.getByTestId('import-doc-file').setInputFiles({ name: `scan-${TAG}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\n') }, { timeout: 5000 }).catch(() => {})
  await waitUntil(async () => ((await readText(page.getByTestId('import-doc-error').filter({ visible: true }), { timeoutMs: 1000 })) ?? '').includes('scan-'), { timeoutMs: 15_000 })
  const docRefusal = (await readText(page.getByTestId('import-doc-error').filter({ visible: true }))) ?? ''
  chk(
    docRefusal.includes(DOC_ACCEPTED),
    'a PDF is refused naming the kinds a document import reads: Word, HTML, Markdown and plain text',
    `the page said ${JSON.stringify(docRefusal)}`,
  )

  // ══ 5. CONFLUENCE ════════════════════════════════════════════════════════
  console.log('\n▶ a Confluence space’s HTML export becomes one Doc with its pages in it')
  const SPACE = `Team Space ${TAG}`
  const cpage = (title, body, crumbs = []) =>
    `<html><head><title>${SPACE} : ${title}</title></head><body><div id="main-header"><ol id="breadcrumbs"><li class="first"><a href="index.html">${SPACE}</a></li>` +
    crumbs.map(([href, name]) => `<li><a href="${href}">${name}</a></li>`).join('') +
    `</ol><h1 id="title-heading"><span id="title-text">${SPACE} : ${title}</span></h1></div><div class="page-metadata">Created by Ana</div><div id="main-content" class="wiki-content">${body}</div></body></html>`
  const CONFLUENCE = zip({
    'TS/index.html':
      `<html><head><title>${SPACE}</title></head><body><h1 id="title-heading"><span id="title-text">${SPACE}</span></h1>` +
      '<div class="pageSection"><div class="pageSectionHeader"><h2 class="pageSectionTitle">Available Pages:</h2></div>' +
      '<ul><li><a href="Home_1.html">Home</a><ul><li><a href="Runbooks_2.html">Runbooks</a><ul><li><a href="Deploy_3.html">Deploy</a></li></ul></li><li><a href="Gone_9.html">Gone</a></li></ul></li></ul></div></body></html>',
    'TS/Home_1.html': cpage('Home', '<p>Welcome to the space.</p>'),
    'TS/Runbooks_2.html': cpage('Runbooks', '<h2>On call</h2><ul><li>Rota</li></ul>', [['Home_1.html', 'Home']]),
    'TS/Deploy_3.html': cpage('Deploy', '<ol><li>Build</li><li>Ship</li></ol>', [['Home_1.html', 'Home'], ['Runbooks_2.html', 'Runbooks']]),
    'TS/styles/site.css': 'body{}',
  })
  await page.getByTestId('import-tab-confluence').click({ timeout: 5000 }).catch(() => {})
  await page.getByTestId('import-confluence-file').setInputFiles({ name: `confluence-${TAG}.zip`, mimeType: 'application/zip', buffer: CONFLUENCE }, { timeout: 5000 }).catch(() => {})
  await waitUntil(async () => (await page.getByTestId('import-confluence-result').count()) > 0 || (await page.getByTestId('import-confluence-error').count()) > 0, { timeoutMs: 30_000 })
  const rootId = await page.getByTestId('import-confluence-result').getAttribute('data-doc-id').catch(() => null)
  const pagesShown = Number(await page.getByTestId('import-confluence-result').getAttribute('data-pages').catch(() => -1))
  const missingShown = Number(await page.getByTestId('import-confluence-missing').getAttribute('data-count').catch(() => -1))
  const confluenceError = (await readText(page.getByTestId('import-confluence-error').filter({ visible: true }), { timeoutMs: 1000 })) ?? null
  chk(
    !!rootId && pagesShown === 3 && missingShown === 1 && ((await readText(page.getByTestId('import-confluence-open'))) ?? '') === SPACE,
    'the page reports the Doc it made, named for the space, with its three pages — and names the one page the export lacks',
    JSON.stringify({ rootId, pagesShown, missingShown, error: confluenceError }),
  )
  const tree = rootId
    ? await sql`
        with recursive t as (select id, title, parent_doc_id, position, 0 as depth from docs where id = ${rootId}
          union all select d.id, d.title, d.parent_doc_id, d.position, t.depth + 1 from docs d join t on d.parent_doc_id = t.id)
        select t.title, t.depth, t.position, d.plaintext from t join docs d on d.id = t.id order by t.depth, t.position`
    : []
  const at = Object.fromEntries(tree.map((d) => [d.title, d]))
  chk(
    tree.length === 4 && at[SPACE]?.depth === 0 && at.Home?.depth === 1 && at.Runbooks?.depth === 2 && at.Deploy?.depth === 3 &&
      /Build/.test(at.Deploy?.plaintext ?? '') && !/Created by/.test(at.Home?.plaintext ?? ''),
    'its pages are nested as the space nests them — Home, Runbooks under it, Deploy under that — each holding only its own words (read by SQL)',
    JSON.stringify(tree.map(({ title, depth, position, plaintext }) => ({ title, depth, position, plaintext: String(plaintext ?? '').slice(0, 40) }))),
  )
  const notExport = await upload(A, zip({ 'notes.txt': 'x' }), `notes-${TAG}.zip`, 'confluence', 'application/zip')
  const notExportRes = notExport.fileKey ? await A(`/workspaces/${WS}/docs/import/confluence`, { method: 'POST', body: { fileKey: notExport.fileKey } }) : { status: 0 }
  chk(
    notExportRes.status === 400 && /not a Confluence space export/.test(notExportRes.message ?? '') && /Export space › HTML/.test(notExportRes.message ?? ''),
    'a zip that is no space export is refused, saying how to make the one that is',
    said(notExportRes),
  )

  // ══ 6. SLACK ═════════════════════════════════════════════════════════════
  console.log('\n▶ a Slack export’s public channels come into Chat')
  // The workspace's own #general first, so the export's #general has a name of its own to take.
  await A(`/workspaces/${WS}/chat/channels`)
  const BEN = `ben-${TAG}@elsewhere.invalid`
  const ts = (n) => `${1759300000 + n}.000100`
  const SLACK = zip({
    'users.json': JSON.stringify([
      { id: 'U1', name: 'ana', profile: { display_name: 'Ana', real_name: ANA_NAME, email: ana.email } },
      { id: 'U2', name: 'ben', profile: { real_name: 'Ben Okafor', email: BEN } },
    ]),
    'channels.json': JSON.stringify([
      { id: 'C1', name: 'general', is_archived: false, topic: { value: `Launch ${TAG}` }, purpose: { value: 'Everyone here' }, members: ['U1', 'U2'] },
      { id: 'C2', name: 'random', is_archived: true, topic: { value: '' }, purpose: { value: '' }, members: ['U1'] },
    ]),
    'dms.json': JSON.stringify([{ id: 'D1' }]),
    'general/2025-10-01.json': JSON.stringify([
      { type: 'message', subtype: 'channel_join', user: 'U2', text: '<@U2> has joined the channel', ts: ts(0) },
      { type: 'message', user: 'U1', text: `Kickoff ${TAG}`, ts: ts(10), reactions: [{ name: '+1', users: ['U1', 'U2'], count: 2 }] },
      { type: 'message', user: 'U2', text: 'Count me in', ts: ts(20), thread_ts: ts(10) },
      { type: 'message', user: 'U2', text: 'Thanks <@U1> for <https://example.com/plan|the plan>', ts: ts(30) },
      { type: 'message', subtype: 'bot_message', username: 'Deploy Bot', text: 'Deployed', ts: ts(40) },
    ]),
    'random/2025-09-01.json': JSON.stringify([{ type: 'message', user: 'U1', text: 'Old talk', ts: ts(-100000) }]),
  })
  await page.getByTestId('import-tab-slack').click({ timeout: 5000 }).catch(() => {})
  await page.getByTestId('import-slack-file').setInputFiles({ name: `slack-${TAG}.zip`, mimeType: 'application/zip', buffer: SLACK }, { timeout: 5000 }).catch(() => {})
  await page.getByTestId('import-slack-preview').waitFor({ timeout: 30_000 }).catch(() => {})
  const generalCount = Number(await page.getByTestId('import-slack-count-general').getAttribute('data-messages').catch(() => -1))
  const people = page.getByTestId('import-slack-people')
  const members = Number(await people.getAttribute('data-members').catch(() => -1))
  const peopleTotal = Number(await people.getAttribute('data-total').catch(() => -1))
  chk(
    generalCount === 4 && (await page.getByTestId('import-slack-channel-random').count()) === 1 && members === 1 && peopleTotal === 2,
    'the preview lists the public channels and their messages — a join is no message — and how many of its people are members here',
    JSON.stringify({ generalCount, members, peopleTotal }),
  )
  await page.getByTestId('import-slack-channel-random').uncheck({ timeout: 5000 }).catch(() => {})
  await page.getByTestId('import-slack-start').click({ timeout: 5000 }).catch(() => {})
  await page.getByTestId('import-slack-report').waitFor({ timeout: 60_000 }).catch(() => {})
  const fig = async (k) => Number(await page.getByTestId(`import-slack-r-${k}`).getAttribute('data-value').catch(() => -1))
  const slackReport = { channels: await fig('channels'), messages: await fig('messages'), replies: await fig('replies'), reactions: await fig('reactions') }
  chk(
    slackReport.channels === 1 && slackReport.messages === 4 && slackReport.replies === 1 && slackReport.reactions === 1,
    'importing the one channel chosen brings its four messages, its reply in its thread, and the reaction of the one person who is a member here',
    JSON.stringify(slackReport),
  )
  const [channel] = await sql`select id, name, topic, description, archived_at from chat_channels where workspace_id = ${WS} and topic = ${`Launch ${TAG}`}`
  const msgs = channel ? await sql`select id, body, author_id, imported_author, parent_message_id, mentions, created_at from chat_messages where channel_id = ${channel.id} order by created_at` : []
  const kickoff = msgs.find((m) => m.body === `Kickoff ${TAG}`)
  const reply = msgs.find((m) => m.body === 'Count me in')
  const thanks = msgs.find((m) => m.body.startsWith('Thanks'))
  const reactions = kickoff ? await sql`select user_id, emoji from chat_message_reactions where message_id = ${kickoff.id}` : []
  const [{ n: randoms }] = await sql`select count(*)::int as n from chat_channels where workspace_id = ${WS} and name like 'random%'`
  chk(
    channel?.name === 'general-slack' && channel.description === 'Everyone here' && kickoff?.author_id === ana.id && kickoff.imported_author === null &&
      kickoff.created_at?.toISOString?.() === new Date(Number(ts(10)) * 1000).toISOString().replace(/\.\d+Z$/, '.000Z') &&
      reply?.parent_message_id === kickoff?.id && reply?.author_id === me.id && reply?.imported_author === 'Ben Okafor' &&
      thanks?.body === `Thanks <@${ana.id}> for [the plan](https://example.com/plan)` && JSON.stringify(thanks?.mentions) === JSON.stringify([{ userId: ana.id }]) &&
      reactions.length === 1 && reactions[0].user_id === ana.id && reactions[0].emoji === '👍' && randoms === 0,
    'by SQL: #general came in as general-slack (the workspace has its own), Ana’s words under Ana at the moment she wrote them, Ben’s under his name, the reply in its thread, Ana mentioned as herself, her 👍 and not Ben’s, #random left out',
    JSON.stringify({ channel, msgs: msgs.map((m) => ({ ...m, created_at: m.created_at?.toISOString?.() })), reactions, randoms }),
  )
  if (channel) await page.goto(`${B}/app/${WS}/chat?channel=${channel.id}`, { waitUntil: 'domcontentloaded' })
  const imported = await waitUntil(async () => (await page.getByTestId('chat-message-imported').count()) > 0, { timeoutMs: 20_000 })
  const importedName = (await readText(page.getByTestId('chat-message-imported-author').first())) ?? ''
  chk(
    imported && importedName.startsWith('Ben Okafor'),
    'in Chat, Ben’s message is drawn under his name and marked imported — not as the words of the person who imported it',
    `marked: ${imported}; the author line read ${JSON.stringify(importedName)}`,
  )

  // ══ 7. BASECAMP ══════════════════════════════════════════════════════════
  console.log('\n▶ Basecamp, signed in to, its projects into Spaces and Folders')
  const BC = `${TAG}-bc`
  const SAM = `sam-${TAG}@elsewhere.invalid`
  const PROJECT = `Website relaunch ${TAG}`
  const TEAM = `Support team ${TAG}`
  // A stub with no Basecamp (an older tree) fails each check below, not the run.
  await seedBasecamp(STUB, {
    token: BC,
    refreshToken: `${BC}-refresh`,
    name: 'Ana Ruiz',
    email: `ana.ruiz-${TAG}@basecamp.test`,
    accounts: [{
      id: '4400',
      name: 'Studio',
      projects: [
        {
          id: 101,
          name: PROJECT,
          description: '<div>The new site</div>',
          lists: [
            {
              id: 1001,
              name: 'Launch',
              description: '<div>Go-live</div>',
              todos: [
                {
                  id: 5001, content: 'Draft homepage copy', description: '<div><strong>Hero</strong> and features</div>', due_on: '2026-11-03', starts_on: '2026-10-27',
                  assignees: [{ name: 'Ana', email_address: ana.email }],
                  comments: [
                    { content: '<div>First draft is up</div>', created_at: '2026-10-28T10:00:00Z', creator: { name: 'Ana', email_address: ana.email } },
                    { content: '<div>Looks good</div>', created_at: '2026-10-29T11:00:00Z', creator: { name: 'Sam Stranger', email_address: SAM } },
                  ],
                },
                { id: 5002, content: 'Book the launch call', completed: true, completed_at: '2026-10-10T09:00:00Z' },
                { id: 5003, content: 'Order banners' },
              ],
              groups: [{ id: 2001, name: 'Needs review', todos: [{ id: 5004, content: 'Review legal page' }] }],
            },
            { id: 1002, name: 'Content', todos: Array.from({ length: 16 }, (_, n) => ({ id: 6000 + n, content: `Article ${n + 1}` })) },
          ],
        },
        { id: 102, name: TEAM, purpose: 'team', lists: [{ id: 1003, name: 'Inbox', todos: [{ id: 7001, content: 'Answer ticket' }] }] },
      ],
    }],
  }).catch((e) => console.log(`  (the stub did not take the Basecamp account: ${e.message})`))
  await page.goto(`${B}/app/${WS}/import?tab=basecamp`, { waitUntil: 'domcontentloaded' })
  const connectShown = await waitUntil(async () => (await page.getByTestId('import-basecamp-connect').count()) > 0, { timeoutMs: 20_000 })
  const start = await A(`/workspaces/${WS}/import/basecamp/connect`, { method: 'POST' })
  const authUrl = start.data?.authUrl ? new URL(start.data.authUrl) : null
  const state = authUrl?.searchParams.get('state') ?? null
  await seedConsentCode(STUB, { code: `${BC}-code`, accessToken: BC, provider: 'basecamp' }).catch((e) => console.log(`  (the stub did not take the sign-in code: ${e.message})`))
  const back = state ? await fetch(`${API}/import/basecamp/callback?code=${encodeURIComponent(`${BC}-code`)}&state=${encodeURIComponent(state)}`, { redirect: 'manual' }) : null
  const landed = back?.headers.get('location') ?? ''
  // An older schema has no table for grants: no grant was kept, which is what this checks.
  const grants = await sql`select user_id, account from import_grants where workspace_id = ${WS} and provider = 'basecamp'`.catch(() => [])
  chk(
    connectShown && authUrl?.pathname.endsWith('/authorization/new') && authUrl?.searchParams.get('type') === 'web_server' &&
      back?.status === 302 && landed.includes(`/app/${WS}/import?tab=basecamp&connected=basecamp`) &&
      grants.length === 1 && grants[0].user_id === me.id && grants[0].account?.name === 'Ana Ruiz',
    'the Basecamp tab offers the sign-in; Launchpad’s way back keeps the grant for the person who signed in, and lands on the import page',
    JSON.stringify({ connectShown, authUrl: authUrl ? `${authUrl.origin}${authUrl.pathname}` : null, back: back?.status, landed, grants }),
  )
  // A state as this server writes one — this workspace, this admin, now — with a code Launchpad would honour, signed
  // with a key that is not the server's: the signature is all that refuses it.
  const forgedState = `${Buffer.from(JSON.stringify({ ws: WS, user: me.id, ts: Date.now() })).toString('base64url')}.${createHmac('sha256', 'not-the-server-key').update(TAG).digest('base64url')}`
  await seedConsentCode(STUB, { code: `${BC}-forged`, accessToken: BC, provider: 'basecamp' }).catch((e) => console.log(`  (the stub did not take the second code: ${e.message})`))
  const forged = await fetch(`${API}/import/basecamp/callback?code=${encodeURIComponent(`${BC}-forged`)}&state=${encodeURIComponent(forgedState)}`, { redirect: 'manual' })
  const miaStatus = await mia.api(`/workspaces/${WS}/import/basecamp`)
  const [{ n: grantsAfter }] = await sql`select count(*)::int as n from import_grants where workspace_id = ${WS}`.catch(() => [{ n: -1 }])
  chk(
    forged.status === 302 && /importError=basecamp_sign_in_expired/.test(forged.headers.get('location') ?? '') && grantsAfter === 1 && miaStatus.status === 403,
    'a way back whose state this server did not sign is refused though its code is good, and keeps nothing; a member without the Import data permission is not offered Basecamp at all',
    JSON.stringify({ forged: forged.status, to: forged.headers.get('location'), grantsAfter, mia: said(miaStatus) }),
  )

  await page.goto(`${B}/app/${WS}/import?tab=basecamp&connected=basecamp`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('import-basecamp-connected').waitFor({ timeout: 20_000 }).catch(() => {})
  await page.getByTestId('import-basecamp-project-101').waitFor({ timeout: 20_000 }).catch(() => {})
  const signedAs = (await readText(page.getByTestId('import-basecamp-connected'))) ?? ''
  await page.getByTestId('import-basecamp-project-101').check().catch(() => {})
  await page.getByTestId('import-basecamp-into-new').check().catch(() => {})
  await page.getByTestId('import-basecamp-start').click().catch(() => {})
  await page.getByTestId('import-basecamp-report').waitFor({ timeout: 60_000 }).catch(() => {})
  const bfig = async (k) => Number(await page.getByTestId(`import-basecamp-r-${k}`).getAttribute('data-value').catch(() => -1))
  const bcReport = { spaces: await bfig('spaces'), lists: await bfig('lists'), tasks: await bfig('tasks'), done: await bfig('done'), comments: await bfig('comments'), statuses: await bfig('statuses'), assignees: await bfig('assignees') }
  chk(
    signedAs.includes('Ana Ruiz') && bcReport.spaces === 1 && bcReport.lists === 2 && bcReport.tasks === 20 && bcReport.done === 1 &&
      bcReport.comments === 2 && bcReport.statuses === 1 && bcReport.assignees === 1,
    'signed in, the page lists the account’s projects; importing one into a new Space brings its two lists, twenty to-dos (one done), two comments and a status from its group',
    JSON.stringify({ signedAs, ...bcReport }),
  )
  const bcTasks = await sql`
    select t.title, t.status, t.status_category, t.description, t.due_date, t.start_date, l.name as list, p.is_default_container as folderless,
           (select count(*)::int from task_assignees a where a.task_id = t.id and a.user_id = ${ana.id}) as ana
    from tasks t join lists l on l.id = t.list_id join projects p on p.id = l.project_id join spaces s on s.id = p.space_id
    where s.workspace_id = ${WS} and s.name = ${PROJECT}`
  const bt = Object.fromEntries(bcTasks.map((t) => [t.title, t]))
  const draft = bt['Draft homepage copy']
  const comments = draft ? await sql`select c.author_id, c.body from task_comments c join tasks t on t.id = c.task_id join lists l on l.id = t.list_id join projects p on p.id = l.project_id join spaces s on s.id = p.space_id where s.workspace_id = ${WS} and t.title = 'Draft homepage copy' order by c.created_at` : []
  const [groupStatus] = await sql`select ls.key, ls.name, ls.category from list_statuses ls join lists l on l.id = ls.list_id join projects p on p.id = l.project_id join spaces s on s.id = p.space_id where s.workspace_id = ${WS} and s.name = ${PROJECT} and ls.name = 'Needs review'`
  chk(
    bcTasks.length === 20 && bcTasks.every((t) => t.folderless) && draft?.ana === 1 && draft?.due_date?.toISOString?.().startsWith('2026-11-03') &&
      /\*\*Hero\*\* and features/.test(draft?.description ?? '') && bt['Book the launch call']?.status === 'done' && bt['Book the launch call']?.status_category === 'closed' &&
      groupStatus?.category === 'open' && bt['Review legal page']?.status === groupStatus?.key && bt['Article 16']?.list === 'Content' &&
      comments.length === 2 && comments[0].author_id === ana.id && comments[1].author_id === me.id && /^\*\*Sam Stranger\*\* _\(Basecamp comment ·/.test(comments[1].body),
    'by SQL: its lists are the Space’s own, with no Folder; a to-do keeps its notes, dates and assignee; a done one is done and closed; the group is a status its to-do holds; every page of a list came (the sixteenth article); a comment is under its author when they are a member, else under the importer with their name',
    JSON.stringify({ count: bcTasks.length, draft: draft ? { ...draft, due_date: draft.due_date?.toISOString?.() } : null, done: bt['Book the launch call'] ?? null, review: bt['Review legal page'] ?? null, groupStatus, comments }),
  )
  const asked = (await basecampAsked(STUB, BC)) ?? []
  const SPACE_ID = (await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `Existing ${TAG}` } })).data?.id
  const intoSpace = SPACE_ID ? await A(`/workspaces/${WS}/import/basecamp`, { method: 'POST', body: { accountId: '4400', projectIds: ['102'], spaceId: SPACE_ID } }) : { status: 0 }
  const intoJob = intoSpace.data?.jobId ? await job(intoSpace.data.jobId) : null
  const [folder] = SPACE_ID ? await sql`select p.name, p.is_default_container, (select count(*)::int from lists l where l.project_id = p.id) as lists from projects p where p.space_id = ${SPACE_ID} and p.name = ${TEAM}` : []
  chk(
    asked.some((a) => a.includes('page=2')) && asked.some((a) => a.includes('completed=true')) && intoJob?.status === 'completed' &&
      folder?.is_default_container === false && folder?.lists === 1,
    'it read every page Basecamp named and the done to-dos as well; and a team imported into an existing Space is a Folder there holding its list',
    JSON.stringify({ pages: asked.filter((a) => a.includes('page=')).length, done: asked.filter((a) => a.includes('completed=true')).length, job: intoJob?.status, error: intoJob?.error, folder }),
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m the run stopped: ${e?.stack ?? e}`)
} finally {
  await browser?.close().catch(() => {})
  stack.close()
  await sql?.end?.({ timeout: 2 }).catch?.(() => {})
}

console.log(`\n${passed} passed, ${failed} failed`)
// Said only when it is so, as every suite says it: the break runner reads this line as a short run.
if (passed + failed !== EXPECTED_CHECKS) {
  console.log(`\n✗ ${passed + failed} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
}
if (failed > 0 || passed + failed !== EXPECTED_CHECKS) process.exitCode = 1

/**
 * §V2-07 — download the list you are looking at.
 *
 * `[10:53]`–`[11:09]` "Customize pe aap click karoge — ab yeh dekh rahe ho:
 * EXPORT VIEW … aap se poochte hain ke CSV chahiye, EXCEL chahiye … aur aap is
 * ko download kar lo … woh aap ko COLUMN mein list de dega, har cheez."
 * Frame `10:58`: **File format** `CSV | Excel`, a What-to-export choice of
 * Visible columns / Task Names only / All columns, **Date format**, **Time
 * format**, Download.
 *
 * What existed was `GET /export/csv/tasks` — the WHOLE workspace, seven fixed
 * columns, behind `WorkspaceAdminGuard`. The person actually looking at a list
 * is usually not an admin, so they could not download it at all.
 *
 * THE CHECK THAT IS NOT ABOUT THE FEATURE.
 *
 * A cell beginning `=`, `+`, `-` or `@` is a FORMULA to Excel, LibreOffice and
 * Google Sheets. A task titled `=cmd|'/c calc'!A1` runs when somebody opens the
 * export — and the person who typed it did not have to attack anything, they
 * typed it into a task title in an app that invited them to. So one task here is
 * deliberately named that way, and the check is that the exported cell cannot
 * be read as a formula — in BOTH formats, by two different mechanisms: the CSV
 * prefixes an apostrophe, and the XLSX writes the cell as an inline string,
 * which is a different XML element from the one a formula lives in.
 *
 *   node test/e2e/list-export.mjs --api 3011
 */
import path from 'node:path'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { waitUntil } from './lib/wait.mjs'
import { xlsxRows, unzip } from './lib/unzip.mjs'
import { openDb } from './lib/db.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". Exact, so a skipped branch is a failure too. */
const EXPECTED_CHECKS = 30

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
const ME = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}

let passed = 0
let failed = 0
let sql = null
let stack = null
let browser = null
const TAG = `lxp-${Date.now()}`
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  // The SENTENCE, then the reason. This printed `${bad ?? good}`, so a failing
  // check named only its reason and never itself — and for a check inside a
  // loop the reason is all a reader (or `check-break-reddened.mjs`) has to go
  // on. Seventy suites shared the line.
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` \u2014 ${bad}` : ''}`) }
}

const apiAs = (token) => async (route, init = {}) => {
  const headers = token ? { authorization: `Bearer ${token}` } : {}
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, {
    ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}
const raw = (token) => async (route) => {
  const res = await fetch(`${API}${route}`, { headers: { authorization: `Bearer ${token}` } })
  const bytes = Buffer.from(await res.arrayBuffer())
  return {
    status: res.status,
    bytes,
    text: bytes.toString('utf8'),
    type: res.headers.get('content-type'),
    disposition: res.headers.get('content-disposition'),
  }
}

/** A fixed instant, so the date-format assertions can be exact strings. */
const DUE = '2026-08-07T19:15:00.000Z'

try {
  const auth = await signInApi(API, ME.email, ME.password)
  const A = apiAs(auth.accessToken)
  const R = raw(auth.accessToken)
  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id
  const stamp = Date.now()

  // A list of this suite's own, so the row counts below mean something.
  const spaces = (await A(`/spaces/workspace/${workspaceId}`)).data ?? []
  const spaceId = spaces[0]?.id
  if (!spaceId) throw new Error('no space')
  const list = (await A('/lists', { method: 'POST', body: { spaceId, name: `Export list ${stamp}` } })).data
  if (!list?.id) throw new Error('could not make a list')

  const FORMULA = `=cmd|'/c calc'!A1 ${stamp}`
  const COMMA = `Comma, and "quotes" ${stamp}`
  const DATED = `Dated ${stamp}`
  await A('/tasks', { method: 'POST', body: { listId: list.id, title: `Plain ${stamp}` } })
  await A('/tasks', { method: 'POST', body: { listId: list.id, title: FORMULA } })
  await A('/tasks', { method: 'POST', body: { listId: list.id, title: COMMA } })
  await A('/tasks', { method: 'POST', body: { listId: list.id, title: DATED, dueDate: DUE } })

  console.log('\n▶ §V2-07 — the list downloads as columns')
  const visible = await R(`/tasks/list/${list.id}/export`)
  chk(visible.status === 200, 'a member can export the list they are looking at',
    `export returned ${visible.status} — the old export was admin-only`)
  chk(
    /attachment; filename=/.test(visible.disposition ?? ''),
    'and it arrives as a download, named after the list',
    `content-disposition was ${JSON.stringify(visible.disposition)}`,
  )
  const header = visible.text.split('\r\n')[0]
  chk(
    header === '"Name","Status","Assignees","Priority","Due date"',
    'with the columns the list shows',
    `header row was ${JSON.stringify(header)}`,
  )
  chk(visible.text.split('\r\n').length === 5, 'and one row per task, no more',
    `got ${visible.text.split('\r\n').length - 1} row(s) for 4 tasks`)

  console.log('\n▶ what to export')
  const names = await R(`/tasks/list/${list.id}/export?columns=names`)
  chk(names.text.split('\r\n')[0] === '"Name"', 'Task Names only gives one column',
    `header was ${JSON.stringify(names.text.split('\r\n')[0])}`)
  const all = await R(`/tasks/list/${list.id}/export?columns=all`)
  chk(
    all.text.split('\r\n')[0].split(',').length > header.split(',').length,
    'and All columns gives more than the visible ones',
    `all=${all.text.split('\r\n')[0].split(',').length} vs visible=${header.split(',').length}`,
  )

  console.log('\n▶ and it cannot carry a formula into a spreadsheet')
  /*
   * The cell must not BEGIN with `=`. Quoting alone does not help: a
   * spreadsheet strips the quotes and then reads the `=`.
   */
  const formulaCell = visible.text.split('\r\n').find((l) => l.includes('calc'))
  chk(
    !!formulaCell && !/^"=/.test(formulaCell),
    'a task named like a formula is exported as text',
    `the row starts ${JSON.stringify((formulaCell ?? '').slice(0, 24))} — that executes on open`,
  )
  chk(
    !!formulaCell && formulaCell.startsWith(`"'=cmd`),
    "and is prefixed so a spreadsheet shows it as the person typed it",
    `expected a leading apostrophe, got ${JSON.stringify((formulaCell ?? '').slice(0, 24))}`,
  )

  /*
   * The control for the quoting, without which the check above could pass on a
   * build that mangles every other field: a title with a comma and quotes in it
   * has to survive as ONE cell.
   */
  const commaRow = visible.text.split('\r\n').find((l) => l.includes('and ""quotes""'))
  chk(
    !!commaRow && commaRow.startsWith(`"Comma, and ""quotes""`),
    'and a title with commas and quotes stays one cell',
    `the row was ${JSON.stringify((commaRow ?? '').slice(0, 48))}`,
  )

  console.log('\n▶ File format: Excel `[10:57]`')
  const xl = await R(`/tasks/list/${list.id}/export?format=xlsx`)
  chk(
    xl.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Excel comes back as a workbook, not as CSV with a new name',
    `content-type was ${JSON.stringify(xl.type)}`,
  )
  chk(
    /filename="[^"]+\.xlsx"/.test(xl.disposition ?? ''),
    'and is offered with an .xlsx filename',
    `content-disposition was ${JSON.stringify(xl.disposition)}`,
  )

  /*
   * Opened, not sniffed. "Starts with PK" is true of every zip ever made,
   * including one Excel refuses; this reads the central directory and the
   * worksheet part out of it.
   */
  let sheet = { rows: [], xml: '' }
  let opened = false
  try {
    sheet = xlsxRows(xl.bytes)
    opened = unzip(xl.bytes).has('xl/worksheets/sheet1.xml')
  } catch (e) {
    console.log(`       (workbook would not open: ${e.message})`)
  }
  chk(opened, 'the workbook opens and contains a worksheet part',
    'the bytes did not parse as a workbook a reader could open')
  chk(
    JSON.stringify(sheet.rows[0] ?? []) ===
      JSON.stringify(['Name', 'Status', 'Assignees', 'Priority', 'Due date']),
    'with the same columns the CSV has',
    `first row was ${JSON.stringify(sheet.rows[0])}`,
  )

  const xlFormulaRow = sheet.rows.find((r) => (r[0] ?? '').includes('calc'))
  chk(
    !!xlFormulaRow && xlFormulaRow[0] === FORMULA,
    'the formula-shaped title survives verbatim — no apostrophe is added',
    `expected ${JSON.stringify(FORMULA)}, got ${JSON.stringify(xlFormulaRow?.[0])}`,
  )
  /*
   * …because it does not need one. In a workbook a formula is an `<f>`
   * element, and this writer emits `<is><t>` — an inline string. The absence
   * of `<f>` is the whole reason the apostrophe would be noise here.
   */
  chk(
    sheet.xml.length > 0 && !/<f[ >]/.test(sheet.xml),
    'and no cell in the sheet is a formula',
    'the worksheet contains an <f> element — something is writing formulas',
  )

  console.log('\n▶ Date format / Time format `[frame 10:58]`')
  const iso = await R(`/tasks/list/${list.id}/export?dateFormat=iso&timeFormat=h24`)
  const isoRow = iso.text.split('\r\n').find((l) => l.includes(DATED))
  chk(
    !!isoRow && isoRow.includes('"2026-08-07 19:15"'),
    'ISO + 24-hour writes the due date as 2026-08-07 19:15',
    `the row was ${JSON.stringify(isoRow)}`,
  )
  const us = await R(`/tasks/list/${list.id}/export?dateFormat=us&timeFormat=none`)
  const usRow = us.text.split('\r\n').find((l) => l.includes(DATED))
  chk(
    !!usRow && usRow.includes('"08/07/2026"') && !usRow.includes(':'),
    'and US + no time writes 08/07/2026 with the time dropped',
    `the row was ${JSON.stringify(usRow)}`,
  )

  console.log('\n▶ Closed and archived `[11:32]`, `[11:37]`')
  const closedTask = (await A('/tasks', { method: 'POST', body: { listId: list.id, title: `Closed ${stamp}` } })).data
  await A(`/tasks/${closedTask.id}`, { method: 'PATCH', body: { status: 'done' } })
  const readBack = (await A(`/tasks/${closedTask.id}`)).data
  chk(
    readBack?.statusCategory === 'closed',
    'a task moved to Done is in the closed category',
    `statusCategory was ${JSON.stringify(readBack?.statusCategory)} — the rest of this section cannot mean anything`,
  )

  const withClosed = await R(`/tasks/list/${list.id}/export`)
  chk(withClosed.text.includes(`Closed ${stamp}`), 'and is in the export by default',
    'a completed task vanished from an export nobody asked to filter')
  const withoutClosed = await R(`/tasks/list/${list.id}/export?includeClosed=false`)
  chk(
    !withoutClosed.text.includes(`Closed ${stamp}`) && withoutClosed.text.includes(`Plain ${stamp}`),
    'until the view hides closed tasks, and then it is gone',
    'includeClosed=false did not drop the closed task (or dropped everything)',
  )

  const archived = (await A('/tasks', { method: 'POST', body: { listId: list.id, title: `Archived ${stamp}` } })).data
  await A(`/tasks/${archived.id}`, { method: 'PATCH', body: { isArchived: true } })
  const noArchive = await R(`/tasks/list/${list.id}/export`)
  chk(
    !noArchive.text.includes(`Archived ${stamp}`),
    'an archived task stays out of the export',
    'an archived task was exported without being asked for',
  )
  const withArchive = await R(`/tasks/list/${list.id}/export?includeArchived=true`)
  chk(
    withArchive.text.includes(`Archived ${stamp}`),
    'and comes back when the view is showing archived',
    'includeArchived=true did not reach the query — this is the parameter the web never used to send',
  )

  /*
   * §V2-13 `[10:42]`–`[10:49]` — WHAT IS PAID, AND WHAT MUST NOT BECOME PAID.
   *
   *   "agar aap ke paas woh hai PREMIUM ACCESS … board view download karne ka
   *    bhi option hoga. Lekin agar aap ke paas premium nahi [hai] to aap LIST
   *    VIEW download karo."
   *
   * Everything above this line is the free list export, and it has to keep
   * working for somebody who cannot pay — this file is where that regression
   * would show up first. So the section runs as a SECOND actor in a workspace
   * on the Free plan, and asks for both downloads. The full matrix, including
   * the browser, is `paywall-sites.mjs`.
   */
  console.log('\n▶ §V2-13 `[10:49]` — the list download stays free, the board one does not')
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — this section sets a workspace plan directly')
  const lockedWs = (await A('/workspaces', { method: 'POST', body: { name: `Export locked ${TAG}` } })).data
  if (!lockedWs?.id) throw new Error('could not create the Free-plan workspace this section is about')
  const lockedSpace = ((await A(`/spaces/workspace/${lockedWs.id}`)).data ?? [])[0]
  const lockedProject = lockedSpace ? ((await A(`/projects/space/${lockedSpace.id}`)).data ?? [])[0] : null
  const lockedList = lockedProject
    ? (await A('/lists', { method: 'POST', body: { projectId: lockedProject.id, name: `Locked list ${TAG}` } })).data
    : null
  if (!lockedList?.id) throw new Error('the Free-plan workspace came up without a list')
  const lockedTaskTitle = `Locked row ${TAG}`
  await A('/tasks', { method: 'POST', body: { listId: lockedList.id, title: lockedTaskTitle } })
  await sql`update workspaces set plan = 'free' where id = ${lockedWs.id}`

  const freeExport = await R(`/tasks/list/${lockedList.id}/export`)
  chk(
    freeExport.status === 200 && freeExport.text.includes(lockedTaskTitle),
    'a Free plan still downloads the list it is looking at',
    `the plain export returned ${freeExport.status} on a Free plan — the board gate has spread to the free export`,
  )
  const lockedBoard = await R(`/tasks/list/${lockedList.id}/export?view=board`)
  chk(
    lockedBoard.status === 403,
    'and is refused the board-shaped one',
    `view=board returned ${lockedBoard.status} on a Free plan`,
  )
  const paidBoard = await R(`/tasks/list/${list.id}/export?view=board`)
  chk(
    paidBoard.status === 200 && paidBoard.text.split('\r\n')[0].startsWith('"Board column",'),
    'while an entitled plan gets it, and gets a different sheet — the column comes first',
    `view=board returned ${paidBoard.status} with header ${JSON.stringify(paidBoard.text.split('\r\n')[0])}`,
  )

  /*
   * ══ VISIBLE COLUMNS ARE THE VIEW'S ══
   *
   * `product-siblings/export-visible-columns-ignores-view`: the panel never
   * sent `fields`, so "Visible columns" was always the same five, whatever
   * the view hid; the web's column keys were not the server's; and no custom
   * field was ever a column. ClickUp's Visible columns exports what the view
   * shows, custom fields included.
   */
  console.log('\n▶ Visible columns are the view’s — its fields, its order, its custom fields')
  const shown = await R(`/tasks/list/${list.id}/export?columns=visible&fields=title,dueDate,assignees`)
  chk(
    shown.text.split('\r\n')[0] === '"Name","Due date","Assignees"',
    'Visible columns exports the fields the view names, in its order — and nothing it hid',
    `header was ${JSON.stringify(shown.text.split('\r\n')[0])}`,
  )
  const listRow = (await A(`/lists/${list.id}`)).data
  const stage = await A(`/workspaces/${workspaceId}/projects/${listRow?.projectId}/custom-fields`, {
    method: 'POST',
    body: { name: `Stage ${stamp}`, type: 'dropdown', options: [{ label: 'Ready to ship', value: 'ready' }, { label: 'Parked', value: 'parked' }] },
  })
  if (stage.status >= 300 || !stage.data?.id) throw new Error(`could not make the custom field: ${stage.status}`)
  const datedTask = ((await A(`/tasks/list/${list.id}`)).data ?? []).find((t) => t.title === DATED)
  const setStage = await A(`/workspaces/${workspaceId}/tasks/${datedTask?.id}/custom-fields/${stage.data.id}`, { method: 'PUT', body: { value: 'ready' } })
  if (setStage.status >= 300) throw new Error(`could not set the custom field: ${setStage.status}`)
  const withField = await R(`/tasks/list/${list.id}/export?columns=visible&fields=title,cf:${stage.data.id}`)
  const fieldLines = withField.text.split('\r\n')
  chk(
    fieldLines[0] === `"Name","Stage ${stamp}"` && fieldLines.some((l) => l === `"${DATED}","Ready to ship"`),
    'a custom field the view shows is a column of its own, a dropdown written as its label',
    `header ${JSON.stringify(fieldLines[0])}; the dated task's row ${JSON.stringify(fieldLines.find((l) => l.includes(DATED)))}`,
  )
  const everything = await R(`/tasks/list/${list.id}/export?columns=all`)
  chk(
    everything.text.split('\r\n')[0].includes(`"Stage ${stamp}"`),
    'and All columns carries every custom field of the list',
    `header was ${JSON.stringify(everything.text.split('\r\n')[0])}`,
  )

  // ON SCREEN: what the panel actually asks for, read off the request.
  const chromium = await resolveChromium()
  stack = await startLocalStack({ dist: path.resolve(import.meta.dirname, '../..', argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
  browser = await chromium.launch(launchOptions())
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' })).newPage()
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ME.email)
  await page.fill('input[type=password]', ME.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
  await page.goto(`${stack.base}/app/${workspaceId}/${spaceId}/${listRow?.projectId}/${list.id}`, { waitUntil: 'domcontentloaded' })
  /** Open Customize, choose Visible columns, press Download — and return the `fields` it asked for. */
  const exportedFields = async () => {
    // Customize, then its Export view section — each a <details> of its own,
    // opened only when shut (a click on an open one would close it) — until the
    // Download button is on screen. Bounded; the press below still goes out.
    await waitUntil(async () => {
      for (const id of ['list-customize', 'list-export-section']) {
        const details = page.getByTestId(id)
        if (!(await details.evaluate((el) => el.open, undefined, { timeout: 5000 }))) {
          await details.locator(':scope > summary').click({ timeout: 5000 })
        }
      }
      return page.getByTestId('list-export-download').isVisible()
    }, { timeoutMs: 30_000 })
    await page.getByTestId('list-export-visible').click({ timeout: 10_000 }).catch(() => {})
    /*
     * THE REQUEST IS WAITED FOR FROM THE PRESS THAT MAKES IT. Its twenty
     * seconds used to start before the panel was opened, and under a sweep's
     * load the opening ate them: the list's download read "(no request)"
     * (`found-24-sep/three-suites-fail-under-a-full-sweep`).
     */
    const asked = page.waitForRequest((r) => r.url().includes(`/tasks/list/${list.id}/export?`), { timeout: 20_000 }).catch(() => null)
    await page.getByTestId('list-export-download').click({ timeout: 10_000 }).catch(() => {})
    const request = await asked
    await page.keyboard.press('Escape').catch(() => {})
    return request ? (new URL(request.url()).searchParams.get('fields') ?? '(none)') : '(no request)'
  }
  await page.getByTestId('list-columns').locator(':scope > summary').click({ timeout: 20_000 }).catch(() => {})
  await page.getByTestId('list-column-priority').uncheck({ timeout: 10_000 }).catch(() => {})
  await page.getByTestId('list-columns').locator(':scope > summary').click({ timeout: 5000 }).catch(() => {})
  const listFields = await exportedFields()
  chk(
    listFields === 'title,status,assignees,dueDate',
    'in the list, with Priority hidden, the download asks for the list’s columns and not Priority',
    `it asked for fields=${listFields}`,
  )
  await page.getByTestId('work-view-tab-type-table').click({ timeout: 15_000 }).catch(() => {})
  /*
   * THE TABLE'S DOWNLOAD IS ASKED FOR ONCE THE TABLE IS THE VIEW ON SCREEN AND
   * THE PANEL IS FREE. This waited for a Customize panel to exist, which the
   * list's already did, so it waited for nothing. The panel is the same one in
   * both views: while the list's download is still running its button is
   * disabled, and when that download ends the panel closes itself. Under a
   * sweep's load the table's press landed in between — on a disabled button, or
   * on one that then vanished — and no request went out, twice
   * (`found-24-sep/three-suites-fail-under-a-full-sweep`). So: the table tab is
   * current (`aria-current`), and the Download button is enabled again. Bounded;
   * `exportedFields` still reports "(no request)" when none is made.
   */
  await waitUntil(
    async () =>
      (await page.getByTestId('work-view-tab-type-table').getAttribute('aria-current', { timeout: 2000 })) === 'true' &&
      (await page.getByTestId('list-export-download').isEnabled({ timeout: 2000 })),
    { timeoutMs: 30_000 },
  )
  const tableFields = await exportedFields()
  chk(
    tableFields.split(',').includes(`cf:${stage.data.id}`) && tableFields.startsWith('title,'),
    'and in the table it asks for the custom fields the table shows',
    `it asked for fields=${tableFields}`,
  )

  await A(`/lists/${list.id}`, { method: 'DELETE' }).catch(() => {})
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${e.message.split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  stack?.close()
  if (sql) {
    // Cascades to the space/project/list under it. A Free-plan workspace left
    // lying around is one another suite's `pickWorkspace` can wander into.
    await sql`delete from workspaces where name like ${'%' + TAG}`.catch(() => {})
    await sql.end({ timeout: 5 }).catch(() => {})
  }
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  /*
   * EXACT, not `<`. With `<`, the paywall section quietly ceasing to run turns
   * into a shorter green run rather than a failure — and that section is the
   * one guarding a download that must never become paid.
   */
  if (ran !== EXPECTED_CHECKS) {
    console.log(
      `\n✗ ran ${ran} checks, expected exactly ${EXPECTED_CHECKS} — ` +
        'so "0 failed" describes the part it reached and nothing else.',
    )
    process.exit(1)
  }
  process.exit(failed === 0 ? 0 : 1)
}

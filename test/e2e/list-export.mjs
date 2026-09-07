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
import { signInApi } from './lib/signin.mjs'
import { xlsxRows, unzip } from './lib/unzip.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 22

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
const ME = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${bad ?? good}`) }
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

  await A(`/lists/${list.id}`, { method: 'DELETE' }).catch(() => {})
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${e.message.split('\n')[0]}`)
} finally {
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran < EXPECTED_CHECKS) {
    console.log(
      `\n✗ only ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, ` +
        'so "0 failed" describes the part it reached and nothing else.',
    )
    process.exit(1)
  }
  process.exit(failed === 0 ? 0 : 1)
}

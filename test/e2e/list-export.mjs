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
import { openDb } from './lib/db.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". Exact, so a skipped branch is a failure too. */
const EXPECTED_CHECKS = 25

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
const ME = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}

let passed = 0
let failed = 0
let sql = null
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

  await A(`/lists/${list.id}`, { method: 'DELETE' }).catch(() => {})
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${e.message.split('\n')[0]}`)
} finally {
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

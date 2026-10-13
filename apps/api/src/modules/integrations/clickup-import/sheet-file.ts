import { isZip } from '../../../common/import/zip-read'
import { decodeText } from '../../../common/import/text-decode'
import { WorkbookReadError, readXlsx, type SheetGrid } from './xlsx-read'
import { isCompoundFile, readXls } from './xls-read'
import { headerHoldsNul, parseSheet, NOT_A_SHEET_FILE, type SheetTable } from './spreadsheet-import.util'

type SheetRow = { line: number; cells: string[] }

/**
 * ONE READER FOR EVERY FILE THE SPREADSHEET IMPORT TAKES (`ledger-rows/row-816`):
 * ClickUp's six — .xls, .xlsx, .csv, .json, .tsv and .txt — each into the same
 * header row and numbered rows the column mapping already works on, so a
 * workbook, a JSON file and a CSV are mapped, previewed, refused and imported
 * by one path.
 *
 * WHAT A FILE IS, IS ASKED OF ITS BYTES, then of its name: a zip is a workbook
 * (.xlsx) and a compound file a legacy one (.xls), whatever they are called — a
 * workbook saved under a .csv name is read as the workbook it is — and text is
 * JSON when it is named .json, delimited otherwise. Text is UTF-8 unless a
 * byte-order mark says UTF-16, which Excel's "Unicode text" is.
 */

/** The most a file for the spreadsheet import may hold: a 10 000-row sheet is well under it. */
export const SHEET_FILE_MAX_BYTES = 25 * 1024 * 1024

export function readSheetFile(bytes: Buffer, fileName: string): SheetTable {
  if (isZip(bytes)) return gridToTable(readXlsx(bytes), 'xlsx')
  if (isCompoundFile(bytes)) return gridToTable(readXls(bytes), 'xls')
  const text = decodeText(bytes)
  // Any other binary file: its first line holds a NUL, which no header row does.
  if (headerHoldsNul(text)) throw new WorkbookReadError(NOT_A_SHEET_FILE)
  if (/\.json$/i.test(fileName.trim())) return jsonToTable(text)
  return { ...parseSheet(text), format: 'csv' }
}

/** `0` → `A`, `27` → `AB`: how a sheet names a column. */
export function columnLetters(index: number): string {
  let n = index + 1
  let out = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    out = String.fromCharCode(65 + rem) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

/**
 * The names a sheet's header row gives its columns, each one distinct: a
 * column the mapping is keyed by must be told apart from its neighbours, so an
 * empty header is named for its column (`Column C`) and a repeated one numbered
 * (`Name (2)`). The first `Name` keeps its name.
 */
export function headerNames(cells: string[], width: number): string[] {
  const seen = new Map<string, number>()
  const out: string[] = []
  for (let i = 0; i < width; i++) {
    let name = (cells[i] ?? '').trim() || `Column ${columnLetters(i)}`
    const key = name.toLowerCase()
    const times = (seen.get(key) ?? 0) + 1
    seen.set(key, times)
    if (times > 1) name = `${name} (${times})`
    out.push(name)
  }
  return out
}

/** A sheet's rows as the header and numbered rows the mapping reads: its first row is the header. */
export function gridToTable(grid: SheetGrid, format: 'xlsx' | 'xls'): SheetTable {
  const [header, ...rest] = grid.rows
  if (!header) return { headers: [], delimiter: ',', rows: [], format, sheetName: grid.sheetName }
  const width = Math.max(header.cells.length, ...rest.map((r) => r.cells.length))
  return {
    headers: headerNames(header.cells, width),
    delimiter: ',',
    rows: rest.map((r) => ({ line: r.line, cells: r.cells })),
    format,
    sheetName: grid.sheetName,
    headerRow: { line: header.line, cells: header.cells },
  }
}

/**
 * A SOURCE'S OWN EXPORT, READ IN ITS OWN LAYOUT (`ledger-rows/row-816`): the
 * file is read as the source writes it, so its export is imported as it was
 * downloaded — Monday's Excel export as its board, Wrike's with each task
 * once. Any other source's file, and a JSON list, is the table it already is.
 */
export function readExportLayout(table: SheetTable, preset: string | undefined): SheetTable {
  if (table.format === 'json') return table
  if (preset === 'monday') return readBoard(table)
  if (preset === 'wrike') return readKeyed(table)
  return table
}

const trimmed = (cells: string[]) => cells.map((c) => (c ?? '').trim())
const filledCount = (cells: string[]) => cells.filter((c) => (c ?? '').trim() !== '').length

/** The rows above a sheet's table that each hold one cell — a title — and where its header row is: the first with two. */
function underTitles(rows: SheetRow[]): { titles: string[]; header: number } {
  const titles: string[] = []
  let at = 0
  while (at < rows.length && filledCount(rows[at].cells) <= 1) {
    const title = rows[at].cells.find((c) => (c ?? '').trim() !== '')
    if (title) titles.push(title.trim())
    at++
  }
  return { titles, header: at }
}

/** The table's rows as the file holds them, its first row first. */
const sheetRows = (table: SheetTable): SheetRow[] => [table.headerRow ?? { line: 1, cells: table.headers }, ...table.rows]

/** Cells without the empty ones a row ends in. */
function cut(cells: string[]): string[] {
  const t = trimmed(cells)
  while (t.length && !t[t.length - 1]) t.pop()
  return t
}

/**
 * MONDAY'S "EXPORT BOARD TO EXCEL" IS NOT ONE TABLE: the board's name on its
 * first row, then each group in turn — its name on a row of its own, the
 * board's column names again, its items, a row of the group's sums — and
 * subitems, when asked for, on lines of their own under their item. So the
 * table is found under its title rows; a row repeating the column names is the
 * next group's, the one-cell row above it that group's name; and each item
 * keeps the group it sat in, in a `Group` column the Monday preset maps to the
 * list it goes to, as ClickUp makes a board's groups lists. A row with no name
 * is never an item — a group's sums, a subitem's line — and is left out, and
 * counted. A sheet with no title above its table is read as the table it is.
 */
function readBoard(table: SheetTable): SheetTable {
  const rows = sheetRows(table)
  const { titles, header: at } = underTitles(rows)
  if (!titles.length || at >= rows.length) return table
  const header = cut(rows[at].cells)
  const isHeader = (cells: string[]) => {
    const t = cut(cells)
    return t.length === header.length && t.every((c, i) => c === header[i])
  }
  /** A one-cell row with a header under it (blank rows between) names the group that header starts. */
  const namesGroup = (i: number) => {
    const cells = rows[i].cells
    if (filledCount(cells) !== 1 || !(cells[0] ?? '').trim()) return false
    for (let j = i + 1; j < rows.length; j++) if (filledCount(rows[j].cells)) return isHeader(rows[j].cells)
    return false
  }
  const groups: string[] = []
  // The board's name is the first title; the first group's, the last one above the table.
  let group = titles.length > 1 ? titles[titles.length - 1] : ''
  if (group) groups.push(group)
  const items: Array<SheetRow & { group: string }> = []
  let leftOut = 0
  for (let i = at + 1; i < rows.length; i++) {
    const cells = rows[i].cells
    if (!filledCount(cells) || isHeader(cells)) continue
    if (namesGroup(i)) {
      group = cells[0].trim()
      if (!groups.includes(group)) groups.push(group)
      continue
    }
    if (!(cells[0] ?? '').trim()) {
      leftOut++
      continue
    }
    items.push({ line: rows[i].line, cells, group })
  }
  const width = Math.max(header.length, ...items.map((r) => r.cells.length))
  const headers = headerNames(header, width)
  if (groups.length) headers.push(headers.some((h) => h.toLowerCase() === 'group') ? 'Board group' : 'Group')
  return {
    ...table,
    headers,
    rows: items.map((r) => {
      const cells = Array.from({ length: width }, (_, i) => r.cells[i] ?? '')
      return { line: r.line, cells: groups.length ? [...cells, r.group] : cells }
    }),
    headerRow: { line: rows[at].line, cells: rows[at].cells },
    layout: { kind: 'board', board: titles[0], groups, leftOut },
  }
}

/**
 * WRIKE'S EXCEL EXPORT LISTS A TASK ONCE FOR EVERY FOLDER IT IS IN, each line
 * with the same `Key`: the task is made once, from its first line, and the
 * lines repeating it are counted. The table is found under any title rows, as
 * Monday's is.
 */
function readKeyed(table: SheetTable): SheetTable {
  const rows = sheetRows(table)
  const { titles, header: at } = underTitles(rows)
  const under = titles.length && at < rows.length ? { header: rows[at], body: rows.slice(at + 1) } : { header: rows[0], body: rows.slice(1) }
  const header = trimmed(under.header.cells)
  const key = header.findIndex((h) => h.toLowerCase() === 'key')
  const seen = new Set<string>()
  let repeated = 0
  const body: SheetRow[] = []
  for (const r of under.body) {
    const k = key === -1 ? '' : (r.cells[key] ?? '').trim()
    if (k && seen.has(k)) {
      repeated++
      continue
    }
    if (k) seen.add(k)
    body.push(r)
  }
  if (!titles.length && !repeated) return table
  const width = Math.max(under.header.cells.length, ...body.map((r) => r.cells.length))
  return {
    ...table,
    headers: headerNames(under.header.cells, width),
    rows: body,
    headerRow: { line: under.header.line, cells: under.header.cells },
    layout: { kind: 'keyed', repeated },
  }
}

export const JSON_NOT_TASKS =
  'A JSON file is read as a list of tasks: an array of objects, one object per task, its keys the columns (or an object holding one such array).'

/**
 * A JSON file as rows: an array of objects — or an object holding one, as
 * `{ "tasks": [...] }` — each object a row and its keys the columns, in the
 * order they are first met. A list of names or people is read as the names
 * joined (`Ana, Ben`), as a CSV cell would hold them; anything else nested is
 * kept as its JSON. Each row is numbered by its place in the list.
 */
export function jsonToTable(text: string): SheetTable {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new WorkbookReadError(`This .json file is not valid JSON. ${JSON_NOT_TASKS}`)
  }
  let items: unknown = data
  if (!Array.isArray(items) && items && typeof items === 'object') {
    items = Object.values(items as Record<string, unknown>).find((v) => Array.isArray(v) && v.some((x) => isPlainObject(x)))
  }
  if (!Array.isArray(items) || !items.length || !items.every((x) => isPlainObject(x))) throw new WorkbookReadError(JSON_NOT_TASKS)

  const headers: string[] = []
  const index = new Map<string, number>()
  for (const item of items as Array<Record<string, unknown>>) {
    for (const key of Object.keys(item)) {
      if (!index.has(key)) {
        index.set(key, headers.length)
        headers.push(key)
      }
    }
  }
  const rows = (items as Array<Record<string, unknown>>).map((item, i) => ({
    line: i + 1,
    cells: headers.map((h) => jsonCell(item[h])),
  }))
  return { headers, delimiter: ',', rows, format: 'json' }
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === 'object' && !Array.isArray(x)
}

/** One value as the text a cell would hold. */
export function jsonCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return v.map((x) => (isPlainObject(x) ? personOrName(x) ?? JSON.stringify(x) : jsonCell(x))).filter(Boolean).join(', ')
  if (isPlainObject(v)) return personOrName(v) ?? JSON.stringify(v)
  return String(v)
}

/** What a person or a named thing is called: its email, its name, its title. */
function personOrName(x: Record<string, unknown>): string | null {
  for (const key of ['email', 'name', 'title', 'username', 'label']) {
    if (typeof x[key] === 'string' && x[key]) return x[key] as string
  }
  return null
}

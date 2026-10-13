import { readZip, ZipReadError, type ZipEntry } from '../../../common/import/zip-read'
import { attr, localName, xmlTokens } from '../../../common/import/xml-scan'

/**
 * AN .xlsx READ AS THE ROWS IT SHOWS (`ledger-rows/row-816`).
 *
 * ClickUp's Spreadsheets Importer reads Excel workbooks as well as CSV — .xls,
 * .xlsx, .csv, .json, .tsv and .txt (help centre, "Use the Spreadsheets
 * Importer", read through search excerpts, 13 October) — and Monday's and
 * Wrike's own exports are workbooks, which the page used to send back to be
 * "saved as CSV". `common/export/xlsx.ts` writes the format with no dependency;
 * this reads it the same way: a zip (`zip-read.ts`) of XML parts
 * (`xml-scan.ts`).
 *
 * WHAT A CELL SAYS IS WHAT EXCEL SHOWS, as far as an importer needs it:
 *   · a shared string (`t="s"`) or an inline one (`t="inlineStr"`), as text;
 *   · a formula's last value (`t="str"`, or a number), never the formula;
 *   · TRUE and FALSE for a boolean, and an error as its code (`#N/A`);
 *   · a number formatted as a date — Excel keeps a date as a count of days —
 *     as the ISO date it stands for (`2026-10-20`, with the time when it has
 *     one), which the importer's date reader takes as it takes a CSV's;
 *   · any other number as JavaScript writes it, shortest first.
 *
 * The FIRST VISIBLE SHEET is read, as a CSV holds one sheet; its first row with
 * anything in it is the header row, and each row keeps the number Excel shows
 * beside it, so a refused row is named as the person sees it.
 */

export class WorkbookReadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkbookReadError'
  }
}

/** A sheet's rows as text: each row's cells by column, and the row number the program draws beside it. */
export type SheetGrid = {
  sheetName: string
  rows: Array<{ line: number; cells: string[] }>
}

/** What the reader will take from one workbook, so a crafted one cannot hold the API's memory. */
export const WORKBOOK_LIMITS = {
  maxEntries: 10_000,
  maxEntryBytes: 150 * 1024 * 1024,
  maxTotalBytes: 400 * 1024 * 1024,
  /** More rows than this are not read: ClickUp's own limit is 10 000 a file. */
  maxRows: 200_000,
  maxColumns: 1_000,
} as const

const NOT_A_WORKBOOK = 'This zip is not an Excel workbook (.xlsx): it has no workbook part'

export function readXlsx(buf: Buffer): SheetGrid {
  let zip: Map<string, ZipEntry>
  try {
    zip = readZip(buf, WORKBOOK_LIMITS)
  } catch (e) {
    if (e instanceof ZipReadError) throw new WorkbookReadError(`The workbook could not be read: ${e.message}`)
    throw e
  }
  const part = (path: string): string | null => {
    const entry = zip.get(path) ?? findCaseless(zip, path)
    return entry ? entry.text() : null
  }

  // Where the workbook is: the package's own relationship says, as Excel reads it.
  const rootRels = relationships(part('_rels/.rels'), '')
  const workbookPath = rootRels.find((r) => r.type.endsWith('/officeDocument'))?.target ?? 'xl/workbook.xml'
  const workbookXml = part(workbookPath)
  if (!workbookXml) throw new WorkbookReadError(NOT_A_WORKBOOK)
  const base = workbookPath.includes('/') ? workbookPath.slice(0, workbookPath.lastIndexOf('/') + 1) : ''
  const rels = relationships(part(`${base}_rels/${workbookPath.slice(base.length)}.rels`), base)

  // The sheets in their order, which hidden, and whether its dates count from 1904.
  let date1904 = false
  const sheets: Array<{ name: string; relId: string; hidden: boolean }> = []
  for (const tok of xmlTokens(workbookXml)) {
    if (tok.kind !== 'open') continue
    const name = localName(tok.name)
    if (name === 'workbookPr') {
      const v = attr(tok.attrs, 'date1904')
      date1904 = v === '1' || v === 'true'
    } else if (name === 'sheet') {
      const state = attr(tok.attrs, 'state')
      sheets.push({ name: attr(tok.attrs, 'name') ?? '', relId: attr(tok.attrs, 'id') ?? '', hidden: state === 'hidden' || state === 'veryHidden' })
    }
  }
  const sheet = sheets.find((s) => !s.hidden) ?? sheets[0]
  if (!sheet) throw new WorkbookReadError('The workbook has no sheet')
  const sheetPath = rels.find((r) => r.id === sheet.relId)?.target
  const sheetXml = sheetPath ? part(sheetPath) : null
  if (!sheetXml) throw new WorkbookReadError(`The workbook’s sheet "${sheet.name}" is missing from the file`)

  const sharedPath = rels.find((r) => r.type.endsWith('/sharedStrings'))?.target ?? `${base}sharedStrings.xml`
  const stylesPath = rels.find((r) => r.type.endsWith('/styles'))?.target ?? `${base}styles.xml`
  const shared = sharedStrings(part(sharedPath))
  const dateStyles = dateStyleIndexes(part(stylesPath))

  return { sheetName: sheet.name, rows: sheetRows(sheetXml, shared, dateStyles, date1904) }
}

type Relationship = { id: string; type: string; target: string }

/** A part's relationships, each target made a path from the package's root. */
function relationships(xml: string | null, base: string): Relationship[] {
  if (!xml) return []
  const out: Relationship[] = []
  for (const tok of xmlTokens(xml)) {
    if (tok.kind !== 'open' || localName(tok.name) !== 'Relationship') continue
    if (attr(tok.attrs, 'TargetMode') === 'External') continue
    const target = attr(tok.attrs, 'Target') ?? ''
    out.push({ id: attr(tok.attrs, 'Id') ?? '', type: attr(tok.attrs, 'Type') ?? '', target: resolvePath(base, target) })
  }
  return out
}

/** `worksheets/sheet1.xml` beside `xl/`, or `/xl/worksheets/sheet1.xml` from the root, with `..` taken out. */
export function resolvePath(base: string, target: string): string {
  const joined = target.startsWith('/') ? target.slice(1) : base + target
  const parts: string[] = []
  for (const p of joined.split('/')) {
    if (p === '..') parts.pop()
    else if (p !== '.' && p !== '') parts.push(p)
  }
  return parts.join('/')
}

function findCaseless(zip: Map<string, ZipEntry>, path: string): ZipEntry | undefined {
  const lower = path.toLowerCase()
  for (const [name, entry] of zip) if (name.toLowerCase() === lower) return entry
  return undefined
}

/** The shared strings in order: each `<si>`'s text runs together, without its phonetic guide (`<rPh>`). */
function sharedStrings(xml: string | null): string[] {
  if (!xml) return []
  const out: string[] = []
  let current: string[] | null = null
  let inText = false
  let phonetic = 0
  for (const tok of xmlTokens(xml)) {
    if (tok.kind === 'open') {
      const name = localName(tok.name)
      if (name === 'si') {
        current = []
        if (tok.selfClosing) { out.push(''); current = null }
      } else if (name === 'rPh') {
        if (!tok.selfClosing) phonetic++
      } else if (name === 't' && !tok.selfClosing) inText = true
    } else if (tok.kind === 'close') {
      const name = localName(tok.name)
      if (name === 'si' && current) { out.push(current.join('')); current = null }
      else if (name === 'rPh') phonetic = Math.max(0, phonetic - 1)
      else if (name === 't') inText = false
    } else if (inText && current && phonetic === 0) {
      current.push(tok.text)
    }
  }
  return out
}

/**
 * Number formats Excel draws as a date or a time, by their built-in number
 * (ECMA-376 §18.8.30, and the East Asian date formats 27–36 and 50–58).
 */
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58])

/**
 * A custom format draws a date when its first section names a day, month, year,
 * hour or second once its quoted text, its escaped characters and its
 * bracketed colour or locale are taken out: `d/m/yyyy`, `[$-409]mmm d`,
 * `hh:mm`. `0.00`, `#,##0 [$€]` and `General` name none.
 */
export function isDateFormat(id: number, code?: string): boolean {
  if (BUILTIN_DATE_FORMATS.has(id)) return true
  if (!code) return false
  const first = code
    .replace(/"[^"]*"/g, '')
    .replace(/\\./g, '')
    .replace(/_./g, '')
    .replace(/\[(?:h+|m+|s+)\]/gi, 'h')
    .replace(/\[[^\]]*\]/g, '')
    .split(';')[0]
  return /[dmyhs]/i.test(first.replace(/General/gi, ''))
}

/** The cell formats (`cellXfs`) whose number format is a date, by their index. */
function dateStyleIndexes(xml: string | null): Set<number> {
  const out = new Set<number>()
  if (!xml) return out
  const custom = new Map<number, string>()
  let inCellXfs = false
  let index = 0
  for (const tok of xmlTokens(xml)) {
    if (tok.kind === 'open') {
      const name = localName(tok.name)
      if (name === 'numFmt') custom.set(Number(attr(tok.attrs, 'numFmtId')), attr(tok.attrs, 'formatCode') ?? '')
      else if (name === 'cellXfs') inCellXfs = !tok.selfClosing
      else if (name === 'xf' && inCellXfs) {
        const id = Number(attr(tok.attrs, 'numFmtId') ?? 0)
        if (isDateFormat(id, custom.get(id))) out.add(index)
        index++
      }
    } else if (tok.kind === 'close' && localName(tok.name) === 'cellXfs') inCellXfs = false
  }
  return out
}

/** `B12` → column 1 (A is 0); a reference with no letters says nothing. */
export function columnIndex(ref: string | undefined): number | null {
  if (!ref) return null
  let n = 0
  let i = 0
  for (; i < ref.length; i++) {
    const c = ref.charCodeAt(i)
    if (c >= 65 && c <= 90) n = n * 26 + (c - 64)
    else if (c >= 97 && c <= 122) n = n * 26 + (c - 96)
    else break
  }
  return i === 0 ? null : n - 1
}

/**
 * A count of days as the date it stands for (`2026-10-20`), with its time of
 * day when it has one (`2026-10-20T09:30`). Excel's 1900 system counts a
 * 29 February 1900 that never was (serial 60), so a day before it counts from
 * 31 December 1899 and every day after from the 30th; the 1904 system counts
 * from 1 January 1904. The time is the wall clock the sheet shows, with no zone.
 */
export function serialToIso(serial: number, date1904: boolean): string {
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : serial < 61 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30)
  const seconds = Math.round(serial * 86_400)
  const d = new Date(epoch + seconds * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${String(d.getUTCFullYear()).padStart(4, '0')}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  const ofDay = ((seconds % 86_400) + 86_400) % 86_400
  if (ofDay === 0) return date
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
  return d.getUTCSeconds() ? `${date}T${time}:${pad(d.getUTCSeconds())}` : `${date}T${time}`
}

/** A number as text, shortest first: `3`, `0.25`, `1234.5`. */
export function numberText(raw: string): string {
  const n = Number(raw)
  return Number.isFinite(n) ? String(n) : raw.trim()
}

function sheetRows(xml: string, shared: string[], dateStyles: Set<number>, date1904: boolean): SheetGrid['rows'] {
  const rows: SheetGrid['rows'] = []
  let row: { line: number; cells: string[] } | null = null
  let nextLine = 1
  let cell: { col: number; type: string; style: number; value: string; inline: string[] } | null = null
  let nextCol = 0
  let reading: 'v' | 'is' | null = null
  let inInlineText = false
  let phonetic = 0

  for (const tok of xmlTokens(xml)) {
    if (tok.kind === 'open') {
      const name = localName(tok.name)
      if (name === 'row') {
        const r = Number(attr(tok.attrs, 'r'))
        const line = Number.isFinite(r) && r > 0 ? r : nextLine
        nextLine = line + 1
        nextCol = 0
        row = { line, cells: [] }
        if (tok.selfClosing) row = null
      } else if (name === 'c' && row) {
        const col = columnIndex(attr(tok.attrs, 'r')) ?? nextCol
        nextCol = col + 1
        cell = { col, type: attr(tok.attrs, 't') ?? 'n', style: Number(attr(tok.attrs, 's') ?? 0), value: '', inline: [] }
        if (tok.selfClosing) cell = null
      } else if (cell && name === 'v' && !tok.selfClosing) reading = 'v'
      else if (cell && name === 'is' && !tok.selfClosing) reading = 'is'
      else if (cell && reading === 'is' && name === 'rPh' && !tok.selfClosing) phonetic++
      else if (cell && reading === 'is' && name === 't' && !tok.selfClosing) inInlineText = true
    } else if (tok.kind === 'close') {
      const name = localName(tok.name)
      if (name === 'v' || name === 'is') reading = null
      else if (name === 't') inInlineText = false
      else if (name === 'rPh') phonetic = Math.max(0, phonetic - 1)
      else if (name === 'c' && cell && row) {
        if (cell.col < WORKBOOK_LIMITS.maxColumns) {
          const text = cellText(cell, shared, dateStyles, date1904)
          if (text !== '') {
            while (row.cells.length < cell.col) row.cells.push('')
            row.cells[cell.col] = text
          }
        }
        cell = null
      } else if (name === 'row' && row) {
        if (row.cells.some((c) => c.trim() !== '')) {
          rows.push(row)
          if (rows.length > WORKBOOK_LIMITS.maxRows) {
            throw new WorkbookReadError(`The sheet has more than ${WORKBOOK_LIMITS.maxRows} rows; split it into smaller files`)
          }
        }
        row = null
      }
    } else if (cell) {
      if (reading === 'v') cell.value += tok.text
      else if (reading === 'is' && inInlineText && phonetic === 0) cell.inline.push(tok.text)
    }
  }
  return rows
}

function cellText(
  cell: { type: string; style: number; value: string; inline: string[] },
  shared: string[],
  dateStyles: Set<number>,
  date1904: boolean,
): string {
  switch (cell.type) {
    case 's':
      return shared[Number(cell.value)] ?? ''
    case 'inlineStr':
      return cell.inline.join('')
    case 'str':
    case 'e':
    case 'd':
      return cell.value
    case 'b':
      return cell.value.trim() === '1' || cell.value.trim().toLowerCase() === 'true' ? 'TRUE' : 'FALSE'
    default: {
      const raw = cell.value.trim()
      if (raw === '') return ''
      const n = Number(raw)
      if (Number.isFinite(n) && dateStyles.has(cell.style)) return serialToIso(n, date1904)
      return numberText(raw)
    }
  }
}

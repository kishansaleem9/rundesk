/**
 * A dependency-free .xlsx reader — the inverse of the API's `common/export/xlsx.ts`
 * writer (`ledger-rows/row-816`). An .xlsx is a ZIP of XML parts; the only hard
 * piece is DEFLATE, which every supported runtime already ships as
 * `DecompressionStream('deflate-raw')` (browsers, and Node 18+). So the same
 * code runs in the import wizard, where the person reviews their rows, and on
 * the API, which never trusts what the wizard sent.
 *
 * It reads the FIRST worksheet only, as ClickUp's spreadsheet importer does.
 * Formulas are read as their cached result; a cell is never evaluated.
 */

import { finishTable, SheetReadError, SHEET_READ_MESSAGES, type SheetRow, type SheetTable } from './table'

type ZipEntry = { name: string; method: number; compressedSize: number; offset: number }

type Inflater = (data: Uint8Array) => Promise<Uint8Array>

type StreamGlobals = {
  DecompressionStream?: new (format: string) => unknown
  Blob: new (parts: Uint8Array[]) => { stream(): { pipeThrough(t: unknown): unknown } }
  Response: new (body: unknown) => { arrayBuffer(): Promise<ArrayBuffer> }
  TextDecoder: new (label?: string) => { decode(bytes: Uint8Array): string }
}

const runtime = globalThis as unknown as StreamGlobals

const inflateRaw: Inflater = async (data) => {
  if (!runtime.DecompressionStream) {
    throw new SheetReadError('unreadable', 'This browser cannot open .xlsx files. Save the sheet as .csv instead.')
  }
  const stream = new runtime.Blob([data]).stream().pipeThrough(new runtime.DecompressionStream('deflate-raw'))
  return new Uint8Array(await new runtime.Response(stream).arrayBuffer())
}

const utf8 = (bytes: Uint8Array) => new runtime.TextDecoder('utf-8').decode(bytes)

function u16(b: Uint8Array, at: number): number {
  return b[at] | (b[at + 1] << 8)
}

function u32(b: Uint8Array, at: number): number {
  return (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16)) + b[at + 3] * 0x1000000
}

/** The central directory, found from the end-of-central-directory record. */
function zipEntries(b: Uint8Array): ZipEntry[] {
  const floor = Math.max(0, b.length - 22 - 0xffff)
  let eocd = -1
  for (let i = b.length - 22; i >= floor; i--) {
    if (u32(b, i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new SheetReadError('unreadable', SHEET_READ_MESSAGES.unreadable)
  const count = u16(b, eocd + 10)
  let at = u32(b, eocd + 16)
  const entries: ZipEntry[] = []
  for (let n = 0; n < count; n++) {
    if (u32(b, at) !== 0x02014b50) throw new SheetReadError('unreadable', SHEET_READ_MESSAGES.unreadable)
    const nameLen = u16(b, at + 28)
    const extraLen = u16(b, at + 30)
    const commentLen = u16(b, at + 32)
    entries.push({
      name: utf8(b.subarray(at + 46, at + 46 + nameLen)),
      method: u16(b, at + 10),
      compressedSize: u32(b, at + 20),
      offset: u32(b, at + 42),
    })
    at += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

async function entryText(b: Uint8Array, entry: ZipEntry, inflate: Inflater): Promise<string> {
  const local = entry.offset
  if (u32(b, local) !== 0x04034b50) throw new SheetReadError('unreadable', SHEET_READ_MESSAGES.unreadable)
  const start = local + 30 + u16(b, local + 26) + u16(b, local + 28)
  const raw = b.subarray(start, start + entry.compressedSize)
  if (entry.method === 0) return utf8(raw)
  if (entry.method === 8) return utf8(await inflate(raw))
  throw new SheetReadError('unreadable', SHEET_READ_MESSAGES.unreadable)
}

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }

/** XML entities, then OOXML's own `_xHHHH_` escapes (Excel writes a CR as `_x000D_`). */
export function decodeXmlText(s: string): string {
  return s
    .replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m, ref: string) => {
      if (ref[0] === '#') {
        const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10)
        return Number.isFinite(code) ? String.fromCodePoint(code) : m
      }
      return ENTITIES[ref.toLowerCase()] ?? m
    })
    .replace(/_x([0-9a-f]{4})_/gi, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)))
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of tag.matchAll(/([\w:]+)="([^"]*)"/g)) out[m[1]] = m[2]
  return out
}

/** Text of every `<t>` run, skipping phonetic guides (`<rPh>`), which are not the cell's text. */
function runsText(xml: string): string {
  const withoutPhonetic = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')
  let out = ''
  for (const m of withoutPhonetic.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g)) out += decodeXmlText(m[1] ?? '')
  return out
}

function sharedStrings(xml: string | undefined): string[] {
  if (!xml) return []
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g)].map((m) => runsText(m[1] ?? ''))
}

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57])

/** Whether a number format code draws a date or time (ignoring quoted text and [colour] blocks). */
export function isDateFormatCode(code: string): boolean {
  const bare = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '')
  return /[dmyhs]/i.test(bare) && !/^[#0.,%\s?/E+-]*$/i.test(bare)
}

/** Which style indexes (`<c s="…">`) are dates. */
function dateStyles(xml: string | undefined): Set<number> {
  const out = new Set<number>()
  if (!xml) return out
  const custom = new Map<number, string>()
  for (const m of xml.matchAll(/<numFmt\b([^>]*)\/?>/g)) {
    const a = attrs(m[1])
    custom.set(Number(a.numFmtId), decodeXmlText(a.formatCode ?? ''))
  }
  const cellXfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1] ?? ''
  let index = 0
  for (const m of cellXfs.matchAll(/<xf\b([^>]*?)(?:\/>|>[\s\S]*?<\/xf>)/g)) {
    const id = Number(attrs(m[1]).numFmtId ?? 0)
    const code = custom.get(id)
    if (BUILTIN_DATE_FORMATS.has(id) || (code !== undefined && isDateFormatCode(code))) out.add(index)
    index++
  }
  return out
}

/** Excel serial day → ISO 8601. The 1900 system counts a phantom 29 Feb 1900, hence 25569. */
export function excelSerialToIso(serial: number, date1904 = false): string {
  const ms = Math.round((serial - (date1904 ? 24107 : 25569)) * 86_400_000)
  return new Date(ms).toISOString()
}

/** `A` → 0, `Z` → 25, `AA` → 26. */
function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? ''
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function resolveTarget(target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const parts = `xl/${target}`.split('/')
  const out: string[] = []
  for (const p of parts) {
    if (p === '..') out.pop()
    else if (p !== '.') out.push(p)
  }
  return out.join('/')
}

export async function readXlsx(bytes: Uint8Array, inflate: Inflater = inflateRaw): Promise<SheetTable> {
  const entries = zipEntries(bytes)
  const byName = new Map(entries.map((e) => [e.name, e]))
  const read = async (name: string) => {
    const e = byName.get(name)
    return e ? entryText(bytes, e, inflate) : undefined
  }

  const workbook = await read('xl/workbook.xml')
  if (!workbook) throw new SheetReadError('unreadable', SHEET_READ_MESSAGES.unreadable)
  const date1904 = /<workbookPr\b[^>]*date1904="(1|true)"/.test(workbook)
  const firstSheet = /<sheet\b([^>]*)\/?>/.exec(workbook)
  let sheetPath = 'xl/worksheets/sheet1.xml'
  if (firstSheet) {
    const relId = attrs(firstSheet[1])['r:id']
    const rels = await read('xl/_rels/workbook.xml.rels')
    if (rels && relId) {
      for (const m of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
        const a = attrs(m[1])
        if (a.Id === relId && a.Target) sheetPath = resolveTarget(a.Target)
      }
    }
  }
  const sheet = await read(sheetPath)
  if (!sheet) throw new SheetReadError('unreadable', SHEET_READ_MESSAGES.unreadable)
  const strings = sharedStrings(await read('xl/sharedStrings.xml'))
  const dates = dateStyles(await read('xl/styles.xml'))

  const grid: Array<{ line: number; cells: string[] }> = []
  let nextLine = 1
  for (const rowMatch of sheet.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const line = Number(attrs(rowMatch[1]).r) || nextLine
    nextLine = line + 1
    const cells: string[] = []
    let nextCol = 0
    for (const c of (rowMatch[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const a = attrs(c[1])
      const col = a.r ? columnIndex(a.r) : nextCol
      nextCol = col + 1
      const inner = c[2] ?? ''
      const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner)?.[1]
      let text = ''
      switch (a.t) {
        case 's':
          text = strings[Number(v)] ?? ''
          break
        case 'inlineStr':
          text = runsText(/<is\b[^>]*>([\s\S]*?)<\/is>/.exec(inner)?.[1] ?? '')
          break
        case 'b':
          text = v === '1' ? 'true' : v === '0' ? 'false' : ''
          break
        case 'e':
          text = ''
          break
        case 'str':
        case 'd':
          text = decodeXmlText(v ?? '')
          break
        default: {
          if (v === undefined || v === '') break
          const n = Number(v)
          text = a.s !== undefined && dates.has(Number(a.s)) && Number.isFinite(n) ? excelSerialToIso(n, date1904) : v
        }
      }
      while (cells.length < col) cells.push('')
      cells[col] = text
    }
    grid.push({ line, cells })
  }
  if (grid.length === 0) throw new SheetReadError('empty_file', SHEET_READ_MESSAGES.empty_file)
  const [header, ...data] = grid
  const rows: SheetRow[] = data.map((r) => ({ line: r.line, cells: r.cells }))
  return finishTable(header.cells, rows)
}

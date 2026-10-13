import { WORKBOOK_LIMITS, WorkbookReadError, isDateFormat, numberText, serialToIso, type SheetGrid } from './xlsx-read'

/**
 * A LEGACY .xls READ AS THE ROWS IT SHOWS (`ledger-rows/row-816`).
 *
 * ClickUp's Spreadsheets Importer takes .xls beside .xlsx. An .xls is not a
 * zip: it is a Compound File (MS-CFB) — a small FAT file system in one file —
 * holding a stream named `Workbook` of BIFF8 records (MS-XLS). Excel 97 to
 * 2003 wrote it, and Excel, LibreOffice and many exporters still do. Both
 * halves are read here with no dependency:
 *
 *   · the compound file: its sectors, its FAT and its mini FAT (a stream under
 *     4 096 bytes lives in 64-byte mini sectors), its directory, and the
 *     `Workbook` stream they make up;
 *   · the workbook stream: the globals (the 1904 flag, the sheets and where
 *     each starts, the shared strings, the number formats and the cell formats
 *     that point at them), then the first visible worksheet's cells.
 *
 * A cell's text is what `xlsx-read.ts` gives an .xlsx's: shared or inline
 * strings, a formula's last value, TRUE/FALSE, an error's code, a date as its
 * ISO day, any other number shortest first.
 *
 * REFUSED IN WORDS: an Excel 5 or 95 workbook (BIFF5, a `Book` stream, no
 * shared strings), and one saved with a password (`FILEPASS`): both are told to
 * save the file as .xlsx, which every version since 2007 does.
 */

const SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
const END_OF_CHAIN = 0xfffffffe
const FREE_SECT = 0xffffffff

/** An OLE2 compound file by its first eight bytes, which every .xls starts with. */
export function isCompoundFile(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && SIGNATURE.every((b, i) => bytes[i] === b)
}

export function readXls(buf: Buffer): SheetGrid {
  if (!isCompoundFile(buf) || buf.length < 512) throw new WorkbookReadError('This file is not an Excel 97–2003 workbook (.xls)')
  const stream = workbookStream(buf)
  return readBiff8(stream)
}

// ── the compound file ────────────────────────────────────────────────────────

function workbookStream(buf: Buffer): Buffer {
  const sectorShift = buf.readUInt16LE(0x1e)
  const miniShift = buf.readUInt16LE(0x20)
  if (sectorShift !== 9 && sectorShift !== 12) throw new WorkbookReadError('The workbook’s file is damaged (sector size)')
  const sectorSize = 1 << sectorShift
  const miniSize = 1 << miniShift
  const fatSectors = buf.readUInt32LE(0x2c)
  const firstDirSector = buf.readUInt32LE(0x30)
  const miniCutoff = buf.readUInt32LE(0x38)
  const firstMiniFat = buf.readUInt32LE(0x3c)
  let difatSector = buf.readUInt32LE(0x44)
  const difatCount = buf.readUInt32LE(0x48)
  // The header fills the first sector's room; sector n follows at (n + 1) sectors in. A short last one is read as far as it goes.
  const sectorCount = Math.ceil((buf.length - sectorSize) / sectorSize)

  const sectorAt = (n: number): Buffer => {
    if (n >= sectorCount) throw new WorkbookReadError('The workbook’s file is cut short')
    const start = (n + 1) * sectorSize
    return buf.subarray(start, Math.min(start + sectorSize, buf.length))
  }

  // The FAT's own sectors: 109 named in the header, the rest in a chain of DIFAT sectors.
  const fatList: number[] = []
  for (let i = 0; i < 109 && fatList.length < fatSectors; i++) {
    const s = buf.readUInt32LE(0x4c + i * 4)
    if (s !== FREE_SECT) fatList.push(s)
  }
  for (let d = 0; d < difatCount && difatSector !== END_OF_CHAIN && difatSector !== FREE_SECT; d++) {
    const sec = sectorAt(difatSector)
    const per = sectorSize / 4 - 1
    for (let i = 0; i < per && fatList.length < fatSectors; i++) {
      const s = sec.readUInt32LE(i * 4)
      if (s !== FREE_SECT) fatList.push(s)
    }
    difatSector = sec.readUInt32LE(per * 4)
  }
  const fat: number[] = []
  for (const s of fatList) {
    const sec = sectorAt(s)
    for (let i = 0; i + 4 <= sec.length; i += 4) fat.push(sec.readUInt32LE(i))
  }

  const chain = (start: number, table: number[]): number[] => {
    const out: number[] = []
    let s = start
    while (s !== END_OF_CHAIN && s !== FREE_SECT) {
      if (s >= table.length || out.length > table.length) throw new WorkbookReadError('The workbook’s file is damaged (a broken sector chain)')
      out.push(s)
      s = table[s]
    }
    return out
  }
  const readChain = (start: number, size: number): Buffer => {
    const parts = chain(start, fat).map(sectorAt)
    return Buffer.concat(parts).subarray(0, size)
  }

  // The directory: 128-byte entries, the root first.
  const dir = Buffer.concat(chain(firstDirSector, fat).map(sectorAt))
  type Entry = { name: string; type: number; start: number; size: number }
  const entries: Entry[] = []
  for (let at = 0; at + 128 <= dir.length; at += 128) {
    const nameBytes = Math.min(dir.readUInt16LE(at + 0x40), 64)
    const name = dir.subarray(at, at + Math.max(0, nameBytes - 2)).toString('utf16le')
    const type = dir.readUInt8(at + 0x42)
    const start = dir.readUInt32LE(at + 0x74)
    const size = dir.readUInt32LE(at + 0x78)
    entries.push({ name, type, start, size })
  }
  const root = entries.find((e) => e.type === 5)
  const book = entries.find((e) => e.type === 2 && e.name.toLowerCase() === 'workbook')
  if (!book) {
    if (entries.some((e) => e.type === 2 && e.name.toLowerCase() === 'book')) {
      throw new WorkbookReadError('This is an Excel 5.0/95 workbook, which is not read: save it as .xlsx and import that')
    }
    throw new WorkbookReadError('This compound file holds no Excel workbook')
  }
  if (book.size > WORKBOOK_LIMITS.maxEntryBytes) throw new WorkbookReadError('The workbook is larger than is read')

  if (book.size >= miniCutoff || !root) return readChain(book.start, book.size)

  // A small stream lives in the mini stream, in 64-byte sectors chained by the mini FAT.
  const miniStream = readChain(root.start, root.size)
  const miniFatBytes = firstMiniFat === END_OF_CHAIN ? Buffer.alloc(0) : Buffer.concat(chain(firstMiniFat, fat).map(sectorAt))
  const miniFat: number[] = []
  for (let i = 0; i + 4 <= miniFatBytes.length; i += 4) miniFat.push(miniFatBytes.readUInt32LE(i))
  const parts = chain(book.start, miniFat).map((m) => miniStream.subarray(m * miniSize, (m + 1) * miniSize))
  return Buffer.concat(parts).subarray(0, book.size)
}

// ── BIFF8 ────────────────────────────────────────────────────────────────────

const BOF = 0x0809
const EOF = 0x000a
const CONTINUE = 0x003c
const FILEPASS = 0x002f
const DATEMODE = 0x0022
const BOUNDSHEET = 0x0085
const SST = 0x00fc
const FORMAT = 0x041e
const XF = 0x00e0
const LABELSST = 0x00fd
const LABEL = 0x0204
const RSTRING = 0x00d6
const NUMBER = 0x0203
const RK = 0x027e
const MULRK = 0x00bd
const FORMULA = 0x0006
const STRING = 0x0207
const BOOLERR = 0x0205

type BiffRecord = { type: number; data: Buffer; offset: number }

function records(stream: Buffer, from = 0): BiffRecord[] {
  const out: BiffRecord[] = []
  let at = from
  while (at + 4 <= stream.length) {
    const type = stream.readUInt16LE(at)
    const length = stream.readUInt16LE(at + 2)
    if (at + 4 + length > stream.length) break
    out.push({ type, data: stream.subarray(at + 4, at + 4 + length), offset: at })
    at += 4 + length
  }
  return out
}

/**
 * Text that may run on into CONTINUE records. When a string's CHARACTERS are
 * cut by a record's end, the next record starts with one option byte again,
 * saying whether the rest are one byte or two each (MS-XLS 2.5.293); anything
 * else cut — a string's header, its formatting runs — simply carries on.
 */
class Pieces {
  private i = 0
  private at = 0
  constructor(private readonly parts: Buffer[]) {}

  private settle() {
    while (this.i < this.parts.length && this.at >= this.parts[this.i].length) {
      this.i++
      this.at = 0
    }
  }
  u8(): number {
    this.settle()
    if (this.i >= this.parts.length) throw new WorkbookReadError('The workbook’s text is cut short')
    return this.parts[this.i][this.at++]
  }
  u16(): number { return this.u8() | (this.u8() << 8) }
  u32(): number { return (this.u16() | (this.u16() << 16)) >>> 0 }
  skip(n: number) { for (let k = 0; k < n; k++) this.u8() }

  /** An XLUnicodeRichExtendedString (the shared strings) or an XLUnicodeString (`rich: false`). */
  string(cch: number, rich: boolean): string {
    const flags = this.u8()
    let wide = (flags & 0x01) !== 0
    const runs = rich && flags & 0x08 ? this.u16() : 0
    const ext = rich && flags & 0x04 ? this.u32() : 0
    let text = ''
    for (let n = 0; n < cch; n++) {
      // Characters cut by a record's end: the next record restates their width.
      if (this.i < this.parts.length && this.at >= this.parts[this.i].length && this.i + 1 < this.parts.length) {
        this.i++
        this.at = 0
        wide = (this.u8() & 0x01) !== 0
      }
      text += String.fromCharCode(wide ? this.u16() : this.u8())
    }
    this.skip(runs * 4 + ext)
    return text
  }
}

/** A short string inside one record: `cch` (one byte, or two for `long`), its option byte, its characters. */
function recordString(data: Buffer, at: number, long: boolean): string {
  const cch = long ? data.readUInt16LE(at) : data.readUInt8(at)
  const p = new Pieces([data.subarray(at + (long ? 2 : 1))])
  return p.string(cch, false)
}

/** An RK number: thirty bits of a double or of an integer, perhaps a hundredth of it (MS-XLS 2.5.217). */
export function rkNumber(rk: number): number {
  const v = rk >>> 0
  let n: number
  if (v & 0x02) n = (v | 0) >> 2
  else {
    const b = Buffer.alloc(8)
    b.writeUInt32LE((v & 0xfffffffc) >>> 0, 4)
    n = b.readDoubleLE(0)
  }
  return v & 0x01 ? n / 100 : n
}

function readBiff8(stream: Buffer): SheetGrid {
  const all = records(stream)
  if (!all.length || all[0].type !== BOF) {
    if (all.length && (all[0].type === 0x0009 || all[0].type === 0x0209 || all[0].type === 0x0409)) {
      throw new WorkbookReadError('This workbook is older than Excel 97 and is not read: save it as .xlsx and import that')
    }
    throw new WorkbookReadError('The workbook stream does not start as an Excel workbook')
  }
  if (all[0].data.readUInt16LE(0) !== 0x0600) {
    throw new WorkbookReadError('This is an Excel 5.0/95 workbook, which is not read: save it as .xlsx and import that')
  }

  let date1904 = false
  const sheets: Array<{ name: string; offset: number; visible: boolean; worksheet: boolean }> = []
  const formats = new Map<number, string>()
  const xfFormat: number[] = []
  let shared: string[] = []

  for (let k = 1; k < all.length; k++) {
    const r = all[k]
    if (r.type === EOF) break
    if (r.type === FILEPASS) throw new WorkbookReadError('The workbook is protected by a password: save a copy without one and import that')
    if (r.type === DATEMODE) date1904 = r.data.readUInt16LE(0) === 1
    else if (r.type === BOUNDSHEET) {
      sheets.push({
        offset: r.data.readUInt32LE(0),
        visible: r.data.readUInt8(4) === 0,
        worksheet: r.data.readUInt8(5) === 0,
        name: recordString(r.data, 6, false),
      })
    } else if (r.type === FORMAT) formats.set(r.data.readUInt16LE(0), recordString(r.data, 2, true))
    else if (r.type === XF) xfFormat.push(r.data.readUInt16LE(2))
    else if (r.type === SST) {
      const parts = [r.data]
      while (k + 1 < all.length && all[k + 1].type === CONTINUE) parts.push(all[++k].data)
      const p = new Pieces(parts)
      p.u32()
      const unique = p.u32()
      shared = []
      for (let n = 0; n < unique; n++) shared.push(p.string(p.u16(), true))
    }
  }

  const sheet = sheets.find((s) => s.worksheet && s.visible) ?? sheets.find((s) => s.worksheet)
  if (!sheet) throw new WorkbookReadError('The workbook has no worksheet')

  const isDate = (xf: number) => {
    const id = xfFormat[xf]
    return id !== undefined && isDateFormat(id, formats.get(id))
  }
  const number = (n: number, xf: number) => (isDate(xf) ? serialToIso(n, date1904) : numberText(String(n)))

  const grid = new Map<number, string[]>()
  const put = (row: number, col: number, text: string) => {
    if (text === '' || col >= WORKBOOK_LIMITS.maxColumns) return
    let cells = grid.get(row)
    if (!cells) {
      if (grid.size >= WORKBOOK_LIMITS.maxRows) throw new WorkbookReadError(`The sheet has more than ${WORKBOOK_LIMITS.maxRows} rows; split it into smaller files`)
      cells = []
      grid.set(row, cells)
    }
    while (cells.length < col) cells.push('')
    cells[col] = text
  }

  const body = records(stream, sheet.offset)
  let depth = 0
  let pendingFormula: { row: number; col: number } | null = null
  for (let k = 0; k < body.length; k++) {
    const r = body[k]
    const d = r.data
    if (r.type === BOF) { depth++; continue }
    if (r.type === EOF) { if (--depth <= 0) break; continue }
    if (depth !== 1) continue
    switch (r.type) {
      case LABELSST:
        put(d.readUInt16LE(0), d.readUInt16LE(2), shared[d.readUInt32LE(6)] ?? '')
        break
      case LABEL:
      case RSTRING:
        put(d.readUInt16LE(0), d.readUInt16LE(2), recordString(d, 6, true))
        break
      case NUMBER:
        put(d.readUInt16LE(0), d.readUInt16LE(2), number(d.readDoubleLE(6), d.readUInt16LE(4)))
        break
      case RK:
        put(d.readUInt16LE(0), d.readUInt16LE(2), number(rkNumber(d.readUInt32LE(6)), d.readUInt16LE(4)))
        break
      case MULRK: {
        const row = d.readUInt16LE(0)
        const first = d.readUInt16LE(2)
        const count = (d.length - 6) / 6
        for (let n = 0; n < count; n++) {
          const at = 4 + n * 6
          put(row, first + n, number(rkNumber(d.readUInt32LE(at + 2)), d.readUInt16LE(at)))
        }
        break
      }
      case FORMULA: {
        const row = d.readUInt16LE(0)
        const col = d.readUInt16LE(2)
        const xf = d.readUInt16LE(4)
        if (d.readUInt16LE(12) === 0xffff) {
          const kind = d.readUInt8(6)
          if (kind === 0) pendingFormula = { row, col }
          else if (kind === 1) put(row, col, d.readUInt8(8) ? 'TRUE' : 'FALSE')
          else if (kind === 2) put(row, col, errorText(d.readUInt8(8)))
        } else {
          put(row, col, number(d.readDoubleLE(6), xf))
        }
        break
      }
      case STRING: {
        if (!pendingFormula) break
        const parts = [d]
        while (k + 1 < body.length && body[k + 1].type === CONTINUE) parts.push(body[++k].data)
        const p = new Pieces(parts)
        put(pendingFormula.row, pendingFormula.col, p.string(p.u16(), false))
        pendingFormula = null
        break
      }
      case BOOLERR: {
        const value = d.readUInt8(6)
        put(d.readUInt16LE(0), d.readUInt16LE(2), d.readUInt8(7) ? errorText(value) : value ? 'TRUE' : 'FALSE')
        break
      }
    }
  }

  const rows = [...grid.entries()]
    .sort((a, b) => a[0] - b[0])
    .filter(([, cells]) => cells.some((c) => c.trim() !== ''))
    .map(([row, cells]) => ({ line: row + 1, cells }))
  return { sheetName: sheet.name, rows }
}

/** A cell error by its code, as Excel writes it. */
function errorText(code: number): string {
  return ({ 0x00: '#NULL!', 0x07: '#DIV/0!', 0x0f: '#VALUE!', 0x17: '#REF!', 0x1d: '#NAME?', 0x24: '#NUM!', 0x2a: '#N/A' } as Record<number, string>)[code] ?? '#ERROR'
}

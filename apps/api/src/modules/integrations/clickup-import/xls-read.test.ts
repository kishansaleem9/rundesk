import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isCompoundFile, readXls, rkNumber } from './xls-read'
import { WorkbookReadError } from './xlsx-read'

/**
 * A LEGACY .xls READ AS THE ROWS IT SHOWS (`ledger-rows/row-816`). The file is
 * put together here as MS-CFB and MS-XLS describe it — a compound file holding
 * a BIFF8 `Workbook` stream — so each thing the reader must survive can be
 * said: a shared string cut across a CONTINUE record and restating its width,
 * a wide (UTF-16) string, RK and MULRK numbers, a formula's string result in
 * the STRING record after it, a date by its cell format, a hidden first sheet,
 * and a stream small enough to live in the mini stream.
 */

const rec = (type: number, data: Buffer) => {
  const head = Buffer.alloc(4)
  head.writeUInt16LE(type, 0)
  head.writeUInt16LE(data.length, 2)
  return Buffer.concat([head, data])
}
const u16 = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b }
const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b }
const f64 = (n: number) => { const b = Buffer.alloc(8); b.writeDoubleLE(n); return b }
// Wide when any character is past Latin-1 — the range starts at NUL, which is the point.
// eslint-disable-next-line no-control-regex
const wide = (s: string) => /[^\u0000-ÿ]/.test(s)
const chars = (s: string) => (wide(s) ? Buffer.from(s, 'utf16le') : Buffer.from(s, 'latin1'))
/** XLUnicodeString: a two-byte count, the option byte, the characters. */
const xlString = (s: string) => Buffer.concat([u16(s.length), Buffer.from([wide(s) ? 1 : 0]), chars(s)])
/** ShortXLUnicodeString: a one-byte count. */
const shortString = (s: string) => Buffer.concat([Buffer.from([s.length, wide(s) ? 1 : 0]), chars(s)])
const bof = (dt: number) => rec(0x0809, Buffer.concat([u16(0x0600), u16(dt), Buffer.alloc(12)]))
const EOF_REC = rec(0x000a, Buffer.alloc(0))
const cell = (row: number, col: number, xf: number) => Buffer.concat([u16(row), u16(col), u16(xf)])

const SERIAL = (Date.UTC(2026, 9, 20) - Date.UTC(1899, 11, 30)) / 86_400_000

/**
 * The shared strings, and an SST record cut short so the long one's
 * characters run on into a CONTINUE that restates them as wide.
 */
function sstRecords(strings: string[], cutAfterChars: { index: number; chars: number }) {
  const parts: Buffer[] = [u32(strings.length + 2), u32(strings.length)]
  const records: Buffer[] = []
  for (let i = 0; i < strings.length; i++) {
    const s = strings[i]
    if (i !== cutAfterChars.index) {
      parts.push(xlString(s))
      continue
    }
    // This one is written narrow up to the cut, then the CONTINUE begins with its option byte: wide.
    parts.push(u16(s.length), Buffer.from([0]), Buffer.from(s.slice(0, cutAfterChars.chars), 'latin1'))
    records.push(rec(0x00fc, Buffer.concat(parts)))
    parts.length = 0
    parts.push(Buffer.from([1]), Buffer.from(s.slice(cutAfterChars.chars), 'utf16le'))
  }
  records.push(rec(records.length ? 0x003c : 0x00fc, Buffer.concat(parts)))
  return Buffer.concat(records)
}

function workbookStream(opts: { hiddenFirst?: boolean } = {}): Buffer {
  const strings = ['Title', 'Status', 'Due', 'Points', 'Ship the import', 'Done', `A long name that runs on ✓ past its record`]
  const xfs: Buffer[] = []
  for (let i = 0; i < 15; i++) xfs.push(rec(0x00e0, Buffer.concat([u16(0), u16(0), Buffer.alloc(16)])))
  xfs.push(rec(0x00e0, Buffer.concat([u16(0), u16(14), Buffer.alloc(16)]))) // 15: m/d/yyyy
  xfs.push(rec(0x00e0, Buffer.concat([u16(0), u16(164), Buffer.alloc(16)]))) // 16: the custom date below
  const sheetNames = ['Notes', 'Tasks']
  const boundsheet = (offset: number, name: string, hidden: boolean) =>
    rec(0x0085, Buffer.concat([u32(offset), Buffer.from([hidden ? 1 : 0, 0]), shortString(name)]))
  const globalsWith = (offsets: number[]) =>
    Buffer.concat([
      bof(0x0005),
      rec(0x0022, u16(0)),
      rec(0x041e, Buffer.concat([u16(164), xlString('dd/mm/yyyy')])),
      ...xfs,
      boundsheet(offsets[0], sheetNames[0], opts.hiddenFirst === true),
      boundsheet(offsets[1], sheetNames[1], false),
      sstRecords(strings, { index: 6, chars: 20 }),
      EOF_REC,
    ])
  const notes = Buffer.concat([bof(0x0010), rec(0x00fd, Buffer.concat([cell(0, 0, 0), u32(4)])), EOF_REC])
  const rk = (n: number) => (Number.isInteger(n) ? ((n << 2) | 2) >>> 0 : (() => { const b = Buffer.alloc(8); b.writeDoubleLE(n); return b.readUInt32LE(4) & 0xfffffffc })())
  const tasks = Buffer.concat([
    bof(0x0010),
    // Row 0: the header — four shared strings.
    ...[0, 1, 2, 3].map((n) => rec(0x00fd, Buffer.concat([cell(0, n, 0), u32(n)]))),
    // Row 1: a shared string, a LABEL, a date as a NUMBER, an RK integer.
    rec(0x00fd, Buffer.concat([cell(1, 0, 0), u32(4)])),
    rec(0x0204, Buffer.concat([cell(1, 1, 0), xlString('In progress')])),
    rec(0x0203, Buffer.concat([cell(1, 2, 15), f64(SERIAL)])),
    rec(0x027e, Buffer.concat([cell(1, 3, 0), u32(rk(5))])),
    // Row 3 (row 2 is empty): the long shared string; a formula whose string result follows it; a MULRK of a custom date and a float.
    rec(0x00fd, Buffer.concat([cell(3, 0, 0), u32(6)])),
    rec(0x0006, Buffer.concat([cell(3, 1, 0), Buffer.from([0, 0, 0, 0, 0, 0, 0xff, 0xff]), u16(0), u32(0), u16(0)])),
    rec(0x0207, xlString('Done by formula')),
    rec(0x00bd, Buffer.concat([u16(3), u16(2), u16(16), u32(rk(SERIAL)), u16(0), u32(rk(1.5)), u16(3)])),
    // Row 4: a boolean, and an error.
    rec(0x0205, Buffer.concat([cell(4, 0, 0), Buffer.from([1, 0])])),
    rec(0x0205, Buffer.concat([cell(4, 1, 0), Buffer.from([0x2a, 1])])),
    EOF_REC,
  ])
  // Each sheet's BOF is where the globals end, then where the first sheet ends.
  const sizing = globalsWith([0, 0]).length
  return Buffer.concat([globalsWith([sizing, sizing + notes.length]), notes, tasks])
}

/** A compound file (MS-CFB v3, 512-byte sectors) holding one stream, `Workbook` — in the mini stream when it is small. */
function compoundFile(stream: Buffer, streamName = 'Workbook'): Buffer {
  const S = 512
  const END = 0xfffffffe
  const FREE = 0xffffffff
  const mini = stream.length < 4096
  const sectors: Buffer[] = []
  const fat: number[] = []
  // Sector 0 is the FAT, sector 1 the directory.
  sectors.push(Buffer.alloc(S), Buffer.alloc(S))
  fat.push(0xfffffffd, END)
  let streamStart: number
  let rootStart = END
  let rootSize = 0
  let miniFatStart = END
  let miniFatCount = 0
  const chainOf = (data: Buffer): number => {
    const first = sectors.length
    const n = Math.max(1, Math.ceil(data.length / S))
    for (let k = 0; k < n; k++) {
      const sec = Buffer.alloc(S)
      data.copy(sec, 0, k * S, Math.min((k + 1) * S, data.length))
      sectors.push(sec)
      fat.push(k === n - 1 ? END : first + k + 1)
    }
    return first
  }
  if (mini) {
    const m = 64
    const count = Math.ceil(stream.length / m)
    const miniFat = Buffer.alloc(S, 0xff)
    for (let k = 0; k < count; k++) miniFat.writeUInt32LE(k === count - 1 ? END : k + 1, k * 4)
    miniFatStart = chainOf(miniFat)
    miniFatCount = 1
    const padded = Buffer.alloc(count * m)
    stream.copy(padded)
    rootStart = chainOf(padded)
    rootSize = padded.length
    streamStart = 0
  } else {
    streamStart = chainOf(stream)
  }
  const fatSector = Buffer.alloc(S, 0xff)
  fat.forEach((v, i) => fatSector.writeUInt32LE(v, i * 4))
  sectors[0] = fatSector

  const entry = (name: string, type: number, start: number, size: number, child = FREE) => {
    const e = Buffer.alloc(128)
    if (name) {
      e.write(name, 0, 'utf16le')
      e.writeUInt16LE((name.length + 1) * 2, 0x40)
    }
    e.writeUInt8(type, 0x42)
    e.writeUInt8(1, 0x43)
    e.writeUInt32LE(FREE, 0x44)
    e.writeUInt32LE(FREE, 0x48)
    e.writeUInt32LE(child, 0x4c)
    e.writeUInt32LE(start, 0x74)
    e.writeUInt32LE(size, 0x78)
    return e
  }
  sectors[1] = Buffer.concat([
    entry('Root Entry', 5, rootStart, rootSize, 1),
    entry(streamName, 2, streamStart, stream.length),
    entry('', 0, FREE, 0),
    entry('', 0, FREE, 0),
  ])

  const header = Buffer.alloc(S)
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(header)
  header.writeUInt16LE(0x003e, 0x18)
  header.writeUInt16LE(3, 0x1a)
  header.writeUInt16LE(0xfffe, 0x1c)
  header.writeUInt16LE(9, 0x1e)
  header.writeUInt16LE(6, 0x20)
  header.writeUInt32LE(1, 0x2c)
  header.writeUInt32LE(1, 0x30)
  header.writeUInt32LE(4096, 0x38)
  header.writeUInt32LE(miniFatStart, 0x3c)
  header.writeUInt32LE(miniFatCount, 0x40)
  header.writeUInt32LE(END, 0x44)
  header.writeUInt32LE(0, 0x48)
  for (let i = 0; i < 109; i++) header.writeUInt32LE(i === 0 ? 0 : FREE, 0x4c + i * 4)
  return Buffer.concat([header, ...sectors])
}

const EXPECTED = [
  { line: 1, cells: ['Title', 'Status', 'Due', 'Points'] },
  { line: 2, cells: ['Ship the import', 'In progress', '2026-10-20', '5'] },
  { line: 4, cells: ['A long name that runs on ✓ past its record', 'Done by formula', '2026-10-20', '1.5'] },
  { line: 5, cells: ['TRUE', '#N/A'] },
]

describe('readXls — an Excel 97–2003 workbook, compound file and BIFF8', () => {
  it('reads the first visible worksheet’s cells as they show, from a stream in the regular sectors', () => {
    const stream = Buffer.concat([workbookStream({ hiddenFirst: true }), Buffer.alloc(5000)])
    const grid = readXls(compoundFile(stream))
    assert.equal(grid.sheetName, 'Tasks')
    assert.deepEqual(grid.rows, EXPECTED)
  })

  it('and from a small stream kept in the mini stream', () => {
    const stream = workbookStream({ hiddenFirst: true })
    assert.ok(stream.length < 4096, `the test stream is ${stream.length} bytes`)
    assert.deepEqual(readXls(compoundFile(stream)).rows, EXPECTED)
  })

  it('reads the first sheet when it is not hidden', () => {
    const grid = readXls(compoundFile(workbookStream()))
    assert.equal(grid.sheetName, 'Notes')
    assert.deepEqual(grid.rows, [{ line: 1, cells: ['Ship the import'] }])
  })

  it('refuses an Excel 95 workbook, and a compound file holding no workbook, in words', () => {
    assert.throws(() => readXls(compoundFile(Buffer.alloc(600), 'Book')), /Excel 5\.0\/95/)
    assert.throws(() => readXls(compoundFile(Buffer.alloc(600), 'WordDocument')), /holds no Excel workbook/)
    assert.throws(() => readXls(Buffer.from('Title\tStatus\n')), WorkbookReadError)
  })

  it('is a compound file by its eight first bytes', () => {
    assert.equal(isCompoundFile(compoundFile(workbookStream())), true)
    assert.equal(isCompoundFile(Buffer.from('PK\u0003\u0004')), false)
  })

  it('an RK number is thirty bits of an integer or a double, perhaps a hundredth of it', () => {
    assert.equal(rkNumber((5 << 2) | 2), 5)
    assert.equal(rkNumber(((-3 << 2) | 2) >>> 0), -3)
    assert.equal(rkNumber((150 << 2) | 3), 1.5)
    const b = Buffer.alloc(8)
    b.writeDoubleLE(1.5)
    assert.equal(rkNumber(b.readUInt32LE(4) & 0xfffffffc), 1.5)
  })
})

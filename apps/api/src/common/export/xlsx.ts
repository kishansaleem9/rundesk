import { deflateRawSync } from 'node:zlib'

/**
 * A real .xlsx, with no dependency.
 *
 * `[10:57]` "aap se poochte hain ke CSV chahiye, EXCEL chahiye, aur aap is ko
 * download kar lo" — frame `10:58` shows the two of them as a segmented
 * control, CSV | Excel, and Excel is the one that is selected-looking.
 *
 * The first version of the export panel said "CSV only" out loud rather than
 * showing a dead Excel button, which was the honest thing to do at the time.
 * This is the other way to be honest: an .xlsx is a ZIP of five small XML
 * parts, and Node already ships the only hard piece (DEFLATE, in `zlib`). So
 * the button does what it says instead of explaining why it cannot.
 *
 * WHY INLINE STRINGS, AND WHY THAT IS THE SECURITY PROPERTY.
 *
 * Every cell is written as `t="inlineStr"` — a literal string, in a `<is><t>`
 * element. A spreadsheet formula lives in a DIFFERENT element (`<f>`), which
 * this writer never emits. So the CSV problem — a task titled
 * `=cmd|'/c calc'!A1` becoming a formula when the file is opened — cannot
 * happen here at all: `=cmd|…` in an `<is><t>` is the six characters, and
 * Excel renders them. The CSV path needs a leading apostrophe to say "text";
 * the XLSX path says it in the markup, so it needs no such prefix and gets
 * none. `list-export.mjs` asserts both halves of that sentence.
 *
 * There is no shared-string table, no styles part and no formatting: this
 * writes what a person asked to download, not a workbook to keep editing.
 */

/** `0` → `A`, `25` → `Z`, `26` → `AA`. Bijective base-26: there is no zero digit. */
function columnName(index: number): string {
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
 * XML 1.0 forbids most control characters outright — a cell carrying one makes
 * the whole workbook unopenable, and Excel's message for that is "the file is
 * corrupt", which tells the person nothing about the task title that did it.
 * Tab, newline and carriage return are the three that are legal.
 */
function xmlText(value: unknown): string {
  if (value == null) return ''
  const text = value instanceof Date ? value.toISOString() : String(value)
  return text
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function sheetXml(headers: string[], rows: unknown[][]): string {
  const cell = (rowIndex: number, colIndex: number, value: unknown) => {
    const text = xmlText(value)
    if (text === '') return ''
    return (
      `<c r="${columnName(colIndex)}${rowIndex}" t="inlineStr">` +
      `<is><t xml:space="preserve">${text}</t></is></c>`
    )
  }
  const body = [headers, ...rows]
    .map((row, r) => `<row r="${r + 1}">${row.map((v, c) => cell(r + 1, c, v)).join('')}</row>`)
    .join('')
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetData>${body}</sheetData></worksheet>`
  )
}

/* ------------------------------------------------------------------ */
/* The ZIP container. PKZIP, deflate, no data descriptors, no ZIP64.   */
/* ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let c = i
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c
  }
  return table
})()

function crc32(buf: Buffer): number {
  let c = -1
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

/*
 * A fixed timestamp rather than "now": two exports of the same list then differ
 * only where the data differs, which is what makes the break test in
 * `list-export.mjs` able to say the bytes changed BECAUSE the code changed.
 * 1980-01-01 is the earliest a ZIP can express.
 */
const DOS_TIME = 0
const DOS_DATE = 33 // (1980-1980)<<9 | 1<<5 | 1

type Entry = { name: string; body: Buffer }

function zip(entries: Entry[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const deflated = deflateRawSync(entry.body)
    const crc = crc32(entry.body)

    const local = Buffer.alloc(30 + name.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(0, 6) // flags
    local.writeUInt16LE(8, 8) // deflate
    local.writeUInt16LE(DOS_TIME, 10)
    local.writeUInt16LE(DOS_DATE, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(deflated.length, 18)
    local.writeUInt32LE(entry.body.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    name.copy(local, 30)

    const central = Buffer.alloc(46 + name.length)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4) // version made by
    central.writeUInt16LE(20, 6) // version needed
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt16LE(DOS_TIME, 12)
    central.writeUInt16LE(DOS_DATE, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(deflated.length, 20)
    central.writeUInt32LE(entry.body.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt16LE(0, 30) // extra
    central.writeUInt16LE(0, 32) // comment
    central.writeUInt16LE(0, 34) // disk
    central.writeUInt16LE(0, 36) // internal attrs
    central.writeUInt32LE(0, 38) // external attrs
    central.writeUInt32LE(offset, 42)
    name.copy(central, 46)

    locals.push(local, deflated)
    centrals.push(central)
    offset += local.length + deflated.length
  }

  const centralBlock = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralBlock.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)

  return Buffer.concat([...locals, centralBlock, end])
}

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '</Types>'

const ROOT_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  '</Relationships>'

const WORKBOOK_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
  '</Relationships>'

/**
 * Excel refuses a sheet name longer than 31 characters, or containing any of
 * `: \ / ? * [ ]` — and refuses the whole file, not the name.
 */
function safeSheetName(name: string): string {
  const cleaned = xmlText(name).replace(/[:\\/?*[\]]/g, ' ').trim()
  return (cleaned || 'Sheet1').slice(0, 31)
}

export function toXlsx(sheetName: string, headers: string[], rows: unknown[][]): Buffer {
  const workbook =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets><sheet name="${safeSheetName(sheetName)}" sheetId="1" r:id="rId1"/></sheets>` +
    '</workbook>'

  return zip([
    { name: '[Content_Types].xml', body: Buffer.from(CONTENT_TYPES, 'utf8') },
    { name: '_rels/.rels', body: Buffer.from(ROOT_RELS, 'utf8') },
    { name: 'xl/workbook.xml', body: Buffer.from(workbook, 'utf8') },
    { name: 'xl/_rels/workbook.xml.rels', body: Buffer.from(WORKBOOK_RELS, 'utf8') },
    { name: 'xl/worksheets/sheet1.xml', body: Buffer.from(sheetXml(headers, rows), 'utf8') },
  ])
}

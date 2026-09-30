import { zipStream } from './zip-stream'

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

/**
 * THE ONE ZIP WRITER (`found-30-sep/two-zip-writers`). This file carried a ZIP
 * writer and a CRC table of its own, buffered, beside `zip-stream.ts`, which
 * Download all streams its archives through. Two writers of one format drift
 * apart, so the workbook's five parts go through `zipStream` too, deflated. No
 * time is given, so every entry is dated 1980-01-01, the earliest a ZIP can
 * say: two exports of the same list differ only where the data does.
 */
export async function toXlsx(sheetName: string, headers: string[], rows: unknown[][]): Promise<Buffer> {
  const workbook =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets><sheet name="${safeSheetName(sheetName)}" sheetId="1" r:id="rId1"/></sheets>` +
    '</workbook>'

  const parts: Array<[string, string]> = [
    ['[Content_Types].xml', CONTENT_TYPES],
    ['_rels/.rels', ROOT_RELS],
    ['xl/workbook.xml', workbook],
    ['xl/_rels/workbook.xml.rels', WORKBOOK_RELS],
    ['xl/worksheets/sheet1.xml', sheetXml(headers, rows)],
  ]
  const chunks: Buffer[] = []
  for await (const chunk of zipStream(
    parts.map(([name, xml]) => ({ name, method: 'deflate' as const, open: async () => Buffer.from(xml, 'utf8') })),
  )) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

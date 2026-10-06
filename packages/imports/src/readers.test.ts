import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deflateRawSync } from 'node:zlib'
import { detectDelimiter, parseDelimitedRows, readDelimited } from './delimited'
import { readSheetFile, readJsonSheet } from './read-file'
import { MAX_SHEET_ROWS, SheetReadError } from './table'
import { excelSerialToIso, isDateFormatCode, readXlsx } from './xlsx-reader'

const enc = (s: string) => new Uint8Array(Buffer.from(s, 'utf8'))

test('a quoted cell keeps its delimiter, doubled quotes and newlines', () => {
  const rows = parseDelimitedRows('a,b\r\n"x, y","say ""hi""\nthere"\r\n', ',')
  assert.deepEqual(rows, [['a', 'b'], ['x, y', 'say "hi"\nthere']])
})

test('the BOM is dropped and the delimiter is sniffed outside quotes', () => {
  assert.equal(detectDelimiter('"a,b"\tc\td\n1\t2\t3'), '\t')
  assert.equal(detectDelimiter('a;b;c'), ';')
  const t = readDelimited('﻿Name,Status\nOne,Open\n\n,\nTwo,Done')
  assert.deepEqual(t.headers, ['Name', 'Status'])
  // Blank rows are nothing; line numbers still name the file's rows.
  assert.deepEqual(t.rows.map((r) => r.line), [2, 5])
})

test('headers must be unique and present', () => {
  assert.throws(() => readDelimited('Name,name\n1,2'), (e: SheetReadError) => e.code === 'duplicate_headers')
  assert.throws(() => readDelimited(',,\n1,2,3'), (e: SheetReadError) => e.code === 'no_header')
})

test('more than 10,000 rows is refused in the spec’s words', () => {
  const text = ['Name', ...Array.from({ length: MAX_SHEET_ROWS + 1 }, (_, i) => `t${i}`)].join('\n')
  assert.throws(() => readDelimited(text), /10,000-row limit for imported spreadsheets\. Split your file into batches\./)
  assert.equal(readDelimited(text.split('\n').slice(0, MAX_SHEET_ROWS + 1).join('\n')).rows.length, MAX_SHEET_ROWS)
})

test('JSON is an array of objects, every key a column in first-seen order', () => {
  const t = readJsonSheet(JSON.stringify([{ Name: 'a', Tags: ['x', 'y'] }, { Name: 'b', Done: true }]))
  assert.deepEqual(t.headers, ['Name', 'Tags', 'Done'])
  assert.deepEqual(t.rows[0].cells, ['a', 'x, y', ''])
  assert.deepEqual(t.rows[1].cells, ['b', '', 'true'])
  assert.throws(() => readJsonSheet('{"a":1}'), /array of objects/)
})

/** A minimal ZIP: method 8 (deflate) unless `stored`, no data descriptors — what Excel writes. */
function zip(files: Record<string, string>, stored: string[] = []): Uint8Array {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text, 'utf8')
    const method = stored.includes(name) ? 0 : 8
    const data = method === 8 ? deflateRawSync(raw) : raw
    const nameBuf = Buffer.from(name, 'utf8')
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(method, 10)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(raw.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, nameBuf, data)
    centrals.push(central, nameBuf)
    offset += local.length + nameBuf.length + data.length
  }
  const cd = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(files).length, 8)
  end.writeUInt16LE(Object.keys(files).length, 10)
  end.writeUInt32LE(cd.length, 12)
  end.writeUInt32LE(offset, 16)
  return new Uint8Array(Buffer.concat([...locals, cd, end]))
}

const WORKBOOK =
  '<workbook xmlns:r="r"><sheets><sheet name="Tasks" sheetId="1" r:id="rId7"/></sheets></workbook>'
const RELS =
  '<Relationships><Relationship Id="rId7" Type="worksheet" Target="worksheets/data.xml"/></Relationships>'
const STYLES =
  '<styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy\\ hh:mm"/></numFmts>' +
  '<cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/></cellXfs></styleSheet>'
const STRINGS =
  '<sst><si><t>Task Name</t></si><si><t>Due Date</t></si><si><r><t>Write </t></r><r><t xml:space="preserve">spec &amp; plan</t></r></si>' +
  '<si><t>Line_x000D_</t></si></sst>'
const SHEET =
  '<worksheet><sheetData>' +
  '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="inlineStr"><is><t>Done</t></is></c></row>' +
  '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" s="1"><v>46022</v></c><c r="C2"><v>42</v></c><c r="D2" t="b"><v>1</v></c></row>' +
  '<row r="4"><c r="A4" t="s"><v>3</v></c><c r="B4" s="2"><v>46022.5625</v></c></row>' +
  '</sheetData></worksheet>'

test('an .xlsx is read through its rels, shared strings, rich runs and date styles', async () => {
  const bytes = zip(
    {
      'xl/workbook.xml': WORKBOOK,
      'xl/_rels/workbook.xml.rels': RELS,
      'xl/styles.xml': STYLES,
      'xl/sharedStrings.xml': STRINGS,
      'xl/worksheets/data.xml': SHEET,
    },
    ['xl/styles.xml'],
  )
  const t = await readXlsx(bytes)
  assert.deepEqual(t.headers, ['Task Name', 'Due Date', 'Column 3', 'Done'])
  assert.deepEqual(t.rows[0], { line: 2, cells: ['Write spec & plan', '2025-12-31T00:00:00.000Z', '42', 'true'] })
  // A skipped sheet row keeps its own number; a formatted date-time keeps its time.
  assert.deepEqual(t.rows[1], { line: 4, cells: ['Line\r', '2025-12-31T13:30:00.000Z'] })
})

test('readSheetFile sends a zip to the xlsx reader whatever it is called, and refuses legacy .xls', async () => {
  const bytes = zip({ 'xl/workbook.xml': WORKBOOK, 'xl/_rels/workbook.xml.rels': RELS, 'xl/worksheets/data.xml': SHEET, 'xl/sharedStrings.xml': STRINGS })
  assert.equal((await readSheetFile('export.xlsx', bytes)).headers[0], 'Task Name')
  await assert.rejects(readSheetFile('old.xls', enc('whatever')), /Save the sheet as \.xlsx or \.csv/)
  const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0])
  await assert.rejects(readSheetFile('renamed.csv', ole), (e: SheetReadError) => e.code === 'xls_unsupported')
  await assert.rejects(readSheetFile('notes.pdf', enc('%PDF')), (e: SheetReadError) => e.code === 'unsupported_type')
  await assert.rejects(readSheetFile('empty.csv', new Uint8Array()), (e: SheetReadError) => e.code === 'empty_file')
})

test('.tsv is tab-delimited and a Windows-1252 file still decodes', async () => {
  const t = await readSheetFile('a.tsv', enc('Name\tNotes\nOne\ta, b'))
  assert.deepEqual(t.rows[0].cells, ['One', 'a, b'])
  const latin = new Uint8Array([0x4e, 0x61, 0x6d, 0x65, 0x0a, 0x43, 0x61, 0x66, 0xe9])
  assert.equal((await readSheetFile('a.csv', latin)).rows[0].cells[0], 'Café')
})

test('date number formats and serials', () => {
  assert.equal(isDateFormatCode('dd/mm/yyyy'), true)
  assert.equal(isDateFormatCode('#,##0.00'), false)
  assert.equal(isDateFormatCode('[Red]0.00;"days"'), false)
  assert.equal(excelSerialToIso(1), '1899-12-31T00:00:00.000Z')
  assert.equal(excelSerialToIso(0, true), '1904-01-01T00:00:00.000Z')
})

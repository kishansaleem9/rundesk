import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { zipOf } from '../../../common/import/zip-test-kit'
import { toXlsx } from '../../../common/export/xlsx'
import { columnIndex, isDateFormat, readXlsx, serialToIso, WorkbookReadError } from './xlsx-read'

/**
 * AN .xlsx READ AS THE ROWS IT SHOWS (`ledger-rows/row-816`): a workbook's
 * parts as Excel writes them — shared strings, styles, a sheet — put together
 * here, and the repo's own writer's file read back.
 */

const CT = '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'
const ROOT_RELS =
  '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  '</Relationships>'
const WB_RELS =
  '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet2.xml"/>' +
  '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>' +
  '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  '</Relationships>'

function workbookXml(opts: { date1904?: boolean; firstHidden?: boolean } = {}) {
  return (
    '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    (opts.date1904 ? '<workbookPr date1904="1"/>' : '<workbookPr/>') +
    '<sheets>' +
    `<sheet name="Notes" sheetId="1" r:id="rId1"${opts.firstHidden ? ' state="hidden"' : ''}/>` +
    '<sheet name="Tasks" sheetId="2" r:id="rId2"/>' +
    '</sheets></workbook>'
  )
}

const SHARED =
  '<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="6" uniqueCount="5">' +
  '<si><t>Task name</t></si>' +
  '<si><t>Status</t></si>' +
  '<si><r><rPr><b/></rPr><t>Ship </t></r><r><t xml:space="preserve">the &amp; import</t></r><rPh sb="0" eb="1"><t>PHONETIC</t></rPh></si>' +
  '<si><t>Done</t></si>' +
  '<si/>' +
  '</sst>'

// Styles: cell format 0 General, 1 a built-in date (14), 2 a custom date, 3 a number with two places.
const STYLES =
  '<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="2"><numFmt numFmtId="164" formatCode="[$-409]d\\-mmm\\-yyyy;@"/><numFmt numFmtId="165" formatCode="0.00"/></numFmts>' +
  '<cellStyleXfs count="1"><xf numFmtId="14"/></cellStyleXfs>' +
  '<cellXfs count="4"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/><xf numFmtId="164"/><xf numFmtId="165"/></cellXfs>' +
  '</styleSheet>'

const sheet = (rows: string) =>
  `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`

async function book(sheet2: string, opts: { date1904?: boolean; firstHidden?: boolean } = {}) {
  return zipOf({
    '[Content_Types].xml': CT,
    '_rels/.rels': ROOT_RELS,
    'xl/workbook.xml': workbookXml(opts),
    'xl/_rels/workbook.xml.rels': WB_RELS,
    'xl/worksheets/sheet1.xml': sheet('<row r="1"><c r="A1" t="inlineStr"><is><t>notes, not tasks</t></is></c></row>'),
    'xl/worksheets/sheet2.xml': sheet2,
    'xl/sharedStrings.xml': SHARED,
    'xl/styles.xml': STYLES,
  })
}

const SERIAL_20_OCT_2026 = (Date.UTC(2026, 9, 20) - Date.UTC(1899, 11, 30)) / 86_400_000

describe('readXlsx — a workbook’s first visible sheet, as its rows show it', () => {
  it('reads shared strings (rich runs joined, the phonetic guide left out), inline strings, numbers, dates, booleans, errors and formula results', async () => {
    const grid = readXlsx(
      await book(
        sheet(
          '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="inlineStr"><is><t>Due</t></is></c><c r="D1" t="inlineStr"><is><t>Points</t></is></c><c r="E1" t="inlineStr"><is><t>Flag</t></is></c></row>' +
            `<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c><c r="C2" s="1"><v>${SERIAL_20_OCT_2026}</v></c><c r="D2" s="3"><v>2.50</v></c><c r="E2" t="b"><v>1</v></c></row>` +
            `<row r="3"><c r="A3" t="str"><f>CONCAT("A","B")</f><v>AB</v></c><c r="B3" t="e"><v>#N/A</v></c><c r="C3" s="2"><v>${SERIAL_20_OCT_2026 + 0.375}</v></c><c r="D3"><v>0.30000000000000004</v></c><c r="E3" t="b"><v>0</v></c></row>`,
        ),
        { firstHidden: true },
      ),
    )
    assert.equal(grid.sheetName, 'Tasks')
    assert.deepEqual(grid.rows, [
      { line: 1, cells: ['Task name', 'Status', 'Due', 'Points', 'Flag'] },
      { line: 2, cells: ['Ship the & import', 'Done', '2026-10-20', '2.5', 'TRUE'] },
      { line: 3, cells: ['AB', '#N/A', '2026-10-20T09:00', '0.30000000000000004', 'FALSE'] },
    ])
  })

  it('places a cell by its reference, leaving a gap for an empty one, and keeps the row numbers Excel draws', async () => {
    const grid = readXlsx(
      await book(sheet('<row r="3"><c r="A3" t="inlineStr"><is><t>Name</t></is></c><c r="C3" t="inlineStr"><is><t>Due</t></is></c></row><row r="5"><c r="A5" t="inlineStr"><is><t>Fifth</t></is></c></row><row r="6"/>'), { firstHidden: true }),
    )
    assert.deepEqual(grid.rows, [
      { line: 3, cells: ['Name', '', 'Due'] },
      { line: 5, cells: ['Fifth'] },
    ])
  })

  it('reads the first sheet that is not hidden, and counts dates from 1904 when the workbook says so', async () => {
    const hidden = readXlsx(await book(sheet('<row r="1"><c r="A1" t="inlineStr"><is><t>T</t></is></c></row>'), { firstHidden: true }))
    assert.equal(hidden.sheetName, 'Tasks')
    const shown = readXlsx(await book(sheet('<row r="1"><c r="A1" t="inlineStr"><is><t>T</t></is></c></row>')))
    assert.equal(shown.sheetName, 'Notes', 'the first sheet, when it is not hidden')
    const s1904 = (Date.UTC(2026, 9, 20) - Date.UTC(1904, 0, 1)) / 86_400_000
    const grid = readXlsx(await book(sheet(`<row r="1"><c r="A1" s="1"><v>${s1904}</v></c></row>`), { date1904: true, firstHidden: true }))
    assert.deepEqual(grid.rows[0].cells, ['2026-10-20'])
  })

  it('reads the workbook the repo writes itself (`toXlsx`) back to the same rows', async () => {
    const xlsx = await toXlsx('Board', ['Title', 'Status'], [['=cmd|calc', 'Done'], ['Ünïcödé & <tags>', '']])
    const grid = readXlsx(xlsx)
    assert.equal(grid.sheetName, 'Board')
    assert.deepEqual(grid.rows.map((r) => r.cells), [['Title', 'Status'], ['=cmd|calc', 'Done'], ['Ünïcödé & <tags>']])
  })

  it('refuses a zip that is no workbook, and a damaged one, in words', async () => {
    assert.throws(() => readXlsx(Buffer.from('Title,Status')), WorkbookReadError)
    await assert.rejects(async () => readXlsx(await zipOf({ 'word/document.xml': '<w:document/>' })), /not an Excel workbook/)
  })
})

describe('the pieces a workbook is read with', () => {
  it('a date format is a built-in date number, or a custom code naming a day, month, year, hour or second', () => {
    for (const id of [14, 15, 22, 45, 47]) assert.equal(isDateFormat(id), true, String(id))
    assert.equal(isDateFormat(0), false)
    assert.equal(isDateFormat(164, 'dd/mm/yyyy'), true)
    assert.equal(isDateFormat(164, '[$-409]mmm d, yyyy;@'), true)
    assert.equal(isDateFormat(164, 'h:mm AM/PM'), true)
    assert.equal(isDateFormat(165, '0.00'), false)
    assert.equal(isDateFormat(166, '#,##0 [$€-1]'), false)
    assert.equal(isDateFormat(167, '"Due:" 0'), false)
    assert.equal(isDateFormat(168, 'General'), false)
  })

  it('a count of days is the day it stands for — Excel’s 1900 system with its phantom 29 February, and 1904’s', () => {
    assert.equal(serialToIso(1, false), '1900-01-01')
    assert.equal(serialToIso(59, false), '1900-02-28')
    assert.equal(serialToIso(61, false), '1900-03-01')
    assert.equal(serialToIso(SERIAL_20_OCT_2026, false), '2026-10-20')
    assert.equal(serialToIso(SERIAL_20_OCT_2026 + 0.5, false), '2026-10-20T12:00')
    assert.equal(serialToIso(SERIAL_20_OCT_2026 + 0.5 + 15 / 86400, false), '2026-10-20T12:00:15')
    assert.equal(serialToIso(0, true), '1904-01-01')
  })

  it('a cell reference’s letters are its column', () => {
    assert.equal(columnIndex('A1'), 0)
    assert.equal(columnIndex('Z9'), 25)
    assert.equal(columnIndex('AA10'), 26)
    assert.equal(columnIndex('XFD1048576'), 16383)
    assert.equal(columnIndex('12'), null)
  })
})

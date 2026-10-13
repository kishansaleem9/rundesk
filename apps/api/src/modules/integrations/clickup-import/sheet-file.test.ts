import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { toXlsx } from '../../../common/export/xlsx'
import { columnLetters, gridToTable, headerNames, jsonCell, jsonToTable, readExportLayout, readSheetFile } from './sheet-file'
import { autoMap, mapSheet } from './spreadsheet-import.util'
import { WorkbookReadError } from './xlsx-read'

/**
 * ONE READER FOR EVERY FILE THE SPREADSHEET IMPORT TAKES (`ledger-rows/row-816`):
 * each into the header row and numbered rows the mapping works on.
 */
describe('readSheetFile — what a file is, by its bytes and then its name', () => {
  it('a workbook is read as one, whatever it is called, and maps as a CSV would', async () => {
    const xlsx = await toXlsx('Board', ['Name', 'Status', 'Due date'], [['Ship it', 'Done', '2026-10-20']])
    for (const name of ['board.xlsx', 'board.csv']) {
      const table = readSheetFile(xlsx, name)
      assert.equal(table.format, 'xlsx')
      assert.equal(table.sheetName, 'Board')
      assert.deepEqual(table.headers, ['Name', 'Status', 'Due date'])
      const { rows, rejections } = mapSheet(table, autoMap(table.headers, 'monday'), { priorityScale: 'text' })
      assert.equal(rejections.length, 0)
      assert.equal(rows[0].title, 'Ship it')
      assert.equal(rows[0].status, 'done')
      assert.equal(rows[0].dueDate?.toISOString(), '2026-10-20T00:00:00.000Z')
      assert.equal(rows[0].row, 2, 'the row is the one Excel numbers')
    }
  })

  it('text is delimited text, read as the CSV path reads it — in UTF-16 when its mark says so', () => {
    const csv = readSheetFile(Buffer.from('Title,Status\nAlpha,Done\n'), 'board.csv')
    assert.equal(csv.format, 'csv')
    assert.deepEqual(csv.rows, [{ line: 2, cells: ['Alpha', 'Done'] }])
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Title\tStatus\nÄlpha\tDone\n', 'utf16le')])
    assert.deepEqual(readSheetFile(utf16, 'board.txt').rows, [{ line: 2, cells: ['Älpha', 'Done'] }])
    const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('Title\nBeta\n')])
    assert.deepEqual(readSheetFile(bom, 'b.csv').headers, ['Title'])
  })

  it('a binary file that is no workbook is refused in the page’s words', () => {
    assert.throws(() => readSheetFile(Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0x01, 0x0a]), 'report.csv'), (e: unknown) => e instanceof WorkbookReadError && /Accepted: \.csv/.test((e as Error).message))
  })

  it('a .json file is a list of tasks', () => {
    const table = readSheetFile(Buffer.from(JSON.stringify([{ name: 'A', tags: ['x', 'y'] }, { name: 'B', assignee: { email: 'ana@example.com' } }])), 'tasks.json')
    assert.equal(table.format, 'json')
    assert.deepEqual(table.headers, ['name', 'tags', 'assignee'])
    assert.deepEqual(table.rows, [
      { line: 1, cells: ['A', 'x, y', ''] },
      { line: 2, cells: ['B', '', 'ana@example.com'] },
    ])
  })
})

describe('jsonToTable', () => {
  it('reads an array of objects, or an object holding one, its keys the columns in the order first met', () => {
    assert.deepEqual(jsonToTable('{"tasks":[{"Title":"One"},{"Title":"Two","Due":"2026-10-20"}]}').headers, ['Title', 'Due'])
    assert.deepEqual(jsonToTable('[{"a":1,"b":true,"c":null}]').rows[0].cells, ['1', 'true', ''])
  })

  it('refuses JSON that is no list of tasks, and text that is no JSON, saying what it reads', () => {
    for (const bad of ['[1,2,3]', '{"a":1}', '[]', '"text"', '{not json']) {
      assert.throws(() => jsonToTable(bad), /a list of tasks/, bad)
    }
  })

  it('a nested value is the text a cell would hold: people and names by their email or name, the rest as JSON', () => {
    assert.equal(jsonCell([{ name: 'Ana' }, { email: 'ben@example.com' }]), 'Ana, ben@example.com')
    assert.equal(jsonCell({ id: 7 }), '{"id":7}')
    assert.equal(jsonCell(['a', 2, false]), 'a, 2, false')
  })
})

describe('the header row of a workbook', () => {
  it('names an empty header for its column and numbers a repeated one, so the mapping can tell them apart', () => {
    assert.deepEqual(headerNames(['Name', '', 'Name', 'name'], 5), ['Name', 'Column B', 'Name (2)', 'name (3)', 'Column E'])
    assert.equal(columnLetters(0), 'A')
    assert.equal(columnLetters(27), 'AB')
  })

  it('the first row with anything in it is the header, and every later row a data row with its own number', () => {
    const table = gridToTable({ sheetName: 'S', rows: [{ line: 3, cells: ['Title'] }, { line: 4, cells: ['A', 'extra'] }] }, 'xlsx')
    assert.deepEqual(table.headers, ['Title', 'Column B'])
    assert.deepEqual(table.rows, [{ line: 4, cells: ['A', 'extra'] }])
    assert.deepEqual(gridToTable({ sheetName: 'S', rows: [] }, 'xls').headers, [])
  })
})

/**
 * A SOURCE'S OWN EXPORT IN ITS OWN LAYOUT: Monday's board to Excel is its name,
 * then each group — a name, the column names again, its items, a row of sums
 * — and Wrike's lists a task once per folder it is in.
 */
describe('readExportLayout', () => {
  const row = (line: number, ...cells: string[]) => ({ line, cells })
  const HEADER = ['Name', 'Person', 'Status', 'Date', 'Points']
  const MONDAY = gridToTable(
    {
      sheetName: 'Launch board',
      rows: [
        row(1, 'Launch board'),
        row(2, 'Launch'),
        row(3, ...HEADER),
        row(4, 'Ship the importer', 'Ana', 'Done', '2026-10-20', '3'),
        row(5, 'Write the guide', '', 'Working on it', '', '2'),
        row(6, '', '', '', '', '5'),
        row(8, 'Backlog'),
        row(9, ...HEADER),
        row(10, 'Plan Q4'),
        row(11, '', 'Subitems', 'Owner', 'Status'),
        row(12, '', 'Draft the plan', 'Ana', 'Done'),
      ],
    },
    'xlsx',
  )

  it('reads Monday’s board: its items under their groups, each group’s name in a Group column the preset maps to a list', () => {
    const board = readExportLayout(MONDAY, 'monday')
    assert.deepEqual(board.headers, [...HEADER, 'Group'])
    assert.deepEqual(
      board.rows.map((r) => [r.line, r.cells[0], r.cells[5]]),
      [
        [4, 'Ship the importer', 'Launch'],
        [5, 'Write the guide', 'Launch'],
        [10, 'Plan Q4', 'Backlog'],
      ],
      'the board’s name, the groups’ names, the column names again, the sums and the subitem lines are no items',
    )
    assert.deepEqual(board.layout, { kind: 'board', board: 'Launch board', groups: ['Launch', 'Backlog'], leftOut: 3 })
    const mapping = autoMap(board.headers, 'monday')
    assert.equal(mapping.Group, 'list')
    const { rows, rejections } = mapSheet(board, mapping, { priorityScale: 'text' })
    assert.equal(rejections.length, 0)
    assert.deepEqual(rows.map((r) => [r.title, r.listName]), [['Ship the importer', 'Launch'], ['Write the guide', 'Launch'], ['Plan Q4', 'Backlog']])
  })

  it('an item with only its name is an item, and a one-cell row is a group only with the column names under it', () => {
    const t = gridToTable({ sheetName: 'B', rows: [row(1, 'B'), row(2, 'G1'), row(3, 'Name', 'Status'), row(4, 'Lonely'), row(5, 'Also alone'), row(7, 'G2'), row(8, 'Name', 'Status'), row(9, 'Third', 'Done')] }, 'xlsx')
    const board = readExportLayout(t, 'monday')
    assert.deepEqual(board.rows.map((r) => r.cells), [['Lonely', '', 'G1'], ['Also alone', '', 'G1'], ['Third', 'Done', 'G2']])
  })

  it('a sheet with no title above its table — or another preset, or a JSON list — is read as the table it is', () => {
    const flat = gridToTable({ sheetName: 'S', rows: [row(1, 'Name', 'Status'), row(2, 'A', 'Done')] }, 'xlsx')
    assert.equal(readExportLayout(flat, 'monday'), flat)
    assert.equal(readExportLayout(MONDAY, 'generic'), MONDAY)
    const json = jsonToTable('[{"Name":"A"}]')
    assert.equal(readExportLayout(json, 'monday'), json)
  })

  it('reads Wrike’s export with each task once, however many folders list it, and says how many lines repeated one', () => {
    const t = gridToTable(
      {
        sheetName: 'Tasks',
        rows: [
          row(1, 'Key', 'Title', 'Status', 'Location'),
          row(2, '1001', 'Ship the importer', 'Completed', 'Launch'),
          row(3, '1002', 'Write the guide', 'In Progress', 'Launch'),
          row(4, '1002', 'Write the guide', 'In Progress', 'Docs'),
          row(5, '1003', 'Plan Q4', 'Active', 'Backlog'),
        ],
      },
      'xls',
    )
    const keyed = readExportLayout(t, 'wrike')
    assert.deepEqual(keyed.rows.map((r) => r.line), [2, 3, 5])
    assert.deepEqual(keyed.layout, { kind: 'keyed', repeated: 1 })
    const { rows } = mapSheet(keyed, autoMap(keyed.headers, 'wrike'), { priorityScale: 'text' })
    assert.deepEqual(rows.map((r) => [r.title, r.listName]), [['Ship the importer', 'Launch'], ['Write the guide', 'Launch'], ['Plan Q4', 'Backlog']])
  })
})

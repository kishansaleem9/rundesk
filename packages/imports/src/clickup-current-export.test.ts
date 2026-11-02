/**
 * ClickUp's current export, read as it is written (`found-02-nov/clickup-current-export-unread`).
 * Every value here is made up; the SHAPES are the export's own: its header row,
 * its empty markers, its `\n` pairs, its JSON cells, the CSV's ` "900000"` and
 * the .xlsx's `1.750967227037E12`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { autoMap } from './automap'
import { CLICKUP_EXPORT_HEADERS } from './clickup-export'
import { clickupContent, clickupNumber, isClickUpCurrentExport, normaliseClickUpCurrentExport } from './clickup-current-export'
import { parseImportDate } from './dates'
import { buildGrid, parseChecklists, rowDraft, validateGrid, type GridContext } from './grid'
import { readSheetFile } from './read-file'
import { spreadsheetBundle } from './spreadsheet-adapter'
import { parseDuration, parsePriority } from './values'

/** Its header row, in its order. */
const HEADERS = [
  'Task ID', 'Task Link', 'Task Type', 'Task Name', 'Task Content', 'Status', 'Date Created', 'Date Created Text',
  'Due Date', 'Due Date Text', 'Start Date', 'Start Date Text', 'Parent ID', 'Subtasks IDs', 'Attachments', 'Assignees',
  'Tags', 'Priority', 'List Name', 'Folder Name/Path', 'Space Name', 'Time Estimated', 'Time Estimated Text', 'Checklists',
  'Comments', 'Assigned Comments', 'Time Spent', 'Time Spent Text', 'Rolled Up Time', 'Rolled Up Time Text',
  'Home Location ID', 'Home Location', 'Other Location IDs', 'Other Locations',
]

const ctx: GridContext = { dateFormat: 'ymd', delimiter: ',' }
const enc = (s: string) => new Uint8Array(Buffer.from(s, 'utf8'))
/** A CSV cell as ClickUp quotes one; Time Spent's ` "900000"` is written as it is, outside any quoting. */
const cell = (v: string) => (v.startsWith(' "') ? v : /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

const EMPTY_ROW: Record<string, string> = {
  'Task Type': 'Task',
  'Task Content': 'null',
  'Status': 'to do',
  'Date Created': '1750967227037',
  'Date Created Text': '6/26/2025, 3:47:07 PM EDT',
  'Start Date': 'null',
  'Parent ID': 'null',
  'Subtasks IDs': '[]',
  'Attachments': '[]',
  'Assignees': '[]',
  'Tags': '[]',
  'Priority': 'null',
  'Space Name': 'Space A',
  'Checklists': '{}',
  'Comments': '[]',
  'Assigned Comments': '0',
  'Time Spent': '""',
  'Rolled Up Time': 'NaN',
  'Home Location ID': '901',
  'Other Location IDs': '[]',
  'Other Locations': '[]',
}

const LONG_NAME = `A first line that runs on ${'and on '.repeat(90)}`.trim()

const ROWS: Array<Record<string, string>> = [
  {
    'Task ID': 'cu1', 'Task Name': 'Plan the week', 'Task Content': 'First line\\nSecond line', 'Status': 'in progress',
    'Due Date': '1751300000000', 'Subtasks IDs': '[cu2]', 'Assignees': '[Pat Doe, Sam Roe]', 'Tags': '[weekly, ops]', 'Priority': '2',
    'List Name': 'Weekly Reports', 'Folder Name/Path': '["Client Work"]', 'Time Estimated': '3600000', 'Time Estimated Text': '1 h',
    'Checklists': '{"Prep":["Book room","Send invites"],"Follow-up":["Write notes"]}', 'Time Spent': ' "900000"',
    'Time Spent Text': '15 m', 'Rolled Up Time': '1800000', 'Home Location': 'Space A > Client Work > Weekly Reports',
  },
  { 'Task ID': 'cu2', 'Task Name': 'Book the room', 'Parent ID': 'cu1', 'List Name': 'Weekly Reports', 'Home Location': 'Space A > Client Work > Weekly Reports' },
  { 'Task ID': 'cu3', 'Task Name': 'Confirm by phone', 'Parent ID': 'cu2', 'List Name': 'Weekly Reports', 'Home Location': 'Space A > Client Work > Weekly Reports' },
  { 'Task ID': 'cu4', 'Task Name': 'Straight in the Space', 'List Name': 'Inbox', 'Folder Name/Path': '[]', 'Home Location': 'Space A > Inbox' },
  {
    'Task ID': 'cu5', 'Task Name': 'Same names, other Space', 'Space Name': 'Space B', 'List Name': 'Weekly Reports',
    'Folder Name/Path': '["Client Work"]', 'Home Location': 'Space B > Client Work > Weekly Reports',
  },
  { 'Task ID': 'cu6', 'Task Name': LONG_NAME, 'Home Location': 'Space A > Inbox' },
  {
    // Also in another List: List Name and Space Name say where it was shared to, Home Location where it lives.
    'Task ID': 'cu7', 'Task Name': 'Shared to another List', 'List Name': 'Weekly Reports', 'Folder Name/Path': '["Client Work"]',
    'Home Location': 'Space B > Ops > Board', 'Other Location IDs': '[902]', 'Other Locations': '[Space A > Client Work > Weekly Reports]',
  },
  { 'Task ID': 'cu8', 'Task Name': 'Rich text', 'Task Content': '{"ops":[{"insert":"Bold "},{"insert":"words\\n"}]}', 'Home Location': 'Space A > Inbox' },
]

const CSV = [HEADERS.join(','), ...ROWS.map((r) => HEADERS.map((h) => cell({ ...EMPTY_ROW, ...r }[h] ?? '')).join(','))].join('\n')

test('its header row is told apart from the classic export’s, and a non-ClickUp file is read as written', async () => {
  assert.equal(isClickUpCurrentExport(HEADERS), true)
  assert.equal(isClickUpCurrentExport(CLICKUP_EXPORT_HEADERS), false)
  const plain = await readSheetFile('notes.csv', enc('Name,Notes\nOne,null\nTwo,a\\nb'))
  assert.deepEqual(plain.rows.map((r) => r.cells), [['One', 'null'], ['Two', 'a\\nb']])
})

test('its cells are read as the importer reads a cell: no null, no \\n pairs, no quotes round a number', async () => {
  const t = await readSheetFile('export.csv', enc(CSV))
  assert.equal(t.headers.length, 34)
  const at = (row: number, header: string) => t.rows[row].cells[t.headers.indexOf(header)]
  assert.equal(at(0, 'Task Content'), 'First line\nSecond line')
  assert.equal(at(1, 'Task Content'), '')
  assert.equal(at(7, 'Task Content'), 'Bold words')
  assert.equal(at(0, 'Time Spent'), '900000')
  assert.equal(at(1, 'Time Spent'), '')
  assert.equal(at(0, 'Priority'), '2')
  assert.equal(at(1, 'Priority'), '')
  assert.equal(at(0, 'Start Date'), '')
  assert.equal(at(0, 'Rolled Up Time'), '1800000')
  assert.equal(at(1, 'Rolled Up Time'), '')
  assert.equal(at(0, 'Folder Name/Path'), 'Client Work')
  assert.equal(at(1, 'Checklists'), '')
  assert.equal(at(1, 'Parent ID'), 'cu1')
  assert.equal(at(0, 'Parent ID'), '')
  assert.equal(at(0, 'Assignees'), '[Pat Doe, Sam Roe]')
  assert.equal(at(1, 'Assignees'), '')
  assert.equal(at(0, 'Other Locations'), '')
})

test('the .xlsx writes its numbers as Java writes a double, and they are read as whole numbers', () => {
  const xlsx: Record<string, string> = { ...EMPTY_ROW, 'Date Created': '1.750967227037E12', 'Due Date': '1.7513E12', 'Priority': '2.0', 'Time Estimated': '3600000.0', 'Time Spent': '9.0E5', 'Rolled Up Time': 'NaN' }
  const [row] = normaliseClickUpCurrentExport({ headers: HEADERS, rows: [{ line: 2, cells: HEADERS.map((h) => xlsx[h] ?? '') }] }).rows
  const at = (header: string) => row.cells[HEADERS.indexOf(header)]
  assert.deepEqual(
    ['Date Created', 'Due Date', 'Priority', 'Time Estimated', 'Time Spent', 'Rolled Up Time'].map(at),
    ['1750967227037', '1751300000000', '2', '3600000', '900000', ''],
  )
  assert.equal(clickupNumber(' "900000"'), '900000')
  assert.equal(clickupNumber('NaN'), '')
  assert.equal(clickupNumber('soon'), 'soon')
  assert.equal(clickupContent('null'), '')
  assert.equal(clickupContent('a\\r\\nb\\nc'), 'a\nb\nc')
})

test('the same number forms are read anywhere a priority, a duration or a date is', () => {
  assert.deepEqual(parsePriority('2.0'), { ok: true, value: 'high' })
  assert.deepEqual(parsePriority('4.00'), { ok: true, value: 'low' })
  assert.equal(parsePriority('5.0').ok, false)
  assert.deepEqual(parseDuration('900000.0'), { ok: true, value: 900_000 })
  assert.deepEqual(parseDuration('9.0E5'), { ok: true, value: 900_000 })
  assert.deepEqual(parseImportDate('1.750967227037E12', 'dmy'), { ok: true, ms: 1_750_967_227_037, hasTime: true })
  assert.deepEqual(parseImportDate('1750967227037.0', 'mdy'), { ok: true, ms: 1_750_967_227_037, hasTime: true })
  assert.equal(parseImportDate('1.5E3', 'ymd').ok, false)
})

test('its columns map with no clicks: Home Location places the task, List Name and Other Locations are left out', async () => {
  const t = await readSheetFile('export.csv', enc(CSV))
  const mapped = Object.fromEntries(Object.entries(autoMap(t.headers)).filter(([, v]) => v !== 'skip'))
  assert.deepEqual(mapped, {
    'Task ID': 'taskId',
    'Task Type': 'taskType',
    'Task Name': 'taskName',
    'Task Content': 'description',
    'Status': 'status',
    'Date Created': 'dateCreated',
    'Due Date': 'dueDate',
    'Start Date': 'startDate',
    'Parent ID': 'parentId',
    'Assignees': 'assignees',
    'Tags': 'tags',
    'Priority': 'priority',
    'Time Estimated': 'timeEstimate',
    'Checklists': 'checklist',
    'Time Spent': 'timeTracked',
    'Home Location': 'location',
  })
})

test('a Checklists cell is every checklist it names; ClickUp writes no done marks, so none is done', () => {
  assert.deepEqual(parseChecklists('{"Prep":["Book room","Send\\ninvites"],"Empty":[],"Follow-up":["Write notes"]}', ','), [
    { name: 'Prep', items: [{ content: 'Book room', done: false }, { content: 'Send invites', done: false }] },
    { name: 'Follow-up', items: [{ content: 'Write notes', done: false }] },
  ])
  assert.deepEqual(parseChecklists('["a", {"name": "b", "resolved": true}]', ','), [
    { name: 'Checklist', items: [{ content: 'a', done: false }, { content: 'b', done: true }] },
  ])
  assert.deepEqual(parseChecklists('{}', ','), [])
  // The classic form still reads as it did.
  assert.deepEqual(parseChecklists('[Prep: one (done), two]', ','), [
    { name: 'Prep', items: [{ content: 'one', done: true }, { content: 'two', done: false }] },
  ])
})

test('the whole file: Folders and Lists by their place, subtasks by Parent ID, and a long name shortened, not refused', async () => {
  const t = await readSheetFile('export.csv', enc(CSV))
  const { columns, rows } = buildGrid(t, autoMap(t.headers), { delimiter: ',' })
  assert.ok(columns.some((c) => c.key === 'location' && c.label === 'List location'))
  // Parent ID becomes the parents' Subtask IDs; ClickUp's own Subtasks IDs (which leaves children out) is not read.
  assert.equal(rows[0].values.subtaskIds, 'cu2')
  assert.equal(rows[1].values.subtaskIds, 'cu3')

  const verdict = validateGrid(rows, columns, ctx)
  assert.equal(verdict.validKeys.size, ROWS.length)
  const notes = (key: string) => (verdict.issues.get(key) ?? []).map((i) => `${i.column}/${i.severity}`)
  assert.deepEqual(notes('r4'), ['subtaskIds/info'])
  assert.deepEqual(notes('r7'), ['taskName/info'])

  const draft = rowDraft(rows[0], columns, ctx, verdict.issues.get('r2'))
  assert.equal(draft.description, 'First line\nSecond line')
  assert.deepEqual(draft.assignees, ['Pat Doe', 'Sam Roe'])
  assert.deepEqual(draft.tags, ['weekly', 'ops'])
  assert.equal(draft.priority, 'high')
  assert.equal(draft.dueDate, 1_751_300_000_000)
  assert.equal(draft.dateCreated, 1_750_967_227_037)
  assert.equal(draft.startDate, undefined)
  assert.equal(draft.timeEstimateMs, 3_600_000)
  assert.equal(draft.timeTrackedMs, 900_000)
  assert.deepEqual(draft.checklists.map((c) => [c.name, c.items.length]), [['Prep', 2], ['Follow-up', 1]])
  assert.deepEqual(draft.location, ['Space A', 'Client Work', 'Weekly Reports'])
  assert.equal(rowDraft(rows[5], columns, ctx).name.length, 500)

  const { bundle, report } = spreadsheetBundle(rows, columns, ctx)
  assert.deepEqual(bundle.spaces.map((s) => s.name), ['Space A', 'Space B'])
  assert.deepEqual(bundle.folders.map((f) => [f.sourceId, f.name, f.spaceSourceId]), [
    ['folder:space a > client work', 'Client Work', 'space:space a'],
    ['folder:space b > client work', 'Client Work', 'space:space b'],
    ['folder:space b > ops', 'Ops', 'space:space b'],
  ])
  assert.deepEqual(bundle.lists.map((l) => [l.sourceId, l.name, l.folderSourceId ?? null]), [
    ['list:space a > client work > weekly reports', 'Weekly Reports', 'folder:space a > client work'],
    ['list:space a > inbox', 'Inbox', null],
    ['list:space b > client work > weekly reports', 'Weekly Reports', 'folder:space b > client work'],
    ['list:space b > ops > board', 'Board', 'folder:space b > ops'],
  ])
  const byName = new Map(bundle.tasks.map((task) => [task.name, task]))
  // Depth 2 folds under the top-level task, in its List; the shared task stays in its home List only.
  assert.equal(byName.get('Book the room')?.parentSourceId, 'r2')
  assert.equal(byName.get('Confirm by phone')?.parentSourceId, 'r2')
  assert.equal(byName.get('Confirm by phone')?.listSourceId, 'list:space a > client work > weekly reports')
  assert.equal(byName.get('Shared to another List')?.listSourceId, 'list:space b > ops > board')
  assert.equal(byName.get('Plan the week')?.checklists.length, 2)
  assert.equal(byName.get('Plan the week')?.timeEntries[0]?.durationMs, 900_000)
  assert.equal(bundle.tasks.filter((task) => task.description === 'null' || /\\n/.test(task.description ?? '')).length, 0)
  assert.deepEqual(report.skipped, [])
  assert.ok(report.warnings.some((w) => w.ref === 'row 7' && /shortened to the first 500/.test(w.message)))
})

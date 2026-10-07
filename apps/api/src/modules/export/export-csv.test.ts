import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CLICKUP_EXPORT_HEADERS, exportCsv, readDelimited, autoMap } from '@rundesk/imports'
import { exportHeaders, exportRow, fieldCell, fieldHeaders, type ExportContext } from './export-csv'
import { ExportStorage } from './export-storage'

const ctx = (over: Partial<ExportContext> = {}): ExportContext => ({
  appUrl: 'https://app.example',
  workspaceId: 'ws',
  dateFormat: 'normal',
  lists: new Map([['l1', { name: 'Sprint 1', folderPath: 'Eng/Platform', spaceName: 'Product', statusNames: new Map([['in_progress', 'In progress']]) }]]),
  taskTypes: new Map([['tt', 'Bug']]),
  subtaskIds: new Map([['t1', ['t2']]]),
  assignees: new Map([['t1', ['John Smith', 'Mary Smith']]]),
  tags: new Map([['t1', ['tag 1', 'tag 2']]]),
  attachments: new Map([['t1', [{ title: 'file.png', url: 'https://x/file.png' }]]]),
  checklists: new Map([['t1', [{ name: 'Prep', items: [{ content: 'a', done: true }, { content: 'b', done: false }] }]]]),
  comments: new Map([['t1', [{ author: 'Ann', body: 'Looks good', createdAt: new Date('2025-01-02T03:04:05Z'), assigned: true }]]]),
  timeSpent: new Map([['t1', 3_600], ['t2', 1_800]]),
  fieldColumns: [{ id: 'f1', header: 'Budget' }],
  fieldValues: new Map([['t1', new Map([['f1', '12.5']])]]),
  ...over,
})

const task = {
  id: 't1',
  title: 'Launch',
  description: 'Line one\nline two',
  status: 'in_progress',
  priority: 'high' as const,
  parentTaskId: null,
  listId: 'l1',
  taskTypeId: 'tt',
  createdAt: new Date(Date.UTC(2019, 4, 30, 11)),
  dueDate: null,
  startDate: new Date(Date.UTC(2019, 5, 1, 4)),
  timeEstimate: 9_000,
}

describe('the workspace CSV export (§5.1)', () => {
  it('writes ClickUp’s header row, then one column per Custom Field', () => {
    assert.deepEqual(exportHeaders(ctx()), [...CLICKUP_EXPORT_HEADERS, 'Budget'])
  })

  it('lays a task out as ClickUp does: ms + text twins, bracketed lists, JSON attachments, rolled-up time', () => {
    const row = exportRow(task, ctx())
    const cell = (h: string) => row[exportHeaders(ctx()).indexOf(h)]
    assert.equal(cell('Task Link'), 'https://app.example/app/ws/tasks/t1')
    assert.equal(cell('Task Type'), 'Bug')
    assert.equal(cell('Task Custom ID'), '')
    assert.equal(cell('Status'), 'In progress')
    assert.equal(cell('Date created'), '1559214000000')
    assert.equal(cell('Date created Text'), 'Thursday, May 30th, 2019, 11:00:00 am +00:00')
    assert.equal(cell('Due date'), '')
    assert.equal(cell('Subtask IDs'), '[t2]')
    assert.equal(cell('Attachments'), '[{"title":"file.png","url":"https://x/file.png"}]')
    assert.equal(cell('Assignees'), '[John Smith,Mary Smith]')
    assert.equal(cell('Tags'), '[tag 1,tag 2]')
    assert.equal(cell('Priority'), 'high')
    assert.equal(cell('Folder Name'), 'Eng/Platform')
    assert.equal(cell('Time Estimated'), '9000000')
    assert.equal(cell('Time Estimated Text'), '2h 30m')
    assert.equal(cell('Checklists'), '[Prep: a (done), b]')
    assert.equal(cell('Comments'), '[Ann: Looks good (2025-01-02T03:04:05.000Z)]')
    assert.equal(cell('Assigned Comments'), '1')
    assert.equal(cell('Time Spent Text'), '1h')
    assert.equal(cell('Rolled Up Time Text'), '1h 30m')
    assert.equal(cell('Budget'), '12.5')
  })

  it('round-trips: RUNDESK’s own export maps back onto the spreadsheet importer with no clicks', () => {
    const csv = exportCsv(exportHeaders(ctx()), [exportRow(task, ctx())])
    const table = readDelimited(csv)
    assert.equal(table.rows[0].cells[5], 'Line one\nline two')
    const m = autoMap(table.headers)
    assert.equal(m['Task Name'], 'taskName')
    assert.equal(m['Task Description'], 'description')
    assert.equal(m['Parent ID'], 'parentId')
    assert.equal(m['Subtask IDs'], 'subtaskIds')
    assert.equal(m['Time Spent'], 'timeTracked')
    assert.equal(m['Date created Text'], 'skip')
  })

  it('field cells: option labels, labels joined, people by name', () => {
    const options = [{ label: 'Red', value: 'r' }, { label: 'Blue', value: 'b' }]
    assert.equal(fieldCell('dropdown', { v: 'b' }, options, new Map()), 'Blue')
    assert.equal(fieldCell('labels', { v: ['r', 'b'] }, options, new Map()), 'Red,Blue')
    assert.equal(fieldCell('people', { v: ['u1'] }, [], new Map([['u1', 'Ann']])), 'Ann')
    assert.equal(fieldCell('checkbox', { v: false }, [], new Map()), 'false')
    assert.equal(fieldCell('text', null, [], new Map()), '')
  })

  it('fields that share a name — or a fixed column’s — get distinct headers', () => {
    assert.deepEqual(fieldHeaders([{ id: 'a', name: 'Status' }, { id: 'b', name: 'Size' }, { id: 'c', name: 'size' }]), [
      { id: 'a', header: 'Status (2)' },
      { id: 'b', header: 'Size' },
      { id: 'c', header: 'size (2)' },
    ])
  })
})

describe('signed download links', () => {
  const storage = new ExportStorage({ configured: false } as any, 'secret')
  it('verify what was signed, until it expires', () => {
    const expires = Date.now() + 60_000
    const sig = storage.sign('e1', expires)
    assert.equal(storage.verify('e1', expires, sig), true)
    assert.equal(storage.verify('e2', expires, sig), false)
    assert.equal(storage.verify('e1', expires + 1, sig), false)
    assert.equal(storage.verify('e1', Date.now() - 1, storage.sign('e1', Date.now() - 1)), false)
    assert.equal(storage.verify('e1', expires, 'x'), false)
  })
})

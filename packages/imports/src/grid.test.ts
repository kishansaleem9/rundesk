import { test } from 'node:test'
import assert from 'node:assert/strict'
import { autoMap } from './automap'
import {
  attachmentsCell,
  bracketList,
  checklistsCell,
  clickUpDateText,
  CLICKUP_EXPORT_HEADERS,
  commentsCell,
  dateCells,
  durationCells,
  exportCell,
  exportCsv,
} from './clickup-export'
import { TASK_COLUMNS } from './columns'
import { buildGrid, parseChecklistCell, rowDraft, validateGrid, type GridContext } from './grid'
import { buildHierarchy } from './hierarchy'
import { spreadsheetBundle } from './spreadsheet-adapter'
import { readDelimited } from './delimited'

const ctx: GridContext = { dateFormat: 'ymd', delimiter: ',' }

test('the grid’s columns are §2.3’s, in its order, then List location', () => {
  assert.deepEqual(
    TASK_COLUMNS.map((c) => c.label + (c.required ? '*' : '')),
    ['Task Name*', 'Task ID', 'Subtask IDs', 'Description content', 'Task assignee', 'Status', 'Due Date', 'Start Date',
      'Date Created', 'Priority', 'Tags', 'Time Estimate', 'Time Tracked', 'Subtask Names', 'Checklist', 'Task Type', 'List',
      // RUNDESK's one addition, after §2.3's: where a task lives, as ClickUp's current export writes it.
      'List location'],
  )
})

test('§2.3’s example nests to depth 3, and RUNDESK folds it to one level', () => {
  // row 1 → 2,3; row 2 → 4,5; row 4 → 6
  const rows = [
    { key: '1', label: 'row 1', taskId: '1', subtaskIds: ['2', '3'] },
    { key: '2', label: 'row 2', taskId: '2', subtaskIds: ['4', '5'] },
    { key: '3', label: 'row 3', taskId: '3', subtaskIds: [] },
    { key: '4', label: 'row 4', taskId: '4', subtaskIds: ['6'] },
    { key: '5', label: 'row 5', taskId: '5', subtaskIds: [] },
    { key: '6', label: 'row 6', taskId: '6', subtaskIds: [] },
  ]
  const h = buildHierarchy(rows)
  assert.deepEqual(Object.fromEntries(h.depthOf), { 2: 1, 3: 1, 4: 2, 5: 2, 6: 3 })
  assert.deepEqual(Object.fromEntries(h.parentOf), { 2: '1', 3: '1', 4: '1', 5: '1', 6: '1' })
  assert.deepEqual(h.issues.map((i) => [i.key, i.severity]), [['4', 'info'], ['5', 'info'], ['6', 'info']])
})

test('loops, unknown ids, self-links, double parents and duplicate Task IDs are named, not imported', () => {
  const h = buildHierarchy([
    { key: 'a', label: 'row 2', taskId: 'A', subtaskIds: ['B', 'Z', 'A'] },
    { key: 'b', label: 'row 3', taskId: 'B', subtaskIds: ['A'] },
    { key: 'c', label: 'row 4', taskId: 'C', subtaskIds: ['B'] },
    { key: 'd', label: 'row 5', taskId: 'A', subtaskIds: [] },
  ])
  const msgs = h.issues.map((i) => `${i.key}:${i.message}`)
  assert.ok(msgs.some((m) => m.startsWith('d:Task ID "A" is already used on row 2')))
  assert.ok(msgs.some((m) => m === 'a:No row has Task ID "Z".'))
  assert.ok(msgs.some((m) => m === 'a:A task cannot be its own subtask.'))
  assert.ok(msgs.some((m) => m.startsWith('c:Task ID "B" is already a subtask of row 2')))
  assert.ok(msgs.some((m) => /form a loop/.test(m)))
  // Whatever survives the loop-break, nothing is its own ancestor.
  for (const [child, parent] of h.parentOf) assert.notEqual(child, parent)
})

const CSV = [
  'Title,ID,Parent ID,Due,Priority,Labels,Estimate,Checklist,List,Budget',
  'Launch,T1,,2025-12-31,1,"a,b",2h 30m,"[Prep: book room (done), send invites]",Q4,£12.50',
  'Brief,T2,T1,31/12/2025,urgent,,,,Other,abc',
  ',T3,T1,,,,,,,',
  'Deep,T4,T2,,9,,,,,',
].join('\n')

test('Parent ID is folded into Subtask IDs, cells are judged, rows become a bundle', () => {
  const table = readDelimited(CSV)
  const mapping = autoMap(table.headers)
  assert.equal(mapping['Parent ID'], 'parentId')
  mapping.ID = 'taskId'
  mapping.Budget = 'cf:new'
  const { columns, rows } = buildGrid(table, mapping, { delimiter: ',', newFieldTypes: { Budget: 'money' } })
  assert.equal(rows[0].values.subtaskIds, 'T2,T3')
  assert.equal(rows[1].values.subtaskIds, 'T4')

  const verdict = validateGrid(rows, columns, ctx)
  const issues = (key: string) => (verdict.issues.get(key) ?? []).map((i) => `${i.column}/${i.severity}`)
  assert.deepEqual(issues('r2'), [])
  // Wrong date format and a bad money value are yellow: the cell is dropped, the row stays.
  assert.deepEqual(issues('r3'), ['dueDate/format', 'new:Budget/format'])
  // No name is red: the row is not imported.
  assert.deepEqual(issues('r4'), ['taskName/invalid'])
  assert.deepEqual(issues('r5'), ['priority/format', 'subtaskIds/info'])
  assert.deepEqual([...verdict.validKeys], ['r2', 'r3', 'r5'])

  const draft = rowDraft(rows[0], columns, ctx, verdict.issues.get('r2'))
  assert.equal(draft.priority, 'urgent')
  assert.deepEqual(draft.tags, ['a', 'b'])
  assert.equal(draft.timeEstimateMs, 9_000_000)
  assert.deepEqual(draft.checklists, [{ name: 'Prep', items: [{ content: 'book room', done: true }, { content: 'send invites', done: false }] }])
  assert.deepEqual(draft.custom, { 'new:Budget': 12.5 })

  const { bundle, report } = spreadsheetBundle(rows, columns, ctx)
  assert.deepEqual(bundle.tasks.map((t) => [t.name, t.parentSourceId ?? null, t.listSourceId ?? null]), [
    ['Launch', null, 'list:q4'],
    // A subtask is written into its parent's List, whatever its own cell said.
    ['Brief', 'r2', 'list:q4'],
    ['Deep', 'r2', 'list:q4'],
  ])
  assert.deepEqual(report.skipped, [{ ref: 'row 4', reasons: ['Task Name is required.'] }])
  assert.ok(report.warnings.some((w) => w.ref === 'row 5' && /nest one level/.test(w.message)))
  assert.deepEqual(bundle.customFields, [{ sourceId: 'new:Budget', name: 'Budget', type: 'money', existingFieldId: undefined, options: undefined }])
})

test('a checklist cell without ClickUp’s brackets is one checklist named "Checklist"', () => {
  assert.deepEqual(parseChecklistCell('a,b', ','), { name: 'Checklist', items: [{ content: 'a', done: false }, { content: 'b', done: false }] })
  assert.equal(parseChecklistCell('', ','), null)
})

test('the export header row is byte-identical to ClickUp’s', () => {
  const csv = exportCsv(CLICKUP_EXPORT_HEADERS, [])
  assert.equal(
    csv,
    '﻿Task ID,Task Link,Task Type,Task Custom ID,Task Name,Task Description,Status,Date created,Date created Text,' +
      'Due date,Due date Text,Start date,Start date Text,Parent ID,Subtask IDs,Attachments,Assignees,Tags,Priority,' +
      'List Name,Folder Name,Space Name,Time Estimated,Time Estimated Text,Checklists,Comments,Assigned Comments,' +
      'Time Spent,Time Spent Text,Rolled Up Time,Rolled Up Time Text\r\n',
  )
})

test('export cells: ms + text twins, brackets, JSON, formula guard', () => {
  assert.equal(clickUpDateText(Date.UTC(2019, 4, 30, 11, 0, 0)), 'Thursday, May 30th, 2019, 11:00:00 am +00:00')
  assert.equal(clickUpDateText(Date.UTC(2021, 0, 1, 0, 5, 9)), 'Friday, January 1st, 2021, 12:05:09 am +00:00')
  assert.deepEqual(dateCells(new Date(Date.UTC(2019, 4, 30, 11)), 'iso'), ['1559214000000', '2019-05-30T11:00:00.000Z'])
  assert.deepEqual(dateCells(null, 'normal'), ['', ''])
  assert.deepEqual(durationCells(9_000_000), ['9000000', '2h 30m'])
  assert.equal(bracketList(['John Smith', 'Mary Smith']), '[John Smith,Mary Smith]')
  assert.equal(attachmentsCell([{ title: 'file.png', url: 'https://x/y' }]), '[{"title":"file.png","url":"https://x/y"}]')
  assert.equal(checklistsCell([{ name: 'Prep', items: [{ content: 'a', done: true }, { content: 'b', done: false }] }]), '[Prep: a (done), b]')
  assert.equal(commentsCell([{ author: 'Ann', body: 'hi', createdAt: '2025-01-02T03:04:05.000Z' }]), '[Ann: hi (2025-01-02T03:04:05.000Z)]')
  assert.equal(exportCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`)
  assert.equal(exportCell('-5'), '-5')
  assert.equal(exportCell('line1\nline2'), '"line1\nline2"')
  assert.equal(exportCell('plain'), 'plain')
})

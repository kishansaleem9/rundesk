/**
 * The committed fixtures (`test/fixtures/imports/`), read end to end as the
 * wizard reads them: file → table → auto-mapping → grid → verdicts → bundle.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { autoMap } from './automap'
import { buildGrid, validateGrid } from './grid'
import { readSheetFile } from './read-file'
import { spreadsheetBundle } from './spreadsheet-adapter'

const DIR = join(__dirname, '..', '..', '..', 'test', 'fixtures', 'imports')
const load = (name: string) => readSheetFile(name, new Uint8Array(readFileSync(join(DIR, name))))
const ctx = { dateFormat: 'ymd' as const, delimiter: ',' }

test('tasks.csv: every §2.3 column maps by its own name, and the bundle keeps what it should', async () => {
  const table = await load('tasks.csv')
  const mapping = autoMap(table.headers)
  assert.deepEqual(
    table.headers.filter((h) => mapping[h] === 'skip'),
    ['Budget'],
  )
  mapping.Budget = 'cf:new'
  const { columns, rows } = buildGrid(table, mapping, { delimiter: ',', newFieldTypes: { Budget: 'money' } })
  const verdict = validateGrid(rows, columns, ctx)
  // Row 7 has no name: red. Row 8's date, priority, estimate and budget are yellow.
  assert.equal(verdict.validKeys.has('r7'), false)
  assert.deepEqual(
    (verdict.issues.get('r8') ?? []).map((i) => `${i.column}/${i.severity}`).sort(),
    ['dueDate/format', 'new:Budget/format', 'priority/format', 'timeEstimate/format'],
  )
  const { bundle, report } = spreadsheetBundle(rows, columns, ctx)
  assert.equal(bundle.tasks.length, 6)
  // T1 → T2, T3; T2 → T4; T4 → T5: everything under T1, one level deep.
  const parentOf = Object.fromEntries(bundle.tasks.map((t) => [t.name, t.parentSourceId ?? null]))
  assert.deepEqual(parentOf, {
    'Launch website': null,
    'Bad cells': null,
    'Write copy': 'r2',
    'Design images': 'r2',
    Proofread: 'r2',
    'Final sign-off': 'r2',
  })
  assert.deepEqual(report.skipped.map((s) => s.ref), ['row 7'])
  assert.deepEqual(bundle.lists.map((l) => l.name).sort(), ['Q1', 'Q4'])
  const launch = bundle.tasks.find((t) => t.name === 'Launch website')!
  assert.deepEqual(launch.checklists, [{ name: 'Checklist', items: ['Copy', 'Images', 'QA'].map((content) => ({ content, done: false })) }])
  assert.equal(launch.timeEstimateMs, 9_000_000)
  assert.deepEqual(launch.timeEntries, [{ durationMs: 3_600_000 }])
  assert.deepEqual(launch.fields, { 'new:Budget': 1500 })
})

test('clickup-export.csv: ClickUp’s own export maps with no clicks', async () => {
  const table = await load('clickup-export.csv')
  const mapping = autoMap(table.headers)
  assert.equal(mapping['Task Name'], 'taskName')
  assert.equal(mapping['Task Description'], 'description')
  assert.equal(mapping['Date created'], 'dateCreated')
  assert.equal(mapping['Due date'], 'dueDate')
  assert.equal(mapping['Parent ID'], 'parentId')
  assert.equal(mapping.Assignees, 'assignees')
  assert.equal(mapping['List Name'], 'list')
  assert.equal(mapping['Time Estimated'], 'timeEstimate')
  assert.equal(mapping['Time Spent'], 'timeTracked')
  assert.equal(mapping.Checklists, 'checklist')
  assert.equal(mapping['Story points'], 'skip')
  const { columns, rows } = buildGrid(table, mapping, { delimiter: ',' })
  const { bundle } = spreadsheetBundle(rows, columns, ctx)
  const [plan, room] = bundle.tasks
  assert.equal(plan.name, 'Plan sprint')
  assert.equal(new Date(plan.dateCreated!).toISOString(), '2019-05-30T11:00:00.000Z')
  assert.deepEqual(plan.assignees, ['Ann Lee', 'Bo'])
  assert.equal(plan.priority, 'high')
  assert.deepEqual(plan.checklists, [{ name: 'Prep', items: [{ content: 'book room', done: true }, { content: 'send invites', done: false }] }])
  assert.equal(room.parentSourceId, plan.sourceId)
})

test('tasks.xlsx (written by RUNDESK’s own .xlsx writer) and tasks.json read as tables', async () => {
  const xlsx = await load('tasks.xlsx')
  assert.deepEqual(xlsx.headers, ['Task Name', 'Status', 'Due Date', 'Priority', 'Tags', 'Assignee'])
  assert.equal(xlsx.rows.length, 3)
  assert.equal(xlsx.rows[2].cells[0], '=SUM(1,2)')
  const json = await load('tasks.json')
  const m = autoMap(json.headers)
  assert.deepEqual(m, { Name: 'taskName', Owner: 'assignees', Deadline: 'dueDate', Labels: 'tags', Notes: 'description', Priority: 'priority' })
  assert.equal(json.rows[0].cells[json.headers.indexOf('Labels')], 'ops, calls')
})

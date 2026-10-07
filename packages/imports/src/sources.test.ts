import { test } from 'node:test'
import assert from 'node:assert/strict'
import { autoMap } from './automap'
import { CSV_SOURCES, CSV_SOURCE_KEYS, isCsvSource } from './sources'

const mapped = (key: keyof typeof CSV_SOURCES, headers: string[]) => autoMap(headers, { columns: CSV_SOURCES[key].columns })

test('Asana’s CSV export maps by its own column names', () => {
  const m = mapped('asana', ['Task ID', 'Created At', 'Completed At', 'Name', 'Section/Column', 'Assignee', 'Assignee Email', 'Start Date', 'Due Date', 'Tags', 'Notes', 'Parent task'])
  assert.equal(m.Name, 'taskName')
  assert.equal(m['Assignee Email'], 'assignees')
  assert.equal(m.Assignee, 'skip')
  assert.equal(m['Section/Column'], 'list')
  assert.equal(m.Notes, 'description')
  assert.equal(m['Task ID'], 'taskId')
  assert.equal(m['Parent task'], 'skip')
  assert.equal(m['Due Date'], 'dueDate')
})

test('Jira links subtasks by issue id; Trello reads its lists as statuses', () => {
  const j = mapped('jira', ['Summary', 'Issue key', 'Issue id', 'Parent id', 'Issue Type', 'Status', 'Priority', 'Assignee', 'Created', 'Due date', 'Labels'])
  assert.deepEqual([j.Summary, j['Issue id'], j['Parent id'], j['Issue Type'], j.Created, j.Labels], ['taskName', 'taskId', 'parentId', 'taskType', 'dateCreated', 'tags'])
  const t = mapped('trello', ['Card ID', 'Card Name', 'Card URL', 'Card Description', 'Labels', 'Members', 'Due Date', 'List Name', 'Board Name'])
  assert.deepEqual([t['Card Name'], t['List Name'], t.Members, t['Card URL']], ['taskName', 'status', 'assignees', 'skip'])
})

test('Todoist’s inverted priority scale, and every app knows "Medium"', () => {
  assert.equal(CSV_SOURCES.todoist.priorities['4'], 'urgent')
  assert.equal(CSV_SOURCES.todoist.priorities['1'], 'low')
  const t = mapped('todoist', ['TYPE', 'CONTENT', 'DESCRIPTION', 'PRIORITY', 'INDENT', 'AUTHOR', 'RESPONSIBLE', 'DATE', 'DATE_LANG', 'TIMEZONE'])
  assert.deepEqual([t.CONTENT, t.RESPONSIBLE, t.DATE, t.PRIORITY, t.TYPE, t.DATE_LANG], ['taskName', 'assignees', 'dueDate', 'priority', 'skip', 'skip'])
  for (const key of CSV_SOURCE_KEYS) if (key !== 'todoist') assert.equal(CSV_SOURCES[key].priorities.medium, 'normal')
  assert.equal(isCsvSource('asana'), true)
  assert.equal(isCsvSource('slack'), false)
})

test('memory still outranks an app’s defaults', () => {
  const m = autoMap(['List Name'], { memory: { 'list name': 'list' }, columns: CSV_SOURCES.trello.columns })
  assert.equal(m['List Name'], 'list')
})

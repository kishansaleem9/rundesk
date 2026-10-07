import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { CellIssue, GridRow } from '@rundesk/imports'
import { chunkRows } from '../../lib/imports-exports-api'
import { blankRow, clearColumn, deleteRows, distinctValues, findAndReplace, replaceEmpty, rowsToCsv, sortRows, visibleRows } from './grid-ops'
import { buildLocationTree, descendantKeys, filterTree, flattenTree, nodeKey, selectionToLocations, toggleNode, type MoveTargetSpace } from './location-tree'

const SPACES: MoveTargetSpace[] = [
  {
    id: 's1',
    name: 'Product',
    folders: [{ id: 'f1', name: 'Eng' }],
    projects: [
      { id: 'p1', name: 'Platform', folderId: 'f1' },
      { id: 'p2', name: 'Roadmap', folderId: null },
      { id: 'pd', name: 'Lists', folderId: null, isDefaultContainer: true },
    ],
    lists: [
      { id: 'l1', name: 'Sprint 1', projectId: 'p1' },
      { id: 'l2', name: 'Ideas', projectId: 'p2' },
      { id: 'l3', name: 'Inbox', projectId: 'pd' },
    ],
  },
]

test('the tree draws a space’s hidden container’s lists under the space itself', () => {
  const tree = buildLocationTree(SPACES)
  assert.deepEqual(
    flattenTree(tree).map((n) => `${'  '.repeat(n.depth)}${n.type}:${n.name}`),
    ['space:Product', '  folder:Eng', '    project:Platform', '      list:Sprint 1', '  project:Roadmap', '    list:Ideas', '  list:Inbox'],
  )
  assert.equal(flattenTree(tree).find((n) => n.id === 'l1')?.path, 'Product / Eng / Platform / Sprint 1')
})

test('search keeps a match where it lives', () => {
  const tree = filterTree(buildLocationTree(SPACES), 'sprint')
  assert.deepEqual(flattenTree(tree).map((n) => n.name), ['Product', 'Eng', 'Platform', 'Sprint 1'])
  assert.deepEqual(filterTree(buildLocationTree(SPACES), 'nothing'), [])
})

test('ticking a parent ticks its children; unticking a child unticks its ancestors; the highest ticks are sent', () => {
  const tree = buildLocationTree(SPACES)
  const space = tree[0]
  let sel = toggleNode(new Set(), space, tree)
  assert.equal(sel.size, descendantKeys(space).length)
  assert.deepEqual(selectionToLocations(sel, tree), [{ type: 'space', id: 's1' }])
  const sprint = flattenTree(tree).find((n) => n.id === 'l1')!
  sel = toggleNode(sel, sprint, tree)
  assert.equal(sel.has(nodeKey(space)), false)
  assert.equal(sel.has('folder:f1'), false)
  assert.deepEqual(selectionToLocations(sel, tree), [
    { type: 'project', id: 'p2' },
    { type: 'list', id: 'l3' },
  ])
})

const rows: GridRow[] = [
  { key: 'r2', line: 2, values: { taskName: 'b task', status: 'Open' } },
  { key: 'r3', line: 3, values: { taskName: 'A task', status: '' } },
  { key: 'r4', line: 4, values: { taskName: '', status: 'Done' } },
]

test('column menu edits', () => {
  assert.deepEqual(sortRows(rows, 'taskName', 'asc').map((r) => r.key), ['r4', 'r3', 'r2'])
  assert.deepEqual(sortRows(rows, 'taskName', 'desc').map((r) => r.key), ['r2', 'r3', 'r4'])
  const fr = findAndReplace(rows, 'taskName', 'task', 'job')
  assert.equal(fr.changed, 2)
  assert.equal(fr.rows[0].values.taskName, 'b job')
  const re = replaceEmpty(rows, 'status', 'To do')
  assert.equal(re.changed, 1)
  assert.equal(re.rows[1].values.status, 'To do')
  assert.deepEqual(clearColumn(rows, 'status').map((r) => r.values.status), ['', '', ''])
  assert.deepEqual(deleteRows(rows, new Set(['r3'])).map((r) => r.key), ['r2', 'r4'])
  assert.equal(blankRow([...rows, { key: 'm4', values: {} }]).key, 'm5')
  assert.deepEqual(distinctValues(rows, 'status'), [
    { value: '', count: 1 },
    { value: 'Done', count: 1 },
    { value: 'Open', count: 1 },
  ])
})

test('All / Valid / Invalid, search and filter by value', () => {
  const issues = new Map<string, CellIssue[]>([
    ['r2', []],
    ['r3', [{ column: 'dueDate', severity: 'format', message: 'bad date' }]],
    ['r4', [{ column: 'taskName', severity: 'invalid', message: 'Task Name is required.' }]],
  ])
  const keys = (filter: 'all' | 'valid' | 'invalid', search = '') => visibleRows(rows, issues, { filter, search }).map((r) => r.key)
  assert.deepEqual(keys('all'), ['r2', 'r3', 'r4'])
  assert.deepEqual(keys('valid'), ['r2'])
  assert.deepEqual(keys('invalid'), ['r3', 'r4'])
  assert.deepEqual(keys('all', 'DONE'), ['r4'])
  assert.deepEqual(visibleRows(rows, issues, { filter: 'all', search: '', field: { column: 'status', value: 'open', exact: true } }).map((r) => r.key), ['r2'])
})

test('Download writes the grid’s columns, formula-safe', () => {
  const csv = rowsToCsv([{ key: 'x', values: { taskName: '=SUM(A1)', status: 'a,b' } }], [
    { key: 'taskName', label: 'Task Name', required: true, kind: 'text' },
    { key: 'status', label: 'Status', required: false, kind: 'status' },
  ])
  assert.equal(csv, "﻿Task Name,Status\r\n'=SUM(A1),\"a,b\"\r\n")
})

test('rows go up in chunks under the request limit', () => {
  const many: GridRow[] = Array.from({ length: 30 }, (_, i) => ({ key: `r${i}`, values: { taskName: 'x'.repeat(1000) } }))
  const chunks = chunkRows(many, 10 * 1024)
  assert.ok(chunks.length > 1)
  assert.equal(chunks.flat().length, 30)
  for (const c of chunks) assert.ok(JSON.stringify(c).length < 10 * 1024 + 1100)
})

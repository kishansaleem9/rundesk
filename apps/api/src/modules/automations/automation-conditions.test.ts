import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_CONDITIONS, evaluateCondition, evaluateConditions, normaliseConditions, type TaskFacts } from './automation-conditions'

/* An automation's conditions (`found-14-oct/automation-conditions-and-actions-unbuilt`), read against a task's facts. */

const task: TaskFacts = {
  status: 'In Review',
  priority: 'urgent',
  assignees: ['u-ana', 'u-ben'],
  lists: ['l-q4', 'l-shared'],
  tags: ['Client', 'launch'],
  dueDate: new Date('2026-10-20T15:00:00Z'),
  title: 'Ship the launch plan',
}

test('a value compares whatever its case; a set field "is" a value it holds', () => {
  assert.equal(evaluateCondition({ field: 'status', operator: 'is', value: 'in review' }, task).passed, true)
  assert.equal(evaluateCondition({ field: 'status', operator: 'is_not', value: 'Done' }, task).passed, true)
  assert.equal(evaluateCondition({ field: 'tag', operator: 'is', value: 'client' }, task).passed, true)
  assert.equal(evaluateCondition({ field: 'tag', operator: 'is_not', value: 'client' }, task).passed, false)
  assert.equal(evaluateCondition({ field: 'assignee', operator: 'is', value: 'u-ben' }, task).passed, true)
  assert.equal(evaluateCondition({ field: 'list', operator: 'is', value: 'l-shared' }, task).passed, true)
})

test('any of and none of read a list, given as one or as text with commas', () => {
  assert.equal(evaluateCondition({ field: 'priority', operator: 'any_of', value: ['high', 'urgent'] }, task).passed, true)
  assert.equal(evaluateCondition({ field: 'priority', operator: 'any_of', value: 'low, normal' }, task).passed, false)
  assert.equal(evaluateCondition({ field: 'tag', operator: 'none_of', value: ['internal', 'draft'] }, task).passed, true)
  assert.equal(evaluateCondition({ field: 'tag', operator: 'none_of', value: 'launch' }, task).passed, false)
})

test('set and unset; a title contains; a due date before or after a day', () => {
  assert.equal(evaluateCondition({ field: 'assignee', operator: 'is_set' }, task).passed, true)
  assert.equal(evaluateCondition({ field: 'priority', operator: 'is_not_set' }, { ...task, priority: null }).passed, true)
  assert.equal(evaluateCondition({ field: 'due_date', operator: 'is_not_set' }, task).passed, false)
  assert.equal(evaluateCondition({ field: 'title', operator: 'contains', value: 'LAUNCH' }, task).passed, true)
  assert.equal(evaluateCondition({ field: 'due_date', operator: 'before', value: '2026-10-21' }, task).passed, true)
  assert.equal(evaluateCondition({ field: 'due_date', operator: 'after', value: '2026-10-21' }, task).passed, false)
  assert.equal(evaluateCondition({ field: 'due_date', operator: 'before', value: '2026-10-21' }, { ...task, dueDate: null }).passed, false)
})

test('a rule acts when every condition holds, or any one as it says; with none it acts', () => {
  const holds = { field: 'priority', operator: 'is', value: 'urgent' } as const
  const fails = { field: 'tag', operator: 'is', value: 'internal' } as const
  assert.equal(evaluateConditions([holds, fails], 'all', task).passed, false)
  assert.equal(evaluateConditions([holds, fails], 'any', task).passed, true)
  assert.deepEqual(evaluateConditions([holds, fails], 'all', task).verdicts.map((v) => v.passed), [true, false])
  assert.equal(evaluateConditions([], 'all', task).passed, true)
})

test('conditions are refused as stored when they cannot be read: an unknown field, an operator the field does not take, a missing value or date, more than fifteen', () => {
  assert.ok('error' in normaliseConditions([{ field: 'colour', operator: 'is', value: 'red' }]))
  assert.ok('error' in normaliseConditions([{ field: 'due_date', operator: 'contains', value: 'x' }]))
  assert.ok('error' in normaliseConditions([{ field: 'status', operator: 'is' }]))
  assert.ok('error' in normaliseConditions([{ field: 'due_date', operator: 'before', value: 'soon' }]))
  assert.ok('error' in normaliseConditions(Array.from({ length: MAX_CONDITIONS + 1 }, () => ({ field: 'status', operator: 'is', value: 'x' }))))
  assert.deepEqual(normaliseConditions([{ field: 'assignee', operator: 'is_set', value: 'ignored' }]), { conditions: [{ field: 'assignee', operator: 'is_set' }], match: 'all' })
  assert.deepEqual(normaliseConditions(undefined), { conditions: [], match: 'all' })
})

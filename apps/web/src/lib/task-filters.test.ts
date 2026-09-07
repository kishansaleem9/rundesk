import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  matchesFilter,
  matchesNode,
  filterLeaves,
  countLeaves,
  isFilterGroup,
  UNASSIGNED_FILTER,
  type FilterContext,
  type FilterNode,
  type FilterTask,
} from './task-filters'

/**
 * §V2-07 — the Filters panel of frame `11:41`, and specifically "Add nested
 * filter", which is the only part of it a flat AND list could not already say.
 *
 * These run against the evaluator directly. They used to be impossible: the
 * evaluator lived inside a 5,000-line route file, so the only way to ask it a
 * question was to render a list.
 */

const CTX: FilterContext = { customFields: [], customValues: {} }

const SARA = 'user-sara'
const OMAR = 'user-omar'

const task = (over: Partial<FilterTask> = {}): FilterTask => ({
  id: 't1',
  status: 'in_progress',
  priority: 'normal',
  dueDate: '2026-08-10T09:00:00.000Z',
  createdAt: '2026-08-01T09:00:00.000Z',
  completedAt: null,
  createdById: SARA,
  assignees: [{ userId: SARA }],
  labels: [{ id: 'label-bug' }],
  ...over,
})

const rule = (field: string, op: string, value: string, value2?: string): FilterNode =>
  ({ id: `${field}-${op}-${value}`, field, op: op as never, value, value2 })

// ── the shape of the tree ───────────────────────────────────────────────────

test('a group is recognised by carrying rules, a leaf is not', () => {
  assert.equal(isFilterGroup(rule('status', 'is', 'done')), false)
  assert.equal(isFilterGroup({ id: 'g', conjunction: 'or', rules: [] }), true)
})

test('leaves are counted through brackets, not around them', () => {
  const nodes: FilterNode[] = [
    rule('priority', 'is', 'urgent'),
    { id: 'g', conjunction: 'or', rules: [
      { id: 'a', field: 'assignee', op: 'is', value: SARA },
      { id: 'b', field: 'assignee', op: 'is', value: UNASSIGNED_FILTER },
    ] },
  ]
  assert.equal(countLeaves(nodes), 3)
  assert.deepEqual(filterLeaves(nodes).map((r) => r.field), ['priority', 'assignee', 'assignee'])
})

// ── the thing a flat list could not say ─────────────────────────────────────

test('urgent AND (mine OR unassigned) — the sentence brackets exist for', () => {
  const nodes: FilterNode[] = [
    rule('priority', 'is', 'urgent'),
    { id: 'g', conjunction: 'or', rules: [
      { id: 'a', field: 'assignee', op: 'is', value: SARA },
      { id: 'b', field: 'assignee', op: 'is', value: UNASSIGNED_FILTER },
    ] },
  ]
  const urgentMine = task({ priority: 'urgent', assignees: [{ userId: SARA }] })
  const urgentNobody = task({ priority: 'urgent', assignees: [] })
  const urgentOmar = task({ priority: 'urgent', assignees: [{ userId: OMAR }] })
  const normalMine = task({ priority: 'normal', assignees: [{ userId: SARA }] })

  assert.equal(matchesFilter(urgentMine, nodes, CTX), true)
  assert.equal(matchesFilter(urgentNobody, nodes, CTX), true)
  // The two halves of the bracket are an OR, but the bracket itself is ANDed
  // with the priority — so failing either side is enough to drop the row.
  assert.equal(matchesFilter(urgentOmar, nodes, CTX), false)
  assert.equal(matchesFilter(normalMine, nodes, CTX), false)
})

test('a group set to "all of" is an AND inside the bracket', () => {
  const group: FilterNode = { id: 'g', conjunction: 'and', rules: [
    { id: 'a', field: 'assignee', op: 'is', value: SARA },
    { id: 'b', field: 'priority', op: 'is', value: 'urgent' },
  ] }
  assert.equal(matchesNode(task({ priority: 'urgent' }), group, CTX), true)
  assert.equal(matchesNode(task({ priority: 'low' }), group, CTX), false)
})

test('an empty bracket matches everything, so clicking Add does not empty the list', () => {
  const group: FilterNode = { id: 'g', conjunction: 'or', rules: [] }
  assert.equal(matchesNode(task(), group, CTX), true)
})

// ── set-valued fields ───────────────────────────────────────────────────────

test('assignee is a set: "is" means contains', () => {
  const both = task({ assignees: [{ userId: SARA }, { userId: OMAR }] })
  assert.equal(matchesFilter(both, [rule('assignee', 'is', OMAR)], CTX), true)
  assert.equal(matchesFilter(both, [rule('assignee', 'is', 'user-nobody')], CTX), false)
})

test('and "is not" means does not contain — not "the first one is somebody else"', () => {
  const both = task({ assignees: [{ userId: SARA }, { userId: OMAR }] })
  assert.equal(matchesFilter(both, [rule('assignee', 'isNot', OMAR)], CTX), false)
  assert.equal(matchesFilter(both, [rule('assignee', 'isNot', 'user-nobody')], CTX), true)
})

test('unassigned is a value the same dropdown can offer', () => {
  const nobody = task({ assignees: [] })
  assert.equal(matchesFilter(nobody, [rule('assignee', 'is', UNASSIGNED_FILTER)], CTX), true)
  assert.equal(matchesFilter(task(), [rule('assignee', 'is', UNASSIGNED_FILTER)], CTX), false)
  // isSet / isNotSet ask the same question the other way round.
  assert.equal(matchesFilter(nobody, [rule('assignee', 'isNotSet', '')], CTX), true)
  assert.equal(matchesFilter(task(), [rule('assignee', 'isSet', '')], CTX), true)
})

test('tags behave the same way', () => {
  const tagged = task({ labels: [{ id: 'label-bug' }, { id: 'label-ui' }] })
  assert.equal(matchesFilter(tagged, [rule('tags', 'is', 'label-ui')], CTX), true)
  assert.equal(matchesFilter(tagged, [rule('tags', 'isNot', 'label-ui')], CTX), false)
  assert.equal(matchesFilter(task({ labels: [] }), [rule('tags', 'isNotSet', '')], CTX), true)
})

// ── the fields the panel gained ─────────────────────────────────────────────

test('status and priority filter on the row, not on a column funnel', () => {
  assert.equal(matchesFilter(task({ status: 'done' }), [rule('status', 'is', 'done')], CTX), true)
  assert.equal(matchesFilter(task({ status: 'done' }), [rule('status', 'isNot', 'done')], CTX), false)
  assert.equal(matchesFilter(task({ priority: 'urgent' }), [rule('priority', 'is', 'urgent')], CTX), true)
})

test('date closed is a real date, and unset means it fails a range rather than passing it', () => {
  const closed = task({ completedAt: '2026-08-15T12:00:00.000Z' })
  assert.equal(matchesFilter(closed, [rule('closed', 'between', '2026-08-01', '2026-08-31')], CTX), true)
  assert.equal(matchesFilter(closed, [rule('closed', 'between', '2026-09-01', '2026-09-30')], CTX), false)
  assert.equal(matchesFilter(task(), [rule('closed', 'after', '2026-01-01')], CTX), false)
  assert.equal(matchesFilter(task(), [rule('closed', 'isNotSet', '')], CTX), true)
})

// ── the ways a rule can be incomplete ───────────────────────────────────────

test('a rule with no value yet filters nothing', () => {
  // You have picked the field and not the value. Hiding every row at that
  // moment reads as "there is nothing here", which is a different sentence.
  assert.equal(matchesFilter(task(), [rule('status', 'is', '')], CTX), true)
  assert.equal(matchesFilter(task(), [rule('assignee', 'is', '  ')], CTX), true)
})

test('a rule on a field that no longer exists does not hide rows', () => {
  assert.equal(matchesFilter(task(), [rule('custom:deleted-field', 'is', 'x')], CTX), true)
})

test('a custom field is read out of the context, not off the task', () => {
  const ctx: FilterContext = {
    customFields: [{ id: 'f1', type: 'dropdown' }],
    customValues: { t1: { f1: 'red' } },
  }
  assert.equal(matchesFilter(task(), [rule('custom:f1', 'is', 'red')], ctx), true)
  assert.equal(matchesFilter(task(), [rule('custom:f1', 'is', 'blue')], ctx), false)
  assert.equal(matchesFilter(task({ id: 'other' }), [rule('custom:f1', 'isNotSet', '')], ctx), true)
})

test('a nested rule on a custom field is evaluated like any other', () => {
  // The reason `filterLeaves` exists: the route decides whether to FETCH
  // custom values by looking for `custom:` rules, and a rule inside a bracket
  // has to count.
  const ctx: FilterContext = {
    customFields: [{ id: 'f1', type: 'dropdown' }],
    customValues: { t1: { f1: 'red' } },
  }
  const nodes: FilterNode[] = [
    { id: 'g', conjunction: 'or', rules: [
      { id: 'a', field: 'custom:f1', op: 'is', value: 'blue' },
      { id: 'b', field: 'custom:f1', op: 'is', value: 'red' },
    ] },
  ]
  assert.equal(filterLeaves(nodes).some((r) => r.field.startsWith('custom:')), true)
  assert.equal(matchesFilter(task(), nodes, ctx), true)
})

test('an old saved view — a flat array of rules — still evaluates', () => {
  // `FilterRule[]` is a valid `FilterNode[]`, so views saved before brackets
  // existed need no migration. This is the check that says so.
  const legacy = [
    { id: '1', field: 'status', op: 'is' as const, value: 'in_progress' },
    { id: '2', field: 'priority', op: 'is' as const, value: 'normal' },
  ]
  assert.equal(matchesFilter(task(), legacy, CTX), true)
  assert.equal(matchesFilter(task({ priority: 'low' }), legacy, CTX), false)
})

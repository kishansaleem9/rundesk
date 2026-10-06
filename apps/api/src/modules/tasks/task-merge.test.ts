import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  MERGE_MOVES,
  MERGE_REFUSAL_MESSAGE,
  emptyMergeTally,
  holdsNoInformation,
  mergeRefusal,
  mergedDescription,
  type MergeSubject,
} from './task-merge'

const task = (over: Partial<MergeSubject> & { id: string }): MergeSubject => ({
  listId: 'l1',
  workspaceId: 'w1',
  parentTaskId: null,
  description: null,
  isArchived: false,
  ...over,
})
const A = task({ id: 'a' })
const B = task({ id: 'b' })

test('an ordinary merge is allowed', () => {
  assert.equal(mergeRefusal(A, B, false), null)
})

test('a task of another workspace is refused with its reason, not as one that is not there, before any other rule of the target', () => {
  // `found-6-oct/merge-moves-work-across-workspaces`: a merge across two
  // workspaces moved one's comment into the other (201, lane 7). Asked before
  // the nesting rule, so a task of another workspace is answered by this rule
  // alone — not that it is a subtask; and in its own words, as a list or a
  // project moved to another workspace is, since "not found" is for an id
  // naming nothing (the owner's decision of 1 October).
  const elsewhere = task({ id: 'b', workspaceId: 'w2', parentTaskId: 'c' })
  assert.equal(mergeRefusal(A, elsewhere, false), 'other-workspace')
  assert.equal(mergeRefusal(A, elsewhere, true), 'other-workspace')
  assert.equal(MERGE_REFUSAL_MESSAGE['other-workspace'], 'A task can only be merged into a task of its own workspace')
  assert.notEqual(MERGE_REFUSAL_MESSAGE['other-workspace'], MERGE_REFUSAL_MESSAGE['target-missing'])
})

test('a value cleared, an empty text and an empty list hold no information; a value that is there holds some', () => {
  // `found-6-oct/merge-drops-a-value-beside-an-emptied-one`: ClickUp adds the
  // merged task's value "only … if task B doesn't have any information".
  for (const emptied of [null, undefined, { v: null }, { v: '' }, { v: [] }]) {
    assert.equal(holdsNoInformation(emptied as never), true, JSON.stringify(emptied))
  }
  for (const held of [{ v: 'words' }, { v: ['red'] }, { v: 3 }]) {
    assert.equal(holdsNoInformation(held), false, JSON.stringify(held))
  }
})

test('a task cannot be merged into itself', () => {
  assert.equal(mergeRefusal(A, A, false), 'same-task')
})

test('a missing task on either side is a not-found, not a bad request', () => {
  // The distinction matters at the controller: one is a typo in a URL, the
  // other is a rule being broken.
  assert.equal(mergeRefusal(null, B, false), 'source-missing')
  assert.equal(mergeRefusal(A, null, false), 'target-missing')
})

test('a subtask may be merged into its own parent', () => {
  // Refused until 29 September as "a decision not taken" (`commit-log/log-b7ee313-1`):
  // nothing points into the bin when it happens, and ClickUp merges subtasks
  // into another task, their parent included, from the subtask toolbar.
  const child = task({ id: 'a', parentTaskId: 'b' })
  assert.equal(mergeRefusal(child, B, false), null)
})

test('and merging a task INTO its own subtask is the nesting rule, not that one', () => {
  // A target that is the source's child means the source has a subtask and the
  // target has a parent, so `would-nest-twice` always catches it first. Pinned
  // because the rule above was believed to be doing this for a long time, and
  // a break patch deleting it left every check green.
  const ownSubtask = task({ id: 'b', parentTaskId: 'a' })
  assert.equal(mergeRefusal(A, ownSubtask, true), 'would-nest-twice')
})

test('a task with subtasks cannot be merged into a subtask', () => {
  // Its children would move under the target and become grandchildren, which
  // `updateTask` refuses everywhere else. Refused rather than flattened,
  // because flattening loses the grouping somebody built.
  const subtaskTarget = task({ id: 'b', parentTaskId: 'c' })
  assert.equal(mergeRefusal(A, subtaskTarget, true), 'would-nest-twice')
  // ...but a childless task merging into a subtask is fine.
  assert.equal(mergeRefusal(A, subtaskTarget, false), null)
})

test('a binned task cannot be merged', () => {
  // Otherwise a merge could quietly resurrect work from the bin into a live
  // task, which nobody watching the live task asked for.
  assert.equal(mergeRefusal(task({ id: 'a', isArchived: true }), B, false), 'already-binned')
})

test('the refusal order puts identity before every other rule', () => {
  // Merging a task into itself while it also looks like its own descendant
  // must report the simple truth, not the exotic one.
  assert.equal(mergeRefusal(A, A, true), 'same-task')
})

test('every kind of thing that moves is counted, starting at zero', () => {
  const tally = emptyMergeTally()
  assert.equal(Object.keys(tally).length, MERGE_MOVES.length)
  assert.ok(MERGE_MOVES.includes('comments'))
  assert.ok(MERGE_MOVES.includes('attachments'))
  assert.ok(MERGE_MOVES.includes('subtasks'))
  assert.ok(Object.values(tally).every((n) => n === 0))
})

test('the merged description keeps both halves, target first', () => {
  const out = mergedDescription('what continues', 'the evidence', 'Old bug')
  assert.ok(out !== null)
  assert.ok(out.startsWith('what continues'), out)
  assert.ok(out.includes('the evidence'), out)
  // Named, so nobody later reads the two halves as one person's text.
  assert.ok(out.includes('Old bug'), out)
})

test('an empty target still gets the incoming description', () => {
  const out = mergedDescription(null, 'the evidence', 'Old bug')
  assert.ok(out?.includes('the evidence'), String(out))
})

test('nothing to merge means no write at all', () => {
  // Null rather than an unchanged string: the caller skips the update, so a
  // merge that adds no description does not create a description-history entry
  // recording a change that never happened.
  assert.equal(mergedDescription('what continues', null, 'Old bug'), null)
  assert.equal(mergedDescription('what continues', '   ', 'Old bug'), null)
  assert.equal(mergedDescription(null, null, 'Old bug'), null)
})

test('the target description is never replaced, only added to', () => {
  // The guard against the obvious wrong implementation: keeping the source's
  // text and dropping the survivor's.
  const out = mergedDescription('KEEP ME', 'incoming', 'Old bug')
  assert.ok(out?.includes('KEEP ME'), String(out))
})

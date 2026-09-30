import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { fieldIsOnList, fieldsOfList } from './field-scope.ts'

/*
 * `found-30-sep/field-route-takes-another-projects-field` — the list page drew a
 * column, and the AI page a box, for a field scoped to another list of the
 * project: a value the task could not hold, which the server now refuses.
 */
describe('fieldsOfList — the fields a list’s tasks have', () => {
  const fields = [
    { id: 'project-wide', listId: null },
    { id: 'no-list-key' },
    { id: 'this-list', listId: 'L1' },
    { id: 'another-list', listId: 'L2' },
  ]

  it('keeps the project’s fields and this list’s own, and leaves out one scoped to another list', () => {
    assert.deepEqual(fieldsOfList(fields, 'L1').map((f) => f.id), ['project-wide', 'no-list-key', 'this-list'])
    assert.deepEqual(fieldsOfList(fields, 'L2').map((f) => f.id), ['project-wide', 'no-list-key', 'another-list'])
  })

  it('reads a field with no list as the whole project’s, and one with a list as that list’s alone', () => {
    assert.equal(fieldIsOnList({ listId: null }, 'L1'), true)
    assert.equal(fieldIsOnList({}, 'L1'), true)
    assert.equal(fieldIsOnList({ listId: 'L1' }, 'L1'), true)
    assert.equal(fieldIsOnList({ listId: 'L2' }, 'L1'), false)
  })
})

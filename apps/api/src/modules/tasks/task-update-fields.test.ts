import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { TASK_UPDATABLE_FIELDS, pickUpdatable, unknownUpdateFields } from './task-update-fields'

/** What `PATCH /tasks/:id` may write. See task-update-fields.ts for what it used to. */
describe('task-update-fields — the one list the route and the service share', () => {
  it('names the columns an assignee could rewrite, in the order they arrived', () => {
    assert.deepEqual(
      unknownUpdateFields({ title: 'x', listId: 'l', createdById: 'u', completedAt: 'c', statusCategory: 'closed' }),
      ['listId', 'createdById', 'completedAt', 'statusCategory'],
    )
  })

  it('accepts every field the task sheet, the list and the board send', () => {
    assert.deepEqual(unknownUpdateFields(Object.fromEntries(TASK_UPDATABLE_FIELDS.map((k) => [k, null]))), [])
  })

  it('drops anything else, and keeps an explicit null — detaching a parent is a real edit', () => {
    assert.deepEqual(pickUpdatable({ parentTaskId: null, listId: 'l', id: 'x' }), { parentTaskId: null })
  })

  it('reads nothing from a body that is not an object', () => {
    assert.deepEqual(unknownUpdateFields(null), [])
    assert.deepEqual(unknownUpdateFields(42), [])
  })
})

import { NotFoundException } from '@nestjs/common'
import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { CustomFieldsService, fieldIsOnTask } from './custom-fields.service'

/*
 * `found-30-sep/field-route-takes-another-projects-field` — the value route asked
 * that the task and the field were both in the workspace, not that the field was
 * one the task has: a field of another project, or one scoped to another list of
 * the task's own, took a value (200) that no reader shows, since
 * `getValuesForTask` reads the task's own fields.
 */

const WS = '00000000-0000-4000-8000-0000000000aa'
const TASK = '00000000-0000-4000-8000-000000000001'
const ACTOR = '00000000-0000-4000-8000-0000000000ac'

/** A database whose selects answer in order, however they are chained, and which keeps what was written. */
function scriptedDb(selects: unknown[][]) {
  const queue = [...selects]
  const written: Array<{ op: string; arg: unknown }> = []
  const db = {
    select: mock.fn(() => {
      const rows = queue.shift() ?? []
      const q = Promise.resolve(rows) as any
      for (const step of ['from', 'innerJoin', 'leftJoin', 'where', 'orderBy', 'limit']) q[step] = () => q
      return q
    }),
    insert: mock.fn(() => ({
      values: mock.fn((arg: unknown) => {
        written.push({ op: 'insert', arg })
        return { returning: async () => [{ id: 'value-1', ...(arg as object) }] }
      }),
    })),
    update: mock.fn(() => ({
      set: mock.fn((arg: unknown) => {
        written.push({ op: 'update', arg })
        return { where: () => ({ returning: async () => [{ id: 'value-1', ...(arg as object) }] }) }
      }),
    })),
  } as any
  return { db, written }
}

/** The task where it lives (`assertTaskInWorkspace`), in project P1's list L1. */
const TASK_ROW = [{ taskId: TASK, projectId: 'P1', listId: 'L1' }]
const fieldRow = (over: Record<string, unknown>) => [{ id: 'F', projectId: 'P1', listId: null, name: 'Note', type: 'text', options: null, ...over }]

describe('CustomFieldsService.setValue — only a field the task has (found-30-sep/field-route-takes-another-projects-field)', () => {
  it('refuses a value for a field of another project, as a field that is not there, and writes nothing', async () => {
    const { db, written } = scriptedDb([TASK_ROW, fieldRow({ projectId: 'P2' })])
    await assert.rejects(
      new CustomFieldsService(db).setValue(WS, TASK, 'F', 'words', ACTOR),
      (e) => e instanceof NotFoundException && /not found on this task/.test((e as Error).message),
    )
    assert.equal(written.length, 0)
  })

  it('refuses a value for a field scoped to another list of the task’s project, and writes nothing', async () => {
    const { db, written } = scriptedDb([TASK_ROW, fieldRow({ listId: 'L2' })])
    await assert.rejects(
      new CustomFieldsService(db).setValue(WS, TASK, 'F', 'words', ACTOR),
      (e) => e instanceof NotFoundException && /not found on this task/.test((e as Error).message),
    )
    assert.equal(written.length, 0)
  })

  it('refuses a vote on a field of another project before it is cast', async () => {
    const { db, written } = scriptedDb([TASK_ROW, fieldRow({ projectId: 'P2', type: 'voting' }), []])
    await assert.rejects(new CustomFieldsService(db).setValue(WS, TASK, 'F', null, ACTOR), NotFoundException)
    assert.equal(written.length, 0)
  })

  it('takes a value for a field of the task’s own project, and for one scoped to the task’s own list', async () => {
    for (const listId of [null, 'L1']) {
      // The task, the field, then whether the task holds a value for it yet (it does not).
      const { db, written } = scriptedDb([TASK_ROW, fieldRow({ listId }), []])
      await new CustomFieldsService(db).setValue(WS, TASK, 'F', 'words', ACTOR)
      assert.deepEqual(written, [{ op: 'insert', arg: { taskId: TASK, fieldId: 'F', value: { v: 'words' } } }])
    }
  })
})

describe('fieldIsOnTask — the fields a task has', () => {
  const task = { projectId: 'P1', listId: 'L1' }
  it('is its project’s fields with no list and those scoped to its own list, and no other', () => {
    assert.equal(fieldIsOnTask({ projectId: 'P1', listId: null }, task), true)
    assert.equal(fieldIsOnTask({ projectId: 'P1', listId: 'L1' }, task), true)
    assert.equal(fieldIsOnTask({ projectId: 'P1', listId: 'L2' }, task), false)
    assert.equal(fieldIsOnTask({ projectId: 'P2', listId: null }, task), false)
    assert.equal(fieldIsOnTask({ projectId: 'P2', listId: 'L1' }, task), false)
  })
})

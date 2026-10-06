import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { PgDialect } from 'drizzle-orm/pg-core'
import { TasksService } from './tasks.service'

/**
 * `found-30-sep/merge-moves-values-onto-fields-the-target-lacks` — a merge moved
 * every value row of the merged task onto the survivor: a value of a field
 * scoped to another list, and one of another project's field, were stored on
 * the survivor, whose fields, read back, showed neither. Asked of the service's
 * own step, with its database stood in for.
 */

const dialect = new PgDialect()

/** A database whose selects answer in order, however they are chained, and which keeps every update. */
function scriptedDb(selects: unknown[][]) {
  const queue = [...selects]
  const updated: Array<{ set: unknown; params: unknown[] }> = []
  const db: any = {
    select: mock.fn(() => {
      const rows = queue.shift() ?? []
      const q: any = Promise.resolve(rows)
      for (const step of ['from', 'innerJoin', 'leftJoin', 'where', 'orderBy', 'limit']) q[step] = () => q
      return q
    }),
    update: mock.fn(() => ({
      set: (set: unknown) => ({
        where: async (condition: unknown) => {
          updated.push({ set, params: dialect.sqlToQuery(condition as never).params as unknown[] })
          return []
        },
      }),
    })),
  }
  return { db, updated }
}

const service = (db: unknown): any =>
  new TasksService(db as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any)

/** What `moveFieldValues` reads, in order: the merged task's project, the survivor's, the fields it holds values for, and its value rows. */
const script = (mergedIn: string, survivorIn: string, fields: Array<{ id: string; projectId: string; listId: string | null }>) => [
  [{ projectId: mergedIn }],
  [{ projectId: survivorIn }],
  fields,
  fields.map((f) => ({ taskId: 'merged', id: `v-${f.id}`, fieldId: f.id })),
  // Whether the survivor holds a value of its own for a field that would move (it does not).
  ...fields.map(() => []),
]

describe('TasksService.moveFieldValues — a merge moves only the values of fields the survivor has', () => {
  it('moves a value of the survivor’s project’s field, and leaves on the merged task one of a field scoped to another list and one of another project', async () => {
    // The merged task is in P1's side list: it shows Stage and Note; Owner, of P2, is a row it kept from a move.
    const { db, updated } = scriptedDb(script('P1', 'P1', [
      { id: 'f-stage', projectId: 'P1', listId: 'L-side' },
      { id: 'f-note', projectId: 'P1', listId: null },
      { id: 'f-owner', projectId: 'P2', listId: null },
    ]))
    const moved = await service(db).moveFieldValues({ id: 'merged', listId: 'L-side' }, { id: 'survivor', listId: 'L-main' })
    assert.equal(moved, 1)
    assert.deepEqual(updated, [{ set: { taskId: 'survivor' }, params: ['v-f-note'] }])
  })

  it('moves a value of a field scoped to the survivor’s own list', async () => {
    const { db, updated } = scriptedDb(script('P1', 'P1', [{ id: 'f-here', projectId: 'P1', listId: 'L-main' }]))
    assert.equal(await service(db).moveFieldValues({ id: 'merged', listId: 'L-main' }, { id: 'survivor', listId: 'L-main' }), 1)
    assert.deepEqual(updated, [{ set: { taskId: 'survivor' }, params: ['v-f-here'] }])
  })

  it('leaves on the merged task its own project’s field’s value when the survivor is in another project', async () => {
    const { db, updated } = scriptedDb(script('P2', 'P1', [{ id: 'f-owner', projectId: 'P2', listId: null }]))
    assert.equal(await service(db).moveFieldValues({ id: 'merged', listId: 'L-two' }, { id: 'survivor', listId: 'L-main' }), 0)
    assert.deepEqual(updated, [])
  })

  it('leaves on the merged task a value it no longer shows, though the survivor has the field: it moved out of the field’s list', async () => {
    // Stage is the side list's; the merged task is in the main list now, the survivor in the side list.
    const { db, updated } = scriptedDb(script('P1', 'P1', [{ id: 'f-stage', projectId: 'P1', listId: 'L-side' }]))
    assert.equal(await service(db).moveFieldValues({ id: 'merged', listId: 'L-main' }, { id: 'survivor', listId: 'L-side' }), 0)
    assert.deepEqual(updated, [])
  })
})

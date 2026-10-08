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

/**
 * A database whose selects answer in order, however they are chained, and which
 * keeps every update and delete — the condition's parameters, and whether it
 * ran in a transaction.
 *
 * `rows` are the value rows the statements reach, by id, as they are when the
 * statements run (which can differ from what the selects answered: a value
 * written since it was read). A statement that asks for a value finds its row
 * only while the row holds that value, as Postgres reads a condition against
 * the row a write left; one that asks for the id alone finds it whatever it
 * holds; a deleted row is found by nothing. What a statement finds it changes,
 * so `holding` reads where each value ended. A row `rows` does not name is
 * found by any statement and not followed.
 */
function scriptedDb(selects: unknown[][], rows: Record<string, { taskId: string; value: unknown }> = {}) {
  const queue = [...selects]
  const table = new Map(Object.entries(rows).map(([id, row]) => [id, { ...row }]))
  const gone = new Set<string>()
  const updated: Array<{ set: unknown; params: unknown[] }> = []
  const deleted: unknown[][] = []
  /** The statements run inside `db.transaction`. */
  const inTransaction: string[] = []
  const finds = (params: unknown[]) => {
    const [id] = params
    if (typeof id !== 'string') return true
    if (gone.has(id)) return false
    const row = table.get(id)
    if (!row) return true
    const asked = params.slice(1).filter((p) => typeof p === 'string' && p.startsWith('{'))
    return asked.length === 0 || asked.includes(JSON.stringify(row.value))
  }
  /** A statement's answer: awaited, its rows; `.returning()`, the row it found. */
  const answer = (found: boolean, id: unknown) => {
    const q: any = Promise.resolve([])
    q.returning = async () => (found ? [{ id }] : [])
    return q
  }
  const statements = (tx: boolean): any => ({
    select: mock.fn(() => {
      const answered = queue.shift() ?? []
      const q: any = Promise.resolve(answered)
      for (const step of ['from', 'innerJoin', 'leftJoin', 'where', 'orderBy', 'limit']) q[step] = () => q
      return q
    }),
    update: mock.fn(() => ({
      set: (set: any) => ({
        where: (condition: unknown) => {
          const params = dialect.sqlToQuery(condition as never).params as unknown[]
          updated.push({ set, params })
          if (tx) inTransaction.push('update')
          const found = finds(params)
          const row = table.get(params[0] as string)
          if (found && row) Object.assign(row, 'taskId' in set ? { taskId: set.taskId } : { value: set.value })
          return answer(found, params[0])
        },
      }),
    })),
    delete: mock.fn(() => ({
      where: (condition: unknown) => {
        const params = dialect.sqlToQuery(condition as never).params as unknown[]
        deleted.push(params)
        if (tx) inTransaction.push('delete')
        const found = finds(params)
        if (found && table.has(params[0] as string)) {
          table.delete(params[0] as string)
          gone.add(params[0] as string)
        }
        return answer(found, params[0])
      },
    })),
  })
  const db = statements(false)
  db.transaction = async (fn: (tx: unknown) => Promise<unknown>) => fn(statements(true))
  /** The values a task's rows hold now, and the rows' ids. */
  const holding = (taskId: string) =>
    [...table.entries()].filter(([, row]) => row.taskId === taskId).map(([id, row]) => ({ id, value: row.value }))
  return { db, updated, deleted, inTransaction, holding }
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

/**
 * `found-6-oct/merge-drops-a-value-beside-an-emptied-one` — a survivor's Note
 * set and then cleared kept a row `{v: null}`, which the merge took for the
 * survivor's own answer: the merged task's Note stayed in the bin (201, none
 * moved). ClickUp adds the merged task's value "only … if task B doesn't have
 * any information in the same Custom Field" (help centre, "Merge tasks").
 */
describe('TasksService.moveFieldValues — a survivor’s emptied value gives way to the merged task’s', () => {
  /** What the merge reads: the merged task holds `merged` for Note, of the survivor's project; the survivor's own row holds `survivors`. */
  const clash = (merged: unknown, survivors: unknown) => [
    [{ projectId: 'P1' }],
    [{ projectId: 'P1' }],
    [{ id: 'f-note', projectId: 'P1', listId: null }],
    [{ taskId: 'merged', id: 'v-merged', fieldId: 'f-note', value: { v: merged } }],
    [{ taskId: 'survivor', id: 'v-survivors', fieldId: 'f-note', value: { v: survivors } }],
  ]
  /** The two rows as the statements find them: as read, unless `survivorsNow` was written since. */
  const rowsNow = (merged: unknown, survivors: unknown, survivorsNow: unknown = survivors) => ({
    'v-merged': { taskId: 'merged', value: { v: merged } },
    'v-survivors': { taskId: 'survivor', value: { v: survivorsNow } },
  })
  const merge = (db: unknown) => service(db).moveFieldValues({ id: 'merged', listId: 'L-main' }, { id: 'survivor', listId: 'L-main' })
  const json = (v: unknown) => JSON.stringify({ v })
  const values = (held: Array<{ value: unknown }>) => held.map((r) => r.value)

  it('moves the merged task’s value onto the survivor in place of its emptied one: cleared, an empty text, an empty list', async () => {
    for (const emptied of [null, '', []]) {
      const { db, holding } = scriptedDb(clash('from the merged task', emptied), rowsNow('from the merged task', emptied))
      assert.equal(await merge(db), 1, `beside ${JSON.stringify(emptied)}`)
      assert.deepEqual(values(holding('survivor')), [{ v: 'from the merged task' }], `beside ${JSON.stringify(emptied)}`)
      assert.deepEqual(holding('merged'), [], `beside ${JSON.stringify(emptied)}`)
    }
  })

  it('keeps the survivor’s own value that holds something, and an emptied value of the merged task moves nowhere', async () => {
    for (const [merged, survivors] of [['from the merged task', 'the survivor’s own'], [null, null], ['', '']]) {
      const { db, updated, deleted } = scriptedDb(clash(merged, survivors), rowsNow(merged, survivors))
      assert.equal(await merge(db), 0, `${JSON.stringify(merged)} beside ${JSON.stringify(survivors)}`)
      assert.deepEqual(deleted, [])
      assert.deepEqual(updated, [])
    }
  })

  /*
   * The review, measured on lane 7: the survivor's emptied row was deleted by
   * id, having been read empty, and a value written into it in between went
   * with it (the PUT answered 200; no row then held the value).
   */
  it('fills the survivor’s emptied row only while it holds what was read: a value written there since stays, and the merged task’s with it', async () => {
    const typed = 'typed into the survivor since'
    const { db, holding } = scriptedDb(clash('from the merged task', null), rowsNow('from the merged task', null, typed))
    assert.equal(await merge(db), 0)
    assert.deepEqual(values(holding('survivor')), [{ v: typed }])
    assert.deepEqual(values(holding('merged')), [{ v: 'from the merged task' }])
  })

  /*
   * And a value written just after: the survivor's row was deleted and the
   * merged row moved in its place, so a PUT queued behind the delete found no
   * row and wrote nothing (200, lane 7). The survivor's row stays where it is.
   */
  it('never deletes the survivor’s row: it takes the merged value where it is, and the merged task’s row then goes as it was read, the two in one transaction', async () => {
    const { db, deleted, inTransaction, holding } = scriptedDb(clash('from the merged task', ''), rowsNow('from the merged task', ''))
    assert.equal(await merge(db), 1)
    assert.deepEqual(holding('survivor'), [{ id: 'v-survivors', value: { v: 'from the merged task' } }], 'the survivor’s own row, holding the merged value')
    assert.deepEqual(deleted, [['v-merged', json('from the merged task')]], 'only the merged task’s row, as it was read')
    assert.deepEqual(inTransaction, ['update', 'delete'])
  })
})

/**
 * `found-30-sep/merge-moves-values-onto-fields-the-target-lacks` — "Add selected
 * CFs": ClickUp's merge asks whether to add to task B a field task A has and B
 * lacks. A field asked for must be one the merged task holds a value for and
 * the survivor lacks, and a field of its name and type on the survivor takes
 * the value, rather than a copy that would ask for the right to make one.
 */
describe('TasksService.planFieldsToAdd — what a merge may add to the survivor, checked before anything moves', () => {
  const STAGE = '11111111-1111-4111-8111-111111111111'
  const OTHER = '22222222-2222-4222-8222-222222222222'
  const MAINS = '33333333-3333-4333-8333-333333333333'
  const stage = { id: STAGE, projectId: 'P1', listId: 'L-side', name: 'Stage', type: 'text', options: null, config: null }
  const from = { id: 'merged', listId: 'L-side' }
  const to = { id: 'survivor', listId: 'L-main', workspaceId: 'W' }

  it('refuses a field the merged task holds no value for, with one sentence, before reading anything more', async () => {
    const { db } = scriptedDb([[{ projectId: 'P1' }], [{ projectId: 'P1' }], [stage]])
    await assert.rejects(
      service(db).planFieldsToAdd(from, to, [OTHER], 'actor'),
      (err: any) => err?.status === 400 && /^Only a field the merged task holds a value for/.test(err.message),
    )
    assert.equal(db.select.mock.callCount(), 3)
  })

  it('takes a field of the same name and type the survivor has, whatever its case, and asks no rule for making one', async () => {
    const own = [{ id: MAINS, projectId: 'P1', listId: 'L-main', name: ' stage', type: 'text' }]
    const { db } = scriptedDb([[{ projectId: 'P1' }], [{ projectId: 'P1' }], [stage], own])
    const plan = await service(db).planFieldsToAdd(from, to, [STAGE], 'actor')
    assert.deepEqual(plan.map((p: any) => [p.field.id, p.reuse, p.projectId, p.listId]), [[STAGE, MAINS, 'P1', 'L-main']])
    assert.equal(db.select.mock.callCount(), 4)
  })
})

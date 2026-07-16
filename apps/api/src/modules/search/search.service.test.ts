import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getTableName } from 'drizzle-orm'
import { SearchService } from './search.service'

/**
 * Guards the §11.2 "filter by custom-field value" path. Meilisearch is disabled
 * (no host configured), so every search falls through to the Postgres builder.
 *
 * We mock Drizzle with a thenable chain that yields rows keyed by the table
 * passed to `.from(...)` and records every table touched. That lets us assert
 * the *shape* of the query the filter produces — that it joins
 * `custom_field_values`, looks up the definition's type, and drops docs from
 * the result set — without reproducing SQL execution. Real value-narrowing is
 * covered by the runtime Postgres check.
 */
function makeDb(tableRows: Record<string, unknown[]>) {
  const fromTables: string[] = []
  const chain = (): any => {
    let rows: unknown[] = []
    const c: any = {
      from: (t: unknown) => {
        const name = getTableName(t as never)
        fromTables.push(name)
        rows = tableRows[name] ?? []
        return c
      },
      where: () => c,
      innerJoin: () => c,
      leftJoin: () => c,
      orderBy: () => c,
      limit: () => c,
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(rows).then(resolve, reject),
    }
    return c
  }
  const db: any = { select: () => chain() }
  return { db, fromTables }
}

const config: any = { get: () => undefined }

describe('SearchService custom-field value filter (§11.2)', () => {
  it('narrows to tasks matched via custom_field_values and excludes docs', async () => {
    const taskRow = { id: 't1', title: 'Alpha', description: 'body', listId: 'l1', projectId: 'p1', spaceId: 's1' }
    const { db, fromTables } = makeDb({
      custom_field_definitions: [{ type: 'text' }], // definition type lookup
      custom_field_values: [], // subquery source (built, not awaited)
      tasks: [taskRow],
      docs: [{ id: 'd1', title: 'Doc', plaintext: 'x', updatedAt: new Date() }],
    })
    const svc = new SearchService(db, config)

    const res = await svc.search('w1', 'u1', '', 10, { customFieldId: 'f1', customFieldValue: 'foo' })

    // Only the task hit survives — no doc hit.
    assert.equal(res.length, 1)
    assert.equal(res[0].id, 'task-t1')
    assert.equal(res[0].entityType, 'task')
    // The task query joined the custom-field value table and resolved the type.
    assert.ok(fromTables.includes('custom_field_values'), 'joins custom_field_values')
    assert.ok(fromTables.includes('custom_field_definitions'), 'looks up the field type')
    // A task-scoped filter excludes docs entirely.
    assert.ok(!fromTables.includes('docs'), 'docs excluded when the custom-field filter is active')
  })

  it('does not touch custom_field_values when no custom-field filter is set', async () => {
    const { db, fromTables } = makeDb({
      tasks: [],
      docs: [],
    })
    const svc = new SearchService(db, config)

    await svc.search('w1', 'u1', 'alpha', 10, { statusCategory: 'open' })

    assert.ok(!fromTables.includes('custom_field_values'), 'no custom-field join without the filter')
    assert.ok(!fromTables.includes('custom_field_definitions'), 'no definition lookup without the filter')
  })
})

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
  // Tables reached via a join. Recorded separately from `fromTables` so a test
  // can assert an access-scoping join chain (e.g. task_attachments → tasks →
  // list → project → space) that hangs off a single `.from(...)`.
  const joinTables: string[] = []
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
      innerJoin: (t: unknown) => {
        joinTables.push(getTableName(t as never))
        return c
      },
      leftJoin: (t: unknown) => {
        joinTables.push(getTableName(t as never))
        return c
      },
      orderBy: () => c,
      limit: () => c,
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(rows).then(resolve, reject),
    }
    return c
  }
  const db: any = { select: () => chain() }
  return { db, fromTables, joinTables }
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

/**
 * Guards the §11.1 "search across … files" path. Uploaded files surface as a
 * `file` entity type sourced from `task_attachments`. Meilisearch is disabled
 * and R2 is absent (the service is built with two args), so files come solely
 * from the Postgres builder — the branch these tests exercise.
 */
describe('SearchService file search (§11.1 uploaded files)', () => {
  it('returns a matching task attachment grouped under the file type', async () => {
    // The mock returns this row for `.from(task_attachments)` verbatim, so it
    // carries the columns the query projects (the join is asserted separately).
    const attachment = {
      id: 'a1',
      fileName: 'Q3-invoice.pdf',
      contentType: 'application/pdf',
      taskId: 't1',
      listId: 'l1',
      projectId: 'p1',
      spaceId: 's1',
    }
    const { db, fromTables } = makeDb({ task_attachments: [attachment] })
    const svc = new SearchService(db, config)

    const res = await svc.search('w1', 'u1', 'invoice', 10)

    // Exactly the file hit surfaces (tasks/docs/extras are empty in the mock).
    assert.equal(res.length, 1)
    const hit = res[0]
    assert.equal(hit.entityType, 'file')
    assert.equal(hit.id, 'file-a1')
    assert.equal(hit.title, 'Q3-invoice.pdf')
    assert.equal(hit.content, 'application/pdf')
    // Links to the owning task so the file opens in context.
    assert.equal(hit.url, '/app/w1/s1/p1/l1?task=t1')
    assert.ok(fromTables.includes('task_attachments'), 'queries task_attachments')
  })

  it('scopes files to the caller workspace via the task→list→project→space join', async () => {
    // `types: ['file']` isolates the file query: tasks, docs and the extras
    // (users/comments/channels/messages) are all skipped, so every recorded
    // table below belongs to the attachment query alone.
    const { db, fromTables, joinTables } = makeDb({
      // The workspace-scoped join yields no rows — i.e. a file whose task lives
      // in a space in another workspace (a container the caller can't reach).
      task_attachments: [],
    })
    const svc = new SearchService(db, config)

    const res = await svc.search('w1', 'u1', 'secret', 10, { types: ['file'] })

    // No file leaks when the scoped join matches nothing.
    assert.equal(res.filter((h) => h.entityType === 'file').length, 0)
    // The attachment query drives off task_attachments and joins through the
    // full container chain that carries `spaces.workspaceId = <caller>` — the
    // boundary that prevents a file in an inaccessible container from surfacing.
    assert.ok(fromTables.includes('task_attachments'), 'drives off task_attachments')
    assert.ok(joinTables.includes('tasks'), 'joins tasks')
    assert.ok(joinTables.includes('lists'), 'joins lists')
    assert.ok(joinTables.includes('projects'), 'joins projects')
    assert.ok(joinTables.includes('spaces'), 'joins spaces (the workspace boundary)')
    // Isolation check: only the file query ran (no docs / chat-extras tables).
    assert.ok(!fromTables.includes('docs'), 'docs not queried for a file-only search')
    assert.ok(!fromTables.includes('chat_channel_members'), 'chat extras not queried')
  })
})

describe('SearchService.merge', () => {
  // Reaches the private helper directly: it is pure, and the alternative is
  // standing up Meilisearch plus five Postgres branches to assert one slice.
  const merge = (svc: any, sort: any, limit: number, hits: any[]) =>
    (svc as any).merge(sort, limit, hits)
  const svc = Object.create(SearchService.prototype)

  const hit = (id: string, at: string | null) => ({
    id, entityType: 'task', title: id, content: '', url: '', sortedAt: at,
  })

  it('cuts the merged set to the caller\'s limit', () => {
    // Each branch of the search limits its own query, so the concatenation can
    // exceed what was asked for. In production the same query returned 5 hits
    // by relevance and 16 by date for exactly this reason.
    const many = Array.from({ length: 16 }, (_, i) => hit(`t${i}`, null))
    assert.equal(merge(svc, 'relevance', 10, many).length, 10)
    assert.equal(merge(svc, 'updated', 10, many).length, 10)
    assert.equal(merge(svc, 'created', 10, many).length, 10)
  })

  it('returns the same number of hits whatever the sort is', () => {
    const mixed = [
      hit('a', '2026-01-03T00:00:00Z'),
      hit('b', null),
      hit('c', '2026-01-01T00:00:00Z'),
      hit('d', '2026-01-02T00:00:00Z'),
    ]
    const counts = (['relevance', 'updated', 'created'] as const)
      .map((s) => merge(svc, s, 3, mixed).length)
    assert.deepEqual(counts, [3, 3, 3], 'changing the order changed what was in the list')
  })

  it('cuts after sorting, so a limited result is the real top N', () => {
    const hits = [
      hit('oldest', '2026-01-01T00:00:00Z'),
      hit('newest', '2026-03-01T00:00:00Z'),
      hit('middle', '2026-02-01T00:00:00Z'),
    ]
    // Slicing first would keep [oldest, newest] and call it the top 2.
    assert.deepEqual(
      merge(svc, 'updated', 2, hits).map((h: any) => h.id),
      ['newest', 'middle'],
    )
  })

  it('leaves undated hits at the end rather than treating them as oldest', () => {
    const hits = [hit('undated', null), hit('dated', '2026-01-01T00:00:00Z')]
    assert.deepEqual(merge(svc, 'updated', 2, hits).map((h: any) => h.id), ['dated', 'undated'])
  })

  it('does not reorder a relevance search', () => {
    const hits = [hit('first', null), hit('second', '2026-05-05T00:00:00Z')]
    assert.deepEqual(merge(svc, 'relevance', 5, hits).map((h: any) => h.id), ['first', 'second'])
  })
})

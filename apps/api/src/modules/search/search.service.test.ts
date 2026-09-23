import assert from 'node:assert/strict'
import { DRIVE_SEARCH_SCOPE } from './drive-scope'
import { describe, it } from 'node:test'
import { getTableName } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { SearchService, meiliSort } from './search.service'

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
  // Every WHERE predicate, paired with the table it was built against, so a
  // test can render one to SQL and assert what it actually constrains. Recording
  // only table names cannot tell a scoped query from an unscoped one.
  const wheres: Array<{ table: string; condition: unknown }> = []
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
      where: (condition: unknown) => {
        wheres.push({ table: fromTables[fromTables.length - 1] ?? '?', condition })
        return c
      },
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
  return { db, fromTables, joinTables, wheres }
}

/** Render a captured predicate to real SQL, so assertions read the query. */
const dialect = new PgDialect()
function sqlFor(
  wheres: Array<{ table: string; condition: unknown }>,
  table: string,
): { sql: string; params: unknown[] } | null {
  const hit = wheres.find((w) => w.table === table)
  if (!hit || hit.condition == null) return null
  const q = dialect.sqlToQuery(hit.condition as never)
  return { sql: q.sql, params: q.params as unknown[] }
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

describe('meiliSort', () => {
  // Exported indirectly through the module so the mapping is pinned: getting a
  // field name wrong here means Meili silently ignores the sort and returns
  // relevance order under a "last updated" label.
  it('maps each timestamp mode to the indexed attribute', () => {
    assert.deepEqual(meiliSort('updated'), ['updatedAt:desc'])
    assert.deepEqual(meiliSort('created'), ['createdAt:desc'])
  })

  it('asks for no sort on a relevance search, so Meili ranks by score', () => {
    assert.equal(meiliSort('relevance'), undefined)
    assert.equal(meiliSort(undefined), undefined)
  })
})

/**
 * §2 — the search bar she walked through, [00:44]–[04:32].
 *
 * Three things she named were missing outright. Each is checked here for what
 * it returns *and* for what it must not: a search that quietly widens is worse
 * than one that errors, because the extra rows look like results.
 */
describe('§2 search: the containers, Location, and created dates', () => {
  const containers = () =>
    makeDb({
      tasks: [],
      docs: [],
      // The container rows searchExtras projects.
      folders: [{ id: 'f1', name: 'Brand assets', spaceId: 's1', spaceName: 'Marketing' }],
      lists: [{ id: 'l1', name: 'Backlog', projectId: 'p1', spaceId: 's1', projectName: 'Q3 launch' }],
      spaces: [{ id: 's1', name: 'Marketing' }],
      users: [],
      task_comments: [],
      chat_channels: [],
      chat_channel_members: [],
      chat_messages: [],
    })

  it('finds a folder by name — "mujhe FOLDERS mein search karna hai" [02:03]', async () => {
    const { db } = containers()
    const res = await new SearchService(db, config).search('w1', 'u1', 'brand', 10, {
      types: ['folder'],
    })
    const folder = res.find((h) => h.entityType === 'folder')
    assert.ok(folder, `no folder hit: ${JSON.stringify(res)}`)
    assert.equal(folder.title, 'Brand assets')
    // Says which space it is in — "Brand assets" alone does not locate it.
    assert.equal(folder.content, 'Marketing')
  })

  it('finds lists and spaces too, each linking to itself', async () => {
    const { db } = containers()
    const res = await new SearchService(db, config).search('w1', 'u1', 'a', 10, {
      types: ['list', 'space'],
    })
    const list = res.find((h) => h.entityType === 'list')
    const space = res.find((h) => h.entityType === 'space')
    assert.ok(list && space, `missing container hits: ${JSON.stringify(res)}`)
    assert.match(list.url, /\/s1\/p1\/l1$/, `a list must open itself: ${list.url}`)
    assert.match(space.url, /\/s1$/, `a space must open itself: ${space.url}`)
  })

  it('keeps a private folder away from someone who cannot open it', async () => {
    // The whole point of scoping: search must not be the one surface where a
    // container you have no access to is still discoverable by name.
    const { db, wheres } = containers()
    await new SearchService(db, config).search('w1', 'u1', 'brand', 10, { types: ['folder'] })
    const q = sqlFor(wheres, 'folders')
    assert.ok(q, 'no predicate captured for the folder query')
    assert.match(
      q.sql,
      /"visibility"/,
      `the folder search is not visibility-scoped: ${q.sql}`,
    )
  })

  it('scopes the list search the same way', async () => {
    const { db, wheres } = containers()
    await new SearchService(db, config).search('w1', 'u1', 'back', 10, { types: ['list'] })
    const q = sqlFor(wheres, 'lists')
    assert.ok(q, 'no predicate captured for the list query')
    assert.match(q.sql, /"visibility"/, `the list search is not visibility-scoped: ${q.sql}`)
  })

  /*
   * The trap these two pin. Meilisearch indexes none of the structured filters,
   * so a search carrying one has to take the Postgres path — `hasTaskFilter` is
   * what routes it there. A filter left out of that list does not error: it goes
   * to Meili, which ignores it, and the search answers as though you had never
   * filtered. Docs being excluded is the observable side of that routing, so
   * these fail the moment someone drops the filter from the list.
   */
  it('a Location-only search takes the filtered path [02:35]', async () => {
    const { db, fromTables } = makeDb({ tasks: [], docs: [] })
    await new SearchService(db, config).search('w1', 'u1', 'alpha', 10, { spaceId: 's1' })
    assert.ok(
      !fromTables.includes('docs'),
      'docs were searched, so the location filter never reached the query builder',
    )
  })

  it('a created-date search takes the filtered path [04:00]', async () => {
    const { db, fromTables } = makeDb({ tasks: [], docs: [] })
    await new SearchService(db, config).search('w1', 'u1', 'alpha', 10, {
      createdAfter: new Date('2026-01-01T00:00:00Z'),
    })
    assert.ok(
      !fromTables.includes('docs'),
      'docs were searched, so the created-date filter never reached the query builder',
    )
  })

  it('constrains on created_at, not due_date', async () => {
    // These are different questions — when a thing was made versus when it is
    // owed — and the columns are one word apart.
    const { db, wheres } = makeDb({ tasks: [], docs: [] })
    await new SearchService(db, config).search('w1', 'u1', 'alpha', 10, {
      createdAfter: new Date('2026-01-01T00:00:00Z'),
      createdBefore: new Date('2026-02-01T00:00:00Z'),
    })
    const q = sqlFor(wheres, 'tasks')
    assert.ok(q, 'no predicate captured for the task query')
    assert.match(q.sql, /"created_at" >=/, `no lower bound on created_at: ${q.sql}`)
    assert.match(q.sql, /"created_at" <=/, `no upper bound on created_at: ${q.sql}`)
    assert.ok(!/"due_date"/.test(q.sql), `constrained the wrong column: ${q.sql}`)
  })

  it('narrows by list and by space when Location names one', async () => {
    const { db, wheres } = makeDb({ tasks: [], docs: [] })
    await new SearchService(db, config).search('w1', 'u1', 'alpha', 10, {
      spaceId: 'space-1',
      listId: 'list-1',
    })
    const q = sqlFor(wheres, 'tasks')
    assert.ok(q, 'no predicate captured')
    assert.ok(q.params.includes('list-1'), `list not bound: ${q.sql} ${JSON.stringify(q.params)}`)
    assert.ok(q.params.includes('space-1'), `space not bound: ${q.sql} ${JSON.stringify(q.params)}`)
  })

  it('narrows to a folder — the level between the two she named [02:35]', async () => {
    /*
     * The frame-by-frame pass reads Location as "a space, folder or list"; the
     * transcript only says "kis space mein para hai, ya kis list mein para
     * hai". Folders are the level in between, and they became searchable in
     * their own right, so being unable to scope *to* one was the half left
     * undone. A task reaches its folder through list → project → folderId.
     */
    const { db, wheres } = makeDb({ tasks: [], docs: [] })
    await new SearchService(db, config).search('w1', 'u1', 'alpha', 10, { folderId: 'folder-1' })
    const q = sqlFor(wheres, 'tasks')
    assert.ok(q, 'no predicate captured')
    assert.match(q.sql, /"folder_id" =/, `not scoped by folder: ${q.sql}`)
    assert.ok(q.params.includes('folder-1'), `folder not bound: ${JSON.stringify(q.params)}`)
  })

  it('a folder-only search takes the filtered path', async () => {
    // Same trap as spaceId and createdAfter: absent from hasTaskFilter, it
    // routes to Meili, which ignores it, and the search answers unfiltered.
    const { db, fromTables } = makeDb({ tasks: [], docs: [] })
    await new SearchService(db, config).search('w1', 'u1', 'alpha', 10, { folderId: 'f1' })
    assert.ok(
      !fromTables.includes('docs'),
      'docs were searched, so the folder filter never reached the query builder',
    )
  })

  it('offers every container type the API will accept', async () => {
    // A type the service can return but the controller rejects is a filter that
    // silently does nothing — the §1.1 bug, in a different place.
    const { ENTITY_TYPES } = await import('./entity-types')
    for (const t of ['folder', 'list', 'space']) {
      assert.ok(ENTITY_TYPES.includes(t as never), `${t} is not accepted by the controller`)
    }
  })
})

/**
 * §4 [04:20] — "Agar hum Google Drive se search karenge to woh humari Google
 * Drive se bhi cheezein dhoond ke mila ke de sakta hai."
 *
 * The OAuth provider and token storage already existed; nothing searched. The
 * interesting cases are the ones where Drive is not available, because an
 * integration being down must never take the whole search down with it — a
 * search that throws because Google timed out is worse than one that quietly
 * returns the local results.
 */
describe('§4 Google Drive in search', () => {
  const connected = {
    // Seeded with the scope a real connection now carries. Without it
    // `searchDrive` correctly refuses to send an account-wide query, because
    // `drive.file` cannot answer one — see drive-scope.ts.
    workspace_integration_connections: [
      // Connected by u1, who is the searcher in every case but the one
      // that asks what somebody else sees.
      { status: 'connected', accessToken: 'tok', scopes: [DRIVE_SEARCH_SCOPE], connectedById: 'u1' },
    ],
    tasks: [],
    docs: [],
  }

  /**
   * A SearchService whose one Drive call is answered locally.
   *
   * Overriding the method rather than stubbing fetch is forced, not stylistic:
   * safeFetch issues through node:http (no global to replace) and its SSRF
   * guard rejects loopback, so a local server is not an option either. A first
   * attempt here stubbed globalThis.fetch and intercepted nothing — the tests
   * failed rather than passing hollow, which is the only reason it was caught.
   */
  class FakeDrive extends SearchService {
    seen: string[] = []
    constructor(
      db: never,
      private reply: { status: number; files: unknown[] } | 'throw',
    ) {
      super(db, config)
    }
    protected override async driveRequest(url: string) {
      this.seen.push(url)
      if (this.reply === 'throw') throw new Error('getaddrinfo ENOTFOUND')
      return { status: this.reply.status, text: JSON.stringify({ files: this.reply.files }) }
    }
  }
  const drive = (db: unknown, files: unknown[], status = 200) =>
    new FakeDrive(db as never, { status, files })

  it('returns Drive files as their own kind, linking out to Drive', async () => {
    const { db } = makeDb(connected)
    const svc = drive(db, [
      { id: 'F1', name: 'Q3 budget.xlsx', webViewLink: 'https://drive.google.com/file/d/F1/view' },
    ])
    const res = await svc.search('w1', 'u1', 'budget', 10, { types: ['drive'] })
    const hit = res.find((h) => h.entityType === 'drive')
    assert.ok(hit, `no drive hit: ${JSON.stringify(res)}`)
    assert.equal(hit.title, 'Q3 budget.xlsx')
    assert.match(hit.url, /^https:\/\/drive\.google\.com\//, 'a Drive file opens in Drive')
    // Says where it came from — a result that leaves the product should admit it.
    assert.equal(hit.content, 'Google Drive')
  })

  it('escapes the term, so an apostrophe cannot rewrite the Drive query', async () => {
    // Drive's `q` is a query language and the term is interpolated into a
    // quoted string inside it. "Ali's notes" would otherwise close that string
    // early and change what was asked.
    const { db } = makeDb(connected)
    const svc = drive(db, [])
    await svc.search('w1', 'u1', "Ali's notes", 10, { types: ['drive'] })
    assert.equal(svc.seen.length, 1, 'Drive was not called')
    const q = decodeURIComponent(new URL(svc.seen[0]).searchParams.get('q') ?? '')
    assert.ok(q.includes("Ali\\'s notes"), `apostrophe not escaped: ${q}`)
    assert.ok(q.includes('trashed = false'), `deleted files should stay deleted: ${q}`)
  })

  it('searches the connected Drive for the person who connected it, and for nobody else', async () => {
    // The grant is one person's own Drive. Every member used to search it.
    const { db } = makeDb(connected)
    const svc = drive(db, [{ id: 'F1', name: 'Q3 budget.xlsx', webViewLink: 'https://drive.google.com/file/d/F1/view' }])
    const theirs = await svc.search('w1', 'u2', 'budget', 10, { types: ['drive'] })
    assert.equal(svc.seen.length, 0, 'searched u1’s Drive for u2')
    assert.equal(theirs.filter((h) => h.entityType === 'drive').length, 0)
    const own = await svc.search('w1', 'u1', 'budget', 10, { types: ['drive'] })
    assert.equal(own.filter((h) => h.entityType === 'drive').length, 1, 'the connector lost their own Drive')
  })

  it('asks Drive for nothing when no Drive is linked', async () => {
    const { db } = makeDb({ workspace_integration_connections: [], tasks: [], docs: [] })
    const svc = drive(db, [])
    const res = await svc.search('w1', 'u1', 'budget', 10, { types: ['drive'] })
    assert.equal(svc.seen.length, 0, 'called Drive without a connection')
    assert.equal(res.length, 0)
  })

  it('ignores a connection that is not connected', async () => {
    const { db } = makeDb({
      workspace_integration_connections: [{ status: 'revoked', accessToken: 'tok', connectedById: 'u1' }],
      tasks: [],
      docs: [],
    })
    const svc = drive(db, [])
    await svc.search('w1', 'u1', 'budget', 10, { types: ['drive'] })
    assert.equal(svc.seen.length, 0, 'used a token from a revoked connection')
  })

  it('does not query Drive on a grant that cannot answer the query', async () => {
    /*
     * §G03 — a connection made before the scope change holds `drive.file`,
     * which returns only files this app created or the user picked by hand.
     * The query is account-wide, so Drive answers "nothing" and the empty
     * section reads as "you have no matching files" — a false statement about
     * somebody's own Drive.
     *
     * Asserted as "no request was sent", not "no results came back": the
     * failure being prevented is a round trip that cannot succeed and says
     * nothing about why.
     */
    const { db } = makeDb({
      workspace_integration_connections: [
        { status: 'connected', accessToken: 'tok', scopes: ['https://www.googleapis.com/auth/drive.file'], connectedById: 'u1' },
      ],
      tasks: [],
      docs: [],
    })
    const svc = drive(db, [])
    const res = await svc.search('w1', 'u1', 'budget', 10, { types: ['drive'] })
    assert.equal(svc.seen.length, 0, 'sent an account-wide query on a drive.file grant')
    assert.equal(res.length, 0)
  })

  it('survives Drive being down, and still answers', async () => {
    const { db } = makeDb({ ...connected, tasks: [] })
    const svc = new FakeDrive(db as never, 'throw')
    const res = await svc.search('w1', 'u1', 'budget', 10, { types: ['drive'] })
    assert.deepEqual(res, [], 'a broken integration must not throw out of search')
  })

  it('survives Drive answering with an error status', async () => {
    const { db } = makeDb(connected)
    const svc = drive(db, [{ id: 'F1', name: 'leaked' }], 403)
    const res = await svc.search('w1', 'u1', 'budget', 10, { types: ['drive'] })
    assert.deepEqual(res, [], 'a 403 body must not be read as results')
  })

  it('is offered by the controller', async () => {
    const { ENTITY_TYPES } = await import('./entity-types')
    assert.ok(ENTITY_TYPES.includes('drive' as never), 'drive is not an accepted type')
  })
})

/**
 * The bug this guards, in one sentence: Meili applies its limit before anything
 * in this process can drop a hit, and the rules that drop one — archived, and
 * per-caller visibility — live in Postgres.
 *
 * So filtering a single page throws hits away without replacing them. Where the
 * first page is entirely made of hits the caller may not see, the search
 * answered "nothing" while live, visible matches sat further down the ranking.
 * Production returned no tasks at all for "a" while ten live ones matched.
 *
 * Binning a task now removes its document, which stops archived work causing
 * this. Visibility cannot be fixed that way — it is per caller and the index
 * has no such field — so paging is what protects it, and this is where that is
 * checked: a fake index gives exact control over which page a hit lands on.
 */
describe('SearchService pages Meili past hits the caller cannot see', () => {
  /** An index of `total` task docs; only `visibleIds` survive the DB filter. */
  const fakeIndex = (total: number) => {
    const calls: Array<{ offset: number; limit: number }> = []
    const docs = Array.from({ length: total }, (_, i) => ({
      id: `task-t${i}`,
      entityType: 'task',
      title: `probe ${i}`,
      content: '',
      url: `/t${i}`,
      createdAt: 1_700_000_000_000 - i,
      updatedAt: 1_700_000_000_000 - i,
    }))
    const index = {
      search: async (_q: string, opts: { limit: number; offset?: number }) => {
        const offset = opts.offset ?? 0
        calls.push({ offset, limit: opts.limit })
        return { hits: docs.slice(offset, offset + opts.limit) }
      },
    }
    return { index, calls }
  }

  /** A service wired to a fake index, with `keep` the rows the DB hands back. */
  const svcWith = (index: unknown, keep: Array<{ id: string }>) => {
    const { db } = makeDb({
      tasks: keep,
      docs: [], users: [], task_comments: [],
      chat_channels: [], chat_channel_members: [], chat_messages: [],
      folders: [], lists: [], spaces: [],
    })
    const svc = new SearchService(db as never, config)
    Object.assign(svc as never, { enabled: true, index })
    return svc
  }

  it('finds a visible task that ranks below the first page', async () => {
    // 46 docs: the only one the caller may see is last, at index 45 — beyond
    // the 40 the first page fetches, and far beyond a limit of 5.
    const { index, calls } = fakeIndex(46)
    const res = await svcWith(index, [{ id: 't45' }]).search('w1', 'u1', 'probe', 5, {})

    assert.equal(res.length, 1, `the visible task was lost: ${JSON.stringify(res)}`)
    assert.equal(res[0].id, 'task-t45')
    assert.ok(calls.length > 1, 'it never paged — one page cannot reach doc 45')
    assert.equal(calls[0].offset, 0, `first page must start at 0, got ${calls[0].offset}`)
  })

  it('stops at the scan cap rather than walking an unbounded index', async () => {
    // Nothing is visible, so it can only stop by giving up. A search must not
    // turn into a full scan of a large index.
    const { index, calls } = fakeIndex(100_000)
    const res = await svcWith(index, []).search('w1', 'u1', 'probe', 5, {})

    assert.deepEqual(res, [], 'nothing was visible, so nothing may come back')
    const scanned = calls.reduce((n, c) => n + c.limit, 0)
    assert.ok(scanned <= 500, `scanned ${scanned} documents; the cap is 500`)
  })

  it('asks for one page only when the first page already answers', async () => {
    // The ordinary case must not pay for the pathological one.
    const { index, calls } = fakeIndex(46)
    const res = await svcWith(index, Array.from({ length: 40 }, (_, i) => ({ id: `t${i}` })))
      .search('w1', 'u1', 'probe', 5, {})

    assert.equal(res.length, 5, 'a limit of 5 must return 5')
    assert.equal(calls.length, 1, `one page should have sufficed, made ${calls.length} calls`)
  })

  it('does not return the same task twice when pages overlap', async () => {
    // Meili paginates a live index, so a document can shift and be served on
    // two pages. A search must never show one task under two headings.
    const { index } = fakeIndex(46)
    const overlapping = {
      search: async (q: string, opts: { limit: number; offset?: number }) =>
        // Every page starts from 0, so page 2 repeats page 1 entirely.
        index.search(q, { ...opts, offset: 0 }),
    }
    const res = await svcWith(overlapping, [{ id: 't0' }]).search('w1', 'u1', 'probe', 5, {})
    assert.equal(res.length, 1, `a repeated document was returned twice: ${JSON.stringify(res)}`)
  })
})

/**
 * §V2-11 frame `19:07` — the two federated sources that had a tab and no query.
 *
 * `gmail` and `sharepoint` were named in `SEARCH_SOURCES`, drawn as tabs in the
 * command palette, and reached no code at all. These tests are the only place
 * either query can be exercised: both need an OAuth credential no test
 * environment holds, so the e2e suite stops at the credential and this one goes
 * past it through the `federatedRequest` seam.
 *
 * What is checked is the part that is easy to get wrong and impossible to see:
 * the QUERY. Gmail's `q` and Graph's KQL are both languages, and a term a
 * person typed goes straight into each — so `from:boss` has to be searched for
 * rather than obeyed. And a grant that cannot answer must cost no round trip,
 * because a request that is guaranteed to come back empty teaches a person that
 * their mailbox is empty.
 */
describe('§V2-11 Gmail and SharePoint in search', () => {
  const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'
  const SITES_SCOPE = 'Sites.Read.All'

  /** A service whose one outbound call is answered locally, per URL. */
  class FakeFederated extends SearchService {
    seen: Array<{ url: string; body?: string }> = []
    constructor(
      db: never,
      private readonly reply: (url: string) => { status: number; body: unknown },
    ) {
      super(db, config)
    }
    protected override async federatedRequest(
      url: string,
      _token: string,
      init?: { method?: string; body?: string },
    ) {
      this.seen.push({ url, body: init?.body })
      const { status, body } = this.reply(url)
      return { status, text: JSON.stringify(body) }
    }
  }

  const withGrant = (provider: string, scopes: string[]) => ({
    workspace_integration_connections: [
      { provider, status: 'connected', accessToken: 'tok', scopes, connectedById: 'u1' },
    ],
    tasks: [],
    docs: [],
  })

  it('returns Gmail messages as their own kind, linking out to Gmail', async () => {
    const { db } = makeDb(withGrant('gmail', [GMAIL_SCOPE]))
    const svc = new FakeFederated(db as never, (url) =>
      url.includes('/messages/')
        ? {
            status: 200,
            body: {
              id: 'M1',
              snippet: 'the numbers for Q3',
              internalDate: '1700000000000',
              payload: { headers: [{ name: 'Subject', value: 'Q3 budget' }] },
            },
          }
        : { status: 200, body: { messages: [{ id: 'M1' }] } },
    )
    const res = await svc.search('w1', 'u1', 'budget', 10, { types: ['gmail'] })
    const hit = res.find((h) => h.entityType === 'gmail')
    assert.ok(hit, `no gmail hit: ${JSON.stringify(res)}`)
    assert.equal(hit.title, 'Q3 budget')
    assert.match(hit.url, /^https:\/\/mail\.google\.com\//, 'a mail opens in Gmail')
  })

  it('reads nobody’s mail but the searcher’s own', async () => {
    // §V2-11 — "meri Gmail": MY Gmail. The connection is one mailbox.
    const { db } = makeDb(withGrant('gmail', [GMAIL_SCOPE]))
    const svc = new FakeFederated(db as never, () => ({ status: 200, body: { messages: [{ id: 'M1' }] } }))
    const res = await svc.search('w1', 'u2', 'budget', 10, { types: ['gmail'] })
    assert.equal(svc.seen.length, 0, 'searched u1’s mailbox for u2')
    assert.equal(res.filter((h) => h.entityType === 'gmail').length, 0)
  })

  it('lists a source as the searcher’s own, somebody else’s, or not connected', async () => {
    const { db } = makeDb(withGrant('gmail', [GMAIL_SCOPE]))
    const svc = new SearchService(db as never, config)
    const mine = (await svc.listSources('w1', 'u1')).find((x) => x.id === 'gmail')
    const theirs = (await svc.listSources('w1', 'u2')).find((x) => x.id === 'gmail')
    const none = (await svc.listSources('w1', 'u1')).find((x) => x.id === 'sharepoint')
    assert.deepEqual([mine?.connected, mine?.heldBy], [true, 'you'])
    assert.deepEqual([theirs?.connected, theirs?.heldBy], [false, 'someone-else'])
    assert.deepEqual([none?.connected, none?.heldBy], [false, null])
  })

  it('names a subject-less mail by its sender rather than dropping it', async () => {
    // Dropping it would be another silent empty list, on a message that exists.
    const { db } = makeDb(withGrant('gmail', [GMAIL_SCOPE]))
    const svc = new FakeFederated(db as never, (url) =>
      url.includes('/messages/')
        ? {
            status: 200,
            body: {
              id: 'M2',
              payload: { headers: [{ name: 'From', value: 'ali@example.com' }] },
            },
          }
        : { status: 200, body: { messages: [{ id: 'M2' }] } },
    )
    const res = await svc.search('w1', 'u1', 'budget', 10, { types: ['gmail'] })
    const hit = res.find((h) => h.entityType === 'gmail')
    assert.ok(hit, `no gmail hit: ${JSON.stringify(res)}`)
    assert.match(hit.title, /ali@example\.com/, `subject-less mail read ${JSON.stringify(hit.title)}`)
  })

  it('searches for the words rather than obeying them', async () => {
    /*
     * `from:`, `-word` and `OR` are Gmail operators. Unquoted, "from:boss"
     * silently becomes a different search — one that answers confidently and
     * about something else.
     */
    const { db } = makeDb(withGrant('gmail', [GMAIL_SCOPE]))
    const svc = new FakeFederated(db as never, () => ({ status: 200, body: { messages: [] } }))
    await svc.search('w1', 'u1', 'from:boss', 10, { types: ['gmail'] })
    assert.equal(svc.seen.length, 1, 'Gmail was not called exactly once')
    const q = new URL(svc.seen[0].url).searchParams.get('q') ?? ''
    assert.equal(q, '"from:boss"', `the term was not quoted as a phrase: ${JSON.stringify(q)}`)
  })

  it('asks Gmail for nothing on a grant that cannot read mail', async () => {
    /*
     * Asserted as "no request was sent", not "no results came back": the thing
     * being prevented is a round trip that cannot succeed and explains nothing.
     */
    const { db } = makeDb(withGrant('gmail', ['https://www.googleapis.com/auth/drive.readonly']))
    const svc = new FakeFederated(db as never, () => ({ status: 200, body: { messages: [] } }))
    const res = await svc.search('w1', 'u1', 'budget', 10, { types: ['gmail'] })
    assert.equal(svc.seen.length, 0, 'queried Gmail with a Drive grant')
    assert.equal(res.length, 0)
  })

  it('returns SharePoint files as their own kind, from the Graph search endpoint', async () => {
    const { db } = makeDb(withGrant('sharepoint', [SITES_SCOPE]))
    const svc = new FakeFederated(db as never, () => ({
      status: 200,
      body: {
        value: [
          {
            hitsContainers: [
              {
                hits: [
                  {
                    resource: {
                      id: 'S1',
                      name: 'Q3 plan.docx',
                      webUrl: 'https://contoso.sharepoint.com/sites/x/Q3%20plan.docx',
                      lastModifiedDateTime: '2026-08-01T10:00:00Z',
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    }))
    const res = await svc.search('w1', 'u1', 'plan', 10, { types: ['sharepoint'] })
    const hit = res.find((h) => h.entityType === 'sharepoint')
    assert.ok(hit, `no sharepoint hit: ${JSON.stringify(res)}`)
    assert.equal(hit.title, 'Q3 plan.docx')
    assert.match(hit.url, /contoso\.sharepoint\.com/, 'a SharePoint file opens in SharePoint')
    // The term travels in a JSON body, not interpolated into a URL: Graph's KQL
    // treats `:` and `"` as syntax.
    assert.equal(svc.seen.length, 1, 'Graph was not called exactly once')
    assert.ok(svc.seen[0].body?.includes('"queryString":"plan"'), `body was ${svc.seen[0].body}`)
  })

  it('asks SharePoint for nothing on the OneDrive file grant it used to borrow', async () => {
    /*
     * THE CONFIDENT ZERO THIS ROW WAS OPENED OVER. `Files.ReadWrite` reaches
     * the signed-in user's own drive and no SharePoint site, so the borrowed
     * credential connected successfully and answered "nothing" forever.
     */
    const { db } = makeDb(withGrant('sharepoint', ['Files.ReadWrite']))
    const svc = new FakeFederated(db as never, () => ({ status: 200, body: { value: [] } }))
    const res = await svc.search('w1', 'u1', 'plan', 10, { types: ['sharepoint'] })
    assert.equal(svc.seen.length, 0, 'queried Graph with a grant that cannot see a site')
    assert.equal(res.length, 0)
  })

  it('accepts both names as ?types= values, so the tab is not silently dropped', async () => {
    /*
     * The whitelist drops what it does not recognise, and `filters.types` is
     * only assigned when something survives it — so a missing name is not a
     * missing filter, it is an UNFILTERED search wearing the tab's name.
     */
    const { ENTITY_TYPES } = await import('./entity-types')
    for (const type of ['drive', 'gmail', 'sharepoint']) {
      assert.ok(ENTITY_TYPES.includes(type as never), `${type} is not accepted by the controller`)
    }
  })
})

"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const drive_scope_1 = require("./drive-scope");
const node_test_1 = require("node:test");
const drizzle_orm_1 = require("drizzle-orm");
const pg_core_1 = require("drizzle-orm/pg-core");
const search_service_1 = require("./search.service");
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
function makeDb(tableRows) {
    const fromTables = [];
    // Every WHERE predicate, paired with the table it was built against, so a
    // test can render one to SQL and assert what it actually constrains. Recording
    // only table names cannot tell a scoped query from an unscoped one.
    const wheres = [];
    // Tables reached via a join. Recorded separately from `fromTables` so a test
    // can assert an access-scoping join chain (e.g. task_attachments → tasks →
    // list → project → space) that hangs off a single `.from(...)`.
    const joinTables = [];
    const chain = () => {
        let rows = [];
        const c = {
            from: (t) => {
                const name = (0, drizzle_orm_1.getTableName)(t);
                fromTables.push(name);
                rows = tableRows[name] ?? [];
                return c;
            },
            where: (condition) => {
                wheres.push({ table: fromTables[fromTables.length - 1] ?? '?', condition });
                return c;
            },
            innerJoin: (t) => {
                joinTables.push((0, drizzle_orm_1.getTableName)(t));
                return c;
            },
            leftJoin: (t) => {
                joinTables.push((0, drizzle_orm_1.getTableName)(t));
                return c;
            },
            orderBy: () => c,
            limit: () => c,
            then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject),
        };
        return c;
    };
    const db = { select: () => chain() };
    return { db, fromTables, joinTables, wheres };
}
/** Render a captured predicate to real SQL, so assertions read the query. */
const dialect = new pg_core_1.PgDialect();
function sqlFor(wheres, table) {
    const hit = wheres.find((w) => w.table === table);
    if (!hit || hit.condition == null)
        return null;
    const q = dialect.sqlToQuery(hit.condition);
    return { sql: q.sql, params: q.params };
}
const config = { get: () => undefined };
(0, node_test_1.describe)('SearchService custom-field value filter (§11.2)', () => {
    (0, node_test_1.it)('narrows to tasks matched via custom_field_values and excludes docs', async () => {
        const taskRow = { id: 't1', title: 'Alpha', description: 'body', listId: 'l1', projectId: 'p1', spaceId: 's1' };
        const { db, fromTables } = makeDb({
            custom_field_definitions: [{ type: 'text' }], // definition type lookup
            custom_field_values: [], // subquery source (built, not awaited)
            tasks: [taskRow],
            docs: [{ id: 'd1', title: 'Doc', plaintext: 'x', updatedAt: new Date() }],
        });
        const svc = new search_service_1.SearchService(db, config);
        const res = await svc.search('w1', 'u1', '', 10, { customFieldId: 'f1', customFieldValue: 'foo' });
        // Only the task hit survives — no doc hit.
        strict_1.default.equal(res.length, 1);
        strict_1.default.equal(res[0].id, 'task-t1');
        strict_1.default.equal(res[0].entityType, 'task');
        // The task query joined the custom-field value table and resolved the type.
        strict_1.default.ok(fromTables.includes('custom_field_values'), 'joins custom_field_values');
        strict_1.default.ok(fromTables.includes('custom_field_definitions'), 'looks up the field type');
        // A task-scoped filter excludes docs entirely.
        strict_1.default.ok(!fromTables.includes('docs'), 'docs excluded when the custom-field filter is active');
    });
    (0, node_test_1.it)('does not touch custom_field_values when no custom-field filter is set', async () => {
        const { db, fromTables } = makeDb({
            tasks: [],
            docs: [],
        });
        const svc = new search_service_1.SearchService(db, config);
        await svc.search('w1', 'u1', 'alpha', 10, { statusCategory: 'open' });
        strict_1.default.ok(!fromTables.includes('custom_field_values'), 'no custom-field join without the filter');
        strict_1.default.ok(!fromTables.includes('custom_field_definitions'), 'no definition lookup without the filter');
    });
});
/**
 * Guards the §11.1 "search across … files" path. Uploaded files surface as a
 * `file` entity type sourced from `task_attachments`. Meilisearch is disabled
 * and R2 is absent (the service is built with two args), so files come solely
 * from the Postgres builder — the branch these tests exercise.
 */
(0, node_test_1.describe)('SearchService file search (§11.1 uploaded files)', () => {
    (0, node_test_1.it)('returns a matching task attachment grouped under the file type', async () => {
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
        };
        const { db, fromTables } = makeDb({ task_attachments: [attachment] });
        const svc = new search_service_1.SearchService(db, config);
        const res = await svc.search('w1', 'u1', 'invoice', 10);
        // Exactly the file hit surfaces (tasks/docs/extras are empty in the mock).
        strict_1.default.equal(res.length, 1);
        const hit = res[0];
        strict_1.default.equal(hit.entityType, 'file');
        strict_1.default.equal(hit.id, 'file-a1');
        strict_1.default.equal(hit.title, 'Q3-invoice.pdf');
        strict_1.default.equal(hit.content, 'application/pdf');
        // Links to the owning task so the file opens in context.
        strict_1.default.equal(hit.url, '/app/w1/s1/p1/l1?task=t1');
        strict_1.default.ok(fromTables.includes('task_attachments'), 'queries task_attachments');
    });
    (0, node_test_1.it)('scopes files to the caller workspace via the task→list→project→space join', async () => {
        // `types: ['file']` isolates the file query: tasks, docs and the extras
        // (users/comments/channels/messages) are all skipped, so every recorded
        // table below belongs to the attachment query alone.
        const { db, fromTables, joinTables } = makeDb({
            // The workspace-scoped join yields no rows — i.e. a file whose task lives
            // in a space in another workspace (a container the caller can't reach).
            task_attachments: [],
        });
        const svc = new search_service_1.SearchService(db, config);
        const res = await svc.search('w1', 'u1', 'secret', 10, { types: ['file'] });
        // No file leaks when the scoped join matches nothing.
        strict_1.default.equal(res.filter((h) => h.entityType === 'file').length, 0);
        // The attachment query drives off task_attachments and joins through the
        // full container chain that carries `spaces.workspaceId = <caller>` — the
        // boundary that prevents a file in an inaccessible container from surfacing.
        strict_1.default.ok(fromTables.includes('task_attachments'), 'drives off task_attachments');
        strict_1.default.ok(joinTables.includes('tasks'), 'joins tasks');
        strict_1.default.ok(joinTables.includes('lists'), 'joins lists');
        strict_1.default.ok(joinTables.includes('projects'), 'joins projects');
        strict_1.default.ok(joinTables.includes('spaces'), 'joins spaces (the workspace boundary)');
        // Isolation check: only the file query ran (no docs / chat-extras tables).
        strict_1.default.ok(!fromTables.includes('docs'), 'docs not queried for a file-only search');
        strict_1.default.ok(!fromTables.includes('chat_channel_members'), 'chat extras not queried');
    });
});
(0, node_test_1.describe)('SearchService.merge', () => {
    // Reaches the private helper directly: it is pure, and the alternative is
    // standing up Meilisearch plus five Postgres branches to assert one slice.
    const merge = (svc, sort, limit, hits) => svc.merge(sort, limit, hits);
    const svc = Object.create(search_service_1.SearchService.prototype);
    const hit = (id, at) => ({
        id, entityType: 'task', title: id, content: '', url: '', sortedAt: at,
    });
    (0, node_test_1.it)('cuts the merged set to the caller\'s limit', () => {
        // Each branch of the search limits its own query, so the concatenation can
        // exceed what was asked for. In production the same query returned 5 hits
        // by relevance and 16 by date for exactly this reason.
        const many = Array.from({ length: 16 }, (_, i) => hit(`t${i}`, null));
        strict_1.default.equal(merge(svc, 'relevance', 10, many).length, 10);
        strict_1.default.equal(merge(svc, 'updated', 10, many).length, 10);
        strict_1.default.equal(merge(svc, 'created', 10, many).length, 10);
    });
    (0, node_test_1.it)('returns the same number of hits whatever the sort is', () => {
        const mixed = [
            hit('a', '2026-01-03T00:00:00Z'),
            hit('b', null),
            hit('c', '2026-01-01T00:00:00Z'),
            hit('d', '2026-01-02T00:00:00Z'),
        ];
        const counts = ['relevance', 'updated', 'created']
            .map((s) => merge(svc, s, 3, mixed).length);
        strict_1.default.deepEqual(counts, [3, 3, 3], 'changing the order changed what was in the list');
    });
    (0, node_test_1.it)('cuts after sorting, so a limited result is the real top N', () => {
        const hits = [
            hit('oldest', '2026-01-01T00:00:00Z'),
            hit('newest', '2026-03-01T00:00:00Z'),
            hit('middle', '2026-02-01T00:00:00Z'),
        ];
        // Slicing first would keep [oldest, newest] and call it the top 2.
        strict_1.default.deepEqual(merge(svc, 'updated', 2, hits).map((h) => h.id), ['newest', 'middle']);
    });
    (0, node_test_1.it)('leaves undated hits at the end rather than treating them as oldest', () => {
        const hits = [hit('undated', null), hit('dated', '2026-01-01T00:00:00Z')];
        strict_1.default.deepEqual(merge(svc, 'updated', 2, hits).map((h) => h.id), ['dated', 'undated']);
    });
    (0, node_test_1.it)('does not reorder a relevance search', () => {
        const hits = [hit('first', null), hit('second', '2026-05-05T00:00:00Z')];
        strict_1.default.deepEqual(merge(svc, 'relevance', 5, hits).map((h) => h.id), ['first', 'second']);
    });
});
(0, node_test_1.describe)('meiliSort', () => {
    // Exported indirectly through the module so the mapping is pinned: getting a
    // field name wrong here means Meili silently ignores the sort and returns
    // relevance order under a "last updated" label.
    (0, node_test_1.it)('maps each timestamp mode to the indexed attribute', () => {
        strict_1.default.deepEqual((0, search_service_1.meiliSort)('updated'), ['updatedAt:desc']);
        strict_1.default.deepEqual((0, search_service_1.meiliSort)('created'), ['createdAt:desc']);
    });
    (0, node_test_1.it)('asks for no sort on a relevance search, so Meili ranks by score', () => {
        strict_1.default.equal((0, search_service_1.meiliSort)('relevance'), undefined);
        strict_1.default.equal((0, search_service_1.meiliSort)(undefined), undefined);
    });
});
/**
 * §2 — the search bar she walked through, [00:44]–[04:32].
 *
 * Three things she named were missing outright. Each is checked here for what
 * it returns *and* for what it must not: a search that quietly widens is worse
 * than one that errors, because the extra rows look like results.
 */
(0, node_test_1.describe)('§2 search: the containers, Location, and created dates', () => {
    const containers = () => makeDb({
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
    });
    (0, node_test_1.it)('finds a folder by name — "mujhe FOLDERS mein search karna hai" [02:03]', async () => {
        const { db } = containers();
        const res = await new search_service_1.SearchService(db, config).search('w1', 'u1', 'brand', 10, {
            types: ['folder'],
        });
        const folder = res.find((h) => h.entityType === 'folder');
        strict_1.default.ok(folder, `no folder hit: ${JSON.stringify(res)}`);
        strict_1.default.equal(folder.title, 'Brand assets');
        // Says which space it is in — "Brand assets" alone does not locate it.
        strict_1.default.equal(folder.content, 'Marketing');
    });
    (0, node_test_1.it)('finds lists and spaces too, each linking to itself', async () => {
        const { db } = containers();
        const res = await new search_service_1.SearchService(db, config).search('w1', 'u1', 'a', 10, {
            types: ['list', 'space'],
        });
        const list = res.find((h) => h.entityType === 'list');
        const space = res.find((h) => h.entityType === 'space');
        strict_1.default.ok(list && space, `missing container hits: ${JSON.stringify(res)}`);
        strict_1.default.match(list.url, /\/s1\/p1\/l1$/, `a list must open itself: ${list.url}`);
        strict_1.default.match(space.url, /\/s1$/, `a space must open itself: ${space.url}`);
    });
    (0, node_test_1.it)('keeps a private folder away from someone who cannot open it', async () => {
        // The whole point of scoping: search must not be the one surface where a
        // container you have no access to is still discoverable by name.
        const { db, wheres } = containers();
        await new search_service_1.SearchService(db, config).search('w1', 'u1', 'brand', 10, { types: ['folder'] });
        const q = sqlFor(wheres, 'folders');
        strict_1.default.ok(q, 'no predicate captured for the folder query');
        strict_1.default.match(q.sql, /"visibility"/, `the folder search is not visibility-scoped: ${q.sql}`);
    });
    (0, node_test_1.it)('scopes the list search the same way', async () => {
        const { db, wheres } = containers();
        await new search_service_1.SearchService(db, config).search('w1', 'u1', 'back', 10, { types: ['list'] });
        const q = sqlFor(wheres, 'lists');
        strict_1.default.ok(q, 'no predicate captured for the list query');
        strict_1.default.match(q.sql, /"visibility"/, `the list search is not visibility-scoped: ${q.sql}`);
    });
    /*
     * The trap these two pin. Meilisearch indexes none of the structured filters,
     * so a search carrying one has to take the Postgres path — `hasTaskFilter` is
     * what routes it there. A filter left out of that list does not error: it goes
     * to Meili, which ignores it, and the search answers as though you had never
     * filtered. Docs being excluded is the observable side of that routing, so
     * these fail the moment someone drops the filter from the list.
     */
    (0, node_test_1.it)('a Location-only search takes the filtered path [02:35]', async () => {
        const { db, fromTables } = makeDb({ tasks: [], docs: [] });
        await new search_service_1.SearchService(db, config).search('w1', 'u1', 'alpha', 10, { spaceId: 's1' });
        strict_1.default.ok(!fromTables.includes('docs'), 'docs were searched, so the location filter never reached the query builder');
    });
    (0, node_test_1.it)('a created-date search takes the filtered path [04:00]', async () => {
        const { db, fromTables } = makeDb({ tasks: [], docs: [] });
        await new search_service_1.SearchService(db, config).search('w1', 'u1', 'alpha', 10, {
            createdAfter: new Date('2026-01-01T00:00:00Z'),
        });
        strict_1.default.ok(!fromTables.includes('docs'), 'docs were searched, so the created-date filter never reached the query builder');
    });
    (0, node_test_1.it)('constrains on created_at, not due_date', async () => {
        // These are different questions — when a thing was made versus when it is
        // owed — and the columns are one word apart.
        const { db, wheres } = makeDb({ tasks: [], docs: [] });
        await new search_service_1.SearchService(db, config).search('w1', 'u1', 'alpha', 10, {
            createdAfter: new Date('2026-01-01T00:00:00Z'),
            createdBefore: new Date('2026-02-01T00:00:00Z'),
        });
        const q = sqlFor(wheres, 'tasks');
        strict_1.default.ok(q, 'no predicate captured for the task query');
        strict_1.default.match(q.sql, /"created_at" >=/, `no lower bound on created_at: ${q.sql}`);
        strict_1.default.match(q.sql, /"created_at" <=/, `no upper bound on created_at: ${q.sql}`);
        strict_1.default.ok(!/"due_date"/.test(q.sql), `constrained the wrong column: ${q.sql}`);
    });
    (0, node_test_1.it)('narrows by list and by space when Location names one', async () => {
        const { db, wheres } = makeDb({ tasks: [], docs: [] });
        await new search_service_1.SearchService(db, config).search('w1', 'u1', 'alpha', 10, {
            spaceId: 'space-1',
            listId: 'list-1',
        });
        const q = sqlFor(wheres, 'tasks');
        strict_1.default.ok(q, 'no predicate captured');
        strict_1.default.ok(q.params.includes('list-1'), `list not bound: ${q.sql} ${JSON.stringify(q.params)}`);
        strict_1.default.ok(q.params.includes('space-1'), `space not bound: ${q.sql} ${JSON.stringify(q.params)}`);
    });
    (0, node_test_1.it)('narrows to a folder — the level between the two she named [02:35]', async () => {
        /*
         * The frame-by-frame pass reads Location as "a space, folder or list"; the
         * transcript only says "kis space mein para hai, ya kis list mein para
         * hai". Folders are the level in between, and they became searchable in
         * their own right, so being unable to scope *to* one was the half left
         * undone. A task reaches its folder through list → project → folderId.
         */
        const { db, wheres } = makeDb({ tasks: [], docs: [] });
        await new search_service_1.SearchService(db, config).search('w1', 'u1', 'alpha', 10, { folderId: 'folder-1' });
        const q = sqlFor(wheres, 'tasks');
        strict_1.default.ok(q, 'no predicate captured');
        strict_1.default.match(q.sql, /"folder_id" =/, `not scoped by folder: ${q.sql}`);
        strict_1.default.ok(q.params.includes('folder-1'), `folder not bound: ${JSON.stringify(q.params)}`);
    });
    (0, node_test_1.it)('a folder-only search takes the filtered path', async () => {
        // Same trap as spaceId and createdAfter: absent from hasTaskFilter, it
        // routes to Meili, which ignores it, and the search answers unfiltered.
        const { db, fromTables } = makeDb({ tasks: [], docs: [] });
        await new search_service_1.SearchService(db, config).search('w1', 'u1', 'alpha', 10, { folderId: 'f1' });
        strict_1.default.ok(!fromTables.includes('docs'), 'docs were searched, so the folder filter never reached the query builder');
    });
    (0, node_test_1.it)('offers every container type the API will accept', async () => {
        // A type the service can return but the controller rejects is a filter that
        // silently does nothing — the §1.1 bug, in a different place.
        const { ENTITY_TYPES } = await Promise.resolve().then(() => __importStar(require('./entity-types')));
        for (const t of ['folder', 'list', 'space']) {
            strict_1.default.ok(ENTITY_TYPES.includes(t), `${t} is not accepted by the controller`);
        }
    });
});
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
(0, node_test_1.describe)('§4 Google Drive in search', () => {
    const connected = {
        // Seeded with the scope a real connection now carries. Without it
        // `searchDrive` correctly refuses to send an account-wide query, because
        // `drive.file` cannot answer one — see drive-scope.ts.
        workspace_integration_connections: [
            { status: 'connected', accessToken: 'tok', scopes: [drive_scope_1.DRIVE_SEARCH_SCOPE] },
        ],
        tasks: [],
        docs: [],
    };
    /**
     * A SearchService whose one Drive call is answered locally.
     *
     * Overriding the method rather than stubbing fetch is forced, not stylistic:
     * safeFetch issues through node:http (no global to replace) and its SSRF
     * guard rejects loopback, so a local server is not an option either. A first
     * attempt here stubbed globalThis.fetch and intercepted nothing — the tests
     * failed rather than passing hollow, which is the only reason it was caught.
     */
    class FakeDrive extends search_service_1.SearchService {
        constructor(db, reply) {
            super(db, config);
            this.reply = reply;
            this.seen = [];
        }
        async driveRequest(url) {
            this.seen.push(url);
            if (this.reply === 'throw')
                throw new Error('getaddrinfo ENOTFOUND');
            return { status: this.reply.status, text: JSON.stringify({ files: this.reply.files }) };
        }
    }
    const drive = (db, files, status = 200) => new FakeDrive(db, { status, files });
    (0, node_test_1.it)('returns Drive files as their own kind, linking out to Drive', async () => {
        const { db } = makeDb(connected);
        const svc = drive(db, [
            { id: 'F1', name: 'Q3 budget.xlsx', webViewLink: 'https://drive.google.com/file/d/F1/view' },
        ]);
        const res = await svc.search('w1', 'u1', 'budget', 10, { types: ['drive'] });
        const hit = res.find((h) => h.entityType === 'drive');
        strict_1.default.ok(hit, `no drive hit: ${JSON.stringify(res)}`);
        strict_1.default.equal(hit.title, 'Q3 budget.xlsx');
        strict_1.default.match(hit.url, /^https:\/\/drive\.google\.com\//, 'a Drive file opens in Drive');
        // Says where it came from — a result that leaves the product should admit it.
        strict_1.default.equal(hit.content, 'Google Drive');
    });
    (0, node_test_1.it)('escapes the term, so an apostrophe cannot rewrite the Drive query', async () => {
        // Drive's `q` is a query language and the term is interpolated into a
        // quoted string inside it. "Ali's notes" would otherwise close that string
        // early and change what was asked.
        const { db } = makeDb(connected);
        const svc = drive(db, []);
        await svc.search('w1', 'u1', "Ali's notes", 10, { types: ['drive'] });
        strict_1.default.equal(svc.seen.length, 1, 'Drive was not called');
        const q = decodeURIComponent(new URL(svc.seen[0]).searchParams.get('q') ?? '');
        strict_1.default.ok(q.includes("Ali\\'s notes"), `apostrophe not escaped: ${q}`);
        strict_1.default.ok(q.includes('trashed = false'), `deleted files should stay deleted: ${q}`);
    });
    (0, node_test_1.it)('asks Drive for nothing when no Drive is linked', async () => {
        const { db } = makeDb({ workspace_integration_connections: [], tasks: [], docs: [] });
        const svc = drive(db, []);
        const res = await svc.search('w1', 'u1', 'budget', 10, { types: ['drive'] });
        strict_1.default.equal(svc.seen.length, 0, 'called Drive without a connection');
        strict_1.default.equal(res.length, 0);
    });
    (0, node_test_1.it)('ignores a connection that is not connected', async () => {
        const { db } = makeDb({
            workspace_integration_connections: [{ status: 'revoked', accessToken: 'tok' }],
            tasks: [],
            docs: [],
        });
        const svc = drive(db, []);
        await svc.search('w1', 'u1', 'budget', 10, { types: ['drive'] });
        strict_1.default.equal(svc.seen.length, 0, 'used a token from a revoked connection');
    });
    (0, node_test_1.it)('does not query Drive on a grant that cannot answer the query', async () => {
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
                { status: 'connected', accessToken: 'tok', scopes: ['https://www.googleapis.com/auth/drive.file'] },
            ],
            tasks: [],
            docs: [],
        });
        const svc = drive(db, []);
        const res = await svc.search('w1', 'u1', 'budget', 10, { types: ['drive'] });
        strict_1.default.equal(svc.seen.length, 0, 'sent an account-wide query on a drive.file grant');
        strict_1.default.equal(res.length, 0);
    });
    (0, node_test_1.it)('survives Drive being down, and still answers', async () => {
        const { db } = makeDb({ ...connected, tasks: [] });
        const svc = new FakeDrive(db, 'throw');
        const res = await svc.search('w1', 'u1', 'budget', 10, { types: ['drive'] });
        strict_1.default.deepEqual(res, [], 'a broken integration must not throw out of search');
    });
    (0, node_test_1.it)('survives Drive answering with an error status', async () => {
        const { db } = makeDb(connected);
        const svc = drive(db, [{ id: 'F1', name: 'leaked' }], 403);
        const res = await svc.search('w1', 'u1', 'budget', 10, { types: ['drive'] });
        strict_1.default.deepEqual(res, [], 'a 403 body must not be read as results');
    });
    (0, node_test_1.it)('is offered by the controller', async () => {
        const { ENTITY_TYPES } = await Promise.resolve().then(() => __importStar(require('./entity-types')));
        strict_1.default.ok(ENTITY_TYPES.includes('drive'), 'drive is not an accepted type');
    });
});
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
(0, node_test_1.describe)('SearchService pages Meili past hits the caller cannot see', () => {
    /** An index of `total` task docs; only `visibleIds` survive the DB filter. */
    const fakeIndex = (total) => {
        const calls = [];
        const docs = Array.from({ length: total }, (_, i) => ({
            id: `task-t${i}`,
            entityType: 'task',
            title: `probe ${i}`,
            content: '',
            url: `/t${i}`,
            createdAt: 1_700_000_000_000 - i,
            updatedAt: 1_700_000_000_000 - i,
        }));
        const index = {
            search: async (_q, opts) => {
                const offset = opts.offset ?? 0;
                calls.push({ offset, limit: opts.limit });
                return { hits: docs.slice(offset, offset + opts.limit) };
            },
        };
        return { index, calls };
    };
    /** A service wired to a fake index, with `keep` the rows the DB hands back. */
    const svcWith = (index, keep) => {
        const { db } = makeDb({
            tasks: keep,
            docs: [], users: [], task_comments: [],
            chat_channels: [], chat_channel_members: [], chat_messages: [],
            folders: [], lists: [], spaces: [],
        });
        const svc = new search_service_1.SearchService(db, config);
        Object.assign(svc, { enabled: true, index });
        return svc;
    };
    (0, node_test_1.it)('finds a visible task that ranks below the first page', async () => {
        // 46 docs: the only one the caller may see is last, at index 45 — beyond
        // the 40 the first page fetches, and far beyond a limit of 5.
        const { index, calls } = fakeIndex(46);
        const res = await svcWith(index, [{ id: 't45' }]).search('w1', 'u1', 'probe', 5, {});
        strict_1.default.equal(res.length, 1, `the visible task was lost: ${JSON.stringify(res)}`);
        strict_1.default.equal(res[0].id, 'task-t45');
        strict_1.default.ok(calls.length > 1, 'it never paged — one page cannot reach doc 45');
        strict_1.default.equal(calls[0].offset, 0, `first page must start at 0, got ${calls[0].offset}`);
    });
    (0, node_test_1.it)('stops at the scan cap rather than walking an unbounded index', async () => {
        // Nothing is visible, so it can only stop by giving up. A search must not
        // turn into a full scan of a large index.
        const { index, calls } = fakeIndex(100_000);
        const res = await svcWith(index, []).search('w1', 'u1', 'probe', 5, {});
        strict_1.default.deepEqual(res, [], 'nothing was visible, so nothing may come back');
        const scanned = calls.reduce((n, c) => n + c.limit, 0);
        strict_1.default.ok(scanned <= 500, `scanned ${scanned} documents; the cap is 500`);
    });
    (0, node_test_1.it)('asks for one page only when the first page already answers', async () => {
        // The ordinary case must not pay for the pathological one.
        const { index, calls } = fakeIndex(46);
        const res = await svcWith(index, Array.from({ length: 40 }, (_, i) => ({ id: `t${i}` })))
            .search('w1', 'u1', 'probe', 5, {});
        strict_1.default.equal(res.length, 5, 'a limit of 5 must return 5');
        strict_1.default.equal(calls.length, 1, `one page should have sufficed, made ${calls.length} calls`);
    });
    (0, node_test_1.it)('does not return the same task twice when pages overlap', async () => {
        // Meili paginates a live index, so a document can shift and be served on
        // two pages. A search must never show one task under two headings.
        const { index } = fakeIndex(46);
        const overlapping = {
            search: async (q, opts) => 
            // Every page starts from 0, so page 2 repeats page 1 entirely.
            index.search(q, { ...opts, offset: 0 }),
        };
        const res = await svcWith(overlapping, [{ id: 't0' }]).search('w1', 'u1', 'probe', 5, {});
        strict_1.default.equal(res.length, 1, `a repeated document was returned twice: ${JSON.stringify(res)}`);
    });
});
//# sourceMappingURL=search.service.test.js.map
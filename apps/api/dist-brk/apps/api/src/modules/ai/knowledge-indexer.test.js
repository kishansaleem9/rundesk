"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const drizzle_orm_1 = require("drizzle-orm");
const knowledge_indexer_service_1 = require("./knowledge-indexer.service");
const embedding_service_1 = require("./embedding.service");
const embedding_1 = require("./embedding");
/**
 * §15.1 indexer. Verifies the embed-and-upsert-by-source flow: it embeds
 * changed content, skips content whose hash + dim are unchanged, and drops
 * empty comments. Uses the deterministic local embedder (no API key) and a
 * table-keyed DB mock that also captures inserts.
 */
const localEmbeddings = new embedding_service_1.EmbeddingService({ get: () => undefined });
const D = embedding_1.DEFAULT_EMBED_DIM;
// Table-keyed select mock (like search.service.test.ts) plus an insert capture
// so we can assert exactly which sources were (re)embedded.
function makeIndexerDb(tableRows) {
    const inserts = [];
    const chain = () => {
        let rows = [];
        const c = {
            from: (t) => {
                rows = tableRows[(0, drizzle_orm_1.getTableName)(t)] ?? [];
                return c;
            },
            where: () => c,
            innerJoin: () => c,
            leftJoin: () => c,
            orderBy: () => c,
            limit: () => c,
            then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject),
        };
        return c;
    };
    const db = {
        select: () => chain(),
        insert: () => ({
            values: (vals) => ({
                onConflictDoUpdate: async () => {
                    inserts.push(vals);
                },
            }),
        }),
    };
    return { db, inserts };
}
// A workspace with one task, one doc, one real comment, and one empty comment.
function baseTables() {
    return {
        tasks: [{ id: 't1', title: 'Fix login', description: 'timeout on mobile', listId: 'l1', spaceId: 's1', projectId: 'p1' }],
        docs: [{ id: 'd1', title: 'Onboarding', plaintext: 'welcome to the team' }],
        task_comments: [
            { id: 'c1', body: 'looks good to me', taskId: 't1', taskTitle: 'Fix login', listId: 'l1', spaceId: 's1', projectId: 'p1' },
            { id: 'c2', body: '   ', taskId: 't1', taskTitle: 'Fix login', listId: 'l1', spaceId: 's1', projectId: 'p1' },
        ],
    };
}
// A minimal R2Service stand-in: `configured` gates attachment indexing and
// `getObject` returns the stored bytes for a key (UTF-8). Records reads so a
// test can prove binaries are skipped WITHOUT hitting storage.
function makeR2(objects, configured = true) {
    const reads = [];
    const r2 = {
        configured,
        getObject: async (key) => {
            reads.push(key);
            if (!(key in objects))
                throw new Error(`no such object: ${key}`);
            return Buffer.from(objects[key], 'utf8');
        },
    };
    return { r2, reads };
}
// One extractable attachment row shaped like the indexer's join projection.
function attachmentRow(over = {}) {
    return {
        id: 'a1',
        fileName: 'launch-notes.txt',
        contentType: 'text/plain',
        storageKey: 'ws/w1/att/a1.txt',
        sizeBytes: 40,
        taskId: 't1',
        listId: 'l1',
        spaceId: 's1',
        projectId: 'p1',
        ...over,
    };
}
(0, node_test_1.describe)('KnowledgeIndexerService.collectSources (§15.1)', () => {
    (0, node_test_1.it)('collects tasks, docs and non-empty comments with citation urls', async () => {
        const { db } = makeIndexerDb(baseTables());
        const svc = new knowledge_indexer_service_1.KnowledgeIndexerService(db, localEmbeddings);
        const items = await svc.collectSources('w1');
        const byType = (t) => items.filter((i) => i.sourceType === t);
        strict_1.default.equal(byType('task').length, 1);
        strict_1.default.equal(byType('doc').length, 1);
        strict_1.default.equal(byType('comment').length, 1); // empty-body comment dropped
        strict_1.default.equal(byType('task')[0].url, '/app/w1/s1/p1/l1?task=t1');
        strict_1.default.equal(byType('doc')[0].url, '/app/w1/docs?doc=d1');
        strict_1.default.equal(byType('comment')[0].url, '/app/w1/s1/p1/l1?task=t1');
        strict_1.default.equal(byType('comment')[0].title, 'Comment on Fix login');
        strict_1.default.equal(byType('task')[0].text, 'Fix login\ntimeout on mobile');
    });
});
(0, node_test_1.describe)('KnowledgeIndexerService.indexWorkspaceContent (§15.1)', () => {
    (0, node_test_1.it)('embeds every source on a cold workspace (no existing rows)', async () => {
        const { db, inserts } = makeIndexerDb({ ...baseTables(), knowledge_embeddings: [] });
        const svc = new knowledge_indexer_service_1.KnowledgeIndexerService(db, localEmbeddings);
        const res = await svc.indexWorkspaceContent('w1');
        strict_1.default.deepEqual(res, { total: 3, indexed: 3, skipped: 0 });
        strict_1.default.equal(inserts.length, 3);
        // Vectors are stored at the embedder's dimension; the source key is upserted.
        for (const row of inserts) {
            strict_1.default.equal(row.dim, D);
            strict_1.default.equal(row.embedding.length, D);
            strict_1.default.equal(row.workspaceId, 'w1');
        }
        strict_1.default.ok(inserts.some((r) => r.sourceType === 'task' && r.sourceId === 't1'));
        strict_1.default.ok(inserts.some((r) => r.sourceType === 'comment' && r.sourceId === 'c1'));
    });
    (0, node_test_1.it)('skips sources whose content hash + dim are unchanged', async () => {
        const existing = [
            { sourceType: 'task', sourceId: 't1', contentHash: (0, embedding_1.contentHash)('Fix login\ntimeout on mobile'), dim: D },
            { sourceType: 'doc', sourceId: 'd1', contentHash: (0, embedding_1.contentHash)('Onboarding\nwelcome to the team'), dim: D },
            { sourceType: 'comment', sourceId: 'c1', contentHash: (0, embedding_1.contentHash)('looks good to me'), dim: D },
        ];
        const { db, inserts } = makeIndexerDb({ ...baseTables(), knowledge_embeddings: existing });
        const svc = new knowledge_indexer_service_1.KnowledgeIndexerService(db, localEmbeddings);
        const res = await svc.indexWorkspaceContent('w1');
        strict_1.default.deepEqual(res, { total: 3, indexed: 0, skipped: 3 }, 'all unchanged → nothing re-embedded');
        strict_1.default.equal(inserts.length, 0);
    });
    (0, node_test_1.it)('re-embeds a source whose content changed (stale hash)', async () => {
        const existing = [
            { sourceType: 'task', sourceId: 't1', contentHash: 'stale-hash', dim: D },
            { sourceType: 'doc', sourceId: 'd1', contentHash: (0, embedding_1.contentHash)('Onboarding\nwelcome to the team'), dim: D },
            { sourceType: 'comment', sourceId: 'c1', contentHash: (0, embedding_1.contentHash)('looks good to me'), dim: D },
        ];
        const { db, inserts } = makeIndexerDb({ ...baseTables(), knowledge_embeddings: existing });
        const svc = new knowledge_indexer_service_1.KnowledgeIndexerService(db, localEmbeddings);
        const res = await svc.indexWorkspaceContent('w1');
        strict_1.default.deepEqual(res, { total: 3, indexed: 1, skipped: 2 });
        strict_1.default.equal(inserts.length, 1);
        strict_1.default.equal(inserts[0].sourceId, 't1');
    });
    (0, node_test_1.it)('re-embeds when the stored dim differs from the current embedder (embedder switch)', async () => {
        const existing = [
            { sourceType: 'task', sourceId: 't1', contentHash: (0, embedding_1.contentHash)('Fix login\ntimeout on mobile'), dim: 1536 },
            { sourceType: 'doc', sourceId: 'd1', contentHash: (0, embedding_1.contentHash)('Onboarding\nwelcome to the team'), dim: D },
            { sourceType: 'comment', sourceId: 'c1', contentHash: (0, embedding_1.contentHash)('looks good to me'), dim: D },
        ];
        const { db, inserts } = makeIndexerDb({ ...baseTables(), knowledge_embeddings: existing });
        const svc = new knowledge_indexer_service_1.KnowledgeIndexerService(db, localEmbeddings);
        const res = await svc.indexWorkspaceContent('w1');
        strict_1.default.equal(res.indexed, 1, 'the dim-mismatched task is re-embedded');
        strict_1.default.equal(inserts[0].sourceId, 't1');
        strict_1.default.equal(inserts[0].dim, D);
    });
});
(0, node_test_1.describe)('KnowledgeIndexerService — attachment contents (§15.1)', () => {
    (0, node_test_1.it)('collectAttachmentSources: reads R2 bytes and extracts UTF-8 text for a text attachment', async () => {
        const body = 'The Q3 launch ships on August 15. Owner is Priya.';
        const { db } = makeIndexerDb({ task_attachments: [attachmentRow({ sizeBytes: body.length })] });
        const { r2, reads } = makeR2({ 'ws/w1/att/a1.txt': body });
        const svc = new knowledge_indexer_service_1.KnowledgeIndexerService(db, localEmbeddings, r2);
        const items = await svc.collectAttachmentSources('w1');
        strict_1.default.equal(items.length, 1);
        strict_1.default.equal(items[0].sourceType, 'attachment');
        strict_1.default.equal(items[0].sourceId, 'a1');
        strict_1.default.equal(items[0].title, 'launch-notes.txt');
        // Cited at the parent task so filterAccessibleHits scopes it by task access.
        strict_1.default.equal(items[0].url, '/app/w1/s1/p1/l1?task=t1');
        strict_1.default.equal(items[0].text, body);
        strict_1.default.deepEqual(reads, ['ws/w1/att/a1.txt'], 'bytes were fetched from R2 once');
    });
    (0, node_test_1.it)('indexWorkspaceContent embeds a text attachment as sourceType "attachment" alongside tasks/docs/comments', async () => {
        const body = 'quarterly roadmap and launch plan details';
        const { db, inserts } = makeIndexerDb({
            ...baseTables(),
            knowledge_embeddings: [],
            task_attachments: [attachmentRow({ sizeBytes: body.length })],
        });
        const { r2 } = makeR2({ 'ws/w1/att/a1.txt': body });
        const svc = new knowledge_indexer_service_1.KnowledgeIndexerService(db, localEmbeddings, r2);
        const res = await svc.indexWorkspaceContent('w1');
        strict_1.default.equal(res.total, 4, '3 base sources + 1 attachment');
        strict_1.default.equal(res.indexed, 4);
        const att = inserts.find((r) => r.sourceType === 'attachment');
        strict_1.default.ok(att, 'attachment embedding was upserted');
        strict_1.default.equal(att.sourceId, 'a1');
        strict_1.default.equal(att.title, 'launch-notes.txt');
        strict_1.default.equal(att.dim, D);
        strict_1.default.equal(att.embedding.length, D);
        strict_1.default.equal(att.workspaceId, 'w1');
    });
    (0, node_test_1.it)('skips a binary (image/png) attachment — no extraction, R2 is never read', async () => {
        const { db, inserts } = makeIndexerDb({
            knowledge_embeddings: [],
            task_attachments: [attachmentRow({ id: 'a2', fileName: 'photo.png', contentType: 'image/png', storageKey: 'ws/w1/att/a2.png' })],
        });
        const { r2, reads } = makeR2({}); // nothing stored; must not be read
        const svc = new knowledge_indexer_service_1.KnowledgeIndexerService(db, localEmbeddings, r2);
        const items = await svc.collectAttachmentSources('w1');
        strict_1.default.deepEqual(items, [], 'binary attachment produces no indexable item');
        strict_1.default.deepEqual(reads, [], 'a non-text type is skipped before any R2 fetch');
        const res = await svc.indexWorkspaceContent('w1');
        strict_1.default.ok(!inserts.some((r) => r.sourceType === 'attachment'), 'binary attachment is not embedded');
        strict_1.default.equal(res.total, 0);
    });
    (0, node_test_1.it)('skips a text attachment larger than the byte cap without reading it', async () => {
        const { db } = makeIndexerDb({
            task_attachments: [attachmentRow({ sizeBytes: 5_000_000 })], // > MAX_ATTACHMENT_BYTES
        });
        const { r2, reads } = makeR2({ 'ws/w1/att/a1.txt': 'x'.repeat(10) });
        const svc = new knowledge_indexer_service_1.KnowledgeIndexerService(db, localEmbeddings, r2);
        strict_1.default.deepEqual(await svc.collectAttachmentSources('w1'), []);
        strict_1.default.deepEqual(reads, [], 'oversized object is never pulled into memory');
    });
    (0, node_test_1.it)('skips attachment indexing gracefully when R2 is not configured (never throws)', async () => {
        const { db, inserts } = makeIndexerDb({
            ...baseTables(),
            knowledge_embeddings: [],
            task_attachments: [attachmentRow()],
        });
        const { r2, reads } = makeR2({ 'ws/w1/att/a1.txt': 'body' }, /* configured */ false);
        const svc = new knowledge_indexer_service_1.KnowledgeIndexerService(db, localEmbeddings, r2);
        strict_1.default.deepEqual(await svc.collectAttachmentSources('w1'), [], 'unconfigured R2 -> no attachments');
        strict_1.default.deepEqual(reads, [], 'unconfigured R2 is never read');
        // The rest of the reindex (tasks/docs/comments) still runs normally.
        const res = await svc.indexWorkspaceContent('w1');
        strict_1.default.equal(res.total, 3);
        strict_1.default.ok(!inserts.some((r) => r.sourceType === 'attachment'));
    });
    (0, node_test_1.it)('skips attachments when no R2 service is injected at all', async () => {
        const { db } = makeIndexerDb({ task_attachments: [attachmentRow()] });
        const svc = new knowledge_indexer_service_1.KnowledgeIndexerService(db, localEmbeddings); // no r2 arg
        strict_1.default.deepEqual(await svc.collectAttachmentSources('w1'), []);
    });
    (0, node_test_1.it)('re-indexing an unchanged text attachment is a no-op (content-hash dedupe)', async () => {
        const body = 'stable attachment body that does not change between runs';
        const { db, inserts } = makeIndexerDb({
            knowledge_embeddings: [
                { sourceType: 'attachment', sourceId: 'a1', contentHash: (0, embedding_1.contentHash)(body), dim: D },
            ],
            task_attachments: [attachmentRow({ sizeBytes: body.length })],
        });
        const { r2 } = makeR2({ 'ws/w1/att/a1.txt': body });
        const svc = new knowledge_indexer_service_1.KnowledgeIndexerService(db, localEmbeddings, r2);
        const res = await svc.indexWorkspaceContent('w1');
        strict_1.default.deepEqual(res, { total: 1, indexed: 0, skipped: 1 }, 'unchanged attachment is skipped');
        strict_1.default.equal(inserts.length, 0, 'no re-embed for an unchanged attachment');
    });
    (0, node_test_1.it)('re-embeds an attachment whose extracted text changed (stale hash)', async () => {
        const body = 'brand new revised attachment contents';
        const { db, inserts } = makeIndexerDb({
            knowledge_embeddings: [
                { sourceType: 'attachment', sourceId: 'a1', contentHash: 'stale-hash', dim: D },
            ],
            task_attachments: [attachmentRow({ sizeBytes: body.length })],
        });
        const { r2 } = makeR2({ 'ws/w1/att/a1.txt': body });
        const svc = new knowledge_indexer_service_1.KnowledgeIndexerService(db, localEmbeddings, r2);
        const res = await svc.indexWorkspaceContent('w1');
        strict_1.default.equal(res.indexed, 1);
        strict_1.default.equal(inserts.length, 1);
        strict_1.default.equal(inserts[0].sourceType, 'attachment');
        strict_1.default.equal(inserts[0].sourceId, 'a1');
        strict_1.default.equal(inserts[0].contentHash, (0, embedding_1.contentHash)(body));
    });
    /*
     * §G14-15 — meeting notes are a source like any other.
     *
     * The assistant could not ground an answer in a meeting: keyword search found
     * one, asking Brain about it turned up nothing, and the notes are frequently
     * the only written record of a decision.
     */
    (0, node_test_1.it)('indexes a meeting on its NOTES, and deep-links the citation', async () => {
        const { db, inserts } = makeIndexerDb({
            ...baseTables(),
            meetings: [{ id: 'm1', title: 'Weekly sync', notes: 'we decided to ship pricing in Q3' }],
        });
        const svc = new knowledge_indexer_service_1.KnowledgeIndexerService(db, localEmbeddings, makeR2({}).r2);
        await svc.indexWorkspaceContent('w1');
        const meeting = inserts.find((i) => i.sourceType === 'meeting');
        strict_1.default.ok(meeting, 'no meeting was indexed');
        strict_1.default.equal(meeting.sourceId, 'm1');
        /*
         * The citation points at the meeting, not the meetings page. A url that
         * lands you among every meeting in the workspace is a citation you cannot
         * follow — the same near-miss the search hit had.
         */
        strict_1.default.match(meeting.url, /meetings\?meeting=m1$/, `citation url was ${meeting.url}`);
        /*
         * And it embedded the NOTES, not the heading.
         *
         * Asserted on the content hash, which is the only trace of the text that
         * reaches the row. Without this the check passed against a build that
         * indexed `m.title` alone — break-testing found it — and a vector for
         * "Weekly sync" answers nothing while displacing a source that could.
         */
        strict_1.default.equal(meeting.contentHash, (0, embedding_1.contentHash)('Weekly sync\nwe decided to ship pricing in Q3'), 'the meeting was embedded on something other than its title plus notes');
    });
    (0, node_test_1.it)('skips a meeting with no notes rather than embedding a bare heading', () => {
        /*
         * A vector built from "Weekly sync" alone matches anything vaguely
         * organisational and answers nothing — worse than absent, because it
         * displaces a source that could have answered.
         */
        const { db, inserts } = makeIndexerDb({
            ...baseTables(),
            meetings: [
                { id: 'm1', title: 'Weekly sync', notes: '   ' },
                { id: 'm2', title: 'Retro', notes: null },
            ],
        });
        const svc = new knowledge_indexer_service_1.KnowledgeIndexerService(db, localEmbeddings, makeR2({}).r2);
        return svc.indexWorkspaceContent('w1').then(() => {
            strict_1.default.equal(inserts.filter((i) => i.sourceType === 'meeting').length, 0, 'a meeting with no notes was embedded as a title');
        });
    });
    (0, node_test_1.it)('collects a failed R2 read without aborting the run (best-effort per attachment)', async () => {
        const { db } = makeIndexerDb({
            task_attachments: [
                attachmentRow({ id: 'a1', storageKey: 'present' }),
                attachmentRow({ id: 'a2', storageKey: 'missing' }), // getObject throws
            ],
        });
        const { r2 } = makeR2({ present: 'readable attachment text' }); // 'missing' is absent -> throws
        const svc = new knowledge_indexer_service_1.KnowledgeIndexerService(db, localEmbeddings, r2);
        const items = await svc.collectAttachmentSources('w1');
        strict_1.default.equal(items.length, 1, 'the readable attachment is still indexed');
        strict_1.default.equal(items[0].sourceId, 'a1');
    });
});
//# sourceMappingURL=knowledge-indexer.test.js.map
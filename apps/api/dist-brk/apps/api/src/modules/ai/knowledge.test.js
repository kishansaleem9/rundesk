"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const drizzle_orm_1 = require("drizzle-orm");
const ai_service_1 = require("./ai.service");
const embedding_service_1 = require("./embedding.service");
const embedding_1 = require("./embedding");
const knowledge_1 = require("./knowledge");
// A local (no-API-key) embedder — the deterministic default path. Shared by the
// vector-retrieval tests below so index-time and query-time vectors match dim.
const localEmbeddings = new embedding_service_1.EmbeddingService({ get: () => undefined });
const D = embedding_1.DEFAULT_EMBED_DIM;
/** Build a knowledge_embeddings row with a real, dim-D normalized vector. */
function embRow(sourceType, sourceId, title, url, text) {
    return { sourceType, sourceId, title, url, embedding: (0, embedding_1.embedText)(text, D), dim: D };
}
/**
 * §15.1 Knowledge base + §14.4 Help center.
 *
 * The pure helpers (id parsing, context assembly, deterministic answer, help
 * keyword match) are tested directly. The retrieval/access-scope wiring is
 * tested with AI unavailable (ANTHROPIC_API_KEY unset in CI) against a mocked
 * SearchService + a table-keyed Drizzle mock, so we assert that (a) sources are
 * assembled from the accessible hits and (b) a hit the access-filter query does
 * NOT return (an inaccessible private-space task) is dropped. Real visibility
 * SQL is covered by the runtime Postgres check.
 */
// A Drizzle mock that yields rows keyed by the table passed to `.from(...)`,
// mirroring search.service.test.ts. Subquery chains (built for inArray) are
// never awaited, so their rows are irrelevant.
function makeDb(tableRows) {
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
    return { select: () => chain() };
}
const noKeyConfig = { get: () => undefined }; // → isAvailable() === false
(0, node_test_1.describe)('splitSearchId / hitToSource (§15.1)', () => {
    (0, node_test_1.it)('splits a prefixed id into entity type + raw id', () => {
        strict_1.default.deepEqual((0, knowledge_1.splitSearchId)('task-abc-123'), { type: 'task', rawId: 'abc-123' });
        strict_1.default.deepEqual((0, knowledge_1.splitSearchId)('doc-d1'), { type: 'doc', rawId: 'd1' });
        strict_1.default.deepEqual((0, knowledge_1.splitSearchId)('nodash'), { type: 'nodash', rawId: 'nodash' });
    });
    (0, node_test_1.it)('maps a hit to the cited-source shape (prefix stripped)', () => {
        const s = (0, knowledge_1.hitToSource)({ id: 'task-t1', entityType: 'task', title: 'Fix login', content: 'x', url: '/u' });
        strict_1.default.deepEqual(s, { type: 'task', id: 't1', title: 'Fix login', url: '/u' });
    });
});
(0, node_test_1.describe)('assembleKnowledgeContext (§15.1)', () => {
    (0, node_test_1.it)('numbers items as [n] citations with a trimmed snippet + type label', () => {
        const out = (0, knowledge_1.assembleKnowledgeContext)([
            { id: 'task-t1', entityType: 'task', title: 'Launch plan', content: '  spread   out  ', url: '/a' },
            { id: 'doc-d1', entityType: 'doc', title: 'Spec', content: 'y'.repeat(500), url: '/b' },
        ]);
        strict_1.default.match(out, /\[1\] \(task\) Launch plan\nspread out/);
        strict_1.default.match(out, /\[2\] \(doc\) Spec/);
        const snippet = out.split('\n').find((l) => l.startsWith('y')) ?? '';
        strict_1.default.ok(snippet.length <= 240, 'snippet trimmed to 240 chars');
    });
    (0, node_test_1.it)('caps to 8 items', () => {
        const hits = Array.from({ length: 12 }, (_v, i) => ({
            id: `task-t${i}`, entityType: 'task', title: `T${i}`, content: '', url: '/x',
        }));
        strict_1.default.equal(((0, knowledge_1.assembleKnowledgeContext)(hits).match(/\[\d+\]/g) ?? []).length, 8);
    });
});
(0, node_test_1.describe)('deterministicKnowledgeAnswer (§15.1 fallback — no fabrication)', () => {
    (0, node_test_1.it)('reports the match count and points at the sources', () => {
        const out = (0, knowledge_1.deterministicKnowledgeAnswer)('when is launch', [
            { type: 'task', id: 't1', title: 'Launch', url: '/a' },
            { type: 'doc', id: 'd1', title: 'Plan', url: '/b' },
        ]);
        strict_1.default.match(out, /Found 2 relevant items/);
        strict_1.default.match(out, /content you can access/);
        strict_1.default.match(out, /launch/);
    });
    (0, node_test_1.it)('states the no-match case plainly', () => {
        strict_1.default.match((0, knowledge_1.deterministicKnowledgeAnswer)('x', []), /No matching items/);
    });
});
(0, node_test_1.describe)('AiService.answerKnowledge — vector retrieval + access scope (§15.1 deterministic path)', () => {
    (0, node_test_1.it)('ranks vector matches, drops an inaccessible private-space task, cites only accessible sources', async () => {
        // Three embedded sources. All are semantically close to the question, but
        // the access-filter task query resolves ONLY t1 (t2 lives in a private space
        // the caller cannot reach), so t2 must never be cited. t1 shares more of the
        // question's vocabulary than d1, so it ranks first.
        const db = makeDb({
            workspace_members: [{ role: 'member' }], // non-manager → visibility filter applies
            knowledge_embeddings: [
                embRow('task', 't1', 'Public roadmap', '/app/w1/pub?task=t1', 'roadmap launch plan ships q3'),
                embRow('task', 't2', 'Secret roadmap', '/app/w1/priv?task=t2', 'roadmap launch secret plan'),
                embRow('doc', 'd1', 'Launch plan', '/app/w1/docs?doc=d1', 'launch plan onboarding'),
            ],
            tasks: [{ id: 't1' }], // access query returns only the accessible task
            docs: [{ id: 'd1' }],
        });
        const svc = new ai_service_1.AiService(noKeyConfig, db, {}, undefined, localEmbeddings);
        const res = await svc.answerKnowledge('w1', 'u-member', 'roadmap launch plan', {
            userId: 'u-member',
            workspaceId: 'w1',
        });
        strict_1.default.equal(res.source, 'vector'); // no API key → deterministic over vector hits
        const ids = res.sources.map((s) => s.id);
        strict_1.default.deepEqual(ids, ['t1', 'd1'], 'only accessible sources, private task t2 excluded, closer item first');
        strict_1.default.ok(!res.sources.some((s) => s.id === 't2'), 'inaccessible private-space task is NOT surfaced');
        strict_1.default.deepEqual(res.sources[0], { type: 'task', id: 't1', title: 'Public roadmap', url: '/app/w1/pub?task=t1' });
        strict_1.default.match(res.answer, /Found 2 relevant items/);
    });
    (0, node_test_1.it)('returns a no-match answer (no sources) when the vector store is empty', async () => {
        const svc = new ai_service_1.AiService(noKeyConfig, makeDb({ workspace_members: [{ role: 'member' }], knowledge_embeddings: [] }), {}, undefined, localEmbeddings);
        const res = await svc.answerKnowledge('w1', 'u1', 'nothing here', { workspaceId: 'w1' });
        strict_1.default.equal(res.source, 'fallback');
        strict_1.default.deepEqual(res.sources, []);
        strict_1.default.match(res.answer, /No matching items/);
    });
    (0, node_test_1.it)('a workspace manager bypasses the visibility filter (all vector hits pass through)', async () => {
        // isWorkspaceManager → true, so filterAccessibleHits short-circuits and never
        // queries tasks; both survive. Question shares more with t1 so it ranks first.
        const db = makeDb({
            workspace_members: [{ role: 'workspace_admin' }],
            knowledge_embeddings: [
                embRow('task', 't1', 'A', '/a', 'alpha roadmap'),
                embRow('task', 't2', 'B', '/b', 'roadmap beta gamma'),
            ],
        });
        const svc = new ai_service_1.AiService(noKeyConfig, db, {}, undefined, localEmbeddings);
        const res = await svc.answerKnowledge('w1', 'admin', 'roadmap alpha', { workspaceId: 'w1' });
        strict_1.default.deepEqual(res.sources.map((s) => s.id), ['t1', 't2']);
    });
    (0, node_test_1.it)('ranks a semantically-closer item above a farther one (cosine ordering)', async () => {
        const db = makeDb({
            workspace_members: [{ role: 'workspace_admin' }], // manager → skip access DB round-trip
            knowledge_embeddings: [
                embRow('task', 'far', 'Unrelated', '/far', 'accounting invoices payroll taxes'),
                embRow('task', 'near', 'On topic', '/near', 'mobile app launch marketing plan'),
            ],
        });
        const svc = new ai_service_1.AiService(noKeyConfig, db, {}, undefined, localEmbeddings);
        const res = await svc.answerKnowledge('w1', 'admin', 'when is the mobile app launch', { workspaceId: 'w1' });
        const ids = res.sources.map((s) => s.id);
        strict_1.default.equal(ids[0], 'near', 'semantically-closer item ranks first');
        const farIdx = ids.indexOf('far');
        strict_1.default.ok(farIdx === -1 || farIdx > ids.indexOf('near'), 'the unrelated item never outranks the on-topic item');
    });
    (0, node_test_1.it)('surfaces an attachment hit whose parent task the caller can access (non-manager)', async () => {
        // The attachment inherits its task's container access: the access-filter
        // query (attachment -> task -> space/project) resolves a1, so it is cited.
        const db = makeDb({
            workspace_members: [{ role: 'member' }],
            knowledge_embeddings: [
                embRow('attachment', 'a1', 'launch-notes.txt', '/app/w1/pub?task=t1', 'roadmap launch plan ships q3'),
            ],
            task_attachments: [{ id: 'a1' }], // access query returns a1 => accessible
        });
        const svc = new ai_service_1.AiService(noKeyConfig, db, {}, undefined, localEmbeddings);
        const res = await svc.answerKnowledge('w1', 'u-member', 'roadmap launch plan', {
            userId: 'u-member',
            workspaceId: 'w1',
        });
        strict_1.default.equal(res.source, 'vector');
        strict_1.default.deepEqual(res.sources.map((s) => s.id), ['a1']);
        strict_1.default.equal(res.sources[0].type, 'attachment');
        strict_1.default.equal(res.sources[0].title, 'launch-notes.txt');
    });
    (0, node_test_1.it)('drops an attachment whose parent task is in a private space the caller cannot reach', async () => {
        // The access-filter query returns nothing for a1 (its task is in a private
        // space the member is not part of), so the attachment must never be cited —
        // it must NOT leak through the generic pass-through.
        const db = makeDb({
            workspace_members: [{ role: 'member' }],
            knowledge_embeddings: [
                embRow('attachment', 'a1', 'secret.txt', '/app/w1/priv?task=t1', 'roadmap launch secret plan'),
            ],
            task_attachments: [], // access query returns nothing => inaccessible
        });
        const svc = new ai_service_1.AiService(noKeyConfig, db, {}, undefined, localEmbeddings);
        const res = await svc.answerKnowledge('w1', 'u-member', 'roadmap launch plan', {
            userId: 'u-member',
            workspaceId: 'w1',
        });
        strict_1.default.deepEqual(res.sources, [], 'inaccessible attachment is not surfaced');
        strict_1.default.match(res.answer, /No matching items/);
    });
});
(0, node_test_1.describe)('matchHelpTopics (§14.4 keyword fallback — closest FAQ)', () => {
    (0, node_test_1.it)('returns the invite topic first for an invite question', () => {
        const out = (0, knowledge_1.matchHelpTopics)('How do I invite members to my workspace?');
        strict_1.default.ok(out.length > 0);
        strict_1.default.equal(out[0].id, 'invite-members');
        strict_1.default.ok(out[0].score > 0);
    });
    (0, node_test_1.it)('returns the shortcuts topic for a keyboard question', () => {
        strict_1.default.equal((0, knowledge_1.matchHelpTopics)('what keyboard shortcuts exist')[0].id, 'shortcuts');
    });
    (0, node_test_1.it)('returns the time-tracking topic for a time question', () => {
        strict_1.default.equal((0, knowledge_1.matchHelpTopics)('how do I log billable hours on a task')[0].id, 'time-tracking');
    });
    (0, node_test_1.it)('returns nothing for an all-stopword / unrelated question', () => {
        strict_1.default.deepEqual((0, knowledge_1.matchHelpTopics)('the a an of'), []);
    });
});
(0, node_test_1.describe)('AiService.answerHelp — deterministic FAQ fallback (§14.4)', () => {
    (0, node_test_1.it)('answers with the closest FAQ topic and cites relevant entries when AI is unavailable', async () => {
        const svc = new ai_service_1.AiService(noKeyConfig, {}, {}); // help touches neither db nor search
        const res = await svc.answerHelp('How can I invite teammates?', {});
        strict_1.default.equal(res.source, 'faq');
        strict_1.default.equal(res.sources[0].id, 'invite-members');
        strict_1.default.equal(res.sources[0].type, 'faq');
        strict_1.default.match(res.sources[0].url, /help#help-invite-members/);
        const invite = knowledge_1.HELP_TOPICS.find((t) => t.id === 'invite-members');
        strict_1.default.equal(res.answer, invite.answer);
    });
    (0, node_test_1.it)('falls back to top topics (no fabrication) when nothing matches', async () => {
        const svc = new ai_service_1.AiService(noKeyConfig, {}, {});
        const res = await svc.answerHelp('qwerty zxcvb', {});
        strict_1.default.equal(res.source, 'faq');
        strict_1.default.ok(res.sources.length > 0, 'still offers topics to explore');
        strict_1.default.match(res.answer, /couldn't find|contact support/i);
    });
});
(0, node_test_1.describe)('formatHelpKnowledgeBase / helpTopicToSource (§14.4)', () => {
    (0, node_test_1.it)('renders every topic as a Q/A pair for grounding', () => {
        const kb = (0, knowledge_1.formatHelpKnowledgeBase)();
        strict_1.default.equal((kb.match(/^Q: /gm) ?? []).length, knowledge_1.HELP_TOPICS.length);
    });
    (0, node_test_1.it)('deep-links a topic to its on-page FAQ anchor', () => {
        strict_1.default.deepEqual((0, knowledge_1.helpTopicToSource)(knowledge_1.HELP_TOPICS[0]), {
            type: 'faq',
            id: knowledge_1.HELP_TOPICS[0].id,
            title: knowledge_1.HELP_TOPICS[0].question,
            url: `/app/help#help-${knowledge_1.HELP_TOPICS[0].id}`,
        });
    });
});
//# sourceMappingURL=knowledge.test.js.map
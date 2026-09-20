"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const zapier_service_1 = require("./zapier.service");
/**
 * Mocked-DB idiom (matches the repo's other service tests). Each `select()`
 * chain terminates in `.limit()`, which resolves the next queued result set;
 * `authTest` issues two queries (workspace, then user) so the queue is ordered
 * accordingly.
 */
function makeDb(resultSets) {
    const queue = [...resultSets];
    const state = { wheres: 0, limits: [] };
    const shift = () => Promise.resolve(queue.length ? queue.shift() : []);
    const chain = {};
    chain.from = () => chain;
    chain.innerJoin = () => chain;
    chain.where = () => {
        state.wheres++;
        return chain;
    };
    chain.orderBy = () => chain;
    chain.limit = (n) => {
        state.limits.push(n);
        return shift();
    };
    const db = { select: () => chain };
    return { db, state };
}
const EVENTS = ['task.created', 'task.status_changed', 'comment.created', 'time.logged'];
function makeWebhooks() {
    const captured = {};
    const svc = {
        getAvailableEvents: () => EVENTS,
        create: async (workspaceId, userId, dto) => {
            captured.create = { workspaceId, userId, dto };
            return { id: 'wh-123', workspaceId, createdById: userId, ...dto };
        },
        delete: async (workspaceId, id) => {
            captured.delete = { workspaceId, id };
            return { ok: true };
        },
    };
    return { svc, captured };
}
(0, node_test_1.describe)('ZapierService.subscribe', () => {
    (0, node_test_1.it)('creates an outbound webhook for the event pointed at targetUrl and returns { id }', async () => {
        const { svc: webhooks, captured } = makeWebhooks();
        const service = new zapier_service_1.ZapierService({}, webhooks);
        const res = await service.subscribe('ws-1', 'user-1', {
            event: 'task.created',
            targetUrl: 'https://hooks.zapier.com/hooks/standard/abc',
        });
        strict_1.default.deepEqual(res, { id: 'wh-123' });
        strict_1.default.equal(captured.create.workspaceId, 'ws-1');
        strict_1.default.equal(captured.create.userId, 'user-1');
        strict_1.default.equal(captured.create.dto.url, 'https://hooks.zapier.com/hooks/standard/abc');
        strict_1.default.deepEqual(captured.create.dto.events, ['task.created']);
    });
    (0, node_test_1.it)('rejects an event outside the webhook enum', async () => {
        const { svc: webhooks } = makeWebhooks();
        const service = new zapier_service_1.ZapierService({}, webhooks);
        await strict_1.default.rejects(() => service.subscribe('ws-1', 'user-1', { event: 'not.a.real.event', targetUrl: 'https://x.test' }), /Unknown event/);
    });
    (0, node_test_1.it)('rejects a missing targetUrl', async () => {
        const { svc: webhooks } = makeWebhooks();
        const service = new zapier_service_1.ZapierService({}, webhooks);
        await strict_1.default.rejects(() => service.subscribe('ws-1', 'user-1', { event: 'task.created' }), /targetUrl is required/);
    });
});
(0, node_test_1.describe)('ZapierService.unsubscribe', () => {
    (0, node_test_1.it)('deletes the webhook subscription scoped to the workspace', async () => {
        const { svc: webhooks, captured } = makeWebhooks();
        const service = new zapier_service_1.ZapierService({}, webhooks);
        const res = await service.unsubscribe('ws-1', 'wh-9');
        strict_1.default.deepEqual(res, { ok: true });
        strict_1.default.deepEqual(captured.delete, { workspaceId: 'ws-1', id: 'wh-9' });
    });
});
(0, node_test_1.describe)('ZapierService.sample', () => {
    (0, node_test_1.it)('returns recent workspace-scoped tasks in the delivery-envelope shape', async () => {
        const createdAt = new Date('2026-07-16T10:00:00.000Z');
        const rows = [
            { id: 't1', title: 'Task one', status: 'todo', statusCategory: 'open', priority: 'normal', listId: 'l1', createdAt, updatedAt: createdAt },
        ];
        const { db, state } = makeDb([rows]);
        const service = new zapier_service_1.ZapierService(db, makeWebhooks().svc);
        const items = (await service.sample('ws-1', 'task.created'));
        strict_1.default.equal(items.length, 1);
        strict_1.default.equal(items[0].id, 't1');
        strict_1.default.equal(items[0].event, 'task.created');
        strict_1.default.equal(items[0].payload.task.title, 'Task one');
        strict_1.default.equal(items[0].timestamp, '2026-07-16T10:00:00.000Z');
        strict_1.default.ok(state.wheres >= 1, 'query is workspace-scoped via a where clause');
        strict_1.default.deepEqual(state.limits, [5]);
    });
    (0, node_test_1.it)('rejects an unknown event', async () => {
        const { db } = makeDb([]);
        const service = new zapier_service_1.ZapierService(db, makeWebhooks().svc);
        await strict_1.default.rejects(() => service.sample('ws-1', 'nope.nope'), /Unknown event/);
    });
});
(0, node_test_1.describe)('ZapierService.authTest', () => {
    (0, node_test_1.it)('returns the authenticated workspace and user', async () => {
        const workspaceRows = [{ id: 'ws-1', name: 'Acme', slug: 'acme' }];
        const userRows = [{ id: 'user-1', email: 'areeba@theaura.agency', displayName: 'Areeba' }];
        const { db } = makeDb([workspaceRows, userRows]); // workspace query, then user query
        const service = new zapier_service_1.ZapierService(db, makeWebhooks().svc);
        const res = (await service.authTest('ws-1', 'user-1'));
        strict_1.default.equal(res.ok, true);
        strict_1.default.equal(res.workspace.name, 'Acme');
        strict_1.default.equal(res.user.email, 'areeba@theaura.agency');
        strict_1.default.match(res.connectionLabel, /Acme/);
    });
});
//# sourceMappingURL=zapier.service.test.js.map
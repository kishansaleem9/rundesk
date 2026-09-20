"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const automations_service_1 = require("./automations.service");
/**
 * Unit coverage for the §7.7 "post message to channel" automation action.
 *
 * `renderTemplate` is the pure interpolation half. The execution test drives the
 * (private) runAction with a mocked Drizzle chain — each `select()` resolves to
 * the next queued result set, `insert().values().returning()` captures the row —
 * asserting a chat message is inserted with the interpolated body + resolved
 * author and that the realtime broadcast fires. (The DB-backed path is also
 * exercised end-to-end against Postgres separately.)
 */
// A thenable Drizzle-ish chain that resolves to `rows`; every builder method is
// chainable and ignored.
function chain(rows) {
    const c = {
        from: () => c,
        where: () => c,
        limit: () => c,
        innerJoin: () => c,
        leftJoin: () => c,
        orderBy: () => c,
        groupBy: () => c,
        then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject),
    };
    return c;
}
function makeDb(selectResults, insertReturns = []) {
    let si = 0;
    let ii = 0;
    const inserts = [];
    const db = {
        _inserts: inserts,
        select: () => chain(selectResults[si++] ?? []),
        insert: () => ({
            values: (values) => {
                inserts.push({ values });
                return { returning: () => Promise.resolve(insertReturns[ii++] ?? [{ id: 'msg-1', ...values }]) };
            },
        }),
    };
    return db;
}
function makeRealtime() {
    return { emitToWorkspace: node_test_1.mock.fn() };
}
(0, node_test_1.describe)('renderTemplate (Plan §7.7 interpolation)', () => {
    (0, node_test_1.it)('replaces known {{task.*}} placeholders and leaves unknown ones intact', () => {
        const out = (0, automations_service_1.renderTemplate)('New: {{task.title}} [{{task.priority}}] {{task.missing}}', {
            'task.title': 'Ship it',
            'task.priority': 'high',
        });
        strict_1.default.equal(out, 'New: Ship it [high] {{task.missing}}');
    });
    (0, node_test_1.it)('tolerates whitespace inside braces and returns the template unchanged when no vars match', () => {
        strict_1.default.equal((0, automations_service_1.renderTemplate)('Hi {{ task.title }}', { 'task.title': 'X' }), 'Hi X');
        strict_1.default.equal((0, automations_service_1.renderTemplate)('no placeholders', {}), 'no placeholders');
    });
});
(0, node_test_1.describe)('post_to_channel action execution (Plan §7.7)', () => {
    (0, node_test_1.it)('inserts an interpolated chat message authored by the creator and broadcasts it', async () => {
        const db = makeDb([
            [{ id: 'ch1', workspaceId: 'ws1' }], // channel lookup
            [{ title: 'Ship it', status: 'in_progress', priority: 'high' }], // task (message vars)
            [{ userId: 'creator1' }], // author hint is a member
            [{ displayName: 'Alice', avatarUrl: null }], // author enrichment
        ], [[{ id: 'msg1', channelId: 'ch1', authorId: 'creator1', body: 'New task: Ship it' }]]);
        const realtime = makeRealtime();
        const svc = new automations_service_1.AutomationsService(db, realtime);
        await svc.runAction({ type: 'post_to_channel', params: { channelId: 'ch1', message: 'New task: {{task.title}}' } }, { workspaceId: 'ws1', taskId: 'task1' }, 'creator1');
        strict_1.default.equal(db._inserts.length, 1, 'one chat message inserted');
        strict_1.default.deepEqual(db._inserts[0].values, { channelId: 'ch1', authorId: 'creator1', body: 'New task: Ship it' });
        strict_1.default.equal(realtime.emitToWorkspace.mock.callCount(), 1);
        const [wsId, event] = realtime.emitToWorkspace.mock.calls[0].arguments;
        strict_1.default.equal(wsId, 'ws1');
        strict_1.default.equal(event.type, 'chat.message.created');
        strict_1.default.equal(event.channelId, 'ch1');
        strict_1.default.equal(event.message.body, 'New task: Ship it');
        strict_1.default.equal(event.message.authorName, 'Alice');
    });
    (0, node_test_1.it)('refuses to post into a channel from another workspace and inserts nothing', async () => {
        const db = makeDb([[{ id: 'ch1', workspaceId: 'other-ws' }]]);
        const realtime = makeRealtime();
        const svc = new automations_service_1.AutomationsService(db, realtime);
        await strict_1.default.rejects(svc.runAction({ type: 'post_to_channel', params: { channelId: 'ch1', message: 'hi' } }, { workspaceId: 'ws1', taskId: 'task1' }, 'creator1'), /not in this workspace/);
        strict_1.default.equal(db._inserts.length, 0);
        strict_1.default.equal(realtime.emitToWorkspace.mock.callCount(), 0);
    });
    (0, node_test_1.it)('posts nothing when the rendered message is empty', async () => {
        const db = makeDb([
            [{ id: 'ch1', workspaceId: 'ws1' }], // channel
            [{ title: 'Ship it', status: 'todo', priority: 'normal' }], // task vars
        ]);
        const realtime = makeRealtime();
        const svc = new automations_service_1.AutomationsService(db, realtime);
        await svc.runAction({ type: 'post_to_channel', params: { channelId: 'ch1', message: '   ' } }, { workspaceId: 'ws1', taskId: 'task1' }, 'creator1');
        strict_1.default.equal(db._inserts.length, 0);
        strict_1.default.equal(realtime.emitToWorkspace.mock.callCount(), 0);
    });
});
//# sourceMappingURL=automations.service.test.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const tasks_service_1 = require("./tasks.service");
/**
 * §4.4 — adding a blocking dependency that leaves a task blocked must fire a
 * `task_blocked` notification to the blocked task's assignees + watchers,
 * excluding the actor, and must NOT fire when the blocker is already closed
 * (so the task isn't actually blocked).
 *
 * Two levels are covered:
 *   1. `notifyTaskBlocked` — recipient union/dedup/actor-exclusion + the
 *      open-blocker gate + the notification payload.
 *   2. `addDependency` wiring — the (blocked, blocker) selection per dependency
 *      type and the created/type guard.
 */
// A tiny drizzle stand-in: every chain node is a thenable that resolves to the
// next queued result, so we don't need to model each verb's exact position.
function makeDb(results) {
    const queue = [...results];
    const VERBS = [
        'from', 'where', 'limit', 'innerJoin', 'leftJoin', 'orderBy', 'groupBy',
        'values', 'onConflictDoNothing', 'onConflictDoUpdate', 'set', 'returning',
    ];
    const node = (rows) => {
        const p = Promise.resolve(rows);
        for (const v of VERBS)
            p[v] = () => p;
        return p;
    };
    const next = () => node(queue.shift() ?? []);
    return {
        select: node_test_1.mock.fn(() => next()),
        insert: node_test_1.mock.fn(() => next()),
        update: node_test_1.mock.fn(() => next()),
        delete: node_test_1.mock.fn(() => next()),
    };
}
function makeService(db, notifications, realtime) {
    const rt = realtime ?? { emitToTask: node_test_1.mock.fn(), emitToUser: node_test_1.mock.fn(), emitToWorkspace: node_test_1.mock.fn() };
    return new tasks_service_1.TasksService(db, rt, {}, // search
    {}, // automations
    {}, // webhooks
    {}, // slack
    notifications, {}, // r2
    {}, // calendarSync
    { logAuditEvent: node_test_1.mock.fn(async () => undefined) });
}
const WS = { workspaceId: 'w1', spaceId: 's1', projectId: 'p1' };
(0, node_test_1.describe)('TasksService.notifyTaskBlocked', () => {
    (0, node_test_1.it)('notifies the union of assignees + watchers, de-duped and minus the actor', async () => {
        const db = makeDb([
            [{ id: 'blocked-1', title: 'Blocked Task', listId: 'l1' }], // blockedTask
            [{ userId: 'actor' }, { userId: 'u2' }], // assignees
            [{ userId: 'u2' }, { userId: 'u3' }], // watchers
        ]);
        const notifications = { create: node_test_1.mock.fn(async (_data) => ({})) };
        const svc = makeService(db, notifications);
        svc.getOpenBlockers = async () => [{ id: 'blocker-1', status: 'in_progress', title: 'Blocker Task' }];
        svc.resolveWorkspaceForList = async () => WS;
        svc.resolveWorkspaceName = async () => 'Acme';
        await svc.notifyTaskBlocked('blocked-1', 'blocker-1', 'actor');
        // actor excluded, u2 de-duped across assignee+watcher → recipients {u2, u3}
        strict_1.default.equal(notifications.create.mock.callCount(), 2);
        const calls = notifications.create.mock.calls.map((c) => c.arguments[0]);
        strict_1.default.deepEqual(calls.map((c) => c.userId).sort(), ['u2', 'u3']);
        for (const payload of calls) {
            strict_1.default.equal(payload.type, 'task_blocked');
            strict_1.default.equal(payload.actorId, 'actor');
            strict_1.default.equal(payload.workspaceId, 'w1');
            strict_1.default.match(payload.title, /Blocked Task/);
            strict_1.default.match(payload.body, /Blocker Task/);
            strict_1.default.equal(payload.target.entityType, 'task');
            strict_1.default.equal(payload.target.entityId, 'blocked-1');
        }
    });
    (0, node_test_1.it)('does NOT notify when the blocker is not open (task not actually blocked)', async () => {
        const db = makeDb([]);
        const notifications = { create: node_test_1.mock.fn(async (_data) => ({})) };
        const svc = makeService(db, notifications);
        svc.getOpenBlockers = async () => [];
        svc.resolveWorkspaceForList = async () => WS;
        svc.resolveWorkspaceName = async () => 'Acme';
        await svc.notifyTaskBlocked('blocked-1', 'blocker-1', 'actor');
        strict_1.default.equal(notifications.create.mock.callCount(), 0);
    });
    (0, node_test_1.it)('does NOT notify when the only assignee/watcher is the actor', async () => {
        const db = makeDb([
            [{ id: 'blocked-1', title: 'Blocked Task', listId: 'l1' }],
            [{ userId: 'actor' }], // assignees
            [{ userId: 'actor' }], // watchers
        ]);
        const notifications = { create: node_test_1.mock.fn(async (_data) => ({})) };
        const svc = makeService(db, notifications);
        svc.getOpenBlockers = async () => [{ id: 'blocker-1', status: 'todo', title: 'Blocker Task' }];
        svc.resolveWorkspaceForList = async () => WS;
        svc.resolveWorkspaceName = async () => 'Acme';
        await svc.notifyTaskBlocked('blocked-1', 'blocker-1', 'actor');
        strict_1.default.equal(notifications.create.mock.callCount(), 0);
    });
});
(0, node_test_1.describe)('TasksService.addDependency → blocked notification wiring', () => {
    // For a fresh blocking dependency, verifies the (blocked, blocker) pair passed
    // to notifyTaskBlocked and that non-blocking / no-op inserts skip it.
    async function run(type, created) {
        const db = makeDb([
            created ? [created] : [], // insert dependency .returning()
            [{ id: 'act1' }], // logActivity insert .returning()
        ]);
        const notifications = { create: node_test_1.mock.fn(async (_data) => ({})) };
        const svc = makeService(db, notifications);
        svc.hasBlockingPath = async () => false;
        const spy = node_test_1.mock.fn(async (_blocked, _blocker, _actor) => { });
        svc.notifyTaskBlocked = spy;
        await svc.addDependency('X', 'Y', type, 'actor');
        return spy;
    }
    (0, node_test_1.it)('blocks: X blocks Y → Y is the blocked task, X the blocker', async () => {
        const spy = await run('blocks', { id: 'dep1' });
        strict_1.default.equal(spy.mock.callCount(), 1);
        strict_1.default.deepEqual(spy.mock.calls[0].arguments, ['Y', 'X', 'actor']);
    });
    (0, node_test_1.it)('blocked_by: X blocked_by Y → X is the blocked task, Y the blocker', async () => {
        const spy = await run('blocked_by', { id: 'dep1' });
        strict_1.default.equal(spy.mock.callCount(), 1);
        strict_1.default.deepEqual(spy.mock.calls[0].arguments, ['X', 'Y', 'actor']);
    });
    (0, node_test_1.it)('related_to: never fires a blocked notification', async () => {
        const spy = await run('related_to', { id: 'dep1' });
        strict_1.default.equal(spy.mock.callCount(), 0);
    });
    (0, node_test_1.it)('no-op insert (dependency already existed) does not fire', async () => {
        const spy = await run('blocks', undefined);
        strict_1.default.equal(spy.mock.callCount(), 0);
    });
});
//# sourceMappingURL=tasks-blocked-notify.test.js.map
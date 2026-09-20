"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const tasks_service_1 = require("./tasks.service");
/**
 * §3.3 Delete Items — a workspace `manager` (not workspace_admin/super_admin)
 * may only archive/delete a task whose Space they belong to (space_members).
 * Admins/super_admins keep delete-any; members are already limited to their own
 * tasks by assertTaskWriteAccess, which the DELETE path runs first.
 *
 * The gate lives in a dedicated `assertManagerDeleteScope` so a manager's
 * non-delete writes stay unrestricted — these tests target it directly plus the
 * `deleteTask` wiring, using the repo's queued-thenable Drizzle stand-in.
 */
function makeDb(results) {
    const queue = [...results];
    const VERBS = [
        'from', 'where', 'limit', 'innerJoin', 'leftJoin', 'orderBy', 'groupBy',
        'values', 'onConflictDoNothing', 'set', 'returning',
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
function makeService(db) {
    return new tasks_service_1.TasksService(db, { emitToTask: node_test_1.mock.fn(), emitToList: node_test_1.mock.fn(), emitToUser: node_test_1.mock.fn(), emitToWorkspace: node_test_1.mock.fn() }, {}, // search
    {}, // automations
    {}, // webhooks
    {}, // slack
    {}, // notifications
    {}, // r2
    { deleteEverywhere: node_test_1.mock.fn(async () => undefined) }, // calendarSync
    { logAuditEvent: node_test_1.mock.fn(async () => undefined) });
}
const CTX = () => [{ spaceId: 's1', workspaceId: 'w1' }];
(0, node_test_1.describe)('TasksService.assertManagerDeleteScope (§3.3)', () => {
    (0, node_test_1.it)('rejects a manager deleting a task in a space they do NOT belong to', async () => {
        const db = makeDb([
            CTX(),
            [{ role: 'manager' }],
            [], // space_members lookup → not a member
        ]);
        const svc = makeService(db);
        await strict_1.default.rejects(() => svc.assertManagerDeleteScope('t1', 'mgr'), /Managers can only delete tasks in their own spaces/);
    });
    (0, node_test_1.it)('allows a manager deleting a task in a space they belong to', async () => {
        const db = makeDb([
            CTX(),
            [{ role: 'manager' }],
            [{ userId: 'mgr' }], // space_members lookup → is a member
        ]);
        const svc = makeService(db);
        await svc.assertManagerDeleteScope('t1', 'mgr'); // resolves, no throw
        strict_1.default.equal(db.select.mock.callCount(), 3, 'checks task ctx, role, then space membership');
    });
    (0, node_test_1.it)('lets workspace_admin delete anywhere (never checks space membership)', async () => {
        const db = makeDb([CTX(), [{ role: 'workspace_admin' }]]);
        const svc = makeService(db);
        await svc.assertManagerDeleteScope('t1', 'admin');
        strict_1.default.equal(db.select.mock.callCount(), 2, 'no space_members query for admins');
    });
    (0, node_test_1.it)('lets super_admin delete anywhere', async () => {
        const db = makeDb([CTX(), [{ role: 'super_admin' }]]);
        const svc = makeService(db);
        await svc.assertManagerDeleteScope('t1', 'root');
        strict_1.default.equal(db.select.mock.callCount(), 2);
    });
    (0, node_test_1.it)('does not further restrict plain members (handled by write-access check)', async () => {
        const db = makeDb([CTX(), [{ role: 'member' }]]);
        const svc = makeService(db);
        await svc.assertManagerDeleteScope('t1', 'u1');
        strict_1.default.equal(db.select.mock.callCount(), 2, 'no space_members query for members');
    });
    (0, node_test_1.it)('throws NotFound when the task does not exist', async () => {
        const db = makeDb([[]]); // ctx lookup empty
        const svc = makeService(db);
        await strict_1.default.rejects(() => svc.assertManagerDeleteScope('t1', 'x'), /Task not found/);
    });
});
(0, node_test_1.describe)('TasksService.deleteTask wires the manager space gate', () => {
    (0, node_test_1.it)('blocks an out-of-space manager before any archive happens', async () => {
        // write-access passes (managers are privileged there); the new gate rejects.
        const db = makeDb([
            CTX(),
            [{ role: 'manager' }],
            [], // not a space member
        ]);
        const svc = makeService(db);
        svc.assertTaskWriteAccess = node_test_1.mock.fn(async () => ({
            taskId: 't1',
            listId: 'l1',
            createdById: 'someone',
            workspaceId: 'w1',
        }));
        await strict_1.default.rejects(() => svc.deleteTask('t1', 'mgr'), /own spaces/);
        // update() (the archive) must never run once the gate rejects.
        strict_1.default.equal(db.update.mock.callCount(), 0);
    });
});
(0, node_test_1.describe)('TasksService.restoreTask wires the same manager space gate (§3.3)', () => {
    (0, node_test_1.it)('blocks an out-of-space manager before any un-archive happens', async () => {
        // restore is the inverse of delete, so the manager scope must apply here
        // too — otherwise a manager could un-archive a task outside their space.
        const db = makeDb([
            CTX(),
            [{ role: 'manager' }],
            [], // not a space member → assertManagerDeleteScope rejects
        ]);
        const svc = makeService(db);
        svc.assertTaskWriteAccess = node_test_1.mock.fn(async () => ({
            taskId: 't1',
            listId: 'l1',
            createdById: 'someone',
            workspaceId: 'w1',
        }));
        await strict_1.default.rejects(() => svc.restoreTask('t1', 'mgr'), /own spaces/);
        // update() (the un-archive) must never run once the gate rejects.
        strict_1.default.equal(db.update.mock.callCount(), 0);
    });
});
//# sourceMappingURL=tasks-delete-scope.test.js.map
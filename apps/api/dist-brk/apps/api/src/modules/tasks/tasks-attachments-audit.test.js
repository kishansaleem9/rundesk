"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const tasks_service_1 = require("./tasks.service");
/**
 * §4.5 attachment hardening + §13.3 container-deletion auditing.
 *
 *   1. `assertAttachmentSize` now REQUIRES a valid, positive declared size ≤ the
 *      100 MB cap (previously an omitted size silently stored 0).
 *   2. `removeAttachment` may only be run by the attachment's uploader OR a
 *      workspace moderator (mirrors `deleteComment`).
 *   3. `deleteTask` emits an `task.deleted` audit event with the actor + IP.
 *
 * Uses the repo's queued-thenable Drizzle stand-in: every db.select() pops the
 * next planned rows; insert/update/delete are no-op nodes so we can assert call
 * counts without threading their results through the select queue.
 */
const VERBS = [
    'from', 'where', 'limit', 'innerJoin', 'leftJoin', 'orderBy', 'groupBy',
    'values', 'onConflictDoNothing', 'set', 'returning',
];
function node(rows) {
    const p = Promise.resolve(rows);
    for (const v of VERBS)
        p[v] = () => p;
    return p;
}
function makeDb(selectResults) {
    const selects = [...selectResults];
    return {
        select: node_test_1.mock.fn(() => node(selects.shift() ?? [])),
        insert: node_test_1.mock.fn(() => node([{ id: 'act-1' }])),
        update: node_test_1.mock.fn(() => node([])),
        delete: node_test_1.mock.fn(() => node([])),
    };
}
function makeService(db, security = { logAuditEvent: node_test_1.mock.fn(async () => undefined) }) {
    return new tasks_service_1.TasksService(db, { emitToTask: node_test_1.mock.fn(), emitToList: node_test_1.mock.fn(), emitToUser: node_test_1.mock.fn(), emitToWorkspace: node_test_1.mock.fn() }, 
    // deleteTask takes the task back out of the search index, so the stub has
    // to answer removeTask — an empty object made the delete throw.
    { removeTask: node_test_1.mock.fn(async () => undefined) }, // search
    { fire: node_test_1.mock.fn(async () => undefined) }, // automations
    { fire: node_test_1.mock.fn(async () => undefined) }, // webhooks
    { notify: node_test_1.mock.fn(async () => undefined) }, // slack
    {}, // notifications
    { configured: false }, // r2 (unconfigured → skips object delete)
    { deleteEverywhere: node_test_1.mock.fn(async () => undefined) }, // calendarSync
    security);
}
(0, node_test_1.describe)('TasksService.assertAttachmentSize — §4.5 mandatory declared size', () => {
    const svc = makeService(makeDb([]));
    (0, node_test_1.it)('rejects a missing size', () => {
        strict_1.default.throws(() => svc.assertAttachmentSize(undefined), /valid attachment sizeBytes/);
    });
    (0, node_test_1.it)('rejects a zero / negative / non-finite size', () => {
        strict_1.default.throws(() => svc.assertAttachmentSize(0), /valid attachment sizeBytes/);
        strict_1.default.throws(() => svc.assertAttachmentSize(-1), /valid attachment sizeBytes/);
        strict_1.default.throws(() => svc.assertAttachmentSize(Number.NaN), /valid attachment sizeBytes/);
    });
    (0, node_test_1.it)('rejects a size over the 100 MB cap', () => {
        strict_1.default.throws(() => svc.assertAttachmentSize(200 * 1024 * 1024), /100 MB limit/);
    });
    (0, node_test_1.it)('accepts a valid positive size at/under the cap', () => {
        strict_1.default.doesNotThrow(() => svc.assertAttachmentSize(1024));
        strict_1.default.doesNotThrow(() => svc.assertAttachmentSize(100 * 1024 * 1024));
    });
});
(0, node_test_1.describe)('TasksService.removeAttachment — §4.5 uploader-or-moderator only', () => {
    const ATT = (uploadedById) => [{ id: 'a1', uploadedById, storageKey: 'k1' }];
    (0, node_test_1.it)('lets the uploader delete their own attachment', async () => {
        const db = makeDb([ATT('u1')]);
        const svc = makeService(db);
        svc.assertTaskWriteAccess = node_test_1.mock.fn(async () => ({ taskId: 't1', workspaceId: 'w1' }));
        const out = await svc.removeAttachment('t1', 'a1', 'u1');
        strict_1.default.deepEqual(out, { ok: true });
        strict_1.default.equal(db.delete.mock.callCount(), 1, 'the row is deleted');
    });
    (0, node_test_1.it)('lets a workspace moderator delete someone else\'s attachment', async () => {
        const db = makeDb([ATT('other'), [{ role: 'workspace_admin' }]]);
        const svc = makeService(db);
        svc.assertTaskWriteAccess = node_test_1.mock.fn(async () => ({ taskId: 't1', workspaceId: 'w1' }));
        const out = await svc.removeAttachment('t1', 'a1', 'mod');
        strict_1.default.deepEqual(out, { ok: true });
        strict_1.default.equal(db.delete.mock.callCount(), 1);
    });
    (0, node_test_1.it)('forbids a non-uploader, non-moderator task-writer', async () => {
        const db = makeDb([ATT('other'), [{ role: 'member' }]]);
        const svc = makeService(db);
        svc.assertTaskWriteAccess = node_test_1.mock.fn(async () => ({ taskId: 't1', workspaceId: 'w1' }));
        await strict_1.default.rejects(() => svc.removeAttachment('t1', 'a1', 'u2'), /uploader or a workspace admin/);
        strict_1.default.equal(db.delete.mock.callCount(), 0, 'nothing is deleted when authz fails');
    });
    (0, node_test_1.it)('404s when the attachment does not exist', async () => {
        const db = makeDb([[]]); // attachment lookup empty
        const svc = makeService(db);
        svc.assertTaskWriteAccess = node_test_1.mock.fn(async () => ({ taskId: 't1', workspaceId: 'w1' }));
        await strict_1.default.rejects(() => svc.removeAttachment('t1', 'missing', 'u1'), /Attachment not found/);
    });
});
(0, node_test_1.describe)('TasksService.deleteTask — §13.3 audit event', () => {
    (0, node_test_1.it)('logs task.deleted with the actor, resource id, workspace, and IP', async () => {
        // After the write + manager-scope gates (mocked), deleteTask does:
        //   select `before`, then resolveWorkspaceForList, then the audit call.
        const db = makeDb([
            [{ id: 't1', listId: 'l1', title: 'Ship it' }], // before
            [{ workspaceId: 'w1', spaceId: 's1', projectId: 'p1' }], // resolveWorkspaceForList
        ]);
        const security = { logAuditEvent: node_test_1.mock.fn(async (_event) => undefined) };
        const svc = makeService(db, security);
        svc.assertTaskWriteAccess = node_test_1.mock.fn(async () => ({ taskId: 't1', workspaceId: 'w1' }));
        svc.assertManagerDeleteScope = node_test_1.mock.fn(async () => undefined);
        await svc.deleteTask('t1', 'actor-1', '203.0.113.9');
        strict_1.default.equal(security.logAuditEvent.mock.callCount(), 1, 'one audit row written');
        const event = security.logAuditEvent.mock.calls[0].arguments[0];
        strict_1.default.equal(event.action, 'task.deleted');
        strict_1.default.equal(event.resourceType, 'task');
        strict_1.default.equal(event.resourceId, 't1');
        strict_1.default.equal(event.workspaceId, 'w1');
        strict_1.default.equal(event.actorId, 'actor-1');
        strict_1.default.equal(event.ipAddress, '203.0.113.9');
    });
});
//# sourceMappingURL=tasks-attachments-audit.test.js.map
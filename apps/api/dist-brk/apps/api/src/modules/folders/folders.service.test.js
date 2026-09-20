"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const folders_service_1 = require("./folders.service");
/**
 * §13.3/§13.4 — deleting a folder ARCHIVES it (soft delete) so it can be
 * restored from the workspace Trash, and emits a `folder.deleted` audit row
 * with the actor, resource id and request IP (mirroring space/project/list).
 *
 * Folders used to be hard-deleted, which made them the only container that
 * could never be recovered; these tests pin the soft-delete contract so that
 * regression can't come back.
 */
function selectChain(rows) {
    const q = Promise.resolve(rows);
    q.from = () => q;
    q.innerJoin = () => q;
    q.where = () => q;
    q.limit = () => q;
    return q;
}
/** Captures the payload passed to `.set()` so the archive stamp can be asserted. */
function updateChain(captured) {
    const q = Promise.resolve([]);
    q.set = (payload) => {
        captured.set = payload;
        return q;
    };
    q.where = () => q;
    return q;
}
(0, node_test_1.describe)('FoldersService.remove — soft delete + §13.3 audit event', () => {
    (0, node_test_1.it)('archives the folder (never hard-deletes) and stamps who/when', async () => {
        const captured = {};
        const db = {
            select: node_test_1.mock.fn(() => selectChain([{ name: 'Sprints', workspaceId: 'w1' }])),
            update: node_test_1.mock.fn(() => updateChain(captured)),
            delete: node_test_1.mock.fn(() => ({ where: () => Promise.resolve([]) })),
        };
        const security = { logAuditEvent: node_test_1.mock.fn(async () => undefined) };
        const svc = new folders_service_1.FoldersService(db, security);
        const res = await svc.remove('s1', 'f1', 'actor-1', '198.51.100.22');
        strict_1.default.deepEqual(res, { ok: true });
        strict_1.default.equal(db.update.mock.callCount(), 1, 'the folder row is archived');
        strict_1.default.equal(db.delete.mock.callCount(), 0, 'the row must NOT be hard-deleted — it has to stay restorable');
        strict_1.default.equal(captured.set.isArchived, true);
        strict_1.default.equal(captured.set.archivedById, 'actor-1', 'records who deleted it (Trash "Deleted by")');
        strict_1.default.ok(captured.set.archivedAt instanceof Date, 'records when it was deleted (Trash "Deleted on")');
        strict_1.default.equal(security.logAuditEvent.mock.callCount(), 1, 'one audit row written');
        const e = security.logAuditEvent.mock.calls[0].arguments[0];
        strict_1.default.equal(e.action, 'folder.deleted');
        strict_1.default.equal(e.resourceType, 'folder');
        strict_1.default.equal(e.resourceId, 'f1');
        strict_1.default.equal(e.workspaceId, 'w1');
        strict_1.default.equal(e.actorId, 'actor-1');
        strict_1.default.equal(e.ipAddress, '198.51.100.22');
    });
    (0, node_test_1.it)('throws NotFound and never archives when the folder does not exist', async () => {
        const captured = {};
        const db = {
            select: node_test_1.mock.fn(() => selectChain([])),
            update: node_test_1.mock.fn(() => updateChain(captured)),
        };
        const security = { logAuditEvent: node_test_1.mock.fn(async () => undefined) };
        const svc = new folders_service_1.FoldersService(db, security);
        await strict_1.default.rejects(() => svc.remove('s1', 'missing', 'actor-1'), /Folder not found/);
        strict_1.default.equal(db.update.mock.callCount(), 0, 'no archive when the folder is absent');
        strict_1.default.equal(security.logAuditEvent.mock.callCount(), 0);
    });
    (0, node_test_1.it)('does not audit an internal (no-actor) delete, and leaves archivedById null', async () => {
        const captured = {};
        const db = {
            select: node_test_1.mock.fn(() => selectChain([{ name: 'X', workspaceId: 'w1' }])),
            update: node_test_1.mock.fn(() => updateChain(captured)),
        };
        const security = { logAuditEvent: node_test_1.mock.fn(async () => undefined) };
        const svc = new folders_service_1.FoldersService(db, security);
        await svc.remove('s1', 'f1');
        strict_1.default.equal(db.update.mock.callCount(), 1);
        strict_1.default.equal(captured.set.archivedById, null, 'no actor → unknown deleter');
        strict_1.default.equal(security.logAuditEvent.mock.callCount(), 0, 'no actor → no audit row');
    });
});
//# sourceMappingURL=folders.service.test.js.map
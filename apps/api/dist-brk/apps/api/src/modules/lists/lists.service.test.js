"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const lists_service_1 = require("./lists.service");
/**
 * §13.3 — archiving a List (a container deletion) must emit a `list.deleted`
 * audit row with the actor, resource id, and request IP. The manage-check is
 * covered by the container-access permission tests; here we assert the audit
 * wiring off a chainable update stub.
 */
function updateChain() {
    const q = Promise.resolve([]);
    q.set = () => q;
    q.where = () => q;
    return q;
}
(0, node_test_1.describe)('ListsService.deleteList — §13.3 audit event', () => {
    (0, node_test_1.it)('archives and logs list.deleted with the actor + IP', async () => {
        const db = { update: node_test_1.mock.fn(() => updateChain()) };
        const security = { logAuditEvent: node_test_1.mock.fn(async () => undefined) };
        const svc = new lists_service_1.ListsService(db, security);
        svc.assertManageable = node_test_1.mock.fn(async () => ({ workspaceId: 'w1', name: 'Sprint 4', createdById: 'u1' }));
        await svc.deleteList('l1', 'actor-1', '198.51.100.33');
        strict_1.default.equal(db.update.mock.callCount(), 1, 'the list is archived');
        strict_1.default.equal(security.logAuditEvent.mock.callCount(), 1, 'one audit row written');
        const e = security.logAuditEvent.mock.calls[0].arguments[0];
        strict_1.default.equal(e.action, 'list.deleted');
        strict_1.default.equal(e.resourceType, 'list');
        strict_1.default.equal(e.resourceId, 'l1');
        strict_1.default.equal(e.workspaceId, 'w1');
        strict_1.default.equal(e.actorId, 'actor-1');
        strict_1.default.equal(e.ipAddress, '198.51.100.33');
    });
});
//# sourceMappingURL=lists.service.test.js.map
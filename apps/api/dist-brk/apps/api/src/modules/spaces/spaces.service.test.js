"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const spaces_service_1 = require("./spaces.service");
/**
 * §13.3 — archiving a Space (a container deletion) must emit a `space.deleted`
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
(0, node_test_1.describe)('SpacesService.deleteSpace — §13.3 audit event', () => {
    (0, node_test_1.it)('archives and logs space.deleted with the actor + IP', async () => {
        const db = { update: node_test_1.mock.fn(() => updateChain()) };
        const security = { logAuditEvent: node_test_1.mock.fn(async () => undefined) };
        // §V2-06 added ListsService for preset seeding and PlansService for the
        // `[07:20]` ClickApps plan gate; deleteSpace touches neither, so null
        // stand-ins say that rather than pretending to be them.
        const svc = new spaces_service_1.SpacesService(db, security, null, null);
        svc.assertManageable = node_test_1.mock.fn(async () => ({ workspaceId: 'w1', name: 'Product', createdById: 'u1' }));
        await svc.deleteSpace('s1', 'actor-1', '198.51.100.22');
        strict_1.default.equal(db.update.mock.callCount(), 1, 'the space is archived');
        strict_1.default.equal(security.logAuditEvent.mock.callCount(), 1, 'one audit row written');
        const e = security.logAuditEvent.mock.calls[0].arguments[0];
        strict_1.default.equal(e.action, 'space.deleted');
        strict_1.default.equal(e.resourceType, 'space');
        strict_1.default.equal(e.resourceId, 's1');
        strict_1.default.equal(e.workspaceId, 'w1');
        strict_1.default.equal(e.actorId, 'actor-1');
        strict_1.default.equal(e.ipAddress, '198.51.100.22');
    });
    (0, node_test_1.it)('does not audit an internal (no-actor) archive', async () => {
        const db = { update: node_test_1.mock.fn(() => updateChain()) };
        const security = { logAuditEvent: node_test_1.mock.fn(async () => undefined) };
        const svc = new spaces_service_1.SpacesService(db, security, null, null);
        await svc.deleteSpace('s1');
        strict_1.default.equal(db.update.mock.callCount(), 1);
        strict_1.default.equal(security.logAuditEvent.mock.callCount(), 0, 'no actor → no audit row');
    });
});
//# sourceMappingURL=spaces.service.test.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const projects_service_1 = require("./projects.service");
/**
 * Locks in the §12.4 webhook + §12.1 Slack fan-out for project lifecycle
 * events. The audit found `project.created` / `project.updated` were
 * advertised in WEBHOOK_EVENTS but never dispatched; these tests guard that
 * the source-of-truth mutations now fire them, with the workspace resolved
 * off the project's space and delivery routed best-effort.
 */
function flush() {
    // Let the non-blocking `void this.fireProjectEvent(...)` chain settle.
    return new Promise((resolve) => setTimeout(resolve, 20));
}
(0, node_test_1.describe)('ProjectsService project event firing', () => {
    (0, node_test_1.it)('createProject fires project.created + Slack with a workspace-resolved payload', async () => {
        const project = { id: 'p-1', name: 'Apollo', spaceId: 's-1' };
        const db = {
            insert: node_test_1.mock.fn(() => ({
                values: node_test_1.mock.fn(() => ({
                    returning: async () => [project],
                    onConflictDoNothing: async () => undefined,
                })),
            })),
            // fireProjectEvent resolves workspaceId via the project's space.
            select: node_test_1.mock.fn(() => ({
                from: () => ({ where: () => ({ limit: async () => [{ workspaceId: 'w-1' }] }) }),
            })),
        };
        const webhooks = { fire: node_test_1.mock.fn(async () => undefined) };
        const slack = { notify: node_test_1.mock.fn(async () => undefined) };
        // §14.1 plan gate: no-op mock (enterprise allows everything).
        const plans = { assertCanCreateProjects: node_test_1.mock.fn(async () => undefined) };
        const security = { logAuditEvent: node_test_1.mock.fn(async () => undefined) };
        const svc = new projects_service_1.ProjectsService(db, webhooks, slack, plans, security);
        const out = await svc.createProject('s-1', { name: 'Apollo' }, 'u-1');
        strict_1.default.equal(out.id, 'p-1');
        await flush();
        strict_1.default.equal(webhooks.fire.mock.callCount(), 1, 'project.created webhook fired');
        const [wsId, event, payload] = webhooks.fire.mock.calls[0].arguments;
        strict_1.default.equal(wsId, 'w-1');
        strict_1.default.equal(event, 'project.created');
        strict_1.default.deepEqual(payload.project, { id: 'p-1', name: 'Apollo', spaceId: 's-1', workspaceId: 'w-1' });
        strict_1.default.equal(payload.actorId, 'u-1');
        strict_1.default.equal(slack.notify.mock.callCount(), 1, 'Slack project alert routed');
        const [sWsId, sEvent, , sOpts] = slack.notify.mock.calls[0].arguments;
        strict_1.default.equal(sWsId, 'w-1');
        strict_1.default.equal(sEvent, 'project.created');
        strict_1.default.equal(sOpts.projectId, 'p-1', 'routed with project scope for per-channel rules');
    });
    (0, node_test_1.it)('fireProjectEvent is a no-op when the space (workspace) cannot be resolved', async () => {
        const db = {
            select: node_test_1.mock.fn(() => ({
                from: () => ({ where: () => ({ limit: async () => [] }) }),
            })),
        };
        const webhooks = { fire: node_test_1.mock.fn(async () => undefined) };
        const slack = { notify: node_test_1.mock.fn(async () => undefined) };
        const svc = new projects_service_1.ProjectsService(db, webhooks, slack, {}, {});
        await svc.fireProjectEvent('project.updated', { id: 'p-9', name: 'Ghost', spaceId: 'missing' }, 'u-1');
        strict_1.default.equal(webhooks.fire.mock.callCount(), 0);
        strict_1.default.equal(slack.notify.mock.callCount(), 0);
    });
});
(0, node_test_1.describe)('ProjectsService.deleteProject — §13.3 audit event', () => {
    (0, node_test_1.it)('archives and logs project.deleted with the actor + IP', async () => {
        // update(projects).set(...).where(...) — a chainable thenable stub.
        const chain = () => {
            const q = Promise.resolve([]);
            q.set = () => q;
            q.where = () => q;
            return q;
        };
        const db = { update: node_test_1.mock.fn(() => chain()) };
        const security = { logAuditEvent: node_test_1.mock.fn(async () => undefined) };
        const svc = new projects_service_1.ProjectsService(db, {}, {}, {}, security);
        // Manage-check is exercised elsewhere; here we assert the audit wiring.
        svc.assertManageable = node_test_1.mock.fn(async () => ({ workspaceId: 'w1', name: 'Apollo', createdById: 'u1' }));
        await svc.deleteProject('p1', 'actor-1', '198.51.100.4');
        strict_1.default.equal(db.update.mock.callCount(), 1, 'the project is archived');
        strict_1.default.equal(security.logAuditEvent.mock.callCount(), 1, 'one audit row written');
        const e = security.logAuditEvent.mock.calls[0].arguments[0];
        strict_1.default.equal(e.action, 'project.deleted');
        strict_1.default.equal(e.resourceType, 'project');
        strict_1.default.equal(e.resourceId, 'p1');
        strict_1.default.equal(e.workspaceId, 'w1');
        strict_1.default.equal(e.actorId, 'actor-1');
        strict_1.default.equal(e.ipAddress, '198.51.100.4');
    });
});
//# sourceMappingURL=projects.service.test.js.map
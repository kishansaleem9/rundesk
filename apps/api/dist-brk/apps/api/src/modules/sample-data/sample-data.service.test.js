"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const sample_data_service_1 = require("./sample-data.service");
/**
 * The seeder is mostly orchestration. We unit-test the two guards
 * (workspace must be empty, actor must be a member) plus the audit
 * log call. Full-tree seeding is integration territory because it
 * touches almost every domain table — exercising it here would mean
 * stubbing the entire schema and would not actually catch bugs.
 */
function buildDb(opts = {}) {
    const queue = [...(opts.selectQueues ?? [])];
    const chainable = (rows) => ({
        then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject),
        limit: node_test_1.mock.fn(async () => rows),
        orderBy: node_test_1.mock.fn(() => chainable(rows)),
    });
    return {
        select: node_test_1.mock.fn(() => ({
            from: node_test_1.mock.fn(() => ({
                where: node_test_1.mock.fn(() => chainable(queue.shift() ?? [])),
                limit: node_test_1.mock.fn(async () => queue.shift() ?? []),
                orderBy: node_test_1.mock.fn(() => chainable(queue.shift() ?? [])),
            })),
        })),
        insert: node_test_1.mock.fn(() => ({
            values: node_test_1.mock.fn((vals) => ({
                // Echo back enough shape for the seeder to read names/ids
                // when it inspects insert returns (labels, spaces, projects,
                // lists, tasks, checklists).
                returning: node_test_1.mock.fn(async () => {
                    const rows = Array.isArray(vals) ? vals : [vals];
                    return rows.map((v, i) => ({
                        id: `gen-${i}-${Math.random().toString(36).slice(2, 8)}`,
                        ...v,
                    }));
                }),
                onConflictDoNothing: node_test_1.mock.fn(async () => undefined),
                // Some inserts in the seeder don't chain .returning() (label
                // assignments, checklist items, status seeds) — make those
                // awaitable directly.
                then: (resolve) => Promise.resolve(undefined).then(resolve),
            })),
        })),
        update: node_test_1.mock.fn(() => ({ set: node_test_1.mock.fn(() => ({ where: node_test_1.mock.fn(async () => undefined) })) })),
        delete: node_test_1.mock.fn(() => ({ where: node_test_1.mock.fn(async () => undefined) })),
    };
}
function buildSecurity() {
    return { logAuditEvent: node_test_1.mock.fn(async () => undefined) };
}
const ACTOR = { id: '00000000-0000-0000-0000-000000000001', email: 'admin@example.com' };
const WORKSPACE_ID = '00000000-0000-0000-0000-0000000000aa';
(0, node_test_1.describe)('SampleDataService.seed — empty-workspace guard', () => {
    (0, node_test_1.it)('refuses to seed when the workspace already has spaces', async () => {
        // First select call is the count(*) on spaces. Return a positive count.
        const db = buildDb({ selectQueues: [[{ value: 3 }]] });
        const svc = new sample_data_service_1.SampleDataService(db, buildSecurity());
        await strict_1.default.rejects(() => svc.seed(WORKSPACE_ID, ACTOR), (e) => e instanceof common_1.ConflictException &&
            /already has 3 spaces/.test(e.message));
    });
    (0, node_test_1.it)('uses correct singular grammar when one existing space', async () => {
        const db = buildDb({ selectQueues: [[{ value: 1 }]] });
        const svc = new sample_data_service_1.SampleDataService(db, buildSecurity());
        await strict_1.default.rejects(() => svc.seed(WORKSPACE_ID, ACTOR), (e) => e instanceof common_1.ConflictException &&
            /already has 1 space\./.test(e.message));
    });
});
(0, node_test_1.describe)('SampleDataService.seed — actor membership guard', () => {
    (0, node_test_1.it)('rejects when actor is not a workspace member', async () => {
        // First select: empty workspace (count = 0).
        // Second select: membership lookup returns no rows.
        const db = buildDb({
            selectQueues: [
                [{ value: 0 }], // count(*) on spaces
                [], // workspaceMembers lookup
            ],
        });
        const svc = new sample_data_service_1.SampleDataService(db, buildSecurity());
        await strict_1.default.rejects(() => svc.seed(WORKSPACE_ID, ACTOR), (e) => e instanceof common_1.NotFoundException);
    });
});
(0, node_test_1.describe)('SampleDataService — audit logging happy path', () => {
    (0, node_test_1.it)('writes a workspace.demo_seeded audit event after seeding succeeds', async () => {
        // Build a DB that lets the seeder complete with minimal happy values.
        // Each select call FIFO order:
        //   1) count(*) spaces → 0 (empty workspace)
        //   2) workspaceMembers lookup → 1 row so actor passes membership
        const db = buildDb({
            selectQueues: [
                [{ value: 0 }],
                [{ id: 'wm-1', workspaceId: WORKSPACE_ID, userId: ACTOR.id, role: 'workspace_admin' }],
            ],
        });
        const security = buildSecurity();
        const svc = new sample_data_service_1.SampleDataService(db, security);
        const summary = await svc.seed(WORKSPACE_ID, ACTOR);
        // Cardinality sanity — recipe is fixed so these are exact.
        strict_1.default.ok(summary.spaces >= 3);
        strict_1.default.ok(summary.projects >= 4);
        strict_1.default.ok(summary.lists >= summary.projects * 4);
        strict_1.default.ok(summary.tasks >= 20);
        strict_1.default.ok(summary.docs >= 3);
        strict_1.default.ok(summary.goals >= 3);
        strict_1.default.ok(summary.labels >= 6);
        // Audit log was called exactly once with the expected action.
        const calls = security.logAuditEvent.mock.calls;
        strict_1.default.equal(calls.length, 1);
        const arg = calls[0].arguments[0];
        strict_1.default.equal(arg.action, 'workspace.demo_seeded');
        strict_1.default.equal(arg.workspaceId, WORKSPACE_ID);
        strict_1.default.equal(arg.actorId, ACTOR.id);
        strict_1.default.ok(typeof arg.metadata.tasks === 'number' && arg.metadata.tasks > 0);
    });
});
//# sourceMappingURL=sample-data.service.test.js.map
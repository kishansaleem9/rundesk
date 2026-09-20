"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const reports_service_1 = require("./reports.service");
/**
 * §3.3 View-Reports scoping + §9.3 completion/status-duration filters.
 *
 * Uses the repo's queued-result Drizzle stand-in: each top-level `select()`
 * pops the next planned rows and every chain verb (including `.limit`) is a
 * no-op that returns the same thenable. The WHERE/CASE SQL the service builds
 * is therefore exercised for real (drizzle builds the AST eagerly) but not
 * evaluated — so these tests lock the role→scope mapping, the in-memory
 * aggregation, and that the new scoped/ filtered SQL builds without throwing.
 */
function makeDb(selectResults) {
    const queue = [...selectResults];
    const VERBS = ['from', 'where', 'innerJoin', 'leftJoin', 'groupBy', 'orderBy', 'limit'];
    const node = (rows) => {
        const p = Promise.resolve(rows);
        for (const v of VERBS)
            p[v] = () => p;
        return p;
    };
    return { select: () => node(queue.shift() ?? []) };
}
(0, node_test_1.describe)('ReportsService.getViewerScope (§3.3)', () => {
    (0, node_test_1.it)('workspace_admin → { kind: all }', async () => {
        const svc = new reports_service_1.ReportsService(makeDb([[{ role: 'workspace_admin' }]]));
        strict_1.default.deepEqual(await svc.getViewerScope('w1', 'admin'), { kind: 'all' });
    });
    (0, node_test_1.it)('super_admin → { kind: all }', async () => {
        const svc = new reports_service_1.ReportsService(makeDb([[{ role: 'super_admin' }]]));
        strict_1.default.deepEqual(await svc.getViewerScope('w1', 'root'), { kind: 'all' });
    });
    (0, node_test_1.it)('manager → { kind: containers } with de-duped space/project ids + own userId', async () => {
        const svc = new reports_service_1.ReportsService(makeDb([
            [{ role: 'manager' }],
            [{ spaceId: 's1' }, { spaceId: 's2' }, { spaceId: 's1' }],
            [{ projectId: 'p1' }],
        ]));
        const scope = await svc.getViewerScope('w1', 'mgr');
        strict_1.default.deepEqual(scope, { kind: 'containers', spaceIds: ['s1', 's2'], projectIds: ['p1'], userId: 'mgr' });
    });
    (0, node_test_1.it)('manager with no container memberships still scopes to their own userId', async () => {
        const svc = new reports_service_1.ReportsService(makeDb([[{ role: 'manager' }], [], []]));
        strict_1.default.deepEqual(await svc.getViewerScope('w1', 'mgr'), {
            kind: 'containers',
            spaceIds: [],
            projectIds: [],
            userId: 'mgr',
        });
    });
    (0, node_test_1.it)('plain member → { kind: user }', async () => {
        const svc = new reports_service_1.ReportsService(makeDb([[{ role: 'member' }]]));
        strict_1.default.deepEqual(await svc.getViewerScope('w1', 'u1'), { kind: 'user', userId: 'u1' });
    });
    (0, node_test_1.it)('non-member (safe default) → { kind: user }', async () => {
        const svc = new reports_service_1.ReportsService(makeDb([[]]));
        strict_1.default.deepEqual(await svc.getViewerScope('w1', 'u1'), { kind: 'user', userId: 'u1' });
    });
});
(0, node_test_1.describe)('ReportsService.getProductivity viewer scope', () => {
    const prodRow = () => [
        { userId: 'a', displayName: 'Alice', email: 'a@x', avatarUrl: null, tasksCompleted: 2, tasksCreated: 1, totalAssigned: 3 },
    ];
    (0, node_test_1.it)('manager containers scope builds a scoped query and returns rows', async () => {
        const svc = new reports_service_1.ReportsService(makeDb([prodRow()]));
        const rows = await svc.getProductivity('w1', 30, {
            kind: 'containers',
            spaceIds: ['s1'],
            projectIds: ['p1'],
            userId: 'mgr',
        });
        strict_1.default.equal(rows.length, 1);
        strict_1.default.equal(rows[0].tasksCompleted, 2);
    });
    (0, node_test_1.it)('member (user scope) still returns their own row', async () => {
        const svc = new reports_service_1.ReportsService(makeDb([prodRow()]));
        const rows = await svc.getProductivity('w1', 30, { kind: 'user', userId: 'a' });
        strict_1.default.equal(rows.length, 1);
    });
    (0, node_test_1.it)('containers scope with empty ids falls back to own-only without throwing', async () => {
        const svc = new reports_service_1.ReportsService(makeDb([[]]));
        const rows = await svc.getProductivity('w1', 30, { kind: 'containers', spaceIds: [], projectIds: [], userId: 'mgr' });
        strict_1.default.deepEqual(rows, []);
    });
    (0, node_test_1.it)('defaults to { kind: all } when no viewer is supplied', async () => {
        const svc = new reports_service_1.ReportsService(makeDb([prodRow()]));
        const rows = await svc.getProductivity('w1');
        strict_1.default.equal(rows.length, 1);
    });
});
(0, node_test_1.describe)('ReportsService time reports viewer scope', () => {
    (0, node_test_1.it)('getTimeReport containers scope wraps sums and converts to hours', async () => {
        const svc = new reports_service_1.ReportsService(makeDb([[{ userId: 'a', displayName: 'Alice', email: 'a@x', totalSeconds: 3600, billableSeconds: 1800, entryCount: 2 }]]));
        const rows = await svc.getTimeReport('w1', 30, { kind: 'containers', spaceIds: ['s1'], projectIds: [], userId: 'mgr' });
        strict_1.default.equal(rows[0].totalHours, 1);
        strict_1.default.equal(rows[0].billableHours, 0.5);
    });
    (0, node_test_1.it)('getTimeByProject user scope filters by owner and returns per-project hours', async () => {
        const svc = new reports_service_1.ReportsService(makeDb([[{ projectId: 'p1', projectName: 'P', clientId: null, clientName: null, totalSeconds: 7200, billableSeconds: 3600, entryCount: 4 }]]));
        const rows = await svc.getTimeByProject('w1', 30, { kind: 'user', userId: 'a' });
        strict_1.default.equal(rows[0].totalHours, 2);
        strict_1.default.equal(rows[0].billableHours, 1);
    });
    (0, node_test_1.it)('getTimeByProject containers scope builds an OR predicate without throwing', async () => {
        const svc = new reports_service_1.ReportsService(makeDb([[]]));
        const rows = await svc.getTimeByProject('w1', 30, { kind: 'containers', spaceIds: ['s1'], projectIds: ['p1'], userId: 'mgr' });
        strict_1.default.deepEqual(rows, []);
    });
});
(0, node_test_1.describe)('ReportsService.getContribution manager scope (§3.3)', () => {
    (0, node_test_1.it)('applies the container aggregate filter without dropping team members', async () => {
        const svc = new reports_service_1.ReportsService(makeDb([
            [
                { userId: 'a', name: 'Alice', email: 'a@x' },
                { userId: 'b', name: 'Bob', email: 'b@x' },
            ],
            [{ userId: 'a', completed: 2, onTime: 2, assigned: 3 }],
            [{ actorId: 'a', action: 'commented', count: 1 }],
        ]));
        const res = await svc.getContribution('w1', {
            period: 'this-month',
            viewer: { kind: 'containers', spaceIds: ['s1'], projectIds: ['p1'], userId: 'a' },
        });
        strict_1.default.equal(res.members.length, 2);
        const alice = res.members.find((m) => m.name === 'Alice');
        strict_1.default.equal(alice.tasksCompleted, 2);
        strict_1.default.equal(alice.onTimeRate, 100);
    });
});
(0, node_test_1.describe)('ReportsService.getCompletionAnalytics filters (§9.3)', () => {
    // t1 done on-time, t2 open, t3 done late.
    const taskRows = () => [
        { id: 't1', status: 'done', dueDate: new Date('2026-06-10'), completedAt: new Date('2026-06-08'), createdAt: new Date('2026-06-01') },
        { id: 't2', status: 'in_progress', dueDate: null, completedAt: null, createdAt: new Date('2026-06-02') },
        { id: 't3', status: 'done', dueDate: new Date('2026-06-05'), completedAt: new Date('2026-06-09'), createdAt: new Date('2026-06-03') },
    ];
    (0, node_test_1.it)('computes totals / on-time / late with no filter (current behaviour)', async () => {
        const svc = new reports_service_1.ReportsService(makeDb([taskRows()]));
        const res = await svc.getCompletionAnalytics('w1', 3650);
        strict_1.default.equal(res.total, 3);
        strict_1.default.equal(res.completed, 2);
        strict_1.default.equal(res.onTime, 1);
        strict_1.default.equal(res.late, 1);
        strict_1.default.equal(res.completionRate, 67);
    });
    (0, node_test_1.it)('accepts space/project/member filters (builds the assignee EXISTS predicate)', async () => {
        const svc = new reports_service_1.ReportsService(makeDb([taskRows()]));
        const res = await svc.getCompletionAnalytics('w1', 3650, { spaceId: 's1', projectId: 'p1', memberId: 'u1' });
        strict_1.default.equal(res.total, 3);
        strict_1.default.equal(res.completed, 2);
        strict_1.default.equal(res.onTime, 1);
    });
});
(0, node_test_1.describe)('ReportsService.getStatusDurations filters (§9.3)', () => {
    // t1: enters in_progress, then done 2h later.
    const events = () => [
        { taskId: 't1', meta: { to: 'in_progress' }, createdAt: new Date('2026-06-01T00:00:00Z') },
        { taskId: 't1', meta: { to: 'done' }, createdAt: new Date('2026-06-01T02:00:00Z') },
    ];
    (0, node_test_1.it)('derives per-status average hours with no filter', async () => {
        const svc = new reports_service_1.ReportsService(makeDb([events()]));
        const res = await svc.getStatusDurations('w1', 3650);
        const inProgress = res.find((r) => r.status === 'in_progress');
        strict_1.default.equal(inProgress.avgHours, 2);
        strict_1.default.equal(inProgress.samples, 1);
    });
    (0, node_test_1.it)('accepts space/project/member filters without changing the derivation', async () => {
        const svc = new reports_service_1.ReportsService(makeDb([events()]));
        const res = await svc.getStatusDurations('w1', 3650, { spaceId: 's1', projectId: 'p1', memberId: 'u1' });
        const inProgress = res.find((r) => r.status === 'in_progress');
        strict_1.default.equal(inProgress.avgHours, 2);
    });
});
//# sourceMappingURL=reports-scope.test.js.map
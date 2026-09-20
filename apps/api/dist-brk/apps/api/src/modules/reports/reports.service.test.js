"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const reports_service_1 = require("./reports.service");
/**
 * The custom-report engine runs a few queries then aggregates in memory.
 * We mock Drizzle with a thenable chain that yields the next queued result
 * per top-level select() call (task rows, then assignee rows).
 */
function makeDb(selectResults) {
    let i = 0;
    const chain = (rows) => {
        const c = {
            from: () => c,
            where: () => c,
            innerJoin: () => c,
            leftJoin: () => c,
            groupBy: () => c,
            orderBy: () => c,
            then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject),
        };
        return c;
    };
    return { select: () => chain(selectResults[i++] ?? []) };
}
const day = (s) => new Date(s);
// task1: closed + on time (A); task2: open (A); task3: closed + late (B)
const taskRows = () => [
    {
        id: 't1', status: 'done', statusCategory: 'closed', priority: 'high',
        createdAt: day('2026-06-01'), dueDate: day('2026-06-10'), completedAt: day('2026-06-08'),
        projectId: 'p1', projectName: 'Launch',
    },
    {
        id: 't2', status: 'in_progress', statusCategory: 'open', priority: 'normal',
        createdAt: day('2026-06-02'), dueDate: day('2026-06-12'), completedAt: null,
        projectId: 'p1', projectName: 'Launch',
    },
    {
        id: 't3', status: 'done', statusCategory: 'closed', priority: 'low',
        createdAt: day('2026-06-03'), dueDate: day('2026-06-05'), completedAt: day('2026-06-09'),
        projectId: 'p1', projectName: 'Launch',
    },
];
const assigneeRows = () => [
    { taskId: 't1', userId: 'A', name: 'Alice', email: 'a@x.com' },
    { taskId: 't2', userId: 'A', name: 'Alice', email: 'a@x.com' },
    { taskId: 't3', userId: 'B', name: 'Bob', email: 'b@x.com' },
];
(0, node_test_1.describe)('ReportsService.runCustomReport', () => {
    (0, node_test_1.it)('groups by assignee and computes count/completed/on-time-rate', async () => {
        const svc = new reports_service_1.ReportsService(makeDb([taskRows(), assigneeRows()]));
        const res = await svc.runCustomReport('w1', {
            dimension: 'assignee',
            metrics: ['tasks-count', 'tasks-completed', 'on-time-rate'],
            days: 3650,
        });
        strict_1.default.equal(res.dimension, 'assignee');
        strict_1.default.deepEqual(res.metrics, ['tasks-count', 'tasks-completed', 'on-time-rate']);
        // sorted by primary metric (tasks-count) desc → Alice (2) before Bob (1)
        const alice = res.rows.find((r) => r.label === 'Alice');
        const bob = res.rows.find((r) => r.label === 'Bob');
        strict_1.default.equal(res.rows[0].label, 'Alice');
        strict_1.default.deepEqual(alice.values, { 'tasks-count': 2, 'tasks-completed': 1, 'on-time-rate': 100 });
        strict_1.default.deepEqual(bob.values, { 'tasks-count': 1, 'tasks-completed': 1, 'on-time-rate': 0 });
    });
    (0, node_test_1.it)('groups by priority', async () => {
        const svc = new reports_service_1.ReportsService(makeDb([taskRows(), assigneeRows()]));
        const res = await svc.runCustomReport('w1', { dimension: 'priority', metrics: ['tasks-count'], days: 3650 });
        const labels = res.rows.map((r) => r.label).sort();
        strict_1.default.deepEqual(labels, ['high', 'low', 'normal']);
    });
    (0, node_test_1.it)('falls back to tasks-count when no valid metric is given', async () => {
        const svc = new reports_service_1.ReportsService(makeDb([taskRows(), assigneeRows()]));
        const res = await svc.runCustomReport('w1', { dimension: 'assignee', metrics: ['bogus'], days: 3650 });
        strict_1.default.deepEqual(res.metrics, ['tasks-count']);
    });
});
(0, node_test_1.describe)('ReportsService.exportCustomReportCsv', () => {
    (0, node_test_1.it)('emits a header row and one row per group', async () => {
        const svc = new reports_service_1.ReportsService(makeDb([taskRows(), assigneeRows()]));
        const csv = await svc.exportCustomReportCsv('w1', {
            dimension: 'assignee',
            metrics: ['tasks-count', 'tasks-completed'],
            days: 3650,
        });
        const lines = csv.split('\n');
        strict_1.default.equal(lines[0], 'group,tasks-count,tasks-completed');
        strict_1.default.equal(lines.length, 3); // header + Alice + Bob
        strict_1.default.ok(lines.some((l) => l.startsWith('Alice,2,1')));
        strict_1.default.ok(lines.some((l) => l.startsWith('Bob,1,1')));
    });
});
(0, node_test_1.describe)('isWorkingWeekday', () => {
    // The column stores ISO weekdays (1=Mon..7=Sun); Date.getDay() is 0=Sun..6=Sat.
    // These dates are pinned so the mapping is checked, not assumed.
    const MON = new Date('2026-08-03T12:00:00');
    const FRI = new Date('2026-08-07T12:00:00');
    const SAT = new Date('2026-08-08T12:00:00');
    const SUN = new Date('2026-08-09T12:00:00');
    (0, node_test_1.it)('treats a Mon–Fri week the way every existing workspace expects', () => {
        const w = new Set([1, 2, 3, 4, 5]);
        strict_1.default.equal((0, reports_service_1.isWorkingWeekday)(MON, w), true);
        strict_1.default.equal((0, reports_service_1.isWorkingWeekday)(FRI, w), true);
        strict_1.default.equal((0, reports_service_1.isWorkingWeekday)(SAT, w), false);
        strict_1.default.equal((0, reports_service_1.isWorkingWeekday)(SUN, w), false);
    });
    (0, node_test_1.it)('maps Sunday to 7, not 0 — the off-by-one this helper exists to pin', () => {
        // A set containing 0 must match nothing: 0 is not a valid ISO weekday, and
        // reading getDay() straight through would have made it mean Sunday.
        strict_1.default.equal((0, reports_service_1.isWorkingWeekday)(SUN, new Set([0])), false);
        strict_1.default.equal((0, reports_service_1.isWorkingWeekday)(SUN, new Set([7])), true);
    });
    (0, node_test_1.it)('handles a Sun–Thu week, which is the case the feature was added for', () => {
        const w = new Set([7, 1, 2, 3, 4]);
        strict_1.default.equal((0, reports_service_1.isWorkingWeekday)(SUN, w), true);
        strict_1.default.equal((0, reports_service_1.isWorkingWeekday)(MON, w), true);
        strict_1.default.equal((0, reports_service_1.isWorkingWeekday)(FRI, w), false);
        strict_1.default.equal((0, reports_service_1.isWorkingWeekday)(SAT, w), false);
    });
    (0, node_test_1.it)('an empty set makes every day a non-working day', () => {
        const none = new Set();
        for (const d of [MON, FRI, SAT, SUN])
            strict_1.default.equal((0, reports_service_1.isWorkingWeekday)(d, none), false);
    });
});
//# sourceMappingURL=reports.service.test.js.map
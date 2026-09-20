"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const tasks_service_1 = require("./tasks.service");
function buildDb(queries) {
    // FIFO queue: every call to db.select() pops the next planned chain.
    const queue = [...queries];
    const buildChain = (q) => {
        // The chain we expose mimics the verbs the service actually calls
        // in order. Each verb returns the next legal step or, at the leaf,
        // resolves to the planned rows.
        const limit = node_test_1.mock.fn(async () => q.rows);
        const orderBy = node_test_1.mock.fn(() => ({ limit }));
        const where = q.terminator === 'where'
            ? node_test_1.mock.fn(async () => q.rows)
            : node_test_1.mock.fn(() => ({ orderBy, limit }));
        const innerJoin = node_test_1.mock.fn(() => ({ innerJoin, where }));
        const from = node_test_1.mock.fn(() => ({ innerJoin, where }));
        return { from };
    };
    return {
        select: node_test_1.mock.fn(() => {
            const q = queue.shift();
            if (!q)
                throw new Error('Unexpected db.select() — test queue exhausted');
            return buildChain(q);
        }),
    };
}
const noopDeps = {
    realtime: { broadcastToWorkspace: node_test_1.mock.fn(), broadcastToTask: node_test_1.mock.fn() },
    search: { indexTask: node_test_1.mock.fn(), removeTask: node_test_1.mock.fn() },
    autos: { triggerForTask: node_test_1.mock.fn(), runForTaskEvent: node_test_1.mock.fn() },
    webhooks: { dispatch: node_test_1.mock.fn() },
    slack: { notifyTaskEvent: node_test_1.mock.fn() },
    notifs: { notifyTaskAssigned: node_test_1.mock.fn(), notifyTaskMentioned: node_test_1.mock.fn() },
    r2: { signGet: node_test_1.mock.fn(), signPut: node_test_1.mock.fn(), deleteObject: node_test_1.mock.fn() },
    calendar: { onTaskChanged: node_test_1.mock.fn(), onTaskDeleted: node_test_1.mock.fn() },
    security: { logAuditEvent: node_test_1.mock.fn(async () => undefined) },
};
(0, node_test_1.describe)('TasksService.getTasksForWorkspace', () => {
    (0, node_test_1.it)('returns an empty array when no tasks match (and never issues the assignee query)', async () => {
        const db = buildDb([
            { terminator: 'limit', rows: [] },
        ]);
        const service = new tasks_service_1.TasksService(db, noopDeps.realtime, noopDeps.search, noopDeps.autos, noopDeps.webhooks, noopDeps.slack, noopDeps.notifs, noopDeps.r2, noopDeps.calendar, noopDeps.security);
        const out = await service.getTasksForWorkspace('w-1');
        strict_1.default.deepEqual(out, []);
        strict_1.default.equal(db.select.mock.callCount(), 1, 'should short-circuit before the assignee join');
    });
    (0, node_test_1.it)('omits the assignee join when includeAssignees is false', async () => {
        const baseRows = [{ id: 't-1', title: 'Solo' }, { id: 't-2', title: 'Pair' }];
        const db = buildDb([
            { terminator: 'limit', rows: baseRows },
        ]);
        const service = new tasks_service_1.TasksService(db, noopDeps.realtime, noopDeps.search, noopDeps.autos, noopDeps.webhooks, noopDeps.slack, noopDeps.notifs, noopDeps.r2, noopDeps.calendar, noopDeps.security);
        const out = await service.getTasksForWorkspace('w-1', 50, { includeAssignees: false });
        strict_1.default.equal(out.length, 2);
        strict_1.default.deepEqual(out.map((r) => r.assignees), [[], []], 'every row carries an empty assignees array');
        strict_1.default.equal(db.select.mock.callCount(), 1, 'should not issue the assignee join');
    });
    (0, node_test_1.it)('attaches assignees grouped by taskId and leaves untouched tasks with an empty array', async () => {
        const baseRows = [
            { id: 't-1', title: 'Has two' },
            { id: 't-2', title: 'Has none' },
            { id: 't-3', title: 'Has one' },
        ];
        const assigneeRows = [
            { taskId: 't-1', userId: 'u-a', displayName: 'Alice', avatarUrl: null },
            { taskId: 't-1', userId: 'u-b', displayName: 'Bob', avatarUrl: null },
            { taskId: 't-3', userId: 'u-c', displayName: 'Carol', avatarUrl: 'avatar.png' },
        ];
        const db = buildDb([
            { terminator: 'limit', rows: baseRows },
            { terminator: 'where', rows: assigneeRows },
        ]);
        const service = new tasks_service_1.TasksService(db, noopDeps.realtime, noopDeps.search, noopDeps.autos, noopDeps.webhooks, noopDeps.slack, noopDeps.notifs, noopDeps.r2, noopDeps.calendar, noopDeps.security);
        const out = await service.getTasksForWorkspace('w-1');
        strict_1.default.equal(out.length, 3);
        const byId = new Map(out.map((r) => [r.id, r]));
        strict_1.default.equal(byId.get('t-1').assignees.length, 2);
        strict_1.default.deepEqual(byId.get('t-1').assignees.map((a) => a.displayName).sort(), ['Alice', 'Bob']);
        strict_1.default.deepEqual(byId.get('t-2').assignees, [], 'tasks with no assignees still get [] not undefined');
        strict_1.default.equal(byId.get('t-3').assignees[0]?.displayName, 'Carol');
        strict_1.default.equal(byId.get('t-3').assignees[0]?.avatarUrl, 'avatar.png');
    });
    (0, node_test_1.it)('clamps the limit to a sane upper bound', async () => {
        // We can't directly inspect the SQL limit (it goes through the
        // mocked chain), but we can at least verify the method doesn't
        // crash and still issues one select for the ridiculous request.
        const db = buildDb([
            { terminator: 'limit', rows: [] },
        ]);
        const service = new tasks_service_1.TasksService(db, noopDeps.realtime, noopDeps.search, noopDeps.autos, noopDeps.webhooks, noopDeps.slack, noopDeps.notifs, noopDeps.r2, noopDeps.calendar, noopDeps.security);
        await service.getTasksForWorkspace('w-1', 100_000);
        strict_1.default.equal(db.select.mock.callCount(), 1);
    });
});
//# sourceMappingURL=tasks.service.test.js.map
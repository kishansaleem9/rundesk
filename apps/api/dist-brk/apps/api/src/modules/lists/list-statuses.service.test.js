"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const list_statuses_service_1 = require("./list-statuses.service");
/**
 * Build a Drizzle-shaped mock with stage-by-stage chain support. Each stage
 * returns the next chain segment; resolve points return scripted fixtures.
 * Keeping it minimal lets the tests describe behaviour without re-creating
 * the full ORM surface.
 */
function buildDb(opts = {}) {
    // Dispatch from(table) by detecting which select shape was used; the
    // chain resolver treats each .from() call as its own pipeline.
    const fromHandler = () => {
        return {
            where: node_test_1.mock.fn(() => ({
                // limit() -> used by requireById / assertListExists / getByKey
                limit: node_test_1.mock.fn(async () => {
                    if (opts.listExists === false)
                        return [];
                    return opts.statusesByList ?? [];
                }),
                // orderBy() -> used by list()
                orderBy: node_test_1.mock.fn(async () => opts.statusesByList ?? []),
            })),
        };
    };
    return {
        select: node_test_1.mock.fn((shape) => {
            // Detect the count(*) call shape used by remove()
            const isCount = shape && Object.values(shape ?? {}).some((v) => {
                return typeof v === 'object' && v !== null && 'queryChunks' in v;
            });
            if (isCount) {
                return {
                    from: node_test_1.mock.fn(() => ({
                        where: node_test_1.mock.fn(async () => [{ count: opts.taskCountByStatus ?? 0 }]),
                    })),
                };
            }
            // assertListExists detection: shape with `id`
            if (shape && typeof shape === 'object' && 'id' in shape && Object.keys(shape).length === 1) {
                return {
                    from: node_test_1.mock.fn(() => ({
                        where: node_test_1.mock.fn(() => ({
                            limit: node_test_1.mock.fn(async () => (opts.listExists === false ? [] : [{ id: 'list-1' }])),
                        })),
                    })),
                };
            }
            // nextPosition detection: shape with `maxPos`
            if (shape && typeof shape === 'object' && 'maxPos' in shape) {
                return {
                    from: node_test_1.mock.fn(() => ({
                        where: node_test_1.mock.fn(async () => [{ maxPos: -1 }]),
                    })),
                };
            }
            // getListStatusContext detection: shape with `scope` (lists ⋈ projects).
            // Default fixtures use scope 'list' so the list owns its own pipeline.
            if (shape && typeof shape === 'object' && 'scope' in shape) {
                return {
                    from: node_test_1.mock.fn(() => ({
                        innerJoin: node_test_1.mock.fn(() => ({
                            where: node_test_1.mock.fn(() => ({
                                limit: node_test_1.mock.fn(async () => [
                                    { listId: 'list-1', projectId: 'proj-1', scope: 'list', spaceId: 'space-1' },
                                ]),
                            })),
                        })),
                    })),
                };
            }
            return { from: fromHandler };
        }),
        insert: node_test_1.mock.fn(() => ({
            values: node_test_1.mock.fn(() => ({
                returning: node_test_1.mock.fn(async () => opts.insertReturning ?? [{ id: 'st-1' }]),
                onConflictDoNothing: node_test_1.mock.fn(async () => undefined),
            })),
        })),
        update: node_test_1.mock.fn(() => ({
            set: node_test_1.mock.fn(() => ({
                where: node_test_1.mock.fn(() => ({
                    returning: node_test_1.mock.fn(async () => opts.updateReturning ?? [{ id: 'st-1', name: 'Renamed' }]),
                })),
            })),
        })),
        delete: node_test_1.mock.fn(() => ({
            where: node_test_1.mock.fn(async () => undefined),
        })),
    };
}
(0, node_test_1.describe)('ListStatusesService', () => {
    (0, node_test_1.it)('create() rejects empty name', async () => {
        const svc = new list_statuses_service_1.ListStatusesService(buildDb({ listExists: true }));
        await strict_1.default.rejects(() => svc.create('list-1', { name: '   ' }), (e) => e instanceof common_1.BadRequestException);
    });
    (0, node_test_1.it)('create() rejects unknown category', async () => {
        const svc = new list_statuses_service_1.ListStatusesService(buildDb({ listExists: true }));
        await strict_1.default.rejects(() => svc.create('list-1', { name: 'Triaged', category: 'bogus' }), (e) => e instanceof common_1.BadRequestException);
    });
    (0, node_test_1.it)('create() throws NotFound when list does not exist', async () => {
        const svc = new list_statuses_service_1.ListStatusesService(buildDb({ listExists: false }));
        await strict_1.default.rejects(() => svc.create('list-missing', { name: 'Triaged' }), (e) => e instanceof common_1.NotFoundException);
    });
    (0, node_test_1.it)('update() rejects empty name patch', async () => {
        const svc = new list_statuses_service_1.ListStatusesService(buildDb({ statusesByList: [{ id: 'st-1', listId: 'list-1', key: 'todo', category: 'open' }] }));
        await strict_1.default.rejects(() => svc.update('list-1', 'st-1', { name: '   ' }), (e) => e instanceof common_1.BadRequestException);
    });
    (0, node_test_1.it)('remove() refuses when tasks still reference the status and no reassign target is provided', async () => {
        const svc = new list_statuses_service_1.ListStatusesService(buildDb({
            statusesByList: [{ id: 'st-1', listId: 'list-1', key: 'todo', category: 'open' }],
            taskCountByStatus: 3,
        }));
        await strict_1.default.rejects(() => svc.remove('list-1', 'st-1', null), (e) => e instanceof common_1.BadRequestException &&
            /still use it/.test(e.message));
    });
    (0, node_test_1.it)('list() returns rows ordered by position', async () => {
        const fixtures = [
            { id: 'st-1', key: 'todo', position: 1 },
            { id: 'st-0', key: 'backlog', position: 0 },
        ];
        // Service relies on the DB to apply orderBy; we simulate by returning the
        // sorted fixture from the chain resolver.
        const sorted = [...fixtures].sort((a, b) => a.position - b.position);
        const svc = new list_statuses_service_1.ListStatusesService(buildDb({ statusesByList: sorted }));
        const out = await svc.list('list-1');
        strict_1.default.equal(out[0].key, 'backlog');
        strict_1.default.equal(out[1].key, 'todo');
    });
});
//# sourceMappingURL=list-statuses.service.test.js.map
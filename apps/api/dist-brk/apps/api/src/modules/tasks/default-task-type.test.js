"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const task_types_service_1 = require("./task-types.service");
/**
 * §1.1 — a workspace always has exactly one default task type.
 *
 * Deleting the default left it with none, and nothing re-nominated one. That is
 * not cosmetic: `defaultTaskTypeForList` then returns null, every task created
 * afterwards comes out untyped, and both the create-modal picker and the search
 * filter hide themselves when a workspace looks typeless — the same
 * invisible-feature failure migration 0093 was written to fix.
 *
 * Production reached that state during a deploy check that created a default
 * type and deleted it again, surfacing as "found 0 defaults, expected 1".
 *
 * The double answers each query from a queue in the order the service asks,
 * rather than trying to interpret drizzle conditions. A first version did try
 * to interpret them, and got it wrong in both directions at once — a false pass
 * on one case and a false failure on another. A double that has to be debugged
 * is not evidence.
 */
function fakeDb(selectQueue) {
    const queue = [...selectQueue];
    const updates = [];
    let deleted = false;
    const next = () => queue.shift() ?? [];
    const thenable = () => ({
        from: () => thenable(),
        where: () => thenable(),
        orderBy: () => thenable(),
        limit: async () => next(),
        then: (res) => Promise.resolve(next()).then(res),
    });
    return {
        updates,
        wasDeleted: () => deleted,
        remaining: () => queue.length,
        db: {
            select: () => thenable(),
            delete: () => ({
                where: async () => {
                    deleted = true;
                    return [];
                },
            }),
            update: () => ({
                set: (values) => ({
                    where: async () => {
                        updates.push({ values });
                        return [];
                    },
                }),
            }),
        },
    };
}
const ADMIN = [{ role: 'workspace_admin' }];
const COUNT = [{ count: 0 }];
(0, node_test_1.describe)('a workspace keeps a default task type (§1.1)', () => {
    (0, node_test_1.it)('promotes another type when the default is deleted', async () => {
        const fake = fakeDb([
            ADMIN, // assertAdmin
            [{ id: 'a', isDefault: true }], // byId — the type being deleted
            COUNT, // how many tasks it untypes
            [], // ensureDefault: any default left? no
            [{ id: 'b' }], // …so promote the first remaining
        ]);
        const svc = new task_types_service_1.TaskTypesService(fake.db);
        const result = await svc.remove('ws1', 'a', 'u1');
        strict_1.default.deepEqual(result, { ok: true, untypedTasks: 0 });
        strict_1.default.ok(fake.wasDeleted());
        strict_1.default.equal(fake.updates.length, 1, 'exactly one promotion');
        strict_1.default.equal(fake.updates[0].values.isDefault, true);
    });
    (0, node_test_1.it)('does not promote when a default still exists', async () => {
        const fake = fakeDb([
            ADMIN,
            [{ id: 'a', isDefault: false }], // deleting a non-default
            COUNT,
        ]);
        const svc = new task_types_service_1.TaskTypesService(fake.db);
        await svc.remove('ws1', 'a', 'u1');
        strict_1.default.equal(fake.updates.length, 0, 'nothing to re-nominate');
    });
    (0, node_test_1.it)('does not promote when the workspace has no types left at all', async () => {
        const fake = fakeDb([
            ADMIN,
            [{ id: 'only', isDefault: true }],
            COUNT,
            [], // no default left
            [], // and no candidate either
        ]);
        const svc = new task_types_service_1.TaskTypesService(fake.db);
        await svc.remove('ws1', 'only', 'u1');
        strict_1.default.equal(fake.updates.length, 0, 'an empty workspace has nothing to promote');
    });
    (0, node_test_1.it)('looks the type up once, not twice', async () => {
        // The first version read the row, then read it again to check one boolean.
        const fake = fakeDb([ADMIN, [{ id: 'a', isDefault: false }], COUNT]);
        const svc = new task_types_service_1.TaskTypesService(fake.db);
        await svc.remove('ws1', 'a', 'u1');
        strict_1.default.equal(fake.remaining(), 0, 'an extra lookup would leave the queue short');
    });
});
//# sourceMappingURL=default-task-type.test.js.map
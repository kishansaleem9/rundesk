"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const task_types_service_1 = require("./task-types.service");
/**
 * §1.1 — one milestone, not two.
 *
 * `tasks.is_milestone` draws the diamond on the timeline, the badge in lists and
 * subtask rows, and the marker in the client portal. Task types arrived later
 * with a "Milestone" among them and no relationship to it, so setting the type
 * drew nothing and drawing the diamond left the task invisible to a search
 * filtered by the Milestone type — two names for one idea, disagreeing.
 *
 * Three paths can change one side: creating a task, changing its type, and
 * toggling the diamond. Miss one and the two drift apart again for whichever
 * tasks happen to go through it.
 *
 * The type-change path is exercised for real below — TaskTypesService takes
 * only a db, so a fake one shows what is actually written. The create and
 * update paths live on TasksService behind ten injected services; those are
 * checked at the source, which is weaker and labelled as such rather than
 * dressed up as behaviour.
 */
/**
 * Walk up to the workspace root rather than counting `../`s: this file compiles
 * to CJS (so no import.meta) and the runner's cwd depends on whether the suite
 * was started from the package or the repo.
 */
function workspaceRoot(from) {
    let dir = from;
    for (;;) {
        if ((0, node_fs_1.existsSync)((0, node_path_1.join)(dir, 'pnpm-workspace.yaml')))
            return dir;
        const up = (0, node_path_1.dirname)(dir);
        if (up === dir)
            throw new Error('workspace root not found');
        dir = up;
    }
}
const repo = workspaceRoot(process.cwd());
const read = (rel) => (0, node_fs_1.readFileSync)((0, node_path_1.join)(repo, rel), 'utf8');
/** Records what `setForTask` writes, and answers the lookups it makes first. */
function fakeDb({ type }) {
    const writes = [];
    const selectResult = () => {
        // Two shapes of read happen before the write: the task's workspace + the
        // caller's membership, then the type itself. Any non-empty row satisfies
        // the first two; the third needs the type.
        return [{ workspaceId: 'ws1', role: 'workspace_admin', ...(type ?? {}) }];
    };
    const chain = {};
    const thenable = (rows) => ({
        from: () => thenable(rows),
        innerJoin: () => thenable(rows),
        where: () => thenable(rows),
        limit: async () => rows,
        then: (res) => Promise.resolve(rows).then(res),
    });
    chain.select = () => thenable(selectResult());
    chain.update = () => ({
        set: (values) => {
            writes.push(values);
            return {
                where: () => ({ returning: async () => [{ id: 't1', ...values }] }),
            };
        },
    });
    return { db: chain, writes };
}
(0, node_test_1.describe)('milestone / task type link (§1.1)', () => {
    (0, node_test_1.describe)('changing a task type writes both sides', () => {
        (0, node_test_1.it)('moving onto a milestone type draws the diamond', async () => {
            const { db, writes } = fakeDb({ type: { id: 'ty-ms', isMilestone: true } });
            const svc = new task_types_service_1.TaskTypesService(db);
            await svc.setForTask('t1', 'ty-ms', 'u1');
            strict_1.default.equal(writes[0].taskTypeId, 'ty-ms');
            strict_1.default.equal(writes[0].isMilestone, true, 'the surfaces all render from this flag');
        });
        (0, node_test_1.it)('moving onto an ordinary type stops drawing it', async () => {
            const { db, writes } = fakeDb({ type: { id: 'ty-task', isMilestone: false } });
            const svc = new task_types_service_1.TaskTypesService(db);
            await svc.setForTask('t1', 'ty-task', 'u1');
            strict_1.default.equal(writes[0].isMilestone, false, 'a one-way sync would leave the diamond behind');
        });
        (0, node_test_1.it)('clearing the type clears it too', async () => {
            const { db, writes } = fakeDb({ type: null });
            const svc = new task_types_service_1.TaskTypesService(db);
            await svc.setForTask('t1', null, 'u1');
            strict_1.default.equal(writes[0].taskTypeId, null);
            strict_1.default.equal(writes[0].isMilestone, false);
        });
    });
    // ---------------------------------------------------------------------
    // Source-level. TasksService needs ten collaborators to construct, so these
    // check that the wiring is present rather than that it behaves — a weaker
    // claim, deliberately not written as if it were the stronger one.
    // ---------------------------------------------------------------------
    (0, node_test_1.describe)('the create and update paths carry the link (source-level)', () => {
        const tasksService = read('apps/api/src/modules/tasks/tasks.service.ts');
        (0, node_test_1.it)('creating with a milestone type sets the flag', () => {
            strict_1.default.match(tasksService, /typeIsMilestone\(resolvedTypeId\)/);
        });
        (0, node_test_1.it)('creating a milestone without a type picks up the workspace milestone type', () => {
            strict_1.default.match(tasksService, /milestoneTypeForList\(data\.listId\)/);
        });
        (0, node_test_1.it)('toggling the diamond fills in a missing type and clears a milestone one', () => {
            strict_1.default.match(tasksService, /set\.isMilestone === true && !before\.taskTypeId/);
            strict_1.default.match(tasksService, /set\.isMilestone === false && before\.taskTypeId/);
        });
        (0, node_test_1.it)('leaves a type someone chose deliberately alone', () => {
            strict_1.default.match(tasksService, /!before\.taskTypeId/, 'toggling the diamond on an Invoice must leave it an Invoice');
        });
    });
    (0, node_test_1.describe)('the schema and the backfill', () => {
        const schema = read('packages/db/src/schema/task-types.ts');
        const migration = read('packages/db/src/migrations/0095_milestone_type_link.sql');
        (0, node_test_1.it)('a type can declare that it makes tasks milestones', () => {
            strict_1.default.match(schema, /isMilestone:\s*boolean\('is_milestone'\)/);
        });
        (0, node_test_1.it)('the seeded Milestone type is one, and Task is not', () => {
            const seed = schema.slice(schema.indexOf('DEFAULT_TASK_TYPES'));
            strict_1.default.match(seed, /name: 'Milestone'[^}]*isMilestone: true/);
            strict_1.default.match(seed, /name: 'Task'[^}]*isMilestone: false/);
        });
        (0, node_test_1.it)('reconciles existing data in both directions', () => {
            strict_1.default.match(migration, /UPDATE tasks\s+SET task_type_id/, 'milestone tasks take the type');
            strict_1.default.match(migration, /SET is_milestone = true/, 'typed milestones get the flag');
            strict_1.default.match(migration, /tasks\.task_type_id IS NULL/, 'only where no type was chosen');
        });
        (0, node_test_1.it)('creates a milestone type before pointing tasks at one', () => {
            const insertAt = migration.indexOf('INSERT INTO task_types');
            const backfillAt = migration.indexOf('SET task_type_id');
            strict_1.default.ok(insertAt !== -1 && backfillAt !== -1 && insertAt < backfillAt);
        });
    });
});
//# sourceMappingURL=milestone-type-link.test.js.map
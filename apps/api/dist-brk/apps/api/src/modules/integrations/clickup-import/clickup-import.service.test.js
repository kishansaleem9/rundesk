"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const db_1 = require("@rundesk/db");
const clickup_import_service_1 = require("./clickup-import.service");
/**
 * §12.5 ClickUp import — service behaviour that needs the DB shape:
 *   - duplicate detection in `preview` (against the target scope + within file)
 *   - per-row conflict strategy (skip / create) with the right created/skipped
 *     tallies
 *   - custom-field definitions + values written during import
 *   - the job progress counters streamed into `clickup_import_jobs`
 *
 * A tiny drizzle stand-in records inserts + update payloads and hands back
 * queued select results. Insert `.returning()` yields a synthetic id so the
 * import can wire values/subtasks.
 */
function makeDb(selects = []) {
    const selectQueue = [...selects];
    const inserts = [];
    const updates = [];
    let idCounter = 0;
    const VERBS = [
        'from', 'where', 'limit', 'innerJoin', 'leftJoin', 'orderBy', 'set',
        'returning', 'onConflictDoNothing', 'onConflictDoUpdate',
    ];
    const node = (rows) => {
        const p = Promise.resolve(rows);
        for (const v of VERBS)
            p[v] = () => p;
        return p;
    };
    const db = {
        select: () => node(selectQueue.shift() ?? []),
        insert: (table) => ({
            values: (v) => {
                const id = `id-${++idCounter}`;
                inserts.push({ table, values: v });
                return node([{ id, ...v }]);
            },
        }),
        update: (table) => ({
            set: (s) => {
                updates.push({ table, set: s });
                return node([]);
            },
        }),
        delete: () => node([]),
    };
    return { db, inserts, updates };
}
const insertsInto = (inserts, table) => inserts.filter((r) => r.table === table).map((r) => r.values);
const jobUpdates = (updates) => updates.filter((r) => r.table === db_1.clickupImportJobs).map((r) => r.set);
(0, node_test_1.describe)('ClickUpImportService.preview — duplicate detection', () => {
    (0, node_test_1.it)('flags rows that already exist in the target and duplicates within the file', async () => {
        // Existing task in the target scope: (Sprint 1, Alpha)
        const existing = [{ id: 'existing-1', listName: 'Sprint 1', title: 'Alpha' }];
        const { db } = makeDb([existing]);
        const svc = new clickup_import_service_1.ClickUpImportService(db);
        const csv = [
            'Task Name,List',
            'Alpha,Sprint 1', // exists-in-target
            'Beta,Sprint 1',
            'Beta,Sprint 1', // duplicate-in-file
        ].join('\n');
        const res = await svc.preview('ws-1', { csv });
        strict_1.default.equal(res.totalRows, 3);
        strict_1.default.equal(res.duplicates.count, 2);
        const reasons = res.duplicates.sample.map((d) => d.reason).sort();
        strict_1.default.deepEqual(reasons, ['duplicate-in-file', 'exists-in-target']);
        // Comments/attachments are honestly reported as not-imported.
        strict_1.default.match(res.notImported.comments, /require.*ClickUp API/i);
    });
    (0, node_test_1.it)('surfaces detected custom fields with inferred types', async () => {
        const { db } = makeDb([[]]); // no existing tasks
        const svc = new clickup_import_service_1.ClickUpImportService(db);
        const csv = 'Task Name,List,Budget\nAlpha,L1,100\nBeta,L1,200';
        const res = await svc.preview('ws-1', { csv });
        strict_1.default.deepEqual(res.customFields, [{ name: 'Budget', type: 'number' }]);
    });
});
(0, node_test_1.describe)('ClickUpImportService.processImport — conflict strategy + job counters', () => {
    const csv = [
        'Task Name,List,Status,Priority',
        'Alpha,Sprint 1,todo,high',
        'Beta,Sprint 1,in progress,normal',
        'Alpha,Sprint 1,done,urgent', // duplicates the first Alpha within the file
    ].join('\n');
    (0, node_test_1.it)('skip: drops the duplicate, creates the rest, and reports counts', async () => {
        // selects: loadMemberIndex → [], loadExistingTaskIndex → []
        const { db, inserts, updates } = makeDb([[], []]);
        const svc = new clickup_import_service_1.ClickUpImportService(db);
        const summary = await svc.processImport('job-1', 'ws-1', 'user-1', { csv, strategy: 'skip' });
        strict_1.default.equal(summary.tasksCreated, 2);
        strict_1.default.equal(summary.tasksSkipped, 1);
        strict_1.default.equal(summary.tasksUpdated, 0);
        strict_1.default.equal(summary.duplicatesDetected, 1);
        // Only 2 task rows were actually inserted.
        strict_1.default.equal(insertsInto(inserts, db_1.tasks).length, 2);
        // Final job update marks completion with the streamed counters.
        const done = jobUpdates(updates).find((s) => s.status === 'completed');
        strict_1.default.ok(done, 'a completed job update was written');
        strict_1.default.equal(done.createdCount, 2);
        strict_1.default.equal(done.skippedCount, 1);
        strict_1.default.equal(done.processed, 3);
    });
    (0, node_test_1.it)('create (import anyway): keeps the duplicate as a new task', async () => {
        const { db, inserts } = makeDb([[], []]);
        const svc = new clickup_import_service_1.ClickUpImportService(db);
        const summary = await svc.processImport('job-2', 'ws-1', 'user-1', { csv, strategy: 'create' });
        strict_1.default.equal(summary.tasksCreated, 3);
        strict_1.default.equal(summary.tasksSkipped, 0);
        strict_1.default.equal(summary.duplicatesDetected, 1);
        strict_1.default.equal(insertsInto(inserts, db_1.tasks).length, 3);
    });
    (0, node_test_1.it)('merge: updates the existing target task instead of creating a duplicate', async () => {
        // An existing (Sprint 1, Alpha) in the target scope.
        const existing = [{ id: 'existing-alpha', listName: 'Sprint 1', title: 'Alpha' }];
        const { db, inserts, updates } = makeDb([[], existing]);
        const svc = new clickup_import_service_1.ClickUpImportService(db);
        const single = 'Task Name,List,Status\nAlpha,Sprint 1,done';
        const summary = await svc.processImport('job-3', 'ws-1', 'user-1', { csv: single, strategy: 'merge' });
        strict_1.default.equal(summary.tasksUpdated, 1);
        strict_1.default.equal(summary.tasksCreated, 0);
        strict_1.default.equal(insertsInto(inserts, db_1.tasks).length, 0, 'no new task inserted on merge');
        // The existing task row was updated.
        const taskUpdate = updates.find((u) => u.table === db_1.tasks);
        strict_1.default.ok(taskUpdate, 'existing task was updated');
    });
    (0, node_test_1.it)('reports failure on a job when the CSV yields no rows', async () => {
        const { db, updates } = makeDb([]);
        const svc = new clickup_import_service_1.ClickUpImportService(db);
        await strict_1.default.rejects(() => svc.processImport('job-4', 'ws-1', 'user-1', { csv: 'Task Name,List' }));
        const failed = jobUpdates(updates).find((s) => s.status === 'failed');
        strict_1.default.ok(failed, 'job marked failed');
    });
});
(0, node_test_1.describe)('ClickUpImportService.processImport — custom fields', () => {
    (0, node_test_1.it)('creates definitions and sets values, counting both', async () => {
        const { db, inserts } = makeDb([[], []]); // members, existing tasks
        const svc = new clickup_import_service_1.ClickUpImportService(db);
        const csv = [
            'Task Name,List,Budget,Region',
            'Alpha,L1,100,North',
            'Beta,L1,200,South',
            'Gamma,L1,150,North', // repeat makes Region a genuine dropdown enum
        ].join('\n');
        const summary = await svc.processImport('job-5', 'ws-1', 'user-1', { csv, strategy: 'create' });
        // Two custom fields detected (Budget=number, Region=dropdown).
        strict_1.default.equal(summary.customFieldsCreated, 2);
        const defs = insertsInto(inserts, db_1.customFieldDefinitions);
        strict_1.default.equal(defs.length, 2);
        const budget = defs.find((d) => d.name === 'Budget');
        const region = defs.find((d) => d.name === 'Region');
        strict_1.default.equal(budget.type, 'number');
        strict_1.default.equal(region.type, 'dropdown');
        strict_1.default.ok(Array.isArray(region.options) && region.options.length === 2);
        // Three tasks × two fields = 6 values written, and the value shape is { v }.
        strict_1.default.equal(summary.customFieldValuesSet, 6);
        const values = insertsInto(inserts, db_1.customFieldValues);
        strict_1.default.equal(values.length, 6);
        strict_1.default.ok('v' in values[0].value, 'value stored in the { v } write-path shape');
    });
});
//# sourceMappingURL=clickup-import.service.test.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const checklist_templates_service_1 = require("./checklist-templates.service");
/**
 * Each top-level `select()` resolves to the next queued result set, matching the
 * order the service queries in. Inserted payloads are captured so we can assert
 * what actually gets written.
 */
function makeDb(selectResults) {
    let i = 0;
    const chain = (rows) => {
        const c = {
            from: () => c, where: () => c, limit: () => c, innerJoin: () => c, orderBy: () => c,
            then: (res, rej) => Promise.resolve(rows).then(res, rej),
        };
        return c;
    };
    const inserted = [];
    const deleted = [];
    const db = {
        select: node_test_1.mock.fn(() => chain(selectResults[i++] ?? [])),
        insert: node_test_1.mock.fn(() => ({
            values: (v) => {
                inserted.push(v);
                return { returning: async () => [Array.isArray(v) ? v[0] : { id: 'new-id', ...v }] };
            },
        })),
        delete: node_test_1.mock.fn(() => ({ where: async () => { deleted.push(true); } })),
    };
    return { db, inserted, deleted };
}
const member = [{ userId: 'u1' }];
const svcWith = (results) => {
    const { db, inserted, deleted } = makeDb(results);
    return { svc: new checklist_templates_service_1.ChecklistTemplatesService(db), inserted, deleted };
};
(0, node_test_1.describe)('ChecklistTemplatesService.create', () => {
    (0, node_test_1.it)('stores the trimmed items and drops blank ones', async () => {
        const { svc, inserted } = svcWith([member]);
        const res = await svc.create('w1', 'u1', { name: 'QA pass', items: ['  a  ', '', '   ', 'b'] });
        strict_1.default.equal(res.itemCount, 2);
        const itemRows = inserted.find((v) => Array.isArray(v));
        strict_1.default.ok(itemRows, 'expected an item insert');
        strict_1.default.deepEqual(itemRows.map((r) => r.content), ['a', 'b']);
        // Position is assigned from the surviving order, not the original index.
        strict_1.default.deepEqual(itemRows.map((r) => r.position), [0, 1]);
    });
    (0, node_test_1.it)('refuses a blank name', async () => {
        const { svc } = svcWith([member]);
        await strict_1.default.rejects(() => svc.create('w1', 'u1', { name: '   ' }), /template name is required/i);
    });
    (0, node_test_1.it)('refuses a name that is too long', async () => {
        const { svc } = svcWith([member]);
        await strict_1.default.rejects(() => svc.create('w1', 'u1', { name: 'x'.repeat(201) }), /200 characters/);
    });
    (0, node_test_1.it)('refuses more items than the cap', async () => {
        const { svc } = svcWith([member]);
        const items = Array.from({ length: 201 }, (_, n) => `item ${n}`);
        await strict_1.default.rejects(() => svc.create('w1', 'u1', { name: 'big', items }), /at most 200 items/);
    });
    (0, node_test_1.it)('refuses a non-member', async () => {
        const { svc } = svcWith([[]]);
        await strict_1.default.rejects(() => svc.create('w1', 'u1', { name: 'nope' }), /Workspace membership required/);
    });
});
(0, node_test_1.describe)('ChecklistTemplatesService.applyToTask', () => {
    // workspaceOfTask -> assertMember -> template -> template items -> existing checklists
    const ok = (tplWorkspace = 'w1') => [
        [{ workspaceId: 'w1' }],
        member,
        [{ id: 't1', workspaceId: tplWorkspace, name: 'QA pass' }],
        [{ id: 'i1', content: 'Smoke test', position: 0 }, { id: 'i2', content: 'Sign off', position: 1 }],
        [{ position: 0 }, { position: 1 }],
    ];
    (0, node_test_1.it)('copies the items onto the task, unchecked', async () => {
        const { svc, inserted } = svcWith(ok());
        const res = await svc.applyToTask('task1', 't1', 'u1');
        strict_1.default.equal(res.itemCount, 2);
        const itemRows = inserted.find((v) => Array.isArray(v));
        strict_1.default.ok(itemRows, 'expected an item insert');
        strict_1.default.deepEqual(itemRows.map((r) => r.content), ['Smoke test', 'Sign off']);
        // Nothing carries done-ness or an assignee over from the template.
        strict_1.default.ok(itemRows.every((r) => r.isDone === undefined && r.assigneeId === undefined));
    });
    (0, node_test_1.it)('appends after the checklists already on the task', async () => {
        const { svc, inserted } = svcWith(ok());
        await svc.applyToTask('task1', 't1', 'u1');
        const checklistRow = inserted.find((v) => !Array.isArray(v) && 'taskId' in v);
        strict_1.default.equal(checklistRow.position, 2);
    });
    (0, node_test_1.it)('refuses a template belonging to another workspace', async () => {
        const { svc } = svcWith(ok('other-workspace'));
        await strict_1.default.rejects(() => svc.applyToTask('task1', 't1', 'u1'), /template not found/i);
    });
    (0, node_test_1.it)('404s when the template is gone', async () => {
        const { svc } = svcWith([[{ workspaceId: 'w1' }], member, []]);
        await strict_1.default.rejects(() => svc.applyToTask('task1', 'missing', 'u1'), /template not found/i);
    });
    (0, node_test_1.it)('404s when the task is gone', async () => {
        const { svc } = svcWith([[]]);
        await strict_1.default.rejects(() => svc.applyToTask('missing', 't1', 'u1'), /Task not found/);
    });
});
(0, node_test_1.describe)('ChecklistTemplatesService.createFromChecklist', () => {
    (0, node_test_1.it)('names the template after the checklist when none is given', async () => {
        // checklist -> workspaceOfTask -> assertMember(from create) -> items -> assertMember(create)
        const { svc, inserted } = svcWith([
            [{ id: 'c1', taskId: 'task1', title: 'Launch steps' }],
            [{ workspaceId: 'w1' }],
            member,
            [{ content: 'one' }, { content: 'two' }],
            member,
        ]);
        const res = await svc.createFromChecklist('c1', 'u1');
        strict_1.default.equal(res.name, 'Launch steps');
        strict_1.default.equal(res.itemCount, 2);
        strict_1.default.ok(inserted.some((v) => !Array.isArray(v) && v.name === 'Launch steps'));
    });
    (0, node_test_1.it)('404s for a checklist that does not exist', async () => {
        const { svc } = svcWith([[]]);
        await strict_1.default.rejects(() => svc.createFromChecklist('nope', 'u1'), /Checklist not found/);
    });
});
(0, node_test_1.describe)('ChecklistTemplatesService.remove', () => {
    (0, node_test_1.it)('deletes a template in a workspace the caller belongs to', async () => {
        const { svc, deleted } = svcWith([[{ id: 't1', workspaceId: 'w1' }], member]);
        strict_1.default.deepEqual(await svc.remove('t1', 'u1'), { ok: true });
        strict_1.default.equal(deleted.length, 1);
    });
    (0, node_test_1.it)('refuses a non-member', async () => {
        const { svc, deleted } = svcWith([[{ id: 't1', workspaceId: 'w1' }], []]);
        await strict_1.default.rejects(() => svc.remove('t1', 'u1'), /Workspace membership required/);
        strict_1.default.equal(deleted.length, 0);
    });
});
//# sourceMappingURL=checklist-templates.service.test.js.map
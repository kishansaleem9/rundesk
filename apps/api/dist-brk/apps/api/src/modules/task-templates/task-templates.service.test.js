"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const task_templates_service_1 = require("./task-templates.service");
/**
 * The service has two clearly testable surfaces:
 *   1. Payload normalisation (pure, no DB) — clamps arrays, drops
 *      unknown priorities, forbids negative time estimates, strips
 *      bogus values from customFieldValues.
 *   2. Name / description validation in create() — surfaced via
 *      thrown BadRequestException.
 *
 * Deeper plumbing (saveFromTask + instantiate) goes through
 * TasksService.createTask which we treat as an integration boundary;
 * unit-testing it here would require mocking the whole service.
 */
function buildDb(opts = {}) {
    const selectQueue = [...(opts.selectQueues ?? [])];
    const chainable = (rows) => ({
        then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject),
        limit: node_test_1.mock.fn(async () => rows),
        orderBy: node_test_1.mock.fn(() => chainable(rows)),
    });
    return {
        select: node_test_1.mock.fn(() => ({
            from: node_test_1.mock.fn(() => ({
                where: node_test_1.mock.fn(() => chainable(selectQueue.shift() ?? [])),
                orderBy: node_test_1.mock.fn(() => chainable(selectQueue.shift() ?? [])),
                limit: node_test_1.mock.fn(async () => selectQueue.shift() ?? []),
            })),
        })),
        insert: node_test_1.mock.fn(() => ({
            values: node_test_1.mock.fn(() => ({
                returning: node_test_1.mock.fn(async () => opts.insertReturning ?? [{ id: 'tpl-1' }]),
            })),
        })),
        update: node_test_1.mock.fn(() => ({
            set: node_test_1.mock.fn(() => ({
                where: node_test_1.mock.fn(() => ({
                    returning: node_test_1.mock.fn(async () => [{ id: 'tpl-1', name: 'Patched' }]),
                })),
            })),
        })),
        delete: node_test_1.mock.fn(() => ({ where: node_test_1.mock.fn(async () => undefined) })),
    };
}
const tasksServiceStub = { createTask: node_test_1.mock.fn(async () => ({ id: 'task-1' })) };
const securityStub = { logAuditEvent: node_test_1.mock.fn(async () => undefined) };
const ACTOR = { id: '00000000-0000-0000-0000-000000000001', email: 'a@b.com' };
const WORKSPACE_ID = '00000000-0000-0000-0000-0000000000aa';
(0, node_test_1.describe)('TaskTemplatesService.create — input validation', () => {
    (0, node_test_1.it)('rejects empty names', async () => {
        const svc = new task_templates_service_1.TaskTemplatesService(buildDb(), tasksServiceStub, securityStub);
        await strict_1.default.rejects(() => svc.create(WORKSPACE_ID, ACTOR, { name: '   ' }), (e) => e instanceof common_1.BadRequestException);
    });
    (0, node_test_1.it)('rejects names over 120 characters', async () => {
        const svc = new task_templates_service_1.TaskTemplatesService(buildDb(), tasksServiceStub, securityStub);
        await strict_1.default.rejects(() => svc.create(WORKSPACE_ID, ACTOR, { name: 'x'.repeat(121) }), (e) => e instanceof common_1.BadRequestException && /120 characters/.test(e.message));
    });
    (0, node_test_1.it)('rejects descriptions over 1000 characters', async () => {
        const svc = new task_templates_service_1.TaskTemplatesService(buildDb(), tasksServiceStub, securityStub);
        await strict_1.default.rejects(() => svc.create(WORKSPACE_ID, ACTOR, {
            name: 'Ok',
            description: 'd'.repeat(1001),
        }), (e) => e instanceof common_1.BadRequestException && /1000 characters/.test(e.message));
    });
    (0, node_test_1.it)('passes through a valid create call', async () => {
        const insertReturning = [
            {
                id: 'tpl-1',
                workspaceId: WORKSPACE_ID,
                name: 'My Template',
                description: null,
                icon: null,
                payload: {
                    title: '',
                    description: null,
                    priority: 'normal',
                    timeEstimate: null,
                    startDateOffsetDays: null,
                    dueDateOffsetDays: null,
                    labels: [],
                    checklists: [],
                    subtasks: [],
                    customFieldValues: [],
                },
                usageCount: 0,
                createdById: ACTOR.id,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        ];
        const svc = new task_templates_service_1.TaskTemplatesService(buildDb({ insertReturning }), tasksServiceStub, securityStub);
        const created = await svc.create(WORKSPACE_ID, ACTOR, { name: 'My Template' });
        strict_1.default.equal(created.name, 'My Template');
        strict_1.default.equal(created.usageCount, 0);
    });
});
(0, node_test_1.describe)('TaskTemplatesService — payload normalisation', () => {
    // Reach the private normalisePayload through create() which calls it
    // for every payload merge. We assert against the returned view.
    async function makeViaCreate(payload) {
        const insertReturning = [
            {
                id: 'tpl-1',
                workspaceId: WORKSPACE_ID,
                name: 'T',
                description: null,
                icon: null,
                payload, // the DB stub returns whatever we set
                usageCount: 0,
                createdById: ACTOR.id,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        ];
        // We need to capture what was actually inserted to inspect the
        // normalised payload. Swap the stub so we can grab .values arg.
        let captured = null;
        const db = {
            select: node_test_1.mock.fn(() => ({
                from: node_test_1.mock.fn(() => ({
                    where: node_test_1.mock.fn(() => ({ limit: node_test_1.mock.fn(async () => []) })),
                })),
            })),
            insert: node_test_1.mock.fn(() => ({
                values: node_test_1.mock.fn((arg) => {
                    captured = arg;
                    return { returning: node_test_1.mock.fn(async () => insertReturning) };
                }),
            })),
            update: node_test_1.mock.fn(() => ({ set: node_test_1.mock.fn(() => ({ where: node_test_1.mock.fn(() => ({ returning: node_test_1.mock.fn(async () => insertReturning) })) })) })),
            delete: node_test_1.mock.fn(() => ({ where: node_test_1.mock.fn(async () => undefined) })),
        };
        const svc = new task_templates_service_1.TaskTemplatesService(db, tasksServiceStub, securityStub);
        await svc.create(WORKSPACE_ID, ACTOR, { name: 'T', payload });
        return captured.payload;
    }
    (0, node_test_1.it)('coerces an unknown priority to "normal"', async () => {
        const p = await makeViaCreate({ priority: 'super-urgent' });
        strict_1.default.equal(p.priority, 'normal');
    });
    (0, node_test_1.it)('clamps negative time estimates to zero', async () => {
        const p = await makeViaCreate({ timeEstimate: -3600 });
        strict_1.default.equal(p.timeEstimate, 0);
    });
    (0, node_test_1.it)('drops non-string label entries and trims survivors', async () => {
        const p = await makeViaCreate({ labels: ['  bug  ', '', 42, null, '  feature  '] });
        strict_1.default.deepEqual(p.labels, ['bug', 'feature']);
    });
    (0, node_test_1.it)('caps checklists at 20 entries', async () => {
        const lots = Array.from({ length: 30 }, (_, i) => ({ title: `cl-${i}`, items: [] }));
        const p = await makeViaCreate({ checklists: lots });
        strict_1.default.equal(p.checklists.length, 20);
    });
    (0, node_test_1.it)('caps checklist items at 100 per checklist', async () => {
        const items = Array.from({ length: 250 }, (_, i) => ({ content: `i-${i}` }));
        const p = await makeViaCreate({ checklists: [{ title: 'big', items }] });
        strict_1.default.equal(p.checklists[0].items.length, 100);
    });
    (0, node_test_1.it)('caps subtasks at 100', async () => {
        const sub = Array.from({ length: 200 }, (_, i) => ({ title: `s-${i}` }));
        const p = await makeViaCreate({ subtasks: sub });
        strict_1.default.equal(p.subtasks.length, 100);
    });
    (0, node_test_1.it)('drops customFieldValues without a string fieldName', async () => {
        const p = await makeViaCreate({
            customFieldValues: [
                { fieldName: 'Severity', value: 'P1' },
                { fieldName: 42, value: 'nope' },
                { value: 'orphan' },
                { fieldName: 'Story Points', value: 8 },
                { fieldName: 'Bad', value: { nested: 'object' } }, // non-primitive → value coerced to null
            ],
        });
        strict_1.default.equal(p.customFieldValues.length, 3);
        const bad = p.customFieldValues.find((v) => v.fieldName === 'Bad');
        strict_1.default.equal(bad.value, null);
    });
    (0, node_test_1.it)('coerces non-finite numbers in timeEstimate to null', async () => {
        const p = await makeViaCreate({ timeEstimate: 'banana' });
        strict_1.default.equal(p.timeEstimate, null);
    });
    (0, node_test_1.it)('clamps offset days to the documented +/- 3650 range', async () => {
        const p = await makeViaCreate({ dueDateOffsetDays: 100_000 });
        strict_1.default.equal(p.dueDateOffsetDays, 3650);
    });
});
(0, node_test_1.describe)('TaskTemplatesService.requireTemplate', () => {
    (0, node_test_1.it)('throws NotFound for an unknown id', async () => {
        const svc = new task_templates_service_1.TaskTemplatesService(buildDb({ selectQueues: [[]] }), tasksServiceStub, securityStub);
        await strict_1.default.rejects(() => svc.getById(WORKSPACE_ID, '00000000-0000-0000-0000-000000000099'), (e) => e instanceof common_1.NotFoundException);
    });
});
//# sourceMappingURL=task-templates.service.test.js.map
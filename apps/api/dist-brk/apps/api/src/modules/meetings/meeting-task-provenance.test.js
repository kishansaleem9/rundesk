"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const meetings_service_1 = require("./meetings.service");
/**
 * §V2-04 — a task made from a meeting's action items says the meeting made it.
 *
 * `[03:26]` "MILESTONE, FORM RESPONSE, ya MEETING NOTE se task create hue".
 *
 * The form half of this is driven end to end by `test/e2e/task-provenance.mjs`
 * against a real API. The meeting half CANNOT be: turning notes into action
 * items goes through `ai.extractTasksFromNotes`, which needs a model, and
 * neither CI nor a dev machine has a key. That is precisely why it is tested
 * here instead of left uncovered — the gap between "works on a machine with a
 * key" and "works" is where a regression would live unseen.
 *
 * So the model is stubbed and the assertion is on what reaches `createTask`.
 * The type is resolved by its `origin` marker, so the fake db answers a query
 * for it rather than matching a name.
 */
/** Enough of a db for the two reads this path makes. */
function fakeDb(opts) {
    const chain = (rows) => {
        const c = {};
        c.from = () => c;
        c.innerJoin = () => c;
        c.leftJoin = () => c;
        c.where = () => c;
        c.orderBy = () => c;
        c.limit = () => Promise.resolve(rows);
        return c;
    };
    return {
        // taskTypeIdForOrigin is the only select this test cares about.
        select: () => chain(opts.meetingTypeId ? [{ id: opts.meetingTypeId }] : []),
    };
}
const MEETING = { id: 'm1', title: 'Weekly sync', notes: 'Ali to send the deck by Friday.' };
function harness(opts) {
    const createCalls = [];
    const svc = new meetings_service_1.MeetingsService(fakeDb(opts), {
        isAvailable: () => true,
        extractTasksFromNotes: async () => [{ title: 'Send the deck', description: '', priority: 'normal' }],
    }, {
        createTask: async (data) => {
            createCalls.push(data);
            return { id: 't1', title: data.title };
        },
    }, {});
    svc.assertMember = async () => { };
    svc.load = async () => MEETING;
    return { svc, createCalls };
}
(0, node_test_1.describe)('§V2-04 a meeting stamps the tasks it produces', () => {
    (0, node_test_1.it)('passes the meeting type to every task it creates', async () => {
        const { svc, createCalls } = harness({ meetingTypeId: 'type-meeting' });
        await svc.extractActionItems('ws1', 'm1', 'u1', { createIn: 'list1' });
        strict_1.default.equal(createCalls.length, 1, 'the action item did not become a task');
        strict_1.default.equal(createCalls[0].taskTypeId, 'type-meeting', `createTask was called without the meeting type: ${JSON.stringify(createCalls[0])}`);
    });
    /*
     * A workspace may delete the type. Losing a label must not cost the work —
     * the tasks are still created, untyped, exactly as before this existed.
     */
    (0, node_test_1.it)('still creates the tasks when the workspace has no such type', async () => {
        const { svc, createCalls } = harness({ meetingTypeId: null });
        await svc.extractActionItems('ws1', 'm1', 'u1', { createIn: 'list1' });
        strict_1.default.equal(createCalls.length, 1, 'a missing type stopped the task being made');
        strict_1.default.equal(createCalls[0].taskTypeId, null);
    });
});
//# sourceMappingURL=meeting-task-provenance.test.js.map
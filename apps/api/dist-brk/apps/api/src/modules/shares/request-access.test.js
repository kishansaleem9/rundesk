"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const shares_service_1 = require("./shares.service");
/** Thenable Drizzle chain resolving to the given rows. */
const chain = (rows) => ({
    from: () => chain(rows),
    where: () => chain(rows),
    limit: () => chain(rows),
    leftJoin: () => chain(rows),
    innerJoin: () => chain(rows),
    orderBy: () => chain(rows),
    then: (res, rej) => Promise.resolve(rows).then(res, rej),
    catch: (rej) => Promise.resolve(rows).catch(rej),
});
/**
 * Selects answer in order: object admins, workspace admins, a recent ask, then
 * whatever `resolveSharedBatch` needs for the title and link.
 *
 * Inserts are recorded rather than swallowed. The ask itself is what the
 * once-a-day rule reads, so a fake that dropped it would let a test pass while
 * the record that rule depends on never happened — the exact hole the
 * feature-flag flow documented.
 */
const dbWithSelects = (queue) => {
    let i = 0;
    const inserted = [];
    return {
        select: () => chain(queue[i++] ?? []),
        insert: () => ({ values: (v) => (inserted.push(v), chain([])) }),
        inserted,
    };
};
const notifier = () => {
    const sent = [];
    return {
        sent,
        createWithOutcome: async (d) => (sent.push(d), { row: { id: 'n' }, delivered: true }),
    };
};
const svcWith = (db, n) => new shares_service_1.SharesService(db, {}, {}, { get: () => undefined }, n);
const ME = { id: 'u1', name: 'Hamda', email: 'hamda@example.com' };
/**
 * §G10 [12:16–12:20] — "someone asked for access to something".
 *
 * The `access_requested` kind has existed since the enum was written and was
 * only ever emitted for FEATURE requests. Somebody who hit a doc, list or space
 * they could not see had no way to ask for it: the wall was the end of the road.
 */
(0, node_test_1.describe)('§G10 asking for access to content', () => {
    (0, node_test_1.it)('tells the people who can actually grant it, and not the asker', async () => {
        const n = notifier();
        const objectAdmins = [{ userId: 'owner1' }];
        const wsAdmins = [{ userId: 'admin1' }, { userId: 'u1' }];
        const db = dbWithSelects([objectAdmins, wsAdmins, [], []]);
        const out = await svcWith(db, n).requestAccess('ws1', 'doc', 'doc1', ME);
        strict_1.default.equal(out.status, 'sent');
        strict_1.default.deepEqual(n.sent.map((x) => x.userId).sort(), ['admin1', 'owner1']);
        strict_1.default.ok(!n.sent.some((x) => x.userId === 'u1'), 'told the person who was asking');
        strict_1.default.match(n.sent[0].title, /Hamda/, 'used a raw id instead of a name');
        strict_1.default.equal(n.sent[0].type, 'access_requested');
        strict_1.default.equal(n.sent[0].target.entityId, 'doc1');
        strict_1.default.equal(n.sent[0].actorId, 'u1');
        // The ask is written down in its own right — the once-a-day rule reads this.
        strict_1.default.deepEqual(db.inserted.map((r) => [r.workspaceId, r.objectType, r.objectId, r.requesterId]), [['ws1', 'doc', 'doc1', 'u1']], 'the ask itself was never recorded');
    });
    (0, node_test_1.it)('does not drum-roll: a second ask the same day sends nothing', async () => {
        const n = notifier();
        const db = dbWithSelects([[{ userId: 'owner1' }], [], [{ id: 'already' }], []]);
        const out = await svcWith(db, n).requestAccess('ws1', 'doc', 'doc1', ME);
        strict_1.default.equal(out.status, 'already_asked');
        strict_1.default.equal(n.sent.length, 0, 'a repeat press notified the owner again');
        strict_1.default.equal(db.inserted.length, 0, 'a repeat press was recorded as a fresh ask');
    });
    (0, node_test_1.it)('says so when nobody can grant it', async () => {
        const n = notifier();
        // Only the asker holds anything — telling them is not an option.
        const db = dbWithSelects([[{ userId: 'u1' }], [{ userId: 'u1' }], [], []]);
        const out = await svcWith(db, n).requestAccess('ws1', 'doc', 'doc1', ME);
        strict_1.default.equal(out.status, 'no_owners');
        strict_1.default.equal(n.sent.length, 0);
    });
    (0, node_test_1.it)('counts who was told, not how many rows were written', async () => {
        /*
         * createWithOutcome returns delivered:false when every channel is muted.
         * Counting rows told the asker "nobody was told" while an email-only owner
         * had the mail — the bug the feature-flag flow hit and documented.
         */
        const muted = { createWithOutcome: async () => ({ row: null, delivered: false }) };
        const db = dbWithSelects([[{ userId: 'owner1' }], [], [], []]);
        const out = await svcWith(db, muted).requestAccess('ws1', 'doc', 'doc1', ME);
        strict_1.default.equal(out.status, 'sent');
        strict_1.default.equal(out.notified, 0, 'reported reaching an owner who was never told');
    });
    (0, node_test_1.it)('refuses a type that cannot be shared', async () => {
        const db = dbWithSelects([[], [], [], []]);
        await strict_1.default.rejects(() => svcWith(db, notifier()).requestAccess('ws1', 'wormhole', 'x', ME), /unknown object type/i);
    });
});
//# sourceMappingURL=request-access.test.js.map
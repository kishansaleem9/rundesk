"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const feature_flags_service_1 = require("./feature-flags.service");
// thenable Drizzle chain that resolves to the given rows
const chain = (rows) => ({
    from: () => chain(rows),
    where: () => chain(rows),
    limit: () => chain(rows),
    then: (res, rej) => Promise.resolve(rows).then(res, rej),
    // A drizzle builder is a QueryPromise, so `.catch(...)` is a shape the
    // service genuinely uses — `insert(...).values(...).catch(...)` here.
    catch: (rej) => Promise.resolve(rows).catch(rej),
});
/**
 * A db whose selects answer in order. requestFlag runs four of them —
 * membership, flag overrides, admins, a recent ask — and each needs a different
 * answer, which one fixed row set cannot give.
 *
 * Inserts are recorded rather than ignored: the ask itself is now written down
 * (0113), which is what the once-a-day rule reads, so a fake that swallowed it
 * would let a test pass while the record that rule depends on never happened.
 */
const dbWithSelects = (queue) => {
    let i = 0;
    const inserted = [];
    const db = {
        select: () => chain(queue[i++] ?? []),
        insert: () => ({ values: (v) => (inserted.push(v), chain([])) }),
        inserted,
    };
    return db;
};
(0, node_test_1.describe)('FeatureFlagsService.setFlag authorization', () => {
    (0, node_test_1.it)('rejects a non-super-admin setting a global flag', async () => {
        const svc = new feature_flags_service_1.FeatureFlagsService({}, {}, {});
        await strict_1.default.rejects(() => svc.setFlag('x', true, 'global', null, null, { id: 'u', role: 'member' }), /super admin/i);
    });
    (0, node_test_1.it)('rejects a non-admin setting a workspace flag', async () => {
        const db = { select: () => chain([]) }; // membership lookup returns nothing
        const svc = new feature_flags_service_1.FeatureFlagsService(db, {}, {});
        await strict_1.default.rejects(() => svc.setFlag('x', true, 'workspace', null, 'ws1', { id: 'u', role: 'member' }), /workspace admin/i);
    });
    (0, node_test_1.it)('allows a super_admin to set a global flag', async () => {
        const db = { insert: () => ({ values: () => ({ onConflictDoUpdate: async () => undefined }) }) };
        const security = { logAuditEvent: async () => undefined };
        const svc = new feature_flags_service_1.FeatureFlagsService(db, security, {});
        await svc.setFlag('x', true, 'global', null, null, { id: 'u', role: 'super_admin' });
    });
});
/**
 * §2.8 gap 11 — "Contact your admin", and what the button actually does.
 *
 * Every outcome here is invisible from the UI: a button that reports success
 * looks the same whether it reached three admins, reached nobody, or was the
 * fourth press in five minutes. The endpoint says which, so the modal can.
 */
(0, node_test_1.describe)('§2.8 asking an admin to turn a feature on', () => {
    const MEMBER = [{ role: 'member' }];
    const OFF = [{ scope: 'workspace', scopeId: 'ws1', flagKey: 'ai.meeting_notes', enabled: false }];
    const me = { id: 'u1', name: 'Hamda', email: 'h@example.com' };
    const notifier = () => {
        const sent = [];
        return {
            sent,
            // Delivery, not the row: an admin who has in-app off and email on gets
            // no row and must still count as told.
            createWithOutcome: async (n) => (sent.push(n), { row: { id: `n${sent.length}` }, delivered: true }),
        };
    };
    (0, node_test_1.it)('refuses a flag that does not exist', async () => {
        const svc = new feature_flags_service_1.FeatureFlagsService(dbWithSelects([]), {}, notifier());
        await strict_1.default.rejects(() => svc.requestFlag('not.a.flag', 'ws1', me), /Unknown feature/);
    });
    (0, node_test_1.it)('refuses someone who is not in the workspace', async () => {
        const svc = new feature_flags_service_1.FeatureFlagsService(dbWithSelects([[]]), {}, notifier());
        await strict_1.default.rejects(() => svc.requestFlag('ai.meeting_notes', 'ws1', me), /Not a member/);
    });
    (0, node_test_1.it)('does not chase an admin for something already on', async () => {
        // No override row → the platform default (on) stands.
        const svc = new feature_flags_service_1.FeatureFlagsService(dbWithSelects([MEMBER, []]), {}, notifier());
        const out = await svc.requestFlag('ai.meeting_notes', 'ws1', me);
        strict_1.default.equal(out.status, 'already_enabled');
        strict_1.default.equal(out.notified, 0);
    });
    (0, node_test_1.it)('tells every admin except the person asking', async () => {
        const n = notifier();
        const admins = [{ userId: 'admin1' }, { userId: 'admin2' }, { userId: 'u1' }];
        const db = dbWithSelects([MEMBER, OFF, admins, []]);
        const svc = new feature_flags_service_1.FeatureFlagsService(db, {}, n);
        const out = await svc.requestFlag('ai.meeting_notes', 'ws1', me);
        // The ask is written down in its own right. The once-a-day rule reads
        // THIS, not the notification rows it produced — a workspace whose admins
        // all take email produces no rows at all, and used to be re-mailed on
        // every press because the rule had nothing to find.
        strict_1.default.deepEqual(db.inserted.map((r) => [r.workspaceId, r.flagKey, r.requesterId]), [['ws1', 'ai.meeting_notes', 'u1']], 'the ask itself was never recorded');
        strict_1.default.equal(out.status, 'sent');
        strict_1.default.equal(out.notified, 2);
        strict_1.default.deepEqual(n.sent.map((x) => x.userId), ['admin1', 'admin2']);
        // The person's own name, not their raw id, and a link to the screen with
        // the toggle on it.
        strict_1.default.match(n.sent[0].title, /Hamda/);
        strict_1.default.equal(n.sent[0].target.entityId, 'ai.meeting_notes');
        strict_1.default.equal(n.sent[0].target.url, '/app/admin/features');
        strict_1.default.equal(n.sent[0].actorId, 'u1');
    });
    (0, node_test_1.it)('counts only the admins who were actually told', async () => {
        // create() returns null when the recipient has muted this kind entirely.
        // Every channel off — the one case where nothing at all happens.
        const muted = { createWithOutcome: async () => ({ row: null, delivered: false }) };
        const admins = [{ userId: 'admin1' }, { userId: 'admin2' }];
        const svc = new feature_flags_service_1.FeatureFlagsService(dbWithSelects([MEMBER, OFF, admins, []]), {}, muted);
        const out = await svc.requestFlag('ai.meeting_notes', 'ws1', me);
        strict_1.default.equal(out.status, 'sent');
        strict_1.default.equal(out.notified, 0, 'reported reaching admins who were never told');
    });
    (0, node_test_1.it)('says so when the workspace has no other admin to ask', async () => {
        const svc = new feature_flags_service_1.FeatureFlagsService(dbWithSelects([MEMBER, OFF, [{ userId: 'u1' }]]), {}, notifier());
        const out = await svc.requestFlag('ai.meeting_notes', 'ws1', me);
        strict_1.default.equal(out.status, 'no_admins');
    });
    (0, node_test_1.it)('does not drum-roll: a second ask the same day sends nothing', async () => {
        const n = notifier();
        const admins = [{ userId: 'admin1' }];
        const recent = [{ id: 'already-asked' }];
        const db = dbWithSelects([MEMBER, OFF, admins, recent]);
        const svc = new feature_flags_service_1.FeatureFlagsService(db, {}, n);
        const out = await svc.requestFlag('ai.meeting_notes', 'ws1', me);
        strict_1.default.equal(out.status, 'already_asked');
        strict_1.default.equal(n.sent.length, 0, 'a repeat press notified the admin again');
        strict_1.default.equal(db.inserted.length, 0, 'a repeat press was recorded as a fresh ask');
    });
    (0, node_test_1.it)('falls back to the email when a person has no name set', async () => {
        const n = notifier();
        const svc = new feature_flags_service_1.FeatureFlagsService(dbWithSelects([MEMBER, OFF, [{ userId: 'admin1' }], []]), {}, n);
        await svc.requestFlag('ai.meeting_notes', 'ws1', { id: 'u1', name: '  ', email: 'h@example.com' });
        strict_1.default.match(n.sent[0].title, /h@example\.com/);
    });
});
//# sourceMappingURL=feature-flags.service.test.js.map
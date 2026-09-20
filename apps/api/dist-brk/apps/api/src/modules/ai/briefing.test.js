"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const briefing_service_1 = require("./briefing.service");
/**
 * §7.11 — the hourly briefing cron fires for a user iff their briefing is
 * enabled, the current UTC hour matches their configured hour, and they have
 * not already been briefed today. These lock down that selection predicate and
 * the dispatch loop's due-user + dedupe behavior without a live model or SMTP.
 */
(0, node_test_1.describe)('isBriefingDue (cron due-user selection)', () => {
    const at = (iso) => new Date(iso);
    (0, node_test_1.it)('never fires when the briefing is disabled', () => {
        strict_1.default.equal((0, briefing_service_1.isBriefingDue)({ enabled: false, hour: 9 }, null, at('2026-07-16T09:00:00Z')), false);
    });
    (0, node_test_1.it)('fires only at the configured UTC hour', () => {
        strict_1.default.equal((0, briefing_service_1.isBriefingDue)({ enabled: true, hour: 9 }, null, at('2026-07-16T09:00:00Z')), true);
        strict_1.default.equal((0, briefing_service_1.isBriefingDue)({ enabled: true, hour: 9 }, null, at('2026-07-16T08:00:00Z')), false);
        strict_1.default.equal((0, briefing_service_1.isBriefingDue)({ enabled: true, hour: 9 }, null, at('2026-07-16T10:00:00Z')), false);
    });
    (0, node_test_1.it)('respects hour 0 (midnight UTC)', () => {
        strict_1.default.equal((0, briefing_service_1.isBriefingDue)({ enabled: true, hour: 0 }, null, at('2026-07-16T00:00:00Z')), true);
        strict_1.default.equal((0, briefing_service_1.isBriefingDue)({ enabled: true, hour: 0 }, null, at('2026-07-16T01:00:00Z')), false);
    });
    (0, node_test_1.it)('skips a user already briefed earlier the same UTC day', () => {
        strict_1.default.equal((0, briefing_service_1.isBriefingDue)({ enabled: true, hour: 9 }, '2026-07-16', at('2026-07-16T09:00:00Z')), false);
    });
    (0, node_test_1.it)('fires again once the day rolls over', () => {
        strict_1.default.equal((0, briefing_service_1.isBriefingDue)({ enabled: true, hour: 9 }, '2026-07-15', at('2026-07-16T09:00:00Z')), true);
    });
});
/** Mock db whose every select() chain resolves to the queued rows in order. */
function makeDb(queue) {
    let i = 0;
    const chain = (rows) => {
        const c = {
            from: () => c,
            where: () => c,
            innerJoin: () => c,
            leftJoin: () => c,
            orderBy: () => c,
            groupBy: () => c,
            limit: () => c,
            then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject),
        };
        return c;
    };
    return { select: () => chain(queue[i++] ?? []) };
}
(0, node_test_1.describe)('BriefingService.dispatch — due-user selection + delivery (§7.11)', () => {
    const now = new Date('2026-07-16T09:00:00Z'); // hour 9 UTC
    (0, node_test_1.it)('delivers only to enabled users whose hour matches, as ai_briefing notifications', async () => {
        const recipients = [
            { userId: 'u1', email: 'u1@x.com', displayName: 'Ada', enabled: true, hour: 9 }, // due
            { userId: 'u2', email: 'u2@x.com', displayName: 'Bo', enabled: true, hour: 10 }, // wrong hour
            { userId: 'u3', email: 'u3@x.com', displayName: 'Cy', enabled: false, hour: 9 }, // disabled
        ];
        const created = [];
        const notifications = {
            listBriefingRecipients: async () => recipients,
            create: async (n) => {
                created.push(n);
                return n;
            },
        };
        const ai = { generateBriefing: async () => 'Good morning, Ada.' };
        // Queue: usersBriefedOn → none; then for u1: assigned tasks, blocking, membership.
        const db = makeDb([[], [], [], []]);
        const svc = new briefing_service_1.BriefingService(db, ai, notifications);
        const res = await svc.dispatch(now);
        strict_1.default.deepEqual(res, { candidates: 3, due: 1, sent: 1 });
        strict_1.default.equal(created.length, 1);
        strict_1.default.equal(created[0].userId, 'u1');
        strict_1.default.equal(created[0].type, 'ai_briefing');
        strict_1.default.match(created[0].title, /daily briefing/i);
        strict_1.default.equal(created[0].body, 'Good morning, Ada.');
    });
    (0, node_test_1.it)('skips a user already briefed today (dedupe) so it never double-sends', async () => {
        const recipients = [{ userId: 'u1', email: 'u1@x.com', displayName: 'Ada', enabled: true, hour: 9 }];
        const created = [];
        const notifications = {
            listBriefingRecipients: async () => recipients,
            create: async (n) => created.push(n),
        };
        const ai = { generateBriefing: async () => 'body' };
        // usersBriefedOn returns u1 → already briefed today.
        const db = makeDb([[{ userId: 'u1' }]]);
        const svc = new briefing_service_1.BriefingService(db, ai, notifications);
        const res = await svc.dispatch(now);
        strict_1.default.deepEqual(res, { candidates: 1, due: 1, sent: 0 });
        strict_1.default.equal(created.length, 0);
    });
    (0, node_test_1.it)('does nothing when no recipient is due this hour', async () => {
        const notifications = {
            listBriefingRecipients: async () => [{ userId: 'u2', email: 'u2@x.com', displayName: 'Bo', enabled: true, hour: 10 }],
            create: async () => strict_1.default.fail('should not deliver'),
        };
        const svc = new briefing_service_1.BriefingService(makeDb([]), { generateBriefing: async () => '' }, notifications);
        const res = await svc.dispatch(now);
        strict_1.default.deepEqual(res, { candidates: 1, due: 0, sent: 0 });
    });
});
(0, node_test_1.describe)('BriefingService.generateNow — run-now (§A6.5)', () => {
    (0, node_test_1.it)('returns the generated briefing without writing a notification', async () => {
        const notifications = {
            listBriefingRecipients: async () => strict_1.default.fail('run-now must not touch the cron path'),
            create: async () => strict_1.default.fail('run-now must not consume the scheduled delivery'),
        };
        let seenName;
        const ai = {
            generateBriefing: async (data) => {
                seenName = data.displayName;
                return 'Two tasks are overdue.';
            },
        };
        // Queue: user lookup, then the assigned-task and blocking reads.
        const db = makeDb([
            [{ displayName: 'Ada', email: 'ada@x.com' }],
            [{ title: 'Ship the API', dueDate: '2000-01-01T00:00:00Z' }],
            [],
        ]);
        const svc = new briefing_service_1.BriefingService(db, ai, notifications);
        const res = await svc.generateNow('u1');
        strict_1.default.equal(res.body, 'Two tasks are overdue.');
        strict_1.default.equal(seenName, 'Ada');
        strict_1.default.deepEqual(res.data.overdue, ['Ship the API']);
    });
    (0, node_test_1.it)('falls back to the email when the user has no display name', async () => {
        const ai = { generateBriefing: async () => 'body' };
        const db = makeDb([[{ displayName: '', email: 'ada@x.com' }], [], []]);
        const svc = new briefing_service_1.BriefingService(db, ai, {});
        const res = await svc.generateNow('u1');
        strict_1.default.equal(res.data.displayName, 'ada@x.com');
    });
});
//# sourceMappingURL=briefing.test.js.map
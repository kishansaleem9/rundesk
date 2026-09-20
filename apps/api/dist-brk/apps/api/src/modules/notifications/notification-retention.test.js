"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const notification_retention_service_1 = require("./notification-retention.service");
/**
 * §2.5 — "after 30 DAYS baad woh saare notifications automatically VANISH ho
 * jayenge."
 *
 * Two things need pinning, and neither is visible by reading the query:
 *
 *  1. *Which* rows are eligible. Only ones the user actually cleared — an
 *     unread mention from six weeks ago must survive, and so must one parked in
 *     Later. Deleting by age alone would quietly bin both.
 *  2. *Which* date decides. `dismissedAt`, not `createdAt`. Filtering on
 *     createdAt would delete a notification someone cleared this morning
 *     because the event it describes is old.
 *
 * The service takes the clock as an argument precisely so the boundary can be
 * tested; the cron just passes `new Date()`.
 */
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-08-20T12:00:00.000Z');
/**
 * A drizzle-ish double that evaluates the real predicate rather than trusting
 * it. `where()` is handed the SQL the service actually built, so instead of
 * re-implementing the filter here (which would only test itself), rows are
 * matched against the values the service bound into it.
 */
function fakeDb(rows) {
    const state = { rows: [...rows], lastCutoff: null };
    /**
     * Pull the timestamp the service bound into the `<` comparison. Drizzle's SQL
     * nodes hold references back to their table and column objects, so the graph
     * has cycles — the walk has to remember where it has been.
     */
    const cutoffFrom = (condition) => {
        const found = [];
        const seen = new WeakSet();
        const walk = (node) => {
            if (!node || typeof node !== 'object')
                return;
            if (node instanceof Date) {
                found.push(node);
                return;
            }
            if (seen.has(node))
                return;
            seen.add(node);
            for (const value of Object.values(node))
                walk(value);
        };
        walk(condition);
        strict_1.default.equal(found.length, 1, `expected one bound timestamp, saw ${found.length}`);
        return found[0];
    };
    const eligible = (cutoff) => state.rows.filter((r) => r.dismissedAt !== null && r.dismissedAt.getTime() < cutoff.getTime());
    return {
        state,
        delete: () => ({
            where: (condition) => ({
                returning: async () => {
                    const cutoff = cutoffFrom(condition);
                    state.lastCutoff = cutoff;
                    const doomed = eligible(cutoff);
                    const ids = new Set(doomed.map((r) => r.id));
                    state.rows = state.rows.filter((r) => !ids.has(r.id));
                    return doomed.map((r) => ({ id: r.id }));
                },
            }),
        }),
        select: () => ({
            from: () => ({
                where: async (condition) => [{ count: eligible(cutoffFrom(condition)).length }],
            }),
        }),
    };
}
const service = (rows) => {
    const db = fakeDb(rows);
    return { db, svc: new notification_retention_service_1.NotificationRetentionService(db) };
};
(0, node_test_1.describe)('notification retention (§2.5)', () => {
    (0, node_test_1.it)('deletes cleared notifications older than 30 days', async () => {
        const { db, svc } = service([
            { id: 'old-cleared', dismissedAt: new Date(NOW.getTime() - 31 * DAY), createdAt: NOW },
        ]);
        strict_1.default.equal(await svc.purge(NOW), 1);
        strict_1.default.deepEqual(db.state.rows, []);
    });
    (0, node_test_1.it)('keeps notifications that were never cleared, however old', async () => {
        const ancient = new Date(NOW.getTime() - 400 * DAY);
        const { db, svc } = service([
            { id: 'unread', dismissedAt: null, createdAt: ancient },
            { id: 'snoozed', dismissedAt: null, snoozedUntil: new Date(NOW.getTime() + DAY), createdAt: ancient },
        ]);
        strict_1.default.equal(await svc.purge(NOW), 0);
        strict_1.default.deepEqual(db.state.rows.map((r) => r.id).sort(), ['snoozed', 'unread'], 'the Inbox and Later buckets are not a retention policy');
    });
    (0, node_test_1.it)('measures from when it was cleared, not when it arrived', async () => {
        const { db, svc } = service([
            // An old event the user only got round to clearing today.
            {
                id: 'old-event-cleared-today',
                dismissedAt: new Date(NOW.getTime() - 1 * DAY),
                createdAt: new Date(NOW.getTime() - 200 * DAY),
            },
        ]);
        strict_1.default.equal(await svc.purge(NOW), 0);
        strict_1.default.deepEqual(db.state.rows.map((r) => r.id), ['old-event-cleared-today']);
    });
    (0, node_test_1.it)('holds the boundary at exactly 30 days', async () => {
        const { db, svc } = service([
            { id: 'just-inside', dismissedAt: new Date(NOW.getTime() - 30 * DAY + 60_000), createdAt: NOW },
            { id: 'just-outside', dismissedAt: new Date(NOW.getTime() - 30 * DAY - 60_000), createdAt: NOW },
        ]);
        strict_1.default.equal(await svc.purge(NOW), 1);
        strict_1.default.deepEqual(db.state.rows.map((r) => r.id), ['just-inside'], 'a minute either side of the cutoff decides it');
        strict_1.default.equal(db.state.lastCutoff?.toISOString(), new Date(NOW.getTime() - 30 * DAY).toISOString());
    });
    (0, node_test_1.it)('counts what is due without deleting it', async () => {
        const { db, svc } = service([
            { id: 'a', dismissedAt: new Date(NOW.getTime() - 31 * DAY), createdAt: NOW },
            { id: 'b', dismissedAt: new Date(NOW.getTime() - 31 * DAY), createdAt: NOW },
            { id: 'c', dismissedAt: null, createdAt: NOW },
        ]);
        strict_1.default.equal(await svc.countDue(NOW), 2);
        strict_1.default.equal(db.state.rows.length, 3, 'countDue must not be destructive');
    });
    (0, node_test_1.it)('uses the retention window she asked for', () => {
        strict_1.default.equal(notification_retention_service_1.NotificationRetentionService.RETENTION_DAYS, 30);
    });
});
//# sourceMappingURL=notification-retention.test.js.map
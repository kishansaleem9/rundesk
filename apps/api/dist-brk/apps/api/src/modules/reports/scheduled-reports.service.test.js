"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const scheduled_reports_service_1 = require("./scheduled-reports.service");
/**
 * §9.5 — the hourly scheduled-report cron emails a saved report iff it is "due
 * now": frequency matches, the UTC hour matches, weekly reports also match the
 * weekday, and last_sent_at hasn't already fired it this period. These tests
 * lock down that selection predicate and the runner's re-send gating without
 * live SMTP.
 */
const base = (over = {}) => ({
    scheduleFrequency: 'daily',
    scheduleHour: 8,
    scheduleDayOfWeek: null,
    lastSentAt: null,
    ...over,
});
(0, node_test_1.describe)('isReportDueNow — frequency + hour', () => {
    const at = (iso) => new Date(iso);
    (0, node_test_1.it)('daily report fires only at its configured UTC hour', () => {
        strict_1.default.equal((0, scheduled_reports_service_1.isReportDueNow)(base({ scheduleHour: 8 }), at('2026-07-16T08:00:00Z')), true);
        strict_1.default.equal((0, scheduled_reports_service_1.isReportDueNow)(base({ scheduleHour: 8 }), at('2026-07-16T07:00:00Z')), false);
        strict_1.default.equal((0, scheduled_reports_service_1.isReportDueNow)(base({ scheduleHour: 8 }), at('2026-07-16T09:00:00Z')), false);
    });
    (0, node_test_1.it)("frequency 'none' never fires, even at the matching hour", () => {
        strict_1.default.equal((0, scheduled_reports_service_1.isReportDueNow)(base({ scheduleFrequency: 'none', scheduleHour: 8 }), at('2026-07-16T08:00:00Z')), false);
    });
    (0, node_test_1.it)('an unknown frequency never fires', () => {
        strict_1.default.equal((0, scheduled_reports_service_1.isReportDueNow)(base({ scheduleFrequency: 'monthly', scheduleHour: 8 }), at('2026-07-16T08:00:00Z')), false);
    });
    (0, node_test_1.it)('respects hour 0 (midnight UTC)', () => {
        strict_1.default.equal((0, scheduled_reports_service_1.isReportDueNow)(base({ scheduleHour: 0 }), at('2026-07-16T00:00:00Z')), true);
        strict_1.default.equal((0, scheduled_reports_service_1.isReportDueNow)(base({ scheduleHour: 0 }), at('2026-07-16T01:00:00Z')), false);
    });
});
(0, node_test_1.describe)('isReportDueNow — weekly weekday', () => {
    const now = new Date('2026-07-16T08:00:00Z');
    const dow = now.getUTCDay();
    (0, node_test_1.it)('fires only on the configured weekday', () => {
        strict_1.default.equal((0, scheduled_reports_service_1.isReportDueNow)(base({ scheduleFrequency: 'weekly', scheduleDayOfWeek: dow }), now), true);
        strict_1.default.equal((0, scheduled_reports_service_1.isReportDueNow)(base({ scheduleFrequency: 'weekly', scheduleDayOfWeek: (dow + 1) % 7 }), now), false);
        strict_1.default.equal((0, scheduled_reports_service_1.isReportDueNow)(base({ scheduleFrequency: 'weekly', scheduleDayOfWeek: (dow + 3) % 7 }), now), false);
    });
    (0, node_test_1.it)('still requires the hour to match on the right weekday', () => {
        const wrongHour = new Date('2026-07-16T09:00:00Z');
        strict_1.default.equal((0, scheduled_reports_service_1.isReportDueNow)(base({ scheduleFrequency: 'weekly', scheduleDayOfWeek: dow, scheduleHour: 8 }), wrongHour), false);
    });
    (0, node_test_1.it)('defaults a weekly report with no weekday to Monday (1)', () => {
        // 2026-07-13 is a Monday.
        const monday = new Date('2026-07-13T08:00:00Z');
        strict_1.default.equal(monday.getUTCDay(), 1);
        strict_1.default.equal((0, scheduled_reports_service_1.isReportDueNow)(base({ scheduleFrequency: 'weekly', scheduleDayOfWeek: null }), monday), true);
        const tuesday = new Date('2026-07-14T08:00:00Z');
        strict_1.default.equal((0, scheduled_reports_service_1.isReportDueNow)(base({ scheduleFrequency: 'weekly', scheduleDayOfWeek: null }), tuesday), false);
    });
});
(0, node_test_1.describe)('isReportDueNow — last_sent_at gating', () => {
    const now = new Date('2026-07-16T08:00:00Z');
    (0, node_test_1.it)('daily: skips a report already sent earlier the same UTC day', () => {
        strict_1.default.equal((0, scheduled_reports_service_1.isReportDueNow)(base({ lastSentAt: '2026-07-16T03:00:00Z' }), now), false);
        strict_1.default.equal((0, scheduled_reports_service_1.isReportDueNow)(base({ lastSentAt: new Date('2026-07-16T07:59:00Z') }), now), false);
    });
    (0, node_test_1.it)('daily: fires again once the day rolls over', () => {
        strict_1.default.equal((0, scheduled_reports_service_1.isReportDueNow)(base({ lastSentAt: '2026-07-15T08:00:00Z' }), now), true);
    });
    (0, node_test_1.it)('weekly: a report sent today is not re-sent; a week later it fires', () => {
        const dow = now.getUTCDay();
        const weekly = (over) => base({ scheduleFrequency: 'weekly', scheduleDayOfWeek: dow, ...over });
        // Sent earlier today → skip (guards a same-hour double-run / prior send-now).
        strict_1.default.equal((0, scheduled_reports_service_1.isReportDueNow)(weekly({ lastSentAt: '2026-07-16T08:00:00Z' }), now), false);
        // Sent exactly a week ago → the next occurrence fires.
        strict_1.default.equal((0, scheduled_reports_service_1.isReportDueNow)(weekly({ lastSentAt: '2026-07-09T08:00:00Z' }), now), true);
    });
    (0, node_test_1.it)('ignores an unparseable last_sent_at (treats it as never sent)', () => {
        strict_1.default.equal((0, scheduled_reports_service_1.isReportDueNow)(base({ lastSentAt: 'not-a-date' }), now), true);
    });
});
/** Minimal Drizzle stand-in: select() yields the report rows; update() records stamps. */
function makeDb(rows) {
    const stamped = [];
    const selectChain = {
        from: () => selectChain,
        leftJoin: () => selectChain,
        where: () => selectChain,
        then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject),
    };
    const db = {
        select: () => selectChain,
        update: () => ({
            set: (vals) => ({
                where: () => {
                    stamped.push({ vals });
                    return Promise.resolve();
                },
            }),
        }),
    };
    return { db, stamped };
}
function makeService(rows) {
    const { db, stamped } = makeDb(rows);
    const runCalls = [];
    const reports = {
        runCustomReport: async (_workspaceId, _def) => {
            runCalls.push(_workspaceId);
            return {
                dimension: 'assignee',
                metrics: ['tasks-count'],
                generatedAt: '2026-07-16T08:00:00.000Z',
                rows: [{ key: 'a', label: 'Alice', values: { 'tasks-count': 3 } }],
            };
        },
    };
    const emailCalls = [];
    const email = {
        sendScheduledReport: async (opts) => {
            emailCalls.push({ to: opts.to, reportName: opts.reportName, frequency: opts.frequency, csv: opts.csv });
        },
    };
    const config = { get: () => 'http://app.test' };
    const svc = new scheduled_reports_service_1.ScheduledReportsService(db, reports, email, config);
    return { svc, stamped, emailCalls, runCalls };
}
const row = (over = {}) => ({
    id: 'r1',
    workspaceId: 'w1',
    name: 'Weekly velocity',
    definition: { metrics: ['tasks-count'], dimension: 'assignee' },
    scheduleFrequency: 'daily',
    scheduleHour: 8,
    scheduleDayOfWeek: null,
    scheduleRecipients: ['team@x.com'],
    lastSentAt: null,
    ownerEmail: 'owner@x.com',
    ...over,
});
(0, node_test_1.describe)('ScheduledReportsService.dispatch', () => {
    const now = new Date('2026-07-16T08:00:00Z');
    (0, node_test_1.it)('emails only the due reports and stamps last_sent_at', async () => {
        const { svc, stamped, emailCalls } = makeService([
            row({ id: 'due', scheduleHour: 8, scheduleRecipients: ['a@x.com'] }),
            row({ id: 'wrong-hour', scheduleHour: 9 }),
            row({ id: 'off', scheduleFrequency: 'none' }),
        ]);
        const res = await svc.dispatch(now);
        strict_1.default.equal(res.candidates, 3);
        strict_1.default.equal(res.due, 1);
        strict_1.default.equal(res.sent, 1);
        strict_1.default.deepEqual(emailCalls.map((c) => c.to), ['a@x.com']);
        strict_1.default.equal(emailCalls[0].csv.split('\n')[0], 'group,tasks-count');
        // last_sent_at stamped exactly once, for the due report.
        strict_1.default.equal(stamped.length, 1);
        strict_1.default.ok(stamped[0].vals.lastSentAt instanceof Date);
    });
    (0, node_test_1.it)('last_sent_at gates a re-send: a report already sent today is not selected', async () => {
        const { svc, emailCalls, stamped } = makeService([
            row({ id: 'already', scheduleHour: 8, lastSentAt: '2026-07-16T05:00:00Z' }),
        ]);
        const res = await svc.dispatch(now);
        strict_1.default.equal(res.due, 0);
        strict_1.default.equal(res.sent, 0);
        strict_1.default.equal(emailCalls.length, 0);
        strict_1.default.equal(stamped.length, 0);
    });
    (0, node_test_1.it)('falls back to the owner email when the recipient list is empty', async () => {
        const { svc, emailCalls } = makeService([
            row({ id: 'ownerfb', scheduleHour: 8, scheduleRecipients: [], ownerEmail: 'owner@x.com' }),
        ]);
        await svc.dispatch(now);
        strict_1.default.deepEqual(emailCalls.map((c) => c.to), ['owner@x.com']);
    });
    (0, node_test_1.it)('delivers each recipient and keeps one report failure from blocking others', async () => {
        const { svc, emailCalls } = makeService([
            row({ id: 'multi', scheduleHour: 8, scheduleRecipients: ['a@x.com', 'b@x.com'] }),
        ]);
        const res = await svc.dispatch(now);
        strict_1.default.equal(res.sent, 1);
        strict_1.default.deepEqual(emailCalls.map((c) => c.to).sort(), ['a@x.com', 'b@x.com']);
    });
});
//# sourceMappingURL=scheduled-reports.service.test.js.map
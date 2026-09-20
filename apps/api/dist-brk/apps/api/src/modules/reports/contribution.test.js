"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const reports_service_1 = require("./reports.service");
/**
 * §7.14 contribution analytics. The pure period/score/narrative helpers are
 * tested directly; the factor math + PDF bytes are exercised via getContribution
 * against a mocked Drizzle (no AiService → deterministic narratives, heuristic
 * source), so it is fully testable without a live model.
 */
(0, node_test_1.describe)('monthPeriodRange (§7.14 period selector)', () => {
    (0, node_test_1.it)('resolves this-month from the 1st (UTC) to now', () => {
        const now = new Date('2026-07-16T12:00:00Z');
        const r = (0, reports_service_1.monthPeriodRange)('this-month', now);
        strict_1.default.equal(r.from.toISOString(), '2026-07-01T00:00:00.000Z');
        strict_1.default.equal(r.to.toISOString(), now.toISOString());
        strict_1.default.equal(r.label, 'July 2026');
    });
    (0, node_test_1.it)('resolves last-month to the full previous calendar month', () => {
        const r = (0, reports_service_1.monthPeriodRange)('last-month', new Date('2026-07-16T12:00:00Z'));
        strict_1.default.equal(r.from.toISOString(), '2026-06-01T00:00:00.000Z');
        strict_1.default.equal(r.to.toISOString(), '2026-06-30T23:59:59.999Z');
        strict_1.default.equal(r.label, 'June 2026');
    });
    (0, node_test_1.it)('handles the January → previous-December year rollover', () => {
        const r = (0, reports_service_1.monthPeriodRange)('last-month', new Date('2026-01-10T00:00:00Z'));
        strict_1.default.equal(r.label, 'December 2025');
    });
});
(0, node_test_1.describe)('scoreContribution (§7.14 factor math)', () => {
    (0, node_test_1.it)('weights completed work + blockers, with on-time and collaboration secondary', () => {
        // 4*3 + 2*2 + round(75/10)=8 + min(20,7)=7 → 31
        strict_1.default.equal((0, reports_service_1.scoreContribution)({ tasksCompleted: 4, onTimeRate: 75, collaboration: 7, blockersResolved: 2 }), 31);
        strict_1.default.equal((0, reports_service_1.scoreContribution)({ tasksCompleted: 0, onTimeRate: 0, collaboration: 0, blockersResolved: 0 }), 0);
        // collaboration is capped at 20
        strict_1.default.equal((0, reports_service_1.scoreContribution)({ tasksCompleted: 0, onTimeRate: 0, collaboration: 999, blockersResolved: 0 }), 20);
    });
});
(0, node_test_1.describe)('contributionNarrativeFallback (§7.14 AI fallback)', () => {
    (0, node_test_1.it)('summarizes the real factors in one sentence', () => {
        const s = (0, reports_service_1.contributionNarrativeFallback)({
            name: 'Alice',
            tasksCompleted: 4,
            onTimeRate: 75,
            collaboration: 7,
            blockersResolved: 2,
        });
        strict_1.default.equal(s, 'Alice completed 4 tasks (75% on time), resolved 2 blockers, and logged 7 collaboration touchpoints.');
    });
    (0, node_test_1.it)('states the no-activity case', () => {
        strict_1.default.match((0, reports_service_1.contributionNarrativeFallback)({ name: 'Bob', tasksCompleted: 0, onTimeRate: 0, collaboration: 0, blockersResolved: 0 }), /Bob has no recorded activity/);
    });
});
// Queued-result Drizzle mock: each top-level select() yields the next array.
function makeDb(selectResults) {
    let i = 0;
    const chain = (rows) => {
        const c = {
            from: () => c,
            where: () => c,
            innerJoin: () => c,
            leftJoin: () => c,
            groupBy: () => c,
            orderBy: () => c,
            limit: () => c,
            then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject),
        };
        return c;
    };
    return { select: () => chain(selectResults[i++] ?? []) };
}
// members, then completed rows, then activity rows (getContribution's 3 selects).
const contributionRows = () => [
    [
        { userId: 'a', name: 'Alice', email: 'a@x.com' },
        { userId: 'b', name: 'Bob', email: 'b@x.com' },
    ],
    [
        { userId: 'a', completed: 4, onTime: 3, assigned: 5 },
        { userId: 'b', completed: 0, onTime: 0, assigned: 1 },
    ],
    [
        { actorId: 'a', action: 'commented', count: 5 },
        { actorId: 'a', action: 'dependency_removed', count: 2 },
        { actorId: 'b', action: 'assigned', count: 1 },
    ],
];
(0, node_test_1.describe)('ReportsService.getContribution (§7.14)', () => {
    (0, node_test_1.it)('computes per-member factors, sorts by score, and attaches a narrative', async () => {
        const svc = new reports_service_1.ReportsService(makeDb(contributionRows()));
        const res = await svc.getContribution('w1', { period: 'this-month' });
        strict_1.default.equal(res.source, 'heuristic'); // no AiService injected
        strict_1.default.equal(res.period.type, 'this-month');
        // Sorted by score desc → Alice (31) before Bob (1).
        strict_1.default.equal(res.members[0].name, 'Alice');
        const alice = res.members[0];
        strict_1.default.equal(alice.tasksCompleted, 4);
        strict_1.default.equal(alice.onTimeRate, 75);
        strict_1.default.equal(alice.collaboration, 7); // 5 commented + 2 dependency_removed
        strict_1.default.equal(alice.blockersResolved, 2);
        strict_1.default.equal(alice.score, 31);
        strict_1.default.match(alice.narrative, /Alice completed 4 tasks \(75% on time\), resolved 2 blockers/);
        const bob = res.members[1];
        strict_1.default.equal(bob.tasksCompleted, 0);
        strict_1.default.equal(bob.collaboration, 1);
        strict_1.default.equal(bob.score, 1);
    });
});
(0, node_test_1.describe)('ReportsService.exportContributionPdf (§7.14 PDF bytes)', () => {
    (0, node_test_1.it)('renders a valid PDF buffer', async () => {
        const svc = new reports_service_1.ReportsService(makeDb(contributionRows()));
        const buf = await svc.exportContributionPdf('w1', { period: 'this-month' });
        strict_1.default.ok(Buffer.isBuffer(buf));
        strict_1.default.ok(buf.length > 200);
        const head = buf.subarray(0, 8).toString('latin1');
        strict_1.default.match(head, /^%PDF-1\./);
        strict_1.default.ok(buf.subarray(-6).toString('latin1').includes('%%EOF'));
    });
});
//# sourceMappingURL=contribution.test.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const db_1 = require("@rundesk/db");
const project_health_service_1 = require("./project-health.service");
/**
 * §7.13 — the daily project-health cron reuses getProjectHealth's deterministic
 * signals and folds in a comment-sentiment component with a fixed weight, then
 * upserts one row per project per day keyed by (project_id, scored_on). These
 * lock down the blend math and prove the upsert is idempotent (ON CONFLICT on
 * the day key) without a live database.
 */
(0, node_test_1.describe)('bandForScore (§7.13)', () => {
    (0, node_test_1.it)('applies the shared thresholds green ≥ 75, yellow ≥ 50, else red', () => {
        strict_1.default.equal((0, project_health_service_1.bandForScore)(75), 'green');
        strict_1.default.equal((0, project_health_service_1.bandForScore)(74), 'yellow');
        strict_1.default.equal((0, project_health_service_1.bandForScore)(50), 'yellow');
        strict_1.default.equal((0, project_health_service_1.bandForScore)(49), 'red');
        strict_1.default.equal((0, project_health_service_1.bandForScore)(0), 'red');
    });
});
(0, node_test_1.describe)('foldSentimentIntoHealth (§7.13)', () => {
    const base = (score, band) => ({
        score,
        band,
        components: { onTime: 100, overdue: 100, blockers: 100, activity: 100 },
    });
    (0, node_test_1.it)('leaves empty projects at score 0 / band empty (sentiment never resurrects them)', () => {
        const r = (0, project_health_service_1.foldSentimentIntoHealth)(base(0, 'empty'), 100);
        strict_1.default.equal(r.score, 0);
        strict_1.default.equal(r.band, 'empty');
        strict_1.default.equal(r.components.sentiment, 100);
    });
    (0, node_test_1.it)('blends sentiment at the documented 15% weight', () => {
        // 80 * 0.85 + 0 * 0.15 = 68 → drops a green project to yellow.
        const r = (0, project_health_service_1.foldSentimentIntoHealth)(base(80, 'green'), 0);
        strict_1.default.equal(project_health_service_1.SENTIMENT_WEIGHT, 0.15);
        strict_1.default.equal(r.score, 68);
        strict_1.default.equal(r.band, 'yellow');
        strict_1.default.equal(r.components.sentiment, 0);
    });
    (0, node_test_1.it)('is a no-op on the score when sentiment equals the base score', () => {
        const r = (0, project_health_service_1.foldSentimentIntoHealth)(base(60, 'yellow'), 60);
        strict_1.default.equal(r.score, 60);
        strict_1.default.equal(r.band, 'yellow');
    });
    (0, node_test_1.it)('lifts a struggling project when discussion is very positive', () => {
        // 40 * 0.85 + 100 * 0.15 = 49 → still red but improved.
        const r = (0, project_health_service_1.foldSentimentIntoHealth)(base(40, 'red'), 100);
        strict_1.default.equal(r.score, 49);
        strict_1.default.equal(r.band, 'red');
    });
    (0, node_test_1.it)('clamps sentiment into 0..100', () => {
        strict_1.default.equal((0, project_health_service_1.foldSentimentIntoHealth)(base(50, 'yellow'), 500).components.sentiment, 100);
        strict_1.default.equal((0, project_health_service_1.foldSentimentIntoHealth)(base(50, 'yellow'), -20).components.sentiment, 0);
    });
});
(0, node_test_1.describe)('utcDayString (§7.13)', () => {
    (0, node_test_1.it)('formats the UTC calendar day (the scored_on key)', () => {
        strict_1.default.equal((0, project_health_service_1.utcDayString)(new Date('2026-07-16T23:30:00Z')), '2026-07-16');
        strict_1.default.equal((0, project_health_service_1.utcDayString)(new Date('2026-01-02T00:00:00Z')), '2026-01-02');
    });
});
/** Mock db that records the insert values + the onConflict config it was given. */
function recordingDb() {
    const calls = [];
    const db = {
        insert: () => ({
            values: (values) => ({
                onConflictDoUpdate: (conflict) => {
                    calls.push({ values, conflict });
                    return Promise.resolve();
                },
            }),
        }),
    };
    return { db, calls };
}
(0, node_test_1.describe)('ProjectHealthService.upsertProjectScore idempotency (§7.13)', () => {
    (0, node_test_1.it)('upserts ON CONFLICT (project_id, scored_on) so a re-run the same day updates in place', async () => {
        const { db, calls } = recordingDb();
        const svc = new project_health_service_1.ProjectHealthService(db, null, null);
        const row = {
            projectId: 'p1',
            workspaceId: 'w1',
            score: 82,
            band: 'green',
            components: { onTime: 90, overdue: 80, blockers: 100, activity: 70, sentiment: 60 },
            sentiment: { score: 60, label: 'neutral', positive: 1, negative: 0, samples: 3, source: 'deterministic' },
            scoredOn: '2026-07-16',
        };
        // Two runs the same day with the same key = the daily cron re-firing.
        await svc.upsertProjectScore(row);
        await svc.upsertProjectScore({ ...row, score: 84 });
        strict_1.default.equal(calls.length, 2);
        // Conflict target is exactly the day-unique key columns.
        for (const c of calls) {
            strict_1.default.deepEqual(c.conflict.target, [db_1.projectHealthScores.projectId, db_1.projectHealthScores.scoredOn]);
            // The mutable metrics are in the update set (so the re-run overwrites).
            strict_1.default.ok('score' in c.conflict.set && 'band' in c.conflict.set && 'sentiment' in c.conflict.set);
        }
        strict_1.default.equal(calls[0].values.scoredOn, '2026-07-16');
        strict_1.default.equal(calls[1].values.score, 84);
    });
});
/** Mock db whose select() chain resolves to a fixed set of rows. */
function selectDb(rows) {
    const chain = {
        from: () => chain,
        where: () => chain,
        innerJoin: () => chain,
        leftJoin: () => chain,
        orderBy: () => chain,
        groupBy: () => chain,
        limit: () => chain,
        then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject),
    };
    return { select: () => chain };
}
(0, node_test_1.describe)('ProjectHealthService.getTrend (§7.13)', () => {
    (0, node_test_1.it)('returns points oldest→newest with the latest as current', async () => {
        const rows = [
            { scoredOn: '2026-07-14', score: 70, band: 'yellow', components: {}, sentiment: { score: 50 } },
            { scoredOn: '2026-07-15', score: 78, band: 'green', components: {}, sentiment: { score: 60 } },
            { scoredOn: '2026-07-16', score: 82, band: 'green', components: {}, sentiment: { score: 65 } },
        ];
        const svc = new project_health_service_1.ProjectHealthService(selectDb(rows), null, null);
        const trend = await svc.getTrend('w1', 'p1', 30);
        strict_1.default.equal(trend.points.length, 3);
        strict_1.default.equal(trend.points[0].date, '2026-07-14');
        strict_1.default.deepEqual(trend.current, { score: 82, band: 'green', sentiment: { score: 65 } });
        strict_1.default.equal(trend.days, 30);
    });
    (0, node_test_1.it)('clamps the day horizon and reports a null current with no history', async () => {
        const svc = new project_health_service_1.ProjectHealthService(selectDb([]), null, null);
        const trend = await svc.getTrend('w1', 'p1', 9999);
        strict_1.default.equal(trend.days, 365);
        strict_1.default.equal(trend.current, null);
        strict_1.default.deepEqual(trend.points, []);
    });
});
//# sourceMappingURL=project-health.test.js.map
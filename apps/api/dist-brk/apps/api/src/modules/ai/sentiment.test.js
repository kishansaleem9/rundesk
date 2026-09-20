"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const ai_service_1 = require("./ai.service");
/**
 * §7.13 — the project-health comment-sentiment component and §7.11 — the daily
 * briefing both need a deterministic path that works with ANTHROPIC_API_KEY
 * unset. These lock down the keyword sentiment classifier and the briefing
 * template fallback the crons rely on when no model is configured.
 */
(0, node_test_1.describe)('analyzeSentimentDeterministic (§7.13)', () => {
    (0, node_test_1.it)('is a neutral 50 with no comments', () => {
        const r = (0, ai_service_1.analyzeSentimentDeterministic)([]);
        strict_1.default.equal(r.score, 50);
        strict_1.default.equal(r.label, 'neutral');
        strict_1.default.equal(r.samples, 0);
        strict_1.default.equal(r.source, 'deterministic');
    });
    (0, node_test_1.it)('ignores blank/whitespace-only comments', () => {
        const r = (0, ai_service_1.analyzeSentimentDeterministic)(['', '   ', '\n']);
        strict_1.default.equal(r.samples, 0);
        strict_1.default.equal(r.score, 50);
    });
    (0, node_test_1.it)('scores clearly positive discussion high', () => {
        const r = (0, ai_service_1.analyzeSentimentDeterministic)([
            'Great work, this is done and shipped!',
            'Thanks, looks good — approved.',
            'Nice, works perfectly now.',
        ]);
        strict_1.default.equal(r.samples, 3);
        strict_1.default.equal(r.positive, 3);
        strict_1.default.equal(r.label, 'positive');
        strict_1.default.ok(r.score >= 60, `expected >=60, got ${r.score}`);
    });
    (0, node_test_1.it)('scores clearly negative discussion low', () => {
        const r = (0, ai_service_1.analyzeSentimentDeterministic)([
            'This is blocked and broken.',
            'Still failing with an error, stuck.',
            'Bug is a blocker, urgent problem.',
        ]);
        strict_1.default.equal(r.negative, 3);
        strict_1.default.equal(r.label, 'negative');
        strict_1.default.ok(r.score <= 40, `expected <=40, got ${r.score}`);
    });
    (0, node_test_1.it)('treats keyword-free chatter as neutral (score 50)', () => {
        const r = (0, ai_service_1.analyzeSentimentDeterministic)(['Let us sync at 3pm.', 'Moved the file to the new folder.']);
        strict_1.default.equal(r.samples, 2);
        strict_1.default.equal(r.positive, 0);
        strict_1.default.equal(r.negative, 0);
        strict_1.default.equal(r.score, 50);
        strict_1.default.equal(r.label, 'neutral');
    });
    (0, node_test_1.it)('balances a mixed positive/negative pair to neutral', () => {
        const r = (0, ai_service_1.analyzeSentimentDeterministic)(['done and great', 'blocked and broken']);
        strict_1.default.equal(r.positive, 1);
        strict_1.default.equal(r.negative, 1);
        strict_1.default.equal(r.score, 50);
    });
});
const emptyBriefing = (over = {}) => ({
    displayName: 'Ada Lovelace',
    dueToday: [],
    overdue: [],
    blocking: [],
    atRisk: [],
    ...over,
});
(0, node_test_1.describe)('formatBriefingFallback (§7.11)', () => {
    (0, node_test_1.it)('greets by first name and reassures when nothing is urgent', () => {
        const text = (0, ai_service_1.formatBriefingFallback)(emptyBriefing());
        strict_1.default.match(text, /Ada/);
        strict_1.default.match(text, /Nothing urgent/i);
        strict_1.default.ok(text.length > 0);
    });
    (0, node_test_1.it)('leads with overdue, then blocking, then due-today, then at-risk', () => {
        const text = (0, ai_service_1.formatBriefingFallback)(emptyBriefing({
            overdue: ['Overdue A'],
            blocking: ['Blocker B'],
            dueToday: ['Today C'],
            atRisk: ['Soon D'],
        }));
        const iOverdue = text.indexOf('overdue');
        const iBlocking = text.indexOf('blocking others');
        const iDue = text.indexOf('due today');
        const iRisk = text.indexOf('at risk');
        strict_1.default.ok(iOverdue >= 0 && iBlocking > iOverdue && iDue > iBlocking && iRisk > iDue, text);
    });
    (0, node_test_1.it)('summarizes counts and lists the titles', () => {
        const text = (0, ai_service_1.formatBriefingFallback)(emptyBriefing({ overdue: ['Ship release', 'Fix login'] }));
        strict_1.default.match(text, /2 overdue tasks/);
        strict_1.default.match(text, /Ship release/);
    });
    (0, node_test_1.it)('caps the visible titles and shows a +N more suffix', () => {
        const text = (0, ai_service_1.formatBriefingFallback)(emptyBriefing({ dueToday: ['t1', 't2', 't3', 't4', 't5'] }));
        strict_1.default.match(text, /\+2 more/);
    });
});
(0, node_test_1.describe)('briefingHasContent (§7.11)', () => {
    (0, node_test_1.it)('is false for an all-empty briefing', () => {
        strict_1.default.equal((0, ai_service_1.briefingHasContent)(emptyBriefing()), false);
    });
    (0, node_test_1.it)('is true when any bucket is non-empty', () => {
        strict_1.default.equal((0, ai_service_1.briefingHasContent)(emptyBriefing({ overdue: ['x'] })), true);
        strict_1.default.equal((0, ai_service_1.briefingHasContent)(emptyBriefing({ blocking: ['x'] })), true);
        strict_1.default.equal((0, ai_service_1.briefingHasContent)(emptyBriefing({ dueToday: ['x'] })), true);
        strict_1.default.equal((0, ai_service_1.briefingHasContent)(emptyBriefing({ atRisk: ['x'] })), true);
    });
});
//# sourceMappingURL=sentiment.test.js.map
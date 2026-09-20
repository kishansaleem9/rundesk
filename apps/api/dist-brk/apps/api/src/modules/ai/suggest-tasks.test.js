"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const ai_service_1 = require("./ai.service");
/**
 * Unit coverage for the §7.10 smart task-suggestion helpers. The pure functions
 * (keyword extraction, similarity, ranking, deterministic fallback, sanitizer,
 * basis line) are tested directly; the best-effort service path is exercised
 * with AI unavailable (ANTHROPIC_API_KEY is unset in CI) to lock in the
 * most-frequent-titles fallback.
 */
(0, node_test_1.describe)('projectKeywords / projectSimilarity (§7.10)', () => {
    (0, node_test_1.it)('drops stopwords and short tokens', () => {
        const kw = (0, ai_service_1.projectKeywords)('The New Mobile App Redesign');
        strict_1.default.ok(kw.has('mobile'));
        strict_1.default.ok(kw.has('redesign'));
        strict_1.default.ok(!kw.has('the'));
        strict_1.default.ok(!kw.has('app')); // stopword
        strict_1.default.ok(!kw.has('new')); // stopword
    });
    (0, node_test_1.it)('scores keyword overlap with a containment bonus', () => {
        // {mobile,redesign} vs {mobile,launch}: shared 1 / union 3 ≈ 0.33
        strict_1.default.ok(Math.abs((0, ai_service_1.projectSimilarity)('Mobile App Redesign', 'Mobile App Launch') - 1 / 3) < 1e-9);
        // containment bonus pushes a subset name higher
        strict_1.default.ok((0, ai_service_1.projectSimilarity)('Website', 'Website Revamp') > 0.6);
        // no shared keywords → 0
        strict_1.default.equal((0, ai_service_1.projectSimilarity)('Payroll', 'Garden Party'), 0);
    });
});
(0, node_test_1.describe)('rankSimilarProjects (§7.10)', () => {
    const candidates = [
        { id: '1', name: 'Marketing Website', taskTitles: ['a'] },
        { id: '2', name: 'Payroll System', taskTitles: ['b'] },
        { id: '3', name: 'Marketing Campaign Q3', taskTitles: ['c'] },
    ];
    (0, node_test_1.it)('ranks by similarity, keeping only projects with signal', () => {
        const ranked = (0, ai_service_1.rankSimilarProjects)('Marketing Launch', candidates);
        strict_1.default.equal(ranked[0].name.startsWith('Marketing'), true);
        // Payroll shares no keywords → excluded when there is signal elsewhere.
        strict_1.default.ok(!ranked.some((r) => r.name === 'Payroll System'));
    });
    (0, node_test_1.it)('falls back to the most recent few when nothing matches', () => {
        const ranked = (0, ai_service_1.rankSimilarProjects)('Zzz Unrelated', candidates, 2);
        strict_1.default.equal(ranked.length, 2);
    });
});
(0, node_test_1.describe)('deterministicTaskSuggestions (§7.10 fallback)', () => {
    (0, node_test_1.it)('returns the most-frequent titles, counting a title once per project', () => {
        const similar = [
            { id: '1', name: 'A', score: 0.5, taskTitles: ['Design mockups', 'Set up repo', 'Design mockups'] },
            { id: '2', name: 'B', score: 0.4, taskTitles: ['design MOCKUPS', 'Write tests'] },
        ];
        const out = (0, ai_service_1.deterministicTaskSuggestions)(similar);
        // "Design mockups" appears in both projects (case-insensitive) → first.
        strict_1.default.equal(out[0].title, 'Design mockups');
        const titles = out.map((s) => s.title);
        strict_1.default.deepEqual(titles, ['Design mockups', 'Set up repo', 'Write tests']);
    });
    (0, node_test_1.it)('is empty when no similar project has tasks', () => {
        strict_1.default.deepEqual((0, ai_service_1.deterministicTaskSuggestions)([{ id: '1', name: 'A', score: 0, taskTitles: [] }]), []);
    });
});
(0, node_test_1.describe)('sanitizeTaskSuggestions (§7.10)', () => {
    (0, node_test_1.it)('accepts strings/objects, strips numbering, validates priority, de-dupes', () => {
        const out = (0, ai_service_1.sanitizeTaskSuggestions)([
            '1. Set up CI',
            { title: 'Set up CI' }, // dup by normalized title
            { title: 'Ship it', priority: 'high' },
            { title: 'Bad prio', priority: 'wat' },
            { title: '' },
            42,
        ]);
        strict_1.default.deepEqual(out, [
            { title: 'Set up CI' },
            { title: 'Ship it', priority: 'high' },
            { title: 'Bad prio' },
        ]);
    });
    (0, node_test_1.it)('returns [] for non-arrays', () => {
        strict_1.default.deepEqual((0, ai_service_1.sanitizeTaskSuggestions)('nope'), []);
    });
});
(0, node_test_1.describe)('summarizeSuggestionBasis (§7.10)', () => {
    (0, node_test_1.it)('names the projects it learned from', () => {
        const basis = (0, ai_service_1.summarizeSuggestionBasis)([
            { id: '1', name: 'Alpha', score: 0.5, taskTitles: ['x'] },
            { id: '2', name: 'Beta', score: 0.4, taskTitles: ['y'] },
        ]);
        strict_1.default.match(basis, /Learned from 2 similar projects: Alpha, Beta/);
    });
    (0, node_test_1.it)('states the empty case', () => {
        strict_1.default.match((0, ai_service_1.summarizeSuggestionBasis)([]), /No similar projects with tasks yet/);
    });
});
(0, node_test_1.describe)('AiService.suggestTasks fallback (§7.10, best-effort)', () => {
    (0, node_test_1.it)('returns the heuristic source (most-frequent titles) when AI is not configured', async () => {
        const config = { get: () => undefined }; // no ANTHROPIC_API_KEY → isAvailable() false
        // collectCandidateProjects fires 2 selects: project rows, then task rows.
        // "Draft copy" appears in BOTH similar projects → most frequent (a title is
        // counted at most once per project).
        const results = [
            [
                { id: 'p2', name: 'Marketing Website' },
                { id: 'p3', name: 'Marketing Campaign' },
            ],
            [
                { projectId: 'p2', title: 'Draft copy' },
                { projectId: 'p2', title: 'Design hero' },
                { projectId: 'p3', title: 'Draft copy' },
                { projectId: 'p3', title: 'Set schedule' },
            ],
        ];
        let i = 0;
        const chain = (rows) => {
            const c = {
                from: () => c,
                innerJoin: () => c,
                where: () => c,
                orderBy: () => c,
                limit: () => c,
                then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject),
            };
            return c;
        };
        const db = { select: () => chain(results[i++] ?? []) };
        const svc = new ai_service_1.AiService(config, db, {});
        const res = await svc.suggestTasks({ workspaceId: 'w1', projectName: 'Marketing Launch' }, { workspaceId: 'w1' });
        strict_1.default.equal(res.source, 'heuristic');
        strict_1.default.ok(res.suggestions.length >= 1);
        strict_1.default.equal(res.suggestions[0].title, 'Draft copy'); // most frequent
        strict_1.default.match(res.basis, /Marketing Website/);
    });
});
//# sourceMappingURL=suggest-tasks.test.js.map
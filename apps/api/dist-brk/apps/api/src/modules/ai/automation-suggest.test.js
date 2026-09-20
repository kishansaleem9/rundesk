"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const ai_service_1 = require("./ai.service");
/**
 * Unit coverage for the §7.7 AI automation-suggestion helpers and the §7.4
 * team-workload signal. The pure functions (behavior summary, workload string,
 * suggestion sanitizer, deterministic fallback) are tested directly; the
 * best-effort service path is tested with AI unavailable to lock in the
 * deterministic fallback (ANTHROPIC_API_KEY is unset in CI).
 */
const behavior = {
    totalOpenTasks: 12,
    overdueCount: 3,
    statusTransitions: [
        { from: 'in_progress', to: 'done', count: 9 },
        { from: 'todo', to: 'in_progress', count: 4 },
    ],
    topAssignees: [{ name: 'Alice', count: 7 }],
    commentActivityCount: 5,
};
(0, node_test_1.describe)('formatAutomationBehavior (Plan §7.7)', () => {
    (0, node_test_1.it)('summarizes counts, transitions and assignees compactly', () => {
        const out = (0, ai_service_1.formatAutomationBehavior)(behavior);
        strict_1.default.match(out, /Open tasks: 12/);
        strict_1.default.match(out, /Currently overdue tasks: 3/);
        strict_1.default.match(out, /in_progress -> done \(9x\)/);
        strict_1.default.match(out, /Alice \(7 open assignments\)/);
        strict_1.default.match(out, /Comment activity \(last 30 days\): 5/);
    });
    (0, node_test_1.it)('states the no-transitions case explicitly', () => {
        const out = (0, ai_service_1.formatAutomationBehavior)({ ...behavior, statusTransitions: [] });
        strict_1.default.match(out, /No recorded status transitions/);
    });
});
(0, node_test_1.describe)('formatTeamWorkload (Plan §7.4)', () => {
    (0, node_test_1.it)('formats per-assignee open counts with singular/plural', () => {
        strict_1.default.equal((0, ai_service_1.formatTeamWorkload)([{ name: 'Alice', open: 8 }, { name: 'Bob', open: 1 }]), 'Current assignee workload — Alice: 8 open tasks; Bob: 1 open task');
    });
    (0, node_test_1.it)('returns empty string when there are no assignees', () => {
        strict_1.default.equal((0, ai_service_1.formatTeamWorkload)([]), '');
    });
});
(0, node_test_1.describe)('sanitizeAutomationSuggestions (Plan §7.7)', () => {
    (0, node_test_1.it)('keeps valid suggestions and coerces params to strings', () => {
        const out = (0, ai_service_1.sanitizeAutomationSuggestions)([
            {
                name: 'Escalate',
                trigger: { type: 'task.overdue', filters: { projectId: 'p1' } },
                actions: [{ type: 'set_priority', params: { priority: 'urgent', keep: 3 } }],
                rationale: 'busy',
            },
        ]);
        strict_1.default.equal(out.length, 1);
        strict_1.default.equal(out[0].trigger.type, 'task.overdue');
        strict_1.default.deepEqual(out[0].actions[0].params, { priority: 'urgent', keep: '3' });
    });
    (0, node_test_1.it)('drops unknown trigger/action types, action-less rules, and non-arrays', () => {
        strict_1.default.equal((0, ai_service_1.sanitizeAutomationSuggestions)('nope').length, 0);
        strict_1.default.equal((0, ai_service_1.sanitizeAutomationSuggestions)([
            { trigger: { type: 'task.hacked' }, actions: [{ type: 'set_priority', params: {} }] },
            { trigger: { type: 'task.overdue' }, actions: [{ type: 'delete_everything', params: {} }] },
            { trigger: { type: 'task.overdue' }, actions: [] },
        ]).length, 0);
    });
});
(0, node_test_1.describe)('deterministicAutomationSuggestions (Plan §7.7 fallback)', () => {
    (0, node_test_1.it)('derives rules from behavior and returns 2-4 valid suggestions', () => {
        const out = (0, ai_service_1.deterministicAutomationSuggestions)(behavior);
        strict_1.default.ok(out.length >= 2 && out.length <= 4);
        // Dominant transition -> notify on move to "done".
        strict_1.default.ok(out.some((s) => s.trigger.type === 'task.status_changed' && s.trigger.filters?.toStatus === 'done'));
        // Overdue pressure -> escalate to urgent.
        strict_1.default.ok(out.some((s) => s.trigger.type === 'task.overdue' && s.actions.some((a) => a.type === 'set_priority')));
        // Everything it emits must survive the sanitizer (valid types).
        strict_1.default.equal((0, ai_service_1.sanitizeAutomationSuggestions)(out).length, out.length);
    });
    (0, node_test_1.it)('still returns >= 2 suggestions for a quiet/new workspace', () => {
        const out = (0, ai_service_1.deterministicAutomationSuggestions)({
            totalOpenTasks: 0,
            overdueCount: 0,
            statusTransitions: [],
            topAssignees: [],
            commentActivityCount: 0,
        });
        strict_1.default.ok(out.length >= 2);
        strict_1.default.equal((0, ai_service_1.sanitizeAutomationSuggestions)(out).length, out.length);
    });
});
(0, node_test_1.describe)('AiService.suggestAutomations fallback (Plan §7.7, best-effort)', () => {
    (0, node_test_1.it)('returns the heuristic source when AI is not configured', async () => {
        // No ANTHROPIC_API_KEY -> client stays null -> isAvailable() false.
        const config = { get: () => undefined };
        const db = {
            // collectAutomationBehavior fires 5 read queries; every chain resolves [].
            select: () => {
                const c = {
                    from: () => c,
                    innerJoin: () => c,
                    where: () => c,
                    groupBy: () => c,
                    orderBy: () => c,
                    limit: () => c,
                    then: (resolve) => Promise.resolve([]).then(resolve),
                };
                return c;
            },
        };
        const svc = new ai_service_1.AiService(config, db, {});
        const result = await svc.suggestAutomations('ws1', { workspaceId: 'ws1' });
        strict_1.default.equal(result.source, 'heuristic');
        strict_1.default.ok(result.suggestions.length >= 2);
        strict_1.default.equal((0, ai_service_1.sanitizeAutomationSuggestions)(result.suggestions).length, result.suggestions.length);
    });
});
//# sourceMappingURL=automation-suggest.test.js.map
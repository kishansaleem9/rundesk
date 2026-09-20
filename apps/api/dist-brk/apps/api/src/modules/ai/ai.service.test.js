"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const ai_service_1 = require("./ai.service");
/**
 * Unit tests for the AI context/summary-input ASSEMBLY functions (Plan §7.5/§7.6/§7.15).
 *
 * These are the pure string-assembly halves of `buildWorkspaceContext` and
 * `buildTaskSummaryInput`; the DB-read halves are exercised separately against
 * Postgres. Keeping the formatters pure means the grounding/token-bounding
 * behaviour is locked in without a database.
 */
(0, node_test_1.describe)('formatWorkspaceContext (Plan §7.6/§7.15)', () => {
    const base = {
        workspaceName: 'Acme',
        role: 'workspace_admin',
        counts: { spaces: 2, projects: 3, lists: 5, openTasks: 9 },
        spaces: [{ name: 'Engineering', projects: ['API', 'Web'] }],
        openTasks: [{ title: 'Fix login', dueDate: '2026-07-20T00:00:00Z', priority: 'high' }],
        history: [{ title: 'Ship v1', status: 'done', updatedAt: '2026-07-10T00:00:00Z' }],
    };
    (0, node_test_1.it)('includes role, structure counts+names, open tasks and 90-day history', () => {
        const out = (0, ai_service_1.formatWorkspaceContext)(base);
        strict_1.default.match(out, /Workspace: Acme/);
        strict_1.default.match(out, /Your role: workspace_admin/);
        strict_1.default.match(out, /2 spaces, 3 projects, 5 lists, 9 open tasks/);
        strict_1.default.match(out, /Workspace structure:/);
        strict_1.default.match(out, /Engineering — projects: API, Web/);
        strict_1.default.match(out, /Your open assigned tasks:/);
        strict_1.default.match(out, /Fix login \(due 2026-07-20\) \[high\]/);
        strict_1.default.match(out, /Recent task history \(last 90 days/);
        strict_1.default.match(out, /Ship v1 \[done\] \(updated 2026-07-10\)/);
    });
    (0, node_test_1.it)('includes the currentView hint only when provided', () => {
        strict_1.default.doesNotMatch((0, ai_service_1.formatWorkspaceContext)(base), /Current view:/);
        strict_1.default.match((0, ai_service_1.formatWorkspaceContext)({ ...base, currentView: 'list Backlog' }), /Current view: list Backlog/);
    });
    (0, node_test_1.it)('states the no-open-tasks case explicitly', () => {
        const out = (0, ai_service_1.formatWorkspaceContext)({ ...base, openTasks: [] });
        strict_1.default.match(out, /You have no open assigned tasks\./);
        strict_1.default.doesNotMatch(out, /Your open assigned tasks:/);
    });
    (0, node_test_1.it)('is token-bounded: caps spaces to 15, projects/space to 8 (+N more), history to 40', () => {
        const manySpaces = Array.from({ length: 30 }, (_v, i) => ({
            name: `S${i}`,
            projects: Array.from({ length: 20 }, (_p, j) => `P${i}-${j}`),
        }));
        const manyHistory = Array.from({ length: 100 }, (_v, i) => ({
            title: `H${i}`,
            status: 'done',
            updatedAt: null,
        }));
        const out = (0, ai_service_1.formatWorkspaceContext)({ ...base, spaces: manySpaces, history: manyHistory });
        const structureLines = out.split('\n').filter((l) => l.startsWith('- S'));
        strict_1.default.equal(structureLines.length, 15, 'caps to 15 spaces');
        strict_1.default.match(out, /\+12 more/, 'shows overflow count for projects beyond 8');
        const historyLines = out.split('\n').filter((l) => /^- H\d+ \[done\]/.test(l));
        strict_1.default.equal(historyLines.length, 40, 'caps history to 40 rows');
    });
    (0, node_test_1.it)('omits due/updated parentheticals when dates are absent or invalid', () => {
        const out = (0, ai_service_1.formatWorkspaceContext)({
            ...base,
            openTasks: [{ title: 'No due', dueDate: null, priority: 'low' }],
            history: [{ title: 'No date', status: 'todo', updatedAt: 'not-a-date' }],
        });
        strict_1.default.match(out, /- No due \[low\]/);
        strict_1.default.doesNotMatch(out, /No due \(due/);
        strict_1.default.match(out, /- No date \[todo\]$/m);
    });
});
(0, node_test_1.describe)('formatTaskSummaryInput (Plan §7.5)', () => {
    const base = {
        title: 'Ship summaries',
        description: 'Stream token by token',
        status: 'in_progress',
        priority: 'high',
        activity: [{ action: 'status_changed', actor: 'Alice' }],
        subtasks: [{ title: 'Route', status: 'todo' }],
        blockers: [{ title: 'Design frame', status: 'in_progress' }],
        comments: [{ author: 'Bob', body: 'Keep a fallback' }],
    };
    (0, node_test_1.it)('assembles title/status/priority/description plus enrichment sections', () => {
        const out = (0, ai_service_1.formatTaskSummaryInput)(base);
        strict_1.default.match(out, /Task: Ship summaries/);
        strict_1.default.match(out, /Status: in_progress/);
        strict_1.default.match(out, /Priority: high/);
        strict_1.default.match(out, /Description:\nStream token by token/);
        strict_1.default.match(out, /Open subtasks \(1\):\n- Route \[todo\]/);
        strict_1.default.match(out, /Open blockers \(1\):\n- Design frame \[in_progress\]/);
        strict_1.default.match(out, /Recent comments:\n- Bob: Keep a fallback/);
        strict_1.default.match(out, /Recent activity:\n- Alice status changed/);
    });
    (0, node_test_1.it)('falls back to (no description) and drops empty enrichment sections', () => {
        const out = (0, ai_service_1.formatTaskSummaryInput)({
            title: 'Bare',
            description: null,
            activity: [],
            subtasks: [],
            blockers: [],
            comments: [],
        });
        strict_1.default.match(out, /Description:\n\(no description\)/);
        strict_1.default.doesNotMatch(out, /Open subtasks/);
        strict_1.default.doesNotMatch(out, /Open blockers/);
        strict_1.default.doesNotMatch(out, /Recent comments/);
        strict_1.default.doesNotMatch(out, /Recent activity/);
    });
    (0, node_test_1.it)('is bounded: last 6 comments, first 8 activity, truncated comment bodies', () => {
        const longBody = 'x'.repeat(500);
        const out = (0, ai_service_1.formatTaskSummaryInput)({
            ...base,
            comments: Array.from({ length: 10 }, (_v, i) => ({ author: `U${i}`, body: longBody })),
            activity: Array.from({ length: 20 }, (_v, i) => ({ action: 'updated', actor: `A${i}` })),
        });
        const commentLines = out.split('\n').filter((l) => /^- U\d+:/.test(l));
        strict_1.default.equal(commentLines.length, 6, 'keeps only the last 6 comments');
        strict_1.default.match(out, /- U4:/, 'last 6 means U4..U9');
        strict_1.default.ok(commentLines[0].length < 300, 'comment body is truncated');
        const activityLines = out.split('\n').filter((l) => /^- A\d+ updated/.test(l));
        strict_1.default.equal(activityLines.length, 8, 'keeps only the first 8 activity rows');
    });
});
//# sourceMappingURL=ai.service.test.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectHealthScoresRelations = exports.projectHealthScores = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const projects_1 = require("./projects");
const workspaces_1 = require("./workspaces");
/**
 * §7.13 Project Health Scoring — one persisted row per active project per day.
 * The daily cron (ProjectHealthService) reuses the deterministic formula in
 * ReportsService.getProjectHealth and folds in a comment-sentiment component,
 * then upserts here keyed by (project_id, scored_on) so re-runs the same day are
 * idempotent. The trend endpoint reads these rows back for a 30-day sparkline.
 */
exports.projectHealthScores = (0, pg_core_1.pgTable)('project_health_scores', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    projectId: (0, pg_core_1.uuid)('project_id')
        .notNull()
        .references(() => projects_1.projects.id, { onDelete: 'cascade' }),
    workspaceId: (0, pg_core_1.uuid)('workspace_id')
        .notNull()
        .references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    // Blended 0–100 health score.
    score: (0, pg_core_1.integer)('score').notNull(),
    // 'green' | 'yellow' | 'red' | 'empty'.
    band: (0, pg_core_1.text)('band').notNull(),
    // Per-signal 0–100 breakdown: { onTime, overdue, blockers, activity, sentiment }.
    components: (0, pg_core_1.jsonb)('components')
        .$type()
        .notNull()
        .default({ onTime: 0, overdue: 0, blockers: 0, activity: 0, sentiment: 0 }),
    // Comment-sentiment detail: { score, label, positive, negative, samples, source }.
    sentiment: (0, pg_core_1.jsonb)('sentiment')
        .$type()
        .notNull()
        .default({ score: 50, label: 'neutral', positive: 0, negative: 0, samples: 0, source: 'deterministic' }),
    // Calendar day (UTC) the score is for. UNIQUE with project_id → one row/day.
    scoredOn: (0, pg_core_1.date)('scored_on').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    (0, pg_core_1.uniqueIndex)('uq_project_health_scores_project_day').on(t.projectId, t.scoredOn),
    (0, pg_core_1.index)('idx_project_health_scores_ws_day').on(t.workspaceId, t.scoredOn),
]);
exports.projectHealthScoresRelations = (0, drizzle_orm_1.relations)(exports.projectHealthScores, ({ one }) => ({
    project: one(projects_1.projects, { fields: [exports.projectHealthScores.projectId], references: [projects_1.projects.id] }),
    workspace: one(workspaces_1.workspaces, { fields: [exports.projectHealthScores.workspaceId], references: [workspaces_1.workspaces.id] }),
}));
//# sourceMappingURL=project-health-scores.js.map
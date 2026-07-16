import { pgTable, uuid, integer, text, jsonb, timestamp, date, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { projects } from './projects'
import { workspaces } from './workspaces'

/**
 * §7.13 Project Health Scoring — one persisted row per active project per day.
 * The daily cron (ProjectHealthService) reuses the deterministic formula in
 * ReportsService.getProjectHealth and folds in a comment-sentiment component,
 * then upserts here keyed by (project_id, scored_on) so re-runs the same day are
 * idempotent. The trend endpoint reads these rows back for a 30-day sparkline.
 */
export const projectHealthScores = pgTable(
  'project_health_scores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    // Blended 0–100 health score.
    score: integer('score').notNull(),
    // 'green' | 'yellow' | 'red' | 'empty'.
    band: text('band').notNull(),
    // Per-signal 0–100 breakdown: { onTime, overdue, blockers, activity, sentiment }.
    components: jsonb('components')
      .$type<{ onTime: number; overdue: number; blockers: number; activity: number; sentiment: number }>()
      .notNull()
      .default({ onTime: 0, overdue: 0, blockers: 0, activity: 0, sentiment: 0 }),
    // Comment-sentiment detail: { score, label, positive, negative, samples, source }.
    sentiment: jsonb('sentiment')
      .$type<{
        score: number
        label: 'positive' | 'neutral' | 'negative'
        positive: number
        negative: number
        samples: number
        source: 'ai' | 'deterministic'
      }>()
      .notNull()
      .default({ score: 50, label: 'neutral', positive: 0, negative: 0, samples: 0, source: 'deterministic' }),
    // Calendar day (UTC) the score is for. UNIQUE with project_id → one row/day.
    scoredOn: date('scored_on').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_project_health_scores_project_day').on(t.projectId, t.scoredOn),
    index('idx_project_health_scores_ws_day').on(t.workspaceId, t.scoredOn),
  ],
)

export const projectHealthScoresRelations = relations(projectHealthScores, ({ one }) => ({
  project: one(projects, { fields: [projectHealthScores.projectId], references: [projects.id] }),
  workspace: one(workspaces, { fields: [projectHealthScores.workspaceId], references: [workspaces.id] }),
}))

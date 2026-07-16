import { pgTable, text, timestamp, uuid, integer, jsonb, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { users } from './users'

/**
 * Progress row for a server-side ClickUp CSV import (Plan §12.5). The import
 * runs asynchronously after the request returns; the client polls
 * `GET /workspaces/:id/import/clickup/jobs/:jobId` and reads `processed`/`total`
 * for a real progress bar plus the live created/updated/skipped counters. The
 * final enriched summary (custom fields, per-entity totals, what is NOT
 * imported) is stored in `result` once `status = 'completed'`.
 */
export const clickupImportJobs = pgTable(
  'clickup_import_jobs',
  {
    id:            uuid('id').primaryKey().defaultRandom(),
    workspaceId:   uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    // 'pending' | 'processing' | 'completed' | 'failed'
    status:        text('status').notNull().default('pending'),
    total:         integer('total').notNull().default(0),
    processed:     integer('processed').notNull().default(0),
    createdCount:  integer('created_count').notNull().default(0),
    updatedCount:  integer('updated_count').notNull().default(0),
    skippedCount:  integer('skipped_count').notNull().default(0),
    error:         text('error'),
    // Full ImportSummary once finished (per-entity totals, custom-field counts,
    // conflict tallies, notImported note).
    result:        jsonb('result').$type<Record<string, unknown>>(),
    createdById:   uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:     timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byWorkspace: index('clickup_import_jobs_workspace_idx').on(t.workspaceId),
  }),
)

export const clickupImportJobsRelations = relations(clickupImportJobs, ({ one }) => ({
  workspace: one(workspaces, { fields: [clickupImportJobs.workspaceId], references: [workspaces.id] }),
  creator:   one(users, { fields: [clickupImportJobs.createdById], references: [users.id] }),
}))

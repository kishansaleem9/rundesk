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
    /*
     * §V2-S13 frame `12:08` — which importer produced this job.
     *
     * 'clickup_csv' (the original path) | 'spreadsheet' (the generic delimited
     * importer behind the frame's "Spreadsheet files" row and the per-source
     * presets). NOT decoration: `listJobs` filters on this column, so the
     * import page's history shows one importer's runs and not the other's.
     */
    source:        text('source').notNull().default('clickup_csv'),
    /** Which column preset was used — 'trello', 'jira', … or 'generic'. */
    sourcePreset:  text('source_preset'),
    // 'pending' (Import Queued) | 'processing' (Import Pending) | 'completed'
    // | 'failed' | 'cancelled' | 'deleted' — the last two from 0175.
    status:        text('status').notNull().default('pending'),
    total:         integer('total').notNull().default(0),
    processed:     integer('processed').notNull().default(0),
    createdCount:  integer('created_count').notNull().default(0),
    updatedCount:  integer('updated_count').notNull().default(0),
    skippedCount:  integer('skipped_count').notNull().default(0),
    /**
     * Rows the importer REFUSED — no name, an unparseable date, a misquoted
     * row. Separate from `skipped_count`, which is a duplicate the person chose
     * to skip. A rejected row is never written, and `rowErrors` says which line
     * it was and why, so "imported 9 of 10" is answerable rather than alarming.
     */
    rejectedCount: integer('rejected_count').notNull().default(0),
    rowErrors:     jsonb('row_errors').$type<
      Array<{ row: number; code: string; message: string; column?: string; value?: string }>
    >(),
    error:         text('error'),
    // Full ImportSummary once finished (per-entity totals, custom-field counts,
    // conflict tallies, notImported note).
    result:        jsonb('result').$type<Record<string, unknown>>(),
    /*
     * 0175 — the Imports / Exports engine. A run writes `phase` and `cursor`
     * after every batch and `heartbeat_at` with them, so a run a restart cut
     * off is resumed from its last batch by the recovery sweep. Cancel sets
     * `cancel_requested_at`; the runner stops between batches, never mid-write.
     */
    phase:              text('phase'),
    cursor:             jsonb('cursor').$type<Record<string, unknown>>(),
    heartbeatAt:        timestamp('heartbeat_at', { withTimezone: true }),
    cancelRequestedAt:  timestamp('cancel_requested_at', { withTimezone: true }),
    /** What the person chose: destination, date format, delimiter, value maps. */
    options:            jsonb('options').$type<Record<string, unknown>>(),
    /** Incoming header → RUNDESK field, and the grid's columns. */
    mapping:            jsonb('mapping').$type<Record<string, unknown>>(),
    fileName:           text('file_name'),
    startedAt:          timestamp('started_at', { withTimezone: true }),
    finishedAt:         timestamp('finished_at', { withTimezone: true }),
    deletedAt:          timestamp('deleted_at', { withTimezone: true }),
    /** "You can delete any imports created in the last 10 days." */
    deletableUntil:     timestamp('deletable_until', { withTimezone: true }),
    /** The short id "Copy ID" copies and support asks for. */
    supportReference:   text('support_reference'),
    itemsImportedCount: integer('items_imported_count').notNull().default(0),
    createdById:   uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:     timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byWorkspace: index('clickup_import_jobs_workspace_idx').on(t.workspaceId),
    // The index behind `listJobs(workspaceId, { source })`.
    bySource: index('clickup_import_jobs_source_idx').on(t.workspaceId, t.source),
    // Made by 0175: the recovery sweep's query (runs that stopped saying they are alive).
    byStatus: index('clickup_import_jobs_status_idx').on(t.status, t.heartbeatAt),
  }),
)

export const clickupImportJobsRelations = relations(clickupImportJobs, ({ one }) => ({
  workspace: one(workspaces, { fields: [clickupImportJobs.workspaceId], references: [workspaces.id] }),
  creator:   one(users, { fields: [clickupImportJobs.createdById], references: [users.id] }),
}))

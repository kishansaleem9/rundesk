"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clickupImportJobsRelations = exports.clickupImportJobs = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const workspaces_1 = require("./workspaces");
const users_1 = require("./users");
/**
 * Progress row for a server-side ClickUp CSV import (Plan §12.5). The import
 * runs asynchronously after the request returns; the client polls
 * `GET /workspaces/:id/import/clickup/jobs/:jobId` and reads `processed`/`total`
 * for a real progress bar plus the live created/updated/skipped counters. The
 * final enriched summary (custom fields, per-entity totals, what is NOT
 * imported) is stored in `result` once `status = 'completed'`.
 */
exports.clickupImportJobs = (0, pg_core_1.pgTable)('clickup_import_jobs', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    /*
     * §V2-S13 frame `12:08` — which importer produced this job.
     *
     * 'clickup_csv' (the original path) | 'spreadsheet' (the generic delimited
     * importer behind the frame's "Spreadsheet files" row and the per-source
     * presets). NOT decoration: `listJobs` filters on this column, so the
     * import page's history shows one importer's runs and not the other's.
     */
    source: (0, pg_core_1.text)('source').notNull().default('clickup_csv'),
    /** Which column preset was used — 'trello', 'jira', … or 'generic'. */
    sourcePreset: (0, pg_core_1.text)('source_preset'),
    // 'pending' | 'processing' | 'completed' | 'failed'
    status: (0, pg_core_1.text)('status').notNull().default('pending'),
    total: (0, pg_core_1.integer)('total').notNull().default(0),
    processed: (0, pg_core_1.integer)('processed').notNull().default(0),
    createdCount: (0, pg_core_1.integer)('created_count').notNull().default(0),
    updatedCount: (0, pg_core_1.integer)('updated_count').notNull().default(0),
    skippedCount: (0, pg_core_1.integer)('skipped_count').notNull().default(0),
    /**
     * Rows the importer REFUSED — no name, an unparseable date, a misquoted
     * row. Separate from `skipped_count`, which is a duplicate the person chose
     * to skip. A rejected row is never written, and `rowErrors` says which line
     * it was and why, so "imported 9 of 10" is answerable rather than alarming.
     */
    rejectedCount: (0, pg_core_1.integer)('rejected_count').notNull().default(0),
    rowErrors: (0, pg_core_1.jsonb)('row_errors').$type(),
    error: (0, pg_core_1.text)('error'),
    // Full ImportSummary once finished (per-entity totals, custom-field counts,
    // conflict tallies, notImported note).
    result: (0, pg_core_1.jsonb)('result').$type(),
    createdById: (0, pg_core_1.uuid)('created_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    byWorkspace: (0, pg_core_1.index)('clickup_import_jobs_workspace_idx').on(t.workspaceId),
    // The index behind `listJobs(workspaceId, { source })`.
    bySource: (0, pg_core_1.index)('clickup_import_jobs_source_idx').on(t.workspaceId, t.source),
}));
exports.clickupImportJobsRelations = (0, drizzle_orm_1.relations)(exports.clickupImportJobs, ({ one }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.clickupImportJobs.workspaceId], references: [workspaces_1.workspaces.id] }),
    creator: one(users_1.users, { fields: [exports.clickupImportJobs.createdById], references: [users_1.users.id] }),
}));
//# sourceMappingURL=clickup-import-jobs.js.map
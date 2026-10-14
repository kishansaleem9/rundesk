import { pgTable, text, timestamp, uuid, integer, jsonb, index, uniqueIndex, check } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { users } from './users'
import { clickupImportJobs } from './clickup-import-jobs'

/**
 * 0175 — the Imports / Exports engine's own tables. The job row itself is
 * `clickup_import_jobs` (one job table for every importer; see that file).
 */

/**
 * EVERY ROW AN IMPORT MADE, BY ID — what Delete moves to Trash and what the
 * report's Items tab lists. Skipped and failed rows are recorded too, with no
 * entity, so the report can say why a row is missing.
 */
export const importJobItems = pgTable(
  'import_job_items',
  {
    id:         uuid('id').primaryKey().defaultRandom(),
    jobId:      uuid('job_id').notNull().references(() => clickupImportJobs.id, { onDelete: 'cascade' }),
    // 'space' | 'folder' | 'project' | 'list' | 'task' | 'subtask' | 'custom_field'
    // | 'tag' | 'status' | 'task_type' | 'checklist' | 'time_entry' | 'user' | …
    entityType: text('entity_type').notNull(),
    entityId:   uuid('entity_id'),
    /** The file row ("row 7") or the source's own reference. */
    sourceRef:  text('source_ref'),
    action:     text('action').$type<'created' | 'updated' | 'skipped' | 'failed'>().notNull(),
    message:    text('message'),
    createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('import_job_items_job_type_idx').on(t.jobId, t.entityType),
    index('import_job_items_entity_idx').on(t.entityType, t.entityId),
    check('import_job_items_action_check', sql`${t.action} IN ('created', 'updated', 'skipped', 'failed')`),
  ],
)

/** The report's Errors tab and `errors.csv`: every refused row and every dropped cell. */
export const importErrors = pgTable(
  'import_errors',
  {
    id:        uuid('id').primaryKey().defaultRandom(),
    jobId:     uuid('job_id').notNull().references(() => clickupImportJobs.id, { onDelete: 'cascade' }),
    rowRef:    text('row_ref'),
    field:     text('field'),
    message:   text('message').notNull(),
    severity:  text('severity').$type<'error' | 'warning'>().notNull().default('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('import_errors_job_idx').on(t.jobId),
    check('import_errors_severity_check', sql`${t.severity} IN ('error', 'warning')`),
  ],
)

/** §2.4 historical mapping: the field a workspace chose for a header, offered first next time. */
export const importMappingMemory = pgTable(
  'import_mapping_memory',
  {
    id:               uuid('id').primaryKey().defaultRandom(),
    workspaceId:      uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    source:           text('source').notNull().default('spreadsheet'),
    normalisedHeader: text('normalised_header').notNull(),
    targetFieldKey:   text('target_field_key').notNull(),
    lastUsedAt:       timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('import_mapping_memory_header_key').on(t.workspaceId, t.source, t.normalisedHeader)],
)

/**
 * The reviewed rows, uploaded in chunks before Start: a 10,000-row sheet is
 * larger than one request may be. Kept 30 days for "Download file", then purged.
 */
export const importStagedRows = pgTable(
  'import_staged_rows',
  {
    id:         uuid('id').primaryKey().defaultRandom(),
    jobId:      uuid('job_id').notNull().references(() => clickupImportJobs.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    rows:       jsonb('rows').$type<Array<{ key: string; line?: number; values: Record<string, string> }>>().notNull(),
    createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('import_staged_rows_chunk_key').on(t.jobId, t.chunkIndex)],
)

/**
 * §5.1 exports, as jobs: a large workspace's CSV is built off the request,
 * stored, and handed out by a link that expires an hour after it is made.
 */
export const exportJobs = pgTable(
  'export_jobs',
  {
    id:                uuid('id').primaryKey().defaultRandom(),
    workspaceId:       uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    // 'workspace_csv' now; 'clickup_csv' | 'rundesk_archive' | view and doc exports in later phases.
    type:              text('type').notNull(),
    /** `{ locationIds: [...] }` — the Spaces, Folders, Projects and Lists ticked. */
    scope:             jsonb('scope').$type<Record<string, unknown>>(),
    options:           jsonb('options').$type<Record<string, unknown>>(),
    status:            text('status').$type<'pending' | 'processing' | 'completed' | 'failed'>().notNull().default('pending'),
    storageKey:        text('storage_key'),
    fileName:          text('file_name'),
    sizeBytes:         integer('size_bytes'),
    rowCount:          integer('row_count'),
    error:             text('error'),
    downloadExpiresAt: timestamp('download_expires_at', { withTimezone: true }),
    supportReference:  text('support_reference'),
    createdById:       uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt:         timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:         timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt:        timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    index('export_jobs_workspace_idx').on(t.workspaceId, t.createdAt),
    check('export_jobs_status_check', sql`${t.status} IN ('pending', 'processing', 'completed', 'failed')`),
  ],
)

export const importJobItemsRelations = relations(importJobItems, ({ one }) => ({
  job: one(clickupImportJobs, { fields: [importJobItems.jobId], references: [clickupImportJobs.id] }),
}))

export const exportJobsRelations = relations(exportJobs, ({ one }) => ({
  workspace: one(workspaces, { fields: [exportJobs.workspaceId], references: [workspaces.id] }),
  creator:   one(users, { fields: [exportJobs.createdById], references: [users.id] }),
}))

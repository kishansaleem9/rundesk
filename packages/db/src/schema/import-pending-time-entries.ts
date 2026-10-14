import { pgTable, uuid, text, timestamp, integer, boolean, index } from 'drizzle-orm/pg-core'
import { workspaces } from './workspaces'
import { tasks } from './tasks'
import { clickupImportJobs } from './clickup-import-jobs'

/**
 * TIME TRACKED BY SOMEBODY INVITED, WAITING FOR THEM (`found-14-oct/clickup-docs-time-goals-unimported`).
 *
 * An import that brings a ClickUp Workspace over brings the time its people
 * tracked on its tasks, each entry under whoever tracked it. An entry of
 * somebody the run invited cannot be theirs yet — a time entry is a member's —
 * so it is held here, by the address the invitation went to, and made theirs
 * when they accept it (`InvitationsService.claim`), on a task they may then
 * work on, as their held assignments are (`import_pending_assignees`). A task
 * deleted meanwhile takes its rows with it.
 */
export const importPendingTimeEntries = pgTable(
  'import_pending_time_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    /** Lower case, as the invitation keeps it. */
    email: text('email').notNull(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id').references(() => clickupImportJobs.id, { onDelete: 'set null' }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    durationSec: integer('duration_sec').notNull(),
    description: text('description'),
    isBillable: boolean('is_billable').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byEmail: index('idx_import_pending_time_entries_email').on(t.workspaceId, t.email),
  }),
)

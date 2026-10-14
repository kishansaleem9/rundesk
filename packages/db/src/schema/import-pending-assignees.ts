import { pgTable, uuid, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { workspaces } from './workspaces'
import { tasks } from './tasks'
import { clickupImportJobs } from './clickup-import-jobs'

/**
 * A TASK WAITING FOR SOMEBODY INVITED TO TAKE IT (`found-14-oct/clickup-workspace-import-and-people-unbuilt`).
 *
 * An import that brings a team over invites the people the tool names who are
 * not members here. Their tasks cannot be theirs yet — an assignee is a member —
 * so each assignment is held here, by the address the invitation went to, and
 * made when they accept it (`InvitationsService.claim`), if the assignee route
 * would put them on that task then. A task deleted meanwhile takes its rows
 * with it; the run that held them does not.
 */
export const importPendingAssignees = pgTable(
  'import_pending_assignees',
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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    once: uniqueIndex('uq_import_pending_assignees').on(t.workspaceId, t.email, t.taskId),
  }),
)

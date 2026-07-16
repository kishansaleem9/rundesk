import { pgTable, timestamp, uuid, text, jsonb, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tasks } from './tasks'
import { workspaces } from './workspaces'
import { users } from './users'

/**
 * Links a task to an external service artifact (Plan §12.8 GitHub/GitLab,
 * §12.2 Google Drive). A link is created by pasting a URL: the server parses it
 * to detect the `provider` + `kind` and stores structured refs in `metadata`.
 *
 * - `provider`: 'github' | 'gitlab' | 'google_drive' | 'link' (generic fallback)
 * - `kind`:     'commit' | 'pull_request' | 'issue' | 'file' | 'link'
 * - `status`:   provider-reported state for PRs/MRs/issues (open/merged/closed),
 *               null until a live provider fetch runs (env-gated behind an
 *               `integration-connections` OAuth connection — see the service).
 *
 * Workspace-scoped so links can be enumerated/cleaned per workspace; the task
 * FK cascades on delete.
 */
export const taskExternalLinks = pgTable(
  'task_external_links',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    taskId:      uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    provider:    text('provider').notNull(),
    kind:        text('kind').notNull(),
    url:         text('url').notNull(),
    externalId:  text('external_id'),
    title:       text('title'),
    status:      text('status'),
    metadata:    jsonb('metadata').$type<Record<string, unknown>>(),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTask:      index('task_external_links_task_idx').on(t.taskId),
    byWorkspace: index('task_external_links_workspace_idx').on(t.workspaceId),
  }),
)

export const taskExternalLinksRelations = relations(taskExternalLinks, ({ one }) => ({
  task:      one(tasks,      { fields: [taskExternalLinks.taskId],      references: [tasks.id] }),
  workspace: one(workspaces, { fields: [taskExternalLinks.workspaceId], references: [workspaces.id] }),
  createdBy: one(users,      { fields: [taskExternalLinks.createdById], references: [users.id] }),
}))

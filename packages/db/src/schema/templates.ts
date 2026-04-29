import { pgTable, text, timestamp, boolean, uuid, jsonb } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { users } from './users'

/**
 * Project templates — a reusable scaffold of (project + lists + task stubs)
 * that an admin can save once and re-apply when starting new work.
 *
 * The full structure is denormalized into `payload` so that template
 * application is a pure read of a single row plus a tx of inserts —
 * no risk of drift from later edits to the original project.
 */
export const projectTemplates = pgTable('project_templates', {
  id:           uuid('id').primaryKey().defaultRandom(),
  workspaceId:  uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  // Templates with workspaceId = null are platform-wide built-ins.
  name:         text('name').notNull(),
  description:  text('description'),
  icon:         text('icon'),
  // { lists: [{ name, position, tasks: [{ title, description, priority, status }] }] }
  payload:      jsonb('payload')
                  .$type<{
                    lists: Array<{
                      name: string
                      position?: number
                      tasks: Array<{
                        title: string
                        description?: string | null
                        priority?: 'urgent' | 'high' | 'normal' | 'low'
                        status?: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled'
                      }>
                    }>
                  }>()
                  .notNull(),
  isBuiltIn:    boolean('is_built_in').notNull().default(false),
  createdById:  uuid('created_by_id').references(() => users.id),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const projectTemplatesRelations = relations(projectTemplates, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [projectTemplates.workspaceId],
    references: [workspaces.id],
  }),
  createdBy: one(users, {
    fields: [projectTemplates.createdById],
    references: [users.id],
  }),
}))

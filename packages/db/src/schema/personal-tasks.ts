import { pgTable, text, timestamp, uuid, boolean, integer, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './users'
import { workspaces } from './workspaces'

/**
 * A private per-user to-do list, scoped to a workspace. These are the user's
 * own personal cards (distinct from shared workspace tasks) shown under
 * Home → Personal List. Rows are keyed to the owning user, so they are only
 * ever visible to that user.
 */
export const personalTasks = pgTable('personal_tasks', {
  id:          uuid('id').primaryKey().defaultRandom(),
  userId:      uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  title:       text('title').notNull(),
  done:        boolean('done').notNull().default(false),
  position:    integer('position').notNull().default(0),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_personal_tasks_user_ws').on(t.userId, t.workspaceId),
])

export const personalTasksRelations = relations(personalTasks, ({ one }) => ({
  user:      one(users,      { fields: [personalTasks.userId],      references: [users.id] }),
  workspace: one(workspaces, { fields: [personalTasks.workspaceId], references: [workspaces.id] }),
}))

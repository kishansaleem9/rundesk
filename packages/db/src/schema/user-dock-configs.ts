import { pgTable, uuid, jsonb, timestamp } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './users'
import { workspaces } from './workspaces'

export const userDockConfigs = pgTable('user_dock_configs', {
  id:          uuid('id').primaryKey().defaultRandom(),
  userId:      uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  pinnedLinks: jsonb('pinned_links').notNull().default([]),
  appearance:  jsonb('appearance').notNull().default({
    size: 'md',
    opacity: 0.8,
    theme: 'system'
  }),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const userDockConfigsRelations = relations(userDockConfigs, ({ one }) => ({
  user:      one(users, { fields: [userDockConfigs.userId], references: [users.id] }),
  workspace: one(workspaces, { fields: [userDockConfigs.workspaceId], references: [workspaces.id] }),
}))

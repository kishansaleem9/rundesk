import { pgTable, text, timestamp, uuid, jsonb, boolean } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './users'
import { workspaces } from './workspaces'

export const dashboardPresets = pgTable('dashboard_presets', {
  id:          uuid('id').primaryKey().defaultRandom(),
  userId:      uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name:        text('name').notNull(),
  layout:      jsonb('layout').notNull().default([]),
  isDefault:   boolean('is_default').notNull().default(false),
  // §5.7 — a workspace-default dashboard set by an admin. Applies to any member
  // who has no personal default. At most one per workspace (enforced in service).
  isWorkspaceDefault: boolean('is_workspace_default').notNull().default(false),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const dashboardPresetsRelations = relations(dashboardPresets, ({ one }) => ({
  user:      one(users, { fields: [dashboardPresets.userId], references: [users.id] }),
  workspace: one(workspaces, { fields: [dashboardPresets.workspaceId], references: [workspaces.id] }),
}))

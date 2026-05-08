import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { users } from './users'

export const workspaceCanvases = pgTable('workspace_canvases', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // whiteboard | mindmap
  title: text('title').notNull(),
  data: jsonb('data').notNull().default({}),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const workspaceCanvasesRelations = relations(workspaceCanvases, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceCanvases.workspaceId],
    references: [workspaces.id],
  }),
  createdBy: one(users, {
    fields: [workspaceCanvases.createdById],
    references: [users.id],
  }),
}))

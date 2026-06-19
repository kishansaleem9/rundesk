import { pgTable, text, timestamp, uuid, jsonb, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { users } from './users'

/**
 * A saved custom report definition (metrics × dimension × filters + viz).
 * The definition is interpreted by ReportsService.runCustomReport at query time.
 */
export const customReports = pgTable(
  'custom_reports',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    name:        text('name').notNull(),
    definition:  jsonb('definition').$type<Record<string, unknown>>().notNull().default({}),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byWorkspace: index('idx_custom_reports_workspace').on(t.workspaceId),
  }),
)

export const customReportsRelations = relations(customReports, ({ one }) => ({
  workspace: one(workspaces, { fields: [customReports.workspaceId], references: [workspaces.id] }),
  createdBy: one(users, { fields: [customReports.createdById], references: [users.id] }),
}))

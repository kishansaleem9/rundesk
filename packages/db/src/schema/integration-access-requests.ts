import { pgTable, text, timestamp, uuid, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { users } from './users'

export const integrationAccessRequests = pgTable(
  'integration_access_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    requestedById: uuid('requested_by_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('pending'),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueWorkspaceProviderPending: uniqueIndex('integration_access_requests_workspace_provider_unique').on(
      table.workspaceId,
      table.provider,
    ),
  }),
)

export const integrationAccessRequestsRelations = relations(integrationAccessRequests, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [integrationAccessRequests.workspaceId],
    references: [workspaces.id],
  }),
  requestedBy: one(users, {
    fields: [integrationAccessRequests.requestedById],
    references: [users.id],
  }),
}))

import { pgTable, uuid, text, timestamp, unique, jsonb } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { users } from './users'

export const workspaceIntegrationConnections = pgTable(
  'workspace_integration_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    status: text('status').notNull().default('connected'),
    scopes: text('scopes').array().notNull().default([]),
    externalAccountId: text('external_account_id'),
    externalAccountEmail: text('external_account_email'),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    connectedById: uuid('connected_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueWorkspaceProvider: unique('uq_workspace_integration_workspace_provider').on(
      t.workspaceId,
      t.provider,
    ),
  }),
)

export const workspaceIntegrationConnectionsRelations = relations(
  workspaceIntegrationConnections,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [workspaceIntegrationConnections.workspaceId],
      references: [workspaces.id],
    }),
    connectedBy: one(users, {
      fields: [workspaceIntegrationConnections.connectedById],
      references: [users.id],
    }),
  }),
)

import { pgTable, uuid, text, timestamp, unique, jsonb } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { users } from './users'
import { sealedText } from './sealed-text'

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
    accessToken: sealedText('access_token', 'workspace_integration_connections.access_token'),
    refreshToken: sealedText('refresh_token', 'workspace_integration_connections.refresh_token'),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    /*
     * §V2-11, frame `18:39` — WHAT THE PROVIDER ACTUALLY SAID.
     *
     * The card in the frame reads, in full:
     *
     *   "We couldn't connect your Google account.
     *    Google gave us this error: OAuth authentication timed out. Please try
     *    again. If it keeps happening, try checking your permissions — that
     *    often does the trick."
     *
     * The load-bearing clause is "Google gave us this error: …". Rundesk could
     * say that something went wrong and nothing more: the only failure text
     * anywhere was `?reason=` on a redirect, which survives exactly one page
     * load and belongs to no particular integration. A person who came back
     * tomorrow to a tile that simply said "Expired" had no way to find out
     * whether the token lapsed, the scopes were pulled, or the provider was
     * down — three problems with three different answers.
     *
     * NULL is the normal state and means "nothing is wrong", which is why it
     * is nullable rather than defaulted to '': an empty string would render an
     * error card with no error in it.
     */
    lastError: text('last_error'),
    lastErrorAt: timestamp('last_error_at', { withTimezone: true }),
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

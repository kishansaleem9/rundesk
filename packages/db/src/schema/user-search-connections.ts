import { pgTable, uuid, text, timestamp, unique } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { users } from './users'
import { sealedText } from './sealed-text'

/**
 * ONE PERSON'S OWN CONNECTED SEARCH (`found-23-sep/connected-search-per-person`).
 *
 * ClickUp's Connected Search has two kinds of connection: a personal one, which
 * anybody but a guest makes for themselves and whose results — their private
 * files and mail too — only they see; and a Workspace one, which an owner or
 * admin makes and through which every member finds what the connected account
 * shares with the whole organization. Gmail is personal only. The Workspace
 * kind is `workspace_integration_connections`, one per provider; this is the
 * personal kind, one per person, workspace and provider.
 */
export const userSearchConnections = pgTable(
  'user_search_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** `google-drive`, `gmail` or `sharepoint`: a search source's provider. */
    provider: text('provider').notNull(),
    status: text('status').notNull().default('connected'),
    scopes: text('scopes').array().notNull().default([]),
    externalAccountEmail: text('external_account_email'),
    accessToken: sealedText('access_token', 'user_search_connections.access_token'),
    refreshToken: sealedText('refresh_token', 'user_search_connections.refresh_token'),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    onePerPersonAndProvider: unique('uq_user_search_connection').on(t.workspaceId, t.userId, t.provider),
  }),
)

export const userSearchConnectionsRelations = relations(userSearchConnections, ({ one }) => ({
  workspace: one(workspaces, { fields: [userSearchConnections.workspaceId], references: [workspaces.id] }),
  user: one(users, { fields: [userSearchConnections.userId], references: [users.id] }),
}))

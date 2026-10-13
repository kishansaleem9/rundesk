import { pgTable, uuid, text, timestamp, jsonb, uniqueIndex, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { users } from './users'
import { sealedText } from './sealed-text'

/** The tools a grant may be for: Basecamp's, and the six signed in to as ClickUp signs in to them. */
export const IMPORT_GRANT_PROVIDERS = ['basecamp', 'asana', 'jira', 'trello', 'todoist', 'wrike', 'monday'] as const

/**
 * A PERSON'S GRANT TO READ ANOTHER TOOL FOR AN IMPORT (`commit-log/log-601eacc-2`).
 *
 * ClickUp imports Basecamp by signing in to it: "in the pop-up, log in to your
 * Basecamp account" (help centre, "Import from Basecamp"). The grant that
 * sign-in gives is the importer's own — it reads what their Basecamp shows
 * them — so it is kept for them alone, one per provider in a workspace,
 * until they take it away; nobody else's import runs on it. `account` is what
 * the provider said about whose grant it is: the name, and the Basecamp
 * accounts it opens.
 */
export const importGrants = pgTable(
  'import_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    accessToken: sealedText('access_token', 'import_grants.access_token'),
    refreshToken: sealedText('refresh_token', 'import_grants.refresh_token'),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    account: jsonb('account').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Made by 0187. Declared here as well: a database built by
    // `drizzle-kit push` (the lanes, CI, a fresh deploy) reads only this file.
    owner: uniqueIndex('uq_import_grants_owner').on(t.workspaceId, t.userId, t.provider),
    // Asana, Jira, Trello, Todoist, Wrike and Monday added by 0192
    // (`found-13-oct/importers-by-sign-in-unbuilt`).
    provider: check('import_grants_provider_check', sql`${t.provider} IN ('basecamp', 'asana', 'jira', 'trello', 'todoist', 'wrike', 'monday')`),
  }),
)

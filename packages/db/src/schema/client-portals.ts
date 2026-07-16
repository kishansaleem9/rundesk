import { pgTable, text, timestamp, uuid, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { projects } from './projects'
import { clients } from './clients'
import { users } from './users'

/**
 * Client-facing project portals (Plan §14.7).
 *
 * A portal exposes exactly ONE project's client-safe view behind an
 * unguessable token, mirroring the public doc-share (`/d/:slug`) and public
 * form (`/submit/:slug`) patterns: no auth, token-scoped, minimal projection.
 *
 * The public read (`GET /portal/:token`) returns only client-appropriate task
 * fields (title, status label, due date, coarse progress) plus workspace
 * branding — never assignees, comments, internal notes, or any other project's
 * data. `is_enabled` gates access (disabled → 404), `show_completed` hides
 * closed tasks. `token` is a random ~24-char base64url string.
 */
export const clientPortals = pgTable(
  'client_portals',
  {
    id:            uuid('id').primaryKey().defaultRandom(),
    workspaceId:   uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId:     uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    // Optional link to the billable client this portal is branded for (§9).
    clientId:      uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
    token:         text('token').notNull(),
    // Optional display name for the portal; falls back to the project name.
    name:          text('name'),
    isEnabled:     boolean('is_enabled').notNull().default(true),
    showCompleted: boolean('show_completed').notNull().default(true),
    createdById:   uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastViewedAt:  timestamp('last_viewed_at', { withTimezone: true }),
  },
  (t) => ({
    tokenUnique:  uniqueIndex('client_portals_token_unique').on(t.token),
    projectIdx:   index('client_portals_project_idx').on(t.projectId),
    workspaceIdx: index('client_portals_workspace_idx').on(t.workspaceId),
  }),
)

export const clientPortalsRelations = relations(clientPortals, ({ one }) => ({
  workspace: one(workspaces, { fields: [clientPortals.workspaceId], references: [workspaces.id] }),
  project:   one(projects, { fields: [clientPortals.projectId], references: [projects.id] }),
  client:    one(clients, { fields: [clientPortals.clientId], references: [clients.id] }),
  creator:   one(users, { fields: [clientPortals.createdById], references: [users.id] }),
}))

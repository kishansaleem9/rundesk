import { pgTable, text, timestamp, uuid, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { users } from './users'

// A client a workspace bills projects to (Plan §9 time reporting). Projects
// reference a client via projects.client_id (declared as a plain column there +
// FK in the migration, to avoid a projects<->clients import cycle).
export const clients = pgTable(
  'clients',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    name:        text('name').notNull(),
    contactEmail: text('contact_email'),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqName: uniqueIndex('clients_workspace_name_unique').on(t.workspaceId, t.name),
  }),
)

export const clientsRelations = relations(clients, ({ one }) => ({
  workspace: one(workspaces, { fields: [clients.workspaceId], references: [workspaces.id] }),
  creator:   one(users, { fields: [clients.createdById], references: [users.id] }),
}))

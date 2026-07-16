import { pgTable, text, timestamp, uuid, unique } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { organizations } from './workspaces'

/**
 * §14.2 — optional dedicated-database tier for enterprise. Maps an organization
 * to its own Postgres connection string. When a row exists and is `active`, the
 * connection resolver (TenantDatabaseService.getDbForOrganization) routes that
 * org's queries to the dedicated database; otherwise everything stays on the
 * shared cluster. This is the registry + routing foundation — provisioning the
 * physical database is an ops step, and the connection string is a secret held
 * only server-side.
 */
export const tenantDatabases = pgTable(
  'tenant_databases',
  {
    id:             uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    // Dedicated Postgres DSN. Sensitive — never returned to clients (the API
    // exposes only status + a masked host).
    connectionUrl:  text('connection_url').notNull(),
    // pending | active | disabled
    status:         text('status').notNull().default('pending'),
    label:          text('label'),
    lastCheckedAt:  timestamp('last_checked_at', { withTimezone: true }),
    createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueOrg: unique('uq_tenant_databases_organization').on(t.organizationId),
  }),
)

export const tenantDatabasesRelations = relations(tenantDatabases, ({ one }) => ({
  organization: one(organizations, { fields: [tenantDatabases.organizationId], references: [organizations.id] }),
}))

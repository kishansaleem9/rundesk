"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tenantDatabasesRelations = exports.tenantDatabases = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const workspaces_1 = require("./workspaces");
/**
 * §14.2 — optional dedicated-database tier for enterprise. Maps an organization
 * to its own Postgres connection string. When a row exists and is `active`, the
 * connection resolver (TenantDatabaseService.getDbForOrganization) routes that
 * org's queries to the dedicated database; otherwise everything stays on the
 * shared cluster. This is the registry + routing foundation — provisioning the
 * physical database is an ops step, and the connection string is a secret held
 * only server-side.
 */
exports.tenantDatabases = (0, pg_core_1.pgTable)('tenant_databases', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    organizationId: (0, pg_core_1.uuid)('organization_id').notNull().references(() => workspaces_1.organizations.id, { onDelete: 'cascade' }),
    // Dedicated Postgres DSN. Sensitive — never returned to clients (the API
    // exposes only status + a masked host).
    connectionUrl: (0, pg_core_1.text)('connection_url').notNull(),
    // pending | active | disabled
    status: (0, pg_core_1.text)('status').notNull().default('pending'),
    label: (0, pg_core_1.text)('label'),
    lastCheckedAt: (0, pg_core_1.timestamp)('last_checked_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    uniqueOrg: (0, pg_core_1.unique)('uq_tenant_databases_organization').on(t.organizationId),
}));
exports.tenantDatabasesRelations = (0, drizzle_orm_1.relations)(exports.tenantDatabases, ({ one }) => ({
    organization: one(workspaces_1.organizations, { fields: [exports.tenantDatabases.organizationId], references: [workspaces_1.organizations.id] }),
}));
//# sourceMappingURL=tenant-databases.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clientsRelations = exports.clients = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const workspaces_1 = require("./workspaces");
const users_1 = require("./users");
// A client a workspace bills projects to (Plan §9 time reporting). Projects
// reference a client via projects.client_id (declared as a plain column there +
// FK in the migration, to avoid a projects<->clients import cycle).
exports.clients = (0, pg_core_1.pgTable)('clients', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    name: (0, pg_core_1.text)('name').notNull(),
    contactEmail: (0, pg_core_1.text)('contact_email'),
    createdById: (0, pg_core_1.uuid)('created_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    uniqName: (0, pg_core_1.uniqueIndex)('clients_workspace_name_unique').on(t.workspaceId, t.name),
}));
exports.clientsRelations = (0, drizzle_orm_1.relations)(exports.clients, ({ one }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.clients.workspaceId], references: [workspaces_1.workspaces.id] }),
    creator: one(users_1.users, { fields: [exports.clients.createdById], references: [users_1.users.id] }),
}));
//# sourceMappingURL=clients.js.map
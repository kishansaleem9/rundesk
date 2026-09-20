"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.integrationAccessRequestsRelations = exports.integrationAccessRequests = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const workspaces_1 = require("./workspaces");
const users_1 = require("./users");
exports.integrationAccessRequests = (0, pg_core_1.pgTable)('integration_access_requests', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id')
        .notNull()
        .references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    provider: (0, pg_core_1.text)('provider').notNull(),
    requestedById: (0, pg_core_1.uuid)('requested_by_id')
        .notNull()
        .references(() => users_1.users.id, { onDelete: 'cascade' }),
    status: (0, pg_core_1.text)('status').notNull().default('pending'),
    note: (0, pg_core_1.text)('note'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
    uniqueWorkspaceProviderPending: (0, pg_core_1.uniqueIndex)('integration_access_requests_workspace_provider_unique').on(table.workspaceId, table.provider),
}));
exports.integrationAccessRequestsRelations = (0, drizzle_orm_1.relations)(exports.integrationAccessRequests, ({ one }) => ({
    workspace: one(workspaces_1.workspaces, {
        fields: [exports.integrationAccessRequests.workspaceId],
        references: [workspaces_1.workspaces.id],
    }),
    requestedBy: one(users_1.users, {
        fields: [exports.integrationAccessRequests.requestedById],
        references: [users_1.users.id],
    }),
}));
//# sourceMappingURL=integration-access-requests.js.map
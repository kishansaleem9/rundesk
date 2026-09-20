"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.workspaceIntegrationConnectionsRelations = exports.workspaceIntegrationConnections = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const workspaces_1 = require("./workspaces");
const users_1 = require("./users");
exports.workspaceIntegrationConnections = (0, pg_core_1.pgTable)('workspace_integration_connections', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id')
        .notNull()
        .references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    provider: (0, pg_core_1.text)('provider').notNull(),
    status: (0, pg_core_1.text)('status').notNull().default('connected'),
    scopes: (0, pg_core_1.text)('scopes').array().notNull().default([]),
    externalAccountId: (0, pg_core_1.text)('external_account_id'),
    externalAccountEmail: (0, pg_core_1.text)('external_account_email'),
    accessToken: (0, pg_core_1.text)('access_token'),
    refreshToken: (0, pg_core_1.text)('refresh_token'),
    tokenExpiresAt: (0, pg_core_1.timestamp)('token_expires_at', { withTimezone: true }),
    metadata: (0, pg_core_1.jsonb)('metadata').$type().notNull().default({}),
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
    lastError: (0, pg_core_1.text)('last_error'),
    lastErrorAt: (0, pg_core_1.timestamp)('last_error_at', { withTimezone: true }),
    connectedById: (0, pg_core_1.uuid)('connected_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    uniqueWorkspaceProvider: (0, pg_core_1.unique)('uq_workspace_integration_workspace_provider').on(t.workspaceId, t.provider),
}));
exports.workspaceIntegrationConnectionsRelations = (0, drizzle_orm_1.relations)(exports.workspaceIntegrationConnections, ({ one }) => ({
    workspace: one(workspaces_1.workspaces, {
        fields: [exports.workspaceIntegrationConnections.workspaceId],
        references: [workspaces_1.workspaces.id],
    }),
    connectedBy: one(users_1.users, {
        fields: [exports.workspaceIntegrationConnections.connectedById],
        references: [users_1.users.id],
    }),
}));
//# sourceMappingURL=integration-connections.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clientPortalsRelations = exports.clientPortals = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const workspaces_1 = require("./workspaces");
const projects_1 = require("./projects");
const clients_1 = require("./clients");
const users_1 = require("./users");
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
exports.clientPortals = (0, pg_core_1.pgTable)('client_portals', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    projectId: (0, pg_core_1.uuid)('project_id').notNull().references(() => projects_1.projects.id, { onDelete: 'cascade' }),
    // Optional link to the billable client this portal is branded for (§9).
    clientId: (0, pg_core_1.uuid)('client_id').references(() => clients_1.clients.id, { onDelete: 'set null' }),
    token: (0, pg_core_1.text)('token').notNull(),
    // Optional display name for the portal; falls back to the project name.
    name: (0, pg_core_1.text)('name'),
    isEnabled: (0, pg_core_1.boolean)('is_enabled').notNull().default(true),
    showCompleted: (0, pg_core_1.boolean)('show_completed').notNull().default(true),
    createdById: (0, pg_core_1.uuid)('created_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastViewedAt: (0, pg_core_1.timestamp)('last_viewed_at', { withTimezone: true }),
}, (t) => ({
    tokenUnique: (0, pg_core_1.uniqueIndex)('client_portals_token_unique').on(t.token),
    projectIdx: (0, pg_core_1.index)('client_portals_project_idx').on(t.projectId),
    workspaceIdx: (0, pg_core_1.index)('client_portals_workspace_idx').on(t.workspaceId),
}));
exports.clientPortalsRelations = (0, drizzle_orm_1.relations)(exports.clientPortals, ({ one }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.clientPortals.workspaceId], references: [workspaces_1.workspaces.id] }),
    project: one(projects_1.projects, { fields: [exports.clientPortals.projectId], references: [projects_1.projects.id] }),
    client: one(clients_1.clients, { fields: [exports.clientPortals.clientId], references: [clients_1.clients.id] }),
    creator: one(users_1.users, { fields: [exports.clientPortals.createdById], references: [users_1.users.id] }),
}));
//# sourceMappingURL=client-portals.js.map
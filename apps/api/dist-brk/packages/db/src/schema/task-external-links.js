"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskExternalLinksRelations = exports.taskExternalLinks = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const tasks_1 = require("./tasks");
const workspaces_1 = require("./workspaces");
const users_1 = require("./users");
/**
 * Links a task to an external service artifact (Plan §12.8 GitHub/GitLab,
 * §12.2 Google Drive). A link is created by pasting a URL: the server parses it
 * to detect the `provider` + `kind` and stores structured refs in `metadata`.
 *
 * - `provider`: 'github' | 'gitlab' | 'google_drive' | 'link' (generic fallback)
 * - `kind`:     'commit' | 'pull_request' | 'issue' | 'file' | 'link'
 * - `status`:   provider-reported state for PRs/MRs/issues (open/merged/closed),
 *               null until a live provider fetch runs (env-gated behind an
 *               `integration-connections` OAuth connection — see the service).
 *
 * Workspace-scoped so links can be enumerated/cleaned per workspace; the task
 * FK cascades on delete.
 */
exports.taskExternalLinks = (0, pg_core_1.pgTable)('task_external_links', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    taskId: (0, pg_core_1.uuid)('task_id').notNull().references(() => tasks_1.tasks.id, { onDelete: 'cascade' }),
    // §12.6 — when set, the link was attached to a specific comment (e.g. a
    // Dropbox file shared in a comment). Still belongs to the task. Plain column;
    // FK to task_comments (ON DELETE SET NULL) is added in the migration.
    commentId: (0, pg_core_1.uuid)('comment_id'),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    provider: (0, pg_core_1.text)('provider').notNull(),
    kind: (0, pg_core_1.text)('kind').notNull(),
    url: (0, pg_core_1.text)('url').notNull(),
    externalId: (0, pg_core_1.text)('external_id'),
    title: (0, pg_core_1.text)('title'),
    status: (0, pg_core_1.text)('status'),
    metadata: (0, pg_core_1.jsonb)('metadata').$type(),
    createdById: (0, pg_core_1.uuid)('created_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    byTask: (0, pg_core_1.index)('task_external_links_task_idx').on(t.taskId),
    byWorkspace: (0, pg_core_1.index)('task_external_links_workspace_idx').on(t.workspaceId),
}));
exports.taskExternalLinksRelations = (0, drizzle_orm_1.relations)(exports.taskExternalLinks, ({ one }) => ({
    task: one(tasks_1.tasks, { fields: [exports.taskExternalLinks.taskId], references: [tasks_1.tasks.id] }),
    workspace: one(workspaces_1.workspaces, { fields: [exports.taskExternalLinks.workspaceId], references: [workspaces_1.workspaces.id] }),
    createdBy: one(users_1.users, { fields: [exports.taskExternalLinks.createdById], references: [users_1.users.id] }),
}));
//# sourceMappingURL=task-external-links.js.map
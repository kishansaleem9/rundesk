"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.docTemplatesRelations = exports.docTemplates = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const workspaces_1 = require("./workspaces");
const users_1 = require("./users");
/**
 * Reusable doc templates (meeting notes, PRDs, etc.). A snapshot of a doc's
 * Tiptap content that a new doc can be spun up from. Workspace-scoped; the
 * content is denormalized so applying a template never drifts with later edits
 * to the doc it was saved from.
 */
exports.docTemplates = (0, pg_core_1.pgTable)('doc_templates', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    name: (0, pg_core_1.text)('name').notNull(),
    description: (0, pg_core_1.text)('description'),
    icon: (0, pg_core_1.text)('icon'),
    content: (0, pg_core_1.jsonb)('content').$type().notNull().default({ type: 'doc', content: [] }),
    plaintext: (0, pg_core_1.text)('plaintext').notNull().default(''),
    createdById: (0, pg_core_1.uuid)('created_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    byWorkspace: (0, pg_core_1.index)('doc_templates_workspace_idx').on(t.workspaceId),
}));
exports.docTemplatesRelations = (0, drizzle_orm_1.relations)(exports.docTemplates, ({ one }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.docTemplates.workspaceId], references: [workspaces_1.workspaces.id] }),
    creator: one(users_1.users, { fields: [exports.docTemplates.createdById], references: [users_1.users.id] }),
}));
//# sourceMappingURL=doc-templates.js.map
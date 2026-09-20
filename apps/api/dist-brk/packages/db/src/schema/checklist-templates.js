"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checklistTemplateItemsRelations = exports.checklistTemplatesRelations = exports.checklistTemplateItems = exports.checklistTemplates = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const workspaces_1 = require("./workspaces");
const users_1 = require("./users");
/**
 * Reusable checklists ("QA pass", "Client onboarding") that can be dropped onto
 * any task. Workspace-scoped, and the items are a snapshot: applying a template
 * copies rows, so editing the template later never rewrites checklists already
 * created from it — same contract as doc templates.
 */
exports.checklistTemplates = (0, pg_core_1.pgTable)('checklist_templates', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    name: (0, pg_core_1.text)('name').notNull(),
    createdById: (0, pg_core_1.uuid)('created_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    byWorkspace: (0, pg_core_1.index)('checklist_templates_workspace_idx').on(t.workspaceId),
}));
exports.checklistTemplateItems = (0, pg_core_1.pgTable)('checklist_template_items', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    templateId: (0, pg_core_1.uuid)('template_id').notNull().references(() => exports.checklistTemplates.id, { onDelete: 'cascade' }),
    content: (0, pg_core_1.text)('content').notNull(),
    position: (0, pg_core_1.integer)('position').notNull().default(0),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    byTemplate: (0, pg_core_1.index)('checklist_template_items_template_idx').on(t.templateId),
}));
exports.checklistTemplatesRelations = (0, drizzle_orm_1.relations)(exports.checklistTemplates, ({ one, many }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.checklistTemplates.workspaceId], references: [workspaces_1.workspaces.id] }),
    creator: one(users_1.users, { fields: [exports.checklistTemplates.createdById], references: [users_1.users.id] }),
    items: many(exports.checklistTemplateItems),
}));
exports.checklistTemplateItemsRelations = (0, drizzle_orm_1.relations)(exports.checklistTemplateItems, ({ one }) => ({
    template: one(exports.checklistTemplates, {
        fields: [exports.checklistTemplateItems.templateId],
        references: [exports.checklistTemplates.id],
    }),
}));
//# sourceMappingURL=checklist-templates.js.map
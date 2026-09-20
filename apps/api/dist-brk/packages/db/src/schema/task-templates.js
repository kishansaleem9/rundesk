"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskTemplatesRelations = exports.taskTemplates = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const workspaces_1 = require("./workspaces");
const users_1 = require("./users");
/**
 * A reusable single-task template scoped to a workspace.
 *
 * Captures everything you'd want to clone when creating a new task
 * from a recipe: title, description, priority, time estimate,
 * date offsets (relative to instantiation), labels (by name so the
 * template survives label renames), checklists with items, one level
 * of subtasks, and custom-field values keyed by field name (resolved
 * to the target project's field definitions at instantiate time).
 *
 * Status is intentionally NOT captured — each list owns its own
 * custom statuses, so instantiation picks the first 'open' status
 * of the target list to stay portable across pipelines.
 */
exports.taskTemplates = (0, pg_core_1.pgTable)('task_templates', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    name: (0, pg_core_1.text)('name').notNull(),
    description: (0, pg_core_1.text)('description'),
    icon: (0, pg_core_1.text)('icon'),
    // Snapshot of the task — see TaskTemplatePayload in
    // task-templates.service.ts for the canonical shape.
    payload: (0, pg_core_1.jsonb)('payload').$type().notNull(),
    usageCount: (0, pg_core_1.integer)('usage_count').notNull().default(0),
    createdById: (0, pg_core_1.uuid)('created_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    (0, pg_core_1.index)('idx_task_templates_workspace').on(t.workspaceId),
    (0, pg_core_1.index)('idx_task_templates_workspace_name').on(t.workspaceId, t.name),
]);
exports.taskTemplatesRelations = (0, drizzle_orm_1.relations)(exports.taskTemplates, ({ one }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.taskTemplates.workspaceId], references: [workspaces_1.workspaces.id] }),
    createdBy: one(users_1.users, { fields: [exports.taskTemplates.createdById], references: [users_1.users.id] }),
}));
//# sourceMappingURL=task-templates.js.map
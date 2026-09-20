"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskLabelAssignmentsRelations = exports.labelsRelations = exports.taskLabelAssignments = exports.labels = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const workspaces_1 = require("./workspaces");
const tasks_1 = require("./tasks");
exports.labels = (0, pg_core_1.pgTable)('labels', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    name: (0, pg_core_1.text)('name').notNull(),
    color: (0, pg_core_1.text)('color').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    (0, pg_core_1.unique)('uq_label_name_per_workspace').on(t.workspaceId, t.name),
]);
exports.taskLabelAssignments = (0, pg_core_1.pgTable)('task_label_assignments', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    taskId: (0, pg_core_1.uuid)('task_id').notNull().references(() => tasks_1.tasks.id, { onDelete: 'cascade' }),
    labelId: (0, pg_core_1.uuid)('label_id').notNull().references(() => exports.labels.id, { onDelete: 'cascade' }),
    addedAt: (0, pg_core_1.timestamp)('added_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    (0, pg_core_1.unique)('uq_task_label_unique').on(t.taskId, t.labelId),
]);
exports.labelsRelations = (0, drizzle_orm_1.relations)(exports.labels, ({ one, many }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.labels.workspaceId], references: [workspaces_1.workspaces.id] }),
    assignments: many(exports.taskLabelAssignments),
}));
exports.taskLabelAssignmentsRelations = (0, drizzle_orm_1.relations)(exports.taskLabelAssignments, ({ one }) => ({
    task: one(tasks_1.tasks, { fields: [exports.taskLabelAssignments.taskId], references: [tasks_1.tasks.id] }),
    label: one(exports.labels, { fields: [exports.taskLabelAssignments.labelId], references: [exports.labels.id] }),
}));
//# sourceMappingURL=labels.js.map
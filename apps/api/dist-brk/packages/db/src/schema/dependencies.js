"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskDependenciesRelations = exports.taskDependencies = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const tasks_1 = require("./tasks");
const users_1 = require("./users");
const enums_1 = require("./enums");
// taskId has this relationship to relatedTaskId.
// For 'blocks', task {taskId} blocks {relatedTaskId}.
// For 'blocked_by', task {taskId} is blocked by {relatedTaskId}.
exports.taskDependencies = (0, pg_core_1.pgTable)('task_dependencies', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    taskId: (0, pg_core_1.uuid)('task_id').notNull().references(() => tasks_1.tasks.id, { onDelete: 'cascade' }),
    relatedTaskId: (0, pg_core_1.uuid)('related_task_id').notNull().references(() => tasks_1.tasks.id, { onDelete: 'cascade' }),
    type: (0, enums_1.dependencyTypeEnum)('type').notNull(),
    createdById: (0, pg_core_1.uuid)('created_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    (0, pg_core_1.unique)('uq_task_dep_unique').on(t.taskId, t.relatedTaskId, t.type),
]);
exports.taskDependenciesRelations = (0, drizzle_orm_1.relations)(exports.taskDependencies, ({ one }) => ({
    task: one(tasks_1.tasks, { fields: [exports.taskDependencies.taskId], references: [tasks_1.tasks.id], relationName: 'dependencies_from' }),
    relatedTask: one(tasks_1.tasks, { fields: [exports.taskDependencies.relatedTaskId], references: [tasks_1.tasks.id], relationName: 'dependencies_to' }),
}));
//# sourceMappingURL=dependencies.js.map
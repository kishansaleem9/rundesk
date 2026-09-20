"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskActivityRelations = exports.taskActivity = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const tasks_1 = require("./tasks");
const users_1 = require("./users");
const enums_1 = require("./enums");
// Activity log scoped to a task. Can be expanded to doc/chat activities via entityType.
exports.taskActivity = (0, pg_core_1.pgTable)('task_activity', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    taskId: (0, pg_core_1.uuid)('task_id').notNull().references(() => tasks_1.tasks.id, { onDelete: 'cascade' }),
    actorId: (0, pg_core_1.uuid)('actor_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    action: (0, enums_1.activityActionEnum)('action').notNull(),
    // Structured metadata: { from: 'todo', to: 'done', fieldName?: 'status' }
    meta: (0, pg_core_1.jsonb)('meta').$type(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
});
exports.taskActivityRelations = (0, drizzle_orm_1.relations)(exports.taskActivity, ({ one }) => ({
    task: one(tasks_1.tasks, { fields: [exports.taskActivity.taskId], references: [tasks_1.tasks.id] }),
    actor: one(users_1.users, { fields: [exports.taskActivity.actorId], references: [users_1.users.id] }),
}));
//# sourceMappingURL=activity.js.map
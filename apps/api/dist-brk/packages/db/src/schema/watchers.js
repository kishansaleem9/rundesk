"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskWatchersRelations = exports.taskWatchers = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const tasks_1 = require("./tasks");
const users_1 = require("./users");
exports.taskWatchers = (0, pg_core_1.pgTable)('task_watchers', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    taskId: (0, pg_core_1.uuid)('task_id').notNull().references(() => tasks_1.tasks.id, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    addedAt: (0, pg_core_1.timestamp)('added_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    (0, pg_core_1.unique)('uq_task_watcher').on(t.taskId, t.userId),
]);
exports.taskWatchersRelations = (0, drizzle_orm_1.relations)(exports.taskWatchers, ({ one }) => ({
    task: one(tasks_1.tasks, { fields: [exports.taskWatchers.taskId], references: [tasks_1.tasks.id] }),
    user: one(users_1.users, { fields: [exports.taskWatchers.userId], references: [users_1.users.id] }),
}));
//# sourceMappingURL=watchers.js.map
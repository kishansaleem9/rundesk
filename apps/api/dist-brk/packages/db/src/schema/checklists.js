"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskChecklistItemsRelations = exports.taskChecklistsRelations = exports.taskChecklistItems = exports.taskChecklists = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const tasks_1 = require("./tasks");
const users_1 = require("./users");
exports.taskChecklists = (0, pg_core_1.pgTable)('task_checklists', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    taskId: (0, pg_core_1.uuid)('task_id').notNull().references(() => tasks_1.tasks.id, { onDelete: 'cascade' }),
    title: (0, pg_core_1.text)('title').notNull(),
    position: (0, pg_core_1.integer)('position').notNull().default(0),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
exports.taskChecklistItems = (0, pg_core_1.pgTable)('task_checklist_items', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    checklistId: (0, pg_core_1.uuid)('checklist_id').notNull().references(() => exports.taskChecklists.id, { onDelete: 'cascade' }),
    assigneeId: (0, pg_core_1.uuid)('assignee_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    content: (0, pg_core_1.text)('content').notNull(),
    isDone: (0, pg_core_1.boolean)('is_done').notNull().default(false),
    position: (0, pg_core_1.integer)('position').notNull().default(0),
    dueDate: (0, pg_core_1.timestamp)('due_date', { withTimezone: true }),
    completedAt: (0, pg_core_1.timestamp)('completed_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
exports.taskChecklistsRelations = (0, drizzle_orm_1.relations)(exports.taskChecklists, ({ one, many }) => ({
    task: one(tasks_1.tasks, { fields: [exports.taskChecklists.taskId], references: [tasks_1.tasks.id] }),
    items: many(exports.taskChecklistItems),
}));
exports.taskChecklistItemsRelations = (0, drizzle_orm_1.relations)(exports.taskChecklistItems, ({ one }) => ({
    checklist: one(exports.taskChecklists, { fields: [exports.taskChecklistItems.checklistId], references: [exports.taskChecklists.id] }),
    assignee: one(users_1.users, { fields: [exports.taskChecklistItems.assigneeId], references: [users_1.users.id] }),
}));
//# sourceMappingURL=checklists.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sprintTasksRelations = exports.sprintsRelations = exports.sprintTasks = exports.sprints = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const workspaces_1 = require("./workspaces");
const spaces_1 = require("./spaces");
const tasks_1 = require("./tasks");
exports.sprints = (0, pg_core_1.pgTable)('sprints', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    spaceId: (0, pg_core_1.uuid)('space_id').references(() => spaces_1.spaces.id, { onDelete: 'set null' }),
    name: (0, pg_core_1.text)('name').notNull(),
    goal: (0, pg_core_1.text)('goal'),
    status: (0, pg_core_1.text)('status').$type().notNull().default('planned'),
    startDate: (0, pg_core_1.timestamp)('start_date', { withTimezone: true }).notNull(),
    endDate: (0, pg_core_1.timestamp)('end_date', { withTimezone: true }).notNull(),
    closedAt: (0, pg_core_1.timestamp)('closed_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
});
exports.sprintTasks = (0, pg_core_1.pgTable)('sprint_tasks', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    sprintId: (0, pg_core_1.uuid)('sprint_id').notNull().references(() => exports.sprints.id, { onDelete: 'cascade' }),
    taskId: (0, pg_core_1.uuid)('task_id').notNull().references(() => tasks_1.tasks.id, { onDelete: 'cascade' }),
    storyPoints: (0, pg_core_1.doublePrecision)('story_points'),
    addedAt: (0, pg_core_1.timestamp)('added_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    uniqSprintTask: (0, pg_core_1.uniqueIndex)('sprint_tasks_unique').on(t.sprintId, t.taskId),
}));
exports.sprintsRelations = (0, drizzle_orm_1.relations)(exports.sprints, ({ one, many }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.sprints.workspaceId], references: [workspaces_1.workspaces.id] }),
    space: one(spaces_1.spaces, { fields: [exports.sprints.spaceId], references: [spaces_1.spaces.id] }),
    tasks: many(exports.sprintTasks),
}));
exports.sprintTasksRelations = (0, drizzle_orm_1.relations)(exports.sprintTasks, ({ one }) => ({
    sprint: one(exports.sprints, { fields: [exports.sprintTasks.sprintId], references: [exports.sprints.id] }),
    task: one(tasks_1.tasks, { fields: [exports.sprintTasks.taskId], references: [tasks_1.tasks.id] }),
}));
//# sourceMappingURL=sprints.js.map
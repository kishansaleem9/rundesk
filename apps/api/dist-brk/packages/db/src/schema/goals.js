"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.goalKeyResultsRelations = exports.goalKeyResults = exports.goalUpdatesRelations = exports.goalsRelations = exports.goalUpdates = exports.goals = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const workspaces_1 = require("./workspaces");
const spaces_1 = require("./spaces");
const users_1 = require("./users");
exports.goals = (0, pg_core_1.pgTable)('goals', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    spaceId: (0, pg_core_1.uuid)('space_id').references(() => spaces_1.spaces.id, { onDelete: 'set null' }),
    parentGoalId: (0, pg_core_1.uuid)('parent_goal_id').references(() => exports.goals.id, { onDelete: 'cascade' }),
    ownerId: (0, pg_core_1.uuid)('owner_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    title: (0, pg_core_1.text)('title').notNull(),
    description: (0, pg_core_1.text)('description'),
    kind: (0, pg_core_1.text)('kind').$type().notNull().default('percentage'),
    targetValue: (0, pg_core_1.doublePrecision)('target_value').notNull().default(100),
    currentValue: (0, pg_core_1.doublePrecision)('current_value').notNull().default(0),
    unit: (0, pg_core_1.text)('unit'),
    status: (0, pg_core_1.text)('status').$type().notNull().default('on_track'),
    startDate: (0, pg_core_1.timestamp)('start_date', { withTimezone: true }),
    dueDate: (0, pg_core_1.timestamp)('due_date', { withTimezone: true }),
    completedAt: (0, pg_core_1.timestamp)('completed_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
exports.goalUpdates = (0, pg_core_1.pgTable)('goal_updates', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    goalId: (0, pg_core_1.uuid)('goal_id').notNull().references(() => exports.goals.id, { onDelete: 'cascade' }),
    authorId: (0, pg_core_1.uuid)('author_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    fromValue: (0, pg_core_1.doublePrecision)('from_value').notNull(),
    toValue: (0, pg_core_1.doublePrecision)('to_value').notNull(),
    note: (0, pg_core_1.text)('note'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
});
exports.goalsRelations = (0, drizzle_orm_1.relations)(exports.goals, ({ one, many }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.goals.workspaceId], references: [workspaces_1.workspaces.id] }),
    space: one(spaces_1.spaces, { fields: [exports.goals.spaceId], references: [spaces_1.spaces.id] }),
    parent: one(exports.goals, { fields: [exports.goals.parentGoalId], references: [exports.goals.id], relationName: 'goal_children' }),
    children: many(exports.goals, { relationName: 'goal_children' }),
    owner: one(users_1.users, { fields: [exports.goals.ownerId], references: [users_1.users.id] }),
    updates: many(exports.goalUpdates),
}));
exports.goalUpdatesRelations = (0, drizzle_orm_1.relations)(exports.goalUpdates, ({ one }) => ({
    goal: one(exports.goals, { fields: [exports.goalUpdates.goalId], references: [exports.goals.id] }),
    author: one(users_1.users, { fields: [exports.goalUpdates.authorId], references: [users_1.users.id] }),
}));
// Measurable key results under a goal (OKR-style). Each tracks its own
// current/target; the parent goal keeps its own overall progress.
exports.goalKeyResults = (0, pg_core_1.pgTable)('goal_key_results', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    goalId: (0, pg_core_1.uuid)('goal_id').notNull().references(() => exports.goals.id, { onDelete: 'cascade' }),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    ownerId: (0, pg_core_1.uuid)('owner_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    title: (0, pg_core_1.text)('title').notNull(),
    unit: (0, pg_core_1.text)('unit'),
    targetValue: (0, pg_core_1.doublePrecision)('target_value').notNull().default(100),
    currentValue: (0, pg_core_1.doublePrecision)('current_value').notNull().default(0),
    status: (0, pg_core_1.text)('status').$type().notNull().default('on_track'),
    position: (0, pg_core_1.integer)('position').notNull().default(0),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
exports.goalKeyResultsRelations = (0, drizzle_orm_1.relations)(exports.goalKeyResults, ({ one }) => ({
    goal: one(exports.goals, { fields: [exports.goalKeyResults.goalId], references: [exports.goals.id] }),
    owner: one(users_1.users, { fields: [exports.goalKeyResults.ownerId], references: [users_1.users.id] }),
}));
//# sourceMappingURL=goals.js.map
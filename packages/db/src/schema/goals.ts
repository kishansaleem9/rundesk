import { pgTable, text, timestamp, uuid, integer, doublePrecision, type AnyPgColumn, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { spaces } from './spaces'
import { users } from './users'

export type GoalStatus = 'on_track' | 'at_risk' | 'off_track' | 'completed'
export type GoalKind = 'numeric' | 'percentage' | 'boolean'

/**
 * A GOAL FOLDER, AS CLICKUP FILES GOALS (`found-14-oct/clickup-import-rest-unimported`).
 *
 * ClickUp keeps Goals in Goal Folders, and its import brought their Goals with
 * nowhere to put the Folder. A folder is the workspace's, named, in its order;
 * a goal is in one folder or none. Deleting a folder leaves its goals, out of
 * any folder. Who reads a goal is still the goal's own rule (`read-access.ts`):
 * a folder holds goals, it shares none.
 */
export const goalFolders = pgTable('goal_folders', {
  id:          uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name:        text('name').notNull(),
  position:    integer('position').notNull().default(0),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_goal_folders_workspace').on(t.workspaceId, t.position),
])

export const goals = pgTable('goals', {
  id:             uuid('id').primaryKey().defaultRandom(),
  workspaceId:    uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  spaceId:        uuid('space_id').references(() => spaces.id, { onDelete: 'set null' }),
  /** Its Goal Folder, if it is in one. */
  folderId:       uuid('folder_id').references(() => goalFolders.id, { onDelete: 'set null' }),
  parentGoalId:   uuid('parent_goal_id').references((): AnyPgColumn => goals.id, { onDelete: 'cascade' }),
  ownerId:        uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
  title:          text('title').notNull(),
  description:    text('description'),
  kind:           text('kind').$type<GoalKind>().notNull().default('percentage'),
  targetValue:    doublePrecision('target_value').notNull().default(100),
  currentValue:   doublePrecision('current_value').notNull().default(0),
  unit:           text('unit'),
  status:         text('status').$type<GoalStatus>().notNull().default('on_track'),
  startDate:      timestamp('start_date', { withTimezone: true }),
  dueDate:        timestamp('due_date', { withTimezone: true }),
  completedAt:    timestamp('completed_at', { withTimezone: true }),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_goals_folder').on(t.folderId),
])

export const goalUpdates = pgTable('goal_updates', {
  id:        uuid('id').primaryKey().defaultRandom(),
  goalId:    uuid('goal_id').notNull().references(() => goals.id, { onDelete: 'cascade' }),
  authorId:  uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
  fromValue: doublePrecision('from_value').notNull(),
  toValue:   doublePrecision('to_value').notNull(),
  note:      text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const goalsRelations = relations(goals, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [goals.workspaceId], references: [workspaces.id] }),
  space:     one(spaces,     { fields: [goals.spaceId],     references: [spaces.id] }),
  parent:    one(goals,      { fields: [goals.parentGoalId], references: [goals.id], relationName: 'goal_children' }),
  children:  many(goals, { relationName: 'goal_children' }),
  owner:     one(users, { fields: [goals.ownerId], references: [users.id] }),
  updates:   many(goalUpdates),
}))

export const goalUpdatesRelations = relations(goalUpdates, ({ one }) => ({
  goal:   one(goals, { fields: [goalUpdates.goalId], references: [goals.id] }),
  author: one(users, { fields: [goalUpdates.authorId], references: [users.id] }),
}))

// Measurable key results under a goal (OKR-style). Each tracks its own
// current/target; the parent goal keeps its own overall progress.
export const goalKeyResults = pgTable('goal_key_results', {
  id:           uuid('id').primaryKey().defaultRandom(),
  goalId:       uuid('goal_id').notNull().references(() => goals.id, { onDelete: 'cascade' }),
  workspaceId:  uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  ownerId:      uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
  title:        text('title').notNull(),
  unit:         text('unit'),
  targetValue:  doublePrecision('target_value').notNull().default(100),
  currentValue: doublePrecision('current_value').notNull().default(0),
  status:       text('status').$type<GoalStatus>().notNull().default('on_track'),
  position:     integer('position').notNull().default(0),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Made by 0026. Declared here as well: a database built by
  // `drizzle-kit push` (the lanes, CI, a fresh deploy) reads only this file.
  index('idx_goal_key_results_goal').on(t.goalId, t.position),
])

export const goalKeyResultsRelations = relations(goalKeyResults, ({ one }) => ({
  goal:  one(goals, { fields: [goalKeyResults.goalId], references: [goals.id] }),
  owner: one(users, { fields: [goalKeyResults.ownerId], references: [users.id] }),
}))

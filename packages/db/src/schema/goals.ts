import { pgTable, text, timestamp, uuid, integer, doublePrecision, type AnyPgColumn } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { spaces } from './spaces'
import { users } from './users'

export type GoalStatus = 'on_track' | 'at_risk' | 'off_track' | 'completed'
export type GoalKind = 'numeric' | 'percentage' | 'boolean'

export const goals = pgTable('goals', {
  id:             uuid('id').primaryKey().defaultRandom(),
  workspaceId:    uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  spaceId:        uuid('space_id').references(() => spaces.id, { onDelete: 'set null' }),
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
})

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

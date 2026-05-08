import { pgTable, text, timestamp, uuid, jsonb, type AnyPgColumn } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tasks } from './tasks'
import { users } from './users'

// Generic-ish comment table; scoped to a task right now, can extend to docs via entityType later.
export const taskComments = pgTable('task_comments', {
  id:              uuid('id').primaryKey().defaultRandom(),
  taskId:          uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  authorId:        uuid('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  assignedToUserId: uuid('assigned_to_user_id').references(() => users.id, { onDelete: 'set null' }),
  resolvedByUserId: uuid('resolved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  resolvedAt:      timestamp('resolved_at', { withTimezone: true }),
  parentCommentId: uuid('parent_comment_id').references((): AnyPgColumn => taskComments.id, { onDelete: 'cascade' }),
  body:            text('body').notNull(),
  // Structured mentions: [{ userId: '...', offset: 12, length: 8 }]
  mentions:        jsonb('mentions').$type<Array<{ userId: string; offset: number; length: number }>>(),
  editedAt:        timestamp('edited_at', { withTimezone: true }),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const taskCommentReactions = pgTable('task_comment_reactions', {
  id:        uuid('id').primaryKey().defaultRandom(),
  commentId: uuid('comment_id').notNull().references(() => taskComments.id, { onDelete: 'cascade' }),
  userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  emoji:     text('emoji').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const taskCommentsRelations = relations(taskComments, ({ one, many }) => ({
  task:      one(tasks,        { fields: [taskComments.taskId], references: [tasks.id] }),
  author:    one(users,        { fields: [taskComments.authorId], references: [users.id] }),
  assignee:  one(users,        { fields: [taskComments.assignedToUserId], references: [users.id] }),
  resolver:  one(users,        { fields: [taskComments.resolvedByUserId], references: [users.id] }),
  parent:    one(taskComments, { fields: [taskComments.parentCommentId], references: [taskComments.id], relationName: 'replies' }),
  replies:   many(taskComments, { relationName: 'replies' }),
  reactions: many(taskCommentReactions),
}))

export const taskCommentReactionsRelations = relations(taskCommentReactions, ({ one }) => ({
  comment: one(taskComments, { fields: [taskCommentReactions.commentId], references: [taskComments.id] }),
  user:    one(users,        { fields: [taskCommentReactions.userId], references: [users.id] }),
}))

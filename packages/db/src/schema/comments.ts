import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  index,
  uniqueIndex,
  check,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
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
  /*
   * HOW IT WAS SAID: in the task, or by email (`resume-defects/s4-composer-email`,
   * `ledger-rows/row-1252`). ClickUp's comment box posts a comment or, with its
   * Email ClickApp, an email to people outside the workspace, and the replies
   * land in the task's activity; an email comment's recipients and subject are
   * `task_comment_emails`'s (migration 0180).
   */
  channel:         text('channel').notNull().default('comment'),
}, (t) => [
  check('task_comments_channel_check', sql`${t.channel} IN ('comment', 'email')`),
])

export const taskCommentReactions = pgTable('task_comment_reactions', {
  id:        uuid('id').primaryKey().defaultRandom(),
  commentId: uuid('comment_id').notNull().references(() => taskComments.id, { onDelete: 'cascade' }),
  userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  emoji:     text('emoji').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * §V2-S06 frame `05:55` — "reply/thread, assign, save — same like messages".
 *
 * The save on a comment is the same gesture as the save on a chat message, so
 * it is the same shape: one private row per person per comment, no shared
 * state. `chat_message_saves` is the sibling, and the reason this is a table
 * rather than a flag on the comment is the same reason it is there — two people
 * saving the same comment must not see each other's bookmark.
 *
 * NO TAGS COLUMN, deliberately. `chat_message_saves.tags` exists because chat's
 * Saved panel filters by tag; nothing in the frames tags a saved comment, and a
 * column no reader honours is this codebase's named defect.
 *
 * Where they surface: the Inbox's **Later** tab, beside the saved messages
 * §2.2 put there — which is also where ClickUp puts them ("hover over the
 * comment … it will be added to the Later tab in your Inbox").
 */
export const taskCommentSaves = pgTable(
  'task_comment_saves',
  {
    id:        uuid('id').primaryKey().defaultRandom(),
    commentId: uuid('comment_id').notNull().references(() => taskComments.id, { onDelete: 'cascade' }),
    userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqSave: uniqueIndex('task_comment_saves_unique').on(t.commentId, t.userId),
    byUser:   index('idx_task_comment_saves_user').on(t.userId),
  }),
)

export const taskCommentSavesRelations = relations(taskCommentSaves, ({ one }) => ({
  comment: one(taskComments, { fields: [taskCommentSaves.commentId], references: [taskComments.id] }),
  user:    one(users,        { fields: [taskCommentSaves.userId], references: [users.id] }),
}))

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

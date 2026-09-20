"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskCommentReactionsRelations = exports.taskCommentsRelations = exports.taskCommentSavesRelations = exports.taskCommentSaves = exports.taskCommentReactions = exports.taskComments = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const tasks_1 = require("./tasks");
const users_1 = require("./users");
// Generic-ish comment table; scoped to a task right now, can extend to docs via entityType later.
exports.taskComments = (0, pg_core_1.pgTable)('task_comments', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    taskId: (0, pg_core_1.uuid)('task_id').notNull().references(() => tasks_1.tasks.id, { onDelete: 'cascade' }),
    authorId: (0, pg_core_1.uuid)('author_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    assignedToUserId: (0, pg_core_1.uuid)('assigned_to_user_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    resolvedByUserId: (0, pg_core_1.uuid)('resolved_by_user_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    resolvedAt: (0, pg_core_1.timestamp)('resolved_at', { withTimezone: true }),
    parentCommentId: (0, pg_core_1.uuid)('parent_comment_id').references(() => exports.taskComments.id, { onDelete: 'cascade' }),
    body: (0, pg_core_1.text)('body').notNull(),
    // Structured mentions: [{ userId: '...', offset: 12, length: 8 }]
    mentions: (0, pg_core_1.jsonb)('mentions').$type(),
    editedAt: (0, pg_core_1.timestamp)('edited_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
});
exports.taskCommentReactions = (0, pg_core_1.pgTable)('task_comment_reactions', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    commentId: (0, pg_core_1.uuid)('comment_id').notNull().references(() => exports.taskComments.id, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    emoji: (0, pg_core_1.text)('emoji').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
});
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
exports.taskCommentSaves = (0, pg_core_1.pgTable)('task_comment_saves', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    commentId: (0, pg_core_1.uuid)('comment_id').notNull().references(() => exports.taskComments.id, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    uniqSave: (0, pg_core_1.uniqueIndex)('task_comment_saves_unique').on(t.commentId, t.userId),
    byUser: (0, pg_core_1.index)('idx_task_comment_saves_user').on(t.userId),
}));
exports.taskCommentSavesRelations = (0, drizzle_orm_1.relations)(exports.taskCommentSaves, ({ one }) => ({
    comment: one(exports.taskComments, { fields: [exports.taskCommentSaves.commentId], references: [exports.taskComments.id] }),
    user: one(users_1.users, { fields: [exports.taskCommentSaves.userId], references: [users_1.users.id] }),
}));
exports.taskCommentsRelations = (0, drizzle_orm_1.relations)(exports.taskComments, ({ one, many }) => ({
    task: one(tasks_1.tasks, { fields: [exports.taskComments.taskId], references: [tasks_1.tasks.id] }),
    author: one(users_1.users, { fields: [exports.taskComments.authorId], references: [users_1.users.id] }),
    assignee: one(users_1.users, { fields: [exports.taskComments.assignedToUserId], references: [users_1.users.id] }),
    resolver: one(users_1.users, { fields: [exports.taskComments.resolvedByUserId], references: [users_1.users.id] }),
    parent: one(exports.taskComments, { fields: [exports.taskComments.parentCommentId], references: [exports.taskComments.id], relationName: 'replies' }),
    replies: many(exports.taskComments, { relationName: 'replies' }),
    reactions: many(exports.taskCommentReactions),
}));
exports.taskCommentReactionsRelations = (0, drizzle_orm_1.relations)(exports.taskCommentReactions, ({ one }) => ({
    comment: one(exports.taskComments, { fields: [exports.taskCommentReactions.commentId], references: [exports.taskComments.id] }),
    user: one(users_1.users, { fields: [exports.taskCommentReactions.userId], references: [users_1.users.id] }),
}));
//# sourceMappingURL=comments.js.map
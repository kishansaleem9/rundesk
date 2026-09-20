"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.remindersRelations = exports.reminders = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const workspaces_1 = require("./workspaces");
const users_1 = require("./users");
const tasks_1 = require("./tasks");
const chat_1 = require("./chat");
/**
 * User-created reminders (Plan §4/§10) — "remind me about this at <time>". A
 * background tick fires each due reminder once (notified_at is stamped) and
 * delivers it through the normal notification pipeline. Distinct from the
 * automated due-soon/overdue reminders in RemindersService.
 *
 * §G11 [15:19] — the subject became optional and polymorphic.
 *
 * It used to be `task_id NOT NULL`, which meant a reminder could only hang off
 * a task. Two things paid for that. A reminder on a saved message was
 * impossible, which is what she asked for. And `/remind in 2 hours call Ali`
 * had to invent a task to carry the text — so it littered the list with
 * phantom tasks, and refused outright in a workspace with no list yet, which is
 * an odd thing for an egg-timer to need.
 *
 * Both columns nullable, at most one set: a task, a message, or neither for a
 * plain note. The CHECK is what keeps "polymorphic" from meaning
 * "unconstrained".
 */
exports.reminders = (0, pg_core_1.pgTable)('reminders', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    taskId: (0, pg_core_1.uuid)('task_id').references(() => tasks_1.tasks.id, { onDelete: 'cascade' }),
    /** The chat message this reminder is about, when it is about one. */
    messageId: (0, pg_core_1.uuid)('message_id').references(() => chat_1.chatMessages.id, { onDelete: 'cascade' }),
    note: (0, pg_core_1.text)('note'),
    remindAt: (0, pg_core_1.timestamp)('remind_at', { withTimezone: true }).notNull(),
    // Stamped when the reminder has fired; null means still pending.
    notifiedAt: (0, pg_core_1.timestamp)('notified_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    // Drives the "due and unfired" scan.
    byDue: (0, pg_core_1.index)('reminders_due_idx').on(t.remindAt),
    byUser: (0, pg_core_1.index)('reminders_user_idx').on(t.userId),
    // A reminder is about one thing, or about nothing — never about two.
    oneSubject: (0, pg_core_1.check)('reminders_one_subject', (0, drizzle_orm_1.sql) `${t.taskId} is null or ${t.messageId} is null`),
}));
exports.remindersRelations = (0, drizzle_orm_1.relations)(exports.reminders, ({ one }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.reminders.workspaceId], references: [workspaces_1.workspaces.id] }),
    user: one(users_1.users, { fields: [exports.reminders.userId], references: [users_1.users.id] }),
    task: one(tasks_1.tasks, { fields: [exports.reminders.taskId], references: [tasks_1.tasks.id] }),
    message: one(chat_1.chatMessages, { fields: [exports.reminders.messageId], references: [chat_1.chatMessages.id] }),
}));
//# sourceMappingURL=reminders.js.map
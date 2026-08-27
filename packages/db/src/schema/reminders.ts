import { pgTable, text, timestamp, uuid, index, check, type AnyPgColumn } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { users } from './users'
import { tasks } from './tasks'
import { chatMessages } from './chat'

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
export const reminders = pgTable(
  'reminders',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    userId:      uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    taskId:      uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
    /** The chat message this reminder is about, when it is about one. */
    messageId:   uuid('message_id').references((): AnyPgColumn => chatMessages.id, { onDelete: 'cascade' }),
    note:        text('note'),
    remindAt:    timestamp('remind_at', { withTimezone: true }).notNull(),
    // Stamped when the reminder has fired; null means still pending.
    notifiedAt:  timestamp('notified_at', { withTimezone: true }),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Drives the "due and unfired" scan.
    byDue: index('reminders_due_idx').on(t.remindAt),
    byUser: index('reminders_user_idx').on(t.userId),
    // A reminder is about one thing, or about nothing — never about two.
    oneSubject: check(
      'reminders_one_subject',
      sql`${t.taskId} is null or ${t.messageId} is null`,
    ),
  }),
)

export const remindersRelations = relations(reminders, ({ one }) => ({
  workspace: one(workspaces,   { fields: [reminders.workspaceId], references: [workspaces.id] }),
  user:      one(users,        { fields: [reminders.userId], references: [users.id] }),
  task:      one(tasks,        { fields: [reminders.taskId], references: [tasks.id] }),
  message:   one(chatMessages, { fields: [reminders.messageId], references: [chatMessages.id] }),
}))

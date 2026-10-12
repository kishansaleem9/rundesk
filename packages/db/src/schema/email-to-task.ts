import { pgTable, text, timestamp, uuid, integer, unique, index, uniqueIndex, check } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { taskComments } from './comments'
import { lists } from './lists'
import { users } from './users'
import { tasks } from './tasks'
import { emailAccounts } from './email-accounts'

/**
 * Per-list inbound email address. Each list gets at most one alias of the
 * form `<localPart>@<INBOUND_EMAIL_DOMAIN>`. Sending mail to that address
 * creates a task in the list; replies to notification emails are routed
 * by the sub-address `localPart+task-<id>@…` and become comments.
 *
 * `localPart` is the public-but-unguessable slug rotated by the admin.
 */
export const listEmailAliases = pgTable(
  'list_email_aliases',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    listId:      uuid('list_id').notNull().references(() => lists.id, { onDelete: 'cascade' }),
    localPart:   text('local_part').notNull(),
    // Default priority + creator for tasks minted from inbound mail.
    defaultPriority: text('default_priority').notNull().default('normal'),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    revokedAt:   timestamp('revoked_at', { withTimezone: true }),
    lastUsedAt:  timestamp('last_used_at', { withTimezone: true }),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('uq_list_email_aliases_list').on(t.listId),
    unique('uq_list_email_aliases_local_part').on(t.localPart),
  ],
)

export const listEmailAliasesRelations = relations(listEmailAliases, ({ one }) => ({
  list:      one(lists, { fields: [listEmailAliases.listId],      references: [lists.id] }),
  createdBy: one(users, { fields: [listEmailAliases.createdById], references: [users.id] }),
}))

/**
 * One row per inbound email we accept. Used for:
 *   - idempotency (we never create two tasks for the same Message-Id)
 *   - audit / debugging ("why is this task here?")
 *   - reply threading lookup by Message-Id / In-Reply-To
 */
export const inboundEmailMessages = pgTable(
  'inbound_email_messages',
  {
    id:           uuid('id').primaryKey().defaultRandom(),
    listId:       uuid('list_id').references(() => lists.id, { onDelete: 'set null' }),
    taskId:       uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    messageId:    text('message_id').notNull(),
    inReplyTo:    text('in_reply_to'),
    fromAddress:  text('from_address').notNull(),
    fromName:     text('from_name'),
    recipient:    text('recipient').notNull(),
    subject:      text('subject'),
    bytes:        integer('bytes').notNull().default(0),
    attachmentCount: integer('attachment_count').notNull().default(0),
    // 'task_created' | 'comment_added' | 'rejected_no_alias' | 'rejected_duplicate' | 'rejected_too_large'
    outcome:      text('outcome').notNull(),
    reason:       text('reason'),
    receivedAt:   timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('uq_inbound_email_messages_message_id').on(t.messageId),
    index('idx_inbound_email_messages_in_reply_to').on(t.inReplyTo),
    index('idx_inbound_email_messages_task').on(t.taskId),
  ],
)

export const inboundEmailMessagesRelations = relations(inboundEmailMessages, ({ one }) => ({
  list: one(lists, { fields: [inboundEmailMessages.listId], references: [lists.id] }),
  task: one(tasks, { fields: [inboundEmailMessages.taskId], references: [tasks.id] }),
}))

/**
 * The notification mail this server sent about a task, by Message-ID, so a
 * reply's `In-Reply-To` / `References` find the task it answers. Only inbound
 * Message-IDs were ever kept, and a reply to a notification named an outbound
 * one, so it matched nothing (`resume-defects/resume-8-reply-routing`).
 * `reply_to` is the task's own address when its list takes email.
 */
export const outboundEmailMessages = pgTable(
  'outbound_email_messages',
  {
    id:        uuid('id').primaryKey().defaultRandom(),
    messageId: text('message_id').notNull(),
    taskId:    uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    listId:    uuid('list_id').notNull().references(() => lists.id, { onDelete: 'cascade' }),
    recipient: text('recipient').notNull(),
    replyTo:   text('reply_to'),
    sentAt:    timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    // The email comment this message was, so a reply to it is threaded under it (migration 0180).
    commentId: uuid('comment_id').references(() => taskComments.id, { onDelete: 'set null' }),
  },
  (t) => [
    unique('uq_outbound_email_messages_message_id').on(t.messageId),
    index('idx_outbound_email_messages_task').on(t.taskId),
  ],
)

/**
 * AN EMAIL COMMENT'S ENVELOPE (`resume-defects/s4-composer-email`,
 * `ledger-rows/row-1252`): who it went to or came from, and its subject, beside
 * the comment that holds its words. `out` for one sent from the comment box,
 * `in` for a reply that came back to the task's address.
 */
export const taskCommentEmails = pgTable(
  'task_comment_emails',
  {
    commentId:     uuid('comment_id').primaryKey().references(() => taskComments.id, { onDelete: 'cascade' }),
    direction:     text('direction').notNull(),
    fromAddress:   text('from_address').notNull(),
    toAddresses:   text('to_addresses').array().notNull().default([]),
    ccAddresses:   text('cc_addresses').array().notNull().default([]),
    bccAddresses:  text('bcc_addresses').array().notNull().default([]),
    subject:       text('subject').notNull(),
    messageId:     text('message_id').notNull(),
    createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /*
     * SENT FROM, OR READ FROM, A MAILBOX ITS WRITER LINKED
     * (`found-9-oct/task-email-sends-from-the-server`, migration 0186): the
     * account, and the provider's own ids — Gmail's thread and message, or
     * Graph's conversation and message — by which its answers are read back
     * from that mailbox, each once. Null for one the server sent.
     */
    accountId:          uuid('account_id').references(() => emailAccounts.id, { onDelete: 'set null' }),
    providerThreadId:   text('provider_thread_id'),
    providerMessageId:  text('provider_message_id'),
  },
  (t) => [
    check('task_comment_emails_direction_check', sql`${t.direction} IN ('out', 'in')`),
    index('idx_task_comment_emails_thread').on(t.accountId, t.providerThreadId),
    uniqueIndex('uq_task_comment_emails_provider_message').on(t.accountId, t.providerMessageId).where(sql`${t.providerMessageId} is not null`),
  ],
)

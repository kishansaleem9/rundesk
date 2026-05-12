import { pgTable, text, timestamp, uuid, integer, unique, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { lists } from './lists'
import { users } from './users'
import { tasks } from './tasks'

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

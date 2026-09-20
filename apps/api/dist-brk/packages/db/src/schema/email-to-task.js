"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inboundEmailMessagesRelations = exports.inboundEmailMessages = exports.listEmailAliasesRelations = exports.listEmailAliases = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const lists_1 = require("./lists");
const users_1 = require("./users");
const tasks_1 = require("./tasks");
/**
 * Per-list inbound email address. Each list gets at most one alias of the
 * form `<localPart>@<INBOUND_EMAIL_DOMAIN>`. Sending mail to that address
 * creates a task in the list; replies to notification emails are routed
 * by the sub-address `localPart+task-<id>@…` and become comments.
 *
 * `localPart` is the public-but-unguessable slug rotated by the admin.
 */
exports.listEmailAliases = (0, pg_core_1.pgTable)('list_email_aliases', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    listId: (0, pg_core_1.uuid)('list_id').notNull().references(() => lists_1.lists.id, { onDelete: 'cascade' }),
    localPart: (0, pg_core_1.text)('local_part').notNull(),
    // Default priority + creator for tasks minted from inbound mail.
    defaultPriority: (0, pg_core_1.text)('default_priority').notNull().default('normal'),
    createdById: (0, pg_core_1.uuid)('created_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    revokedAt: (0, pg_core_1.timestamp)('revoked_at', { withTimezone: true }),
    lastUsedAt: (0, pg_core_1.timestamp)('last_used_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    (0, pg_core_1.unique)('uq_list_email_aliases_list').on(t.listId),
    (0, pg_core_1.unique)('uq_list_email_aliases_local_part').on(t.localPart),
]);
exports.listEmailAliasesRelations = (0, drizzle_orm_1.relations)(exports.listEmailAliases, ({ one }) => ({
    list: one(lists_1.lists, { fields: [exports.listEmailAliases.listId], references: [lists_1.lists.id] }),
    createdBy: one(users_1.users, { fields: [exports.listEmailAliases.createdById], references: [users_1.users.id] }),
}));
/**
 * One row per inbound email we accept. Used for:
 *   - idempotency (we never create two tasks for the same Message-Id)
 *   - audit / debugging ("why is this task here?")
 *   - reply threading lookup by Message-Id / In-Reply-To
 */
exports.inboundEmailMessages = (0, pg_core_1.pgTable)('inbound_email_messages', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    listId: (0, pg_core_1.uuid)('list_id').references(() => lists_1.lists.id, { onDelete: 'set null' }),
    taskId: (0, pg_core_1.uuid)('task_id').references(() => tasks_1.tasks.id, { onDelete: 'set null' }),
    messageId: (0, pg_core_1.text)('message_id').notNull(),
    inReplyTo: (0, pg_core_1.text)('in_reply_to'),
    fromAddress: (0, pg_core_1.text)('from_address').notNull(),
    fromName: (0, pg_core_1.text)('from_name'),
    recipient: (0, pg_core_1.text)('recipient').notNull(),
    subject: (0, pg_core_1.text)('subject'),
    bytes: (0, pg_core_1.integer)('bytes').notNull().default(0),
    attachmentCount: (0, pg_core_1.integer)('attachment_count').notNull().default(0),
    // 'task_created' | 'comment_added' | 'rejected_no_alias' | 'rejected_duplicate' | 'rejected_too_large'
    outcome: (0, pg_core_1.text)('outcome').notNull(),
    reason: (0, pg_core_1.text)('reason'),
    receivedAt: (0, pg_core_1.timestamp)('received_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    (0, pg_core_1.unique)('uq_inbound_email_messages_message_id').on(t.messageId),
    (0, pg_core_1.index)('idx_inbound_email_messages_in_reply_to').on(t.inReplyTo),
    (0, pg_core_1.index)('idx_inbound_email_messages_task').on(t.taskId),
]);
exports.inboundEmailMessagesRelations = (0, drizzle_orm_1.relations)(exports.inboundEmailMessages, ({ one }) => ({
    list: one(lists_1.lists, { fields: [exports.inboundEmailMessages.listId], references: [lists_1.lists.id] }),
    task: one(tasks_1.tasks, { fields: [exports.inboundEmailMessages.taskId], references: [tasks_1.tasks.id] }),
}));
//# sourceMappingURL=email-to-task.js.map
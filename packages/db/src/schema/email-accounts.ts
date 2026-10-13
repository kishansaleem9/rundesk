import { pgTable, uuid, text, integer, boolean, timestamp, index, uniqueIndex, primaryKey, check } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { users } from './users'
import { tasks } from './tasks'
import { taskComments } from './comments'
import { sealedText } from './sealed-text'

/**
 * A MAILBOX A PERSON LINKED, TO SEND A TASK'S EMAIL FROM
 * (`found-9-oct/task-email-sends-from-the-server`).
 *
 * ClickUp's Email ClickApp sends from an email account its user linked — Gmail
 * or Outlook, signed in at the provider, or another mailbox by its IMAP and SMTP
 * servers — under a sender name they choose, and
 * reads the answers there; the one who linked it chooses the teammates who may
 * send from it too (`email_account_senders`). Its grant is the provider's
 * token pair, kept as the other connections keep theirs; `needs_reconnect`
 * once the provider refused it. `uses`: the emails sent from it, which a Free
 * plan has a hundred of.
 */
export const emailAccounts = pgTable(
  'email_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    /** Who linked it: theirs to name, share and remove. */
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    /** The mailbox's own address, as the provider says it, in lower case. */
    address: text('address').notNull(),
    senderName: text('sender_name').notNull(),
    accessToken: sealedText('access_token', 'email_accounts.access_token'),
    refreshToken: sealedText('refresh_token', 'email_accounts.refresh_token'),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    scopes: text('scopes').array().notNull().default([]),
    /*
     * A mailbox linked over IMAP (`found-12-oct/task-email-imap-unbuilt`): its
     * servers as its linker typed them, whether they require SSL, and its
     * password sealed under TOKEN_ENCRYPTION_KEY (`secret-box.ts`). Null for
     * Gmail and Outlook, whose grant is the token pair above.
     */
    imapHost: text('imap_host'),
    imapPort: integer('imap_port'),
    smtpHost: text('smtp_host'),
    smtpPort: integer('smtp_port'),
    useSsl: boolean('use_ssl'),
    passwordSealed: text('password_sealed'),
    status: text('status').notNull().default('connected'),
    lastError: text('last_error'),
    uses: integer('uses').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_email_accounts_workspace_address').on(t.workspaceId, t.provider, t.address),
    index('idx_email_accounts_owner').on(t.ownerId),
    check('email_accounts_provider_check', sql`${t.provider} IN ('gmail', 'outlook', 'imap')`),
    check(
      'email_accounts_imap_check',
      sql`${t.provider} <> 'imap' OR (${t.imapHost} IS NOT NULL AND ${t.imapPort} BETWEEN 1 AND 65535 AND ${t.smtpHost} IS NOT NULL AND ${t.smtpPort} BETWEEN 1 AND 65535 AND ${t.useSsl} IS NOT NULL AND ${t.passwordSealed} IS NOT NULL)`,
    ),
    check('email_accounts_status_check', sql`${t.status} IN ('connected', 'needs_reconnect')`),
  ],
)

/** The teammates its owner lets send from a mailbox (ClickUp: "who can send from this account"). */
export const emailAccountSenders = pgTable(
  'email_account_senders',
  {
    accountId: uuid('account_id')
      .notNull()
      .references(() => emailAccounts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ name: 'email_account_senders_pkey', columns: [t.accountId, t.userId] }), index('idx_email_account_senders_user').on(t.userId)],
)

/**
 * A PERSON'S EMAIL SIGNATURES. ClickUp: each member keeps several, named, one
 * of them the default, which the composer puts under the words (Business and
 * above).
 */
export const emailSignatures = pgTable(
  'email_signatures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    body: text('body').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_email_signatures_owner').on(t.workspaceId, t.userId),
    // One default a person.
    uniqueIndex('uq_email_signatures_default').on(t.workspaceId, t.userId).where(sql`${t.isDefault}`),
  ],
)

/**
 * AN EMAIL TEMPLATE. ClickUp: a name, a subject if wanted, the words, and who
 * may use it — its maker alone, or everybody in the workspace (Business and
 * above).
 */
export const emailTemplates = pgTable(
  'email_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    createdById: uuid('created_by_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    subject: text('subject'),
    body: text('body').notNull(),
    /** Everybody in the workspace may use it; else its maker alone. */
    shared: boolean('shared').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_email_templates_workspace').on(t.workspaceId)],
)

/**
 * AN EMAIL SET TO SEND LATER. ClickUp: the arrow beside Send picks a time; the
 * task shows a reminder of it, and it can be sent now, moved or cancelled
 * until then (Unlimited and above). Sent as its writer at its time — asked
 * again whether they still may — and then it is the task's email comment
 * (`comment_id`); refused then, it is `failed` with why.
 */
export const scheduledTaskEmails = pgTable(
  'scheduled_task_emails',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id').references(() => emailAccounts.id, { onDelete: 'set null' }),
    toAddresses: text('to_addresses').array().notNull().default([]),
    ccAddresses: text('cc_addresses').array().notNull().default([]),
    bccAddresses: text('bcc_addresses').array().notNull().default([]),
    subject: text('subject'),
    body: text('body').notNull(),
    attachmentIds: uuid('attachment_ids').array().notNull().default([]),
    parentCommentId: uuid('parent_comment_id').references(() => taskComments.id, { onDelete: 'set null' }),
    sendAt: timestamp('send_at', { withTimezone: true }).notNull(),
    status: text('status').notNull().default('scheduled'),
    error: text('error'),
    commentId: uuid('comment_id').references(() => taskComments.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_scheduled_task_emails_due').on(t.status, t.sendAt),
    index('idx_scheduled_task_emails_task').on(t.taskId),
    check('scheduled_task_emails_status_check', sql`${t.status} IN ('scheduled', 'sending', 'sent', 'cancelled', 'failed')`),
  ],
)

export const emailAccountsRelations = relations(emailAccounts, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [emailAccounts.workspaceId], references: [workspaces.id] }),
  owner: one(users, { fields: [emailAccounts.ownerId], references: [users.id] }),
  senders: many(emailAccountSenders),
}))

export const emailAccountSendersRelations = relations(emailAccountSenders, ({ one }) => ({
  account: one(emailAccounts, { fields: [emailAccountSenders.accountId], references: [emailAccounts.id] }),
  user: one(users, { fields: [emailAccountSenders.userId], references: [users.id] }),
}))

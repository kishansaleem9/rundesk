import { pgTable, text, timestamp, uuid, boolean, jsonb, integer, type AnyPgColumn, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { spaces } from './spaces'
import { users } from './users'
// §2.8 gap 9 — chat and calls reference each other (a channel has calls; a
// message announces one). Both sides are thunked `() => …` references, which
// drizzle resolves after both modules have finished evaluating, so the cycle
// is fine — an eager reference on either side would not be.
import { calls } from './calls'

export const chatChannels = pgTable('chat_channels', {
  id:          uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  // Optional space scoping (Plan §6.1). Null = workspace-level channel. When set,
  // access also respects the space's visibility (private spaces need membership).
  // ON DELETE SET NULL so deleting a space reverts its channels to workspace-level
  // rather than discarding chat history.
  spaceId:     uuid('space_id').references(() => spaces.id, { onDelete: 'set null' }),
  name:        text('name').notNull(),
  description: text('description'),
  // One-line topic shown under the channel name (§A3.7). Kept apart from
  // `description`, which is the longer blurb in the info panel.
  topic:       text('topic'),
  // Optional channel icon (Plan §6.1) — an emoji or short token shown in the UI.
  icon:        text('icon'),
  isPrivate:   boolean('is_private').notNull().default(false),
  isDm:        boolean('is_dm').notNull().default(false),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  archivedAt:  timestamp('archived_at', { withTimezone: true }),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const chatChannelMembers = pgTable(
  'chat_channel_members',
  {
    id:        uuid('id').primaryKey().defaultRandom(),
    channelId: uuid('channel_id').notNull().references(() => chatChannels.id, { onDelete: 'cascade' }),
    userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }),
    // Delivery receipt (Plan §6.2): when the user's client last acknowledged
    // receiving this channel's messages. Mirrors lastReadAt — a message is
    // "Delivered" to a member whose lastDeliveredAt >= the message's createdAt,
    // and "Seen" once lastReadAt >= createdAt (Seen supersedes Delivered).
    lastDeliveredAt: timestamp('last_delivered_at', { withTimezone: true }),
    // Per-channel notification preference: 'all' | 'mentions' | 'none' (0039).
    notificationLevel: text('notification_level').$type<'all' | 'mentions' | 'none'>().notNull().default('all'),
    joinedAt:  timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqMember: uniqueIndex('chat_channel_members_unique').on(t.channelId, t.userId),
  }),
)

export const chatMessages = pgTable('chat_messages', {
  id:              uuid('id').primaryKey().defaultRandom(),
  channelId:       uuid('channel_id').notNull().references(() => chatChannels.id, { onDelete: 'cascade' }),
  authorId:        uuid('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  parentMessageId: uuid('parent_message_id').references((): AnyPgColumn => chatMessages.id, { onDelete: 'cascade' }),
  /**
   * §12 [15:00] — the message this one was forwarded from.
   *
   * "see, aap ke yahan pe aa gaya hai message ke maine aap ko message forward
   * kiya. Aap 'View Message' dekhoge to aap us group mein chale jaoge."
   * Forwarding copied the text and kept nothing, so the recipient saw a plain
   * message with no sign it came from elsewhere and no route back.
   *
   * SET NULL rather than CASCADE, unlike the thread parent above: deleting the
   * original must not delete every message anyone forwarded from it. The copy
   * survives, and loses only its link — which is the honest outcome, since the
   * thing it pointed at is gone.
   */
  forwardedFromId: uuid('forwarded_from_id').references((): AnyPgColumn => chatMessages.id, { onDelete: 'set null' }),
  /**
   * §2.8 gap 9 — the call this message announces, which makes it a call card
   * rather than a line of text.
   *
   * One nullable reference rather than a message-kind enum: there is exactly
   * one kind of non-text message today, and a column that answers "which call?"
   * answers "is this a card?" for free.
   *
   * SET NULL, like forwardedFromId above and for the same reason: deleting the
   * call must not delete the message that announced it. The channel should
   * still read "Hamda started a SyncUp" afterwards.
   */
  callId:          uuid('call_id').references(() => calls.id, { onDelete: 'set null' }),
  body:            text('body').notNull(),
  mentions:        jsonb('mentions').$type<Array<{ userId: string }>>(),
  editedAt:        timestamp('edited_at', { withTimezone: true }),
  pinnedAt:        timestamp('pinned_at', { withTimezone: true }),
  // Who pinned this message (Plan §6). Null when not pinned / unpinned.
  pinnedById:      uuid('pinned_by_id').references(() => users.id, { onDelete: 'set null' }),
  // Soft-delete tombstone (Plan §6): the row stays so threads/pins keep their
  // shape and the UI can show "message was deleted"; body is blanked on delete.
  deletedAt:       timestamp('deleted_at', { withTimezone: true }),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // §2.8 gap 9 — finding a channel's call cards, and resolving a card back to
  // its call. Declared here as well as in the migration: a database built by
  // `drizzle-kit push` reads only this file, and an index that exists on
  // migrated instances but not on fresh ones is the kind of difference that
  // shows up as "it's slow on staging" months later.
  byCall: index('chat_messages_call_idx').on(t.callId),
}))

// Chat message edit history (Plan §6.3). Each time a message is edited we
// snapshot the PRIOR body here so earlier versions survive the in-place edit.
// `editedAt` is the moment that previous version was superseded.
export const chatMessageEdits = pgTable(
  'chat_message_edits',
  {
    id:           uuid('id').primaryKey().defaultRandom(),
    messageId:    uuid('message_id').notNull().references((): AnyPgColumn => chatMessages.id, { onDelete: 'cascade' }),
    previousBody: text('previous_body').notNull(),
    editedAt:     timestamp('edited_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byMessage: index('chat_message_edits_message_idx').on(t.messageId),
  }),
)

export const chatMessageEditsRelations = relations(chatMessageEdits, ({ one }) => ({
  message: one(chatMessages, { fields: [chatMessageEdits.messageId], references: [chatMessages.id] }),
}))

// Files shared in chat (Plan §6.8). Uploaded to R2; the row holds metadata +
// the object key. Uploaded first (message_id null), then linked when the
// message is posted.
export const chatMessageAttachments = pgTable('chat_message_attachments', {
  id:          uuid('id').primaryKey().defaultRandom(),
  channelId:   uuid('channel_id').notNull().references(() => chatChannels.id, { onDelete: 'cascade' }),
  messageId:   uuid('message_id').references((): AnyPgColumn => chatMessages.id, { onDelete: 'cascade' }),
  fileName:    text('file_name').notNull(),
  contentType: text('content_type').notNull(),
  sizeBytes:   integer('size_bytes').notNull(),
  storageKey:  text('storage_key').notNull(),
  uploadedById: uuid('uploaded_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const chatMessageAttachmentsRelations = relations(chatMessageAttachments, ({ one }) => ({
  channel: one(chatChannels, { fields: [chatMessageAttachments.channelId], references: [chatChannels.id] }),
  message: one(chatMessages, { fields: [chatMessageAttachments.messageId], references: [chatMessages.id] }),
}))

export const chatMessageReactions = pgTable('chat_message_reactions', {
  id:        uuid('id').primaryKey().defaultRandom(),
  messageId: uuid('message_id').notNull().references(() => chatMessages.id, { onDelete: 'cascade' }),
  userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  emoji:     text('emoji').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Workspace-defined custom emoji (Plan §6): a :shortcode: mapped to an image,
// usable in reactions. Unique per workspace by shortcode.
export const chatCustomEmoji = pgTable(
  'chat_custom_emoji',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    shortcode:   text('shortcode').notNull(),
    imageUrl:    text('image_url').notNull(),
    // Set when the emoji was uploaded rather than linked (§A3.8): the R2 object
    // key, from which a fresh signed URL is minted on every read.
    storageKey:  text('storage_key'),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqShortcode: uniqueIndex('chat_custom_emoji_workspace_shortcode_unique').on(t.workspaceId, t.shortcode),
  }),
)

export const chatCustomEmojiRelations = relations(chatCustomEmoji, ({ one }) => ({
  workspace: one(workspaces, { fields: [chatCustomEmoji.workspaceId], references: [workspaces.id] }),
  creator:   one(users, { fields: [chatCustomEmoji.createdById], references: [users.id] }),
}))

// Per-user saved/bookmarked messages (private to each user, any channel).
export const chatMessageSaves = pgTable(
  'chat_message_saves',
  {
    id:        uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id').notNull().references(() => chatMessages.id, { onDelete: 'cascade' }),
    userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    // User-defined bookmark tags (Plan §6.7) for organizing/filtering saved
    // messages in the Saved panel. Empty array = untagged.
    tags:      text('tags').array().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqSave: uniqueIndex('chat_message_saves_unique').on(t.messageId, t.userId),
  }),
)

export const chatMessageSavesRelations = relations(chatMessageSaves, ({ one }) => ({
  message: one(chatMessages, { fields: [chatMessageSaves.messageId], references: [chatMessages.id] }),
  user:    one(users,        { fields: [chatMessageSaves.userId], references: [users.id] }),
}))

/**
 * §G11 [15:36] — "aap us ko ASSIGN bhi kar sakte ho".
 *
 * An assigned message is an action item on the message itself, not a task made
 * from it. The distinction is the whole point: creating a task moves the work
 * somewhere else and leaves the conversation behind, while assigning says
 * "this line, you, please" and stays in the thread where the context is. We
 * already had the first; the button labelled Assign did neither and appended a
 * mention token to the composer.
 *
 * Resolvable rather than deletable. "I did that" and "that was never mine" are
 * different answers, and an assignment that vanishes on completion takes the
 * record of who did it with it.
 */
export const chatMessageAssignments = pgTable(
  'chat_message_assignments',
  {
    id:           uuid('id').primaryKey().defaultRandom(),
    messageId:    uuid('message_id').notNull().references((): AnyPgColumn => chatMessages.id, { onDelete: 'cascade' }),
    assigneeId:   uuid('assignee_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    assignedById: uuid('assigned_by_id').references(() => users.id, { onDelete: 'set null' }),
    /** Optional deadline, same shape as the one on the create-task drawer. */
    dueAt:        timestamp('due_at', { withTimezone: true }),
    /** Stamped when the assignee (or the assigner) marks it done. */
    resolvedAt:   timestamp('resolved_at', { withTimezone: true }),
    resolvedById: uuid('resolved_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // One live assignment per person per message. Assigning the same line to
    // the same person twice is somebody pressing again, not a second job.
    uniqAssignee: uniqueIndex('chat_message_assignments_unique').on(t.messageId, t.assigneeId),
    // "What is assigned to me" — the read that makes the feature worth having.
    byAssignee: index('chat_message_assignments_assignee_idx').on(t.assigneeId, t.resolvedAt),
  }),
)

export const chatMessageAssignmentsRelations = relations(chatMessageAssignments, ({ one }) => ({
  message:  one(chatMessages, { fields: [chatMessageAssignments.messageId], references: [chatMessages.id] }),
  assignee: one(users,        { fields: [chatMessageAssignments.assigneeId], references: [users.id] }),
  assigner: one(users,        { fields: [chatMessageAssignments.assignedById], references: [users.id] }),
}))

/**
 * §G12 [17:13] — mute or follow one thread, without leaving the channel.
 *
 * Muting was channel-wide only, which is too blunt to be the answer she asked
 * for: silencing the channel to escape one loud thread also silences the
 * messages you are there for. Following is the same control pointed the other
 * way — stay on a thread you did not reply to.
 *
 * Only the exceptions live here. The default — you hear about a thread you
 * started or replied to — is still derived, so an untouched thread costs no
 * rows, and a row means somebody deliberately changed their mind about one.
 */
export const chatThreadFollows = pgTable(
  'chat_thread_follows',
  {
    id:              uuid('id').primaryKey().defaultRandom(),
    /** The thread's parent message — a thread has no id of its own. */
    parentMessageId: uuid('parent_message_id').notNull().references((): AnyPgColumn => chatMessages.id, { onDelete: 'cascade' }),
    userId:          uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    /** 'following' overrides silence; 'muted' overrides participation. */
    state:           text('state').$type<'following' | 'muted'>().notNull(),
    createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqFollow: uniqueIndex('chat_thread_follows_unique').on(t.parentMessageId, t.userId),
  }),
)

export const chatThreadFollowsRelations = relations(chatThreadFollows, ({ one }) => ({
  parent: one(chatMessages, { fields: [chatThreadFollows.parentMessageId], references: [chatMessages.id] }),
  user:   one(users,        { fields: [chatThreadFollows.userId], references: [users.id] }),
}))

// User-named channel groups for the chat rail (§A3.4). Per-user: the same
// shared channels get a personal arrangement, so renaming or reordering a
// bucket never touches anyone else's sidebar.
export const chatChannelGroups = pgTable(
  'chat_channel_groups',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    userId:      uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name:        text('name').notNull(),
    position:    integer('position').notNull().default(0),
    isCollapsed: boolean('is_collapsed').notNull().default(false),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byOwner: index('chat_channel_groups_owner_idx').on(t.workspaceId, t.userId),
  }),
)

// A channel's place in one of its owner's groups. Unique per (group, channel);
// the service also keeps a channel in at most one group per user, so the rail
// never renders it twice.
export const chatChannelGroupItems = pgTable(
  'chat_channel_group_items',
  {
    id:        uuid('id').primaryKey().defaultRandom(),
    groupId:   uuid('group_id').notNull().references(() => chatChannelGroups.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id').notNull().references(() => chatChannels.id, { onDelete: 'cascade' }),
    position:  integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqItem:  uniqueIndex('chat_channel_group_items_unique').on(t.groupId, t.channelId),
    byChannel: index('chat_channel_group_items_channel_idx').on(t.channelId),
  }),
)

export const chatChannelGroupsRelations = relations(chatChannelGroups, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [chatChannelGroups.workspaceId], references: [workspaces.id] }),
  owner:     one(users,      { fields: [chatChannelGroups.userId], references: [users.id] }),
  items:     many(chatChannelGroupItems),
}))

export const chatChannelGroupItemsRelations = relations(chatChannelGroupItems, ({ one }) => ({
  group:   one(chatChannelGroups, { fields: [chatChannelGroupItems.groupId], references: [chatChannelGroups.id] }),
  channel: one(chatChannels,      { fields: [chatChannelGroupItems.channelId], references: [chatChannels.id] }),
}))

export const chatChannelsRelations = relations(chatChannels, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [chatChannels.workspaceId], references: [workspaces.id] }),
  space:     one(spaces, { fields: [chatChannels.spaceId], references: [spaces.id] }),
  creator:   one(users, { fields: [chatChannels.createdById], references: [users.id] }),
  members:   many(chatChannelMembers),
  messages:  many(chatMessages),
}))

export const chatChannelMembersRelations = relations(chatChannelMembers, ({ one }) => ({
  channel: one(chatChannels, { fields: [chatChannelMembers.channelId], references: [chatChannels.id] }),
  user:    one(users,        { fields: [chatChannelMembers.userId], references: [users.id] }),
}))

export const chatMessagesRelations = relations(chatMessages, ({ one, many }) => ({
  channel:   one(chatChannels, { fields: [chatMessages.channelId], references: [chatChannels.id] }),
  author:    one(users,        { fields: [chatMessages.authorId],  references: [users.id] }),
  parent:    one(chatMessages, { fields: [chatMessages.parentMessageId], references: [chatMessages.id], relationName: 'thread' }),
  replies:   many(chatMessages, { relationName: 'thread' }),
  reactions: many(chatMessageReactions),
  edits:     many(chatMessageEdits),
}))

export const chatMessageReactionsRelations = relations(chatMessageReactions, ({ one }) => ({
  message: one(chatMessages, { fields: [chatMessageReactions.messageId], references: [chatMessages.id] }),
  user:    one(users,        { fields: [chatMessageReactions.userId], references: [users.id] }),
}))

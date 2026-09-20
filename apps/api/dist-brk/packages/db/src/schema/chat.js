"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatMessageReactionsRelations = exports.chatMessagesRelations = exports.chatChannelMembersRelations = exports.chatChannelsRelations = exports.chatChannelGroupItemsRelations = exports.chatChannelGroupsRelations = exports.chatChannelGroupItems = exports.chatChannelGroups = exports.chatThreadFollowsRelations = exports.chatThreadFollows = exports.chatMessageAssignmentsRelations = exports.chatMessageAssignments = exports.chatMessageSavesRelations = exports.chatMessageSaves = exports.chatCustomEmojiRelations = exports.chatCustomEmoji = exports.chatMessageReactions = exports.chatMessageAttachmentsRelations = exports.chatMessageAttachments = exports.chatMessageEditsRelations = exports.chatMessageEdits = exports.chatMessages = exports.chatChannelMembers = exports.chatChannels = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const workspaces_1 = require("./workspaces");
const spaces_1 = require("./spaces");
const users_1 = require("./users");
// §2.8 gap 9 — chat and calls reference each other (a channel has calls; a
// message announces one). Both sides are thunked `() => …` references, which
// drizzle resolves after both modules have finished evaluating, so the cycle
// is fine — an eager reference on either side would not be.
const calls_1 = require("./calls");
exports.chatChannels = (0, pg_core_1.pgTable)('chat_channels', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    // Optional space scoping (Plan §6.1). Null = workspace-level channel. When set,
    // access also respects the space's visibility (private spaces need membership).
    // ON DELETE SET NULL so deleting a space reverts its channels to workspace-level
    // rather than discarding chat history.
    spaceId: (0, pg_core_1.uuid)('space_id').references(() => spaces_1.spaces.id, { onDelete: 'set null' }),
    name: (0, pg_core_1.text)('name').notNull(),
    description: (0, pg_core_1.text)('description'),
    // One-line topic shown under the channel name (§A3.7). Kept apart from
    // `description`, which is the longer blurb in the info panel.
    topic: (0, pg_core_1.text)('topic'),
    // Optional channel icon (Plan §6.1) — an emoji or short token shown in the UI.
    icon: (0, pg_core_1.text)('icon'),
    isPrivate: (0, pg_core_1.boolean)('is_private').notNull().default(false),
    isDm: (0, pg_core_1.boolean)('is_dm').notNull().default(false),
    createdById: (0, pg_core_1.uuid)('created_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    archivedAt: (0, pg_core_1.timestamp)('archived_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
});
exports.chatChannelMembers = (0, pg_core_1.pgTable)('chat_channel_members', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    channelId: (0, pg_core_1.uuid)('channel_id').notNull().references(() => exports.chatChannels.id, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    lastReadAt: (0, pg_core_1.timestamp)('last_read_at', { withTimezone: true }),
    // Delivery receipt (Plan §6.2): when the user's client last acknowledged
    // receiving this channel's messages. Mirrors lastReadAt — a message is
    // "Delivered" to a member whose lastDeliveredAt >= the message's createdAt,
    // and "Seen" once lastReadAt >= createdAt (Seen supersedes Delivered).
    lastDeliveredAt: (0, pg_core_1.timestamp)('last_delivered_at', { withTimezone: true }),
    // Per-channel notification preference: 'all' | 'mentions' | 'none' (0039).
    notificationLevel: (0, pg_core_1.text)('notification_level').$type().notNull().default('all'),
    joinedAt: (0, pg_core_1.timestamp)('joined_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    uniqMember: (0, pg_core_1.uniqueIndex)('chat_channel_members_unique').on(t.channelId, t.userId),
}));
exports.chatMessages = (0, pg_core_1.pgTable)('chat_messages', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    channelId: (0, pg_core_1.uuid)('channel_id').notNull().references(() => exports.chatChannels.id, { onDelete: 'cascade' }),
    authorId: (0, pg_core_1.uuid)('author_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    parentMessageId: (0, pg_core_1.uuid)('parent_message_id').references(() => exports.chatMessages.id, { onDelete: 'cascade' }),
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
    forwardedFromId: (0, pg_core_1.uuid)('forwarded_from_id').references(() => exports.chatMessages.id, { onDelete: 'set null' }),
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
    callId: (0, pg_core_1.uuid)('call_id').references(() => calls_1.calls.id, { onDelete: 'set null' }),
    body: (0, pg_core_1.text)('body').notNull(),
    mentions: (0, pg_core_1.jsonb)('mentions').$type(),
    editedAt: (0, pg_core_1.timestamp)('edited_at', { withTimezone: true }),
    pinnedAt: (0, pg_core_1.timestamp)('pinned_at', { withTimezone: true }),
    // Who pinned this message (Plan §6). Null when not pinned / unpinned.
    pinnedById: (0, pg_core_1.uuid)('pinned_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    // Soft-delete tombstone (Plan §6): the row stays so threads/pins keep their
    // shape and the UI can show "message was deleted"; body is blanked on delete.
    deletedAt: (0, pg_core_1.timestamp)('deleted_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    // §2.8 gap 9 — finding a channel's call cards, and resolving a card back to
    // its call. Declared here as well as in the migration: a database built by
    // `drizzle-kit push` reads only this file, and an index that exists on
    // migrated instances but not on fresh ones is the kind of difference that
    // shows up as "it's slow on staging" months later.
    byCall: (0, pg_core_1.index)('chat_messages_call_idx').on(t.callId),
}));
// Chat message edit history (Plan §6.3). Each time a message is edited we
// snapshot the PRIOR body here so earlier versions survive the in-place edit.
// `editedAt` is the moment that previous version was superseded.
exports.chatMessageEdits = (0, pg_core_1.pgTable)('chat_message_edits', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    messageId: (0, pg_core_1.uuid)('message_id').notNull().references(() => exports.chatMessages.id, { onDelete: 'cascade' }),
    previousBody: (0, pg_core_1.text)('previous_body').notNull(),
    editedAt: (0, pg_core_1.timestamp)('edited_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    byMessage: (0, pg_core_1.index)('chat_message_edits_message_idx').on(t.messageId),
}));
exports.chatMessageEditsRelations = (0, drizzle_orm_1.relations)(exports.chatMessageEdits, ({ one }) => ({
    message: one(exports.chatMessages, { fields: [exports.chatMessageEdits.messageId], references: [exports.chatMessages.id] }),
}));
// Files shared in chat (Plan §6.8). Uploaded to R2; the row holds metadata +
// the object key. Uploaded first (message_id null), then linked when the
// message is posted.
exports.chatMessageAttachments = (0, pg_core_1.pgTable)('chat_message_attachments', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    channelId: (0, pg_core_1.uuid)('channel_id').notNull().references(() => exports.chatChannels.id, { onDelete: 'cascade' }),
    messageId: (0, pg_core_1.uuid)('message_id').references(() => exports.chatMessages.id, { onDelete: 'cascade' }),
    fileName: (0, pg_core_1.text)('file_name').notNull(),
    contentType: (0, pg_core_1.text)('content_type').notNull(),
    sizeBytes: (0, pg_core_1.integer)('size_bytes').notNull(),
    storageKey: (0, pg_core_1.text)('storage_key').notNull(),
    uploadedById: (0, pg_core_1.uuid)('uploaded_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
});
exports.chatMessageAttachmentsRelations = (0, drizzle_orm_1.relations)(exports.chatMessageAttachments, ({ one }) => ({
    channel: one(exports.chatChannels, { fields: [exports.chatMessageAttachments.channelId], references: [exports.chatChannels.id] }),
    message: one(exports.chatMessages, { fields: [exports.chatMessageAttachments.messageId], references: [exports.chatMessages.id] }),
}));
exports.chatMessageReactions = (0, pg_core_1.pgTable)('chat_message_reactions', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    messageId: (0, pg_core_1.uuid)('message_id').notNull().references(() => exports.chatMessages.id, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    emoji: (0, pg_core_1.text)('emoji').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
});
// Workspace-defined custom emoji (Plan §6): a :shortcode: mapped to an image,
// usable in reactions. Unique per workspace by shortcode.
exports.chatCustomEmoji = (0, pg_core_1.pgTable)('chat_custom_emoji', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    shortcode: (0, pg_core_1.text)('shortcode').notNull(),
    imageUrl: (0, pg_core_1.text)('image_url').notNull(),
    // Set when the emoji was uploaded rather than linked (§A3.8): the R2 object
    // key, from which a fresh signed URL is minted on every read.
    storageKey: (0, pg_core_1.text)('storage_key'),
    createdById: (0, pg_core_1.uuid)('created_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    uniqShortcode: (0, pg_core_1.uniqueIndex)('chat_custom_emoji_workspace_shortcode_unique').on(t.workspaceId, t.shortcode),
}));
exports.chatCustomEmojiRelations = (0, drizzle_orm_1.relations)(exports.chatCustomEmoji, ({ one }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.chatCustomEmoji.workspaceId], references: [workspaces_1.workspaces.id] }),
    creator: one(users_1.users, { fields: [exports.chatCustomEmoji.createdById], references: [users_1.users.id] }),
}));
// Per-user saved/bookmarked messages (private to each user, any channel).
exports.chatMessageSaves = (0, pg_core_1.pgTable)('chat_message_saves', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    messageId: (0, pg_core_1.uuid)('message_id').notNull().references(() => exports.chatMessages.id, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    // User-defined bookmark tags (Plan §6.7) for organizing/filtering saved
    // messages in the Saved panel. Empty array = untagged.
    tags: (0, pg_core_1.text)('tags').array().notNull().default([]),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    uniqSave: (0, pg_core_1.uniqueIndex)('chat_message_saves_unique').on(t.messageId, t.userId),
}));
exports.chatMessageSavesRelations = (0, drizzle_orm_1.relations)(exports.chatMessageSaves, ({ one }) => ({
    message: one(exports.chatMessages, { fields: [exports.chatMessageSaves.messageId], references: [exports.chatMessages.id] }),
    user: one(users_1.users, { fields: [exports.chatMessageSaves.userId], references: [users_1.users.id] }),
}));
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
exports.chatMessageAssignments = (0, pg_core_1.pgTable)('chat_message_assignments', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    messageId: (0, pg_core_1.uuid)('message_id').notNull().references(() => exports.chatMessages.id, { onDelete: 'cascade' }),
    assigneeId: (0, pg_core_1.uuid)('assignee_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    assignedById: (0, pg_core_1.uuid)('assigned_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    /** Optional deadline, same shape as the one on the create-task drawer. */
    dueAt: (0, pg_core_1.timestamp)('due_at', { withTimezone: true }),
    /** Stamped when the assignee (or the assigner) marks it done. */
    resolvedAt: (0, pg_core_1.timestamp)('resolved_at', { withTimezone: true }),
    resolvedById: (0, pg_core_1.uuid)('resolved_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    // One live assignment per person per message. Assigning the same line to
    // the same person twice is somebody pressing again, not a second job.
    uniqAssignee: (0, pg_core_1.uniqueIndex)('chat_message_assignments_unique').on(t.messageId, t.assigneeId),
    // "What is assigned to me" — the read that makes the feature worth having.
    byAssignee: (0, pg_core_1.index)('chat_message_assignments_assignee_idx').on(t.assigneeId, t.resolvedAt),
}));
exports.chatMessageAssignmentsRelations = (0, drizzle_orm_1.relations)(exports.chatMessageAssignments, ({ one }) => ({
    message: one(exports.chatMessages, { fields: [exports.chatMessageAssignments.messageId], references: [exports.chatMessages.id] }),
    assignee: one(users_1.users, { fields: [exports.chatMessageAssignments.assigneeId], references: [users_1.users.id] }),
    assigner: one(users_1.users, { fields: [exports.chatMessageAssignments.assignedById], references: [users_1.users.id] }),
}));
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
exports.chatThreadFollows = (0, pg_core_1.pgTable)('chat_thread_follows', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    /** The thread's parent message — a thread has no id of its own. */
    parentMessageId: (0, pg_core_1.uuid)('parent_message_id').notNull().references(() => exports.chatMessages.id, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    /** 'following' overrides silence; 'muted' overrides participation. */
    state: (0, pg_core_1.text)('state').$type().notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    uniqFollow: (0, pg_core_1.uniqueIndex)('chat_thread_follows_unique').on(t.parentMessageId, t.userId),
}));
exports.chatThreadFollowsRelations = (0, drizzle_orm_1.relations)(exports.chatThreadFollows, ({ one }) => ({
    parent: one(exports.chatMessages, { fields: [exports.chatThreadFollows.parentMessageId], references: [exports.chatMessages.id] }),
    user: one(users_1.users, { fields: [exports.chatThreadFollows.userId], references: [users_1.users.id] }),
}));
// User-named channel groups for the chat rail (§A3.4). Per-user: the same
// shared channels get a personal arrangement, so renaming or reordering a
// bucket never touches anyone else's sidebar.
exports.chatChannelGroups = (0, pg_core_1.pgTable)('chat_channel_groups', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    name: (0, pg_core_1.text)('name').notNull(),
    position: (0, pg_core_1.integer)('position').notNull().default(0),
    isCollapsed: (0, pg_core_1.boolean)('is_collapsed').notNull().default(false),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    byOwner: (0, pg_core_1.index)('chat_channel_groups_owner_idx').on(t.workspaceId, t.userId),
}));
// A channel's place in one of its owner's groups. Unique per (group, channel);
// the service also keeps a channel in at most one group per user, so the rail
// never renders it twice.
exports.chatChannelGroupItems = (0, pg_core_1.pgTable)('chat_channel_group_items', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    groupId: (0, pg_core_1.uuid)('group_id').notNull().references(() => exports.chatChannelGroups.id, { onDelete: 'cascade' }),
    channelId: (0, pg_core_1.uuid)('channel_id').notNull().references(() => exports.chatChannels.id, { onDelete: 'cascade' }),
    position: (0, pg_core_1.integer)('position').notNull().default(0),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    uniqItem: (0, pg_core_1.uniqueIndex)('chat_channel_group_items_unique').on(t.groupId, t.channelId),
    byChannel: (0, pg_core_1.index)('chat_channel_group_items_channel_idx').on(t.channelId),
}));
exports.chatChannelGroupsRelations = (0, drizzle_orm_1.relations)(exports.chatChannelGroups, ({ one, many }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.chatChannelGroups.workspaceId], references: [workspaces_1.workspaces.id] }),
    owner: one(users_1.users, { fields: [exports.chatChannelGroups.userId], references: [users_1.users.id] }),
    items: many(exports.chatChannelGroupItems),
}));
exports.chatChannelGroupItemsRelations = (0, drizzle_orm_1.relations)(exports.chatChannelGroupItems, ({ one }) => ({
    group: one(exports.chatChannelGroups, { fields: [exports.chatChannelGroupItems.groupId], references: [exports.chatChannelGroups.id] }),
    channel: one(exports.chatChannels, { fields: [exports.chatChannelGroupItems.channelId], references: [exports.chatChannels.id] }),
}));
exports.chatChannelsRelations = (0, drizzle_orm_1.relations)(exports.chatChannels, ({ one, many }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.chatChannels.workspaceId], references: [workspaces_1.workspaces.id] }),
    space: one(spaces_1.spaces, { fields: [exports.chatChannels.spaceId], references: [spaces_1.spaces.id] }),
    creator: one(users_1.users, { fields: [exports.chatChannels.createdById], references: [users_1.users.id] }),
    members: many(exports.chatChannelMembers),
    messages: many(exports.chatMessages),
}));
exports.chatChannelMembersRelations = (0, drizzle_orm_1.relations)(exports.chatChannelMembers, ({ one }) => ({
    channel: one(exports.chatChannels, { fields: [exports.chatChannelMembers.channelId], references: [exports.chatChannels.id] }),
    user: one(users_1.users, { fields: [exports.chatChannelMembers.userId], references: [users_1.users.id] }),
}));
exports.chatMessagesRelations = (0, drizzle_orm_1.relations)(exports.chatMessages, ({ one, many }) => ({
    channel: one(exports.chatChannels, { fields: [exports.chatMessages.channelId], references: [exports.chatChannels.id] }),
    author: one(users_1.users, { fields: [exports.chatMessages.authorId], references: [users_1.users.id] }),
    parent: one(exports.chatMessages, { fields: [exports.chatMessages.parentMessageId], references: [exports.chatMessages.id], relationName: 'thread' }),
    replies: many(exports.chatMessages, { relationName: 'thread' }),
    reactions: many(exports.chatMessageReactions),
    edits: many(exports.chatMessageEdits),
}));
exports.chatMessageReactionsRelations = (0, drizzle_orm_1.relations)(exports.chatMessageReactions, ({ one }) => ({
    message: one(exports.chatMessages, { fields: [exports.chatMessageReactions.messageId], references: [exports.chatMessages.id] }),
    user: one(users_1.users, { fields: [exports.chatMessageReactions.userId], references: [users_1.users.id] }),
}));
//# sourceMappingURL=chat.js.map
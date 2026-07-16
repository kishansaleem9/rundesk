import { pgTable, text, timestamp, uuid, boolean, jsonb, integer, type AnyPgColumn, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { spaces } from './spaces'
import { users } from './users'

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
})

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
}))

export const chatMessageReactionsRelations = relations(chatMessageReactions, ({ one }) => ({
  message: one(chatMessages, { fields: [chatMessageReactions.messageId], references: [chatMessages.id] }),
  user:    one(users,        { fields: [chatMessageReactions.userId], references: [users.id] }),
}))

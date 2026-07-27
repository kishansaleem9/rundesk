export type ChatChannel = {
  id: string
  name: string
  description?: string | null
  // Optional channel icon (emoji / short token) — Plan §6.1.
  icon?: string | null
  // Space scoping (Plan §6.1): null = workspace-level channel.
  spaceId?: string | null
  // Set once the channel is archived (Plan §6.1).
  archivedAt?: string | null
  isPrivate: boolean
  isDm: boolean
  createdById?: string | null
  joined: boolean
  unreadCount?: number
  lastReadAt?: string | null
  notificationLevel?: 'all' | 'mentions' | 'none'
  /** Share & Permissions level when reached through a grant; 'view' is read-only. */
  accessLevel?: 'view' | 'comment' | 'edit' | 'admin'
  dmPeerId?: string
  dmPeerName?: string | null
  dmPeerAvatarUrl?: string | null
  // Group DMs (§6.2): every other participant + a combined label.
  dmIsGroup?: boolean
  dmPeers?: Array<{ userId: string; displayName: string | null; avatarUrl: string | null }>
  dmLabel?: string | null
}

export type ChatMessage = {
  id: string
  channelId: string
  authorId: string
  authorName?: string | null
  authorAvatarUrl?: string | null
  body: string
  parentMessageId?: string | null
  editedAt?: string | null
  createdAt: string
  // Thread stats (Plan §6.4): reply count + latest reply timestamp on the parent.
  replyCount?: number
  lastReplyAt?: string | null
  reactions?: Array<{
    emoji: string
    count: number
    reacted: boolean
    // Who reacted (Plan §6.5) — id + display name, for the pill tooltip.
    users?: Array<{ id: string; name: string }>
  }>
  attachments?: ChatAttachment[]
}

// Message edit history (Plan §6.3): prior versions newest-first plus the live one.
export type ChatMessageEdit = { id: string; previousBody: string; editedAt: string }
export type ChatMessageEditHistory = {
  messageId: string
  current: { body: string; editedAt: string | null }
  edits: ChatMessageEdit[]
}

export type ChatAttachment = {
  id: string
  fileName: string
  contentType: string
  sizeBytes: number
  storageKey?: string
  url: string
}

export type ChatMember = {
  userId: string
  displayName: string
  email: string
}

// A workspace space, used to scope new channels and group space channels in the
// sidebar (Plan §6.1).
export type ChatSpace = {
  id: string
  name: string
  icon?: string | null
}

export type ChatChannel = {
  id: string
  name: string
  description?: string | null
  isPrivate: boolean
  isDm: boolean
  createdById?: string | null
  joined: boolean
  unreadCount?: number
  lastReadAt?: string | null
  notificationLevel?: 'all' | 'mentions' | 'none'
  dmPeerId?: string
  dmPeerName?: string | null
  dmPeerAvatarUrl?: string | null
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
  reactions?: Array<{
    emoji: string
    count: number
    reacted: boolean
  }>
  attachments?: ChatAttachment[]
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

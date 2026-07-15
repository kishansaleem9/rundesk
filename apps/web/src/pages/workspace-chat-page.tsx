import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Card, cn, toast } from '@rundesk/ui'
import { ChatSidebar } from '../components/chat/chat-sidebar'
import { ChatHeader } from '../components/chat/chat-header'
import { AddPeopleDialog } from '../components/chat/add-people-dialog'
import { ChatComposer, ThreadReplyComposer } from '../components/chat/chat-composer'
import {
  formatDateDivider,
  formatMessageTime,
  shouldShowDateDivider,
  shouldShowMessageHeader,
} from '../components/chat/chat-utils'
import {
  Hash,
  Users,
  Smile,
  Sparkles,
  ListTodo,
  ThumbsUp,
  Reply,
  Forward,
  Bookmark,
  UserPlus,
  Pin,
  PinOff,
  Pencil,
  Trash2,
  X,
} from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { getRealtimeSocket } from '../lib/realtime'
import { useAuthStore } from '../store/auth'
import { MentionText } from '../components/mention-text'
import { ChatMessageBody } from '../components/chat/chat-message-body'
import { ChatAttachmentList } from '../components/chat/chat-attachments'

type Channel = {
  id: string
  name: string
  description?: string | null
  isPrivate: boolean
  isDm: boolean
  joined: boolean
  unreadCount?: number
  lastReadAt?: string | null
  dmPeerId?: string
  dmPeerName?: string | null
  dmPeerAvatarUrl?: string | null
  dmIsGroup?: boolean
  dmPeers?: Array<{ userId: string; displayName: string | null; avatarUrl: string | null }>
  dmLabel?: string | null
}

type WorkspaceMember = {
  userId: string
  displayName: string
  email: string
}

type PendingInvite = {
  id: string
  email: string
  role: string
  status: 'pending'
  expiresAt: string
}

type Message = {
  id: string
  channelId: string
  authorId: string
  authorName?: string | null
  authorAvatarUrl?: string | null
  body: string
  parentMessageId?: string | null
  editedAt?: string | null
  pinnedAt?: string | null
  pinnedById?: string | null
  pinnedByName?: string | null
  deletedAt?: string | null
  createdAt: string
  reactions?: Array<{
    emoji: string
    count: number
    reacted: boolean
  }>
  attachments?: Array<{
    id: string
    fileName: string
    contentType: string
    sizeBytes: number
    url: string
  }>
}

type PendingChatAttachment = {
  id: string
  fileName: string
  contentType: string
  sizeBytes: number
  url: string
}

/** Hard cap on a single chat attachment (Plan §6.8) — mirrors the API limit. */
const MAX_CHAT_ATTACHMENT_BYTES = 100 * 1024 * 1024 // 100 MB

type CustomEmoji = { id: string; shortcode: string; imageUrl: string; createdById?: string | null }

type MemberProfileStats = {
  recentMessages: Message[]
  recentReplies: Message[]
  totalMessages: number
}

type ProfileTask = {
  id: string
  title: string
  status: string
  priority: string
  dueDate: string | null
  updatedAt: string
  listId: string
  listName: string
  projectId: string
  projectName: string
  spaceId: string
  spaceName: string
}

type MemberActivityItem = {
  id: string
  channelId: string
  channelName: string
  body: string
  parentMessageId?: string | null
  createdAt: string
}

export function ChatPage() {
  const { workspaceId } = useParams({ from: '/app/$workspaceId/chat' })
  const deepLink = useSearch({ from: '/app/$workspaceId/chat' }) as { channel?: string; message?: string }
  const navigate = useNavigate()
  const qc = useQueryClient()
  const me = useAuthStore((s) => s.user)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const consumedDeepLinkRef = useRef<string | null>(null)
  const [addPeopleOpen, setAddPeopleOpen] = useState(false)
  const [input, setInput] = useState('')
  // Files uploaded (to R2) and awaiting attachment to the next sent message (§6.8).
  const [pendingAttachments, setPendingAttachments] = useState<PendingChatAttachment[]>([])
  const [uploadingFiles, setUploadingFiles] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPrivate, setNewPrivate] = useState(false)
  const [startingDm, setStartingDm] = useState(false)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [threadParentId, setThreadParentId] = useState<string | null>(null)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingBody, setEditingBody] = useState('')
  const [showPinnedPanel, setShowPinnedPanel] = useState(false)
  const [showSavedPanel, setShowSavedPanel] = useState(false)
  const [profileUserId, setProfileUserId] = useState<string | null>(null)
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null)
  const [emojiManagerOpen, setEmojiManagerOpen] = useState(false)
  const [newEmojiCode, setNewEmojiCode] = useState('')
  const [newEmojiUrl, setNewEmojiUrl] = useState('')
  const [profileTab, setProfileTab] = useState<'activity' | 'tasks' | 'comments'>('activity')
  const [forwardPickerFor, setForwardPickerFor] = useState<string | null>(null)
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null)
  const [channelSearch, setChannelSearch] = useState('')
  const [messageSearch, setMessageSearch] = useState('')
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const channelsQuery = useQuery({
    queryKey: ['chat-channels', workspaceId],
    queryFn: () => api<Channel[]>(`/workspaces/${workspaceId}/chat/channels`),
  })
  const channels = channelsQuery.data ?? []
  const publicChannels = channels.filter((c) => !c.isDm)
  const dmChannels = channels.filter((c) => c.isDm)

  const membersQuery = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => api<WorkspaceMember[]>(`/workspaces/${workspaceId}/members`),
  })
  const pendingInvitesQuery = useQuery({
    queryKey: ['workspace-invitations', workspaceId],
    queryFn: () => api<PendingInvite[]>(`/invitations/workspace/${workspaceId}`),
  })
  const dmCandidates = (membersQuery.data ?? []).filter((m) => m.userId !== me?.id)
  const pendingInvites = pendingInvitesQuery.data ?? []
  const mentionCandidates = (membersQuery.data ?? []).filter((m) =>
    (m.displayName || m.email).toLowerCase().includes(input.slice(input.lastIndexOf('@') + 1).toLowerCase()),
  )
  const showMentions = input.includes('@') && input[input.length - 1] !== ' '

  useEffect(() => {
    if (channels.length === 0) return
    // Deep-link (inbox → chat): open the linked channel once (Plan §6).
    if (deepLink.channel && consumedDeepLinkRef.current !== deepLink.channel) {
      const linked = channels.find((c) => c.id === deepLink.channel)
      if (linked) {
        consumedDeepLinkRef.current = deepLink.channel
        setSelectedId(linked.id)
        return
      }
    }
    if (!selectedId) {
      const general = channels.find((c) => c.name === 'general') ?? channels[0]
      setSelectedId(general.id)
    }
  }, [channels, selectedId, deepLink.channel])

  const selectedChannel = useMemo(
    () => channels.find((c) => c.id === selectedId) ?? null,
    [channels, selectedId],
  )
  const channelMembersQuery = useQuery({
    queryKey: ['chat-channel-members', selectedId],
    queryFn: () => api<Array<{ userId: string; displayName: string; email: string }>>(`/chat/channels/${selectedId}/members`),
    enabled: !!selectedId && !selectedChannel?.isDm,
  })
  const receiptsQuery = useQuery({
    queryKey: ['chat-receipts', selectedId],
    queryFn: () =>
      api<Array<{ userId: string; displayName: string; lastReadAt: string | null }>>(`/chat/channels/${selectedId}/receipts`),
    enabled: !!selectedId,
    refetchInterval: 20000,
  })
  const customEmojiQuery = useQuery({
    queryKey: ['chat-custom-emoji', workspaceId],
    queryFn: () => api<CustomEmoji[]>(`/chat/workspaces/${workspaceId}/custom-emoji`),
  })
  const customEmoji = customEmojiQuery.data ?? []
  const emojiByCode = useMemo(() => new Map(customEmoji.map((e) => [e.shortcode, e.imageUrl])), [customEmoji])

  const messagesQuery = useQuery({
    queryKey: ['chat-messages', selectedId],
    queryFn: () => api<Message[]>(`/chat/channels/${selectedId}/messages?limit=100`),
    enabled: !!selectedId,
  })
  const messages = messagesQuery.data ?? []

  // Once the linked channel's messages are loaded, scroll to + highlight the
  // deep-linked message (reuses the existing highlight machinery).
  useEffect(() => {
    if (!deepLink.message || !deepLink.channel) return
    if (selectedId !== deepLink.channel) return
    if (!messages.some((m) => m.id === deepLink.message)) return
    setHighlightedMessageId(deepLink.message)
  }, [deepLink.message, deepLink.channel, selectedId, messages])

  // Read receipts (Plan §6): who has seen the latest message. A member has seen
  // it when their lastReadAt is at/after that message's timestamp.
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null
  const seenByNames = useMemo(() => {
    if (!lastMessage) return [] as string[]
    return (receiptsQuery.data ?? [])
      .filter(
        (r) =>
          r.userId !== me?.id &&
          r.userId !== lastMessage.authorId &&
          r.lastReadAt &&
          new Date(r.lastReadAt).getTime() >= new Date(lastMessage.createdAt).getTime(),
      )
      .map((r) => r.displayName)
      .filter(Boolean)
  }, [lastMessage, receiptsQuery.data, me?.id])

  const pinnedQuery = useQuery({
    queryKey: ['chat-pinned', selectedId],
    queryFn: () => api<Message[]>(`/chat/channels/${selectedId}/pinned`),
    enabled: !!selectedId && showPinnedPanel,
  })
  const pinnedMessages = pinnedQuery.data ?? []
  const savedQuery = useQuery({
    queryKey: ['chat-saved', workspaceId],
    queryFn: () =>
      api<Array<Message & { channelName?: string; savedAt?: string }>>(
        `/workspaces/${workspaceId}/chat/saved`,
      ),
    enabled: !!workspaceId,
  })
  const savedMessages = savedQuery.data ?? []
  const savedIds = useMemo(() => new Set(savedMessages.map((m) => m.id)), [savedMessages])
  const rootMessages = useMemo(() => messages.filter((m) => !m.parentMessageId), [messages])
  const visibleRootMessages = useMemo(() => {
    const q = messageSearch.trim().toLowerCase()
    if (!q) return rootMessages
    return rootMessages.filter(
      (m) =>
        m.body.toLowerCase().includes(q) || (m.authorName ?? '').toLowerCase().includes(q),
    )
  }, [rootMessages, messageSearch])
  const repliesByParent = useMemo(() => {
    const map = new Map<string, Message[]>()
    for (const message of messages) {
      if (!message.parentMessageId) continue
      const arr = map.get(message.parentMessageId) ?? []
      arr.push(message)
      map.set(message.parentMessageId, arr)
    }
    return map
  }, [messages])
  const threadParent = threadParentId ? messages.find((m) => m.id === threadParentId) ?? null : null
  const threadReplies = threadParentId ? repliesByParent.get(threadParentId) ?? [] : []
  const namesById = useMemo(
    () => Object.fromEntries((membersQuery.data ?? []).map((m) => [m.userId, m.displayName || m.email])),
    [membersQuery.data],
  )
  const selectedProfile = useMemo(
    () => (membersQuery.data ?? []).find((m) => m.userId === profileUserId) ?? null,
    [membersQuery.data, profileUserId],
  )
  const profileTasksQuery = useQuery({
    queryKey: ['profile-member-tasks', workspaceId, profileUserId],
    queryFn: () => api<ProfileTask[]>(`/tasks/workspace/${workspaceId}/members/${profileUserId}`),
    enabled: !!workspaceId && !!profileUserId,
  })
  const profileActivityQuery = useQuery({
    queryKey: ['profile-member-activity', workspaceId, profileUserId],
    queryFn: () => api<MemberActivityItem[]>(`/workspaces/${workspaceId}/chat/members/${profileUserId}/activity?limit=40`),
    enabled: !!workspaceId && !!profileUserId,
  })
  const profileStats = useMemo<MemberProfileStats>(() => {
    const activity = profileActivityQuery.data ?? []
    const asMessages: Message[] = activity.map((item) => ({
      id: item.id,
      channelId: item.channelId,
      authorId: profileUserId ?? '',
      body: item.body,
      parentMessageId: item.parentMessageId ?? null,
      createdAt: item.createdAt,
    }))
    return {
      recentMessages: asMessages.filter((m) => !m.parentMessageId).slice(0, 8),
      recentReplies: asMessages.filter((m) => !!m.parentMessageId).slice(0, 8),
      totalMessages: asMessages.length,
    }
  }, [profileActivityQuery.data, profileUserId])

  useEffect(() => {
    const socket = getRealtimeSocket()
    socket.emit('subscribe', { rooms: [`workspace:${workspaceId}`] })
    const onEvent = (event: {
      type: string
      workspaceId?: string
      channelId?: string
      message?: Message
      messageId?: string
      patch?: Partial<Message>
    }) => {
      if (event.workspaceId && event.workspaceId !== workspaceId) return
      if (event.type === 'chat.message.created' && event.message) {
        const msg = event.message
        qc.setQueryData<Message[] | undefined>(['chat-messages', msg.channelId], (prev) => {
          if (!prev) return prev
          if (prev.some((m) => m.id === msg.id)) return prev
          return [...prev, msg]
        })
      }
      if (event.type === 'chat.message.updated' && event.channelId && event.messageId) {
        qc.setQueryData<Message[] | undefined>(['chat-messages', event.channelId], (prev) => {
          if (!prev) return prev
          return prev.map((m) => (m.id === event.messageId ? { ...m, ...(event.patch ?? {}) } : m))
        })
      }
      if (event.type === 'chat.message.deleted' && event.channelId && event.messageId) {
        qc.setQueryData<Message[] | undefined>(['chat-messages', event.channelId], (prev) =>
          prev ? prev.filter((m) => m.id !== event.messageId) : prev,
        )
      }
      if (event.type === 'chat.channel.created') {
        qc.invalidateQueries({ queryKey: ['chat-channels', workspaceId] })
      }
      if (event.type === 'chat.channel.members.updated' && event.channelId) {
        qc.invalidateQueries({ queryKey: ['chat-channel-members', event.channelId] })
      }
      if (event.type === 'chat.reaction.toggled' && event.channelId) {
        qc.invalidateQueries({ queryKey: ['chat-messages', event.channelId] })
      }
    }
    socket.on('event', onEvent)
    return () => {
      socket.off('event', onEvent)
    }
  }, [workspaceId, qc])

  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages.length, selectedId])

  // Mark the open channel read once its messages load (and whenever new ones
  // arrive while it's open), then refresh the channel list to clear its badge.
  useEffect(() => {
    if (!selectedId || messages.length === 0) return
    let cancelled = false
    void api(`/chat/channels/${selectedId}/read`, { method: 'POST' })
      .then(() => {
        if (!cancelled) {
          void qc.invalidateQueries({ queryKey: ['chat-channels', workspaceId] })
          void qc.invalidateQueries({ queryKey: ['chat-unread', workspaceId] })
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [selectedId, messages.length, workspaceId, qc])

  useEffect(() => {
    if (!highlightedMessageId) return
    const target = messageRefs.current[highlightedMessageId]
    if (!target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const timer = setTimeout(() => setHighlightedMessageId((prev) => (prev === highlightedMessageId ? null : prev)), 1800)
    return () => clearTimeout(timer)
  }, [highlightedMessageId, messages, selectedId])

  const sendMutation = useMutation({
    mutationFn: ({ body, parentMessageId, attachmentIds }: { body: string; parentMessageId?: string; attachmentIds?: string[] }) =>
      api<Message>(`/chat/channels/${selectedId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body, parentMessageId, attachmentIds: attachmentIds?.length ? attachmentIds : undefined }),
      }),
    onSuccess: (msg) => {
      qc.setQueryData<Message[] | undefined>(['chat-messages', msg.channelId], (prev) =>
        prev && !prev.some((m) => m.id === msg.id) ? [...prev, msg] : prev,
      )
      setInput('')
      setReplyTo(null)
      setPendingAttachments([])
    },
  })

  // Upload picked files to R2 (presign → PUT → record) and queue them for the
  // next sent message (Plan §6.8). Runs sequentially; a failure is surfaced but
  // doesn't drop already-uploaded files.
  const uploadFiles = async (files: File[]) => {
    if (!selectedId) return
    setUploadingFiles(true)
    try {
      for (const file of files) {
        if (file.size > MAX_CHAT_ATTACHMENT_BYTES) {
          toast.error(`"${file.name}" exceeds the ${MAX_CHAT_ATTACHMENT_BYTES / (1024 * 1024)} MB limit`)
          continue
        }
        const contentType = file.type || 'application/octet-stream'
        try {
          const presign = await api<{ uploadUrl: string; storageKey: string }>(
            `/chat/channels/${selectedId}/attachments/presign`,
            { method: 'POST', body: { fileName: file.name, contentType, sizeBytes: file.size } },
          )
          const putRes = await fetch(presign.uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': contentType },
            body: file,
          })
          if (!putRes.ok) throw new Error(`Upload failed (${putRes.status})`)
          const rec = await api<PendingChatAttachment>(`/chat/channels/${selectedId}/attachments`, {
            method: 'POST',
            body: { fileName: file.name, storageKey: presign.storageKey, contentType, sizeBytes: file.size },
          })
          setPendingAttachments((prev) => [...prev, rec])
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : `Could not upload "${file.name}"`)
        }
      }
    } finally {
      setUploadingFiles(false)
    }
  }

  const createChannelMutation = useMutation({
    mutationFn: (data: { name: string; isPrivate: boolean }) =>
      api<Channel>(`/workspaces/${workspaceId}/chat/channels`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: (channel) => {
      qc.invalidateQueries({ queryKey: ['chat-channels', workspaceId] })
      setSelectedId(channel.id)
      setCreating(false)
      setNewName('')
      setNewPrivate(false)
    },
  })

  const createDmMutation = useMutation({
    mutationFn: (peerUserId: string) =>
      api<Channel>(`/workspaces/${workspaceId}/chat/dms`, {
        method: 'POST',
        body: JSON.stringify({ peerUserId }),
      }),
    onSuccess: async (channel) => {
      await qc.invalidateQueries({ queryKey: ['chat-channels', workspaceId] })
      setSelectedId(channel.id)
      setStartingDm(false)
    },
  })

  // Group DM (§6.2): 2+ peers → a shared DM channel. Reuses the same success
  // path as the 1:1 DM (select the channel, close the composer).
  const createGroupDmMutation = useMutation({
    mutationFn: (peerUserIds: string[]) =>
      api<Channel>(`/workspaces/${workspaceId}/chat/group-dms`, {
        method: 'POST',
        body: JSON.stringify({ peerUserIds }),
      }),
    onSuccess: async (channel) => {
      await qc.invalidateQueries({ queryKey: ['chat-channels', workspaceId] })
      setSelectedId(channel.id)
      setStartingDm(false)
    },
  })

  // One entry point for the sidebar composer: 1 peer → 1:1 DM, 2+ → group DM.
  const startDm = (userIds: string[]) => {
    if (userIds.length === 0) return
    if (userIds.length === 1) createDmMutation.mutate(userIds[0])
    else createGroupDmMutation.mutate(userIds)
  }

  const toggleReactionMutation = useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) =>
      api(`/chat/messages/${messageId}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      }),
    onSuccess: () => {
      if (selectedId) {
        qc.invalidateQueries({ queryKey: ['chat-messages', selectedId] })
      }
    },
  })

  const addCustomEmojiMutation = useMutation({
    mutationFn: ({ shortcode, imageUrl }: { shortcode: string; imageUrl: string }) =>
      api(`/chat/workspaces/${workspaceId}/custom-emoji`, { method: 'POST', body: JSON.stringify({ shortcode, imageUrl }) }),
    onSuccess: () => {
      setNewEmojiCode('')
      setNewEmojiUrl('')
      qc.invalidateQueries({ queryKey: ['chat-custom-emoji', workspaceId] })
      toast.success('Custom emoji added')
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not add emoji'),
  })

  const deleteCustomEmojiMutation = useMutation({
    mutationFn: (emojiId: string) => api(`/chat/custom-emoji/${emojiId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chat-custom-emoji', workspaceId] }),
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not remove emoji'),
  })

  const forwardMutation = useMutation({
    mutationFn: ({ channelId, body }: { channelId: string; body: string }) =>
      api<Message>(`/chat/channels/${channelId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['chat-messages', vars.channelId] })
      setForwardPickerFor(null)
    },
  })

  const createTaskFromMessage = useMutation({
    mutationFn: async (messageId: string) => {
      // Resolve a target list (first space → first project → first list).
      const spaces = await api<Array<{ id: string }>>(`/spaces/workspace/${workspaceId}`)
      if (!spaces[0]) throw new Error('Create a space and list first')
      const projects = await api<Array<{ id: string }>>(`/projects/space/${spaces[0].id}`)
      if (!projects[0]) throw new Error('Create a project and list first')
      const lists = await api<Array<{ id: string }>>(`/lists/project/${projects[0].id}`)
      if (!lists[0]) throw new Error('Create a list first')
      return api(`/chat/messages/${messageId}/create-task`, { method: 'POST', body: { listId: lists[0].id } })
    },
    onSuccess: () => toast.success('Task created from message'),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : (err as Error).message),
  })

  const setPinnedMutation = useMutation({
    mutationFn: ({ messageId, pinned }: { messageId: string; pinned: boolean }) =>
      api<Message>(`/chat/messages/${messageId}/pin`, {
        method: pinned ? 'POST' : 'DELETE',
      }),
    onSuccess: () => {
      // The server also emits chat.message.updated, but invalidate so the
      // acting user sees the pin state flip immediately.
      if (selectedId) {
        qc.invalidateQueries({ queryKey: ['chat-messages', selectedId] })
        qc.invalidateQueries({ queryKey: ['chat-pinned', selectedId] })
      }
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not update pin')
    },
  })

  const editMessageMutation = useMutation({
    mutationFn: ({ messageId, body }: { messageId: string; body: string }) =>
      api(`/chat/messages/${messageId}`, { method: 'PATCH', body: JSON.stringify({ body }) }),
    onSuccess: () => {
      setEditingMessageId(null)
      setEditingBody('')
      if (selectedId) qc.invalidateQueries({ queryKey: ['chat-messages', selectedId] })
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not edit message'),
  })

  const deleteMessageMutation = useMutation({
    mutationFn: (messageId: string) => api(`/chat/messages/${messageId}`, { method: 'DELETE' }),
    onSuccess: () => {
      if (selectedId) {
        qc.invalidateQueries({ queryKey: ['chat-messages', selectedId] })
        qc.invalidateQueries({ queryKey: ['chat-pinned', selectedId] })
      }
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not delete message'),
  })

  const setSavedMutation = useMutation({
    mutationFn: ({ messageId, saved }: { messageId: string; saved: boolean }) =>
      api(`/chat/messages/${messageId}/save`, { method: saved ? 'POST' : 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-saved', workspaceId] })
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not update saved')
    },
  })

  const leaveChannelMutation = useMutation({
    mutationFn: (channelId: string) =>
      api(`/chat/channels/${channelId}/leave`, { method: 'POST' }),
    onSuccess: async (_, channelId) => {
      await qc.invalidateQueries({ queryKey: ['chat-channels', workspaceId] })
      toast.success('You left the channel')
      if (selectedId === channelId) setSelectedId(null)
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not leave channel')
    },
  })

  const removeMemberMutation = useMutation({
    mutationFn: ({ channelId, userId }: { channelId: string; userId: string }) =>
      api(`/chat/channels/${channelId}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: async (_, { channelId }) => {
      await qc.invalidateQueries({ queryKey: ['chat-channel-members', channelId] })
      toast.success('Member removed from channel')
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not remove member')
    },
  })

  const setNotificationLevel = useMutation({
    mutationFn: ({ channelId, level }: { channelId: string; level: 'all' | 'mentions' | 'none' }) =>
      api(`/chat/channels/${channelId}/notifications`, { method: 'PATCH', body: { level } }),
    onSuccess: async (_, { level }) => {
      await qc.invalidateQueries({ queryKey: ['chat-channels', workspaceId] })
      toast.success(level === 'none' ? 'Channel muted' : level === 'mentions' ? 'Notifying on @mentions only' : 'Notifying on all messages')
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not update notifications')
    },
  })

  const handleSend = () => {
    const body = input.trim()
    if (!selectedId) return
    // Allow sending with text OR at least one uploaded attachment (§6.8).
    if (!body && pendingAttachments.length === 0) return
    if (uploadingFiles) return
    sendMutation.mutate({
      body,
      parentMessageId: replyTo?.id ?? undefined,
      attachmentIds: pendingAttachments.map((a) => a.id),
    })
  }

  const handleThreadReply = (body: string) => {
    const trimmed = body.trim()
    if (!trimmed || !threadParentId) return
    sendMutation.mutate({ body: trimmed, parentMessageId: threadParentId })
  }

  const openThreadFromActivity = async (entry: Message) => {
    const parentId = entry.parentMessageId ?? entry.id
    const targetChannelId = entry.channelId
    setSelectedId(targetChannelId)
    setReplyTo(null)
    setHighlightedMessageId(entry.id)

    try {
      const thread = await api<{ parent: Message; replies: Message[] }>(`/chat/messages/${parentId}/thread`)
      qc.setQueryData<Message[] | undefined>(['chat-messages', targetChannelId], (prev) => {
        const list = prev ?? []
        const incoming = [thread.parent, ...thread.replies]
        const byId = new Map(list.map((m) => [m.id, m]))
        for (const msg of incoming) byId.set(msg.id, msg)
        return [...byId.values()].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      })
    } catch {
      // If fetch fails we still switch channel and try opening thread context.
    }
    setThreadParentId(parentId)
  }

  const channelLabel = selectedChannel?.isDm
    ? selectedChannel.dmLabel ?? selectedChannel.dmPeerName ?? 'DM'
    : selectedChannel
      ? `#${selectedChannel.name}`
      : ''

  return (
    <div className="h-full flex bg-background">
      <ChatSidebar
        channels={publicChannels}
        dmChannels={dmChannels}
        workspaceId={workspaceId}
        selectedId={selectedId}
        onSelectChannel={setSelectedId}
        channelSearch={channelSearch}
        onChannelSearchChange={setChannelSearch}
        creating={creating}
        onToggleCreate={() => setCreating((v) => !v)}
        newName={newName}
        onNewNameChange={setNewName}
        newPrivate={newPrivate}
        onNewPrivateChange={setNewPrivate}
        onCreateChannel={() => {
          if (!newName.trim()) return
          createChannelMutation.mutate({ name: newName.trim(), isPrivate: newPrivate })
        }}
        createPending={createChannelMutation.isPending}
        startingDm={startingDm}
        onToggleStartDm={() => setStartingDm((v) => !v)}
        dmCandidates={dmCandidates}
        onStartDm={startDm}
        startDmPending={createDmMutation.isPending || createGroupDmMutation.isPending}
        pendingInvites={pendingInvites}
        channelsLoading={channelsQuery.isLoading}
      />

      <div className="flex-1 flex bg-white dark:bg-[#0f1114] min-w-0">
        <div className="flex-1 flex flex-col min-w-0">
        <ChatHeader
          channel={selectedChannel}
          workspaceId={workspaceId}
          memberCount={
            selectedChannel?.isDm ? membersQuery.data?.length ?? 0 : channelMembersQuery.data?.length ?? 0
          }
          members={selectedChannel?.isDm ? membersQuery.data ?? [] : channelMembersQuery.data ?? []}
          showPinnedPanel={showPinnedPanel}
          onTogglePinned={() => {
            setShowPinnedPanel((v) => !v)
            setShowSavedPanel(false)
          }}
          showSavedPanel={showSavedPanel}
          onToggleSaved={() => {
            setShowSavedPanel((v) => !v)
            setShowPinnedPanel(false)
          }}
          search={messageSearch}
          onSearchChange={setMessageSearch}
          onLeaveChannel={() => {
            if (selectedId) leaveChannelMutation.mutate(selectedId)
          }}
          onAddPeople={selectedChannel && !selectedChannel.isDm ? () => setAddPeopleOpen(true) : undefined}
          onSetNotificationLevel={
            selectedId ? (level) => setNotificationLevel.mutate({ channelId: selectedId, level }) : undefined
          }
          currentUserId={me?.id}
          onRemoveMember={selectedId ? (userId) => removeMemberMutation.mutate({ channelId: selectedId, userId }) : undefined}
        />

        {selectedChannel && !selectedChannel.isDm && (
          <AddPeopleDialog
            channelId={selectedChannel.id}
            workspaceId={workspaceId}
            channelName={selectedChannel.name}
            open={addPeopleOpen}
            onOpenChange={setAddPeopleOpen}
          />
        )}

        {emojiManagerOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => setEmojiManagerOpen(false)}
          >
            <Card className="w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">Custom emoji</h3>
                <button className="text-muted-foreground hover:text-foreground" onClick={() => setEmojiManagerOpen(false)}>
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-end gap-2">
                <label className="flex-1 text-[11px] text-muted-foreground">
                  Shortcode
                  <input
                    value={newEmojiCode}
                    onChange={(e) => setNewEmojiCode(e.target.value)}
                    placeholder="partyparrot"
                    className="mt-0.5 w-full h-8 rounded border border-border bg-background px-2 text-sm text-foreground"
                  />
                </label>
                <label className="flex-[1.4] text-[11px] text-muted-foreground">
                  Image URL
                  <input
                    value={newEmojiUrl}
                    onChange={(e) => setNewEmojiUrl(e.target.value)}
                    placeholder="https://…/emoji.png"
                    className="mt-0.5 w-full h-8 rounded border border-border bg-background px-2 text-sm text-foreground"
                  />
                </label>
                <Button
                  size="sm"
                  disabled={!newEmojiCode.trim() || !newEmojiUrl.trim() || addCustomEmojiMutation.isPending}
                  onClick={() => addCustomEmojiMutation.mutate({ shortcode: newEmojiCode.trim(), imageUrl: newEmojiUrl.trim() })}
                >
                  Add
                </Button>
              </div>
              <div className="mt-4 max-h-64 overflow-y-auto space-y-1">
                {customEmoji.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-3 text-center">
                    No custom emoji yet. Add one above — use it as <code>:shortcode:</code> to react.
                  </div>
                ) : (
                  customEmoji.map((ce) => (
                    <div key={ce.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/40">
                      <img src={ce.imageUrl} alt={ce.shortcode} className="h-6 w-6 object-contain" />
                      <span className="flex-1 text-sm">:{ce.shortcode}:</span>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-red-500"
                        title="Remove emoji"
                        onClick={() => deleteCustomEmojiMutation.mutate(ce.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
          {rootMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center max-w-md mx-auto">
              <div className="h-14 w-14 rounded-2xl bg-violet-500/10 flex items-center justify-center mb-4">
                {selectedChannel?.isDm ? (
                  <Users className="h-7 w-7 text-violet-600 dark:text-violet-300" />
                ) : (
                  <Hash className="h-7 w-7 text-violet-600 dark:text-violet-300" />
                )}
              </div>
              <h3 className="text-[18px] font-semibold text-foreground mb-1">
                {selectedChannel?.isDm
                  ? `Message ${selectedChannel.dmLabel ?? selectedChannel.dmPeerName ?? 'teammate'}`
                  : `Welcome to #${selectedChannel?.name ?? 'channel'}`}
              </h3>
              <p className="text-[14px] text-muted-foreground leading-relaxed">
                This is the beginning of your conversation. Send a message to get started.
              </p>
            </div>
          ) : visibleRootMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center max-w-md mx-auto">
              <p className="text-[14px] text-muted-foreground">
                No messages match “{messageSearch.trim()}”.
              </p>
            </div>
          ) : (
            <div className="space-y-0 max-w-3xl mx-auto">
              {visibleRootMessages.map((m, i) => {
                const showAuthor = shouldShowMessageHeader(visibleRootMessages, i)
                const showDate = shouldShowDateDivider(visibleRootMessages, i)
                const mine = m.authorId === me?.id
                const replyCount = repliesByParent.get(m.id)?.length ?? 0
                return (
                  <div key={m.id} className="contents">
                    {showDate && (
                      <div className="flex items-center gap-3 py-4">
                        <div className="h-px flex-1 bg-border/80" />
                        <span className="text-[11px] font-medium text-muted-foreground px-2">
                          {formatDateDivider(m.createdAt)}
                        </span>
                        <div className="h-px flex-1 bg-border/80" />
                      </div>
                    )}
                  <div
                    key={`${m.id}-row`}
                    ref={(el) => {
                      messageRefs.current[m.id] = el
                    }}
                    className={cn(
                      'relative flex gap-3 group rounded-md px-2 py-0.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.03] transition-colors',
                      highlightedMessageId === m.id && 'ring-1 ring-violet-500/40 bg-violet-500/5',
                    )}
                  >
                    <div className="w-9 shrink-0">
                      {showAuthor && (
                        <button
                          type="button"
                          className="h-9 w-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-[11px] font-bold flex items-center justify-center hover:brightness-110"
                          onClick={() => {
                            setProfileUserId(m.authorId)
                            setProfileTab('activity')
                          }}
                        >
                          {(m.authorName ?? '?')[0]?.toUpperCase()}
                        </button>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      {showAuthor && (
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <button
                            type="button"
                            className={cn('text-[14px] font-semibold hover:underline', mine ? 'text-violet-600 dark:text-violet-300' : 'text-foreground')}
                            onClick={() => {
                              setProfileUserId(m.authorId)
                              setProfileTab('activity')
                            }}
                          >
                            {m.authorName ?? 'Unknown'}
                          </button>
                          <span className="text-[10px] text-muted-foreground/90 tabular-nums">
                            {formatMessageTime(m.createdAt)}
                          </span>
                        </div>
                      )}
                      {m.pinnedAt && !m.deletedAt && (
                        <div className="flex items-center gap-1 text-[10px] font-medium text-violet-600 dark:text-violet-300 mb-0.5">
                          <Pin className="h-2.5 w-2.5" />
                          Pinned{m.pinnedByName ? ` by ${m.pinnedByName}` : ''}
                          {m.pinnedAt ? ` · ${formatMessageTime(m.pinnedAt)}` : ''}
                        </div>
                      )}
                      {m.deletedAt ? (
                        <div className="text-[13px] italic text-muted-foreground/80">This message was deleted</div>
                      ) : editingMessageId === m.id ? (
                        <div className="mt-0.5">
                          <textarea
                            autoFocus
                            value={editingBody}
                            onChange={(e) => setEditingBody(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                if (editingBody.trim()) editMessageMutation.mutate({ messageId: m.id, body: editingBody.trim() })
                              }
                              if (e.key === 'Escape') {
                                setEditingMessageId(null)
                                setEditingBody('')
                              }
                            }}
                            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[14px] focus:outline-none focus:ring-1 focus:ring-ring"
                            rows={2}
                          />
                          <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                            <button
                              type="button"
                              className="text-violet-600 dark:text-violet-300 hover:underline"
                              onClick={() => editingBody.trim() && editMessageMutation.mutate({ messageId: m.id, body: editingBody.trim() })}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="hover:underline"
                              onClick={() => {
                                setEditingMessageId(null)
                                setEditingBody('')
                              }}
                            >
                              Cancel
                            </button>
                            <span>· Enter to save, Esc to cancel</span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-[14px] whitespace-pre-wrap break-words leading-[1.45] text-foreground/90">
                          {m.body && <ChatMessageBody text={m.body} namesById={namesById} />}
                          {m.editedAt && <span className="text-[10px] text-muted-foreground ml-1">(edited)</span>}
                          {!m.deletedAt && m.attachments && m.attachments.length > 0 && (
                            <ChatAttachmentList attachments={m.attachments} />
                          )}
                        </div>
                      )}
                      {!m.deletedAt && editingMessageId !== m.id && (
                      <div className="absolute right-3 -top-3 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150">
                        <div className="relative rounded-lg border border-border/80 bg-background shadow-md px-1 py-0.5 flex items-center gap-0.5">
                          <button
                            type="button"
                            title="React"
                            className="h-[22px] w-[22px] rounded text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center"
                            onClick={() => setReactionPickerFor((prev) => (prev === m.id ? null : m.id))}
                          >
                            <Smile className="h-3 w-3" />
                          </button>
                          {reactionPickerFor === m.id && (
                            <div className="absolute right-0 top-8 z-20 w-56 rounded-lg border border-border bg-card shadow-lg p-1.5">
                              <div className="flex items-center gap-1 flex-wrap">
                                {['😀', '🔥', '❤️', '👏', '👍', '🎉'].map((emoji) => (
                                  <button
                                    key={emoji}
                                    type="button"
                                    className="h-7 w-7 rounded hover:bg-muted text-sm"
                                    onClick={() => {
                                      toggleReactionMutation.mutate({ messageId: m.id, emoji })
                                      setReactionPickerFor(null)
                                    }}
                                  >
                                    {emoji}
                                  </button>
                                ))}
                                {customEmoji.map((ce) => (
                                  <button
                                    key={ce.id}
                                    type="button"
                                    title={`:${ce.shortcode}:`}
                                    className="h-7 w-7 rounded hover:bg-muted flex items-center justify-center"
                                    onClick={() => {
                                      toggleReactionMutation.mutate({ messageId: m.id, emoji: `:${ce.shortcode}:` })
                                      setReactionPickerFor(null)
                                    }}
                                  >
                                    <img src={ce.imageUrl} alt={ce.shortcode} className="h-5 w-5 object-contain" />
                                  </button>
                                ))}
                              </div>
                              <button
                                type="button"
                                className="mt-1 w-full text-left text-[11px] text-muted-foreground hover:text-foreground"
                                onClick={() => {
                                  setEmojiManagerOpen(true)
                                  setReactionPickerFor(null)
                                }}
                              >
                                ＋ Add custom emoji…
                              </button>
                            </div>
                          )}
                          <span className="mx-0.5 h-4 w-px bg-border/70" />
                          <button
                            type="button"
                            title="Ask AI"
                            className="h-[22px] w-[22px] rounded text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center"
                            onClick={() => setInput((prev) => `${prev ? `${prev}\n` : ''}/ai summarize: ${m.body.slice(0, 120)}`)}
                          >
                            <Sparkles className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            title="Create task from message"
                            disabled={createTaskFromMessage.isPending}
                            className="h-[22px] w-[22px] rounded text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center disabled:opacity-50"
                            onClick={() => createTaskFromMessage.mutate(m.id)}
                          >
                            <ListTodo className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            title="Like"
                            className={cn(
                              'h-[22px] w-[22px] rounded hover:bg-muted flex items-center justify-center',
                              m.reactions?.some((r) => r.emoji === '👍' && r.reacted)
                                ? 'text-accent'
                                : 'text-muted-foreground hover:text-foreground',
                            )}
                            onClick={() => toggleReactionMutation.mutate({ messageId: m.id, emoji: '👍' })}
                          >
                            <ThumbsUp className="h-3 w-3" />
                          </button>
                          <span className="mx-0.5 h-4 w-px bg-border/70" />
                          <button
                            type="button"
                            title="Reply"
                            className="h-[22px] w-[22px] rounded text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center"
                            onClick={() => {
                              setReplyTo(m)
                              setThreadParentId(m.id)
                            }}
                          >
                            <Reply className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            title="Forward"
                            className="h-[22px] w-[22px] rounded text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center"
                            onClick={() => setForwardPickerFor((prev) => (prev === m.id ? null : m.id))}
                          >
                            <Forward className="h-3 w-3" />
                          </button>
                          {forwardPickerFor === m.id && (
                            <div className="absolute right-0 top-8 z-20 w-60 rounded-lg border border-border bg-card shadow-lg p-1.5 space-y-1">
                              <div className="px-1 text-[10px] uppercase tracking-wide text-muted-foreground">Forward to</div>
                              {[...publicChannels, ...dmChannels].slice(0, 10).map((channel) => (
                                <button
                                  key={`fwd-${m.id}-${channel.id}`}
                                  type="button"
                                  className="w-full text-left rounded px-2 py-1.5 text-xs hover:bg-muted"
                                  onClick={() =>
                                    forwardMutation.mutate({
                                      channelId: channel.id,
                                      body: `Forwarded message:\n${m.body}`,
                                    })
                                  }
                                >
                                  {channel.isDm ? channel.dmLabel ?? channel.dmPeerName ?? 'Direct message' : `#${channel.name}`}
                                </button>
                              ))}
                            </div>
                          )}
                          <span className="mx-0.5 h-4 w-px bg-border/70" />
                          <button
                            type="button"
                            title={savedIds.has(m.id) ? 'Remove from saved' : 'Save message'}
                            disabled={setSavedMutation.isPending}
                            className={cn(
                              'h-[22px] w-[22px] rounded hover:bg-muted flex items-center justify-center disabled:opacity-50',
                              savedIds.has(m.id) ? 'text-accent' : 'text-muted-foreground hover:text-foreground',
                            )}
                            onClick={() => setSavedMutation.mutate({ messageId: m.id, saved: !savedIds.has(m.id) })}
                          >
                            <Bookmark className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            title={m.pinnedAt ? 'Unpin from channel' : 'Pin to channel'}
                            disabled={setPinnedMutation.isPending}
                            className={cn(
                              'h-[22px] w-[22px] rounded hover:bg-muted flex items-center justify-center disabled:opacity-50',
                              m.pinnedAt ? 'text-violet-600 dark:text-violet-300' : 'text-muted-foreground hover:text-foreground',
                            )}
                            onClick={() =>
                              setPinnedMutation.mutate({ messageId: m.id, pinned: !m.pinnedAt })
                            }
                          >
                            {m.pinnedAt ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                          </button>
                          <button
                            type="button"
                            title="Assign / Open profile"
                            className="h-[22px] w-[22px] rounded text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center"
                            onClick={() =>
                              setInput((prev) => `${prev ? `${prev} ` : ''}<@${m.authorId}> `)
                            }
                          >
                            <UserPlus className="h-3 w-3" />
                          </button>
                          {mine && (
                            <>
                              <span className="mx-0.5 h-4 w-px bg-border/70" />
                              <button
                                type="button"
                                title="Edit message"
                                className="h-[22px] w-[22px] rounded text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center"
                                onClick={() => {
                                  setEditingMessageId(m.id)
                                  setEditingBody(m.body)
                                }}
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                title="Delete message"
                                disabled={deleteMessageMutation.isPending}
                                className="h-[22px] w-[22px] rounded text-muted-foreground hover:text-red-500 hover:bg-red-500/10 flex items-center justify-center disabled:opacity-50"
                                onClick={() => {
                                  if (window.confirm('Delete this message?')) deleteMessageMutation.mutate(m.id)
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      )}
                      {!!m.reactions?.length && (
                        <div className="mt-1 flex items-center gap-1 flex-wrap">
                          {m.reactions.map((r) => {
                            const code = /^:([a-z0-9_]+):$/.exec(r.emoji)?.[1]
                            const customUrl = code ? emojiByCode.get(code) : undefined
                            return (
                              <button
                                key={`${m.id}-${r.emoji}`}
                                type="button"
                                className={cn(
                                  'text-[10px] rounded-full border px-1.5 py-0.5 transition-colors flex items-center gap-1',
                                  r.reacted ? 'border-accent/60 bg-accent/10 text-accent' : 'border-border/70',
                                )}
                                onClick={() => toggleReactionMutation.mutate({ messageId: m.id, emoji: r.emoji })}
                                title={code ? `:${code}:` : undefined}
                              >
                                {customUrl ? (
                                  <img src={customUrl} alt={code} className="h-3.5 w-3.5 object-contain" />
                                ) : (
                                  <span>{r.emoji}</span>
                                )}
                                {r.count}
                              </button>
                            )
                          })}
                        </div>
                      )}
                      {replyCount > 0 && (
                        <button
                          type="button"
                          className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] font-medium text-violet-600 dark:text-violet-300 hover:underline"
                          onClick={() => setThreadParentId(m.id)}
                        >
                          View thread ({replyCount})
                        </button>
                      )}
                    </div>
                  </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {seenByNames.length > 0 && (
          <div className="px-5 pb-1 text-right text-[10px] text-muted-foreground">
            Seen by{' '}
            {seenByNames.length <= 3
              ? seenByNames.join(', ')
              : `${seenByNames.slice(0, 2).join(', ')} +${seenByNames.length - 2}`}
          </div>
        )}

        <ChatComposer
          channelLabel={channelLabel}
          value={input}
          onChange={setInput}
          onSend={handleSend}
          disabled={!selectedId}
          sending={sendMutation.isPending}
          replyTo={replyTo}
          replyNamesById={namesById}
          onCancelReply={() => setReplyTo(null)}
          attachments={pendingAttachments}
          onFilesSelected={(files) => void uploadFiles(files)}
          onRemoveAttachment={(id) => setPendingAttachments((prev) => prev.filter((a) => a.id !== id))}
          uploading={uploadingFiles}
          mentionMenu={
            showMentions && mentionCandidates.length > 0 ? (
              <div className="mb-2 max-h-36 overflow-auto rounded-lg border border-border/80 bg-background shadow-sm">
                {mentionCandidates.slice(0, 6).map((member) => (
                  <button
                    key={member.userId}
                    type="button"
                    className="w-full px-3 py-2 text-left text-[13px] hover:bg-violet-500/8"
                    onClick={() => {
                      const at = input.lastIndexOf('@')
                      const prefix = at >= 0 ? input.slice(0, at) : input
                      setInput(`${prefix}<@${member.userId}> `)
                    }}
                  >
                    <span className="font-medium text-foreground">{member.displayName || member.email}</span>
                    <span className="ml-2 text-muted-foreground">{member.email}</span>
                  </button>
                ))}
              </div>
            ) : undefined
          }
        />
        </div>
        {threadParent && (
          <ThreadPanel
            parent={threadParent}
            replies={threadReplies}
            onClose={() => setThreadParentId(null)}
            onReply={handleThreadReply}
            pending={sendMutation.isPending}
            namesById={namesById}
          />
        )}
        {selectedProfile && (
          <ProfilePanel
            member={selectedProfile}
            stats={profileStats}
            tasks={profileTasksQuery.data ?? []}
            tab={profileTab}
            onChangeTab={setProfileTab}
            onAssign={() => setInput((prev) => `${prev ? `${prev} ` : ''}<@${selectedProfile.userId}> `)}
            onStartDm={() => createDmMutation.mutate(selectedProfile.userId)}
            onOpenActivity={(entry) => void openThreadFromActivity(entry)}
            onOpenTask={(task) =>
              navigate({
                to: '/app/$workspaceId/$spaceId/$projectId/$listId',
                params: {
                  workspaceId,
                  spaceId: task.spaceId,
                  projectId: task.projectId,
                  listId: task.listId,
                },
                search: { task: task.id } as any,
              })
            }
            onClose={() => setProfileUserId(null)}
          />
        )}
        {showPinnedPanel && (
          <PinnedPanel
            messages={pinnedMessages}
            loading={pinnedQuery.isLoading}
            namesById={namesById}
            onClose={() => setShowPinnedPanel(false)}
            onOpenThread={(id) => setThreadParentId(id)}
          />
        )}
        {showSavedPanel && (
          <SavedPanel
            messages={savedMessages}
            loading={savedQuery.isLoading}
            namesById={namesById}
            onClose={() => setShowSavedPanel(false)}
            onOpenThread={(id, channelId) => {
              // A saved message may live in another channel — switch to it first.
              if (channelId && channelId !== selectedId) setSelectedId(channelId)
              setThreadParentId(id)
              setShowSavedPanel(false)
            }}
            onUnsave={(id) => setSavedMutation.mutate({ messageId: id, saved: false })}
          />
        )}
      </div>
    </div>
  )
}

function PinnedPanel({
  messages,
  loading,
  namesById,
  onClose,
  onOpenThread,
}: {
  messages: Message[]
  loading?: boolean
  namesById: Record<string, string>
  onClose: () => void
  onOpenThread: (id: string) => void
}) {
  return (
    <aside className="hidden xl:flex w-80 border-l border-border flex-col">
      <div className="h-12 border-b border-border px-3 flex items-center justify-between">
        <div className="text-sm font-semibold">Pinned</div>
        <button className="text-xs text-muted-foreground hover:text-foreground" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {loading ? (
          <div className="text-xs text-muted-foreground">Loading…</div>
        ) : messages.length === 0 ? (
          <div className="text-xs text-muted-foreground">No pinned messages yet.</div>
        ) : (
          messages.map((m) => (
            <Card key={m.id} className="p-3">
              <div className="text-xs text-muted-foreground">{m.authorName ?? 'Unknown'}</div>
              <MentionText text={m.body} namesById={namesById} className="text-sm mt-1" />
              {(m.pinnedByName || m.pinnedAt) && (
                <div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Pin className="h-2.5 w-2.5" />
                  Pinned{m.pinnedByName ? ` by ${m.pinnedByName}` : ''}
                  {m.pinnedAt ? ` · ${formatMessageTime(m.pinnedAt)}` : ''}
                </div>
              )}
              <button className="mt-2 text-[11px] text-accent hover:underline" onClick={() => onOpenThread(m.id)}>
                Open thread
              </button>
            </Card>
          ))
        )}
      </div>
    </aside>
  )
}

function SavedPanel({
  messages,
  loading,
  namesById,
  onClose,
  onOpenThread,
  onUnsave,
}: {
  messages: Array<Message & { channelName?: string; savedAt?: string }>
  loading?: boolean
  namesById: Record<string, string>
  onClose: () => void
  onOpenThread: (id: string, channelId: string) => void
  onUnsave: (id: string) => void
}) {
  return (
    <aside className="hidden xl:flex w-80 border-l border-border flex-col">
      <div className="h-12 border-b border-border px-3 flex items-center justify-between">
        <div className="text-sm font-semibold flex items-center gap-1.5">
          <Bookmark className="h-3.5 w-3.5" /> Saved
        </div>
        <button className="text-xs text-muted-foreground hover:text-foreground" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {loading ? (
          <div className="text-xs text-muted-foreground">Loading…</div>
        ) : messages.length === 0 ? (
          <div className="text-xs text-muted-foreground">No saved messages yet. Hover a message and click the bookmark to save it.</div>
        ) : (
          messages.map((m) => (
            <Card key={m.id} className="p-3 group">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground truncate">
                  {m.authorName ?? 'Unknown'}
                  {m.channelName ? <span className="opacity-70"> · #{m.channelName}</span> : null}
                </div>
                <button
                  className="text-[11px] text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => onUnsave(m.id)}
                  title="Remove from saved"
                >
                  Remove
                </button>
              </div>
              <MentionText text={m.body} namesById={namesById} className="text-sm mt-1" />
              <button className="mt-2 text-[11px] text-accent hover:underline" onClick={() => onOpenThread(m.id, m.channelId)}>
                Open thread
              </button>
            </Card>
          ))
        )}
      </div>
    </aside>
  )
}

function ThreadPanel({
  parent,
  replies,
  onClose,
  onReply,
  pending,
  namesById,
}: {
  parent: Message
  replies: Message[]
  onClose: () => void
  onReply: (body: string) => void
  pending: boolean
  namesById: Record<string, string>
}) {
  const [draft, setDraft] = useState('')
  return (
    <aside className="hidden xl:flex w-[360px] shrink-0 border-l border-border/80 bg-[#fbfbfc] dark:bg-[#16181d] flex-col">
      <div className="h-[52px] shrink-0 border-b border-border/80 px-4 flex items-center justify-between bg-background">
        <div className="text-[14px] font-semibold text-foreground">Thread</div>
        <button
          type="button"
          className="h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white dark:bg-[#0f1114]">
        <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3">
          <div className="text-[12px] font-semibold text-foreground mb-1">{parent.authorName ?? 'Unknown'}</div>
          <MentionText text={parent.body} namesById={namesById} className="text-[14px] leading-relaxed" />
        </div>
        {replies.map((reply) => (
          <div key={reply.id} className="rounded-lg border border-border/70 bg-background p-3">
            <div className="text-[12px] font-semibold text-foreground mb-1">{reply.authorName ?? 'Unknown'}</div>
            <MentionText text={reply.body} namesById={namesById} className="text-[14px] leading-relaxed" />
          </div>
        ))}
        {replies.length === 0 && (
          <p className="text-[12px] text-muted-foreground text-center py-6">No replies yet — start the thread.</p>
        )}
      </div>
      <div className="shrink-0 border-t border-border/80 p-3 bg-[#fbfbfc] dark:bg-[#16181d]">
        <ThreadReplyComposer
          value={draft}
          onChange={setDraft}
          onSend={() => {
            const body = draft.trim()
            if (!body) return
            onReply(body)
            setDraft('')
          }}
          disabled={false}
          sending={pending}
        />
      </div>
    </aside>
  )
}


function ProfilePanel({
  member,
  stats,
  tasks,
  tab,
  onChangeTab,
  onAssign,
  onStartDm,
  onOpenActivity,
  onOpenTask,
  onClose,
}: {
  member: WorkspaceMember
  stats: MemberProfileStats
  tasks: ProfileTask[]
  tab: 'activity' | 'tasks' | 'comments'
  onChangeTab: (tab: 'activity' | 'tasks' | 'comments') => void
  onAssign: () => void
  onStartDm: () => void
  onOpenActivity: (entry: Message) => void
  onOpenTask: (task: ProfileTask) => void
  onClose: () => void
}) {
  return (
    <aside className="hidden xl:flex w-[320px] border-l border-border bg-card/80 flex-col animate-in slide-in-from-right-4 duration-200">
      <div className="h-12 border-b border-border px-3 flex items-center justify-between">
        <div className="text-sm font-semibold">Profile</div>
        <button
          className="h-7 w-7 rounded hover:bg-muted text-muted-foreground flex items-center justify-center"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-lg bg-brand-300 text-foreground font-semibold flex items-center justify-center">
            {(member.displayName || member.email)[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{member.displayName || member.email}</div>
            <div className="text-xs text-muted-foreground truncate">{member.email}</div>
          </div>
        </div>
        <div className="rounded-lg border border-border/70 bg-background px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Status</div>
          <div className="mt-1 text-sm text-foreground flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Online
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{stats.totalMessages} messages in current chat context</div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" className="flex-1" onClick={onAssign}>
            Assign
          </Button>
          <Button size="sm" variant="secondary" className="flex-1" onClick={onStartDm}>
            Message
          </Button>
        </div>
        <div className="rounded-lg border border-border/70 bg-background">
          <div className="border-b border-border/70 p-1 flex items-center gap-1">
            {([
              ['activity', 'Activity'],
              ['tasks', 'Tasks'],
              ['comments', 'Comments'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => onChangeTab(id)}
                className={cn(
                  'px-2.5 py-1 text-xs rounded',
                  tab === id ? 'bg-accent/15 text-foreground font-medium' : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="p-3 text-xs text-muted-foreground">
            {tab === 'activity' && (
              <div className="space-y-1.5">
                {stats.recentMessages.length === 0 ? (
                  <div>No recent activity in loaded messages.</div>
                ) : (
                  stats.recentMessages.slice(0, 4).map((message) => (
                    <button
                      key={`act-${message.id}`}
                      type="button"
                      onClick={() => onOpenActivity(message)}
                      className="w-full text-left rounded border border-border/60 px-2 py-1.5 text-foreground/90 hover:bg-muted/40"
                    >
                      {message.body.slice(0, 90)}
                    </button>
                  ))
                )}
              </div>
            )}
            {tab === 'tasks' && (
              <div className="space-y-1.5">
                {tasks.length === 0 ? (
                  <div>No assigned tasks found in this workspace.</div>
                ) : (
                  tasks.slice(0, 6).map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => onOpenTask(task)}
                      className="w-full text-left rounded border border-border/60 px-2 py-1.5 text-foreground/90 hover:bg-muted/40"
                    >
                      <div className="text-xs font-medium truncate">{task.title}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                        {task.spaceName} / {task.projectName} / {task.listName}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
            {tab === 'comments' && (
              <div className="space-y-1.5">
                {stats.recentReplies.length === 0 ? (
                  <div>No thread replies yet from this member.</div>
                ) : (
                  stats.recentReplies.slice(0, 4).map((reply) => (
                    <button
                      key={`reply-${reply.id}`}
                      type="button"
                      onClick={() => onOpenActivity(reply)}
                      className="w-full text-left rounded border border-border/60 px-2 py-1.5 text-foreground/90 hover:bg-muted/40"
                    >
                      {reply.body.slice(0, 90)}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  )
}

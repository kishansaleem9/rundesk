import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Textarea, cn } from '@rundesk/ui'
import { ChatSidebar } from '../components/chat/chat-sidebar'
import { ChatHeader } from '../components/chat/chat-header'
import { ChatComposer } from '../components/chat/chat-composer'
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
  Paperclip,
  Sparkles,
  ThumbsUp,
  Reply,
  Forward,
  Bookmark,
  UserPlus,
  X,
} from 'lucide-react'
import { api } from '../lib/api'
import { getRealtimeSocket } from '../lib/realtime'
import { useAuthStore } from '../store/auth'
import { MentionText } from '../components/mention-text'

type Channel = {
  id: string
  name: string
  description?: string | null
  isPrivate: boolean
  isDm: boolean
  joined: boolean
  dmPeerId?: string
  dmPeerName?: string | null
  dmPeerAvatarUrl?: string | null
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
  createdAt: string
  reactions?: Array<{
    emoji: string
    count: number
    reacted: boolean
  }>
}

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
  const navigate = useNavigate()
  const qc = useQueryClient()
  const me = useAuthStore((s) => s.user)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPrivate, setNewPrivate] = useState(false)
  const [startingDm, setStartingDm] = useState(false)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [threadParentId, setThreadParentId] = useState<string | null>(null)
  const [showPinnedPanel, setShowPinnedPanel] = useState(false)
  const [pinnedMessageIds, setPinnedMessageIds] = useState<string[]>([])
  const [profileUserId, setProfileUserId] = useState<string | null>(null)
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null)
  const [profileTab, setProfileTab] = useState<'activity' | 'tasks' | 'comments'>('activity')
  const [forwardPickerFor, setForwardPickerFor] = useState<string | null>(null)
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null)
  const [channelSearch, setChannelSearch] = useState('')
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
    if (!selectedId && channels.length > 0) {
      const general = channels.find((c) => c.name === 'general') ?? channels[0]
      setSelectedId(general.id)
    }
  }, [channels, selectedId])

  const selectedChannel = useMemo(
    () => channels.find((c) => c.id === selectedId) ?? null,
    [channels, selectedId],
  )

  const messagesQuery = useQuery({
    queryKey: ['chat-messages', selectedId],
    queryFn: () => api<Message[]>(`/chat/channels/${selectedId}/messages?limit=100`),
    enabled: !!selectedId,
  })
  const messages = messagesQuery.data ?? []
  const rootMessages = useMemo(() => messages.filter((m) => !m.parentMessageId), [messages])
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
  const pinnedMessages = useMemo(
    () => pinnedMessageIds.map((id) => messages.find((m) => m.id === id)).filter(Boolean) as Message[],
    [messages, pinnedMessageIds],
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
    if (!workspaceId || !selectedId) return
    try {
      const key = `rundesk.chat.pins.${workspaceId}.${selectedId}`
      const raw = localStorage.getItem(key)
      if (!raw) {
        setPinnedMessageIds([])
        return
      }
      const parsed = JSON.parse(raw) as string[]
      setPinnedMessageIds(Array.isArray(parsed) ? parsed : [])
    } catch {
      setPinnedMessageIds([])
    }
  }, [workspaceId, selectedId])

  const persistPins = (next: string[]) => {
    if (!workspaceId || !selectedId) return
    try {
      localStorage.setItem(`rundesk.chat.pins.${workspaceId}.${selectedId}`, JSON.stringify(next))
    } catch {
      // ignore local storage failures
    }
  }

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

  useEffect(() => {
    if (!highlightedMessageId) return
    const target = messageRefs.current[highlightedMessageId]
    if (!target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const timer = setTimeout(() => setHighlightedMessageId((prev) => (prev === highlightedMessageId ? null : prev)), 1800)
    return () => clearTimeout(timer)
  }, [highlightedMessageId, messages, selectedId])

  const sendMutation = useMutation({
    mutationFn: ({ body, parentMessageId }: { body: string; parentMessageId?: string }) =>
      api<Message>(`/chat/channels/${selectedId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body, parentMessageId }),
      }),
    onSuccess: (msg) => {
      qc.setQueryData<Message[] | undefined>(['chat-messages', msg.channelId], (prev) =>
        prev && !prev.some((m) => m.id === msg.id) ? [...prev, msg] : prev,
      )
      setInput('')
      setReplyTo(null)
    },
  })

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

  const handleSend = () => {
    const body = input.trim()
    if (!body || !selectedId) return
    sendMutation.mutate({ body, parentMessageId: replyTo?.id ?? undefined })
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
    ? selectedChannel.dmPeerName ?? 'DM'
    : selectedChannel
      ? `#${selectedChannel.name}`
      : ''

  return (
    <div className="h-full flex bg-background">
      <ChatSidebar
        channels={publicChannels}
        dmChannels={dmChannels}
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
        onStartDm={(userId) => createDmMutation.mutate(userId)}
        startDmPending={createDmMutation.isPending}
        pendingInvites={pendingInvites}
        channelsLoading={channelsQuery.isLoading}
      />

      <div className="flex-1 flex bg-white dark:bg-[#0f1114] min-w-0">
        <div className="flex-1 flex flex-col min-w-0">
        <ChatHeader
          channel={selectedChannel}
          memberCount={membersQuery.data?.length ?? 0}
          showPinnedPanel={showPinnedPanel}
          onTogglePinned={() => setShowPinnedPanel((v) => !v)}
        />

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
                  ? `Message ${selectedChannel.dmPeerName ?? 'teammate'}`
                  : `Welcome to #${selectedChannel?.name ?? 'channel'}`}
              </h3>
              <p className="text-[14px] text-muted-foreground leading-relaxed">
                This is the beginning of your conversation. Send a message to get started.
              </p>
            </div>
          ) : (
            <div className="space-y-0 max-w-3xl mx-auto">
              {rootMessages.map((m, i) => {
                const showAuthor = shouldShowMessageHeader(rootMessages, i)
                const showDate = shouldShowDateDivider(rootMessages, i)
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
                      <div
                        className={cn(
                          'text-[14px] whitespace-pre-wrap break-words leading-[1.45] text-foreground/90',
                        )}
                      >
                        <MentionText text={m.body} namesById={namesById} />
                        {m.editedAt && <span className="text-[10px] text-muted-foreground ml-1">(edited)</span>}
                      </div>
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
                            <div className="absolute right-0 top-8 z-20 rounded-lg border border-border bg-card shadow-lg p-1 flex items-center gap-1">
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
                                  {channel.isDm ? channel.dmPeerName ?? 'Direct message' : `#${channel.name}`}
                                </button>
                              ))}
                            </div>
                          )}
                          <span className="mx-0.5 h-4 w-px bg-border/70" />
                          <button
                            type="button"
                            title="Save"
                            className={cn(
                              'h-[22px] w-[22px] rounded hover:bg-muted flex items-center justify-center',
                              pinnedMessageIds.includes(m.id) ? 'text-accent' : 'text-muted-foreground hover:text-foreground',
                            )}
                            onClick={() => {
                              setPinnedMessageIds((prev) => {
                                const next = prev.includes(m.id) ? prev.filter((id) => id !== m.id) : [...prev, m.id]
                                persistPins(next)
                                return next
                              })
                            }}
                          >
                            <Bookmark className="h-3 w-3" />
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
                        </div>
                      </div>
                      {!!m.reactions?.length && (
                        <div className="mt-1 flex items-center gap-1 flex-wrap">
                          {m.reactions.map((r) => (
                            <button
                              key={`${m.id}-${r.emoji}`}
                              type="button"
                              className={cn(
                                'text-[10px] rounded-full border px-1.5 py-0.5 transition-colors',
                                r.reacted ? 'border-accent/60 bg-accent/10 text-accent' : 'border-border/70',
                              )}
                              onClick={() => toggleReactionMutation.mutate({ messageId: m.id, emoji: r.emoji })}
                            >
                              {r.emoji} {r.count}
                            </button>
                          ))}
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
            namesById={namesById}
            onClose={() => setShowPinnedPanel(false)}
            onOpenThread={(id) => setThreadParentId(id)}
          />
        )}
      </div>
    </div>
  )
}

function PinnedPanel({
  messages,
  namesById,
  onClose,
  onOpenThread,
}: {
  messages: Message[]
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
        {messages.length === 0 ? (
          <div className="text-xs text-muted-foreground">No pinned messages yet.</div>
        ) : (
          messages.map((m) => (
            <Card key={m.id} className="p-3">
              <div className="text-xs text-muted-foreground">{m.authorName ?? 'Unknown'}</div>
              <MentionText text={m.body} namesById={namesById} className="text-sm mt-1" />
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
        <div className="rounded-xl border border-border/80 bg-background shadow-sm overflow-hidden">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Reply in thread..."
            rows={2}
            className="min-h-[40px] border-0 bg-transparent resize-none text-[14px] focus-visible:ring-0"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                const body = draft.trim()
                if (!body) return
                onReply(body)
                setDraft('')
              }
            }}
          />
          <div className="px-2 py-1.5 border-t border-border/60 flex justify-end">
            <Button
              size="sm"
              className="h-8 bg-violet-600 hover:bg-violet-700 text-white"
              onClick={() => {
                const body = draft.trim()
                if (!body) return
                onReply(body)
                setDraft('')
              }}
              disabled={!draft.trim() || pending}
            >
              Reply
            </Button>
          </div>
        </div>
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

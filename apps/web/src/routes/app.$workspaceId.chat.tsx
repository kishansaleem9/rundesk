import { useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input, cn } from '@rundesk/ui'
import { Hash, Lock, Plus, Send, Users, Star, Pin } from 'lucide-react'
import { format } from 'date-fns'
import { api } from '../lib/api'
import { getRealtimeSocket } from '../lib/realtime'
import { useAuthStore } from '../store/auth'

export const Route = createFileRoute('/app/$workspaceId/chat')({
  component: ChatPage,
})

type Channel = {
  id: string
  name: string
  description?: string | null
  isPrivate: boolean
  isDm: boolean
  joined: boolean
}

type Message = {
  id: string
  channelId: string
  authorId: string
  authorName?: string | null
  authorAvatarUrl?: string | null
  body: string
  editedAt?: string | null
  createdAt: string
}

function ChatPage() {
  const { workspaceId } = Route.useParams()
  const qc = useQueryClient()
  const me = useAuthStore((s) => s.user)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPrivate, setNewPrivate] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const channelsQuery = useQuery({
    queryKey: ['chat-channels', workspaceId],
    queryFn: () => api<Channel[]>(`/workspaces/${workspaceId}/chat/channels`),
  })
  const channels = channelsQuery.data ?? []

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

  useEffect(() => {
    const socket = getRealtimeSocket()
    socket.emit('subscribe', { rooms: [`workspace:${workspaceId}`] })
    const onEvent = (event: { type: string; docId?: string; patch?: { chat?: string; message?: Message } }) => {
      if (event.type !== 'doc.updated' || !event.patch?.chat) return
      if (event.patch.chat === 'message.created' && event.patch.message) {
        const msg = event.patch.message
        qc.setQueryData<Message[] | undefined>(['chat-messages', msg.channelId], (prev) => {
          if (!prev) return prev
          if (prev.some((m) => m.id === msg.id)) return prev
          return [...prev, msg]
        })
      }
      if (event.patch.chat === 'channel.created') {
        qc.invalidateQueries({ queryKey: ['chat-channels', workspaceId] })
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

  const sendMutation = useMutation({
    mutationFn: (body: string) =>
      api<Message>(`/chat/channels/${selectedId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      }),
    onSuccess: (msg) => {
      qc.setQueryData<Message[] | undefined>(['chat-messages', msg.channelId], (prev) =>
        prev && !prev.some((m) => m.id === msg.id) ? [...prev, msg] : prev,
      )
      setInput('')
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

  const handleSend = () => {
    const body = input.trim()
    if (!body || !selectedId) return
    sendMutation.mutate(body)
  }

  return (
    <div className="h-full flex">
      <aside className="hidden md:flex w-60 border-r border-border bg-muted/30 flex-col">
        <div className="p-3 border-b border-border">
          <h2 className="font-display text-lg font-semibold text-foreground">Chat</h2>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
          <section>
            <div className="px-2 flex items-center justify-between mb-1">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Channels</h3>
              <button
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setCreating((v) => !v)}
                title="Create channel"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            {creating && (
              <div className="mb-2 px-1 space-y-1">
                <Input
                  autoFocus
                  placeholder="channel-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="h-7 text-xs"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newName.trim()) {
                      createChannelMutation.mutate({ name: newName.trim(), isPrivate: newPrivate })
                    } else if (e.key === 'Escape') {
                      setCreating(false)
                      setNewName('')
                    }
                  }}
                />
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-1">
                  <input
                    type="checkbox"
                    checked={newPrivate}
                    onChange={(e) => setNewPrivate(e.target.checked)}
                    className="h-3 w-3"
                  />
                  Private
                </label>
              </div>
            )}

            <div className="space-y-0.5">
              {channels.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-2 py-1 rounded text-sm text-left transition-colors',
                    selectedId === c.id
                      ? 'bg-accent/15 text-foreground font-medium'
                      : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  {c.isPrivate ? <Lock className="h-3.5 w-3.5" /> : <Hash className="h-3.5 w-3.5" />}
                  <span className="truncate flex-1">{c.name}</span>
                </button>
              ))}
              {channels.length === 0 && !channelsQuery.isLoading && (
                <div className="px-2 py-2 text-xs text-muted-foreground">No channels yet</div>
              )}
            </div>
          </section>
        </div>
      </aside>

      <div className="flex-1 flex flex-col bg-card min-w-0">
        <header className="px-4 h-12 border-b border-border flex items-center gap-3">
          <Hash className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">{selectedChannel?.name ?? '…'}</h2>
          {selectedChannel?.description && (
            <span className="text-xs text-muted-foreground truncate">{selectedChannel.description}</span>
          )}
          <div className="ml-auto flex items-center gap-1">
            <button className="p-1.5 rounded hover:bg-muted text-muted-foreground" title="Pinned">
              <Pin className="h-4 w-4" />
            </button>
            <button className="p-1.5 rounded hover:bg-muted text-muted-foreground" title="Members">
              <Users className="h-4 w-4" />
            </button>
            <button className="p-1.5 rounded hover:bg-muted text-muted-foreground" title="Starred">
              <Star className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 sm:px-6 py-3 sm:py-4">
          {messages.length === 0 ? (
            <Card className="p-6 text-center border-dashed mx-auto max-w-md">
              <Hash className="h-8 w-8 text-brand-500 mx-auto mb-2" />
              <h3 className="font-display text-lg font-semibold text-foreground mb-1">
                #{selectedChannel?.name ?? 'channel'}
              </h3>
              <p className="text-sm text-muted-foreground">
                This is the start of the channel. Say hello.
              </p>
            </Card>
          ) : (
            <div className="space-y-3 max-w-3xl mx-auto">
              {messages.map((m, i) => {
                const showAuthor =
                  i === 0 ||
                  messages[i - 1].authorId !== m.authorId ||
                  new Date(m.createdAt).getTime() - new Date(messages[i - 1].createdAt).getTime() > 5 * 60 * 1000
                const mine = m.authorId === me?.id
                return (
                  <div key={m.id} className="flex gap-2 group">
                    <div className="w-8 shrink-0">
                      {showAuthor && (
                        <div className="h-8 w-8 rounded-full bg-brand-300 text-foreground text-xs font-bold flex items-center justify-center">
                          {(m.authorName ?? '?')[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      {showAuthor && (
                        <div className="flex items-baseline gap-2 mb-0.5">
                          <span className={cn('text-sm font-semibold', mine ? 'text-accent' : 'text-foreground')}>
                            {m.authorName ?? 'Unknown'}
                          </span>
                          <span className="text-[10px] text-muted-foreground tabular-nums">
                            {format(new Date(m.createdAt), 'h:mm a')}
                          </span>
                        </div>
                      )}
                      <div className="text-sm whitespace-pre-wrap break-words">
                        {m.body}
                        {m.editedAt && <span className="text-[10px] text-muted-foreground ml-1">(edited)</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="p-3 border-t border-border">
          <div className="flex items-end gap-2">
            <Input
              placeholder={selectedChannel ? `Message #${selectedChannel.name}` : 'Select a channel'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              disabled={!selectedId || sendMutation.isPending}
              className="flex-1"
            />
            <Button size="sm" onClick={handleSend} disabled={!input.trim() || !selectedId || sendMutation.isPending}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <div className="text-[10px] text-muted-foreground mt-1 px-1">
            <kbd className="px-1 rounded bg-muted">Enter</kbd> to send · <kbd className="px-1 rounded bg-muted">Shift+Enter</kbd> for new line
          </div>
        </div>
      </div>
    </div>
  )
}

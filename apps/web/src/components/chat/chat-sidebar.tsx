import type { ReactNode } from 'react'
import { Hash, Lock, MessageSquarePlus, Plus, Search } from 'lucide-react'
import { Button, Input, cn } from '@rundesk/ui'
import type { ChatChannel, ChatMember } from './chat-types'
import { initials } from './chat-utils'

type PendingInvite = { id: string; email: string }

export function ChatSidebar({
  channels,
  dmChannels,
  selectedId,
  onSelectChannel,
  channelSearch,
  onChannelSearchChange,
  creating,
  onToggleCreate,
  newName,
  onNewNameChange,
  newPrivate,
  onNewPrivateChange,
  onCreateChannel,
  createPending,
  startingDm,
  onToggleStartDm,
  dmCandidates,
  onStartDm,
  startDmPending,
  pendingInvites,
  channelsLoading,
}: {
  channels: ChatChannel[]
  dmChannels: ChatChannel[]
  selectedId: string | null
  onSelectChannel: (id: string) => void
  channelSearch: string
  onChannelSearchChange: (value: string) => void
  creating: boolean
  onToggleCreate: () => void
  newName: string
  onNewNameChange: (value: string) => void
  newPrivate: boolean
  onNewPrivateChange: (value: boolean) => void
  onCreateChannel: () => void
  createPending: boolean
  startingDm: boolean
  onToggleStartDm: () => void
  dmCandidates: ChatMember[]
  onStartDm: (userId: string) => void
  startDmPending: boolean
  pendingInvites: PendingInvite[]
  channelsLoading: boolean
}) {
  const q = channelSearch.trim().toLowerCase()
  const filteredChannels = q
    ? channels.filter((c) => c.name.toLowerCase().includes(q))
    : channels
  const filteredDms = q
    ? dmChannels.filter((c) => (c.dmPeerName ?? '').toLowerCase().includes(q))
    : dmChannels

  return (
    <aside className="hidden md:flex w-[272px] shrink-0 flex-col border-r border-border/80 bg-[#fbfbfc] dark:bg-[#16181d]">
      <div className="shrink-0 border-b border-border/80 px-3 py-3 space-y-2.5">
        <h2 className="text-[15px] font-semibold text-foreground tracking-tight">Chat</h2>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={channelSearch}
            onChange={(e) => onChannelSearchChange(e.target.value)}
            placeholder="Search channels..."
            className="h-8 pl-8 text-[13px] bg-background/80 border-border/70 rounded-md"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-4">
        <section>
          <div className="flex items-center justify-between px-1.5 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              Channels
            </span>
            <button
              type="button"
              className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
              onClick={onToggleCreate}
              title="Create channel"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          {creating && (
            <div className="mb-2 px-1 space-y-1.5">
              <Input
                autoFocus
                placeholder="e.g. general"
                value={newName}
                onChange={(e) => onNewNameChange(e.target.value)}
                className="h-8 text-[13px] rounded-md"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newName.trim()) onCreateChannel()
                  if (e.key === 'Escape') onToggleCreate()
                }}
              />
              <label className="flex items-center gap-2 text-[12px] text-muted-foreground px-0.5">
                <input
                  type="checkbox"
                  checked={newPrivate}
                  onChange={(e) => onNewPrivateChange(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-border"
                />
                Private channel
              </label>
              <Button
                size="sm"
                className="h-7 w-full text-xs"
                disabled={!newName.trim() || createPending}
                onClick={onCreateChannel}
              >
                {createPending ? 'Creating…' : 'Create channel'}
              </Button>
            </div>
          )}

          <div className="space-y-0.5">
            {filteredChannels.map((c) => (
              <ChannelRow
                key={c.id}
                active={selectedId === c.id}
                onClick={() => onSelectChannel(c.id)}
                icon={
                  c.isPrivate ? (
                    <Lock className="h-4 w-4 shrink-0 opacity-70" />
                  ) : (
                    <Hash className="h-4 w-4 shrink-0 opacity-70" />
                  )
                }
                label={c.name}
                unread={c.unreadCount ?? 0}
              />
            ))}
            {filteredChannels.length === 0 && !channelsLoading && (
              <p className="px-2 py-2 text-[12px] text-muted-foreground">No channels found</p>
            )}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between px-1.5 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              Direct messages
            </span>
            <button
              type="button"
              className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
              onClick={onToggleStartDm}
              title="New message"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
            </button>
          </div>

          {startingDm && (
            <div className="mb-2 px-1 space-y-1 max-h-48 overflow-y-auto">
              {dmCandidates.length === 0 ? (
                <p className="text-[11px] text-muted-foreground px-1 py-2 leading-relaxed">
                  {pendingInvites.length > 0
                    ? `${pendingInvites.length} invite(s) pending.`
                    : 'Invite teammates from Settings → Members.'}
                </p>
              ) : (
                dmCandidates.map((m) => (
                  <button
                    key={m.userId}
                    type="button"
                    disabled={startDmPending}
                    onClick={() => onStartDm(m.userId)}
                    className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-violet-500/10 disabled:opacity-60"
                  >
                    <MemberAvatar label={initials(m.displayName || m.email)} online />
                    <span className="text-[13px] font-medium truncate text-foreground flex-1 min-w-0">
                      {m.displayName || m.email}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}

          <div className="space-y-0.5">
            {filteredDms.map((c) => (
              <ChannelRow
                key={c.id}
                active={selectedId === c.id}
                onClick={() => onSelectChannel(c.id)}
                icon={<MemberAvatar label={initials(c.dmPeerName)} size="sm" />}
                label={c.dmPeerName ?? 'Direct message'}
                unread={c.unreadCount ?? 0}
              />
            ))}
            {filteredDms.length === 0 && !channelsLoading && (
              <p className="px-2 py-2 text-[12px] text-muted-foreground">No direct messages</p>
            )}
          </div>
        </section>
      </div>
    </aside>
  )
}

function ChannelRow({
  active,
  onClick,
  icon,
  label,
  unread = 0,
}: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  label: string
  unread?: number
}) {
  const hasUnread = unread > 0 && !active
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2 rounded-md px-2 py-[7px] text-left text-[13px] transition-colors',
        active
          ? 'bg-violet-500/12 text-violet-700 dark:text-violet-200 font-medium'
          : hasUnread
            ? 'text-foreground font-semibold hover:bg-black/[0.04] dark:hover:bg-white/[0.05]'
            : 'text-foreground/85 hover:bg-black/[0.04] dark:hover:bg-white/[0.05]',
      )}
    >
      {icon}
      <span className="truncate flex-1">{label}</span>
      {hasUnread && (
        <span className="ml-auto shrink-0 min-w-[18px] h-[18px] px-1.5 rounded-full bg-violet-600 text-white text-[11px] font-semibold flex items-center justify-center tabular-nums">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  )
}

function MemberAvatar({
  label,
  online,
  size = 'md',
}: {
  label: string
  online?: boolean
  size?: 'sm' | 'md'
}) {
  const dim = size === 'sm' ? 'h-5 w-5 text-[9px]' : 'h-7 w-7 text-[11px]'
  return (
    <div className="relative shrink-0">
      <div
        className={cn(
          'rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-white font-semibold flex items-center justify-center',
          dim,
        )}
      >
        {label}
      </div>
      {online && (
        <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-2 border-[#fbfbfc] dark:border-[#16181d] bg-emerald-500" />
      )}
    </div>
  )
}

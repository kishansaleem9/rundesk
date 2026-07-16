import { useState, type ReactNode } from 'react'
import { Archive, ArchiveRestore, Check, ChevronDown, ChevronRight, Hash, Lock, MessageSquarePlus, Plus, Search, Users } from 'lucide-react'
import { Button, Input, cn } from '@rundesk/ui'
import type { ChatChannel, ChatMember, ChatSpace } from './chat-types'
import { initials } from './chat-utils'
import { usePresence, presenceDotClass, type PresenceStatus } from '../../lib/use-presence'
import { useTranslation } from '../../lib/i18n'

type PendingInvite = { id: string; email: string }

export function ChatSidebar({
  channels,
  dmChannels,
  workspaceId,
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
  spaces,
  newSpaceId,
  onNewSpaceIdChange,
  onCreateChannel,
  createPending,
  archivedChannels,
  showArchived,
  onToggleShowArchived,
  onUnarchiveChannel,
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
  workspaceId?: string
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
  spaces: ChatSpace[]
  newSpaceId: string
  onNewSpaceIdChange: (value: string) => void
  onCreateChannel: () => void
  createPending: boolean
  archivedChannels: ChatChannel[]
  showArchived: boolean
  onToggleShowArchived: () => void
  onUnarchiveChannel: (id: string) => void
  startingDm: boolean
  onToggleStartDm: () => void
  dmCandidates: ChatMember[]
  onStartDm: (userIds: string[]) => void
  startDmPending: boolean
  pendingInvites: PendingInvite[]
  channelsLoading: boolean
}) {
  const { statusOf } = usePresence(workspaceId)
  const { t, tCount } = useTranslation()

  // Multi-select DM composer: pick one teammate for a 1:1, or several for a
  // group DM (Plan §6.2). Selection is local to the sidebar. The current user is
  // always a member, so peers are capped at (max members − 1) to keep the group
  // at or under MAX_GROUP_DM_MEMBERS — mirrors the API cap.
  const MAX_GROUP_DM_MEMBERS = 8
  const MAX_DM_PEERS = MAX_GROUP_DM_MEMBERS - 1
  const [selectedPeers, setSelectedPeers] = useState<string[]>([])
  const togglePeer = (userId: string) =>
    setSelectedPeers((prev) => {
      if (prev.includes(userId)) return prev.filter((id) => id !== userId)
      if (prev.length >= MAX_DM_PEERS) return prev // at cap: ignore further picks
      return [...prev, userId]
    })
  const atPeerLimit = selectedPeers.length >= MAX_DM_PEERS

  const q = channelSearch.trim().toLowerCase()
  const filteredChannels = q
    ? channels.filter((c) => c.name.toLowerCase().includes(q))
    : channels
  const dmName = (c: ChatChannel) => (c.dmLabel ?? c.dmPeerName ?? '').toLowerCase()
  const filteredDms = q ? dmChannels.filter((c) => dmName(c).includes(q)) : dmChannels
  const filteredArchived = q
    ? archivedChannels.filter((c) => c.name.toLowerCase().includes(q))
    : archivedChannels

  // Group space-scoped channels under their space (Plan §6.1); workspace-level
  // channels (no spaceId) stay in the top list.
  const spaceById = new Map(spaces.map((s) => [s.id, s]))
  const workspaceChannels = filteredChannels.filter((c) => !c.spaceId)
  const channelsBySpace = new Map<string, ChatChannel[]>()
  for (const c of filteredChannels) {
    if (!c.spaceId) continue
    const arr = channelsBySpace.get(c.spaceId) ?? []
    arr.push(c)
    channelsBySpace.set(c.spaceId, arr)
  }
  const spaceGroups = [...channelsBySpace.entries()].map(([spaceId, chans]) => ({
    spaceId,
    space: spaceById.get(spaceId) ?? null,
    channels: chans,
  }))

  const channelIcon = (c: ChatChannel): ReactNode =>
    c.icon ? (
      <span className="h-4 w-4 shrink-0 flex items-center justify-center text-[13px] leading-none">{c.icon}</span>
    ) : c.isPrivate ? (
      <Lock className="h-4 w-4 shrink-0 opacity-70" />
    ) : (
      <Hash className="h-4 w-4 shrink-0 opacity-70" />
    )

  return (
    <aside className="hidden md:flex w-[272px] shrink-0 flex-col border-r border-border/80 bg-[#fbfbfc] dark:bg-[#16181d]">
      <div className="shrink-0 border-b border-border/80 px-3 py-3 space-y-2.5">
        <h2 className="text-[15px] font-semibold text-foreground tracking-tight">{t('chat.title')}</h2>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={channelSearch}
            onChange={(e) => onChannelSearchChange(e.target.value)}
            placeholder={t('chat.searchChannels')}
            className="h-8 pl-8 text-[13px] bg-background/80 border-border/70 rounded-md"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-4">
        <section>
          <div className="flex items-center justify-between px-1.5 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              {t('chat.channels')}
            </span>
            <button
              type="button"
              className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
              onClick={onToggleCreate}
              title={t('chat.createChannel')}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          {creating && (
            <div className="mb-2 px-1 space-y-1.5">
              <Input
                autoFocus
                placeholder={t('chat.channelNamePlaceholder')}
                value={newName}
                onChange={(e) => onNewNameChange(e.target.value)}
                className="h-8 text-[13px] rounded-md"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newName.trim()) onCreateChannel()
                  if (e.key === 'Escape') onToggleCreate()
                }}
              />
              {spaces.length > 0 && (
                <label className="block text-[12px] text-muted-foreground px-0.5 space-y-0.5">
                  <span>{t('chat.channelLocation')}</span>
                  <select
                    value={newSpaceId}
                    onChange={(e) => onNewSpaceIdChange(e.target.value)}
                    className="w-full h-8 rounded-md border border-border bg-background px-2 text-[13px] text-foreground"
                  >
                    <option value="">{t('chat.workspaceScope')}</option>
                    {spaces.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.icon ? `${s.icon} ` : ''}
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="flex items-center gap-2 text-[12px] text-muted-foreground px-0.5">
                <input
                  type="checkbox"
                  checked={newPrivate}
                  onChange={(e) => onNewPrivateChange(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-border"
                />
                {t('chat.privateChannel')}
              </label>
              <Button
                size="sm"
                className="h-7 w-full text-xs"
                disabled={!newName.trim() || createPending}
                onClick={onCreateChannel}
              >
                {createPending ? t('chat.creating') : t('chat.createChannel')}
              </Button>
            </div>
          )}

          <div className="space-y-0.5">
            {workspaceChannels.map((c) => (
              <ChannelRow
                key={c.id}
                active={selectedId === c.id}
                onClick={() => onSelectChannel(c.id)}
                icon={channelIcon(c)}
                label={c.name}
                unread={c.unreadCount ?? 0}
              />
            ))}
            {filteredChannels.length === 0 && !channelsLoading && (
              <p className="px-2 py-2 text-[12px] text-muted-foreground">{t('chat.noChannels')}</p>
            )}
          </div>

          {/* Space-scoped channel groups (Plan §6.1). */}
          {spaceGroups.map((group) => (
            <div key={group.spaceId} className="mt-2">
              <div className="flex items-center gap-1.5 px-1.5 mb-0.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                {group.space?.icon ? (
                  <span className="text-[12px] leading-none">{group.space.icon}</span>
                ) : null}
                <span className="truncate">{group.space?.name ?? t('chat.spaceChannels')}</span>
              </div>
              <div className="space-y-0.5">
                {group.channels.map((c) => (
                  <ChannelRow
                    key={c.id}
                    active={selectedId === c.id}
                    onClick={() => onSelectChannel(c.id)}
                    icon={channelIcon(c)}
                    label={c.name}
                    unread={c.unreadCount ?? 0}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Archived channels (Plan §6.1): collapsed by default, unarchive inline. */}
          <div className="mt-2">
            <button
              type="button"
              onClick={onToggleShowArchived}
              className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded-md text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
            >
              {showArchived ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <Archive className="h-3.5 w-3.5" />
              <span>{t('chat.archived')}</span>
              {archivedChannels.length > 0 && <span className="ml-auto normal-case tabular-nums">{archivedChannels.length}</span>}
            </button>
            {showArchived && (
              <div className="space-y-0.5 mt-0.5">
                {filteredArchived.length === 0 ? (
                  <p className="px-2 py-1.5 text-[12px] text-muted-foreground">{t('chat.noArchivedChannels')}</p>
                ) : (
                  filteredArchived.map((c) => (
                    <div
                      key={c.id}
                      className="group flex items-center gap-2 rounded-md px-2 py-[7px] text-[13px] text-foreground/70 hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
                    >
                      {channelIcon(c)}
                      <span className="truncate flex-1">{c.name}</span>
                      <button
                        type="button"
                        title={t('chat.unarchiveChannel')}
                        className="shrink-0 rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-black/[0.06] dark:hover:bg-white/[0.08]"
                        onClick={(e) => {
                          e.stopPropagation()
                          onUnarchiveChannel(c.id)
                        }}
                      >
                        <ArchiveRestore className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between px-1.5 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              {t('chat.directMessages')}
            </span>
            <button
              type="button"
              className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
              onClick={onToggleStartDm}
              title={t('chat.newMessage')}
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
            </button>
          </div>

          {startingDm && (
            <div className="mb-2 px-1 space-y-1">
              {dmCandidates.length === 0 ? (
                <p className="text-[11px] text-muted-foreground px-1 py-2 leading-relaxed">
                  {pendingInvites.length > 0
                    ? tCount('chat.invitesPending', pendingInvites.length)
                    : t('chat.inviteTeammates')}
                </p>
              ) : (
                <>
                  <p className="text-[11px] text-muted-foreground px-1 pb-0.5">
                    {t('chat.selectTeammates')}
                  </p>
                  {atPeerLimit && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 px-1 pb-0.5">
                      {t('chat.groupDmLimit', { count: MAX_GROUP_DM_MEMBERS })}
                    </p>
                  )}
                  <div className="space-y-0.5 max-h-48 overflow-y-auto">
                    {dmCandidates.map((m) => {
                      const checked = selectedPeers.includes(m.userId)
                      return (
                        <button
                          key={m.userId}
                          type="button"
                          disabled={startDmPending || (!checked && atPeerLimit)}
                          onClick={() => togglePeer(m.userId)}
                          className={cn(
                            'w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left disabled:opacity-60',
                            checked ? 'bg-violet-500/12' : 'hover:bg-violet-500/10',
                            !checked && atPeerLimit && 'cursor-not-allowed',
                          )}
                        >
                          <MemberAvatar label={initials(m.displayName || m.email)} status={statusOf(m.userId)} />
                          <span className="text-[13px] font-medium truncate text-foreground flex-1 min-w-0">
                            {m.displayName || m.email}
                          </span>
                          <span
                            className={cn(
                              'h-4 w-4 shrink-0 rounded border flex items-center justify-center',
                              checked ? 'bg-violet-600 border-violet-600 text-white' : 'border-border',
                            )}
                          >
                            {checked && <Check className="h-3 w-3" />}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  <Button
                    size="sm"
                    className="h-7 w-full text-xs"
                    disabled={selectedPeers.length === 0 || startDmPending}
                    onClick={() => {
                      if (selectedPeers.length === 0) return
                      onStartDm(selectedPeers)
                      setSelectedPeers([])
                    }}
                  >
                    {startDmPending
                      ? t('chat.starting')
                      : selectedPeers.length > 1
                        ? tCount('chat.messagePeople', selectedPeers.length)
                        : t('chat.message')}
                  </Button>
                </>
              )}
            </div>
          )}

          <div className="space-y-0.5">
            {filteredDms.map((c) => (
              <ChannelRow
                key={c.id}
                active={selectedId === c.id}
                onClick={() => onSelectChannel(c.id)}
                icon={
                  c.dmIsGroup ? (
                    <span className="h-5 w-5 shrink-0 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-white flex items-center justify-center">
                      <Users className="h-3 w-3" />
                    </span>
                  ) : (
                    <MemberAvatar label={initials(c.dmPeerName)} size="sm" status={statusOf(c.dmPeerId)} />
                  )
                }
                label={c.dmLabel ?? c.dmPeerName ?? t('chat.directMessage')}
                unread={c.unreadCount ?? 0}
              />
            ))}
            {filteredDms.length === 0 && !channelsLoading && (
              <p className="px-2 py-2 text-[12px] text-muted-foreground">{t('chat.noDms')}</p>
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
  status,
  size = 'md',
}: {
  label: string
  status?: PresenceStatus
  size?: 'sm' | 'md'
}) {
  const { t } = useTranslation()
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
      {status && status !== 'offline' && (
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-2 border-[#fbfbfc] dark:border-[#16181d]',
            presenceDotClass(status),
          )}
          title={status === 'online' ? t('chat.online') : t('chat.away')}
        />
      )}
    </div>
  )
}

import { useState, type ReactNode } from 'react'
import { Archive, ArchiveRestore, Check, ChevronDown, ChevronRight, FolderPlus, Hash, Lock, MessageSquarePlus, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Pencil, Plus, Search, Trash2, Users, X } from 'lucide-react'
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Input, cn } from '@rundesk/ui'
import type { ChatChannel, ChatChannelGroup, ChatMember, ChatSpace } from './chat-types'
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
  channelGroups,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onToggleGroupCollapsed,
  onAssignChannelToGroup,
  onRemoveChannelFromGroup,
  isCollapsed,
  onToggleCollapsed,
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
  // User-named channel groups (§A3.4).
  channelGroups: ChatChannelGroup[]
  onCreateGroup: (name: string) => void
  onRenameGroup: (groupId: string, name: string) => void
  onDeleteGroup: (groupId: string) => void
  onToggleGroupCollapsed: (groupId: string, isCollapsed: boolean) => void
  onAssignChannelToGroup: (groupId: string, channelId: string) => void
  onRemoveChannelFromGroup: (groupId: string, channelId: string) => void
  /** §1.3 [10:13] — the channel list collapsed to a rail of icons. */
  isCollapsed: boolean
  onToggleCollapsed: () => void
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

  // Channel groups (§A3.4): inline create + rename, and a drag target per group
  // so filing a channel is a drag rather than a trip through a menu.
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null)

  const q = channelSearch.trim().toLowerCase()
  const filteredChannels = q
    ? channels.filter((c) => c.name.toLowerCase().includes(q))
    : channels
  const dmName = (c: ChatChannel) => (c.dmLabel ?? c.dmPeerName ?? '').toLowerCase()
  const filteredDms = q ? dmChannels.filter((c) => dmName(c).includes(q)) : dmChannels
  const filteredArchived = q
    ? archivedChannels.filter((c) => c.name.toLowerCase().includes(q))
    : archivedChannels

  // User-named groups (§A3.4) win over space-derived grouping: a channel filed
  // into a bucket renders there and nowhere else, so the rail never doubles up.
  const groupIdByChannel = new Map<string, string>()
  for (const group of channelGroups) {
    for (const channelId of group.channelIds) groupIdByChannel.set(channelId, group.id)
  }
  const channelById = new Map(channels.map((c) => [c.id, c]))
  const ungroupedChannels = filteredChannels.filter((c) => !groupIdByChannel.has(c.id))

  // Group space-scoped channels under their space (Plan §6.1); workspace-level
  // channels (no spaceId) stay in the top list.
  const spaceById = new Map(spaces.map((s) => [s.id, s]))
  const workspaceChannels = ungroupedChannels.filter((c) => !c.spaceId)
  const channelsBySpace = new Map<string, ChatChannel[]>()
  for (const c of ungroupedChannels) {
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

  /*
   * §1.3 [10:13] — collapsed, this is a rail of channel icons.
   *
   * "agar main is ko off karoon to mujhe bas ICONS show hon — kyunke yeh SPACE
   * leta hai." That was said about the outer sidebar and it is the same answer
   * here, on the screen where the cost is actually paid: /chat stacked 288px of
   * workspace sidebar against 272px of channel list, and collapsing only the
   * outer one left the worse half of the problem in place.
   *
   * A rail rather than nothing at all. Hiding the list entirely means every
   * channel switch costs an expand and a re-collapse, which is how a collapse
   * control ends up unused.
   */
  if (isCollapsed) {
    const railChannels = [...channels, ...dmChannels]
    return (
      <aside
        data-testid="chat-panel-rail"
        data-collapsed="true"
        className="hidden md:flex w-[56px] shrink-0 flex-col items-center border-r border-border/80 bg-[#fbfbfc] py-2 dark:bg-[#16181d]"
      >
        <button
          type="button"
          data-testid="chat-panel-expand"
          title={t('chat.expandPanel')}
          aria-label={t('chat.expandPanel')}
          onClick={onToggleCollapsed}
          className="mb-2 flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.06]"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
        <div className="flex w-full flex-1 flex-col items-center gap-1 overflow-y-auto">
          {railChannels.map((c) => {
            const unread = c.unreadCount ?? 0
            const label = c.isDm ? c.dmLabel ?? c.dmPeerName ?? t('chat.directMessage') : `#${c.name}`
            return (
              <button
                key={`rail-${c.id}`}
                type="button"
                title={unread > 0 ? `${label} · ${unread}` : label}
                aria-label={label}
                onClick={() => onSelectChannel(c.id)}
                className={cn(
                  'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[12px] font-medium',
                  selectedId === c.id
                    ? 'bg-violet-500/15 text-violet-700 dark:text-violet-300'
                    : 'text-muted-foreground hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.06]',
                )}
              >
                {c.icon ? (
                  <span className="text-[13px] leading-none">{c.icon}</span>
                ) : c.isDm ? (
                  initials(c.dmLabel ?? c.dmPeerName ?? '?')
                ) : (
                  <Hash className="h-4 w-4" />
                )}
                {/* A dot, not a number: at 36px a count of 12 is unreadable,
                    and "there is something here" is the whole job. */}
                {unread > 0 && (
                  <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-violet-500" />
                )}
              </button>
            )
          })}
        </div>
      </aside>
    )
  }

  return (
    <aside
      data-testid="chat-panel"
      data-collapsed="false"
      className="hidden md:flex w-[272px] shrink-0 flex-col border-r border-border/80 bg-[#fbfbfc] dark:bg-[#16181d]"
    >
      <div className="shrink-0 border-b border-border/80 px-3 py-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-foreground tracking-tight">{t('chat.title')}</h2>
          <button
            type="button"
            data-testid="chat-panel-collapse"
            title={t('chat.collapsePanel')}
            aria-label={t('chat.collapsePanel')}
            onClick={onToggleCollapsed}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.06]"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
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
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                onClick={() => setCreatingGroup((v) => !v)}
                title={t('chat.newGroup')}
              >
                <FolderPlus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                onClick={onToggleCreate}
                title={t('chat.createChannel')}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
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

          {creatingGroup && (
            <div className="mb-2 px-1">
              <Input
                autoFocus
                placeholder={t('chat.groupNamePlaceholder')}
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                className="h-8 text-[13px] rounded-md"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newGroupName.trim()) {
                    onCreateGroup(newGroupName.trim())
                    setNewGroupName('')
                    setCreatingGroup(false)
                  }
                  if (e.key === 'Escape') {
                    setNewGroupName('')
                    setCreatingGroup(false)
                  }
                }}
              />
            </div>
          )}

          {/* User-named groups (§A3.4) — collapsible, renameable, drop targets. */}
          {channelGroups.map((group) => {
            const groupChannels = group.channelIds
              .map((id) => channelById.get(id))
              .filter((c): c is ChatChannel => !!c && (!q || c.name.toLowerCase().includes(q)))
            return (
              <div
                key={group.id}
                className={cn('mb-1 rounded-md', dragOverGroupId === group.id && 'bg-violet-500/10 ring-1 ring-violet-500/40')}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOverGroupId(group.id)
                }}
                onDragLeave={(e) => {
                  if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
                  setDragOverGroupId(null)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOverGroupId(null)
                  const channelId = e.dataTransfer.getData('text/rundesk-channel')
                  if (channelId) onAssignChannelToGroup(group.id, channelId)
                }}
              >
                <div className="group/hdr flex items-center gap-1 px-1.5 py-1">
                  <button
                    type="button"
                    onClick={() => onToggleGroupCollapsed(group.id, !group.isCollapsed)}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    {group.isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                  {/* The rename field lives outside the collapse button so a
                      click lands in the input instead of folding the group. */}
                  {renamingGroupId === group.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => setRenamingGroupId(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && renameValue.trim()) {
                          onRenameGroup(group.id, renameValue.trim())
                          setRenamingGroupId(null)
                        }
                        if (e.key === 'Escape') setRenamingGroupId(null)
                      }}
                      className="h-6 min-w-0 flex-1 rounded border border-border bg-background px-1.5 text-[12px] text-foreground"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => onToggleGroupCollapsed(group.id, !group.isCollapsed)}
                      className="min-w-0 flex-1 truncate text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground hover:text-foreground"
                    >
                      {group.name}
                    </button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        title={t('chat.groupActions')}
                        className="h-5 w-5 shrink-0 rounded text-muted-foreground opacity-0 group-hover/hdr:opacity-100 hover:text-foreground hover:bg-black/[0.06] dark:hover:bg-white/[0.08] flex items-center justify-center"
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-44">
                      <DropdownMenuItem
                        onClick={() => {
                          setRenamingGroupId(group.id)
                          setRenameValue(group.name)
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                        {t('chat.renameGroup')}
                      </DropdownMenuItem>
                      <DropdownMenuItem destructive onClick={() => onDeleteGroup(group.id)}>
                        <Trash2 className="h-4 w-4" />
                        {t('chat.deleteGroup')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        title={t('chat.addChannelToGroup')}
                        className="h-5 w-5 shrink-0 rounded text-muted-foreground opacity-0 group-hover/hdr:opacity-100 hover:text-foreground hover:bg-black/[0.06] dark:hover:bg-white/[0.08] flex items-center justify-center"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-64 w-52 overflow-y-auto">
                      {ungroupedChannels.length === 0 ? (
                        <DropdownMenuItem disabled>{t('chat.everyChannelGrouped')}</DropdownMenuItem>
                      ) : (
                        ungroupedChannels.map((c) => (
                          <DropdownMenuItem key={`add-${group.id}-${c.id}`} onClick={() => onAssignChannelToGroup(group.id, c.id)}>
                            <Hash className="h-4 w-4" />
                            {c.name}
                          </DropdownMenuItem>
                        ))
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {!group.isCollapsed && (
                  <div className="space-y-0.5">
                    {groupChannels.length === 0 ? (
                      <p className="px-2 py-1.5 text-[11px] text-muted-foreground">{t('chat.dropChannelHere')}</p>
                    ) : (
                      groupChannels.map((c) => (
                        <ChannelRow
                          key={c.id}
                          active={selectedId === c.id}
                          onClick={() => onSelectChannel(c.id)}
                          icon={channelIcon(c)}
                          label={c.name}
                          unread={c.unreadCount ?? 0}
                          channelId={c.id}
                          onRemove={() => onRemoveChannelFromGroup(group.id, c.id)}
                          removeTitle={t('chat.removeFromGroup')}
                        />
                      ))
                    )}
                  </div>
                )}
              </div>
            )
          })}

          <div className="space-y-0.5">
            {workspaceChannels.map((c) => (
              <ChannelRow
                key={c.id}
                active={selectedId === c.id}
                onClick={() => onSelectChannel(c.id)}
                icon={channelIcon(c)}
                label={c.name}
                unread={c.unreadCount ?? 0}
                channelId={c.id}
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
                    channelId={c.id}
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
  channelId,
  onRemove,
  removeTitle,
}: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  label: string
  unread?: number
  /** Set on channel rows so they can be dragged into a group (§A3.4). */
  channelId?: string
  onRemove?: () => void
  removeTitle?: string
}) {
  const hasUnread = unread > 0 && !active
  return (
    <div
      className={cn(
        'group/row flex items-center gap-1 rounded-md pr-1 transition-colors',
        active
          ? 'bg-violet-500/12'
          : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.05]',
      )}
      draggable={!!channelId}
      onDragStart={(e) => {
        if (!channelId) return
        e.dataTransfer.setData('text/rundesk-channel', channelId)
        e.dataTransfer.effectAllowed = 'move'
      }}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-[7px] text-left text-[13px]',
          active
            ? 'text-violet-700 dark:text-violet-200 font-medium'
            : hasUnread
              ? 'text-foreground font-semibold'
              : 'text-foreground/85',
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
      {onRemove && (
        <button
          type="button"
          title={removeTitle}
          onClick={onRemove}
          className="h-5 w-5 shrink-0 rounded text-muted-foreground opacity-0 group-hover/row:opacity-100 hover:text-foreground hover:bg-black/[0.06] dark:hover:bg-white/[0.08] flex items-center justify-center"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
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

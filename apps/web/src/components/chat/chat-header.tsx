import { Archive, Bookmark, Check, FileText, Hash, LogOut, Link as LinkIcon, MoreHorizontal, Pencil, Pin, Search, Star, UserPlus, Users, X } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
  toast,
} from '@rundesk/ui'
import type { ChatChannel, ChatMember } from './chat-types'
import { initials } from './chat-utils'
import { useFavorites, useToggleFavorite } from '../../lib/use-favorites'
import { usePresence, presenceDotClass } from '../../lib/use-presence'
import { useTranslation } from '../../lib/i18n'

export function ChatHeader({
  channel,
  workspaceId,
  memberCount,
  members,
  showPinnedPanel,
  onTogglePinned,
  showSavedPanel,
  onToggleSaved,
  showFilesPanel,
  onToggleFiles,
  showSearchPanel,
  onToggleSearch,
  onLeaveChannel,
  onAddPeople,
  onSetNotificationLevel,
  currentUserId,
  onRemoveMember,
  onEditChannel,
  onArchiveChannel,
}: {
  channel: ChatChannel | null
  workspaceId?: string
  memberCount: number
  members: ChatMember[]
  showPinnedPanel: boolean
  onTogglePinned: () => void
  showSavedPanel: boolean
  onToggleSaved: () => void
  // Workspace file library (§6.8) + message search (§6.11) side panels.
  showFilesPanel: boolean
  onToggleFiles: () => void
  showSearchPanel: boolean
  onToggleSearch: () => void
  onLeaveChannel: () => void
  onAddPeople?: () => void
  onSetNotificationLevel?: (level: 'all' | 'mentions' | 'none') => void
  currentUserId?: string
  onRemoveMember?: (userId: string) => void
  onEditChannel?: () => void
  onArchiveChannel?: () => void
}) {
  // The channel creator may remove other members / edit / archive (backend also
  // allows workspace admins; these controls are shown to the creator).
  const canRemoveMembers = !!channel?.createdById && channel.createdById === currentUserId
  const canManageChannel = !!channel && !channel.isDm && !!channel.createdById && channel.createdById === currentUserId
  const { t } = useTranslation()
  const title = channel?.isDm
    ? channel.dmLabel ?? channel.dmPeerName ?? t('chat.directMessage')
    : channel?.name ?? t('chat.selectAChannel')

  // Durable channel favorites (Plan §2). Only regular channels are favoritable
  // from here — DMs live in their own sidebar section and their #dm-… name
  // wouldn't read well as a pinned label.
  const { data: favorites } = useFavorites(workspaceId)
  const toggleFavorite = useToggleFavorite(workspaceId)
  // Presence for a 1:1 DM peer (group DMs have no single status).
  const { statusOf } = usePresence(workspaceId)
  const dmPeerStatus = channel?.isDm && !channel.dmIsGroup ? statusOf(channel.dmPeerId) : null
  const canFavorite = !!channel && !channel.isDm
  const starred = canFavorite && !!favorites?.some((f) => f.entityType === 'channel' && f.entityId === channel!.id)
  const toggleStar = () => {
    if (!canFavorite || !channel) return
    toggleFavorite.mutate({ entityType: 'channel', entityId: channel.id })
  }

  const copyLink = () => {
    try {
      void navigator.clipboard.writeText(window.location.href)
      toast.success(t('chat.channelLinkCopied'))
    } catch {
      toast.error(t('chat.couldNotCopyLink'))
    }
  }

  return (
    <header className="shrink-0 h-[52px] px-4 border-b border-border/80 bg-background flex items-center gap-3">
      {channel?.isDm ? (
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-xs font-semibold flex items-center justify-center shrink-0">
          {channel.dmIsGroup ? <Users className="h-4 w-4" /> : initials(channel.dmPeerName)}
        </div>
      ) : (
        <div className="h-8 w-8 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-300 flex items-center justify-center shrink-0">
          {channel?.icon ? <span className="text-[16px] leading-none">{channel.icon}</span> : <Hash className="h-4 w-4" />}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <h1 className="text-[15px] font-semibold text-foreground leading-tight truncate">
          {channel?.isDm ? title : `#${title}`}
        </h1>
        {dmPeerStatus ? (
          <p className="text-[12px] text-muted-foreground truncate flex items-center gap-1.5">
            <span className={cn('h-1.5 w-1.5 rounded-full', presenceDotClass(dmPeerStatus))} />
            {dmPeerStatus === 'online' ? t('chat.activeNow') : dmPeerStatus === 'away' ? t('chat.away') : t('chat.offline')}
          </p>
        ) : channel?.description ? (
          <p className="text-[12px] text-muted-foreground truncate">{channel.description}</p>
        ) : null}
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        {!channel?.isDm && onAddPeople && (
          <button
            type="button"
            onClick={onAddPeople}
            className="hidden sm:flex items-center gap-1.5 h-8 px-2.5 rounded-md text-[12px] text-muted-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
            title={t('chat.addPeople')}
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span>{t('chat.add')}</span>
          </button>
        )}
        {!channel?.isDm && memberCount > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="hidden sm:flex items-center gap-1.5 h-8 px-2.5 rounded-md text-[12px] text-muted-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06] mr-1"
                title={t('chat.members')}
              >
                <Users className="h-3.5 w-3.5" />
                <span>{memberCount}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-0">
              <div className="px-3 py-2 border-b border-border/60 text-[12px] font-semibold text-foreground">
                {t('chat.members')} · {memberCount}
              </div>
              <div className="max-h-72 overflow-y-auto p-1.5">
                {members.length === 0 ? (
                  <div className="px-2 py-1.5 text-[12px] text-muted-foreground">{t('chat.noMembers')}</div>
                ) : (
                  members.map((member) => (
                    <div
                      key={member.userId}
                      className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-muted/40"
                    >
                      <div className="h-6 w-6 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-[10px] font-semibold flex items-center justify-center shrink-0">
                        {initials(member.displayName || member.email)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-foreground truncate">
                          {member.displayName || member.email}
                          {member.userId === channel?.createdById && (
                            <span className="ml-1 text-[10px] text-muted-foreground">· {t('chat.owner')}</span>
                          )}
                        </div>
                        {member.displayName && (
                          <div className="text-[11px] text-muted-foreground truncate">{member.email}</div>
                        )}
                      </div>
                      {canRemoveMembers &&
                        member.userId !== channel?.createdById &&
                        member.userId !== currentUserId && (
                          <button
                            type="button"
                            title={t('chat.removeFromChannel')}
                            className="shrink-0 rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-500/10"
                            onClick={() => {
                              if (window.confirm(t('chat.removeMemberConfirm', { name: member.displayName || member.email }))) {
                                onRemoveMember?.(member.userId)
                              }
                            }}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                    </div>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
        )}
        <IconBtn
          icon={Search}
          title={t('chat.search')}
          active={showSearchPanel}
          onClick={onToggleSearch}
        />
        <IconBtn
          icon={FileText}
          title={t('chat.files')}
          active={showFilesPanel}
          onClick={onToggleFiles}
        />
        <IconBtn
          icon={Pin}
          title={t('chat.pinnedMessages')}
          active={showPinnedPanel}
          disabled={!channel}
          onClick={onTogglePinned}
        />
        <IconBtn
          icon={Bookmark}
          title={t('chat.savedMessages')}
          active={showSavedPanel}
          disabled={!channel}
          onClick={onToggleSaved}
        />
        {canFavorite && (
          <IconBtn
            icon={Star}
            title={starred ? t('chat.unfavorite') : t('chat.favorite')}
            active={starred}
            disabled={toggleFavorite.isPending}
            onClick={toggleStar}
          />
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title={t('chat.more')}
              disabled={!channel}
              className="h-8 w-8 rounded-md flex items-center justify-center transition-colors text-muted-foreground hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={copyLink}>
              <LinkIcon className="h-4 w-4" />
              {t('chat.copyLink')}
            </DropdownMenuItem>
            {canFavorite && (
              <DropdownMenuItem onClick={toggleStar}>
                {starred ? <Check className="h-4 w-4" /> : <Star className="h-4 w-4" />}
                {starred ? t('chat.removeFromFavorites') : t('chat.addToFavorites')}
              </DropdownMenuItem>
            )}
            {onSetNotificationLevel && (
              <>
                <DropdownMenuSeparator />
                {([
                  ['all', t('chat.allMessages')],
                  ['mentions', t('chat.onlyMentions')],
                  ['none', t('chat.mute')],
                ] as const).map(([level, label]) => (
                  <DropdownMenuItem key={level} onClick={() => onSetNotificationLevel(level)}>
                    {(channel?.notificationLevel ?? 'all') === level ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <span className="h-4 w-4" />
                    )}
                    {label}
                  </DropdownMenuItem>
                ))}
              </>
            )}
            {canManageChannel && (onEditChannel || onArchiveChannel) && (
              <>
                <DropdownMenuSeparator />
                {onEditChannel && (
                  <DropdownMenuItem onClick={onEditChannel}>
                    <Pencil className="h-4 w-4" />
                    {t('chat.editChannel')}
                  </DropdownMenuItem>
                )}
                {onArchiveChannel && (
                  <DropdownMenuItem onClick={onArchiveChannel}>
                    <Archive className="h-4 w-4" />
                    {t('chat.archiveChannel')}
                  </DropdownMenuItem>
                )}
              </>
            )}
            {!channel?.isDm && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onClick={onLeaveChannel}>
                  <LogOut className="h-4 w-4" />
                  {t('chat.leaveChannel')}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

function IconBtn({
  icon: Icon,
  title,
  active,
  onClick,
  disabled,
}: {
  icon: typeof Hash
  title: string
  active?: boolean
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'h-8 w-8 rounded-md flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        active
          ? 'text-violet-600 bg-violet-500/12 dark:text-violet-300'
          : 'text-muted-foreground hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06]',
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}

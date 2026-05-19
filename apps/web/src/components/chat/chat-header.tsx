import { Hash, MoreHorizontal, Pin, Search, Star, Users } from 'lucide-react'
import { cn } from '@rundesk/ui'
import type { ChatChannel } from './chat-types'
import { initials } from './chat-utils'

export function ChatHeader({
  channel,
  memberCount,
  showPinnedPanel,
  onTogglePinned,
}: {
  channel: ChatChannel | null
  memberCount: number
  showPinnedPanel: boolean
  onTogglePinned: () => void
}) {
  const title = channel?.isDm
    ? channel.dmPeerName ?? 'Direct message'
    : channel?.name ?? 'Select a channel'

  return (
    <header className="shrink-0 h-[52px] px-4 border-b border-border/80 bg-background flex items-center gap-3">
      {channel?.isDm ? (
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-xs font-semibold flex items-center justify-center shrink-0">
          {initials(channel.dmPeerName)}
        </div>
      ) : (
        <div className="h-8 w-8 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-300 flex items-center justify-center shrink-0">
          <Hash className="h-4 w-4" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <h1 className="text-[15px] font-semibold text-foreground leading-tight truncate">
          {channel?.isDm ? title : `#${title}`}
        </h1>
        {channel?.description && (
          <p className="text-[12px] text-muted-foreground truncate">{channel.description}</p>
        )}
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        {!channel?.isDm && memberCount > 0 && (
          <button
            type="button"
            className="hidden sm:flex items-center gap-1.5 h-8 px-2.5 rounded-md text-[12px] text-muted-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06] mr-1"
            title="Members"
          >
            <Users className="h-3.5 w-3.5" />
            <span>{memberCount}</span>
          </button>
        )}
        <IconBtn icon={Search} title="Search" />
        <IconBtn
          icon={Pin}
          title="Pinned messages"
          active={showPinnedPanel}
          onClick={onTogglePinned}
        />
        <IconBtn icon={Star} title="Favorite" />
        <IconBtn icon={MoreHorizontal} title="More" />
      </div>
    </header>
  )
}

function IconBtn({
  icon: Icon,
  title,
  active,
  onClick,
}: {
  icon: typeof Hash
  title: string
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'h-8 w-8 rounded-md flex items-center justify-center transition-colors',
        active
          ? 'text-violet-600 bg-violet-500/12 dark:text-violet-300'
          : 'text-muted-foreground hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06]',
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}

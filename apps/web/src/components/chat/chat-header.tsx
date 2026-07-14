import { useEffect, useRef, useState } from 'react'
import { Bookmark, Check, Hash, LogOut, Link as LinkIcon, MoreHorizontal, Pin, Search, Star, UserPlus, Users, X } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
  toast,
} from '@rundesk/ui'
import type { ChatChannel, ChatMember } from './chat-types'
import { initials } from './chat-utils'

export function ChatHeader({
  channel,
  memberCount,
  members,
  showPinnedPanel,
  onTogglePinned,
  showSavedPanel,
  onToggleSaved,
  search,
  onSearchChange,
  onLeaveChannel,
  onAddPeople,
}: {
  channel: ChatChannel | null
  memberCount: number
  members: ChatMember[]
  showPinnedPanel: boolean
  onTogglePinned: () => void
  showSavedPanel: boolean
  onToggleSaved: () => void
  search: string
  onSearchChange: (value: string) => void
  onLeaveChannel: () => void
  onAddPeople?: () => void
}) {
  const title = channel?.isDm
    ? channel.dmPeerName ?? 'Direct message'
    : channel?.name ?? 'Select a channel'

  const [searchOpen, setSearchOpen] = useState(false)
  const [starred, setStarred] = useState(false)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const starKey = channel ? `rundesk.chat.starred.${channel.id}` : null

  // Load persisted star state when the active channel changes.
  useEffect(() => {
    if (!starKey) {
      setStarred(false)
      return
    }
    try {
      setStarred(localStorage.getItem(starKey) === '1')
    } catch {
      setStarred(false)
    }
  }, [starKey])

  // Reset the inline search field when switching channels.
  useEffect(() => {
    setSearchOpen(false)
    onSearchChange('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel?.id])

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus()
  }, [searchOpen])

  const toggleStar = () => {
    if (!starKey) return
    const next = !starred
    setStarred(next)
    try {
      if (next) localStorage.setItem(starKey, '1')
      else localStorage.removeItem(starKey)
    } catch {
      // ignore localStorage failures
    }
    toast(next ? 'Channel added to favorites' : 'Removed from favorites')
  }

  const copyLink = () => {
    try {
      void navigator.clipboard.writeText(window.location.href)
      toast.success('Channel link copied')
    } catch {
      toast.error('Could not copy link')
    }
  }

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

      {searchOpen && (
        <div className="relative w-56 shrink-0">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search messages…"
            className="h-8 pl-7 pr-7 text-[13px]"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                onSearchChange('')
                setSearchOpen(false)
              }
            }}
          />
          <button
            type="button"
            title="Close search"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => {
              onSearchChange('')
              setSearchOpen(false)
            }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="flex items-center gap-0.5 shrink-0">
        {!channel?.isDm && onAddPeople && (
          <button
            type="button"
            onClick={onAddPeople}
            className="hidden sm:flex items-center gap-1.5 h-8 px-2.5 rounded-md text-[12px] text-muted-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
            title="Add people"
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span>Add</span>
          </button>
        )}
        {!channel?.isDm && memberCount > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="hidden sm:flex items-center gap-1.5 h-8 px-2.5 rounded-md text-[12px] text-muted-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06] mr-1"
                title="Members"
              >
                <Users className="h-3.5 w-3.5" />
                <span>{memberCount}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-0">
              <div className="px-3 py-2 border-b border-border/60 text-[12px] font-semibold text-foreground">
                Members · {memberCount}
              </div>
              <div className="max-h-72 overflow-y-auto p-1.5">
                {members.length === 0 ? (
                  <div className="px-2 py-1.5 text-[12px] text-muted-foreground">No members to show.</div>
                ) : (
                  members.map((member) => (
                    <div
                      key={member.userId}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-muted/40"
                    >
                      <div className="h-6 w-6 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-[10px] font-semibold flex items-center justify-center shrink-0">
                        {initials(member.displayName || member.email)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-foreground truncate">
                          {member.displayName || member.email}
                        </div>
                        {member.displayName && (
                          <div className="text-[11px] text-muted-foreground truncate">{member.email}</div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
        )}
        <IconBtn
          icon={Search}
          title="Search"
          active={searchOpen}
          disabled={!channel}
          onClick={() => setSearchOpen((v) => !v)}
        />
        <IconBtn
          icon={Pin}
          title="Pinned messages"
          active={showPinnedPanel}
          disabled={!channel}
          onClick={onTogglePinned}
        />
        <IconBtn
          icon={Bookmark}
          title="Saved messages"
          active={showSavedPanel}
          disabled={!channel}
          onClick={onToggleSaved}
        />
        <IconBtn
          icon={Star}
          title={starred ? 'Unfavorite' : 'Favorite'}
          active={starred}
          disabled={!channel}
          onClick={toggleStar}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title="More"
              disabled={!channel}
              className="h-8 w-8 rounded-md flex items-center justify-center transition-colors text-muted-foreground hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={copyLink}>
              <LinkIcon className="h-4 w-4" />
              Copy link
            </DropdownMenuItem>
            <DropdownMenuItem onClick={toggleStar}>
              {starred ? <Check className="h-4 w-4" /> : <Star className="h-4 w-4" />}
              {starred ? 'Remove from favorites' : 'Add to favorites'}
            </DropdownMenuItem>
            {!channel?.isDm && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onClick={onLeaveChannel}>
                  <LogOut className="h-4 w-4" />
                  Leave channel
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

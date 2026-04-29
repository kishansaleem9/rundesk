import { useState } from 'react'
import {
  Card,
  Button,
  Badge,
  PersonAvatar,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  cn,
} from '@rundesk/ui'
import {
  X,
  Pin,
  Bookmark,
  Smile,
  Reply,
  Paperclip,
  Send,
  MoreHorizontal,
  Hash,
  Search,
} from 'lucide-react'

type Reply = {
  id: string
  author: string
  body: string
  timestamp: string
  reactions?: { emoji: string; count: number; mine?: boolean }[]
}

const PARENT = {
  id: 'm1',
  author: 'Hamda Tahir',
  body: 'Hey team — I just merged the Workload heat-map. Quick demo in #general? Want feedback before I tackle the polish pass.',
  timestamp: '2:14 PM',
  channel: 'engineering',
  pinned: true,
}

const REPLIES: Reply[] = [
  {
    id: 'r1',
    author: 'Afzaal Ali',
    body: 'Looks 🔥 — does it pull from real assignee data yet?',
    timestamp: '2:18 PM',
    reactions: [{ emoji: '🔥', count: 3 }, { emoji: '👀', count: 1 }],
  },
  {
    id: 'r2',
    author: 'Hamda Tahir',
    body: 'Not yet — currently seeded. Backend endpoint is the next PR.',
    timestamp: '2:19 PM',
  },
  {
    id: 'r3',
    author: 'Iqra Khalid',
    body: 'The capacity badges are sweet. Could we surface "overloaded" with a bell-style indicator on the sidebar?',
    timestamp: '2:24 PM',
    reactions: [{ emoji: '💡', count: 2, mine: true }],
  },
  {
    id: 'r4',
    author: 'Mali Acme',
    body: 'Demo at 4? I can join from the office.',
    timestamp: '2:31 PM',
  },
]

export function ChatThreadPanel({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [reply, setReply] = useState('')
  if (!open) return null

  return (
    <aside className="hidden lg:flex w-[380px] shrink-0 border-l border-border/40 bg-card/30 backdrop-blur-md flex-col h-full animate-slide-up">
      <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border/40">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Reply className="h-3 w-3" />
            Thread in <span className="text-foreground font-medium">#{PARENT.channel}</span>
          </div>
          <div className="font-display text-base font-semibold mt-0.5">
            {REPLIES.length} replies
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </header>

      <div className="flex-1 overflow-auto px-4 py-4 space-y-4">
        {/* Parent message */}
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-3">
          <div className="flex items-start gap-2.5">
            <PersonAvatar name={PARENT.author} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium">{PARENT.author}</span>
                <span className="text-muted-foreground">{PARENT.timestamp}</span>
                {PARENT.pinned && (
                  <Badge variant="info" className="text-[9px] uppercase">
                    <Pin className="h-2.5 w-2.5" /> Pinned
                  </Badge>
                )}
              </div>
              <p className="text-sm mt-1 leading-relaxed">{PARENT.body}</p>
            </div>
          </div>
        </div>

        {/* Replies */}
        {REPLIES.map((r) => (
          <div key={r.id} className="group flex items-start gap-2.5">
            <PersonAvatar name={r.author} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium">{r.author}</span>
                <span className="text-muted-foreground">{r.timestamp}</span>
              </div>
              <p className="text-sm mt-0.5 leading-relaxed">{r.body}</p>
              {r.reactions && (
                <div className="flex items-center gap-1 mt-1.5">
                  {r.reactions.map((rx) => (
                    <button
                      key={rx.emoji}
                      className={cn(
                        'flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] transition-colors',
                        rx.mine
                          ? 'border-accent/50 bg-accent/15'
                          : 'border-border/50 bg-card/60 hover:border-border',
                      )}
                    >
                      <span>{rx.emoji}</span>
                      <span className="tabular-nums">{rx.count}</span>
                    </button>
                  ))}
                  <button className="rounded-full p-1 text-muted-foreground hover:bg-card/60 hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                    <Smile className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="rounded p-1 text-muted-foreground hover:bg-card/60 hover:text-foreground">
                    <Smile className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>React</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="rounded p-1 text-muted-foreground hover:bg-card/60 hover:text-foreground">
                    <Bookmark className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Save</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="rounded p-1 text-muted-foreground hover:bg-card/60 hover:text-foreground">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>More</TooltipContent>
              </Tooltip>
            </div>
          </div>
        ))}
      </div>

      {/* Composer */}
      <div className="border-t border-border/40 p-3">
        <div className="rounded-lg border border-border/60 bg-card focus-within:border-accent/50 transition-colors">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Reply in thread…"
            className="w-full resize-none bg-transparent px-3 py-2.5 text-sm focus:outline-none"
            rows={2}
          />
          <div className="flex items-center justify-between border-t border-border/30 px-2 py-1.5">
            <div className="flex items-center gap-0.5">
              <Button variant="ghost" size="icon-sm">
                <Smile className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon-sm">
                <Paperclip className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="gradient" size="sm" className="h-7" disabled={!reply.trim()}>
              <Send className="h-3.5 w-3.5" /> Reply
            </Button>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">
          <kbd className="px-1 rounded bg-muted/50 font-mono">⏎</kbd> to send,{' '}
          <kbd className="px-1 rounded bg-muted/50 font-mono">⇧⏎</kbd> for new line
        </p>
      </div>
    </aside>
  )
}

// ---------------------------------------------------------------------------
// Pinned messages + bookmarks side panel (works alongside thread or solo)
// ---------------------------------------------------------------------------

type PinnedItem = {
  id: string
  author: string
  body: string
  channel: string
  pinnedAt: string
  pinnedBy: string
}

const PINS: PinnedItem[] = [
  {
    id: 'p1',
    author: 'Afzaal Ali',
    body: 'Brand is locked: Aura palette, dark-first. Don\'t change tokens without a design review.',
    channel: 'engineering',
    pinnedAt: '2 days ago',
    pinnedBy: 'Hamda Tahir',
  },
  {
    id: 'p2',
    author: 'Hamda Tahir',
    body: 'PR template lives in docs → Engineering wiki. Fill all sections, especially "test plan".',
    channel: 'engineering',
    pinnedAt: '1 week ago',
    pinnedBy: 'Afzaal Ali',
  },
]

const BOOKMARKS: PinnedItem[] = [
  {
    id: 'b1',
    author: 'Iqra Khalid',
    body: 'Found a great gradient pattern from Stripe — pasting Figma here.',
    channel: 'design',
    pinnedAt: '3 hours ago',
    pinnedBy: 'You',
  },
]

export function PinnedAndBookmarksPanel({
  mode,
  onClose,
}: {
  mode: 'pinned' | 'bookmarks'
  onClose: () => void
}) {
  const items = mode === 'pinned' ? PINS : BOOKMARKS
  const Icon = mode === 'pinned' ? Pin : Bookmark
  return (
    <aside className="hidden lg:flex w-[380px] shrink-0 border-l border-border/40 bg-card/30 backdrop-blur-md flex-col h-full animate-slide-up">
      <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border/40">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-accent" />
          <div className="font-display text-base font-semibold capitalize">
            {mode === 'pinned' ? 'Pinned messages' : 'Saved messages'}
          </div>
          <Badge variant="soft" className="text-[10px]">{items.length}</Badge>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </header>

      <div className="px-4 py-3 border-b border-border/40">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            placeholder={mode === 'pinned' ? 'Search pinned…' : 'Search saved…'}
            className="w-full h-8 rounded-md border border-border/60 bg-card pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-2">
        {items.map((item) => (
          <Card key={item.id} className="p-3 group hover:border-accent/30 transition-colors">
            <div className="flex items-start gap-2.5">
              <PersonAvatar name={item.author} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-medium">{item.author}</span>
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Hash className="h-3 w-3" />
                    {item.channel}
                  </span>
                </div>
                <p className="text-sm mt-1 leading-relaxed">{item.body}</p>
                <div className="text-[10px] text-muted-foreground mt-1.5">
                  {mode === 'pinned' ? `Pinned by ${item.pinnedBy}` : `Saved`} · {item.pinnedAt}
                </div>
              </div>
              <button className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </Card>
        ))}
      </div>
    </aside>
  )
}

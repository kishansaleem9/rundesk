import { useState } from 'react'
import {
  Card,
  Button,
  Badge,
  Input,
  PersonAvatar,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  cn,
} from '@rundesk/ui'
import {
  ChevronRight,
  ChevronDown,
  Plus,
  FileText,
  Search,
  History,
  Star,
  MoreHorizontal,
  GitCompareArrows,
  ArrowLeft,
  Sparkles,
  Layers,
} from 'lucide-react'

// ─── Nested doc tree ────────────────────────────────────────────────────────

type DocNode = {
  id: string
  title: string
  emoji: string
  pinned?: boolean
  children?: DocNode[]
}

const TREE: DocNode[] = [
  {
    id: 'eng',
    title: 'Engineering',
    emoji: '🛠',
    children: [
      { id: 'arch', title: 'Architecture', emoji: '📐' },
      { id: 'pr', title: 'PR template', emoji: '📝', pinned: true },
      {
        id: 'runbooks',
        title: 'Runbooks',
        emoji: '🚨',
        children: [
          { id: 'rb-incident', title: 'Incident response', emoji: '🔥' },
          { id: 'rb-deploy', title: 'Deploys', emoji: '🚀' },
        ],
      },
    ],
  },
  {
    id: 'product',
    title: 'Product',
    emoji: '📦',
    children: [
      { id: 'roadmap', title: 'Roadmap Q3', emoji: '🗺', pinned: true },
      { id: 'okr', title: 'OKRs', emoji: '🎯' },
      { id: 'discovery', title: 'Discovery notes', emoji: '🔍' },
    ],
  },
  {
    id: 'meetings',
    title: 'Meeting notes',
    emoji: '🗣',
    children: [
      { id: 'standup', title: 'Daily standup', emoji: '☀️' },
      { id: '1on1', title: '1:1s', emoji: '💬' },
      { id: 'retro', title: 'Sprint retros', emoji: '🔄' },
    ],
  },
]

export function DocSidebarTree({ activeId = 'pr' }: { activeId?: string }) {
  const [search, setSearch] = useState('')
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-3 border-b border-border/40">
        <Input
          leadingIcon={<Search className="h-3.5 w-3.5" />}
          placeholder="Search docs…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-xs"
        />
      </div>
      <div className="px-2 py-2 flex-1 overflow-auto space-y-0.5">
        <SectionLabel>Pinned</SectionLabel>
        <FlatRow emoji="🗺" title="Roadmap Q3" active={false} />
        <FlatRow emoji="📝" title="PR template" active={activeId === 'pr'} />
        <SectionLabel className="pt-2">Workspace</SectionLabel>
        {TREE.map((n) => (
          <Branch key={n.id} node={n} depth={0} activeId={activeId} />
        ))}
        <button className="w-full mt-2 flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-card/60 hover:text-foreground transition-colors">
          <Plus className="h-3 w-3" />
          New page
        </button>
      </div>
    </div>
  )
}

function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-2 pb-1', className)}>
      {children}
    </div>
  )
}

function FlatRow({ emoji, title, active }: { emoji: string; title: string; active: boolean }) {
  return (
    <div
      className={cn(
        'group flex items-center gap-1.5 px-2 py-1 rounded-md text-sm transition-colors cursor-pointer',
        active
          ? 'bg-accent/15 text-foreground font-medium'
          : 'hover:bg-card/60 text-muted-foreground hover:text-foreground',
      )}
    >
      <span className="text-xs">{emoji}</span>
      <span className="truncate flex-1">{title}</span>
      <button className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-card/80 rounded">
        <MoreHorizontal className="h-3 w-3" />
      </button>
    </div>
  )
}

function Branch({ node, depth, activeId }: { node: DocNode; depth: number; activeId: string }) {
  const [open, setOpen] = useState(true)
  const hasKids = node.children && node.children.length > 0
  const isActive = node.id === activeId
  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-0.5 px-2 py-1 rounded-md text-sm transition-colors',
          isActive
            ? 'bg-accent/15 text-foreground font-medium'
            : 'hover:bg-card/60 text-muted-foreground hover:text-foreground',
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {hasKids ? (
          <button onClick={() => setOpen((v) => !v)} className="p-0.5 text-muted-foreground/70 hover:text-foreground">
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <span className="text-xs mr-0.5">{node.emoji}</span>
        <span className="truncate flex-1 cursor-pointer">{node.title}</span>
        {node.pinned && <Star className="h-2.5 w-2.5 text-amber" />}
        <button className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-card/80 rounded text-muted-foreground">
          <Plus className="h-3 w-3" />
        </button>
      </div>
      {open && hasKids && (
        <div>
          {node.children!.map((c) => (
            <Branch key={c.id} node={c} depth={depth + 1} activeId={activeId} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Version history dialog ────────────────────────────────────────────────

type Version = {
  id: string
  label: string
  author: string
  timestamp: string
  added: number
  removed: number
  current?: boolean
}

const VERSIONS: Version[] = [
  { id: 'v1', label: 'Now', author: 'Hamda Tahir', timestamp: 'Just now', added: 0, removed: 0, current: true },
  { id: 'v2', label: '2 minutes ago', author: 'Hamda Tahir', timestamp: '2:46 PM', added: 14, removed: 3 },
  { id: 'v3', label: '1 hour ago', author: 'Afzaal Ali', timestamp: '1:30 PM', added: 24, removed: 0 },
  { id: 'v4', label: '3 hours ago', author: 'Iqra Khalid', timestamp: '11:20 AM', added: 8, removed: 12 },
  { id: 'v5', label: 'Yesterday', author: 'Afzaal Ali', timestamp: 'Apr 28, 4:12 PM', added: 56, removed: 4 },
  { id: 'v6', label: '2 days ago', author: 'Mali Acme', timestamp: 'Apr 27, 9:08 AM', added: 33, removed: 2 },
  { id: 'v7', label: 'Original', author: 'Afzaal Ali', timestamp: 'Apr 24', added: 0, removed: 0 },
]

export function VersionHistoryDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [active, setActive] = useState<string>('v3')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl p-0 grid grid-cols-1 md:grid-cols-[260px_1fr] gap-0 max-h-[85vh] overflow-hidden">
        <div className="border-r border-border/40 bg-card/30 flex flex-col">
          <DialogHeader className="px-4 pt-4 pb-3 border-b border-border/40">
            <DialogTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4 text-accent" /> Version history
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {VERSIONS.map((v) => (
              <button
                key={v.id}
                onClick={() => setActive(v.id)}
                className={cn(
                  'w-full text-left px-4 py-2.5 border-b border-border/30 last:border-0 transition-colors',
                  active === v.id ? 'bg-accent/10' : 'hover:bg-card/40',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate flex-1">{v.label}</span>
                  {v.current && <Badge variant="success" className="text-[9px] uppercase">Current</Badge>}
                </div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                  <PersonAvatar name={v.author} size="sm" className="h-4 w-4 text-[8px]" />
                  {v.author} · {v.timestamp}
                </div>
                {(v.added > 0 || v.removed > 0) && (
                  <div className="text-[10px] mt-1 flex items-center gap-2">
                    <span className="text-success">+{v.added}</span>
                    <span className="text-destructive">−{v.removed}</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border/40">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to now
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm">
                <GitCompareArrows className="h-3.5 w-3.5" /> Compare
              </Button>
              <Button variant="gradient" size="sm">
                Restore this version
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-auto px-6 py-5 prose prose-sm prose-invert max-w-none">
            <h2>PR template — v{VERSIONS.findIndex((x) => x.id === active) + 1}</h2>
            <p className="text-muted-foreground">
              Snapshot from {VERSIONS.find((v) => v.id === active)?.timestamp}.
            </p>
            <h3>Summary</h3>
            <p>One paragraph on what&apos;s changing and why.</p>
            <h3>Test plan</h3>
            <ul>
              <li>Unit tests cover the new branches</li>
              <li>Manual smoke against staging</li>
              <li>Verify dark + light mode parity</li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Doc templates picker ──────────────────────────────────────────────────

const DOC_TEMPLATES = [
  { id: 'meeting', name: 'Meeting notes', emoji: '🗣', desc: 'Attendees, agenda, action items.' },
  { id: 'project-brief', name: 'Project brief', emoji: '📦', desc: 'Goals, scope, success criteria.' },
  { id: 'sop', name: 'SOP', emoji: '📋', desc: 'Step-by-step process you can hand off.' },
  { id: 'retro', name: 'Sprint retro', emoji: '🔄', desc: 'Start / Stop / Continue.' },
  { id: 'rfc', name: 'RFC', emoji: '📐', desc: 'Decision proposal with alternatives.' },
  { id: 'one-on-one', name: '1:1 agenda', emoji: '💬', desc: 'Persistent agenda + parking lot.' },
  { id: 'changelog', name: 'Changelog', emoji: '📝', desc: 'What shipped, who shipped it.' },
  { id: 'onboard', name: 'New-hire onboarding', emoji: '🎓', desc: 'Day-1 to day-30.' },
]

export function DocTemplatesDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-accent" /> Pick a doc template
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {DOC_TEMPLATES.map((t) => (
            <button
              key={t.id}
              className="text-left rounded-lg border border-border/50 bg-card/40 p-3 hover:border-accent/40 hover:bg-card/70 hover:shadow-glow transition-all"
              onClick={() => onOpenChange(false)}
            >
              <div className="flex items-center gap-2.5 mb-1">
                <span className="text-lg">{t.emoji}</span>
                <span className="text-sm font-medium">{t.name}</span>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">{t.desc}</p>
            </button>
          ))}
        </div>
        <div className="border-t border-border/40 pt-3 mt-1 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Blank page
          </Button>
          <Button variant="gradient" size="sm">
            <Sparkles className="h-3.5 w-3.5" /> AI-generate from a prompt
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

import { Link, useParams, useRouterState } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bot,
  Briefcase,
  ChartNoAxesCombined,
  ClipboardList,
  Ellipsis,
  FileText,
  FolderOpen,
  Frame,
  Hash,
  Home,
  Inbox,
  LayoutDashboard,
  MessageCircle,
  Plus,
  Search,
  Star,
  Users,
} from 'lucide-react'
import { Button, Input, cn } from '@rundesk/ui'

export function WorkspaceSidebar() {
  const params = useParams({ strict: false }) as { workspaceId?: string }
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const workspaceId = params.workspaceId
  const [lastWorkspaceId, setLastWorkspaceId] = useState<string | null>(null)
  const baseWorkspaceId = workspaceId ?? lastWorkspaceId
  const base = baseWorkspaceId ? `/app/${baseWorkspaceId}` : '/app'
  const [visibility, setVisibility] = useState<Partial<Record<HubId, boolean>>>({})
  const [openHub, setOpenHub] = useState<HubId | null>(null)
  const [hoverHub, setHoverHub] = useState<HubId | null>(null)
  const [panelHovered, setPanelHovered] = useState(false)
  const [draggingDock, setDraggingDock] = useState(false)
  const [dockPos, setDockPos] = useState<{ x: number; y: number }>({ x: 16, y: 16 })
  const [viewport, setViewport] = useState({ w: 1400, h: 900 })
  const panelRef = useRef<HTMLDivElement | null>(null)
  const dockRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const read = () => {
      try {
        const raw = localStorage.getItem('rundesk.sidebarVisibility')
        if (!raw) return
        const parsed = JSON.parse(raw) as { visibility?: Partial<Record<HubId, boolean>> }
        if (parsed.visibility) setVisibility(parsed.visibility)
      } catch {
        // ignore invalid local storage payloads
      }
    }
    read()
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === 'rundesk.sidebarVisibility') read()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    try {
      const remembered = localStorage.getItem('rundesk.lastWorkspaceId')
      if (remembered) setLastWorkspaceId(remembered)
    } catch {
      // noop
    }
  }, [])

  useEffect(() => {
    if (!workspaceId) return
    try {
      localStorage.setItem('rundesk.lastWorkspaceId', workspaceId)
      setLastWorkspaceId(workspaceId)
    } catch {
      // noop
    }
  }, [workspaceId])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('rundesk.dockPos')
      if (!raw) return
      const parsed = JSON.parse(raw) as { x?: number; y?: number }
      if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
        setDockPos({ x: Number(parsed.x), y: Number(parsed.y) })
      }
    } catch {
      // noop
    }
  }, [])

  useEffect(() => {
    const sync = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
    sync()
    window.addEventListener('resize', sync)
    return () => window.removeEventListener('resize', sync)
  }, [])

  const activeHub = getActiveHub(pathname, base)
  const items = useMemo<Array<{ id: HubId; label: string; to: string; icon: typeof Home }>>(
    () => [
      { id: 'home', label: 'Home', to: base, icon: Home },
      { id: 'ai', label: 'AI', to: `${base}/ai`, icon: Bot },
      { id: 'teams', label: 'Teams', to: `${base}/chat`, icon: Users },
      { id: 'docs', label: 'Docs', to: `${base}/docs`, icon: FileText },
      { id: 'dashboard', label: 'Dashboards', to: `${base}/dashboard`, icon: LayoutDashboard },
      { id: 'whiteboards', label: 'Whiteboards', to: `${base}/whiteboards`, icon: Frame },
      { id: 'forms', label: 'Forms', to: `${base}/forms`, icon: ClipboardList },
      { id: 'more', label: 'More', to: `${base}/integrations`, icon: Ellipsis },
    ],
    [base],
  )

  useEffect(() => {
    setOpenHub(null)
  }, [pathname])

  useEffect(() => {
    if (!openHub || panelHovered) return
    const timer = window.setTimeout(() => setOpenHub(null), 4500)
    return () => window.clearTimeout(timer)
  }, [openHub, panelHovered])

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (panelRef.current?.contains(target) || dockRef.current?.contains(target)) return
      setOpenHub(null)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  const panelTop = Math.max(16, dockPos.y - 420)
  const panelLeft = Math.min(dockPos.x, Math.max(16, viewport.w - 340))

  return (
    <>
      <div
        ref={panelRef}
        className={cn(
          'fixed z-40 w-[320px] max-w-[calc(100vw-2rem)] max-h-[68vh] overflow-hidden rounded-2xl border border-white/20 bg-card/85 backdrop-blur-xl shadow-2xl transition-all duration-250',
          openHub ? 'translate-y-0 opacity-100 pointer-events-auto' : 'translate-y-4 opacity-0 pointer-events-none',
        )}
        style={{ left: panelLeft, top: panelTop }}
        onMouseEnter={() => setPanelHovered(true)}
        onMouseLeave={() => setPanelHovered(false)}
      >
        <SidebarHeader hub={openHub ?? activeHub} />
        <div className="px-3 pt-2 pb-1">
          <Link
            to={base}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/70 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent/15 transition-colors"
            onClick={() => setOpenHub(null)}
          >
            <Home className="h-3 w-3" />
            Go to Home
          </Link>
        </div>
        <div className="px-3 pb-3">
          <Input
            placeholder="Search"
            leadingIcon={<Search className="h-3.5 w-3.5" />}
            className="h-8 bg-background/60 border-border/70 text-xs"
          />
        </div>
        <nav className="overflow-y-auto px-2 pb-3 text-[13px] max-h-[46vh]">
          <HubPanel hub={openHub ?? activeHub} visibility={visibility} />
        </nav>
      </div>
      <div
        ref={dockRef}
        className={cn(
          'fixed z-50 flex items-center gap-1.5 rounded-full border border-border/60 bg-card/80 p-1.5 backdrop-blur-xl cursor-grab active:cursor-grabbing',
          draggingDock && 'select-none',
        )}
        style={{ left: dockPos.x, bottom: dockPos.y }}
        onMouseDown={(e) => {
          const target = e.target as HTMLElement
          if (target.closest('a')) return
          e.preventDefault()
          setDraggingDock(true)
          const startX = e.clientX
          const startY = e.clientY
          const baseX = dockPos.x
          const baseY = dockPos.y
          let latest = { x: baseX, y: baseY }
          const move = (evt: MouseEvent) => {
            const nextX = Math.min(Math.max(8, baseX + (evt.clientX - startX)), viewport.w - 380)
            const nextY = Math.min(Math.max(8, baseY - (evt.clientY - startY)), viewport.h - 72)
            latest = { x: nextX, y: nextY }
            setDockPos(latest)
          }
          const up = () => {
            setDraggingDock(false)
            window.removeEventListener('mousemove', move)
            window.removeEventListener('mouseup', up)
            try {
              localStorage.setItem('rundesk.dockPos', JSON.stringify(latest))
            } catch {
              // noop
            }
          }
          window.addEventListener('mousemove', move)
          window.addEventListener('mouseup', up)
        }}
      >
        {items
          .filter((item) => visibility[item.id] !== false)
          .map((item) => {
            const Icon = item.icon
            const isActive = activeHub === item.id
            const isOpen = openHub === item.id
            const showLabel = hoverHub === item.id
            return (
              <div key={item.id} className="relative">
                {showLabel && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap rounded-md border border-white/20 bg-card/90 px-2 py-1 text-[11px] text-foreground shadow-lg">
                    {item.label}
                  </div>
                )}
                <div className="rounded-full p-[1px] transition-all">
                  <Link
                    to={item.to}
                    onClick={() => setOpenHub((cur) => (cur === item.id ? null : item.id))}
                    onMouseEnter={() => setHoverHub(item.id)}
                    onMouseLeave={() => setHoverHub(null)}
                    className={cn(
                      'h-9 w-9 rounded-full flex items-center justify-center transition-colors',
                      isOpen || isActive
                        ? 'bg-brand-gradient text-white'
                        : 'bg-transparent hover:bg-accent/15',
                      item.id === 'home' && !isActive && !isOpen && 'text-blue-500',
                      item.id === 'ai' && !isActive && !isOpen && 'text-violet-500',
                      item.id === 'teams' && !isActive && !isOpen && 'text-cyan-500',
                      item.id === 'docs' && !isActive && !isOpen && 'text-emerald-500',
                      item.id === 'dashboard' && !isActive && !isOpen && 'text-amber-500',
                      item.id === 'whiteboards' && !isActive && !isOpen && 'text-pink-500',
                      item.id === 'forms' && !isActive && !isOpen && 'text-orange-500',
                      item.id === 'more' && !isActive && !isOpen && 'text-muted-foreground',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            )
          })}
      </div>
    </>
  )
}

function SidebarHeader({ hub }: { hub: HubId }) {
  const title: Record<HubId, string> = {
    home: 'Rundesk Space',
    ai: 'AI',
    teams: 'Teams',
    docs: 'Docs',
    dashboard: 'Dashboards',
    whiteboards: 'Whiteboards',
    forms: 'Forms',
    more: 'More',
  }
  return (
    <div className="px-3 py-3 border-b border-border/50">
      <div className="flex items-center gap-2">
        <div className="h-5 w-5 rounded bg-brand-gradient" />
        <div className="text-sm font-semibold truncate">{title[hub]}</div>
        <Button size="sm" className="ml-auto h-7 text-xs px-2">
          <Plus className="h-3.5 w-3.5 mr-1" />
          Create
        </Button>
      </div>
    </div>
  )
}

type HubId = 'home' | 'ai' | 'teams' | 'docs' | 'dashboard' | 'whiteboards' | 'forms' | 'more'

function getActiveHub(pathname: string, base: string): HubId {
  if (pathname.startsWith(`${base}/ai`)) return 'ai'
  if (pathname.startsWith(`${base}/chat`)) return 'teams'
  if (pathname.startsWith(`${base}/docs`)) return 'docs'
  if (pathname.startsWith(`${base}/dashboard`)) return 'dashboard'
  if (pathname.startsWith(`${base}/whiteboards`)) return 'whiteboards'
  if (pathname.startsWith(`${base}/forms`)) return 'forms'
  if (pathname.startsWith(`${base}/integrations`)) return 'more'
  return 'home'
}

function HubPanel({
  hub,
  visibility,
}: {
  hub: HubId
  visibility: Partial<Record<HubId, boolean>>
}) {
  if (visibility[hub] === false) {
    return (
      <Section title="Disabled by Super Admin">
        <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-[11px] text-muted-foreground">
          This hub is disabled for your organization.
        </div>
      </Section>
    )
  }
  if (hub === 'ai') {
    return (
      <>
        <Section title="AI">
          <SidebarItem icon={Bot} label="Ask or Create" />
        </Section>
        <Section title="Super Agents">
          <SidebarItem icon={Briefcase} label="Create Agent" />
          <SidebarItem icon={Users} label="All Agents" />
          <SidebarItem icon={Users} label="My Agents" />
          <SidebarItem icon={ChartNoAxesCombined} label="Activity" />
        </Section>
        <Section title="Recent Super Agents">
          <SidebarItem icon={Users} label="Onboarding Assistant" />
        </Section>
        <Section title="Recent Chats">
          <SidebarItem icon={MessageCircle} label="My Assigned Tasks" active />
        </Section>
      </>
    )
  }

  if (hub === 'docs') {
    return (
      <>
        <Section title="Docs">
          <SidebarItem icon={FileText} label="All Docs" />
          <SidebarItem icon={FileText} label="My Docs" />
          <SidebarItem icon={Users} label="Shared with me" />
          <SidebarItem icon={FolderOpen} label="Private" />
          <SidebarItem icon={ClipboardList} label="Meeting Notes" />
          <SidebarItem icon={Inbox} label="Archived" />
        </Section>
        <Section title="Favorites">
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-[11px] text-muted-foreground">
            Star a Doc to see it here
          </div>
        </Section>
        <Section title="Recent Pages">
          <SidebarItem icon={FileText} label="Page 1" />
        </Section>
      </>
    )
  }

  if (hub === 'dashboard') {
    return (
      <>
        <Section title="Dashboards">
          <SidebarItem icon={LayoutDashboard} label="All Dashboards" />
          <SidebarItem icon={LayoutDashboard} label="My Dashboards" />
          <SidebarItem icon={Users} label="Shared with me" />
          <SidebarItem icon={FolderOpen} label="Private" />
        </Section>
        <Section title="Favorites">
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-[11px] text-muted-foreground">
            Star a Dashboard to see it here
          </div>
        </Section>
      </>
    )
  }

  if (hub === 'whiteboards') {
    return (
      <>
        <Section title="Whiteboards">
          <SidebarItem icon={Frame} label="All Whiteboards" />
          <SidebarItem icon={Frame} label="My Whiteboards" />
        </Section>
        <Section title="Favorites">
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-[11px] text-muted-foreground">
            Star a Whiteboard to see it here
          </div>
        </Section>
      </>
    )
  }

  if (hub === 'forms') {
    return (
      <>
        <Section title="Forms">
          <SidebarItem icon={ClipboardList} label="All Forms" />
          <SidebarItem icon={ClipboardList} label="My Forms" />
        </Section>
        <Section title="Favorites">
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-[11px] text-muted-foreground">
            Star a Form to see it here
          </div>
        </Section>
      </>
    )
  }

  if (hub === 'teams') {
    return (
      <>
        <Section title="Teams">
          <SidebarItem icon={Users} label="All Teams" />
          <SidebarItem icon={Users} label="All People" />
          <SidebarItem icon={ChartNoAxesCombined} label="Analytics" />
        </Section>
        <Section title="My Teams">
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-[11px] text-muted-foreground">
            Once you join or create a Team you will see it here
          </div>
        </Section>
      </>
    )
  }

  if (hub === 'more') {
    return (
      <Section title="More">
        <SidebarItem icon={Bot} label="Integrations" />
        <SidebarItem icon={Frame} label="Whiteboards" />
        <SidebarItem icon={ClipboardList} label="Forms" />
      </Section>
    )
  }

  return (
    <>
      <Section title="Home">
        <SidebarItem icon={Inbox} label="Inbox" active />
        <SidebarItem icon={MessageCircle} label="Replies" />
        <SidebarItem icon={FileText} label="Assigned Comments" />
        <SidebarItem icon={ClipboardList} label="My Tasks" />
        <SidebarItem icon={Ellipsis} label="More" />
      </Section>

      <Section title="Favorites">
        <SidebarItem icon={Star} label="Welcome" />
      </Section>

      <Section title="Channels">
        <SidebarItem icon={Hash} label="# Welcome" />
        <SidebarItem icon={Hash} label="# General - Rundesk Space" />
        <SidebarItem icon={Plus} label="Add Channel" muted />
      </Section>

      <Section title="Direct Messages">
        <SidebarItem icon={Users} label="Onboarding Assistant" />
        <SidebarItem icon={Users} label="mafzaalali177@gmail.com" />
        <SidebarItem icon={Users} label="M Afzaal Ali - You" />
        <SidebarItem icon={Plus} label="New message" muted />
      </Section>

      <Section title="Spaces" action={<Plus className="h-3 w-3" />}>
        <SidebarItem icon={FolderOpen} label="All Tasks - Rundesk Space" />
        <SidebarItem icon={FolderOpen} label="Team Space" />
        <div className="ml-7 space-y-1 text-xs text-muted-foreground">
          <div className="flex items-center justify-between rounded px-2 py-1 hover:bg-accent/15">
            <span>Project 1</span>
            <span>3</span>
          </div>
          <div className="flex items-center justify-between rounded px-2 py-1 hover:bg-accent/15">
            <span>Project 2</span>
            <span>3</span>
          </div>
          <div className="flex items-center justify-between rounded px-2 py-1 hover:bg-accent/15">
            <span>Get Started with ClickUp</span>
            <span>8</span>
          </div>
        </div>
      </Section>
    </>
  )
}

function Section({
  title,
  children,
  action,
}: {
  title: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="mt-3">
      <div className="px-2 py-1 text-[11px] uppercase tracking-wider text-muted-foreground flex items-center justify-between">
        <span>{title}</span>
        {action}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

function SidebarItem({
  icon: Icon,
  label,
  active,
  muted,
}: {
  icon: typeof Home
  label: string
  active?: boolean
  muted?: boolean
}) {
  return (
    <button
      className={cn(
        'w-full flex items-center gap-2 rounded px-2 py-1.5 text-left transition-colors',
        active
          ? 'bg-accent/20 text-foreground'
          : muted
            ? 'text-muted-foreground/70 hover:text-foreground hover:bg-accent/15'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent/15',
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  )
}

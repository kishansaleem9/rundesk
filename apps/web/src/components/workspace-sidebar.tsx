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
  Settings as SettingsIcon,
  Star,
  Users,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Button, Input, Slider, cn } from '@rundesk/ui'

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

  const { data: dockConfig, refetch: refetchDock } = useQuery({
    queryKey: ['user-dock-config', baseWorkspaceId],
    queryFn: () => api<any>(`/dashboards/dock/${baseWorkspaceId}`),
    enabled: !!baseWorkspaceId,
  })

  const appearance = dockConfig?.appearance ?? { size: 'md', opacity: 0.8, theme: 'system', orientation: 'horizontal' }
  const pinnedLinks = dockConfig?.pinnedLinks ?? []

  const activeHub = getActiveHub(pathname, base)
  const items = useMemo<Array<{ id: HubId; label: string; to: string; icon: typeof Home }>>(
    () => [
      { id: 'home', label: 'Home', to: base, icon: Home },
      { id: 'ai', label: 'AI', to: `${base}/ai`, icon: Bot },
      { id: 'teams', label: 'Teams', to: `${base}/chat`, icon: Users },
      { id: 'docs', label: 'Docs', to: `${base}/docs`, icon: FileText },
      { id: 'dashboard', label: 'Dashboards', to: `${base}/dashboard`, icon: LayoutDashboard },
      ...pinnedLinks.map((link: any) => ({
        id: `pinned-${link.id}` as HubId,
        label: link.label,
        to: link.to,
        icon: Home, // Fallback icon, could be dynamic
      })),
      { id: 'more', label: 'More', to: `${base}/integrations`, icon: Ellipsis },
      { id: 'settings', label: 'Dock Settings', to: '#', icon: SettingsIcon },
    ],
    [base, pinnedLinks, appearance.orientation],
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

  useEffect(() => {
    const onReset = () => {
      const defaultPos = { x: 16, y: 16 }
      setDockPos(defaultPos)
      try {
        localStorage.setItem('rundesk.dockPos', JSON.stringify(defaultPos))
      } catch {
        // noop
      }
    }
    window.addEventListener('rundesk:reset-dock', onReset)
    return () => window.removeEventListener('rundesk:reset-dock', onReset)
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openHub) {
        setOpenHub(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openHub])

  const handleTouchStart = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('a')) return
    setDraggingDock(true)
    const touch = e.touches[0]
    const startX = touch.clientX
    const startY = touch.clientY
    const baseX = dockPos.x
    const baseY = dockPos.y
    
    const move = (evt: TouchEvent) => {
      const t = evt.touches[0]
      const nextX = Math.min(Math.max(8, baseX + (t.clientX - startX)), viewport.w - 380)
      const nextY = Math.min(Math.max(8, baseY - (t.clientY - startY)), viewport.h - 72)
      setDockPos({ x: nextX, y: nextY })
    }
    
    const end = (evt: TouchEvent) => {
      setDraggingDock(false)
      document.removeEventListener('touchmove', move)
      document.removeEventListener('touchend', end)
      try {
        const t = evt.changedTouches[0]
        const finalX = Math.min(Math.max(8, baseX + (t.clientX - startX)), viewport.w - 380)
        const finalY = Math.min(Math.max(8, baseY - (t.clientY - startY)), viewport.h - 72)
        localStorage.setItem('rundesk.dockPos', JSON.stringify({ x: finalX, y: finalY }))
      } catch {
        // noop
      }
    }
    
    document.addEventListener('touchmove', move, { passive: false })
    document.addEventListener('touchend', end)
  }

  const isBottomHalf = dockPos.y < viewport.h / 2
  const panelLeft = Math.min(dockPos.x, Math.max(16, viewport.w - 340))
  const panelStyle: React.CSSProperties = isBottomHalf
    ? { left: panelLeft, bottom: dockPos.y + 70 }
    : { left: panelLeft, top: viewport.h - dockPos.y + 10 }

  return (
    <>
      <div
        ref={panelRef}
        className={cn(
          'fixed z-[60] w-[320px] max-w-[calc(100vw-2rem)] max-h-[68vh] overflow-hidden rounded-2xl border border-white/20 bg-card/95 backdrop-blur-2xl shadow-2xl transition-all duration-300',
          openHub ? 'translate-y-0 opacity-100 pointer-events-auto' : 'translate-y-4 opacity-0 pointer-events-none',
        )}
        style={panelStyle}
        onMouseEnter={() => setPanelHovered(true)}
        onMouseLeave={() => setPanelHovered(false)}
      >
        <SidebarHeader hub={openHub ?? activeHub} />
        {openHub !== 'settings' && (
          <>
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
          </>
        )}
        <nav className="overflow-y-auto px-2 pb-3 text-[13px] max-h-[46vh]">
          <HubPanel
            hub={openHub ?? activeHub}
            visibility={visibility}
            workspaceId={baseWorkspaceId!}
            dockConfig={dockConfig}
            refetchDock={refetchDock}
          />
        </nav>
      </div>
      <div
        ref={dockRef}
        className={cn(
          'fixed z-50 flex items-center rounded-full border border-border/60 bg-card/80 backdrop-blur-xl cursor-grab active:cursor-grabbing shadow-2xl transition-all duration-300',
          draggingDock && 'select-none',
          appearance.orientation === 'vertical' ? 'flex-col' : 'flex-row',
          appearance.size === 'sm' ? 'p-1 gap-1' : appearance.size === 'lg' ? 'p-2 gap-2' : 'p-1.5 gap-1.5',
        )}
        style={{
          left: dockPos.x,
          bottom: dockPos.y,
          opacity: appearance.opacity,
        }}
        onTouchStart={handleTouchStart}
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
                  <div className={cn(
                    "absolute whitespace-nowrap rounded-md border border-white/20 bg-card/90 px-2 py-1 text-[11px] text-foreground shadow-lg z-[70]",
                    appearance.orientation === 'vertical' 
                      ? "left-full top-1/2 -translate-y-1/2 ml-3" 
                      : "bottom-full left-1/2 -translate-x-1/2 mb-2"
                  )}>
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
                      'rounded-full flex items-center justify-center transition-all',
                      appearance.size === 'sm' ? 'h-7 w-7' : appearance.size === 'lg' ? 'h-11 w-11' : 'h-9 w-9',
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
                      item.id === 'settings' && !isActive && !isOpen && 'text-slate-500',
                    )}
                  >
                    <Icon className={cn(
                      'transition-all',
                      appearance.size === 'sm' ? 'h-3.5 w-3.5' : appearance.size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'
                    )} />
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
    settings: 'Dock Settings',
  }
  return (
    <div className="px-3 py-3 border-b border-border/50">
      <div className="flex items-center gap-2">
        <div className="h-5 w-5 rounded bg-brand-gradient" />
        <div className="text-sm font-semibold truncate">{title[hub] || 'Pinned Link'}</div>
        {hub !== 'settings' && (
          <Button size="sm" className="ml-auto h-7 text-xs px-2">
            <Plus className="h-3.5 w-3.5 mr-1" />
            Create
          </Button>
        )}
      </div>
    </div>
  )
}

type HubId = 'home' | 'ai' | 'teams' | 'docs' | 'dashboard' | 'whiteboards' | 'forms' | 'more' | 'settings' | string

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
  workspaceId,
  dockConfig,
  refetchDock,
}: {
  hub: HubId
  visibility: Partial<Record<HubId, boolean>>
  workspaceId: string
  dockConfig: any
  refetchDock: () => void
}) {
  if (hub === 'settings') {
    const appearance = dockConfig?.appearance ?? { size: 'md', opacity: 0.8, theme: 'system', orientation: 'horizontal' }
    const pinnedLinks = dockConfig?.pinnedLinks ?? []

    const update = async (patch: any) => {
      await api(`/dashboards/dock/${workspaceId}`, {
        method: 'POST',
        body: patch,
      })
      refetchDock()
    }

    return (
      <div className="space-y-6 p-4">
        <Section title="Appearance">
          <div className="space-y-4 px-2 py-1">
            <div className="space-y-2">
              <span className="text-[11px] text-muted-foreground">Orientation</span>
              <div className="flex gap-2">
                {['horizontal', 'vertical'].map((o) => (
                  <Button
                    key={o}
                    size="sm"
                    variant={appearance.orientation === o ? 'gradient' : 'outline'}
                    className="flex-1 h-7 text-[10px]"
                    onClick={() => update({ appearance: { ...appearance, orientation: o } })}
                  >
                    {o.toUpperCase()}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>Opacity</span>
                <span>{Math.round(appearance.opacity * 100)}%</span>
              </div>
              <Slider
                value={[appearance.opacity * 100]}
                min={20}
                max={100}
                step={1}
                onValueChange={([v]) => update({ appearance: { ...appearance, opacity: v / 100 } })}
              />
            </div>
            <div className="space-y-2">
              <span className="text-[11px] text-muted-foreground">Size</span>
              <div className="flex gap-2">
                {['sm', 'md', 'lg'].map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={appearance.size === s ? 'gradient' : 'outline'}
                    className="flex-1 h-7 text-[10px]"
                    onClick={() => update({ appearance: { ...appearance, size: s } })}
                  >
                    {s.toUpperCase()}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </Section>
        <Section title="Pinned Links">
          <div className="space-y-2">
            {pinnedLinks.map((link: any, i: number) => (
              <div key={i} className="flex items-center gap-2 group">
                <SidebarItem icon={Home} label={link.label} />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100"
                  onClick={() => {
                    const next = [...pinnedLinks]
                    next.splice(i, 1)
                    update({ pinnedLinks: next })
                  }}
                >
                  <Ellipsis className="h-3 w-3" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="w-full h-8 text-xs border-dashed"
              onClick={() => {
                const label = prompt('Link label?')
                const to = prompt('Link URL (relative or absolute)?')
                if (label && to) {
                  update({ pinnedLinks: [...pinnedLinks, { id: Math.random().toString(36).slice(2), label, to }] })
                }
              }}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add pinned link
            </Button>
          </div>
        </Section>
      </div>
    )
  }
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

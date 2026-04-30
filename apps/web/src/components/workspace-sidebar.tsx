import { Link, useParams, useRouterState } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
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
  PanelLeftClose,
  PanelRightClose,
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
  const base = workspaceId ? `/app/${workspaceId}` : '/app'
  const [visibility, setVisibility] = useState<Partial<Record<HubId, boolean>>>({})

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

  const activeHub = getActiveHub(pathname, base)

  return (
    <aside className="h-screen w-[300px] border-r border-border/60 bg-card text-card-foreground shrink-0 flex">
      <MiniRail base={base} activeHub={activeHub} visibility={visibility} />
      <div className="w-[252px] border-l border-border/50 flex flex-col">
        <SidebarHeader hub={activeHub} />
        <div className="px-3 pb-3">
          <Input
            placeholder="Search"
            leadingIcon={<Search className="h-3.5 w-3.5" />}
            className="h-8 bg-background/60 border-border/70 text-xs"
          />
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-3 text-[13px]">
          <HubPanel hub={activeHub} visibility={visibility} />
        </nav>
      </div>
    </aside>
  )
}

function MiniRail({
  base,
  activeHub,
  visibility,
}: {
  base: string
  activeHub: HubId
  visibility: Partial<Record<HubId, boolean>>
}) {
  const items: Array<{ id: HubId; label: string; to: string; icon: typeof Home }> = [
    { id: 'home', label: 'Home', to: base, icon: Home },
    { id: 'ai', label: 'AI', to: `${base}/ai`, icon: Bot },
    { id: 'teams', label: 'Teams', to: `${base}/chat`, icon: Users },
    { id: 'docs', label: 'Docs', to: `${base}/docs`, icon: FileText },
    { id: 'dashboard', label: 'Dashboards', to: `${base}/dashboard`, icon: LayoutDashboard },
    { id: 'whiteboards', label: 'Whiteboards', to: `${base}/whiteboards`, icon: Frame },
    { id: 'forms', label: 'Forms', to: `${base}/forms`, icon: ClipboardList },
    { id: 'more', label: 'More', to: `${base}/integrations`, icon: Ellipsis },
  ]

  return (
    <div className="w-[48px] flex flex-col items-center py-3 gap-2 border-r border-border/50 bg-muted/30">
      <div className="h-7 w-7 rounded-md bg-brand-gradient flex items-center justify-center text-white text-[10px] font-bold">
        R
      </div>
      {items
        .filter((item) => visibility[item.id] !== false)
        .map((item) => (
        <RailLink
          key={item.id}
          to={item.to}
          icon={item.icon}
          label={item.label}
          active={activeHub === item.id}
        />
      ))}
      <div className="mt-auto text-[9px] text-muted-foreground rotate-[-90deg] mb-8">Upgrade</div>
    </div>
  )
}

function RailLink({
  to,
  icon: Icon,
  label,
  active,
}: {
  to: string
  icon: typeof Home
  label: string
  active?: boolean
}) {
  return (
    <Link
      to={to}
      className={cn(
        'w-10 rounded-md grid place-items-center py-1 text-muted-foreground hover:text-foreground hover:bg-accent/20',
        active && 'bg-accent/20 text-foreground shadow-[0_0_0_1px_hsl(var(--border))]',
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="text-[8px] mt-0.5 leading-none">{label}</span>
    </Link>
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
        <button className="h-6 w-6 rounded hover:bg-accent/20 grid place-items-center text-muted-foreground">
          <PanelLeftClose className="h-3.5 w-3.5" />
        </button>
        <button className="h-6 w-6 rounded hover:bg-accent/20 grid place-items-center text-muted-foreground">
          <PanelRightClose className="h-3.5 w-3.5" />
        </button>
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

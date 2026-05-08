import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Menu,
  Search,
  Bell,
  ChevronRight,
  Plus,
  Sparkles,
  LogOut,
  User as UserIcon,
  HelpCircle,
  Settings as SettingsIcon,
  Moon,
  Sun,
  Check,
  Inbox as InboxIcon,
} from 'lucide-react'
import { formatDistanceToNowStrict } from 'date-fns'
import {
  Button,
  Badge,
  PersonAvatar,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  Popover,
  PopoverTrigger,
  PopoverContent,
  cn,
  toast,
} from '@rundesk/ui'
import { useAuthStore } from '../store/auth'
import { useThemeStore } from '../store/theme'
import { api, ApiError } from '../lib/api'
import { QuickCreateModal } from './quick-create-modal'
import { getRealtimeSocket } from '../lib/realtime'

type Workspace = { id: string; name: string; slug: string }
type WorkspaceEntry = { workspace: Workspace; role: string }
type Space = { id: string; name: string }
type Project = { id: string; name: string }
type List = { id: string; name: string }

function isUuidLike(value?: string): value is string {
  if (!value) return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function AppTopbar({
  onCommandOpen,
  onMenuOpen,
}: {
  onCommandOpen?: () => void
  onMenuOpen?: () => void
}) {
  const params = useParams({ strict: false }) as {
    workspaceId?: string
    spaceId?: string
    projectId?: string
    listId?: string
  }

  return (
    <header className="h-14 border-b border-border/60 bg-card/40 backdrop-blur-md flex items-center gap-2 px-3 sm:px-4 shrink-0">
      {onMenuOpen && (
        <button
          onClick={onMenuOpen}
          className="lg:hidden h-9 w-9 rounded-lg flex items-center justify-center hover:bg-card/60 text-muted-foreground transition-colors"
          aria-label="Open sidebar menu"
        >
          <Menu className="h-4 w-4" />
        </button>
      )}
      <Breadcrumbs {...params} />
      <div className="flex-1" />
      <SearchBar onCommandOpen={onCommandOpen} />
      <QuickCreateButton />
      <ThemeToggle />
      <NotificationsBell />
      <UserMenu workspaceId={isUuidLike(params.workspaceId) ? params.workspaceId : undefined} />
    </header>
  )
}

// ---------------------------------------------------------------------------
// Breadcrumbs
// ---------------------------------------------------------------------------
function Breadcrumbs({
  workspaceId,
  spaceId,
  projectId,
  listId,
}: {
  workspaceId?: string
  spaceId?: string
  projectId?: string
  listId?: string
}) {
  const { data: workspaces } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => api<WorkspaceEntry[]>('/workspaces'),
    enabled: !!workspaceId,
  })
  const { data: spaces } = useQuery({
    queryKey: ['spaces', workspaceId],
    queryFn: () => api<Space[]>(`/spaces/workspace/${workspaceId}`),
    enabled: !!workspaceId,
  })
  const { data: projects } = useQuery({
    queryKey: ['projects', spaceId],
    queryFn: () => api<Project[]>(`/projects/space/${spaceId}`),
    enabled: !!spaceId,
  })
  const { data: lists } = useQuery({
    queryKey: ['lists', projectId],
    queryFn: () => api<List[]>(`/lists/project/${projectId}`),
    enabled: !!projectId,
  })

  const workspace = workspaces?.find((e) => e.workspace.id === workspaceId)?.workspace
  const space = spaces?.find((s) => s.id === spaceId)
  const project = projects?.find((p) => p.id === projectId)
  const list = lists?.find((l) => l.id === listId)

  if (!workspaceId) {
    return null
  }

  const Sep = () => <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />

  return (
    <nav className="hidden sm:flex items-center gap-1.5 text-sm min-w-0">
      {workspace && (
        <Link
          to="/app/$workspaceId"
          params={{ workspaceId }}
          className="text-muted-foreground hover:text-foreground transition-colors truncate max-w-[180px]"
        >
          {workspace.name}
        </Link>
      )}
      {space && (
        <>
          <Sep />
          <Link
            to="/app/$workspaceId/$spaceId"
            params={{ workspaceId, spaceId: space.id }}
            className="text-muted-foreground hover:text-foreground transition-colors truncate max-w-[160px]"
          >
            {space.name}
          </Link>
        </>
      )}
      {project && spaceId && (
        <>
          <Sep />
          <Link
            to="/app/$workspaceId/$spaceId/$projectId"
            params={{ workspaceId, spaceId, projectId: project.id }}
            className="text-muted-foreground hover:text-foreground transition-colors truncate max-w-[160px]"
          >
            {project.name}
          </Link>
        </>
      )}
      {list && spaceId && projectId && (
        <>
          <Sep />
          <Link
            to="/app/$workspaceId/$spaceId/$projectId/$listId"
            params={{ workspaceId, spaceId, projectId, listId: list.id }}
            className="text-foreground font-medium truncate max-w-[200px]"
          >
            {list.name}
          </Link>
        </>
      )}
    </nav>
  )
}

// ---------------------------------------------------------------------------
// Search trigger
// ---------------------------------------------------------------------------
function SearchBar({ onCommandOpen }: { onCommandOpen?: () => void }) {
  return (
    <button
      onClick={onCommandOpen}
      className="hidden md:flex items-center gap-2 h-9 px-3 rounded-lg border border-border/60 bg-card/60 hover:bg-card/80 text-sm text-muted-foreground w-72 transition-colors"
    >
      <Search className="h-4 w-4" />
      <span className="flex-1 text-left">Search or jump to…</span>
      <kbd className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono bg-muted/40 border border-border/40 rounded text-muted-foreground">
        ⌘K
      </kbd>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Quick-create button + modal
// ---------------------------------------------------------------------------
function QuickCreateButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="gradient" size="sm" className="h-9 gap-1.5" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        <span>New</span>
      </Button>
      {open && <QuickCreateModal onClose={() => setOpen(false)} />}
    </>
  )
}

// ---------------------------------------------------------------------------
// Theme toggle
// ---------------------------------------------------------------------------
function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme)
  const toggle = useThemeStore((s) => s.toggle)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={toggle}
          className="h-9 w-9 rounded-lg flex items-center justify-center hover:bg-card/60 text-muted-foreground transition-colors"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        Switch to {theme === 'dark' ? 'light' : 'dark'} mode
      </TooltipContent>
    </Tooltip>
  )
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
type Notification = {
  id: string
  type: string
  title: string
  body?: string | null
  readAt?: string | null
  createdAt: string
  actor?: { displayName?: string | null } | null
}

type NotificationEventKey = 'mention' | 'assigned' | 'comment' | 'due' | 'status' | 'doc' | 'chat' | 'activity'
type NotificationPreferences = {
  channels: {
    webEnabled: boolean
    mobileEnabled: boolean
    dndOn: boolean
    dndStart: string
    dndEnd: string
    muteSounds: boolean
  }
  events: Record<NotificationEventKey, Record<'inApp' | 'web' | 'mobile' | 'email', boolean>>
}

function NotificationsBell() {
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()
  const prefsQuery = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: () => api<NotificationPreferences>('/notifications/preferences'),
    staleTime: 30_000,
  })

  useEffect(() => {
    const toMinutes = (hhmm?: string) => {
      if (!hhmm) return null
      const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
      if (!match) return null
      const h = Number(match[1])
      const m = Number(match[2])
      if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) return null
      return h * 60 + m
    }
    const isQuietHours = (prefs?: NotificationPreferences) => {
      if (!prefs?.channels?.dndOn) return false
      const start = toMinutes(prefs.channels.dndStart)
      const end = toMinutes(prefs.channels.dndEnd)
      if (start === null || end === null) return false
      const now = new Date()
      const current = now.getHours() * 60 + now.getMinutes()
      if (start === end) return true
      if (start < end) return current >= start && current < end
      return current >= start || current < end
    }
    if (typeof window === 'undefined') return
    const socket = getRealtimeSocket()
    const beep = () => {
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.type = 'sine'
        osc.frequency.value = 920
        gain.gain.value = 0.03
        osc.start()
        osc.stop(ctx.currentTime + 0.08)
      } catch {
        // ignored
      }
    }
    const mapTypeToEventKey = (type?: string): NotificationEventKey => {
      switch (type) {
        case 'task_mentioned':
          return 'mention'
        case 'task_assigned':
          return 'assigned'
        case 'task_commented':
          return 'comment'
        case 'task_due_soon':
        case 'task_overdue':
          return 'due'
        case 'task_status_changed':
          return 'status'
        case 'doc_mentioned':
        case 'doc_commented':
          return 'doc'
        case 'chat_message':
          return 'chat'
        default:
          return 'activity'
      }
    }
    const onEvent = (event: { type?: string; notification?: { title?: string; body?: string; type?: string } }) => {
      if (event.type !== 'notification.created') return
      qc.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      qc.invalidateQueries({ queryKey: ['notifications', 'recent'] })
      const prefs = prefsQuery.data
      const eventKey = mapTypeToEventKey(event.notification?.type)
      const matrix = prefs?.events?.[eventKey]
      const quiet = isQuietHours(prefs)
      const allowWeb = !!prefs?.channels?.webEnabled && (matrix?.web ?? true) && !quiet
      const allowSound = !prefs?.channels?.muteSounds && allowWeb
      if (allowSound) beep()
      if (allowWeb) {
        toast(event.notification?.title ?? 'New notification', {
          description: event.notification?.body ?? '',
        })
      }
      if (allowWeb && 'Notification' in window && Notification.permission === 'granted') {
        void new Notification(event.notification?.title ?? 'New notification', {
          body: event.notification?.body ?? '',
        })
      }
    }
    socket.on('event', onEvent)
    return () => {
      socket.off('event', onEvent)
    }
  }, [qc, prefsQuery.data])

  useEffect(() => {
    if (!open) return
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission === 'default') {
      void Notification.requestPermission()
    }
  }, [open])

  const countQuery = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: () => api<{ count: number }>('/notifications/unread-count'),
    refetchInterval: 30000,
  })
  const listQuery = useQuery({
    queryKey: ['notifications', 'recent'],
    queryFn: () => api<Notification[]>('/notifications'),
    enabled: open,
  })

  const markRead = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      qc.invalidateQueries({ queryKey: ['notifications', 'recent'] })
    },
  })
  const markAllRead = useMutation({
    mutationFn: () => api('/notifications/mark-all-read', { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      qc.invalidateQueries({ queryKey: ['notifications', 'recent'] })
    },
  })

  const unread = countQuery.data?.count ?? 0
  const notifs = listQuery.data ?? []

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative h-9 w-9 rounded-lg flex items-center justify-center hover:bg-card/60 text-muted-foreground transition-colors"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 h-4 min-w-4 px-1 rounded-full bg-brand-gradient text-white text-[10px] font-semibold flex items-center justify-center shadow-glow">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0 max-h-[480px] flex flex-col">
        <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <h3 className="font-display font-semibold text-sm">Inbox</h3>
            {unread > 0 && <Badge variant="gradient" className="text-[10px]">{unread} new</Badge>}
          </div>
          {unread > 0 && (
            <button
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => markAllRead.mutate()}
            >
              Mark all read
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {listQuery.isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : notifs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-gradient-soft text-white shadow-glow">
                <InboxIcon className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium">You're all caught up</p>
              <p className="text-xs text-muted-foreground max-w-[220px]">
                Mentions, comment replies and assignments will land here.
              </p>
            </div>
          ) : (
            <ul>
              {notifs.slice(0, 20).map((n) => (
                <li
                  key={n.id}
                  onClick={() => !n.readAt && markRead.mutate(n.id)}
                  className={cn(
                    'px-4 py-3 border-b border-border/40 last:border-0 cursor-pointer hover:bg-card/60 transition-colors',
                    !n.readAt && 'bg-accent/5',
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    {!n.readAt && <span className="h-2 w-2 rounded-full bg-brand-gradient mt-1.5 shrink-0 shadow-glow" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground mb-0.5 flex items-center gap-2">
                        {n.actor?.displayName && (
                          <span className="font-medium text-foreground">{n.actor.displayName}</span>
                        )}
                        <span>{formatDistanceToNowStrict(new Date(n.createdAt), { addSuffix: true })}</span>
                      </div>
                      <div className="text-sm truncate">{n.title}</div>
                      {n.body && <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.body}</div>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ---------------------------------------------------------------------------
// User menu
// ---------------------------------------------------------------------------
function UserMenu({ workspaceId }: { workspaceId?: string }) {
  const user = useAuthStore((s) => s.user)
  const refreshToken = useAuthStore((s) => s.refreshToken)
  const clear = useAuthStore((s) => s.clear)
  const navigate = useNavigate()

  async function handleSignOut() {
    try {
      if (refreshToken) {
        await api('/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken }),
        })
      }
    } catch (err) {
      if (!(err instanceof ApiError)) console.error(err)
    } finally {
      clear()
      navigate({ to: '/login' })
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="rounded-full ring-2 ring-transparent transition-all hover:ring-border focus-visible:outline-none focus-visible:ring-ring"
          aria-label="User menu"
        >
          <PersonAvatar name={user?.displayName ?? '?'} size="md" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[240px]">
        <div className="px-3 py-2.5 flex items-center gap-3">
          <PersonAvatar name={user?.displayName ?? '?'} size="lg" />
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{user?.displayName}</div>
            <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
            {user?.role === 'super_admin' && (
              <Badge variant="gradient" className="mt-1 text-[9px] uppercase">
                Super admin
              </Badge>
            )}
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate({ to: '/app/profile' })}>
          <UserIcon className="h-4 w-4 text-muted-foreground" />
          Profile
        </DropdownMenuItem>
        {workspaceId && (
          <DropdownMenuItem
            onSelect={() =>
              navigate({ to: '/app/$workspaceId/settings', params: { workspaceId } })
            }
          >
            <SettingsIcon className="h-4 w-4 text-muted-foreground" />
            Workspace settings
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onSelect={() => window.open('https://github.com/mrrjatt/rundesk/issues', '_blank')}
        >
          <HelpCircle className="h-4 w-4 text-muted-foreground" />
          Help & support
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => window.dispatchEvent(new CustomEvent('rundesk:reset-dock'))}>
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          Reset dock position
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={handleSignOut}>
          <LogOut className="h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

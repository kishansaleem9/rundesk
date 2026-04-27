import { useState, useRef, useEffect } from 'react'
import { Link, useParams, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Bell, ChevronRight, Plus, Sparkles, LogOut, User, HelpCircle, Settings as SettingsIcon, Moon, Sun } from 'lucide-react'
import { formatDistanceToNowStrict } from 'date-fns'
import { Button, Input, cn } from '@rundesk/ui'
import { useAuthStore } from '../store/auth'
import { useThemeStore } from '../store/theme'
import { api, ApiError } from '../lib/api'
import { QuickCreateModal } from './quick-create-modal'

type Workspace = { id: string; name: string; slug: string }
type WorkspaceEntry = { workspace: Workspace; role: string }
type Space = { id: string; name: string }
type Project = { id: string; name: string }
type List = { id: string; name: string }

export function AppTopbar({ onCommandOpen }: { onCommandOpen?: () => void }) {
  const params = useParams({ strict: false }) as {
    workspaceId?: string
    spaceId?: string
    projectId?: string
    listId?: string
  }

  return (
    <header className="h-12 border-b border-border bg-card/80 backdrop-blur-sm flex items-center gap-3 px-4 shrink-0">
      <Breadcrumbs {...params} />
      <div className="flex-1" />
      <SearchBar onCommandOpen={onCommandOpen} />
      <QuickCreateButton />
      <ThemeToggle />
      <NotificationsBell />
      <UserMenu />
    </header>
  )
}

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
    return <div className="text-sm text-muted-foreground">Pick a workspace to get started</div>
  }

  return (
    <nav className="flex items-center gap-1 text-sm min-w-0">
      <Link
        to="/app/$workspaceId"
        params={{ workspaceId }}
        className="text-muted-foreground hover:text-foreground truncate max-w-[140px]"
      >
        {workspace?.name ?? '…'}
      </Link>
      {space && (
        <>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Link
            to="/app/$workspaceId/$spaceId"
            params={{ workspaceId, spaceId: space.id }}
            className="text-muted-foreground hover:text-foreground truncate max-w-[140px]"
          >
            {space.name}
          </Link>
        </>
      )}
      {project && spaceId && (
        <>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Link
            to="/app/$workspaceId/$spaceId/$projectId"
            params={{ workspaceId, spaceId, projectId: project.id }}
            className="text-muted-foreground hover:text-foreground truncate max-w-[140px]"
          >
            {project.name}
          </Link>
        </>
      )}
      {list && spaceId && projectId && (
        <>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Link
            to="/app/$workspaceId/$spaceId/$projectId/$listId"
            params={{ workspaceId, spaceId, projectId, listId: list.id }}
            className="text-foreground font-medium truncate max-w-[180px]"
          >
            {list.name}
          </Link>
        </>
      )}
    </nav>
  )
}

function SearchBar({ onCommandOpen }: { onCommandOpen?: () => void }) {
  return (
    <button
      onClick={onCommandOpen}
      className="flex items-center gap-2 h-8 px-3 rounded-md border border-border bg-surface-50 hover:bg-surface-100 text-sm text-muted-foreground w-64 transition-colors"
    >
      <Search className="h-4 w-4" />
      <span className="flex-1 text-left">Search…</span>
      <kbd className="hidden md:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono bg-card border border-border rounded">
        ⌘K
      </kbd>
    </button>
  )
}

function QuickCreateButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" className="h-8 gap-1.5" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        <span>New</span>
      </Button>
      {open && <QuickCreateModal onClose={() => setOpen(false)} />}
    </>
  )
}

function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme)
  const toggle = useThemeStore((s) => s.toggle)
  return (
    <button
      onClick={toggle}
      className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-surface-100 text-muted-foreground"
      aria-label="Toggle theme"
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  )
}

type Notification = {
  id: string
  type: string
  title: string
  body?: string | null
  readAt?: string | null
  createdAt: string
  actor?: { displayName?: string | null } | null
}

function NotificationsBell() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const qc = useQueryClient()

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

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const unread = countQuery.data?.count ?? 0
  const notifs = listQuery.data ?? []

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-surface-100 text-muted-foreground relative"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-brand-700 text-white text-[10px] font-semibold flex items-center justify-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-96 bg-card border border-border rounded-lg shadow-lg z-40 max-h-[480px] flex flex-col">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
            <h3 className="font-semibold text-sm">Notifications {unread > 0 && <span className="text-muted-foreground font-normal">· {unread} unread</span>}</h3>
            {unread > 0 && (
              <button
                className="text-xs text-muted-foreground hover:text-foreground"
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
              <div className="p-8 text-center text-sm text-muted-foreground">
                <Sparkles className="h-5 w-5 mx-auto mb-2 opacity-50" />
                You're all caught up.
              </div>
            ) : (
              <ul>
                {notifs.slice(0, 20).map((n) => (
                  <li
                    key={n.id}
                    onClick={() => !n.readAt && markRead.mutate(n.id)}
                    className={cn(
                      'px-4 py-2.5 border-b border-border/60 last:border-0 cursor-pointer hover:bg-surface-50',
                      !n.readAt && 'bg-brand-200/20',
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {!n.readAt && <span className="h-2 w-2 rounded-full bg-brand-700 mt-1.5 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-muted-foreground mb-0.5 flex items-center gap-2">
                          {n.actor?.displayName && <span className="font-medium text-foreground">{n.actor.displayName}</span>}
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
        </div>
      )}
    </div>
  )
}

function UserMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const user = useAuthStore((s) => s.user)
  const refreshToken = useAuthStore((s) => s.refreshToken)
  const clear = useAuthStore((s) => s.clear)
  const navigate = useNavigate()

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

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

  const initial = user?.displayName?.charAt(0).toUpperCase() ?? '?'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'h-8 w-8 rounded-full bg-brand-700 text-white flex items-center justify-center text-xs font-semibold',
          'hover:ring-2 hover:ring-ring hover:ring-offset-1 transition-all',
        )}
        aria-label="User menu"
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-card border border-border rounded-lg shadow-lg z-40 overflow-hidden">
          <div className="px-3 py-2.5 border-b border-border">
            <div className="text-sm font-medium truncate">{user?.displayName}</div>
            <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
          </div>
          <div className="py-1">
            <MenuItem icon={User} label="Profile" onClick={() => { setOpen(false); navigate({ to: '/app/profile' }) }} />
            <MenuItem
              icon={SettingsIcon}
              label="Workspace settings"
              onClick={() => {
                setOpen(false)
                const wsId = (window.location.pathname.match(/\/app\/([^\/]+)/) ?? [])[1]
                if (wsId) navigate({ to: '/app/$workspaceId/settings', params: { workspaceId: wsId } })
              }}
            />
            <MenuItem icon={HelpCircle} label="Help & support" onClick={() => window.open('https://github.com/mrrjatt/rundesk/issues', '_blank')} />
          </div>
          <div className="border-t border-border py-1">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-destructive hover:bg-surface-100"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof User
  label: string
  onClick?: () => void
}) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-surface-100 text-left">
      <Icon className="h-4 w-4 text-muted-foreground" />
      {label}
    </button>
  )
}

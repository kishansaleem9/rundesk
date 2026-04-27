import { useState, useMemo } from 'react'
import { Link, useParams, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Home,
  Inbox,
  FileText,
  Target,
  Zap,
  Settings,
  Plus,
  ChevronRight,
  ChevronDown,
  Folder,
  List as ListIcon,
  Search,
  Sparkles,
  Clock,
  MoreHorizontal,
  Building2,
  LayoutDashboard,
  Shield,
  MessageSquare,
  ClipboardList,
  BarChart3,
} from 'lucide-react'
import { Button, Input, LogoMark, cn } from '@rundesk/ui'
import { api } from '../lib/api'

type Workspace = { id: string; name: string; slug: string }
type WorkspaceEntry = { workspace: Workspace; role: string }
type Space = { id: string; name: string; color?: string; icon?: string }
type Project = { id: string; name: string; color?: string; icon?: string }
type List = { id: string; name: string }

export function WorkspaceSidebar() {
  const params = useParams({ strict: false }) as {
    workspaceId?: string
    spaceId?: string
    projectId?: string
    listId?: string
  }
  const workspaceId = params.workspaceId

  return (
    <aside className="w-64 h-screen bg-surface-100 border-r border-border flex flex-col shrink-0">
      <WorkspaceHeader activeWorkspaceId={workspaceId} />

      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        <PinnedLinks workspaceId={workspaceId} />

        {workspaceId && (
          <>
            <div className="h-px bg-border/60 my-3 mx-2" />
            <SpacesTree
              workspaceId={workspaceId}
              activeSpaceId={params.spaceId}
              activeProjectId={params.projectId}
              activeListId={params.listId}
            />
          </>
        )}
      </nav>

      <SidebarFooter />
    </aside>
  )
}

function WorkspaceHeader({ activeWorkspaceId }: { activeWorkspaceId?: string }) {
  const [open, setOpen] = useState(false)
  const { data: workspaces } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => api<WorkspaceEntry[]>('/workspaces'),
  })

  const active = workspaces?.find((w) => w.workspace.id === activeWorkspaceId)?.workspace
  const displayName = active?.name ?? 'Rundesk'

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 p-3 border-b border-border hover:bg-surface-50 transition-colors"
      >
        <LogoMark className="h-7 w-7 shrink-0" />
        <div className="flex-1 min-w-0 text-left">
          <div className="font-display text-sm font-semibold truncate text-brand-900">
            {displayName}
          </div>
          {active && (
            <div className="text-[11px] text-muted-foreground truncate font-mono">
              {active.slug}
            </div>
          )}
        </div>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && workspaces && (
        <div className="absolute left-2 right-2 top-full mt-1 z-40 bg-card rounded-lg border border-border shadow-lg overflow-hidden">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-3 py-2 border-b border-border">
            Workspaces
          </div>
          {workspaces.map((entry) => (
            <Link
              key={entry.workspace.id}
              to="/app/$workspaceId"
              params={{ workspaceId: entry.workspace.id }}
              onClick={() => setOpen(false)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-100 transition-colors',
                entry.workspace.id === activeWorkspaceId && 'bg-brand-200/50 text-brand-900 font-medium',
              )}
            >
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="truncate">{entry.workspace.name}</div>
                <div className="text-[10px] text-muted-foreground capitalize">
                  {entry.role.replace('_', ' ')}
                </div>
              </div>
            </Link>
          ))}
          <Link
            to="/app"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm border-t border-border hover:bg-surface-100"
          >
            <Plus className="h-4 w-4" />
            <span>All workspaces</span>
          </Link>
        </div>
      )}
    </div>
  )
}

function PinnedLinks({ workspaceId }: { workspaceId?: string }) {
  if (!workspaceId) return null

  const workspaceItems = [
    { label: 'Home', icon: Home, to: '/app/$workspaceId' as const },
    { label: 'Dashboard', icon: LayoutDashboard, to: '/app/$workspaceId/dashboard' as const },
    { label: 'Inbox', icon: Inbox, to: '/app/$workspaceId/inbox' as const },
    { label: 'Chat', icon: MessageSquare, to: '/app/$workspaceId/chat' as const },
    { label: 'Docs', icon: FileText, to: '/app/$workspaceId/docs' as const },
    { label: 'Goals', icon: Target, to: '/app/$workspaceId/goals' as const },
    { label: 'Sprints', icon: Sparkles, to: '/app/$workspaceId/sprints' as const },
    { label: 'Time', icon: Clock, to: '/app/$workspaceId/time' as const },
    { label: 'Forms', icon: ClipboardList, to: '/app/$workspaceId/forms' as const },
    { label: 'AI', icon: Sparkles, to: '/app/$workspaceId/ai' as const },
    { label: 'Reports', icon: BarChart3, to: '/app/$workspaceId/reports' as const },
    { label: 'Automations', icon: Zap, to: '/app/$workspaceId/automations' as const },
  ]

  return (
    <div className="space-y-0.5">
      {workspaceItems.map((item) => (
        <Link
          key={item.label}
          to={item.to}
          params={{ workspaceId }}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-brand-900/80 hover:bg-surface-50 transition-colors"
          activeProps={{ className: 'bg-brand-200/50 text-brand-900 font-medium' }}
          activeOptions={{ exact: true }}
        >
          <item.icon className="h-4 w-4 text-muted-foreground" />
          <span>{item.label}</span>
        </Link>
      ))}
      <div className="h-px bg-border/60 my-2 mx-2" />
      <Link
        to="/app/admin/features"
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-brand-900/80 hover:bg-surface-50 transition-colors"
        activeProps={{ className: 'bg-brand-200/50 text-brand-900 font-medium' }}
      >
        <Shield className="h-4 w-4 text-muted-foreground" />
        <span>Admin · Features</span>
      </Link>
    </div>
  )
}

function SpacesTree({
  workspaceId,
  activeSpaceId,
  activeProjectId,
  activeListId,
}: {
  workspaceId: string
  activeSpaceId?: string
  activeProjectId?: string
  activeListId?: string
}) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const queryClient = useQueryClient()

  const { data: spaces = [] } = useQuery({
    queryKey: ['spaces', workspaceId],
    queryFn: () => api<Space[]>(`/spaces/workspace/${workspaceId}`),
  })

  const createSpace = useMutation({
    mutationFn: (name: string) =>
      api('/spaces', {
        method: 'POST',
        body: JSON.stringify({ workspaceId, name }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spaces', workspaceId] })
      setNewName('')
      setCreating(false)
    },
  })

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Spaces
        </span>
        <button
          onClick={() => setCreating((v) => !v)}
          className="h-5 w-5 rounded hover:bg-surface-50 flex items-center justify-center text-muted-foreground"
          aria-label="Create space"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {creating && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (newName.trim()) createSpace.mutate(newName.trim())
          }}
          className="px-2 pb-1"
        >
          <Input
            autoFocus
            placeholder="Space name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={() => !newName && setCreating(false)}
            onKeyDown={(e) => e.key === 'Escape' && setCreating(false)}
            className="h-7 text-xs"
          />
        </form>
      )}

      {spaces.map((space) => (
        <SpaceNode
          key={space.id}
          space={space}
          workspaceId={workspaceId}
          isActive={activeSpaceId === space.id}
          activeProjectId={activeProjectId}
          activeListId={activeListId}
          defaultOpen={activeSpaceId === space.id}
        />
      ))}

      {spaces.length === 0 && !creating && (
        <button
          onClick={() => setCreating(true)}
          className="w-full text-left text-xs text-muted-foreground hover:text-foreground px-2 py-1.5"
        >
          + Create your first space
        </button>
      )}
    </div>
  )
}

function SpaceNode({
  space,
  workspaceId,
  isActive,
  activeProjectId,
  activeListId,
  defaultOpen,
}: {
  space: Space
  workspaceId: string
  isActive: boolean
  activeProjectId?: string
  activeListId?: string
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data: projects = [] } = useQuery({
    queryKey: ['projects', space.id],
    queryFn: () => api<Project[]>(`/projects/space/${space.id}`),
    enabled: open,
  })

  const createProject = useMutation({
    mutationFn: (name: string) =>
      api<Project>('/projects', {
        method: 'POST',
        body: JSON.stringify({ spaceId: space.id, name }),
      }),
    onSuccess: (p) => {
      queryClient.invalidateQueries({ queryKey: ['projects', space.id] })
      setNewName('')
      setCreating(false)
      if (p?.id) {
        navigate({
          to: '/app/$workspaceId/$spaceId/$projectId',
          params: { workspaceId, spaceId: space.id, projectId: p.id },
        })
      }
    },
  })

  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-1 px-2 py-1.5 rounded-md text-sm cursor-pointer hover:bg-surface-50',
          isActive && 'bg-brand-200/40 text-brand-900 font-medium',
        )}
      >
        <button
          onClick={() => setOpen((v) => !v)}
          className="h-4 w-4 shrink-0 flex items-center justify-center text-muted-foreground"
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <Link
          to="/app/$workspaceId/$spaceId"
          params={{ workspaceId, spaceId: space.id }}
          className="flex-1 flex items-center gap-1.5 min-w-0"
        >
          <span
            className="h-4 w-4 rounded shrink-0 flex items-center justify-center text-[10px] text-white font-bold"
            style={{ backgroundColor: space.color ?? 'hsl(var(--brand-700))' }}
          >
            {space.icon ?? space.name.charAt(0).toUpperCase()}
          </span>
          <span className="truncate">{space.name}</span>
        </Link>
        <button
          onClick={() => {
            setOpen(true)
            setCreating(true)
          }}
          className="h-5 w-5 rounded opacity-0 group-hover:opacity-100 hover:bg-surface-100 flex items-center justify-center text-muted-foreground"
          aria-label="New project"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {open && (
        <div className="ml-5 mt-0.5 space-y-0.5 border-l border-border/60 pl-2">
          {creating && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (newName.trim()) createProject.mutate(newName.trim())
              }}
              className="pb-1"
            >
              <Input
                autoFocus
                placeholder="Project name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onBlur={() => !newName && setCreating(false)}
                onKeyDown={(e) => e.key === 'Escape' && setCreating(false)}
                className="h-7 text-xs"
              />
            </form>
          )}

          {projects.map((project) => (
            <ProjectNode
              key={project.id}
              project={project}
              workspaceId={workspaceId}
              spaceId={space.id}
              isActive={activeProjectId === project.id}
              activeListId={activeListId}
              defaultOpen={activeProjectId === project.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ProjectNode({
  project,
  workspaceId,
  spaceId,
  isActive,
  activeListId,
  defaultOpen,
}: {
  project: Project
  workspaceId: string
  spaceId: string
  isActive: boolean
  activeListId?: string
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data: lists = [] } = useQuery({
    queryKey: ['lists', project.id],
    queryFn: () => api<List[]>(`/lists/project/${project.id}`),
    enabled: open,
  })

  const createList = useMutation({
    mutationFn: (name: string) =>
      api<List>('/lists', {
        method: 'POST',
        body: JSON.stringify({ projectId: project.id, name }),
      }),
    onSuccess: (l) => {
      queryClient.invalidateQueries({ queryKey: ['lists', project.id] })
      setNewName('')
      setCreating(false)
      if (l?.id) {
        navigate({
          to: '/app/$workspaceId/$spaceId/$projectId/$listId',
          params: { workspaceId, spaceId, projectId: project.id, listId: l.id },
        })
      }
    },
  })

  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-1 px-1.5 py-1 rounded-md text-sm cursor-pointer hover:bg-surface-50',
          isActive && 'bg-brand-200/30 text-brand-900 font-medium',
        )}
      >
        <button
          onClick={() => setOpen((v) => !v)}
          className="h-4 w-4 shrink-0 flex items-center justify-center text-muted-foreground"
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <Link
          to="/app/$workspaceId/$spaceId/$projectId"
          params={{ workspaceId, spaceId, projectId: project.id }}
          className="flex-1 flex items-center gap-1.5 min-w-0"
        >
          <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{project.name}</span>
        </Link>
        <button
          onClick={() => {
            setOpen(true)
            setCreating(true)
          }}
          className="h-5 w-5 rounded opacity-0 group-hover:opacity-100 hover:bg-surface-100 flex items-center justify-center text-muted-foreground"
          aria-label="New list"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {open && (
        <div className="ml-5 mt-0.5 space-y-0.5 border-l border-border/60 pl-2">
          {creating && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (newName.trim()) createList.mutate(newName.trim())
              }}
              className="pb-1"
            >
              <Input
                autoFocus
                placeholder="List name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onBlur={() => !newName && setCreating(false)}
                onKeyDown={(e) => e.key === 'Escape' && setCreating(false)}
                className="h-6 text-xs"
              />
            </form>
          )}

          {lists.map((list) => (
            <Link
              key={list.id}
              to="/app/$workspaceId/$spaceId/$projectId/$listId"
              params={{
                workspaceId,
                spaceId,
                projectId: project.id,
                listId: list.id,
              }}
              className={cn(
                'flex items-center gap-1.5 px-1.5 py-1 rounded-md text-sm hover:bg-surface-50 min-w-0',
                activeListId === list.id && 'bg-brand-200/50 text-brand-900 font-medium',
              )}
            >
              <ListIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{list.name}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function SidebarFooter() {
  const params = useParams({ strict: false }) as { workspaceId?: string }
  const workspaceId = params.workspaceId
  if (!workspaceId) return null

  return (
    <div className="border-t border-border p-2 space-y-0.5">
      <Link
        to="/app/$workspaceId/time"
        params={{ workspaceId }}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-surface-50 hover:text-foreground"
        activeProps={{ className: 'bg-brand-200/50 text-brand-900 font-medium' }}
      >
        <Clock className="h-4 w-4" />
        <span>Time tracked</span>
      </Link>
      <Link
        to="/app/$workspaceId/settings"
        params={{ workspaceId }}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-surface-50 hover:text-foreground"
        activeProps={{ className: 'bg-brand-200/50 text-brand-900 font-medium' }}
      >
        <Settings className="h-4 w-4" />
        <span>Settings</span>
      </Link>
    </div>
  )
}

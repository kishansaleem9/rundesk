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
  Users,
  LayoutDashboard,
  Shield,
  MessageSquare,
  ClipboardList,
  BarChart3,
  Upload,
  GanttChart,
  Frame,
  Network,
  Video,
  LayoutTemplate,
  Bot,
  Plug,
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
    <aside className="w-[260px] h-screen bg-card/30 border-r border-border/60 flex flex-col shrink-0 backdrop-blur-md">
      <WorkspaceHeader activeWorkspaceId={workspaceId} />

      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1 scrollbar-none">
        <PinnedLinks workspaceId={workspaceId} />

        {workspaceId && (
          <>
            <div className="h-px bg-border/40 my-3 mx-2" />
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
        className="w-full flex items-center gap-2.5 px-3 py-3 border-b border-border/60 hover:bg-card/40 transition-colors"
      >
        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-gradient text-white shadow-glow">
          <LogoMark className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="font-display text-sm font-semibold truncate text-foreground">
            {displayName}
          </div>
          {active && (
            <div className="text-[10px] text-muted-foreground truncate font-mono">
              {active.slug}
            </div>
          )}
        </div>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && workspaces && (
        <div className="absolute left-2 right-2 top-full mt-1 z-40 bg-popover rounded-lg border border-border/60 shadow-glow overflow-hidden">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-3 py-2 border-b border-border/60">
            Workspaces
          </div>
          {workspaces.map((entry) => (
            <Link
              key={entry.workspace.id}
              to="/app/$workspaceId"
              params={{ workspaceId: entry.workspace.id }}
              onClick={() => setOpen(false)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent/10 transition-colors',
                entry.workspace.id === activeWorkspaceId && 'bg-accent/15 text-foreground font-medium',
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
            className="flex items-center gap-2 px-3 py-2 text-sm border-t border-border/60 hover:bg-accent/10"
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

  type NavItem = { label: string; icon: typeof Home; to: string; badge?: string }

  const sections: Array<{ label: string; items: NavItem[] }> = [
    {
      label: 'Plan',
      items: [
        { label: 'Home', icon: Home, to: '/app/$workspaceId' },
        { label: 'Dashboard', icon: LayoutDashboard, to: '/app/$workspaceId/dashboard' },
        { label: 'Inbox', icon: Inbox, to: '/app/$workspaceId/inbox' },
      ],
    },
    {
      label: 'Views',
      items: [
        { label: 'Timeline', icon: GanttChart, to: '/app/$workspaceId/timeline' },
        { label: 'Workload', icon: Users, to: '/app/$workspaceId/workload' },
      ],
    },
    {
      label: 'Build',
      items: [
        { label: 'Whiteboards', icon: Frame, to: '/app/$workspaceId/whiteboards' },
        { label: 'Mind maps', icon: Network, to: '/app/$workspaceId/mindmaps' },
        { label: 'Docs', icon: FileText, to: '/app/$workspaceId/docs' },
        { label: 'Templates', icon: LayoutTemplate, to: '/app/$workspaceId/templates' },
      ],
    },
    {
      label: 'Communicate',
      items: [
        { label: 'Chat', icon: MessageSquare, to: '/app/$workspaceId/chat' },
        { label: 'Clips', icon: Video, to: '/app/$workspaceId/clips', badge: 'New' },
      ],
    },
    {
      label: 'Run',
      items: [
        { label: 'Goals', icon: Target, to: '/app/$workspaceId/goals' },
        { label: 'Sprints', icon: Sparkles, to: '/app/$workspaceId/sprints' },
        { label: 'Forms', icon: ClipboardList, to: '/app/$workspaceId/forms' },
        { label: 'Time', icon: Clock, to: '/app/$workspaceId/time' },
      ],
    },
    {
      label: 'Insights',
      items: [
        { label: 'AI Insights', icon: Sparkles, to: '/app/$workspaceId/insights', badge: 'AI' },
        { label: 'Reports', icon: BarChart3, to: '/app/$workspaceId/reports' },
      ],
    },
    {
      label: 'Connect',
      items: [
        { label: 'AI', icon: Bot, to: '/app/$workspaceId/ai' },
        { label: 'Automations', icon: Zap, to: '/app/$workspaceId/automations' },
        { label: 'Integrations', icon: Plug, to: '/app/$workspaceId/integrations' },
        { label: 'Import', icon: Upload, to: '/app/$workspaceId/import' },
      ],
    },
  ]

  return (
    <div className="space-y-3">
      {sections.map((section, idx) => (
        <div key={section.label}>
          {idx > 0 && (
            <div className="px-2.5 mt-2 mb-1 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/50">
              {section.label}
            </div>
          )}
          <div className="space-y-0.5">
            {section.items.map((item) => (
              <Link
                key={item.label}
                to={item.to as never}
                params={{ workspaceId }}
                className="group relative flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-card/60 transition-all"
                activeProps={{
                  className: 'bg-accent/15 text-foreground font-medium [&>svg]:text-accent',
                }}
                activeOptions={{ exact: true }}
              >
                <item.icon className="h-4 w-4 shrink-0 transition-colors" />
                <span className="truncate flex-1">{item.label}</span>
                {item.badge && (
                  <span className="text-[9px] uppercase tracking-wider font-semibold bg-brand-gradient text-white rounded px-1 py-0.5">
                    {item.badge}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      ))}
      <div className="h-px bg-border/40 mx-2" />
      <Link
        to="/app/admin/features"
        className="group relative flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-card/60 transition-all"
        activeProps={{
          className: 'bg-accent/15 text-foreground font-medium [&>svg]:text-accent',
        }}
      >
        <Shield className="h-4 w-4 shrink-0 transition-colors" />
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
          className="h-5 w-5 rounded hover:bg-card/60 flex items-center justify-center text-muted-foreground"
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
          'group flex items-center gap-1 px-2 py-1.5 rounded-md text-sm cursor-pointer hover:bg-card/60',
          isActive && 'bg-accent/15 text-foreground font-medium',
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
          className="h-5 w-5 rounded opacity-0 group-hover:opacity-100 hover:bg-card/80 flex items-center justify-center text-muted-foreground"
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
          'group flex items-center gap-1 px-1.5 py-1 rounded-md text-sm cursor-pointer hover:bg-card/60',
          isActive && 'bg-accent/10 text-foreground font-medium',
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
          className="h-5 w-5 rounded opacity-0 group-hover:opacity-100 hover:bg-card/80 flex items-center justify-center text-muted-foreground"
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
                'flex items-center gap-1.5 px-1.5 py-1 rounded-md text-sm hover:bg-card/60 min-w-0',
                activeListId === list.id && 'bg-accent/15 text-foreground font-medium',
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
    <div className="border-t border-border/40 p-2 space-y-0.5">
      <Link
        to="/app/$workspaceId/time"
        params={{ workspaceId }}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-card/60 hover:text-foreground"
        activeProps={{ className: 'bg-accent/15 text-foreground font-medium' }}
      >
        <Clock className="h-4 w-4" />
        <span>Time tracked</span>
      </Link>
      <Link
        to="/app/$workspaceId/settings"
        params={{ workspaceId }}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-card/60 hover:text-foreground"
        activeProps={{ className: 'bg-accent/15 text-foreground font-medium' }}
      >
        <Settings className="h-4 w-4" />
        <span>Settings</span>
      </Link>
    </div>
  )
}

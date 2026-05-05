import { createFileRoute, Link, Outlet, useMatches } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, EmptyState as EmptyStateCard, Button, Badge } from '@rundesk/ui'
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Folder,
  TrendingUp,
  Plus,
} from 'lucide-react'
import { api } from '../lib/api'
import { useState } from 'react'

type Space = {
  id: string
  name: string
  description?: string | null
  color?: string | null
  icon?: string | null
}

type Task = { id: string; title: string; status: string; dueDate?: string | null }

export const Route = createFileRoute('/app/$workspaceId')({
  component: WorkspaceShell,
})

function WorkspaceShell() {
  const matches = useMatches()
  const isNested = matches.some(
    (m) =>
      m.routeId !== '/app/$workspaceId' &&
      m.routeId.startsWith('/app/$workspaceId/'),
  )
  if (isNested) return <Outlet />
  return <WorkspaceHome />
}

function WorkspaceHome() {
  const { workspaceId } = Route.useParams()
  const qc = useQueryClient()
  const [creatingSpace, setCreatingSpace] = useState(false)
  const [newSpaceName, setNewSpaceName] = useState('')

  const { data: spaces = [] } = useQuery({
    queryKey: ['spaces', workspaceId],
    queryFn: () => api<Space[]>(`/spaces/workspace/${workspaceId}`),
  })

  const createSpace = useMutation({
    mutationFn: () =>
      api<{ id: string }>(`/spaces`, {
        method: 'POST',
        body: JSON.stringify({ workspaceId, name: newSpaceName.trim() }),
      }),
    onSuccess: () => {
      setCreatingSpace(false)
      setNewSpaceName('')
      qc.invalidateQueries({ queryKey: ['spaces', workspaceId] })
    },
  })

  return (
    <div className="relative max-w-6xl mx-auto p-8">
      {/* Subtle ambient glow */}
      <div
        className="pointer-events-none absolute -top-10 left-1/3 h-72 w-72 rounded-full opacity-40 blur-3xl"
        style={{ background: 'radial-gradient(closest-side, hsl(var(--accent-violet)/.4), transparent)' }}
      />

      <header className="relative mb-10">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">
          Workspace home
        </div>
        <h1 className="font-display text-4xl font-semibold mb-1">
          Welcome back
        </h1>
        <p className="text-muted-foreground max-w-xl">
          Here's a snapshot of your workspace today.
        </p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
        <StatCard label="Open tasks" value="0" icon={CheckCircle2} hint="Across all lists" />
        <StatCard label="Due this week" value="0" icon={Clock} hint="Assigned to you" />
        <StatCard label="Completed" value="0" icon={TrendingUp} hint="Last 7 days" />
        <StatCard
          label="Spaces"
          value={spaces.length.toString()}
          icon={Folder}
          hint="Active"
        />
      </div>

      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-2xl font-semibold">Your spaces</h2>
          <Badge variant="soft" className="text-[10px]">
            {spaces.length} active
          </Badge>
        </div>

        {spaces.length === 0 ? (
          <EmptyStateCard
            icon={<Folder className="h-6 w-6" />}
            title="No spaces yet"
            description="Spaces organize your work by team or department. Create your first one now."
            action={
              <div className="flex items-center gap-2">
                {!creatingSpace ? (
                  <Button variant="outline" size="sm" onClick={() => setCreatingSpace(true)}>
                    <Plus className="h-4 w-4" /> Create first space
                  </Button>
                ) : (
                  <>
                    <input
                      autoFocus
                      value={newSpaceName}
                      onChange={(e) => setNewSpaceName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setCreatingSpace(false)
                          setNewSpaceName('')
                        }
                        if (e.key === 'Enter' && newSpaceName.trim()) {
                          createSpace.mutate()
                        }
                      }}
                      placeholder="Space name..."
                      className="h-9 w-44 rounded-md border border-border bg-card px-3 text-sm"
                    />
                    <Button
                      size="sm"
                      onClick={() => createSpace.mutate()}
                      disabled={!newSpaceName.trim() || createSpace.isPending}
                    >
                      {createSpace.isPending ? 'Creating…' : 'Create'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setCreatingSpace(false)
                        setNewSpaceName('')
                      }}
                    >
                      Cancel
                    </Button>
                  </>
                )}
              </div>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {spaces.map((space) => (
              <SpaceCard key={space.id} space={space} workspaceId={workspaceId} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-2xl font-semibold">Recent activity</h2>
          <Badge variant="info" className="text-[10px]">Live</Badge>
        </div>
        <ActivityFeed />
      </section>
    </div>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  trend,
}: {
  label: string
  value: string
  icon: typeof CheckCircle2
  hint: string
  trend?: string
}) {
  const positive = trend?.startsWith('+')
  return (
    <Card variant="glass" className="relative p-4 group hover:shadow-glow transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted/50 text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <div className="flex items-end gap-2">
        <div className="font-display text-3xl font-semibold tabular-nums">{value}</div>
        {trend && (
          <span
            className={
              'text-xs font-medium tabular-nums mb-1 ' +
              (positive ? 'text-success' : 'text-destructive')
            }
          >
            {trend}
          </span>
        )}
      </div>
      <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>
    </Card>
  )
}

function SpaceCard({
  space,
  workspaceId,
}: {
  space: Space
  workspaceId: string
}) {
  const { data: tasks } = useQuery({
    queryKey: ['space-tasks-preview', space.id],
    queryFn: async () => {
      const projects = await api<Array<{ id: string }>>(`/projects/space/${space.id}`)
      if (projects.length === 0) return [] as Task[]
      const lists = await api<Array<{ id: string }>>(`/lists/project/${projects[0].id}`)
      if (lists.length === 0) return [] as Task[]
      return api<Task[]>(`/tasks/list/${lists[0].id}`)
    },
  })
  const openCount = tasks?.filter((t) => t.status !== 'done' && t.status !== 'cancelled').length ?? 0

  return (
    <Link
      to="/app/$workspaceId/$spaceId"
      params={{ workspaceId, spaceId: space.id }}
      className="block group"
    >
      <Card variant="glass" className="p-4 hover:shadow-glow hover:border-accent/40 transition-all h-full">
        <div className="flex items-start gap-3">
          <span
            className="h-10 w-10 rounded-lg shrink-0 flex items-center justify-center text-white font-bold shadow-sm"
            style={{ background: space.color ?? 'linear-gradient(135deg, hsl(var(--brand-700)), hsl(var(--accent-violet)))' }}
          >
            {space.icon ?? space.name.charAt(0).toUpperCase()}
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold truncate group-hover:text-accent transition-colors">
              {space.name}
            </h3>
            {space.description && (
              <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                {space.description}
              </p>
            )}
            <div className="text-xs text-muted-foreground mt-2 flex items-center gap-2">
              <span>{openCount} open</span>
              <span className="text-muted-foreground/40">·</span>
              <span>{tasks?.length ?? 0} total</span>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
        </div>
      </Card>
    </Link>
  )
}

function ActivityFeed() {
  return (
    <Card variant="glass" className="p-6 text-sm text-muted-foreground">
      No recent activity yet. Activity will appear here when your team starts creating tasks, comments, and updates.
    </Card>
  )
}

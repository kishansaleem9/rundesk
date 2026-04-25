import { createFileRoute, Link, Outlet, useMatches } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Card, Button } from '@rundesk/ui'
import { ArrowRight, CheckCircle2, Clock, Folder, TrendingUp, Plus } from 'lucide-react'
import { api } from '../lib/api'

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

  const { data: spaces = [] } = useQuery({
    queryKey: ['spaces', workspaceId],
    queryFn: () => api<Space[]>(`/spaces/workspace/${workspaceId}`),
  })

  return (
    <div className="max-w-6xl mx-auto p-8">
      <header className="mb-8">
        <h1 className="font-display text-4xl font-semibold text-brand-900 mb-1">
          Welcome back
        </h1>
        <p className="text-muted-foreground">
          Here's what's happening in your workspace today.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Open tasks" value="—" icon={CheckCircle2} hint="Across all lists" />
        <StatCard label="Due this week" value="—" icon={Clock} hint="Assigned to you" />
        <StatCard label="Completed" value="—" icon={TrendingUp} hint="Last 7 days" />
        <StatCard
          label="Spaces"
          value={spaces.length.toString()}
          icon={Folder}
          hint="Active"
        />
      </div>

      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-xl font-semibold text-brand-900">Your spaces</h2>
          <span className="text-xs text-muted-foreground">
            Use the sidebar to create new spaces, projects and lists
          </span>
        </div>

        {spaces.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {spaces.map((space) => (
              <SpaceCard key={space.id} space={space} workspaceId={workspaceId} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold text-brand-900 mb-3">Recent activity</h2>
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Activity feed coming soon.
        </Card>
      </section>
    </div>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string
  value: string
  icon: typeof CheckCircle2
  hint: string
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between mb-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="font-display text-3xl font-semibold text-brand-900">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{hint}</div>
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
      <Card className="p-4 hover:shadow-md hover:border-brand-500 transition-all h-full">
        <div className="flex items-start gap-3">
          <span
            className="h-10 w-10 rounded-lg shrink-0 flex items-center justify-center text-white font-bold"
            style={{ backgroundColor: space.color ?? 'hsl(var(--brand-700))' }}
          >
            {space.icon ?? space.name.charAt(0).toUpperCase()}
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold truncate group-hover:text-brand-700 transition-colors">
              {space.name}
            </h3>
            {space.description && (
              <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                {space.description}
              </p>
            )}
            <div className="text-xs text-muted-foreground mt-2">
              {openCount} open task{openCount !== 1 ? 's' : ''}
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </Card>
    </Link>
  )
}

function EmptyState() {
  return (
    <Card className="p-10 text-center">
      <div className="h-12 w-12 rounded-full bg-brand-200/50 mx-auto mb-3 flex items-center justify-center">
        <Folder className="h-6 w-6 text-brand-700" />
      </div>
      <h3 className="font-display text-lg font-semibold text-brand-900 mb-1">
        No spaces yet
      </h3>
      <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
        Spaces organise your work by team or department. Create one from the left sidebar to get started.
      </p>
      <Button variant="outline" size="sm" className="gap-1.5">
        <Plus className="h-4 w-4" />
        Learn about spaces
      </Button>
    </Card>
  )
}

import { createFileRoute, Link, Outlet, useMatches } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Card } from '@rundesk/ui'
import { ArrowRight, List as ListIcon, Plus } from 'lucide-react'
import { api } from '../lib/api'

type List = {
  id: string
  name: string
  description?: string | null
}

type Project = { id: string; name: string; description?: string | null }

export const Route = createFileRoute('/app/$workspaceId/$spaceId/$projectId')({
  component: ProjectShell,
})

function ProjectShell() {
  const matches = useMatches()
  const isNested = matches.some(
    (m) =>
      m.routeId !== '/app/$workspaceId/$spaceId/$projectId' &&
      m.routeId.startsWith('/app/$workspaceId/$spaceId/$projectId/'),
  )
  if (isNested) return <Outlet />
  return <ProjectHome />
}

function ProjectHome() {
  const { workspaceId, spaceId, projectId } = Route.useParams()

  const { data: projects = [] } = useQuery({
    queryKey: ['projects', spaceId],
    queryFn: () => api<Project[]>(`/projects/space/${spaceId}`),
  })
  const project = projects.find((p) => p.id === projectId)

  const { data: lists = [], isLoading } = useQuery({
    queryKey: ['lists', projectId],
    queryFn: () => api<List[]>(`/lists/project/${projectId}`),
  })

  return (
    <div className="max-w-6xl mx-auto p-8">
      <header className="mb-8">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Project</div>
        <h1 className="font-display text-3xl font-semibold text-brand-900">
          {project?.name ?? 'Project'}
        </h1>
        {project?.description && (
          <p className="text-muted-foreground mt-1">{project.description}</p>
        )}
      </header>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-xl font-semibold text-brand-900">Lists</h2>
          <span className="text-xs text-muted-foreground">
            {lists.length} list{lists.length !== 1 ? 's' : ''}
          </span>
        </div>

        {isLoading ? (
          <Card className="p-8 text-sm text-muted-foreground text-center">Loading lists…</Card>
        ) : lists.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {lists.map((list) => (
              <ListCard
                key={list.id}
                list={list}
                workspaceId={workspaceId}
                spaceId={spaceId}
                projectId={projectId}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function ListCard({
  list,
  workspaceId,
  spaceId,
  projectId,
}: {
  list: List
  workspaceId: string
  spaceId: string
  projectId: string
}) {
  const { data: tasks } = useQuery({
    queryKey: ['tasks', list.id],
    queryFn: () => api<Array<{ id: string; status: string }>>(`/tasks/list/${list.id}`),
  })

  const total = tasks?.length ?? 0
  const done = tasks?.filter((t) => t.status === 'done').length ?? 0
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <Link
      to="/app/$workspaceId/$spaceId/$projectId/$listId"
      params={{ workspaceId, spaceId, projectId, listId: list.id }}
      className="block group"
    >
      <Card className="p-4 hover:shadow-md hover:border-brand-500 transition-all">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg shrink-0 flex items-center justify-center bg-brand-200/50">
            <ListIcon className="h-5 w-5 text-brand-700" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold truncate group-hover:text-brand-700 transition-colors">
              {list.name}
            </h3>
            {list.description && (
              <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5">
                {list.description}
              </p>
            )}
            <div className="mt-3 flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-surface-100 overflow-hidden">
                <div
                  className="h-full bg-brand-500 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                {done}/{total}
              </span>
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
        <ListIcon className="h-6 w-6 text-brand-700" />
      </div>
      <h3 className="font-display text-lg font-semibold text-brand-900 mb-1">
        No lists yet
      </h3>
      <p className="text-sm text-muted-foreground max-w-md mx-auto">
        Lists hold your tasks. Hover over this project in the sidebar and click{' '}
        <Plus className="inline h-3 w-3" /> to add one.
      </p>
    </Card>
  )
}

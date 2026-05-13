import { Link, Outlet, useMatches, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Card } from '@rundesk/ui'
import { ArrowRight, Folder, Plus } from 'lucide-react'
import { api } from '../lib/api'

type Project = {
  id: string
  name: string
  description?: string | null
  color?: string | null
  icon?: string | null
}

type Space = { id: string; name: string; description?: string | null }

export function SpaceShell() {
  const matches = useMatches()
  const isNested = matches.some(
    (m) =>
      m.routeId !== '/app/$workspaceId/$spaceId' &&
      m.routeId.startsWith('/app/$workspaceId/$spaceId/'),
  )
  if (isNested) return <Outlet />
  return <SpaceHome />
}

function SpaceHome() {
  const { workspaceId, spaceId } = useParams({ from: '/app/$workspaceId/$spaceId' })

  const { data: spaces = [] } = useQuery({
    queryKey: ['spaces', workspaceId],
    queryFn: () => api<Space[]>(`/spaces/workspace/${workspaceId}`),
  })
  const space = spaces.find((s) => s.id === spaceId)

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects', spaceId],
    queryFn: () => api<Project[]>(`/projects/space/${spaceId}`),
  })

  return (
    <div className="max-w-6xl mx-auto p-8">
      <header className="mb-8">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Space</div>
        <h1 className="font-display text-3xl font-semibold text-foreground">
          {space?.name ?? 'Space'}
        </h1>
        {space?.description && (
          <p className="text-muted-foreground mt-1">{space.description}</p>
        )}
      </header>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-xl font-semibold text-foreground">Projects</h2>
          <span className="text-xs text-muted-foreground">
            {projects.length} project{projects.length !== 1 ? 's' : ''}
          </span>
        </div>

        {isLoading ? (
          <Card className="p-8 text-sm text-muted-foreground text-center">Loading projects…</Card>
        ) : projects.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                workspaceId={workspaceId}
                spaceId={spaceId}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function ProjectCard({
  project,
  workspaceId,
  spaceId,
}: {
  project: Project
  workspaceId: string
  spaceId: string
}) {
  const { data: lists } = useQuery({
    queryKey: ['lists', project.id],
    queryFn: () => api<Array<{ id: string; name: string }>>(`/lists/project/${project.id}`),
  })

  return (
    <Link
      to="/app/$workspaceId/$spaceId/$projectId"
      params={{ workspaceId, spaceId, projectId: project.id }}
      className="block group"
    >
      <Card className="p-4 hover:shadow-md hover:border-brand-500 transition-all h-full">
        <div className="flex items-start gap-3 mb-3">
          <span
            className="h-10 w-10 rounded-lg shrink-0 flex items-center justify-center text-white font-bold"
            style={{ backgroundColor: project.color ?? 'hsl(var(--brand-500))' }}
          >
            {project.icon ?? project.name.charAt(0).toUpperCase()}
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold truncate group-hover:text-accent transition-colors">
              {project.name}
            </h3>
            {project.description && (
              <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                {project.description}
              </p>
            )}
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        <div className="text-xs text-muted-foreground">
          {lists?.length ?? 0} list{(lists?.length ?? 0) !== 1 ? 's' : ''}
        </div>
      </Card>
    </Link>
  )
}

function EmptyState() {
  return (
    <Card className="p-10 text-center">
      <div className="h-12 w-12 rounded-full bg-accent/15 mx-auto mb-3 flex items-center justify-center">
        <Folder className="h-6 w-6 text-accent" />
      </div>
      <h3 className="font-display text-lg font-semibold text-foreground mb-1">
        No projects in this space
      </h3>
      <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
        Projects group related work together. Hover over this space in the sidebar and click{' '}
        <Plus className="inline h-3 w-3" /> to add one.
      </p>
    </Card>
  )
}

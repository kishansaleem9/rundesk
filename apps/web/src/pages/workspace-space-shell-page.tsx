import { Outlet, useMatches, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Folder } from 'lucide-react'
import { api } from '../lib/api'
import { WorkHubPage, WorkEmptyState, WorkEntityCard } from '../components/work/work-ui'

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
    <WorkHubPage
      breadcrumb="Space"
      title={space?.name ?? 'Space'}
      description={space?.description}
    >
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-semibold text-foreground">Projects</h2>
          <span className="text-[12px] text-muted-foreground">
            {projects.length} project{projects.length !== 1 ? 's' : ''}
          </span>
        </div>

        {isLoading ? (
          <div className="rounded-lg border border-border/80 p-8 text-center text-[13px] text-muted-foreground">
            Loading projects…
          </div>
        ) : projects.length === 0 ? (
          <WorkEmptyState
            icon={Folder}
            title="No projects in this space"
            description="Projects group related lists and tasks. Create one from the sidebar by hovering this space and clicking +."
          />
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
    </WorkHubPage>
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

  const listCount = lists?.length ?? 0

  return (
    <WorkEntityCard
      to="/app/$workspaceId/$spaceId/$projectId"
      params={{ workspaceId, spaceId, projectId: project.id }}
      icon={
        <span
          className="h-full w-full flex items-center justify-center text-sm font-bold text-white rounded-xl"
          style={{ backgroundColor: project.color ?? 'hsl(var(--brand-500))' }}
        >
          {project.icon ?? project.name.charAt(0).toUpperCase()}
        </span>
      }
      iconClassName="p-0 overflow-hidden"
      title={project.name}
      subtitle={project.description}
      meta={`${listCount} list${listCount !== 1 ? 's' : ''}`}
    />
  )
}

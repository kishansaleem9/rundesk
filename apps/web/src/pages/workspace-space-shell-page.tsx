import { useState } from 'react'
import { Outlet, useMatches, useParams } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Folder, Users, CircleDot, ArchiveRestore } from 'lucide-react'
import { Button } from '@rundesk/ui'
import { api } from '../lib/api'
import { WorkHubPage, WorkEmptyState, WorkEntityCard } from '../components/work/work-ui'
import { ContainerMembersSheet } from '../components/container-members-sheet'
import { ScopedStatusesManager } from '../components/list-statuses-manager'

type Project = {
  id: string
  name: string
  description?: string | null
  color?: string | null
  icon?: string | null
}

type Space = { id: string; name: string; description?: string | null; visibility?: string | null }

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
  const [membersOpen, setMembersOpen] = useState(false)
  const [statusesOpen, setStatusesOpen] = useState(false)

  const { data: spaces = [] } = useQuery({
    queryKey: ['spaces', workspaceId],
    queryFn: () => api<Space[]>(`/spaces/workspace/${workspaceId}`),
  })
  const space = spaces.find((s) => s.id === spaceId)

  const qc = useQueryClient()
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects', spaceId],
    queryFn: () => api<Project[]>(`/projects/space/${spaceId}`),
  })
  const { data: archivedProjects = [] } = useQuery({
    queryKey: ['projects-archived', spaceId],
    queryFn: () => api<Project[]>(`/projects/space/${spaceId}/archived`),
  })
  const restoreProject = useMutation({
    mutationFn: (projectId: string) => api(`/projects/${projectId}/restore`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects', spaceId] })
      qc.invalidateQueries({ queryKey: ['projects-archived', spaceId] })
      qc.invalidateQueries({ queryKey: ['space-tree'] })
    },
  })

  return (
    <WorkHubPage
      breadcrumb="Space"
      title={space?.name ?? 'Space'}
      description={space?.description}
      headerAction={
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setStatusesOpen(true)}>
            <CircleDot className="h-3.5 w-3.5 mr-1.5" />
            Statuses
          </Button>
          <Button size="sm" variant="outline" onClick={() => setMembersOpen(true)}>
            <Users className="h-3.5 w-3.5 mr-1.5" />
            Members
          </Button>
        </div>
      }
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

      {archivedProjects.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[13px] font-semibold text-muted-foreground mb-2">
            Archived projects ({archivedProjects.length})
          </h2>
          <div className="space-y-1">
            {archivedProjects.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-md border border-border/70 bg-card/40 px-3 py-1.5"
              >
                <span className="text-[13px] text-muted-foreground truncate">{p.name}</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0"
                  disabled={restoreProject.isPending}
                  onClick={() => restoreProject.mutate(p.id)}
                >
                  <ArchiveRestore className="h-3.5 w-3.5 mr-1.5" />
                  Restore
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      <ContainerMembersSheet
        kind="space"
        containerId={spaceId}
        workspaceId={workspaceId}
        containerName={space?.name}
        initialVisibility={space?.visibility ?? 'public'}
        open={membersOpen}
        onOpenChange={setMembersOpen}
      />

      <ScopedStatusesManager
        scope="space"
        containerId={spaceId}
        containerName={space?.name}
        open={statusesOpen}
        onOpenChange={setStatusesOpen}
      />
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

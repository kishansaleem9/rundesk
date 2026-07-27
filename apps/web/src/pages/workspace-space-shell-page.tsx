import { useState } from 'react'
import { Outlet, useMatches, useNavigate, useParams } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Folder,
  FolderOpen,
  Users,
  CircleDot,
  ArchiveRestore,
  MoreHorizontal,
  Pencil,
  Trash2,
  LayoutGrid,
  Plus,
  ChevronDown,
  Lock,
} from 'lucide-react'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  cn,
  toast,
} from '@rundesk/ui'
import { api } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import { WorkHubPage, WorkEmptyState, WorkEntityCard, WorkCreateCard } from '../components/work/work-ui'
import { ContainerMembersSheet } from '../components/container-members-sheet'
import { ContainerEditDialog, type ContainerEditValues } from '../components/container-edit-dialog'
import { ScopedStatusesManager } from '../components/list-statuses-manager'
import { SpaceViewsDialog } from '../components/space-views-dialog'

type Project = {
  id: string
  name: string
  description?: string | null
  color?: string | null
  icon?: string | null
  /** Level-4 grouping — null means the project sits directly under the space. */
  folderId?: string | null
}

type SpaceFolder = {
  id: string
  name: string
  color?: string | null
  visibility?: string | null
}

type Space = {
  id: string
  name: string
  description?: string | null
  visibility?: string | null
  color?: string | null
  icon?: string | null
  viewConfig?: { defaultView?: string; enabledViews?: string[] } | null
}

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
  const { t, tCount } = useTranslation()
  const navigate = useNavigate()
  const { workspaceId, spaceId } = useParams({ from: '/app/$workspaceId/$spaceId' })
  const [membersOpen, setMembersOpen] = useState(false)
  const [statusesOpen, setStatusesOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [viewsOpen, setViewsOpen] = useState(false)
  const [showCreateProject, setShowCreateProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')

  const { data: spaces = [] } = useQuery({
    queryKey: ['spaces', workspaceId],
    queryFn: () => api<Space[]>(`/spaces/workspace/${workspaceId}`),
  })
  const space = spaces.find((s) => s.id === spaceId)

  const qc = useQueryClient()

  // §2/§13.4 — rename + set color/icon. PUT /spaces/:id accepts a partial
  // { name, description, color, icon }; refresh both the space list and the
  // sidebar tree so the change is visible everywhere.
  const editSpace = useMutation({
    mutationFn: (values: ContainerEditValues) =>
      api(`/spaces/${spaceId}`, { method: 'PUT', body: values }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spaces', workspaceId] })
      qc.invalidateQueries({ queryKey: ['space-tree'] })
      setEditOpen(false)
    },
    onError: () => toast.error(t('container.saveError')),
  })

  // §2/§13.4 — DELETE /spaces/:id archives the space; leave it and return to the
  // workspace home since this route no longer resolves to anything.
  const deleteSpace = useMutation({
    mutationFn: () => api(`/spaces/${spaceId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spaces', workspaceId] })
      qc.invalidateQueries({ queryKey: ['space-tree'] })
      navigate({ to: '/app/$workspaceId', params: { workspaceId } })
    },
    onError: () => toast.error(t('container.deleteError')),
  })
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects', spaceId],
    queryFn: () => api<Project[]>(`/projects/space/${spaceId}`),
  })
  const { data: archivedProjects = [] } = useQuery({
    queryKey: ['projects-archived', spaceId],
    queryFn: () => api<Project[]>(`/projects/space/${spaceId}/archived`),
  })
  // §2 — a space's folders. The sidebar tree already showed these; the space
  // page itself used to list projects only, so a folder was invisible here.
  const { data: folders = [] } = useQuery({
    queryKey: ['folders', spaceId],
    queryFn: () => api<SpaceFolder[]>(`/spaces/${spaceId}/folders`),
  })
  // Projects grouped under their folder; `null` folderId = directly in the space.
  //
  // A project can also point at a folder that isn't in `folders` — the folder
  // was deleted (it keeps its folderId so restoring the folder re-groups it) or
  // it's private and this user can't see it. Those projects must fall back to
  // the ungrouped list, otherwise they'd render nowhere and look deleted.
  const visibleFolderIds = new Set(folders.map((f) => f.id))
  const projectsByFolder = new Map<string, Project[]>()
  for (const p of projects) {
    if (!p.folderId || !visibleFolderIds.has(p.folderId)) continue
    const bucket = projectsByFolder.get(p.folderId)
    if (bucket) bucket.push(p)
    else projectsByFolder.set(p.folderId, [p])
  }
  const ungroupedProjects = projects.filter((p) => !p.folderId || !visibleFolderIds.has(p.folderId))
  const restoreProject = useMutation({
    mutationFn: (projectId: string) => api(`/projects/${projectId}/restore`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects', spaceId] })
      qc.invalidateQueries({ queryKey: ['projects-archived', spaceId] })
      qc.invalidateQueries({ queryKey: ['space-tree'] })
    },
  })

  // §2 — create a project directly from the space (client feedback: a space
  // needs its own "+ Add project", like a project's "+ Add list"). Refresh the
  // project grid + sidebar tree, then open the new project.
  const createProject = useMutation({
    mutationFn: (name: string) =>
      api<{ id: string }>(`/projects`, { method: 'POST', body: { spaceId, name } }),
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: ['projects', spaceId] })
      qc.invalidateQueries({ queryKey: ['space-tree'] })
      setShowCreateProject(false)
      setNewProjectName('')
      navigate({
        to: '/app/$workspaceId/$spaceId/$projectId',
        params: { workspaceId, spaceId, projectId: project.id },
      })
    },
    onError: () => toast.error(t('container.saveError')),
  })

  return (
    <WorkHubPage
      breadcrumb={t('spaceShell.breadcrumb')}
      title={space?.name ?? t('spaceShell.titleFallback')}
      description={space?.description}
      headerAction={
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setStatusesOpen(true)}>
            <CircleDot className="h-3.5 w-3.5 mr-1.5" />
            {t('spaceShell.statuses')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setViewsOpen(true)}>
            <LayoutGrid className="h-3.5 w-3.5 mr-1.5" />
            {t('spaceShell.views')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setMembersOpen(true)}>
            <Users className="h-3.5 w-3.5 mr-1.5" />
            {t('spaceShell.members')}
          </Button>
          <Button
            size="sm"
            className="bg-violet-600 hover:bg-violet-700 text-white"
            onClick={() => setShowCreateProject((v) => !v)}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            {showCreateProject ? t('common.cancel') : t('spaceShell.addProject')}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="px-2"
                aria-label={t('nav.actionsFor', { name: space?.name ?? '' })}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                <Pencil className="h-3.5 w-3.5" />
                {t('space.editAction')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => {
                  if (window.confirm(t('space.deleteConfirm', { name: space?.name ?? '' }))) {
                    deleteSpace.mutate()
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t('space.deleteAction')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      }
    >
      {folders.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[15px] font-semibold text-foreground">{t('spaceShell.folders')}</h2>
            <span className="text-[12px] text-muted-foreground">
              {tCount('spaceShell.folderCount', folders.length)}
            </span>
          </div>
          <div className="space-y-2.5">
            {folders.map((folder) => (
              <FolderGroup
                key={folder.id}
                folder={folder}
                projects={projectsByFolder.get(folder.id) ?? []}
                workspaceId={workspaceId}
                spaceId={spaceId}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-semibold text-foreground">{t('spaceShell.projects')}</h2>
          <span className="text-[12px] text-muted-foreground">
            {tCount('spaceShell.projectCount', ungroupedProjects.length)}
          </span>
        </div>

        {showCreateProject && (
          <WorkCreateCard onCancel={() => setShowCreateProject(false)}>
            <Input
              autoFocus
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newProjectName.trim() && !createProject.isPending) {
                  createProject.mutate(newProjectName.trim())
                }
              }}
              placeholder={t('spaceShell.projectNamePlaceholder')}
              className="h-9"
            />
            <Button
              size="sm"
              className="bg-violet-600 hover:bg-violet-700 text-white"
              onClick={() => createProject.mutate(newProjectName.trim())}
              disabled={!newProjectName.trim() || createProject.isPending}
            >
              {createProject.isPending ? t('spaceShell.creatingProject') : t('spaceShell.createProject')}
            </Button>
          </WorkCreateCard>
        )}

        {isLoading ? (
          <div className="rounded-lg border border-border/80 p-8 text-center text-[13px] text-muted-foreground">
            {t('spaceShell.loadingProjects')}
          </div>
        ) : projects.length === 0 && folders.length === 0 ? (
          <WorkEmptyState
            icon={Folder}
            title={t('spaceShell.noProjectsTitle')}
            description={t('spaceShell.noProjectsBody')}
            action={
              <Button
                className="bg-violet-600 hover:bg-violet-700 text-white"
                onClick={() => setShowCreateProject(true)}
              >
                <Plus className="h-4 w-4 mr-1.5" /> {t('spaceShell.addProject')}
              </Button>
            }
          />
        ) : ungroupedProjects.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/70 p-6 text-center text-[13px] text-muted-foreground">
            {t('spaceShell.allProjectsInFolders')}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {ungroupedProjects.map((project) => (
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
            {t('spaceShell.archivedProjects', { count: archivedProjects.length })}
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
                  {t('spaceShell.restore')}
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

      <SpaceViewsDialog
        open={viewsOpen}
        onOpenChange={setViewsOpen}
        spaceId={spaceId}
        workspaceId={workspaceId}
        initial={space?.viewConfig}
      />

      <ContainerEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title={t('space.editTitle')}
        initial={{
          name: space?.name ?? '',
          color: space?.color ?? '',
          icon: space?.icon ?? '',
        }}
        fields={{ color: true, icon: true }}
        submitting={editSpace.isPending}
        onSubmit={(values) => editSpace.mutate(values)}
      />
    </WorkHubPage>
  )
}

/**
 * §2 — a folder rendered on the space page, with the projects it groups nested
 * inside it. Collapsible so a space with many folders stays scannable; open by
 * default so a folder's contents are visible without an extra click.
 */
function FolderGroup({
  folder,
  projects,
  workspaceId,
  spaceId,
}: {
  folder: SpaceFolder
  projects: Project[]
  workspaceId: string
  spaceId: string
}) {
  const { t, tCount } = useTranslation()
  const [open, setOpen] = useState(true)
  const accent = folder.color ?? 'hsl(var(--brand-500))'

  return (
    <div className="rounded-lg border border-border/80 bg-card/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-accent/10 transition-colors"
      >
        <ChevronDown
          className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', !open && '-rotate-90')}
        />
        {open ? (
          <FolderOpen className="h-4 w-4 shrink-0" style={{ color: accent }} />
        ) : (
          <Folder className="h-4 w-4 shrink-0" style={{ color: accent }} />
        )}
        <span className="text-[14px] font-medium text-foreground truncate">{folder.name}</span>
        {folder.visibility === 'private' && (
          <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-label={t('nav.makePrivate')} />
        )}
        <span className="ml-auto shrink-0 text-[12px] text-muted-foreground">
          {tCount('spaceShell.projectCount', projects.length)}
        </span>
      </button>

      {open && (
        <div className="px-3.5 pb-3.5 pt-0.5">
          {projects.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground px-0.5 py-1.5">{t('spaceShell.folderEmpty')}</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
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
        </div>
      )}
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
  const { tCount } = useTranslation()
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
      meta={tCount('spaceShell.listCount', listCount)}
    />
  )
}

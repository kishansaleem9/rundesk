import { useState } from 'react'
import { Outlet, useMatches, useNavigate, useParams } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Input,
  Card,
  Badge,
  cn,
  toast,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@rundesk/ui'
import { List as ListIcon, Plus, Settings, Trash2, Users, CircleDot, DollarSign, Receipt, Activity, Sparkles, Copy, Loader2, X, Check, HeartPulse, Globe, ExternalLink, MoreHorizontal, Pencil, Archive } from 'lucide-react'
import { formatDistanceToNowStrict } from 'date-fns'
import { api, ApiError } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import {
  WorkHubPage,
  WorkEmptyState,
  WorkEntityCard,
  WorkCreateCard,
  WorkSectionTitle,
} from '../components/work/work-ui'
import { ContainerMembersSheet } from '../components/container-members-sheet'
import { ContainerEditDialog, type ContainerEditValues } from '../components/container-edit-dialog'
import { ScopedStatusesManager } from '../components/list-statuses-manager'
import { InlineSkeleton } from '../components/loading-skeletons'
import { useWorkspaceRole } from '../hooks/use-workspace-role'
import { usePermissions } from '../hooks/use-permissions'
import { useCreatable } from '../hooks/use-creatable'
import { CREATE_TYPES } from '../lib/create-types'

type ProjectCapabilities = {
  edit: boolean
  archive: boolean
  members: boolean
  statuses: boolean
  /** Define, rename and delete the project's own fields (the define rule its field routes ask). */
  fields: boolean
  suggest: boolean
  /** Per list the page asks about — those it shows and those its fields are kept to; `fields` is the define rule for a field scoped to that list. */
  lists: Record<string, { rename: boolean; delete: boolean; fields: boolean }>
}

type List = {
  id: string
  name: string
  description?: string | null
}

type Project = { id: string; name: string; description?: string | null; visibility?: string | null; color?: string | null; icon?: string | null }

export function ProjectShell() {
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
  const { t, tCount } = useTranslation()
  const navigate = useNavigate()
  const { workspaceId, spaceId, projectId } = useParams({
    from: '/app/$workspaceId/$spaceId/$projectId',
  })
  const qc = useQueryClient()
  const [showCreateList, setShowCreateList] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [newListDescription, setNewListDescription] = useState('')
  const [membersOpen, setMembersOpen] = useState(false)
  const [statusesOpen, setStatusesOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [dragListId, setDragListId] = useState<string | null>(null)
  const [showSuggest, setShowSuggest] = useState(false)
  // A new list, offered where one may be made (`useCreatable`, the menus' own
  // answer): not to a guest who only passes through this space.
  const creatable = useCreatable(workspaceId)
  const mayAddList = CREATE_TYPES.some((ty) => ty.value === 'list' && creatable(ty, spaceId))

  const { data: projects = [] } = useQuery({
    queryKey: ['projects', spaceId],
    queryFn: () => api<Project[]>(`/projects/space/${spaceId}`),
  })
  const project = projects.find((p) => p.id === projectId)

  // §2/§13.4 — rename + edit description. PUT /projects/:id accepts a partial
  // { name, description }; refresh the space's project list, this project's
  // record, and the sidebar tree.
  const editProject = useMutation({
    mutationFn: (values: ContainerEditValues) =>
      api(`/projects/${projectId}`, { method: 'PUT', body: values }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects', spaceId] })
      qc.invalidateQueries({ queryKey: ['project', projectId] })
      qc.invalidateQueries({ queryKey: ['space-tree'] })
      setEditOpen(false)
    },
    onError: () => toast.error(t('container.saveError')),
  })

  // §2/§13.4 — DELETE /projects/:id archives the project (restorable from the
  // space page); return to the space once it's gone from this route.
  const archiveProject = useMutation({
    mutationFn: () => api(`/projects/${projectId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects', spaceId] })
      qc.invalidateQueries({ queryKey: ['projects-archived', spaceId] })
      qc.invalidateQueries({ queryKey: ['space-tree'] })
      navigate({ to: '/app/$workspaceId/$spaceId', params: { workspaceId, spaceId } })
    },
    onError: () => toast.error(t('container.deleteError')),
  })

  // §2/§13.4 — list rename + delete. The list being renamed is held in state so a
  // single dialog serves the whole grid; delete archives via DELETE /lists/:id.
  const [renameList, setRenameList] = useState<{ id: string; name: string } | null>(null)
  const invalidateLists = () => {
    qc.invalidateQueries({ queryKey: ['lists', projectId] })
    qc.invalidateQueries({ queryKey: ['project-lists', projectId] })
    qc.invalidateQueries({ queryKey: ['space-tree'] })
  }
  const renameListMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: ContainerEditValues }) =>
      api(`/lists/${id}`, { method: 'PUT', body: values }),
    onSuccess: (_data, { id }) => {
      invalidateLists()
      qc.invalidateQueries({ queryKey: ['list-meta', id] })
      setRenameList(null)
    },
    onError: () => toast.error(t('container.saveError')),
  })
  const deleteListMutation = useMutation({
    mutationFn: (id: string) => api(`/lists/${id}`, { method: 'DELETE' }),
    onSuccess: invalidateLists,
    onError: () => toast.error(t('container.deleteError')),
  })

  const { data: lists = [], isLoading } = useQuery({
    queryKey: ['lists', projectId],
    queryFn: () => api<List[]>(`/lists/project/${projectId}`),
  })

  /*
   * WHAT THIS PERSON MAY DO HERE, as each control's own route would answer
   * (`GET /projects/:id/capabilities`, with the lists this page shows). The page
   * drew Statuses, Suggest tasks, Edit, Archive, each list's Rename and Delete,
   * and the members' changes for anybody who could open it, and the route
   * behind each refused a guest passing through or a member who did not make
   * the project. Until it has answered, nothing that changes the project is
   * offered on a guess.
   *
   * AND THE LISTS ITS FIELDS ARE KEPT TO, so the Custom fields section has an
   * answer for a field of a list this page does not show (an archived one);
   * the same query as the section's, so it is asked once. Until the wider
   * answer is in, the last one stands for what it covered, and a list it did
   * not cover is offered nothing.
   *
   * THE LAST ANSWER STANDS ONLY FOR THIS PROJECT. The page stays drawn when a
   * link moves it to another project, and the answer kept for the wait was the
   * first project's: a member who may change one project's fields and statuses
   * followed the sidebar to a project they only view, and was offered Add
   * field, Statuses and a field's delete there until its own answer came
   * (lane 7, three runs alike, its answer held back).
   */
  const { data: projectFields = [] } = useQuery({
    queryKey: ['project-fields', workspaceId, projectId],
    queryFn: () => api<CustomFieldDef[]>(`/workspaces/${workspaceId}/projects/${projectId}/custom-fields`),
  })
  const listIds = [...new Set([...lists.map((l) => l.id), ...projectFields.flatMap((f) => (f.listId ? [f.listId] : []))])].sort().join(',')
  const { data: caps } = useQuery({
    queryKey: ['project-capabilities', projectId, listIds],
    queryFn: () => api<ProjectCapabilities>(`/projects/${projectId}/capabilities?lists=${encodeURIComponent(listIds)}`),
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[1] === projectId ? previous : undefined),
  })

  const reorderLists = useMutation({
    mutationFn: (orderedIds: string[]) =>
      api(`/lists/project/${projectId}/reorder`, { method: 'POST', body: { orderedIds } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lists', projectId] }),
  })
  const handleListDrop = (targetId: string) => {
    if (!dragListId || dragListId === targetId) {
      setDragListId(null)
      return
    }
    const ids = lists.map((l) => l.id)
    const from = ids.indexOf(dragListId)
    const to = ids.indexOf(targetId)
    if (from < 0 || to < 0) {
      setDragListId(null)
      return
    }
    ids.splice(to, 0, ids.splice(from, 1)[0])
    reorderLists.mutate(ids)
    setDragListId(null)
  }

  const createList = useMutation({
    mutationFn: () =>
      api<List>(`/lists`, {
        method: 'POST',
        body: {
          projectId,
          name: newListName.trim(),
          description: newListDescription.trim() || undefined,
        },
      }),
    onSuccess: () => {
      setShowCreateList(false)
      setNewListName('')
      setNewListDescription('')
      qc.invalidateQueries({ queryKey: ['lists', projectId] })
      // The space- and workspace-scoped list queries are different keys, not
      // prefixes of this one — see the note in `quick-create-modal.tsx`'s
      // ListForm. The bare prefix covers all of them.
      qc.invalidateQueries({ queryKey: ['lists'] })
    },
    // Refused ("List name taken", a space that is not theirs to add to), it
    // said nothing: the card sat there with its button looking un-pressed.
    onError: (e) => toast.error(e instanceof Error ? e.message : t('quickCreate.listFailed')),
  })

  return (
    <WorkHubPage
      breadcrumb={t('projectShell.breadcrumb')}
      title={project?.name ?? t('projectShell.titleFallback')}
      description={project?.description}
      headerAction={
        <div className="flex items-center gap-2">
          {caps?.statuses && (
            <Button size="sm" variant="outline" onClick={() => setStatusesOpen(true)}>
              <CircleDot className="h-3.5 w-3.5 mr-1.5" />
              {t('projectShell.statuses')}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setMembersOpen(true)}>
            <Users className="h-3.5 w-3.5 mr-1.5" />
            {t('projectShell.members')}
          </Button>
          {caps?.suggest && (
            <Button size="sm" variant="outline" onClick={() => setShowSuggest((v) => !v)}>
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              {t('projectShell.suggestTasks')}
            </Button>
          )}
          {mayAddList && (
            <Button
              size="sm"
              className="bg-violet-600 hover:bg-violet-700 text-white"
              onClick={() => setShowCreateList((v) => !v)}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              {showCreateList ? t('common.cancel') : t('projectShell.addList')}
            </Button>
          )}
          {(caps?.edit || caps?.archive) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="px-2"
                  aria-label={t('nav.actionsFor', { name: project?.name ?? '' })}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {caps.edit && (
                  <DropdownMenuItem onClick={() => setEditOpen(true)}>
                    <Pencil className="h-3.5 w-3.5" />
                    {t('project.editAction')}
                  </DropdownMenuItem>
                )}
                {caps.edit && caps.archive && <DropdownMenuSeparator />}
                {caps.archive && (
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => {
                      if (window.confirm(t('project.archiveConfirm', { name: project?.name ?? '' }))) {
                        archiveProject.mutate()
                      }
                    }}
                  >
                    <Archive className="h-3.5 w-3.5" />
                    {t('project.archiveAction')}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      }
    >
      <section className="mb-10">
        <WorkSectionTitle
          action={
            <span className="text-[12px] text-muted-foreground">
              {tCount('projectShell.listCount', lists.length)}
            </span>
          }
        >
          {t('projectShell.lists')}
        </WorkSectionTitle>

        {showCreateList && mayAddList && (
          <WorkCreateCard onCancel={() => setShowCreateList(false)}>
            <Input
              autoFocus
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder={t('projectShell.listNamePlaceholder')}
              className="h-9"
            />
            <Input
              value={newListDescription}
              onChange={(e) => setNewListDescription(e.target.value)}
              placeholder={t('projectShell.descriptionPlaceholder')}
              className="h-9"
            />
            <Button
              size="sm"
              className="bg-violet-600 hover:bg-violet-700 text-white"
              onClick={() => createList.mutate()}
              disabled={!newListName.trim() || createList.isPending}
            >
              {createList.isPending ? t('projectShell.creating') : t('projectShell.createList')}
            </Button>
          </WorkCreateCard>
        )}

        {showSuggest && (
          <SuggestTasksPanel
            workspaceId={workspaceId}
            projectId={projectId}
            projectName={project?.name}
            description={project?.description}
            lists={lists}
            onClose={() => setShowSuggest(false)}
          />
        )}

        {isLoading ? (
          <div className="rounded-lg border border-border/80 p-8 text-center text-[13px] text-muted-foreground">
            <InlineSkeleton />
          </div>
        ) : lists.length === 0 ? (
          <WorkEmptyState
            icon={ListIcon}
            title={t('projectShell.noListsTitle')}
            description={t('projectShell.noListsBody')}
            action={
              mayAddList ? (
                <Button
                  className="bg-violet-600 hover:bg-violet-700 text-white"
                  onClick={() => setShowCreateList(true)}
                >
                  <Plus className="h-4 w-4 mr-1.5" /> {t('projectShell.addList')}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {lists.map((list) => (
              <div
                key={list.id}
                draggable
                onDragStart={() => setDragListId(list.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleListDrop(list.id)}
                onDragEnd={() => setDragListId(null)}
                className={cn('relative group cursor-grab active:cursor-grabbing', dragListId === list.id && 'opacity-50')}
                title={t('projectShell.dragToReorder')}
              >
                <ListCard
                  list={list}
                  workspaceId={workspaceId}
                  spaceId={spaceId}
                  projectId={projectId}
                />
                {/* Rename / delete overlay — sibling of the card Link so it never
                    triggers navigation (Plan §2/§13.4). Each offered only where
                    the list's own route would take it (`caps.lists`). */}
                {(caps?.lists[list.id]?.rename || caps?.lists[list.id]?.delete) && (
                  <div className="absolute right-2 top-2 z-10">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          onClick={(e) => e.stopPropagation()}
                          className="rounded-md border border-border/60 bg-card/80 p-1 text-muted-foreground opacity-0 backdrop-blur transition-opacity hover:bg-accent/20 hover:text-foreground focus:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
                          aria-label={t('nav.actionsFor', { name: list.name })}
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        {caps.lists[list.id].rename && (
                          <DropdownMenuItem onClick={() => setRenameList({ id: list.id, name: list.name })}>
                            <Pencil className="h-3.5 w-3.5" />
                            {t('container.rename')}
                          </DropdownMenuItem>
                        )}
                        {caps.lists[list.id].rename && caps.lists[list.id].delete && <DropdownMenuSeparator />}
                        {caps.lists[list.id].delete && (
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => {
                              if (window.confirm(t('list.deleteConfirm', { name: list.name }))) {
                                deleteListMutation.mutate(list.id)
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {t('list.deleteAction')}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <ProjectHealthSection workspaceId={workspaceId} projectId={projectId} />

      <CustomFieldsSection workspaceId={workspaceId} projectId={projectId} caps={caps} lists={lists} />

      <ProjectActivitySection projectId={projectId} workspaceId={workspaceId} projectName={project?.name} />

      <ProjectTimeSettingsSection projectId={projectId} workspaceId={workspaceId} canEdit={caps ? caps.edit === true : null} />

      <ClientInvoicesSection workspaceId={workspaceId} projectId={projectId} />

      <ClientPortalSection projectId={projectId} workspaceId={workspaceId} />

      <ContainerMembersSheet
        kind="project"
        containerId={projectId}
        workspaceId={workspaceId}
        containerName={project?.name}
        initialVisibility={project?.visibility ?? null}
        open={membersOpen}
        onOpenChange={setMembersOpen}
        canManage={caps?.members === true}
      />

      <ScopedStatusesManager
        scope="project"
        containerId={projectId}
        containerName={project?.name}
        open={statusesOpen}
        onOpenChange={setStatusesOpen}
      />

      <ContainerEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title={t('project.editTitle')}
        initial={{
          name: project?.name ?? '',
          description: project?.description ?? '',
          color: project?.color ?? '',
          icon: project?.icon ?? '',
        }}
        fields={{ description: true, color: true, icon: true }}
        submitting={editProject.isPending}
        onSubmit={(values) => editProject.mutate(values)}
      />

      <ContainerEditDialog
        open={renameList !== null}
        onOpenChange={(next) => {
          if (!next) setRenameList(null)
        }}
        title={t('list.renameTitle')}
        initial={{ name: renameList?.name ?? '' }}
        submitting={renameListMutation.isPending}
        onSubmit={(values) => {
          if (renameList) renameListMutation.mutate({ id: renameList.id, values })
        }}
      />
    </WorkHubPage>
  )
}

// §7.10 — Smart task suggestions. Learns from similar existing projects in the
// workspace and proposes a starter task list; each item can be accepted/rejected
// and the selected ones are created in a chosen list via the normal task-create.
type TaskSuggestion = { title: string; priority?: 'urgent' | 'high' | 'normal' | 'low' }
type SuggestResult = { source: 'ai' | 'heuristic'; suggestions: TaskSuggestion[]; basis: string }

function SuggestTasksPanel({
  workspaceId,
  projectId,
  projectName,
  description,
  lists,
  onClose,
}: {
  workspaceId: string
  projectId: string
  projectName?: string | null
  description?: string | null
  lists: List[]
  onClose: () => void
}) {
  const { t, tCount } = useTranslation()
  const qc = useQueryClient()
  const [rejected, setRejected] = useState<Set<number>>(new Set())
  const [targetListId, setTargetListId] = useState<string>(lists[0]?.id ?? '')

  const suggestQ = useQuery({
    queryKey: ['suggest-tasks', workspaceId, projectId],
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: () =>
      api<SuggestResult>('/ai/suggest-tasks', {
        method: 'POST',
        body: { workspaceId, projectId, projectName, description },
      }),
  })

  const suggestions = suggestQ.data?.suggestions ?? []
  const chosenCount = suggestions.filter((_, i) => !rejected.has(i)).length

  const toggle = (i: number) =>
    setRejected((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  const addSelected = useMutation({
    mutationFn: async () => {
      if (!targetListId) throw new Error('no-list')
      let created = 0
      for (let i = 0; i < suggestions.length; i++) {
        if (rejected.has(i)) continue
        await api('/tasks', {
          method: 'POST',
          body: {
            listId: targetListId,
            title: suggestions[i].title,
            // Let the backend seed the list's first/default status.
            priority: suggestions[i].priority ?? 'normal',
          },
        })
        created++
      }
      return created
    },
    onSuccess: (count) => {
      toast.success(tCount('projectShell.suggestAdded', count))
      qc.invalidateQueries({ queryKey: ['tasks', targetListId] })
      qc.invalidateQueries({ queryKey: ['lists', projectId] })
      onClose()
    },
    onError: () => toast.error(t('projectShell.suggestAddError')),
  })

  return (
    <Card variant="glass" className="mb-4 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-gradient text-white">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <div>
            <div className="text-sm font-semibold">{t('projectShell.suggestTitle')}</div>
            <div className="text-[11px] text-muted-foreground">{t('projectShell.suggestDesc')}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {suggestQ.data && (
            <Badge variant={suggestQ.data.source === 'ai' ? 'gradient' : 'soft'} className="text-[9px] uppercase">
              {suggestQ.data.source === 'ai'
                ? t('projectShell.suggestSourceAi')
                : t('projectShell.suggestSourceHeuristic')}
            </Badge>
          )}
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {suggestQ.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> <InlineSkeleton />
        </div>
      ) : suggestQ.isError ? (
        <div className="py-6 text-center text-sm text-muted-foreground">{t('projectShell.suggestError')}</div>
      ) : suggestions.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">{t('projectShell.suggestEmpty')}</div>
      ) : (
        <>
          <p className="mb-2 text-[11px] text-muted-foreground">{suggestQ.data?.basis}</p>
          <ul className="mb-3 space-y-1.5">
            {suggestions.map((s, i) => {
              const isRejected = rejected.has(i)
              return (
                <li
                  key={`${s.title}-${i}`}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors',
                    isRejected ? 'border-border/40 opacity-50' : 'border-border/60 bg-card/40',
                  )}
                >
                  <button
                    onClick={() => toggle(i)}
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded border',
                      isRejected ? 'border-border text-transparent' : 'border-accent bg-accent text-white',
                    )}
                    aria-label={isRejected ? t('projectShell.suggestAccept') : t('projectShell.suggestReject')}
                  >
                    <Check className="h-3 w-3" />
                  </button>
                  <span className={cn('flex-1 text-sm', isRejected && 'line-through')}>{s.title}</span>
                  {s.priority && s.priority !== 'normal' && (
                    <Badge variant="soft" className="text-[9px] uppercase">
                      {s.priority}
                    </Badge>
                  )}
                </li>
              )
            })}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-muted-foreground">{t('projectShell.suggestTargetList')}</span>
            {lists.length === 0 ? (
              <span className="text-[11px] text-warning">{t('projectShell.suggestNoLists')}</span>
            ) : (
              <select
                value={targetListId}
                onChange={(e) => setTargetListId(e.target.value)}
                className="h-8 rounded-md border border-border bg-background px-2 text-sm"
              >
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            )}
            <Button
              size="sm"
              className="ml-auto bg-violet-600 text-white hover:bg-violet-700"
              disabled={chosenCount === 0 || !targetListId || addSelected.isPending}
              onClick={() => addSelected.mutate()}
            >
              {addSelected.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="mr-1.5 h-3.5 w-3.5" />
              )}
              {tCount('projectShell.suggestAddSelected', chosenCount)}
            </Button>
          </div>
        </>
      )}
    </Card>
  )
}

// §7.13 — persisted daily project-health trend. Shows the current band + score,
// comment sentiment, and a 30-day sparkline read from project_health_scores.
type HealthTrend = {
  projectId: string
  days: number
  current: {
    score: number
    band: string
    sentiment: { score: number; label: string; samples: number } | null
  } | null
  points: Array<{ date: string; score: number; band: string }>
}

function HealthSparkline({ points }: { points: Array<{ date: string; score: number }> }) {
  const W = 240
  const H = 44
  const pad = 3
  const n = points.length
  const x = (i: number) => (n <= 1 ? W / 2 : pad + (i * (W - 2 * pad)) / (n - 1))
  const y = (v: number) => H - pad - (Math.max(0, Math.min(100, v)) / 100) * (H - 2 * pad)
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.score).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-11" preserveAspectRatio="none" role="img" aria-label="30-day health trend">
      {/* Green-band reference line at 75. */}
      <line x1={pad} y1={y(75)} x2={W - pad} y2={y(75)} stroke="hsl(var(--border))" strokeWidth="1" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
      <path d={d} fill="none" stroke="hsl(var(--accent))" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function ProjectHealthSection({ workspaceId, projectId }: { workspaceId: string; projectId: string }) {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery({
    queryKey: ['project-health-trend', workspaceId, projectId],
    queryFn: () =>
      api<HealthTrend>(`/workspaces/${workspaceId}/reports/project-health/trend?projectId=${projectId}&days=30`),
  })

  const bandLabel = (band?: string) =>
    band === 'green'
      ? t('projectShell.bandGreen')
      : band === 'yellow'
        ? t('projectShell.bandYellow')
        : band === 'red'
          ? t('projectShell.bandRed')
          : t('projectShell.bandEmpty')
  const bandVariant = (band?: string): 'success' | 'warning' | 'destructive' | 'soft' =>
    band === 'green' ? 'success' : band === 'yellow' ? 'warning' : band === 'red' ? 'destructive' : 'soft'
  const sentimentLabel = (label?: string) =>
    label === 'positive'
      ? t('projectShell.sentimentPositive')
      : label === 'negative'
        ? t('projectShell.sentimentNegative')
        : t('projectShell.sentimentNeutral')

  const points = data?.points ?? []
  const current = data?.current ?? null

  return (
    <section>
      <WorkSectionTitle>
        <span className="flex items-center gap-2">
          <HeartPulse className="h-4 w-4 text-pink-500" />
          {t('projectShell.healthTitle')}
        </span>
      </WorkSectionTitle>
      <p className="text-[13px] text-muted-foreground mb-4 -mt-1">{t('projectShell.healthDesc')}</p>

      {isLoading ? (
        <Card className="p-4 text-sm text-muted-foreground border-border/80"><InlineSkeleton /></Card>
      ) : !current || points.length === 0 ? (
        <Card className="p-4 text-[13px] text-muted-foreground border-dashed border-border/80">
          {t('projectShell.healthNoData')}
        </Card>
      ) : (
        <Card className="p-4 border-border/80">
          <div className="flex items-center gap-6 flex-wrap">
            <div>
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">
                {t('projectShell.healthScoreLabel')}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-display text-3xl font-semibold tabular-nums">{current.score}</span>
                <Badge variant={bandVariant(current.band)}>{bandLabel(current.band)}</Badge>
              </div>
            </div>
            {current.sentiment && current.sentiment.samples > 0 && (
              <div>
                <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">
                  {t('projectShell.healthSentimentLabel')}
                </div>
                <div className="text-sm">
                  {sentimentLabel(current.sentiment.label)}{' '}
                  <span className="text-muted-foreground tabular-nums">({current.sentiment.score})</span>
                </div>
              </div>
            )}
            <div className="flex-1 min-w-[180px]">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">
                {t('projectShell.healthTrendLabel')}
              </div>
              <HealthSparkline points={points} />
            </div>
          </div>
        </Card>
      )}
    </section>
  )
}

type CustomFieldDef = {
  id: string
  name: string
  type: 'text' | 'number' | 'dropdown' | 'date' | 'checkbox' | 'url' | 'email' | 'phone' | 'money' | 'rating'
  isRequired: boolean
  options: Array<{ label: string; value: string }> | null
  /** A field kept to one list of the project; none for a field of the whole project. */
  listId?: string | null
}

// The `value` is the persisted field-type identifier; `labelKey` references an
// i18n catalog entry resolved at render time.
const FIELD_TYPE_OPTIONS = [
  { value: 'text', labelKey: 'projectShell.fieldType.text' },
  { value: 'number', labelKey: 'projectShell.fieldType.number' },
  { value: 'dropdown', labelKey: 'projectShell.fieldType.dropdown' },
  { value: 'date', labelKey: 'projectShell.fieldType.date' },
  { value: 'checkbox', labelKey: 'projectShell.fieldType.checkbox' },
  { value: 'url', labelKey: 'projectShell.fieldType.url' },
  { value: 'email', labelKey: 'projectShell.fieldType.email' },
  { value: 'phone', labelKey: 'projectShell.fieldType.phone' },
  { value: 'money', labelKey: 'projectShell.fieldType.money' },
  { value: 'rating', labelKey: 'projectShell.fieldType.rating' },
] as const

/*
 * THE PROJECT'S FIELDS, OFFERED AS THE DEFINE RULE LETS THIS PERSON CHANGE
 * THEM (`caps.fields`, and `caps.lists[id].fields` for a field kept to one
 * list, from `GET /projects/:id/capabilities`, which asks the rule the field
 * routes ask). "Add field" and each field's delete were drawn for every
 * reader: a member of a view-only space pressed delete, the route refused it
 * (403) and nothing said so (`found-6-oct/project-page-offers-field-edits-to-readers`).
 * Until the answer is in, nothing is offered on a guess; a refusal is said in
 * the server's words. A field kept to one list says which.
 */
function CustomFieldsSection({
  workspaceId,
  projectId,
  caps,
  lists,
}: {
  workspaceId: string
  projectId: string
  caps: ProjectCapabilities | undefined
  lists: List[]
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<CustomFieldDef['type']>('text')
  const [isRequired, setIsRequired] = useState(false)
  const [options, setOptions] = useState('')

  const fieldsQuery = useQuery({
    queryKey: ['project-fields', workspaceId, projectId],
    queryFn: () =>
      api<CustomFieldDef[]>(`/workspaces/${workspaceId}/projects/${projectId}/custom-fields`),
  })
  const mayAdd = caps?.fields === true
  // A field kept to a list is changed by that list's answer; one of the whole project, by the project's.
  const mayChange = (f: CustomFieldDef) => (f.listId ? caps?.lists[f.listId]?.fields === true : mayAdd)
  const listName = (listId: string) => lists.find((l) => l.id === listId)?.name

  const create = useMutation({
    mutationFn: () => {
      const opts =
        type === 'dropdown'
          ? options
              .split(',')
              .map((o) => o.trim())
              .filter(Boolean)
              .map((o) => ({ label: o, value: o.toLowerCase().replace(/\s+/g, '_') }))
          : undefined
      return api(`/workspaces/${workspaceId}/projects/${projectId}/custom-fields`, {
        method: 'POST',
        body: { name, type, isRequired, options: opts },
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-fields', workspaceId, projectId] })
      setShowForm(false)
      setName('')
      setIsRequired(false)
      setOptions('')
      setType('text')
    },
    // Refused, it said nothing: the form sat there as if it had not been sent.
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('projectShell.fieldNotCreated')),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api(`/workspaces/${workspaceId}/custom-fields/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-fields', workspaceId, projectId] }),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('projectShell.fieldNotDeleted')),
  })

  const fields = fieldsQuery.data ?? []

  return (
    <section>
      <WorkSectionTitle
        action={
          mayAdd ? (
            <Button size="sm" variant="outline" onClick={() => setShowForm((v) => !v)}>
              <Settings className="h-3.5 w-3.5 mr-1.5" />
              {showForm ? t('common.cancel') : t('projectShell.addField')}
            </Button>
          ) : undefined
        }
      >
        <span className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-muted-foreground" />
          {t('projectShell.customFields')}
        </span>
      </WorkSectionTitle>
      <p className="text-[13px] text-muted-foreground mb-4 -mt-1">
        {t('projectShell.customFieldsDesc')}
      </p>

      {showForm && mayAdd && (
        <WorkCreateCard onCancel={() => setShowForm(false)}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('projectShell.fieldNamePlaceholder')}
            className="h-9"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as CustomFieldDef['type'])}
            className="h-9 w-full rounded-md border border-border/80 bg-background px-3 text-sm"
          >
            {FIELD_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} />
            {t('projectShell.required')}
          </label>
          {type === 'dropdown' && (
            <Input
              value={options}
              onChange={(e) => setOptions(e.target.value)}
              placeholder={t('projectShell.optionsPlaceholder')}
              className="h-9"
            />
          )}
          <Button
            size="sm"
            className="bg-violet-600 hover:bg-violet-700 text-white"
            disabled={!name.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? t('projectShell.creating') : t('projectShell.createField')}
          </Button>
        </WorkCreateCard>
      )}

      {fieldsQuery.isLoading ? (
        <Card className="p-4 text-sm text-muted-foreground border-border/80"><InlineSkeleton /></Card>
      ) : fields.length === 0 ? (
        <Card className="p-4 text-[13px] text-muted-foreground border-dashed border-border/80">
          {t('projectShell.noFieldsBody')}
        </Card>
      ) : (
        <Card className="divide-y border-border/80 overflow-hidden">
          {fields.map((f) => {
            const typeOpt = FIELD_TYPE_OPTIONS.find((o) => o.value === f.type)
            return (
            <div key={f.id} className="flex items-center gap-3 p-3 bg-background">
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-medium flex items-center gap-2">
                  {f.name}
                  {f.isRequired && <span className="text-destructive text-[11px]">{t('projectShell.requiredTag')}</span>}
                </div>
                <div className="text-[12px] text-muted-foreground capitalize">
                  {typeOpt ? t(typeOpt.labelKey) : f.type}
                  {Array.isArray(f.options) && f.options.length > 0 && (
                    <> — {f.options.map((o) => o.label).join(', ')}</>
                  )}
                </div>
                {f.listId && (
                  <div className="text-[12px] text-muted-foreground" data-testid={`project-field-scope-${f.id}`}>
                    {listName(f.listId)
                      ? t('projectShell.fieldOnList', { list: listName(f.listId)! })
                      : t('projectShell.fieldOnOneList')}
                  </div>
                )}
              </div>
              {mayChange(f) && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => remove.mutate(f.id)}
                  disabled={remove.isPending}
                  aria-label={t('projectShell.deleteField', { name: f.name })}
                  title={t('projectShell.deleteField', { name: f.name })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            )
          })}
        </Card>
      )}
    </section>
  )
}

type ProjectActivity = {
  id: string
  action: string
  createdAt: string
  taskId: string
  taskTitle?: string | null
  actor?: { id: string; displayName?: string | null; email?: string | null } | null
}

function activityIcon(action: string): string {
  if (action.includes('assigned')) return '👤'
  if (action.includes('comment')) return '💬'
  if (action.includes('status')) return '🔁'
  if (action.includes('attachment')) return '📎'
  if (action.includes('checklist')) return '☑️'
  if (action.includes('subtask')) return '🔗'
  if (action.includes('created')) return '✨'
  if (action.includes('deleted') || action.includes('archived')) return '🗑️'
  return '•'
}

function activityAsText(activity: ProjectActivity[], projectName?: string | null): string {
  const header = `Recent activity for project "${projectName ?? 'this project'}":`
  const lines = activity.slice(0, 30).map((a) => {
    const actor = a.actor?.displayName ?? a.actor?.email ?? 'Someone'
    const action = a.action.replace(/_/g, ' ')
    const on = a.taskTitle ? ` on "${a.taskTitle}"` : ''
    return `- ${actor} ${action}${on}`
  })
  return `${header}\n${lines.join('\n')}`
}

function ProjectActivitySection({
  projectId,
  workspaceId,
  projectName,
}: {
  projectId: string
  workspaceId: string
  projectName?: string | null
}) {
  const { t } = useTranslation()
  const { data: activity = [], isLoading } = useQuery({
    queryKey: ['project-activity', projectId],
    queryFn: () => api<ProjectActivity[]>(`/projects/${projectId}/activity?limit=40`),
  })
  const label = (action: string) => action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  // Draft a status update from recent project activity (Plan §7.9). Shown for
  // the user to copy / paste — the summarize AI turns the activity feed into prose.
  const [draft, setDraft] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const draftUpdate = useMutation({
    mutationFn: () =>
      api<{ summary: string }>('/ai/summarize', {
        method: 'POST',
        body: { content: activityAsText(activity, projectName), type: 'project', workspaceId },
      }),
    onSuccess: (r) => {
      setDraft(r.summary)
      setCopied(false)
    },
    onError: () => toast.error(t('projectShell.draftUpdateError')),
  })

  return (
    <section>
      <WorkSectionTitle
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() => draftUpdate.mutate()}
            disabled={draftUpdate.isPending || activity.length === 0}
            title={t('projectShell.draftUpdateTitle')}
          >
            {draftUpdate.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            )}
            {t('projectShell.draftUpdate')}
          </Button>
        }
      >
        <span className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          {t('projectShell.recentActivity')}
        </span>
      </WorkSectionTitle>
      <p className="text-[13px] text-muted-foreground mb-4 -mt-1">
        {t('projectShell.recentActivityDesc')}
      </p>

      {draft !== null && (
        <Card className="mb-4 border-accent/30 bg-accent/5 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-accent">
              <Sparkles className="h-3.5 w-3.5" />
              {t('projectShell.draftUpdateHeading')}
            </span>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  navigator.clipboard.writeText(draft)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1500)
                }}
              >
                <Copy className="h-3.5 w-3.5 mr-1" />
                {copied ? t('projectShell.copied') : t('projectShell.copy')}
              </Button>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="text-muted-foreground hover:text-foreground"
                title={t('common.close')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{draft}</p>
        </Card>
      )}
      {isLoading ? (
        <Card className="p-4 text-sm text-muted-foreground border-border/80"><InlineSkeleton /></Card>
      ) : activity.length === 0 ? (
        <Card className="p-4 text-[13px] text-muted-foreground border-dashed border-border/80">
          {t('projectShell.noActivityBody')}
        </Card>
      ) : (
        <Card className="border-border/80 overflow-hidden">
          <ol className="divide-y divide-border/60">
            {activity.map((a) => (
              <li key={a.id} className="flex items-start gap-3 p-3 text-sm">
                <span className="mt-0.5 shrink-0">{activityIcon(a.action)}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate">
                    <span className="font-medium">{a.actor?.displayName ?? a.actor?.email ?? t('projectShell.system')}</span>{' '}
                    <span className="text-muted-foreground">{label(a.action)}</span>
                    {a.taskTitle ? (
                      <>
                        {' '}
                        <span className="text-muted-foreground">{t('projectShell.activityOn')}</span>{' '}
                        <span className="font-medium">{a.taskTitle}</span>
                      </>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDistanceToNowStrict(new Date(a.createdAt), { addSuffix: true })}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </section>
  )
}

/*
 * THE TIME TRACKING SECTION OFFERS WHAT THIS PERSON MAY DO. The billable switch
 * and the client picker change the project, so they follow the project's own
 * edit rule (`caps.edit`, from `GET /projects/:id/capabilities`; null until it
 * has answered); for anybody else the picker still names the project's client
 * and its choices, disabled, and the section says whose they are to change.
 * Adding a client is `client.manage`'s, a manager's and an admin's by default
 * and grantable (`found-25-sep/admin-guard-admits-managers-where-the-web-says-admin`):
 * the "+ New client name" form was offered to everybody and the API refused a
 * plain member. A guest reads no workspace's client list, so a guest is shown no
 * client row at all.
 */
function ProjectTimeSettingsSection({ projectId, workspaceId, canEdit }: { projectId: string; workspaceId: string; canEdit: boolean | null }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [newClientName, setNewClientName] = useState('')
  const [manageClients, setManageClients] = useState(false)
  const { role } = useWorkspaceRole(workspaceId)
  const readsClients = role !== 'guest'
  const mayAddClient = usePermissions(workspaceId).can('client.manage')
  const projectQuery = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api<{ id: string; defaultBillable?: boolean; clientId?: string | null }>(`/projects/${projectId}`),
  })
  const clientsQuery = useQuery({
    queryKey: ['clients', workspaceId],
    queryFn: () => api<Array<{ id: string; name: string; contactEmail?: string | null }>>(`/workspaces/${workspaceId}/clients`),
    enabled: readsClients,
  })
  const defaultBillable = projectQuery.data?.defaultBillable ?? false
  const clientId = projectQuery.data?.clientId ?? ''
  const clients = clientsQuery.data ?? []

  const toggle = useMutation({
    mutationFn: (next: boolean) =>
      api(`/projects/${projectId}`, { method: 'PUT', body: { defaultBillable: next } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', projectId] }),
    onError: (err) => toast.error(err instanceof Error ? err.message : t('container.saveError')),
  })
  const setClient = useMutation({
    mutationFn: (nextClientId: string | null) =>
      api(`/projects/${projectId}`, { method: 'PUT', body: { clientId: nextClientId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', projectId] }),
    onError: (err) => toast.error(err instanceof Error ? err.message : t('container.saveError')),
  })
  const createClient = useMutation({
    mutationFn: (name: string) =>
      api<{ id: string }>(`/workspaces/${workspaceId}/clients`, { method: 'POST', body: { name } }),
    onSuccess: async (row) => {
      setNewClientName('')
      await qc.invalidateQueries({ queryKey: ['clients', workspaceId] })
      // Linking it changes the project: only for one who may. A member granted the
      // key on a project they may not change still makes the client.
      if (canEdit) setClient.mutate(row.id)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t('projectShell.createClientError')),
  })
  const billableLocked = canEdit !== true || projectQuery.isLoading || toggle.isPending

  return (
    <section>
      <WorkSectionTitle>
        <span className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-muted-foreground" />
          {t('projectShell.timeTracking')}
        </span>
      </WorkSectionTitle>
      <p className="text-[13px] text-muted-foreground mb-4 -mt-1">
        {t('projectShell.timeTrackingDesc')}
      </p>
      <Card className="p-4 border-border/80">
        {canEdit === false && (
          <p data-testid="project-time-settings-not-yours" className="text-[12px] text-muted-foreground mb-3">
            {t('projectShell.timeSettingsNotYours')}
          </p>
        )}
        <label className={cn('flex items-center justify-between gap-4', canEdit === true ? 'cursor-pointer' : 'cursor-default')}>
          <div>
            <div className="text-[14px] font-medium">{t('projectShell.billableByDefault')}</div>
            <div className="text-[12px] text-muted-foreground">
              {t('projectShell.billableDesc')}
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={defaultBillable}
            disabled={billableLocked}
            onClick={() => toggle.mutate(!defaultBillable)}
            className={cn(
              'relative h-6 w-11 shrink-0 rounded-full transition-colors',
              defaultBillable ? 'bg-brand-700' : 'bg-muted',
              billableLocked && 'opacity-60',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                defaultBillable && 'translate-x-5',
              )}
            />
          </button>
        </label>

        {readsClients && (
          <div className="mt-4 pt-4 border-t border-border/60">
            <div className="text-[14px] font-medium">{t('projectShell.client')}</div>
            <div className="text-[12px] text-muted-foreground mb-2">
              {t('projectShell.clientDesc')}
            </div>
            <div className="flex items-center gap-2">
              <select
                value={clientId}
                onChange={(e) => setClient.mutate(e.target.value || null)}
                disabled={canEdit !== true || setClient.isPending}
                className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-sm disabled:opacity-60"
              >
                <option value="">{t('projectShell.noClient')}</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {mayAddClient === true && clients.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  data-testid="project-manage-clients"
                  onClick={() => setManageClients(true)}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  {t('projectShell.manageClients')}
                </Button>
              )}
            </div>
            {mayAddClient === true && (
              <ManageClientsDialog
                workspaceId={workspaceId}
                clients={clients}
                open={manageClients}
                onOpenChange={setManageClients}
              />
            )}
            {mayAddClient === true ? (
              <form
                className="mt-2 flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (newClientName.trim()) createClient.mutate(newClientName.trim())
                }}
              >
                <Input
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  placeholder={t('projectShell.newClientPlaceholder')}
                  className="h-8 flex-1"
                />
                <Button type="submit" size="sm" variant="outline" disabled={!newClientName.trim() || createClient.isPending}>
                  {t('projectShell.add')}
                </Button>
              </form>
            ) : mayAddClient === false ? (
              <p data-testid="project-client-add-not-yours" className="mt-2 text-[12px] text-muted-foreground">
                {t('projectShell.clientAddNotYours')}
              </p>
            ) : null}
          </div>
        )}
      </Card>
    </section>
  )
}

/**
 * THE WORKSPACE'S CLIENTS, CHANGED AND DELETED where one is picked, by whoever
 * holds `client.manage` (`found-28-sep/clients-cannot-be-edited`): nothing
 * renamed a client, set the contact email an invoice prints, or deleted one.
 * A client with invoices is refused its delete, and the refusal says why.
 */
function ManageClientsDialog({
  workspaceId,
  clients,
  open,
  onOpenChange,
}: {
  workspaceId: string
  clients: Array<{ id: string; name: string; contactEmail?: string | null }>
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('projectShell.manageClients')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-auto">
          {clients.map((client) => (
            <ClientRow key={client.id} workspaceId={workspaceId} client={client} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ClientRow({
  workspaceId,
  client,
}: {
  workspaceId: string
  client: { id: string; name: string; contactEmail?: string | null }
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [name, setName] = useState(client.name)
  const [email, setEmail] = useState(client.contactEmail ?? '')
  const changed = name.trim() !== client.name || email.trim() !== (client.contactEmail ?? '')
  const refresh = () => qc.invalidateQueries({ queryKey: ['clients', workspaceId] })
  const save = useMutation({
    mutationFn: () =>
      api(`/workspaces/${workspaceId}/clients/${client.id}`, {
        method: 'PATCH',
        body: { name: name.trim(), contactEmail: email.trim() },
      }),
    onSuccess: async () => {
      toast.success(t('projectShell.clientSaved'))
      await refresh()
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('projectShell.clientNotSaved')),
  })
  const remove = useMutation({
    mutationFn: () => api(`/workspaces/${workspaceId}/clients/${client.id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success(t('projectShell.clientDeleted', { name: client.name }))
      await refresh()
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('projectShell.clientNotDeleted')),
  })
  return (
    <form
      data-testid={`client-row-${client.id}`}
      className="rounded-md border border-border/70 p-3 space-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (changed && name.trim()) save.mutate()
      }}
    >
      <Input
        aria-label={t('projectShell.clientName')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-8"
      />
      <Input
        aria-label={t('projectShell.clientEmail')}
        type="email"
        placeholder={t('projectShell.clientEmailPlaceholder')}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="h-8"
      />
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-destructive"
          disabled={remove.isPending}
          onClick={() => remove.mutate()}
        >
          <Trash2 className="h-3.5 w-3.5 mr-1" />
          {t('projectShell.deleteClient')}
        </Button>
        <Button type="submit" size="sm" disabled={!changed || !name.trim() || save.isPending}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  )
}

// §12.10 — Client invoicing. Turns a project's unbilled billable time into a
// client invoice and walks it through its lifecycle (draft → sent → paid, or
// void). Gated by the `workspace.billing` permission on the API — when the
// caller lacks it the list request 403s and we show a quiet note instead of the
// controls (rather than pre-detecting the permission client-side).
type ClientInvoice = {
  id: string
  number: string
  status: string
  currency: string
  subtotalCents: number
  totalCents: number
  projectId: string | null
  createdAt: string
}

type ClientInvoiceLineItem = {
  id: string
  description: string
  quantityMinutes: number
  unitAmountCents: number
  amountCents: number
}

/** Format an integer amount of cents as localized currency, e.g. `$1,250.00`. */
function formatCents(cents: number, currency: string): string {
  const value = (cents || 0) / 100
  const cur = (currency || 'usd').toUpperCase()
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(value)
  } catch {
    return `${value.toFixed(2)} ${cur}`
  }
}

function ClientInvoicesSection({ workspaceId, projectId }: { workspaceId: string; projectId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [rate, setRate] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const invoicesQuery = useQuery({
    queryKey: ['client-invoices', workspaceId],
    queryFn: () => api<ClientInvoice[]>(`/workspaces/${workspaceId}/client-invoices`),
    retry: false,
  })
  // The whole surface is billing-permission gated on the API; a 403 means the
  // current user simply can't see invoices — render a note, not an error.
  const forbidden = invoicesQuery.error instanceof ApiError && invoicesQuery.error.status === 403
  const invoices = (invoicesQuery.data ?? []).filter((inv) => inv.projectId === projectId)
  const invalidate = () => qc.invalidateQueries({ queryKey: ['client-invoices', workspaceId] })

  const generate = useMutation({
    mutationFn: () => {
      const dollars = parseFloat(rate)
      const ratePerHourCents = Number.isFinite(dollars) && dollars > 0 ? Math.round(dollars * 100) : undefined
      return api(`/workspaces/${workspaceId}/client-invoices/generate`, {
        method: 'POST',
        body: { projectId, ratePerHourCents },
      })
    },
    onSuccess: () => {
      setRate('')
      invalidate()
      toast.success(t('invoices.generated'))
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t('invoices.generateError')),
  })

  const transition = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'send' | 'paid' | 'void' }) =>
      api(`/workspaces/${workspaceId}/client-invoices/${id}/${action}`, { method: 'POST' }),
    onSuccess: invalidate,
    onError: (err) => toast.error(err instanceof Error ? err.message : t('invoices.actionError')),
  })

  return (
    <section>
      <WorkSectionTitle>
        <span className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-muted-foreground" />
          {t('invoices.title')}
        </span>
      </WorkSectionTitle>
      <p className="text-[13px] text-muted-foreground mb-4 -mt-1">{t('invoices.desc')}</p>

      {forbidden ? (
        <Card className="p-4 border-border/80 text-[13px] text-muted-foreground">
          {t('invoices.noPermission')}
        </Card>
      ) : (
        <Card className="p-4 border-border/80 space-y-4">
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              generate.mutate()
            }}
          >
            <div className="space-y-1">
              <label className="text-[12px] font-medium">{t('invoices.ratePerHour')}</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder={t('invoices.ratePlaceholder')}
                className="h-8 w-32"
              />
            </div>
            <Button type="submit" size="sm" disabled={generate.isPending}>
              {generate.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  {t('invoices.generating')}
                </>
              ) : (
                t('invoices.generate')
              )}
            </Button>
            <span className="text-[12px] text-muted-foreground">{t('invoices.rateHelp')}</span>
          </form>

          <div className="border-t border-border/60 pt-3">
            {invoicesQuery.isLoading ? (
              <div className="text-[13px] text-muted-foreground"><InlineSkeleton /></div>
            ) : invoices.length === 0 ? (
              <div className="text-[13px] text-muted-foreground">{t('invoices.empty')}</div>
            ) : (
              <ul className="divide-y divide-border/60">
                {invoices.map((inv) => {
                  const statusVariant =
                    inv.status === 'paid'
                      ? 'success'
                      : inv.status === 'sent'
                        ? 'warning'
                        : inv.status === 'void'
                          ? 'soft'
                          : 'secondary'
                  const statusLabel =
                    inv.status === 'paid'
                      ? t('invoices.statusPaid')
                      : inv.status === 'sent'
                        ? t('invoices.statusSent')
                        : inv.status === 'void'
                          ? t('invoices.statusVoid')
                          : t('invoices.statusDraft')
                  const isExpanded = expandedId === inv.id
                  const closed = inv.status === 'void' || inv.status === 'paid'
                  return (
                    <li key={inv.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-medium text-[14px]">{inv.number}</span>
                          <Badge variant={statusVariant}>{statusLabel}</Badge>
                        </div>
                        <span className="font-medium text-[14px]">{formatCents(inv.totalCents, inv.currency)}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="text-[12px] text-accent hover:underline"
                          onClick={() => setExpandedId(isExpanded ? null : inv.id)}
                        >
                          {isExpanded ? t('invoices.hideLineItems') : t('invoices.viewLineItems')}
                        </button>
                        <span className="flex-1" />
                        {!closed && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={transition.isPending}
                            onClick={() => transition.mutate({ id: inv.id, action: 'send' })}
                          >
                            {t('invoices.send')}
                          </Button>
                        )}
                        {!closed && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={transition.isPending}
                            onClick={() => transition.mutate({ id: inv.id, action: 'paid' })}
                          >
                            {t('invoices.markPaid')}
                          </Button>
                        )}
                        {inv.status !== 'void' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive"
                            disabled={transition.isPending}
                            onClick={() => {
                              if (window.confirm(t('invoices.voidConfirm', { number: inv.number }))) {
                                transition.mutate({ id: inv.id, action: 'void' })
                              }
                            }}
                          >
                            {t('invoices.void')}
                          </Button>
                        )}
                      </div>
                      {isExpanded && (
                        <InvoiceLineItems workspaceId={workspaceId} invoiceId={inv.id} currency={inv.currency} />
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </Card>
      )}
    </section>
  )
}

function InvoiceLineItems({
  workspaceId,
  invoiceId,
  currency,
}: {
  workspaceId: string
  invoiceId: string
  currency: string
}) {
  const { t } = useTranslation()
  const detailQuery = useQuery({
    queryKey: ['client-invoice', workspaceId, invoiceId],
    queryFn: () =>
      api<{ lineItems: ClientInvoiceLineItem[] }>(`/workspaces/${workspaceId}/client-invoices/${invoiceId}`),
  })
  const lineItems = detailQuery.data?.lineItems ?? []
  return (
    <div className="mt-2 rounded-md border border-border/60 bg-muted/20 p-2">
      {detailQuery.isLoading ? (
        <div className="text-[12px] text-muted-foreground"><InlineSkeleton /></div>
      ) : lineItems.length === 0 ? (
        <div className="text-[12px] text-muted-foreground">{t('invoices.noLineItems')}</div>
      ) : (
        <ul className="space-y-1">
          {lineItems.map((li) => (
            <li key={li.id} className="flex items-center justify-between gap-3 text-[12px]">
              <span className="truncate">{li.description}</span>
              <span className="flex items-center gap-2 shrink-0 text-muted-foreground">
                <span>{t('invoices.qtyMinutes', { minutes: li.quantityMinutes })}</span>
                <span className="text-foreground font-medium">{formatCents(li.amountCents, currency)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// §14.7 — Client-facing portal. Creates a tokenized, read-only, branded view of
// this project for external clients (no workspace access). Admins can copy the
// public link, enable/disable, toggle show-completed, revoke, and see when a
// client last opened it.
type AdminPortal = {
  id: string
  projectId: string
  clientId: string | null
  token: string
  url: string
  name: string | null
  isEnabled: boolean
  showCompleted: boolean
  createdById: string | null
  createdAt: string
  lastViewedAt: string | null
}

function ClientPortalSection({ projectId, workspaceId }: { projectId: string; workspaceId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [newName, setNewName] = useState('')
  // Portals are not a guest's to manage — the server refuses them — and a
  // workspace that blocks public sharing mints none.
  const { role } = useWorkspaceRole(workspaceId)
  const isGuest = role === 'guest'
  const workspaceQuery = useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: () => api<{ blockPublicSharing?: boolean }>(`/workspaces/${workspaceId}`),
    enabled: !isGuest,
  })
  const sharingBlocked = workspaceQuery.data?.blockPublicSharing === true

  const portalsQuery = useQuery({
    queryKey: ['client-portals', projectId],
    queryFn: () => api<AdminPortal[]>(`/projects/${projectId}/portal`),
    enabled: !isGuest,
  })
  const portals = portalsQuery.data ?? []
  const invalidate = () => qc.invalidateQueries({ queryKey: ['client-portals', projectId] })

  const createPortal = useMutation({
    mutationFn: () =>
      api<AdminPortal>(`/projects/${projectId}/portal`, {
        method: 'POST',
        body: { name: newName.trim() || undefined },
      }),
    onSuccess: () => {
      setNewName('')
      invalidate()
      toast.success(t('clientPortal.created'))
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t('clientPortal.createError')),
  })
  const updatePortal = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      api(`/portals/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: invalidate,
    onError: (err) => toast.error(err instanceof Error ? err.message : t('clientPortal.updateError')),
  })
  const removePortal = useMutation({
    mutationFn: (id: string) => api(`/portals/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidate()
      toast.success(t('clientPortal.revoked'))
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t('clientPortal.updateError')),
  })

  const publicUrl = (portal: AdminPortal) => `${window.location.origin}${portal.url}`
  const copyLink = (portal: AdminPortal) => {
    void navigator.clipboard
      .writeText(publicUrl(portal))
      .then(() => toast.success(t('clientPortal.copied')))
      .catch(() => toast.error(t('clientPortal.copyError')))
  }

  if (isGuest) return null

  return (
    <section data-testid="client-portal-section">
      <WorkSectionTitle>
        <span className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          {t('clientPortal.sectionTitle')}
        </span>
      </WorkSectionTitle>
      <p className="text-[13px] text-muted-foreground mb-4 -mt-1">{t('clientPortal.sectionDesc')}</p>

      <Card className="p-4 border-border/80 space-y-4">
        {/* Create */}
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            createPortal.mutate()
          }}
        >
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('clientPortal.namePlaceholder')}
            className="h-8 flex-1"
            disabled={sharingBlocked}
          />
          <Button type="submit" size="sm" data-testid="client-portal-create" disabled={createPortal.isPending || sharingBlocked}>
            {createPortal.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <><Plus className="h-3.5 w-3.5 mr-1.5" /> {t('clientPortal.create')}</>
            )}
          </Button>
        </form>

        {sharingBlocked && (
          <p className="text-[13px] text-muted-foreground" data-testid="client-portal-blocked">{t('clientPortal.publicSharingBlocked')}</p>
        )}

        {portalsQuery.isError ? (
          <p className="text-[13px] text-destructive" data-testid="client-portal-load-failed">{t('clientPortal.loadFailed')}</p>
        ) : portalsQuery.isPending ? (
          <InlineSkeleton />
        ) : portals.length === 0 ? (
          // "Create one to share this project" under a note that says none can be
          // made would contradict it; the note stands alone.
          sharingBlocked ? null : <p className="text-[13px] text-muted-foreground">{t('clientPortal.noPortal')}</p>
        ) : (
          <ul className="space-y-3">
            {portals.map((portal) => (
              <li key={portal.id} className="rounded-lg border border-border/70 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-medium truncate">
                        {portal.name || t('clientPortal.untitled')}
                      </span>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                          portal.isEnabled
                            ? 'bg-emerald-500/15 text-emerald-600'
                            : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {portal.isEnabled ? t('clientPortal.enabled') : t('clientPortal.disabled')}
                      </span>
                    </div>
                    <div className="mt-1 text-[12px] text-muted-foreground truncate font-mono">
                      {publicUrl(portal)}
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {portal.lastViewedAt
                        ? t('clientPortal.lastViewed', {
                            when: formatDistanceToNowStrict(new Date(portal.lastViewedAt), { addSuffix: true }),
                          })
                        : t('clientPortal.neverViewed')}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => copyLink(portal)} title={t('clientPortal.copyLink')}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <a href={publicUrl(portal)} target="_blank" rel="noreferrer" title={t('clientPortal.openLink')}>
                      <Button size="sm" variant="outline" type="button">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </a>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (window.confirm(t('clientPortal.revokeConfirm'))) removePortal.mutate(portal.id)
                      }}
                      title={t('clientPortal.revoke')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Toggles */}
                <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-border/50 pt-3">
                  <PortalToggle
                    label={t('clientPortal.enabledSetting')}
                    checked={portal.isEnabled}
                    disabled={updatePortal.isPending}
                    onChange={(next) => updatePortal.mutate({ id: portal.id, patch: { isEnabled: next } })}
                  />
                  <PortalToggle
                    label={t('clientPortal.showCompleted')}
                    checked={portal.showCompleted}
                    disabled={updatePortal.isPending}
                    onChange={(next) => updatePortal.mutate({ id: portal.id, patch: { showCompleted: next } })}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  )
}

function PortalToggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-[13px]">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors',
          checked ? 'bg-brand-700' : 'bg-muted',
          disabled && 'opacity-60',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
            checked && 'translate-x-4',
          )}
        />
      </button>
      <span>{label}</span>
    </label>
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
  const done = tasks?.filter((task) => task.status === 'done').length ?? 0

  return (
    <WorkEntityCard
      to="/app/$workspaceId/$spaceId/$projectId/$listId"
      params={{ workspaceId, spaceId, projectId, listId: list.id }}
      icon={<ListIcon className="h-5 w-5" />}
      title={list.name}
      subtitle={list.description}
      progress={{ done, total }}
    />
  )
}

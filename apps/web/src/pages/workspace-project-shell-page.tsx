import { useState } from 'react'
import { Outlet, useMatches, useParams } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Card, cn } from '@rundesk/ui'
import { List as ListIcon, Plus, Settings, Trash2, Users, CircleDot, DollarSign, Activity } from 'lucide-react'
import { formatDistanceToNowStrict } from 'date-fns'
import { api } from '../lib/api'
import {
  WorkHubPage,
  WorkEmptyState,
  WorkEntityCard,
  WorkCreateCard,
  WorkSectionTitle,
} from '../components/work/work-ui'
import { ContainerMembersSheet } from '../components/container-members-sheet'
import { ScopedStatusesManager } from '../components/list-statuses-manager'

type List = {
  id: string
  name: string
  description?: string | null
}

type Project = { id: string; name: string; description?: string | null; visibility?: string | null }

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
  const { workspaceId, spaceId, projectId } = useParams({
    from: '/app/$workspaceId/$spaceId/$projectId',
  })
  const qc = useQueryClient()
  const [showCreateList, setShowCreateList] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [newListDescription, setNewListDescription] = useState('')
  const [membersOpen, setMembersOpen] = useState(false)
  const [statusesOpen, setStatusesOpen] = useState(false)
  const [dragListId, setDragListId] = useState<string | null>(null)

  const { data: projects = [] } = useQuery({
    queryKey: ['projects', spaceId],
    queryFn: () => api<Project[]>(`/projects/space/${spaceId}`),
  })
  const project = projects.find((p) => p.id === projectId)

  const { data: lists = [], isLoading } = useQuery({
    queryKey: ['lists', projectId],
    queryFn: () => api<List[]>(`/lists/project/${projectId}`),
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
    },
  })

  return (
    <WorkHubPage
      breadcrumb="Project"
      title={project?.name ?? 'Project'}
      description={project?.description}
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
          <Button
            size="sm"
            className="bg-violet-600 hover:bg-violet-700 text-white"
            onClick={() => setShowCreateList((v) => !v)}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            {showCreateList ? 'Cancel' : 'Add list'}
          </Button>
        </div>
      }
    >
      <section className="mb-10">
        <WorkSectionTitle
          action={
            <span className="text-[12px] text-muted-foreground">
              {lists.length} list{lists.length !== 1 ? 's' : ''}
            </span>
          }
        >
          Lists
        </WorkSectionTitle>

        {showCreateList && (
          <WorkCreateCard onCancel={() => setShowCreateList(false)}>
            <Input
              autoFocus
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="List name (e.g. Backlog, In Progress, QA)"
              className="h-9"
            />
            <Input
              value={newListDescription}
              onChange={(e) => setNewListDescription(e.target.value)}
              placeholder="Description (optional)"
              className="h-9"
            />
            <Button
              size="sm"
              className="bg-violet-600 hover:bg-violet-700 text-white"
              onClick={() => createList.mutate()}
              disabled={!newListName.trim() || createList.isPending}
            >
              {createList.isPending ? 'Creating…' : 'Create list'}
            </Button>
          </WorkCreateCard>
        )}

        {isLoading ? (
          <div className="rounded-lg border border-border/80 p-8 text-center text-[13px] text-muted-foreground">
            Loading lists…
          </div>
        ) : lists.length === 0 ? (
          <WorkEmptyState
            icon={ListIcon}
            title="No lists yet"
            description="Lists organize tasks by workflow stage. Add a list from the button above or from the sidebar."
            action={
              <Button
                className="bg-violet-600 hover:bg-violet-700 text-white"
                onClick={() => setShowCreateList(true)}
              >
                <Plus className="h-4 w-4 mr-1.5" /> Add list
              </Button>
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
                className={cn('cursor-grab active:cursor-grabbing', dragListId === list.id && 'opacity-50')}
                title="Drag to reorder lists"
              >
                <ListCard
                  list={list}
                  workspaceId={workspaceId}
                  spaceId={spaceId}
                  projectId={projectId}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <CustomFieldsSection workspaceId={workspaceId} projectId={projectId} />

      <ProjectActivitySection projectId={projectId} />

      <ProjectTimeSettingsSection projectId={projectId} workspaceId={workspaceId} />

      <ContainerMembersSheet
        kind="project"
        containerId={projectId}
        workspaceId={workspaceId}
        containerName={project?.name}
        initialVisibility={project?.visibility ?? null}
        open={membersOpen}
        onOpenChange={setMembersOpen}
      />

      <ScopedStatusesManager
        scope="project"
        containerId={projectId}
        containerName={project?.name}
        open={statusesOpen}
        onOpenChange={setStatusesOpen}
      />
    </WorkHubPage>
  )
}

type CustomFieldDef = {
  id: string
  name: string
  type: 'text' | 'number' | 'dropdown' | 'date' | 'checkbox' | 'url'
  isRequired: boolean
  options: Array<{ label: string; value: string }> | null
}

function CustomFieldsSection({
  workspaceId,
  projectId,
}: {
  workspaceId: string
  projectId: string
}) {
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
  })

  const remove = useMutation({
    mutationFn: (id: string) => api(`/workspaces/${workspaceId}/custom-fields/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-fields', workspaceId, projectId] }),
  })

  const fields = fieldsQuery.data ?? []

  return (
    <section>
      <WorkSectionTitle
        action={
          <Button size="sm" variant="outline" onClick={() => setShowForm((v) => !v)}>
            <Settings className="h-3.5 w-3.5 mr-1.5" />
            {showForm ? 'Cancel' : 'Add field'}
          </Button>
        }
      >
        <span className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-muted-foreground" />
          Custom fields
        </span>
      </WorkSectionTitle>
      <p className="text-[13px] text-muted-foreground mb-4 -mt-1">
        Fields defined here appear on every task in this project.
      </p>

      {showForm && (
        <WorkCreateCard onCancel={() => setShowForm(false)}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Field name (e.g. Sprint, Risk level)"
            className="h-9"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as CustomFieldDef['type'])}
            className="h-9 w-full rounded-md border border-border/80 bg-background px-3 text-sm"
          >
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="dropdown">Dropdown</option>
            <option value="date">Date</option>
            <option value="checkbox">Checkbox</option>
            <option value="url">URL</option>
          </select>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} />
            Required
          </label>
          {type === 'dropdown' && (
            <Input
              value={options}
              onChange={(e) => setOptions(e.target.value)}
              placeholder="Options, comma-separated"
              className="h-9"
            />
          )}
          <Button
            size="sm"
            className="bg-violet-600 hover:bg-violet-700 text-white"
            disabled={!name.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? 'Creating…' : 'Create field'}
          </Button>
        </WorkCreateCard>
      )}

      {fieldsQuery.isLoading ? (
        <Card className="p-4 text-sm text-muted-foreground border-border/80">Loading…</Card>
      ) : fields.length === 0 ? (
        <Card className="p-4 text-[13px] text-muted-foreground border-dashed border-border/80">
          No custom fields yet. Add fields like &quot;Estimated cost&quot;, &quot;Risk level&quot;, or
          &quot;Sprint&quot; to tailor tasks for this project.
        </Card>
      ) : (
        <Card className="divide-y border-border/80 overflow-hidden">
          {fields.map((f) => (
            <div key={f.id} className="flex items-center gap-3 p-3 bg-background">
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-medium flex items-center gap-2">
                  {f.name}
                  {f.isRequired && <span className="text-destructive text-[11px]">required</span>}
                </div>
                <div className="text-[12px] text-muted-foreground capitalize">
                  {f.type}
                  {f.options && f.options.length > 0 && (
                    <> — {f.options.map((o) => o.label).join(', ')}</>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => remove.mutate(f.id)}
                disabled={remove.isPending}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
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

function ProjectActivitySection({ projectId }: { projectId: string }) {
  const { data: activity = [], isLoading } = useQuery({
    queryKey: ['project-activity', projectId],
    queryFn: () => api<ProjectActivity[]>(`/projects/${projectId}/activity?limit=40`),
  })
  const label = (action: string) => action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  return (
    <section>
      <WorkSectionTitle>
        <span className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          Recent activity
        </span>
      </WorkSectionTitle>
      <p className="text-[13px] text-muted-foreground mb-4 -mt-1">
        Everything happening across this project&apos;s tasks.
      </p>
      {isLoading ? (
        <Card className="p-4 text-sm text-muted-foreground border-border/80">Loading…</Card>
      ) : activity.length === 0 ? (
        <Card className="p-4 text-[13px] text-muted-foreground border-dashed border-border/80">
          No activity yet. Task changes across this project will show up here.
        </Card>
      ) : (
        <Card className="border-border/80 overflow-hidden">
          <ol className="divide-y divide-border/60">
            {activity.map((a) => (
              <li key={a.id} className="flex items-start gap-3 p-3 text-sm">
                <span className="mt-0.5 shrink-0">{activityIcon(a.action)}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate">
                    <span className="font-medium">{a.actor?.displayName ?? a.actor?.email ?? 'System'}</span>{' '}
                    <span className="text-muted-foreground">{label(a.action)}</span>
                    {a.taskTitle ? (
                      <>
                        {' '}
                        <span className="text-muted-foreground">on</span>{' '}
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

function ProjectTimeSettingsSection({ projectId, workspaceId }: { projectId: string; workspaceId: string }) {
  const qc = useQueryClient()
  const [newClientName, setNewClientName] = useState('')
  const projectQuery = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api<{ id: string; defaultBillable?: boolean; clientId?: string | null }>(`/projects/${projectId}`),
  })
  const clientsQuery = useQuery({
    queryKey: ['clients', workspaceId],
    queryFn: () => api<Array<{ id: string; name: string }>>(`/workspaces/${workspaceId}/clients`),
  })
  const defaultBillable = projectQuery.data?.defaultBillable ?? false
  const clientId = projectQuery.data?.clientId ?? ''
  const clients = clientsQuery.data ?? []

  const toggle = useMutation({
    mutationFn: (next: boolean) =>
      api(`/projects/${projectId}`, { method: 'PUT', body: { defaultBillable: next } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', projectId] }),
  })
  const setClient = useMutation({
    mutationFn: (nextClientId: string | null) =>
      api(`/projects/${projectId}`, { method: 'PUT', body: { clientId: nextClientId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', projectId] }),
  })
  const createClient = useMutation({
    mutationFn: (name: string) =>
      api<{ id: string }>(`/workspaces/${workspaceId}/clients`, { method: 'POST', body: { name } }),
    onSuccess: async (row) => {
      setNewClientName('')
      await qc.invalidateQueries({ queryKey: ['clients', workspaceId] })
      setClient.mutate(row.id)
    },
    onError: (err) => window.alert(err instanceof Error ? err.message : 'Could not create client'),
  })

  return (
    <section>
      <WorkSectionTitle>
        <span className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-muted-foreground" />
          Time tracking
        </span>
      </WorkSectionTitle>
      <p className="text-[13px] text-muted-foreground mb-4 -mt-1">
        Defaults applied to time logged against tasks in this project.
      </p>
      <Card className="p-4 border-border/80">
        <label className="flex items-center justify-between gap-4 cursor-pointer">
          <div>
            <div className="text-[14px] font-medium">Billable by default</div>
            <div className="text-[12px] text-muted-foreground">
              New time entries on this project&apos;s tasks are marked billable unless overridden.
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={defaultBillable}
            disabled={projectQuery.isLoading || toggle.isPending}
            onClick={() => toggle.mutate(!defaultBillable)}
            className={cn(
              'relative h-6 w-11 shrink-0 rounded-full transition-colors',
              defaultBillable ? 'bg-brand-700' : 'bg-muted',
              (projectQuery.isLoading || toggle.isPending) && 'opacity-60',
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

        <div className="mt-4 pt-4 border-t border-border/60">
          <div className="text-[14px] font-medium">Client</div>
          <div className="text-[12px] text-muted-foreground mb-2">
            Bill this project&apos;s time to a client — shown in the time report.
          </div>
          <div className="flex items-center gap-2">
            <select
              value={clientId}
              onChange={(e) => setClient.mutate(e.target.value || null)}
              disabled={setClient.isPending}
              className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="">No client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
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
              placeholder="+ New client name"
              className="h-8 flex-1"
            />
            <Button type="submit" size="sm" variant="outline" disabled={!newClientName.trim() || createClient.isPending}>
              Add
            </Button>
          </form>
        </div>
      </Card>
    </section>
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

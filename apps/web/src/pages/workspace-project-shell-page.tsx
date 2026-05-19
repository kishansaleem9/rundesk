import { useState } from 'react'
import { Outlet, useMatches, useParams } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Card } from '@rundesk/ui'
import { List as ListIcon, Plus, Settings, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import {
  WorkHubPage,
  WorkEmptyState,
  WorkEntityCard,
  WorkCreateCard,
  WorkSectionTitle,
} from '../components/work/work-ui'

type List = {
  id: string
  name: string
  description?: string | null
}

type Project = { id: string; name: string; description?: string | null }

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

  const { data: projects = [] } = useQuery({
    queryKey: ['projects', spaceId],
    queryFn: () => api<Project[]>(`/projects/space/${spaceId}`),
  })
  const project = projects.find((p) => p.id === projectId)

  const { data: lists = [], isLoading } = useQuery({
    queryKey: ['lists', projectId],
    queryFn: () => api<List[]>(`/lists/project/${projectId}`),
  })

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
        <Button
          size="sm"
          className="bg-violet-600 hover:bg-violet-700 text-white"
          onClick={() => setShowCreateList((v) => !v)}
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          {showCreateList ? 'Cancel' : 'Add list'}
        </Button>
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

      <CustomFieldsSection workspaceId={workspaceId} projectId={projectId} />
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

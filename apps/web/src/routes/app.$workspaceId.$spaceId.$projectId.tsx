import { useState } from 'react'
import { createFileRoute, Link, Outlet, useMatches } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input, cn } from '@rundesk/ui'
import { ArrowRight, List as ListIcon, Plus, Settings, Trash2 } from 'lucide-react'
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
        <h1 className="font-display text-3xl font-semibold text-foreground">
          {project?.name ?? 'Project'}
        </h1>
        {project?.description && (
          <p className="text-muted-foreground mt-1">{project.description}</p>
        )}
      </header>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-xl font-semibold text-foreground">Lists</h2>
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

      <CustomFieldsSection workspaceId={workspaceId} projectId={projectId} />
    </div>
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
  const [optionsText, setOptionsText] = useState('')

  const fieldsQuery = useQuery({
    queryKey: ['project-fields', workspaceId, projectId],
    queryFn: () =>
      api<CustomFieldDef[]>(
        `/workspaces/${workspaceId}/projects/${projectId}/custom-fields`,
      ),
  })

  const create = useMutation({
    mutationFn: () => {
      const opts =
        type === 'dropdown'
          ? optionsText
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
              .map((v) => ({ label: v, value: v.toLowerCase().replace(/\s+/g, '_') }))
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
      setOptionsText('')
      setType('text')
    },
  })

  const remove = useMutation({
    mutationFn: (fieldId: string) =>
      api(`/workspaces/${workspaceId}/custom-fields/${fieldId}`, { method: 'DELETE' }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['project-fields', workspaceId, projectId] }),
  })

  const fields = fieldsQuery.data ?? []

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-foreground flex items-center gap-2">
            <Settings className="h-4 w-4 text-brand-500" />
            Custom fields
          </h2>
          <p className="text-xs text-muted-foreground">
            Fields defined here appear on every task in this project.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> {showForm ? 'Cancel' : 'Add field'}
        </Button>
      </div>

      {showForm && (
        <Card className="p-4 mb-3 space-y-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Field name (e.g. Estimated cost, Sprint, Risk level)"
          />
          <div className="flex items-center gap-2">
            <select
              value={type}
              onChange={(e) => setType(e.target.value as CustomFieldDef['type'])}
              className="text-sm rounded-md border border-input bg-transparent px-2 py-1.5"
            >
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="dropdown">Dropdown</option>
              <option value="date">Date</option>
              <option value="checkbox">Checkbox</option>
              <option value="url">URL</option>
            </select>
            <label className="text-xs flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={isRequired}
                onChange={(e) => setIsRequired(e.target.checked)}
              />
              Required
            </label>
          </div>
          {type === 'dropdown' && (
            <Input
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              placeholder="Options, comma-separated (e.g. Low, Medium, High)"
            />
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!name.trim() || create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending ? 'Creating...' : 'Create field'}
            </Button>
          </div>
        </Card>
      )}

      {fieldsQuery.isLoading ? (
        <Card className="p-4 text-sm text-muted-foreground">Loading…</Card>
      ) : fields.length === 0 ? (
        <Card className="p-4 text-sm text-muted-foreground">
          No custom fields yet. Add fields like "Estimated cost", "Risk level", or "Sprint" to
          tailor tasks for this project.
        </Card>
      ) : (
        <Card className="divide-y">
          {fields.map((f) => (
            <div key={f.id} className="flex items-center gap-3 p-3">
              <div className="flex-1">
                <div className="text-sm font-medium flex items-center gap-2">
                  {f.name}
                  {f.isRequired && <span className="text-destructive text-xs">required</span>}
                </div>
                <div className="text-xs text-muted-foreground capitalize">
                  {f.type}
                  {f.options && f.options.length > 0 && (
                    <> — {f.options.map((o) => o.label).join(', ')}</>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
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
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <Link
      to="/app/$workspaceId/$spaceId/$projectId/$listId"
      params={{ workspaceId, spaceId, projectId, listId: list.id }}
      className="block group"
    >
      <Card className="p-4 hover:shadow-md hover:border-brand-500 transition-all">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg shrink-0 flex items-center justify-center bg-accent/15">
            <ListIcon className="h-5 w-5 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold truncate group-hover:text-accent transition-colors">
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
      <div className="h-12 w-12 rounded-full bg-accent/15 mx-auto mb-3 flex items-center justify-center">
        <ListIcon className="h-6 w-6 text-accent" />
      </div>
      <h3 className="font-display text-lg font-semibold text-foreground mb-1">
        No lists yet
      </h3>
      <p className="text-sm text-muted-foreground max-w-md mx-auto">
        Lists hold your tasks. Hover over this project in the sidebar and click{' '}
        <Plus className="inline h-3 w-3" /> to add one.
      </p>
    </Card>
  )
}

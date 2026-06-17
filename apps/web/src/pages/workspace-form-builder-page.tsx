import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input, cn, toast } from '@rundesk/ui'
import {
  ArrowLeft,
  GripVertical,
  Plus,
  Trash2,
  Settings,
  Eye,
  ChevronDown,
  ToggleLeft,
  ToggleRight,
  Copy,
  ExternalLink,
  Download,
  Link2,
} from 'lucide-react'
import { api, ApiError } from '../lib/api'

const FIELD_TYPES = [
  { value: 'short_text', label: 'Short text' },
  { value: 'long_text', label: 'Long text' },
  { value: 'email', label: 'Email' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'multi_select', label: 'Multi-select' },
  { value: 'file', label: 'File upload' },
]

const TASK_FIELDS = [
  { value: '', label: '— No mapping —' },
  { value: 'title', label: 'Task title' },
  { value: 'description', label: 'Task description' },
  { value: 'priority', label: 'Priority' },
  { value: 'dueDate', label: 'Due date' },
  { value: 'targetListId', label: 'Routing target list' },
  { value: 'assigneeEmail', label: 'Assignee (by email)' },
]

type FormField = {
  id: string
  type: string
  label: string
  placeholder?: string | null
  helpText?: string | null
  isRequired: boolean
  position: number
  options?: { label: string; value: string }[] | null
  visibilityMode?: 'all' | 'any'
  taskField?: string | null
  visibilityRules?: Array<{ fieldId: string; operator: 'equals' | 'not_equals' | 'contains' | 'not_contains'; value: string }>
}

type FormDetail = {
  id: string
  title: string
  description?: string | null
  slug: string
  isPublic: boolean
  isEnabled: boolean
  confirmationMsg?: string | null
  targetListId?: string | null
  fields: FormField[]
}

type Submission = {
  id: string
  submitterEmail?: string | null
  submitterName?: string | null
  data: Record<string, string | string[]>
  submittedAt: string
  createdTaskId?: string | null
  retryMeta?: { status: 'ok' | 'error'; message: string; at: string }
  retryHistory?: Array<{ status: 'ok' | 'error'; message: string; at: string }>
}

type SubmissionFilter = 'all' | 'success' | 'unmapped' | 'invalid'
type SubmissionPreset = 'all' | 'needs_routing_fix' | 'no_task_created' | 'successful'
type SubmissionHistoryFilter = 'all' | 'with_history' | 'history_failures'

function safeCsv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

export function FormBuilderPage() {
  const { workspaceId, formId } = useParams({ from: '/app/$workspaceId/forms/$formId' })
  const search = useSearch({ from: '/app/$workspaceId/forms/$formId' })
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<'builder' | 'settings' | 'submissions'>(() =>
    search.tab === 'submissions' || search.tab === 'settings' || search.tab === 'builder' ? search.tab : 'builder',
  )

  useEffect(() => {
    if (search.tab === 'submissions' || search.tab === 'settings' || search.tab === 'builder') {
      setActiveTab(search.tab)
    }
  }, [search.tab])
  const [expandedField, setExpandedField] = useState<string | null>(null)
  const [addingField, setAddingField] = useState(false)
  const [newFieldType, setNewFieldType] = useState('short_text')
  const [newFieldLabel, setNewFieldLabel] = useState('')
  const [draggingFieldId, setDraggingFieldId] = useState<string | null>(null)
  const [dragOverFieldId, setDragOverFieldId] = useState<string | null>(null)

  const formQuery = useQuery({
    queryKey: ['form', formId],
    queryFn: () => api<FormDetail>(`/workspaces/${workspaceId}/forms/${formId}`),
  })

  const submissionsQuery = useQuery({
    queryKey: ['form-submissions', formId],
    queryFn: () => api<Submission[]>(`/workspaces/${workspaceId}/forms/${formId}/submissions`),
    enabled: activeTab === 'submissions',
  })

  useEffect(() => {
    if (activeTab !== 'submissions' || !submissionsQuery.isSuccess) return
    void qc.invalidateQueries({ queryKey: ['forms', workspaceId] })
  }, [activeTab, submissionsQuery.isSuccess, submissionsQuery.dataUpdatedAt, workspaceId, qc])

  const workspaceListOptionsQuery = useQuery({
    queryKey: ['workspace-list-routing-options', workspaceId],
    queryFn: async () => {
      const spaces = await api<Array<{ id: string; name: string }>>(`/spaces/workspace/${workspaceId}`)
      const projectsPerSpace = await Promise.all(
        spaces.map(async (space) => ({
          space,
          projects: await api<Array<{ id: string; name: string }>>(`/projects/space/${space.id}`),
        })),
      )
      const options: Array<{ label: string; value: string }> = []
      for (const entry of projectsPerSpace) {
        const listsPerProject = await Promise.all(
          entry.projects.map(async (project) => ({
            project,
            lists: await api<Array<{ id: string; name: string }>>(`/lists/project/${project.id}`),
          })),
        )
        for (const projectEntry of listsPerProject) {
          for (const list of projectEntry.lists) {
            options.push({
              label: `${entry.space.name} / ${projectEntry.project.name} / ${list.name}`,
              value: `list:${list.id}`,
            })
          }
        }
      }
      return options
    },
  })

  const updateForm = useMutation({
    mutationFn: (patch: Partial<FormDetail>) =>
      api(`/workspaces/${workspaceId}/forms/${formId}`, { method: 'PATCH', body: patch }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['form', formId] }),
  })

  const addField = useMutation({
    mutationFn: (dto: { type: string; label: string }) =>
      api(`/workspaces/${workspaceId}/forms/${formId}/fields`, { method: 'POST', body: dto }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['form', formId] })
      setAddingField(false)
      setNewFieldLabel('')
    },
  })

  const updateField = useMutation({
    mutationFn: ({ fieldId, patch }: { fieldId: string; patch: Partial<FormField> }) =>
      api(`/workspaces/${workspaceId}/forms/${formId}/fields/${fieldId}`, { method: 'PATCH', body: patch }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['form', formId] }),
  })

  const deleteField = useMutation({
    mutationFn: (fieldId: string) =>
      api(`/workspaces/${workspaceId}/forms/${formId}/fields/${fieldId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['form', formId] }),
  })

  const reorderFields = useMutation({
    mutationFn: (orderedIds: string[]) =>
      api<FormField[]>(`/forms/${formId}/fields/reorder`, { method: 'PUT', body: { orderedIds } }),
    // Optimistically reorder so the drag feels instant; roll back on failure.
    onMutate: async (orderedIds: string[]) => {
      await qc.cancelQueries({ queryKey: ['form', formId] })
      const previous = qc.getQueryData<FormDetail>(['form', formId])
      if (previous) {
        const byId = new Map(previous.fields.map((f) => [f.id, f]))
        const reordered = orderedIds
          .map((id, index) => {
            const existing = byId.get(id)
            return existing ? { ...existing, position: index } : undefined
          })
          .filter((f): f is FormField => Boolean(f))
        qc.setQueryData<FormDetail>(['form', formId], { ...previous, fields: reordered })
      }
      return { previous }
    },
    onError: (e: unknown, _orderedIds, context) => {
      if (context?.previous) qc.setQueryData(['form', formId], context.previous)
      toast.error(e instanceof ApiError ? e.message : 'Failed to reorder fields')
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['form', formId] }),
  })

  const handleFieldDrop = (targetFieldId: string) => {
    const fields = formQuery.data?.fields ?? []
    const sourceId = draggingFieldId
    setDraggingFieldId(null)
    setDragOverFieldId(null)
    if (!sourceId || sourceId === targetFieldId) return
    const fromIndex = fields.findIndex((f) => f.id === sourceId)
    const toIndex = fields.findIndex((f) => f.id === targetFieldId)
    if (fromIndex === -1 || toIndex === -1) return
    const next = [...fields]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    reorderFields.mutate(next.map((f) => f.id))
  }

  const form = formQuery.data
  if (!form && formQuery.isLoading) {
    return <div className="p-6 text-muted-foreground">Loading form…</div>
  }
  if (!form) {
    return <div className="p-6 text-muted-foreground">Form not found.</div>
  }

  const publicUrl = `${window.location.origin}/submit/${form.slug}`

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border">
        <button
          onClick={() => navigate({ to: '/app/$workspaceId/forms', params: { workspaceId } })}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-base font-semibold flex-1 truncate">{form.title}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              updateForm.mutate({ isEnabled: !form.isEnabled })
            }
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {form.isEnabled ? (
              <><ToggleRight className="h-5 w-5 text-emerald-500" /> Enabled</>
            ) : (
              <><ToggleLeft className="h-5 w-5" /> Disabled</>
            )}
          </button>
          <a href={publicUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Eye className="h-3.5 w-3.5" /> Preview
            </Button>
          </a>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border px-6">
        {(['builder', 'settings', 'submissions'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'py-2.5 px-4 text-sm font-medium border-b-2 transition-colors capitalize',
              activeTab === tab
                ? 'border-brand-700 text-accent'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab}
            {tab === 'submissions' && submissionsQuery.data && (
              <span className="ml-1.5 text-xs bg-brand-200 text-accent rounded-full px-1.5 py-0.5">
                {submissionsQuery.data.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-6">
        {/* ── Builder tab ──────────────────────────────────────────────── */}
        {activeTab === 'builder' && (
          <div className="max-w-2xl mx-auto space-y-3">
            {/* Form title / description header card */}
            <Card className="p-4 bg-brand-900 text-white">
              <p className="font-semibold text-lg">{form.title}</p>
              {form.description && <p className="text-sm text-white/70 mt-1">{form.description}</p>}
            </Card>

            {/* Fields */}
            {form.fields.map((field) => (
              <FieldCard
                key={field.id}
                field={field}
                allFields={form.fields}
                workspaceListOptions={workspaceListOptionsQuery.data ?? []}
                expanded={expandedField === field.id}
                onExpand={() => setExpandedField(expandedField === field.id ? null : field.id)}
                onUpdate={(patch) => updateField.mutate({ fieldId: field.id, patch })}
                onDelete={() => deleteField.mutate(field.id)}
                isDragging={draggingFieldId === field.id}
                isDragOver={dragOverFieldId === field.id && draggingFieldId !== field.id}
                onDragStart={() => {
                  setDraggingFieldId(field.id)
                  setExpandedField(null)
                }}
                onDragOver={() => {
                  if (draggingFieldId && draggingFieldId !== field.id) setDragOverFieldId(field.id)
                }}
                onDragEnd={() => {
                  setDraggingFieldId(null)
                  setDragOverFieldId(null)
                }}
                onDrop={() => handleFieldDrop(field.id)}
              />
            ))}

            {/* Add field */}
            {addingField ? (
              <Card className="p-4 border-brand-300">
                <p className="text-sm font-medium mb-2">Add field</p>
                <div className="space-y-2">
                  <select
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                    value={newFieldType}
                    onChange={(e) => setNewFieldType(e.target.value)}
                  >
                    {FIELD_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  <Input
                    autoFocus
                    value={newFieldLabel}
                    onChange={(e) => setNewFieldLabel(e.target.value)}
                    placeholder="Field label"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newFieldLabel.trim()) {
                        addField.mutate({ type: newFieldType, label: newFieldLabel.trim() })
                      }
                      if (e.key === 'Escape') { setAddingField(false); setNewFieldLabel('') }
                    }}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={!newFieldLabel.trim() || addField.isPending}
                      onClick={() => addField.mutate({ type: newFieldType, label: newFieldLabel.trim() })}
                    >
                      Add field
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { setAddingField(false); setNewFieldLabel('') }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </Card>
            ) : (
              <button
                onClick={() => setAddingField(true)}
                className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-border rounded-lg text-sm text-muted-foreground hover:border-brand-300 hover:text-accent transition-colors"
              >
                <Plus className="h-4 w-4" /> Add field
              </button>
            )}
          </div>
        )}

        {/* ── Settings tab ─────────────────────────────────────────────── */}
        {activeTab === 'settings' && (
          <FormSettings form={form} onUpdate={(patch) => updateForm.mutate(patch)} />
        )}

        {/* ── Submissions tab ───────────────────────────────────────────── */}
        {activeTab === 'submissions' && (
          <SubmissionsTab
            formId={form.id}
            submissions={submissionsQuery.data ?? []}
            fields={form.fields}
            loading={submissionsQuery.isLoading}
            workspaceListOptions={workspaceListOptionsQuery.data ?? []}
            onRetryRouting={async (submissionId) => {
              await api(`/workspaces/${workspaceId}/forms/${formId}/submissions/${submissionId}/retry-routing`, {
                method: 'POST',
              })
            }}
            onClearRetryHistory={async (submissionId) => {
              await api(`/workspaces/${workspaceId}/forms/${formId}/submissions/${submissionId}/retry-history`, {
                method: 'DELETE',
              })
            }}
            onRefresh={async () => {
              await qc.invalidateQueries({ queryKey: ['form-submissions', formId] })
            }}
          />
        )}
      </div>
    </div>
  )
}

// ─── FieldCard ──────────────────────────────────────────────────────────────

function FieldCard({
  field,
  allFields,
  workspaceListOptions,
  expanded,
  onExpand,
  onUpdate,
  onDelete,
  isDragging,
  isDragOver,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
}: {
  field: FormField
  allFields: FormField[]
  workspaceListOptions: Array<{ label: string; value: string }>
  expanded: boolean
  onExpand: () => void
  onUpdate: (patch: Partial<FormField>) => void
  onDelete: () => void
  isDragging: boolean
  isDragOver: boolean
  onDragStart: () => void
  onDragOver: () => void
  onDragEnd: () => void
  onDrop: () => void
}) {
  const typeLabel = FIELD_TYPES.find((t) => t.value === field.type)?.label ?? field.type
  const supportsListRouting = field.type === 'dropdown' || field.type === 'multi_select'
  const mappedRoutingCount = (field.options ?? []).filter((opt) => opt.value.startsWith('list:')).length
  const totalRoutingOptions = field.options?.length ?? 0
  const hasInvalidRoutingValues = (field.options ?? []).some((opt) => opt.value.trim() !== '' && !opt.value.startsWith('list:'))
  const workspaceRoutingLookup = new Map(workspaceListOptions.map((opt) => [opt.value, opt.label]))

  return (
    <Card
      className={cn(
        'overflow-hidden transition-colors',
        expanded && 'border-brand-500',
        isDragging && 'opacity-50',
        isDragOver && 'border-brand-500 ring-2 ring-brand-300',
      )}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        onDragOver()
      }}
      onDrop={(e) => {
        e.preventDefault()
        onDrop()
      }}
    >
      <div
        className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none"
        onClick={onExpand}
      >
        <button
          type="button"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', field.id)
            onDragStart()
          }}
          onDragEnd={onDragEnd}
          onClick={(e) => e.stopPropagation()}
          aria-label="Drag to reorder field"
          title="Drag to reorder"
          className="shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <span className="font-medium text-sm">{field.label}</span>
          {field.isRequired && <span className="ml-1 text-destructive text-xs">*</span>}
          <span className="ml-2 text-xs text-muted-foreground">{typeLabel}</span>
        </div>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Label</label>
            <Input
              defaultValue={field.label}
              onBlur={(e) => onUpdate({ label: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Placeholder</label>
            <Input
              defaultValue={field.placeholder ?? ''}
              onBlur={(e) => onUpdate({ placeholder: e.target.value || null })}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Help text</label>
            <Input
              defaultValue={field.helpText ?? ''}
              onBlur={(e) => onUpdate({ helpText: e.target.value || null })}
            />
          </div>
          {(field.type === 'dropdown' || field.type === 'multi_select') && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Options</label>
              <div className="space-y-2">
                {(field.options ?? []).map((opt, idx) => (
                  <div key={`${field.id}-opt-${idx}`} className="grid grid-cols-12 gap-2">
                    <Input
                      className="col-span-5"
                      value={opt.label}
                      onChange={(e) => {
                        const next = [...(field.options ?? [])]
                        next[idx] = { ...next[idx], label: e.target.value }
                        onUpdate({ options: next })
                      }}
                      placeholder="Option label"
                    />
                    <Input
                      className="col-span-5"
                      value={opt.value}
                      onChange={(e) => {
                        const next = [...(field.options ?? [])]
                        next[idx] = { ...next[idx], value: e.target.value }
                        onUpdate({ options: next })
                      }}
                      placeholder="Option value"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="col-span-2"
                      onClick={() => {
                        const next = [...(field.options ?? [])]
                        next.splice(idx, 1)
                        onUpdate({ options: next })
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const next = [...(field.options ?? [])]
                    next.push({ label: `Option ${next.length + 1}`, value: `option_${next.length + 1}` })
                    onUpdate({ options: next })
                  }}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add option
                </Button>
              </div>
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Maps to task field</label>
            <select
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              defaultValue={field.taskField ?? ''}
              onChange={(e) => {
                const nextTaskField = e.target.value || null
                if (nextTaskField === 'targetListId' && !supportsListRouting) {
                  onUpdate({
                    taskField: nextTaskField,
                    type: 'dropdown',
                    options: workspaceListOptions.length > 0 ? workspaceListOptions : field.options ?? [],
                  })
                  return
                }
                onUpdate({ taskField: nextTaskField })
              }}
            >
              {TASK_FIELDS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          {field.taskField === 'targetListId' && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Routing targets</label>
              <p className="text-[11px] text-muted-foreground mb-2">
                This field should use dropdown or multi-select options whose values point to list targets.
              </p>
              {!['dropdown', 'multi_select'].includes(field.type) && (
                <p className="text-[11px] text-amber-700 dark:text-amber-300 mb-2">
                  Change this field type to Dropdown or Multi-select for safer routing.
                </p>
              )}
              {!supportsListRouting && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mb-2"
                  onClick={() =>
                    onUpdate({
                      type: 'dropdown',
                      options: workspaceListOptions.length > 0 ? workspaceListOptions : field.options ?? [],
                    })
                  }
                >
                  Convert to dropdown for list routing
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => onUpdate({ options: workspaceListOptions })}
                disabled={workspaceListOptions.length === 0}
              >
                Populate options from workspace lists
              </Button>
              {supportsListRouting && totalRoutingOptions > 0 && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {mappedRoutingCount}/{totalRoutingOptions} options mapped to a list target.
                </p>
              )}
              {supportsListRouting && hasInvalidRoutingValues && (
                <div className="mt-2 flex items-center gap-2">
                  <p className="text-[11px] text-amber-700 dark:text-amber-300">
                    Some option values are not list targets and will not route submissions.
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={() =>
                      onUpdate({
                        options: (field.options ?? []).map((opt) =>
                          opt.value.trim() !== '' && !opt.value.startsWith('list:')
                            ? { ...opt, value: '' }
                            : opt,
                        ),
                      })
                    }
                  >
                    Clear invalid values
                  </Button>
                </div>
              )}
              {supportsListRouting && (field.options?.length ?? 0) > 0 && workspaceListOptions.length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="text-[11px] text-muted-foreground">Route each option to a list</p>
                  {(field.options ?? []).map((opt, idx) => (
                    <div key={`${field.id}-route-${idx}`} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-4 text-xs truncate">{opt.label || `Option ${idx + 1}`}</div>
                      <select
                        className="col-span-8 rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                        value={opt.value.startsWith('list:') ? opt.value : ''}
                        onChange={(e) => {
                          const next = [...(field.options ?? [])]
                          next[idx] = { ...next[idx], value: e.target.value || opt.value }
                          onUpdate({ options: next })
                        }}
                      >
                        <option value="">No routing target</option>
                        {workspaceListOptions.map((listOpt) => (
                          <option key={listOpt.value} value={listOpt.value}>{listOpt.label}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
              {supportsListRouting && totalRoutingOptions > 0 && (
                <div className="mt-3 rounded-md border border-border p-2">
                  <p className="text-[11px] font-medium mb-1">Routing preview</p>
                  <div className="space-y-1.5">
                    {(field.options ?? []).map((opt, idx) => {
                      const routeLabel = workspaceRoutingLookup.get(opt.value)
                      const isUnmapped = !opt.value || !opt.value.startsWith('list:')
                      const isUnknownTarget = Boolean(opt.value) && opt.value.startsWith('list:') && !routeLabel
                      return (
                        <div key={`${field.id}-routing-preview-${idx}`} className="flex items-start justify-between gap-2 text-[11px]">
                          <span className="truncate">{opt.label || `Option ${idx + 1}`}</span>
                          {isUnmapped ? (
                            <span className="text-amber-700 dark:text-amber-300">Unmapped</span>
                          ) : isUnknownTarget ? (
                            <span className="text-destructive">Invalid target</span>
                          ) : (
                            <span className="text-muted-foreground truncate">{routeLabel}</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              {workspaceListOptions.length === 0 && (
                <p className="text-[11px] text-muted-foreground mt-1">No lists found yet.</p>
              )}
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Conditional visibility (optional)</label>
            <div className="mb-2">
              <select
                className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                value={field.visibilityMode ?? 'all'}
                onChange={(e) => onUpdate({ visibilityMode: e.target.value as 'all' | 'any' })}
                disabled={(field.visibilityRules?.length ?? 0) <= 1}
              >
                <option value="all">Match all rules (AND)</option>
                <option value="any">Match any rule (OR)</option>
              </select>
            </div>
            <div className="space-y-2">
              {(field.visibilityRules ?? []).map((rule, idx) => (
                <div key={`${field.id}-rule-${idx}`} className="grid grid-cols-12 gap-2">
                  <select
                    className="col-span-4 rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                    value={rule.fieldId}
                    onChange={(e) => {
                      const next = [...(field.visibilityRules ?? [])]
                      next[idx] = { ...rule, fieldId: e.target.value }
                      onUpdate({ visibilityRules: next })
                    }}
                  >
                    <option value="">Select field</option>
                    {allFields
                      .filter((f) => f.id !== field.id)
                      .map((f) => (
                        <option key={f.id} value={f.id}>{f.label}</option>
                      ))}
                  </select>
                  <select
                    className="col-span-3 rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                    value={rule.operator}
                    onChange={(e) => {
                      const next = [...(field.visibilityRules ?? [])]
                      next[idx] = { ...rule, operator: e.target.value as typeof rule.operator }
                      onUpdate({ visibilityRules: next })
                    }}
                  >
                    <option value="equals">Equals</option>
                    <option value="not_equals">Not equals</option>
                    <option value="contains">Contains</option>
                    <option value="not_contains">Not contains</option>
                  </select>
                  <Input
                    className="col-span-4"
                    value={rule.value}
                    onChange={(e) => {
                      const next = [...(field.visibilityRules ?? [])]
                      next[idx] = { ...rule, value: e.target.value }
                      onUpdate({ visibilityRules: next })
                    }}
                    placeholder="match value"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="col-span-1"
                    onClick={() => {
                      const next = [...(field.visibilityRules ?? [])]
                      next.splice(idx, 1)
                      onUpdate({ visibilityRules: next })
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                size="sm"
                className="col-span-3"
                onClick={() => {
                  const next = [...(field.visibilityRules ?? [])]
                  next.push({ fieldId: '', operator: 'equals', value: '' })
                  onUpdate({ visibilityRules: next })
                }}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add visibility rule
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                defaultChecked={field.isRequired}
                onChange={(e) => onUpdate({ isRequired: e.target.checked })}
                className="rounded"
              />
              Required
            </label>
            <button
              onClick={onDelete}
              className="text-xs text-destructive hover:underline flex items-center gap-1"
            >
              <Trash2 className="h-3.5 w-3.5" /> Remove
            </button>
          </div>
        </div>
      )}
    </Card>
  )
}

// ─── FormSettings ────────────────────────────────────────────────────────────

function FormSettings({ form, onUpdate }: { form: FormDetail; onUpdate: (patch: any) => void }) {
  const [title, setTitle] = useState(form.title)
  const [desc, setDesc] = useState(form.description ?? '')
  const [confirmMsg, setConfirmMsg] = useState(form.confirmationMsg ?? '')

  return (
    <div className="max-w-xl space-y-5">
      <Card className="p-4 space-y-3">
        <h3 className="font-medium text-sm">General</h3>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Title</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => onUpdate({ title })} />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
          <Input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onBlur={() => onUpdate({ description: desc || null })}
            placeholder="Optional — shown at the top of the form"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Confirmation message</label>
          <Input
            value={confirmMsg}
            onChange={(e) => setConfirmMsg(e.target.value)}
            onBlur={() => onUpdate({ confirmationMsg: confirmMsg })}
            placeholder="Thank you! Your request has been submitted."
          />
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h3 className="font-medium text-sm">Visibility</h3>
        <label className="flex items-center justify-between">
          <span className="text-sm">Public form (no login required)</span>
          <input
            type="checkbox"
            defaultChecked={form.isPublic}
            onChange={(e) => onUpdate({ isPublic: e.target.checked })}
            className="rounded"
          />
        </label>
        <label className="flex items-center justify-between">
          <span className="text-sm">Form enabled</span>
          <input
            type="checkbox"
            defaultChecked={form.isEnabled}
            onChange={(e) => onUpdate({ isEnabled: e.target.checked })}
            className="rounded"
          />
        </label>
      </Card>

      <Card className="p-4">
        <h3 className="font-medium text-sm mb-2">Shareable link</h3>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs bg-muted px-3 py-2 rounded font-mono">
            {window.location.origin}/submit/{form.slug}
          </code>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigator.clipboard.writeText(`${window.location.origin}/submit/${form.slug}`)}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
      </Card>
    </div>
  )
}

// ─── SubmissionsTab ──────────────────────────────────────────────────────────

function SubmissionsTab({
  formId,
  submissions,
  fields,
  loading,
  workspaceListOptions,
  onRetryRouting,
  onClearRetryHistory,
  onRefresh,
}: {
  formId: string
  submissions: Submission[]
  fields: FormField[]
  loading: boolean
  workspaceListOptions: Array<{ label: string; value: string }>
  onRetryRouting: (submissionId: string) => Promise<void>
  onClearRetryHistory: (submissionId: string) => Promise<void>
  onRefresh: () => Promise<void>
}) {
  const storageKeyBase = `form-submissions-ops:${formId}`

  const readFilterFromUrl = (): SubmissionFilter => {
    if (typeof window === 'undefined') return 'all'
    const raw = new URLSearchParams(window.location.search).get('submissionsFilter')
    if (raw === 'success' || raw === 'unmapped' || raw === 'invalid' || raw === 'all') return raw
    return 'all'
  }
  const readPresetFromUrl = (): SubmissionPreset => {
    if (typeof window === 'undefined') return 'all'
    const raw = new URLSearchParams(window.location.search).get('submissionsPreset')
    if (raw === 'needs_routing_fix' || raw === 'no_task_created' || raw === 'successful' || raw === 'all') return raw
    return 'all'
  }
  const readBool = (key: string, fallback: boolean) => {
    if (typeof window === 'undefined') return fallback
    const raw = window.localStorage.getItem(key)
    if (raw === 'true') return true
    if (raw === 'false') return false
    return fallback
  }
  const readNumber = (key: string, fallback: number) => {
    if (typeof window === 'undefined') return fallback
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  const readString = (key: string, fallback: string) => {
    if (typeof window === 'undefined') return fallback
    return window.localStorage.getItem(key) ?? fallback
  }

  const [filter, setFilter] = useState<SubmissionFilter>(() => readFilterFromUrl())
  const [preset, setPreset] = useState<SubmissionPreset>(() => readPresetFromUrl())
  const [historyFilter, setHistoryFilter] = useState<SubmissionHistoryFilter>('all')
  const [bulkFeedback, setBulkFeedback] = useState<string>('')
  const [clearingHistory, setClearingHistory] = useState(false)
  const [retryAndClearRunning, setRetryAndClearRunning] = useState(false)
  const [onlyActionable, setOnlyActionable] = useState(() => readBool(`${storageKeyBase}:only-actionable`, false))
  const [sessionRetrySuccessCount, setSessionRetrySuccessCount] = useState(() => readNumber(`${storageKeyBase}:retry-success-count`, 0))
  const [lastBulkRunSummary, setLastBulkRunSummary] = useState<string>(() => readString(`${storageKeyBase}:last-bulk-run`, ''))
  const [rowRetryState, setRowRetryState] = useState<Record<string, { status: 'idle' | 'retrying' | 'ok' | 'error'; message?: string }>>({})
  const [retryingRouting, setRetryingRouting] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(`${storageKeyBase}:only-actionable`, String(onlyActionable))
  }, [onlyActionable, storageKeyBase])
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(`${storageKeyBase}:retry-success-count`, String(sessionRetrySuccessCount))
  }, [sessionRetrySuccessCount, storageKeyBase])
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (lastBulkRunSummary) window.localStorage.setItem(`${storageKeyBase}:last-bulk-run`, lastBulkRunSummary)
    else window.localStorage.removeItem(`${storageKeyBase}:last-bulk-run`)
  }, [lastBulkRunSummary, storageKeyBase])
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (filter === 'all') params.delete('submissionsFilter')
    else params.set('submissionsFilter', filter)
    if (preset === 'all') params.delete('submissionsPreset')
    else params.set('submissionsPreset', preset)
    const query = params.toString()
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
    window.history.replaceState(null, '', nextUrl)
  }, [filter, preset])

  if (loading) return <div className="text-muted-foreground text-sm">Loading…</div>
  if (submissions.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-16">
        <p className="font-medium">No submissions yet</p>
        <p className="text-sm mt-1">Share your form link to start collecting responses.</p>
      </div>
    )
  }

  const lookup = new Map(workspaceListOptions.map((opt) => [opt.value, opt.label]))
  const routingField = fields.find((field) => field.taskField === 'targetListId')
  const classifyRouting = (submission: Submission): 'success' | 'unmapped' | 'invalid' | 'other' => {
    if (!routingField) return 'other'
    const rawValue = submission.data[routingField.id]
    const selected = Array.isArray(rawValue) ? rawValue[0] : rawValue
    const normalized = typeof selected === 'string' && selected.trim()
      ? (selected.startsWith('list:') ? selected : `list:${selected}`)
      : ''
    if (!normalized) return 'unmapped'
    if (!lookup.get(normalized)) return 'invalid'
    return submission.createdTaskId ? 'success' : 'other'
  }

  const counts = submissions.reduce(
    (acc, submission) => {
      const state = classifyRouting(submission)
      if (state === 'success') acc.success += 1
      else if (state === 'unmapped') acc.unmapped += 1
      else if (state === 'invalid') acc.invalid += 1
      else acc.other += 1
      return acc
    },
    { success: 0, unmapped: 0, invalid: 0, other: 0 },
  )

  const hasTargetListRouting = Boolean(routingField)
  const noTaskCreatedCount = submissions.filter((submission) => !submission.createdTaskId).length
  const applyPreset = (nextPreset: SubmissionPreset) => {
    setPreset(nextPreset)
    if (nextPreset === 'all') {
      setFilter('all')
      return
    }
    if (nextPreset === 'successful') {
      setFilter('success')
      return
    }
    if (nextPreset === 'needs_routing_fix') {
      setFilter('invalid')
      return
    }
    setFilter('all')
  }
  const presetSubmissions = submissions.filter((submission) => {
    if (preset === 'all') return true
    if (preset === 'successful') return classifyRouting(submission) === 'success'
    if (preset === 'needs_routing_fix') {
      const state = classifyRouting(submission)
      return state === 'invalid' || state === 'unmapped'
    }
    return !submission.createdTaskId
  })
  const routingFilteredSubmissions = presetSubmissions.filter((submission) => {
    if (filter === 'all') return true
    return classifyRouting(submission) === filter
  })
  const filteredSubmissions = routingFilteredSubmissions.filter((submission) => {
    if (historyFilter === 'all') return true
    if (historyFilter === 'with_history') return (submission.retryHistory?.length ?? 0) > 0
    return submission.retryMeta?.status === 'error'
  }).filter((submission) => {
    if (!onlyActionable) return true
    return submission.retryMeta?.status === 'error' && !submission.createdTaskId
  })
  const withHistoryCount = routingFilteredSubmissions.filter((submission) => (submission.retryHistory?.length ?? 0) > 0).length
  const historyFailuresCount = routingFilteredSubmissions.filter((submission) => submission.retryMeta?.status === 'error').length
  const actionableCount = routingFilteredSubmissions.filter(
    (submission) => submission.retryMeta?.status === 'error' && !submission.createdTaskId,
  ).length
  const exportFilteredSubmissions = () => {
    const header = [
      'SubmissionId',
      'SubmittedAt',
      'SubmitterName',
      'SubmitterEmail',
      'RoutingState',
      'CreatedTaskId',
      'Fields',
    ]
    const rows = filteredSubmissions.map((submission) => {
      const routingState = classifyRouting(submission)
      const fieldSummary = fields
        .map((field) => {
          const value = submission.data[field.id]
          if (value === undefined) return null
          const rendered = Array.isArray(value) ? value.join('|') : value
          return `${field.label}:${rendered}`
        })
        .filter((entry): entry is string => Boolean(entry))
        .join('; ')
      return [
        safeCsv(submission.id),
        safeCsv(submission.submittedAt),
        safeCsv(submission.submitterName ?? ''),
        safeCsv(submission.submitterEmail ?? ''),
        safeCsv(routingState),
        safeCsv(submission.createdTaskId ?? ''),
        safeCsv(fieldSummary),
      ]
    })
    const csv = [header.join(','), ...rows.map((row) => row.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `form-submissions-${filter}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }
  const copyFilteredSubmitterEmails = async () => {
    const emails = Array.from(
      new Set(
        filteredSubmissions
          .map((submission) => submission.submitterEmail?.trim().toLowerCase())
          .filter((email): email is string => Boolean(email)),
      ),
    )
    if (emails.length === 0) {
      setBulkFeedback('No submitter emails found in current filter.')
      return
    }
    await navigator.clipboard.writeText(emails.join(', '))
    setBulkFeedback(`Copied ${emails.length} submitter email${emails.length === 1 ? '' : 's'}.`)
  }
  const revalidateFilteredRouting = () => {
    const summary = filteredSubmissions.reduce(
      (acc, submission) => {
        const state = classifyRouting(submission)
        if (state === 'success') acc.success += 1
        else if (state === 'unmapped') acc.unmapped += 1
        else if (state === 'invalid') acc.invalid += 1
        else acc.other += 1
        return acc
      },
      { success: 0, unmapped: 0, invalid: 0, other: 0 },
    )
    setBulkFeedback(
      `Revalidated ${filteredSubmissions.length} submissions: ${summary.success} success, ${summary.unmapped} unmapped, ${summary.invalid} invalid, ${summary.other} other.`,
    )
  }
  const retryFilteredRouting = async () => {
    const retryCandidates = filteredSubmissions.filter((submission) => !submission.createdTaskId)
    if (retryCandidates.length === 0) {
      setBulkFeedback('No eligible submissions to retry in current selection.')
      return
    }
    setRetryingRouting(true)
    let success = 0
    let failed = 0
    const nextRetryState: Record<string, { status: 'idle' | 'retrying' | 'ok' | 'error'; message?: string }> = {}
    for (const submission of retryCandidates) {
      nextRetryState[submission.id] = { status: 'retrying' }
      setRowRetryState((prev) => ({ ...prev, [submission.id]: nextRetryState[submission.id] }))
      try {
        await onRetryRouting(submission.id)
        success += 1
        nextRetryState[submission.id] = { status: 'ok', message: 'Routing retry succeeded.' }
      } catch {
        failed += 1
        nextRetryState[submission.id] = { status: 'error', message: 'Retry failed. Check routing target and field values.' }
      }
      setRowRetryState((prev) => ({ ...prev, [submission.id]: nextRetryState[submission.id] }))
    }
    setRetryingRouting(false)
    await onRefresh()
    setSessionRetrySuccessCount((prev) => prev + success)
    setLastBulkRunSummary(`Retry routing: ${success} succeeded, ${failed} failed.`)
    setBulkFeedback(
      `Retry routing finished: ${success} succeeded, ${failed} failed (from ${retryCandidates.length} attempted).`,
    )
  }
  const retrySingleRouting = async (submissionId: string) => {
    setRowRetryState((prev) => ({ ...prev, [submissionId]: { status: 'retrying' } }))
    try {
      await onRetryRouting(submissionId)
      await onRefresh()
      setSessionRetrySuccessCount((prev) => prev + 1)
      setRowRetryState((prev) => ({ ...prev, [submissionId]: { status: 'ok', message: 'Routing retry succeeded.' } }))
    } catch {
      setRowRetryState((prev) => ({
        ...prev,
        [submissionId]: { status: 'error', message: 'Retry failed. Check routing target and field values.' },
      }))
    }
  }
  const clearFilteredHistory = async () => {
    const targets = filteredSubmissions.filter((submission) => (submission.retryHistory?.length ?? 0) > 0)
    if (targets.length === 0) {
      setBulkFeedback('No retry history found in current selection.')
      return
    }
    const confirmed = window.confirm(`Clear retry history for ${targets.length} submission(s)?`)
    if (!confirmed) return

    setClearingHistory(true)
    let success = 0
    let failed = 0
    for (const submission of targets) {
      try {
        await onClearRetryHistory(submission.id)
        success += 1
      } catch {
        failed += 1
      }
    }
    setClearingHistory(false)
    await onRefresh()
    setLastBulkRunSummary(`Bulk clear history: ${success} succeeded, ${failed} failed.`)
    setBulkFeedback(`Bulk clear history finished: ${success} succeeded, ${failed} failed.`)
  }
  const retryAndClearStaleErrors = async () => {
    setOnlyActionable(true)
    const retryCandidates = filteredSubmissions.filter(
      (submission) => submission.retryMeta?.status === 'error' && !submission.createdTaskId,
    )
    if (retryCandidates.length === 0) {
      setBulkFeedback('No failed routing submissions eligible for retry in current selection.')
      return
    }

    setRetryAndClearRunning(true)
    let retrySucceeded = 0
    let retryFailed = 0
    let historyCleared = 0
    let historyClearFailed = 0

    for (const submission of retryCandidates) {
      try {
        await onRetryRouting(submission.id)
        retrySucceeded += 1
        try {
          await onClearRetryHistory(submission.id)
          historyCleared += 1
        } catch {
          historyClearFailed += 1
        }
      } catch {
        retryFailed += 1
      }
    }

    setRetryAndClearRunning(false)
    await onRefresh()
    setSessionRetrySuccessCount((prev) => prev + retrySucceeded)
    setLastBulkRunSummary(
      `Retry+clear: retries ${retrySucceeded} succeeded, ${retryFailed} failed; history cleared ${historyCleared}, clear failed ${historyClearFailed}.`,
    )
    setBulkFeedback(
      `Retry+clear finished: retries ${retrySucceeded} succeeded, ${retryFailed} failed; history cleared ${historyCleared}, clear failed ${historyClearFailed}.`,
    )
  }
  const copySegmentLink = async () => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (filter === 'all') params.delete('submissionsFilter')
    else params.set('submissionsFilter', filter)
    const query = params.toString()
    const shareUrl = `${window.location.origin}${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
    await navigator.clipboard.writeText(shareUrl)
    setBulkFeedback(`Copied segment link for "${filter}" filter.`)
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <Card className="p-3">
          <p className="text-[11px] text-muted-foreground">Actionable now</p>
          <p className="text-lg font-semibold">{actionableCount}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] text-muted-foreground">Session retry successes</p>
          <p className="text-lg font-semibold">{sessionRetrySuccessCount}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] text-muted-foreground">Last bulk run</p>
          <p className="text-xs">{lastBulkRunSummary || 'No bulk action executed yet.'}</p>
        </Card>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{submissions.length} submission{submissions.length !== 1 ? 's' : ''}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={copyFilteredSubmitterEmails}
            disabled={filteredSubmissions.length === 0}
          >
            Copy emails
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={revalidateFilteredRouting}
            disabled={filteredSubmissions.length === 0}
          >
            Revalidate routing
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportFilteredSubmissions}
            disabled={filteredSubmissions.length === 0}
          >
            <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={copySegmentLink}
          >
            <Link2 className="h-3.5 w-3.5 mr-1.5" /> Copy segment link
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={retryFilteredRouting}
            disabled={filteredSubmissions.length === 0 || retryingRouting}
          >
            Retry routing
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={clearFilteredHistory}
            disabled={filteredSubmissions.length === 0 || clearingHistory}
          >
            {clearingHistory ? 'Clearing history...' : 'Bulk clear history'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={retryAndClearStaleErrors}
            disabled={filteredSubmissions.length === 0 || retryAndClearRunning}
          >
            {retryAndClearRunning ? 'Retrying + clearing...' : 'Retry + clear stale errors'}
          </Button>
        </div>
      </div>
      {bulkFeedback && <p className="text-xs text-muted-foreground">{bulkFeedback}</p>}
      {routingField && (
        <div className="flex flex-wrap gap-2">
          <Button variant={filter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('all')}>
            All ({submissions.length})
          </Button>
          <Button variant={filter === 'success' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('success')}>
            Routed success ({counts.success})
          </Button>
          <Button variant={filter === 'unmapped' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('unmapped')}>
            Unmapped ({counts.unmapped})
          </Button>
          <Button variant={filter === 'invalid' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('invalid')}>
            Invalid ({counts.invalid})
          </Button>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant={preset === 'all' ? 'default' : 'outline'} size="sm" onClick={() => applyPreset('all')}>
          All submissions ({submissions.length})
        </Button>
        <Button
          variant={preset === 'needs_routing_fix' ? 'default' : 'outline'}
          size="sm"
          onClick={() => applyPreset('needs_routing_fix')}
          disabled={!hasTargetListRouting}
        >
          Needs Routing Fix ({counts.unmapped + counts.invalid})
        </Button>
        <Button
          variant={preset === 'no_task_created' ? 'default' : 'outline'}
          size="sm"
          onClick={() => applyPreset('no_task_created')}
        >
          No Task Created ({noTaskCreatedCount})
        </Button>
        <Button
          variant={preset === 'successful' ? 'default' : 'outline'}
          size="sm"
          onClick={() => applyPreset('successful')}
          disabled={!hasTargetListRouting}
        >
          Successful ({counts.success})
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant={historyFilter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setHistoryFilter('all')}>
          History: all ({routingFilteredSubmissions.length})
        </Button>
        <Button
          variant={historyFilter === 'with_history' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setHistoryFilter('with_history')}
        >
          With history ({withHistoryCount})
        </Button>
        <Button
          variant={historyFilter === 'history_failures' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setHistoryFilter('history_failures')}
        >
          History failures ({historyFailuresCount})
        </Button>
        <Button
          variant={onlyActionable ? 'default' : 'outline'}
          size="sm"
          onClick={() => setOnlyActionable((prev) => !prev)}
        >
          Only actionable ({actionableCount})
        </Button>
      </div>
      {presetSubmissions.length !== filteredSubmissions.length && (
        <p className="text-xs text-muted-foreground">
          Preset narrows to {presetSubmissions.length} submission{presetSubmissions.length === 1 ? '' : 's'} before routing filter.
        </p>
      )}
      {filteredSubmissions.length === 0 && (
        <p className="text-xs text-muted-foreground">No submissions match this routing filter.</p>
      )}
      {filteredSubmissions.map((sub) => (
        <Card key={sub.id} className="p-4">
          <div className="flex items-start justify-between mb-2">
            <div>
              <p className="font-medium text-sm">{sub.submitterName || 'Anonymous'}</p>
              {sub.submitterEmail && <p className="text-xs text-muted-foreground">{sub.submitterEmail}</p>}
            </div>
            <p className="text-xs text-muted-foreground">{new Date(sub.submittedAt).toLocaleString()}</p>
          </div>
          <SubmissionRoutingStatus
            submission={sub}
            fields={fields}
            workspaceListOptions={workspaceListOptions}
          />
          {!sub.createdTaskId && (
            <div className="mb-2 flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => retrySingleRouting(sub.id)}
                disabled={rowRetryState[sub.id]?.status === 'retrying'}
              >
                {rowRetryState[sub.id]?.status === 'retrying' ? 'Retrying...' : 'Retry'}
              </Button>
              {rowRetryState[sub.id]?.message && (
                <p
                  className={`text-xs ${
                    rowRetryState[sub.id]?.status === 'error'
                      ? 'text-destructive'
                      : 'text-emerald-700 dark:text-emerald-300'
                  }`}
                >
                  {rowRetryState[sub.id]?.message}
                </p>
              )}
              {!rowRetryState[sub.id]?.message && sub.retryMeta?.message && (
                <p
                  className={`text-xs ${
                    sub.retryMeta.status === 'error'
                      ? 'text-destructive'
                      : 'text-emerald-700 dark:text-emerald-300'
                  }`}
                >
                  {sub.retryMeta.message} ({new Date(sub.retryMeta.at).toLocaleString()})
                </p>
              )}
            </div>
          )}
          {(sub.retryHistory?.length ?? 0) > 0 && (
            <div className="mb-2 rounded-md border border-border p-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-[11px] font-medium">Retry history</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  onClick={async () => {
                    await onClearRetryHistory(sub.id)
                    await onRefresh()
                    setRowRetryState((prev) => ({ ...prev, [sub.id]: { status: 'idle', message: 'Retry history cleared.' } }))
                  }}
                >
                  Clear history
                </Button>
              </div>
              <div className="space-y-1">
                {sub.retryHistory?.slice(0, 5).map((entry, idx) => (
                  <p
                    key={`${sub.id}-retry-history-${idx}`}
                    className={`text-[11px] ${
                      entry.status === 'error' ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-300'
                    }`}
                  >
                    {entry.status === 'error' ? 'Failed' : 'Succeeded'}: {entry.message} ({new Date(entry.at).toLocaleString()})
                  </p>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-1">
            {fields.map((field) => {
              const val = sub.data[field.id]
              if (val === undefined) return null
              const display = Array.isArray(val) ? val.join(', ') : val
              return (
                <div key={field.id} className="text-sm">
                  <span className="text-muted-foreground">{field.label}: </span>
                  <span>{display}</span>
                </div>
              )
            })}
          </div>
        </Card>
      ))}
    </div>
  )
}

function SubmissionRoutingStatus({
  submission,
  fields,
  workspaceListOptions,
}: {
  submission: Submission
  fields: FormField[]
  workspaceListOptions: Array<{ label: string; value: string }>
}) {
  const routingField = fields.find((field) => field.taskField === 'targetListId')
  if (!routingField) return null

  const lookup = new Map(workspaceListOptions.map((opt) => [opt.value, opt.label]))
  const rawValue = submission.data[routingField.id]
  const selected = Array.isArray(rawValue) ? rawValue[0] : rawValue
  const normalized = typeof selected === 'string' && selected.trim()
    ? (selected.startsWith('list:') ? selected : `list:${selected}`)
    : ''
  const targetLabel = normalized ? lookup.get(normalized) : undefined

  let toneClass = 'text-muted-foreground'
  let message = 'Routing: no target selected'
  if (!normalized) {
    toneClass = 'text-amber-700 dark:text-amber-300'
    message = 'Routing: unmapped target'
  } else if (!targetLabel) {
    toneClass = 'text-destructive'
    message = 'Routing: invalid target'
  } else if (submission.createdTaskId) {
    toneClass = 'text-emerald-700 dark:text-emerald-300'
    message = `Routing: created in ${targetLabel}`
  } else {
    toneClass = 'text-amber-700 dark:text-amber-300'
    message = `Routing: target ${targetLabel}, task not created`
  }

  return <p className={`mb-2 text-xs ${toneClass}`}>{message}</p>
}

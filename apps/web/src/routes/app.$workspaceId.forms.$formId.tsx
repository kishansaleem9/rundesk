import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input, cn } from '@rundesk/ui'
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
} from 'lucide-react'
import { api } from '../lib/api'

export const Route = createFileRoute('/app/$workspaceId/forms/$formId')({
  component: FormBuilderPage,
})

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
  taskField?: string | null
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
}

function FormBuilderPage() {
  const { workspaceId, formId } = Route.useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<'builder' | 'settings' | 'submissions'>('builder')
  const [expandedField, setExpandedField] = useState<string | null>(null)
  const [addingField, setAddingField] = useState(false)
  const [newFieldType, setNewFieldType] = useState('short_text')
  const [newFieldLabel, setNewFieldLabel] = useState('')

  const formQuery = useQuery({
    queryKey: ['form', formId],
    queryFn: () => api<FormDetail>(`/workspaces/${workspaceId}/forms/${formId}`),
  })

  const submissionsQuery = useQuery({
    queryKey: ['form-submissions', formId],
    queryFn: () => api<Submission[]>(`/workspaces/${workspaceId}/forms/${formId}/submissions`),
    enabled: activeTab === 'submissions',
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
                expanded={expandedField === field.id}
                onExpand={() => setExpandedField(expandedField === field.id ? null : field.id)}
                onUpdate={(patch) => updateField.mutate({ fieldId: field.id, patch })}
                onDelete={() => deleteField.mutate(field.id)}
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
          <SubmissionsTab submissions={submissionsQuery.data ?? []} fields={form.fields} loading={submissionsQuery.isLoading} />
        )}
      </div>
    </div>
  )
}

// ─── FieldCard ──────────────────────────────────────────────────────────────

function FieldCard({
  field,
  expanded,
  onExpand,
  onUpdate,
  onDelete,
}: {
  field: FormField
  expanded: boolean
  onExpand: () => void
  onUpdate: (patch: Partial<FormField>) => void
  onDelete: () => void
}) {
  const typeLabel = FIELD_TYPES.find((t) => t.value === field.type)?.label ?? field.type

  return (
    <Card className={cn('overflow-hidden', expanded && 'border-brand-500')}>
      <div
        className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none"
        onClick={onExpand}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
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
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Maps to task field</label>
            <select
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              defaultValue={field.taskField ?? ''}
              onChange={(e) => onUpdate({ taskField: e.target.value || null })}
            >
              {TASK_FIELDS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
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
  submissions,
  fields,
  loading,
}: {
  submissions: Submission[]
  fields: FormField[]
  loading: boolean
}) {
  if (loading) return <div className="text-muted-foreground text-sm">Loading…</div>
  if (submissions.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-16">
        <p className="font-medium">No submissions yet</p>
        <p className="text-sm mt-1">Share your form link to start collecting responses.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{submissions.length} submission{submissions.length !== 1 ? 's' : ''}</p>
      {submissions.map((sub) => (
        <Card key={sub.id} className="p-4">
          <div className="flex items-start justify-between mb-2">
            <div>
              <p className="font-medium text-sm">{sub.submitterName || 'Anonymous'}</p>
              {sub.submitterEmail && <p className="text-xs text-muted-foreground">{sub.submitterEmail}</p>}
            </div>
            <p className="text-xs text-muted-foreground">{new Date(sub.submittedAt).toLocaleString()}</p>
          </div>
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

import { useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input, cn } from '@rundesk/ui'
import {
  FileText,
  Plus,
  Copy,
  Archive,
  Trash2,
  ExternalLink,
  ToggleLeft,
  ToggleRight,
  Settings,
  Eye,
} from 'lucide-react'
import { api } from '../lib/api'

type FormSummary = {
  id: string
  title: string
  description?: string | null
  slug: string
  isPublic: boolean
  isEnabled: boolean
  isArchived: boolean
  createdAt: string
  submissionCount: number
}

export function FormsPage() {
  const { workspaceId } = useParams({ from: '/app/$workspaceId/forms' })
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  const formsQuery = useQuery({
    queryKey: ['forms', workspaceId],
    queryFn: () => api<FormSummary[]>(`/workspaces/${workspaceId}/forms`),
  })

  const createForm = useMutation({
    mutationFn: (title: string) =>
      api<FormSummary>(`/workspaces/${workspaceId}/forms`, { method: 'POST', body: { title } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['forms', workspaceId] })
      setCreating(false)
      setNewTitle('')
    },
  })

  const toggleEnabled = useMutation({
    mutationFn: ({ id, isEnabled }: { id: string; isEnabled: boolean }) =>
      api(`/workspaces/${workspaceId}/forms/${id}`, { method: 'PATCH', body: { isEnabled } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forms', workspaceId] }),
  })

  const duplicateForm = useMutation({
    mutationFn: (id: string) =>
      api(`/workspaces/${workspaceId}/forms/${id}/duplicate`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forms', workspaceId] }),
  })

  const archiveForm = useMutation({
    mutationFn: (id: string) =>
      api(`/workspaces/${workspaceId}/forms/${id}/archive`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forms', workspaceId] }),
  })

  const deleteForm = useMutation({
    mutationFn: (id: string) =>
      api(`/workspaces/${workspaceId}/forms/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forms', workspaceId] }),
  })

  const forms = formsQuery.data ?? []

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-accent" />
          <h1 className="text-lg font-semibold">Forms</h1>
          <span className="text-xs text-muted-foreground ml-1">
            {forms.length} form{forms.length !== 1 ? 's' : ''}
          </span>
        </div>
        <Button size="sm" onClick={() => setCreating(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> New form
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {/* New form input */}
        {creating && (
          <Card className="p-4 mb-4 border-brand-300">
            <p className="text-sm font-medium mb-2">Form title</p>
            <div className="flex gap-2">
              <Input
                autoFocus
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Bug report, Feature request…"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newTitle.trim()) createForm.mutate(newTitle.trim())
                  if (e.key === 'Escape') { setCreating(false); setNewTitle('') }
                }}
              />
              <Button
                size="sm"
                disabled={!newTitle.trim() || createForm.isPending}
                onClick={() => createForm.mutate(newTitle.trim())}
              >
                Create
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setCreating(false); setNewTitle('') }}>
                Cancel
              </Button>
            </div>
          </Card>
        )}

        {formsQuery.isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-40 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        )}

        {!formsQuery.isLoading && forms.length === 0 && !creating && (
          <div className="flex flex-col items-center justify-center h-64 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mb-3 opacity-30" />
            <p className="font-medium">No forms yet</p>
            <p className="text-sm mt-1">Create a form to collect requests from your team or external users.</p>
            <Button className="mt-4" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4 mr-1" /> Create your first form
            </Button>
          </div>
        )}

        {forms.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {forms.map((form) => (
              <FormCard
                key={form.id}
                form={form}
                workspaceId={workspaceId}
                onToggle={(enabled) => toggleEnabled.mutate({ id: form.id, isEnabled: enabled })}
                onDuplicate={() => duplicateForm.mutate(form.id)}
                onArchive={() => archiveForm.mutate(form.id)}
                onDelete={() => {
                  if (confirm(`Delete "${form.title}"? This cannot be undone.`)) {
                    deleteForm.mutate(form.id)
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function FormCard({
  form,
  workspaceId,
  onToggle,
  onDuplicate,
  onArchive,
  onDelete,
}: {
  form: FormSummary
  workspaceId: string
  onToggle: (enabled: boolean) => void
  onDuplicate: () => void
  onArchive: () => void
  onDelete: () => void
}) {
  const publicUrl = `${window.location.origin}/submit/${form.slug}`
  const [copied, setCopied] = useState(false)

  function copyLink() {
    navigator.clipboard.writeText(publicUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Card className="p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium truncate">{form.title}</h3>
          {form.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{form.description}</p>
          )}
        </div>
        <button
          onClick={() => onToggle(!form.isEnabled)}
          className="shrink-0 mt-0.5 text-muted-foreground hover:text-foreground"
          title={form.isEnabled ? 'Disable form' : 'Enable form'}
        >
          {form.isEnabled ? (
            <ToggleRight className="h-5 w-5 text-emerald-500" />
          ) : (
            <ToggleLeft className="h-5 w-5" />
          )}
        </button>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span
          className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium',
            form.isPublic ? 'bg-brand-200 text-accent' : 'bg-surface-100 text-muted-foreground',
          )}
        >
          {form.isPublic ? 'Public' : 'Internal'}
        </span>
        <span>{form.submissionCount} submission{form.submissionCount !== 1 ? 's' : ''}</span>
      </div>

      {/* Public link */}
      <div
        className="flex items-center gap-1.5 bg-muted rounded px-2 py-1.5 cursor-pointer hover:bg-muted/80"
        onClick={copyLink}
        title="Copy public link"
      >
        <span className="text-xs text-muted-foreground flex-1 truncate font-mono">/submit/{form.slug}</span>
        <Copy className={cn('h-3.5 w-3.5 shrink-0 transition-colors', copied ? 'text-emerald-500' : 'text-muted-foreground')} />
      </div>

      <div className="flex items-center gap-1 pt-1 border-t border-border">
        <Link
          to="/app/$workspaceId/forms/$formId"
          params={{ workspaceId, formId: form.id }}
          className="flex-1"
        >
          <Button variant="ghost" size="sm" className="w-full gap-1.5 text-xs">
            <Settings className="h-3.5 w-3.5" /> Edit
          </Button>
        </Link>
        <Link
          to="/submit/$slug"
          params={{ slug: form.slug }}
          target="_blank"
        >
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs" title="Preview public form">
            <Eye className="h-3.5 w-3.5" />
          </Button>
        </Link>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={onDuplicate} title="Duplicate">
          <Copy className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={onArchive} title="Archive">
          <Archive className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-xs text-destructive hover:text-destructive"
          onClick={onDelete}
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </Card>
  )
}

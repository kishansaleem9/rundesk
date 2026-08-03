import { useMemo, useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input, cn } from '@rundesk/ui'
import {
  FileText,
  Plus,
  Copy,
  Archive,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Settings,
  Eye,
  ClipboardList,
  LayoutGrid,
  Rows3,
} from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth'
import { useTranslation, type TranslationKey } from '../lib/i18n'

type FormSummary = {
  id: string
  title: string
  description?: string | null
  slug: string
  isPublic: boolean
  isEnabled: boolean
  isArchived: boolean
  createdAt: string
  updatedAt: string
  submissionCount: number
  // A5.2 — the owner, so "My forms" is a filter and not a guess.
  createdById?: string | null
  createdByName?: string | null
  createdByEmail?: string | null
  // A1.10 — where submissions land. Null when the form files nowhere yet.
  targetListId?: string | null
  targetListName?: string | null
  targetProjectId?: string | null
  targetSpaceId?: string | null
}

/** A5.2 — hub buckets. Archived is a separate fetch; the rest filter in place. */
const SCOPES = ['all', 'mine', 'archived'] as const
type Scope = (typeof SCOPES)[number]

const SCOPE_LABEL: Record<Scope, TranslationKey> = {
  all: 'forms.scopeAll',
  mine: 'forms.scopeMine',
  archived: 'forms.scopeArchived',
}

export function FormsPage() {
  const { t, tCount } = useTranslation()
  const { workspaceId } = useParams({ from: '/app/$workspaceId/forms' })
  const qc = useQueryClient()
  const userId = useAuthStore((s) => s.user?.id)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [scope, setScope] = useState<Scope>('all')
  const [layout, setLayout] = useState<'grid' | 'table'>('table')

  const formsQuery = useQuery({
    queryKey: ['forms', workspaceId],
    queryFn: () => api<FormSummary[]>(`/workspaces/${workspaceId}/forms`),
    refetchOnMount: 'always',
  })

  // Archived rows only come back when explicitly asked for, so the bucket owns
  // its own fetch rather than over-fetching for the other two.
  const archivedQuery = useQuery({
    queryKey: ['forms', workspaceId, 'archived'],
    queryFn: () => api<FormSummary[]>(`/workspaces/${workspaceId}/forms?archived=true`),
    refetchOnMount: 'always',
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

  const live = useMemo(() => formsQuery.data ?? [], [formsQuery.data])
  const archived = useMemo(
    () => (archivedQuery.data ?? []).filter((f) => f.isArchived),
    [archivedQuery.data],
  )
  const counts = {
    all: live.length,
    mine: live.filter((f) => f.createdById === userId).length,
    archived: archived.length,
  }
  const forms =
    scope === 'archived' ? archived : scope === 'mine' ? live.filter((f) => f.createdById === userId) : live

  const isLoading = scope === 'archived' ? archivedQuery.isLoading : formsQuery.isLoading

  const rowActions = (form: FormSummary) => ({
    onToggle: (enabled: boolean) => toggleEnabled.mutate({ id: form.id, isEnabled: enabled }),
    onDuplicate: () => duplicateForm.mutate(form.id),
    onArchive: () => archiveForm.mutate(form.id),
    onDelete: () => {
      if (confirm(t('forms.confirmDelete', { title: form.title }))) deleteForm.mutate(form.id)
    },
  })

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-accent" />
          <h1 className="text-lg font-semibold">{t('nav.forms')}</h1>
          <span className="text-xs text-muted-foreground ml-1">
            {tCount('forms.count', forms.length)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-border p-0.5">
            <button
              onClick={() => setLayout('table')}
              title={t('forms.layoutTable')}
              className={cn(
                'p-1.5 rounded',
                layout === 'table' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Rows3 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setLayout('grid')}
              title={t('forms.layoutCards')}
              className={cn(
                'p-1.5 rounded',
                layout === 'grid' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
          </div>
          <Button size="sm" onClick={() => setCreating(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> {t('forms.newForm')}
          </Button>
        </div>
      </div>

      {/* A5.2 — scope rail with counts. */}
      <div className="flex items-center gap-1 px-6 pt-3 border-b border-border">
        {SCOPES.map((id) => (
          <button
            key={id}
            onClick={() => setScope(id)}
            className={cn(
              'relative px-3 py-2 text-sm font-medium',
              scope === id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t(SCOPE_LABEL[id])}
            <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">{counts[id]}</span>
            {scope === id && <span className="absolute bottom-[-1px] left-0 right-0 h-0.5 bg-brand-700 rounded-t" />}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-6">
        {/* New form input */}
        {creating && (
          <Card className="p-4 mb-4 border-brand-300">
            <p className="text-sm font-medium mb-2">{t('forms.formTitle')}</p>
            <div className="flex gap-2">
              <Input
                autoFocus
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={t('forms.titlePlaceholder')}
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
                {t('common.create')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setCreating(false); setNewTitle('') }}>
                {t('common.cancel')}
              </Button>
            </div>
          </Card>
        )}

        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-40 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && forms.length === 0 && !creating && (
          <div className="flex flex-col items-center justify-center h-64 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mb-3 opacity-30" />
            <p className="font-medium">{scope === 'all' ? t('forms.emptyTitle') : t('forms.emptyScopeTitle')}</p>
            <p className="text-sm mt-1">{scope === 'all' ? t('forms.emptyBody') : t('forms.emptyScopeBody')}</p>
            {scope === 'all' && (
              <Button className="mt-4" onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4 mr-1" /> {t('forms.createFirst')}
              </Button>
            )}
          </div>
        )}

        {forms.length > 0 && layout === 'grid' && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {forms.map((form) => (
              <FormCard key={form.id} form={form} workspaceId={workspaceId} {...rowActions(form)} />
            ))}
          </div>
        )}

        {forms.length > 0 && layout === 'table' && (
          <FormsIndexTable
            forms={forms}
            workspaceId={workspaceId}
            actionsFor={rowActions}
          />
        )}
      </div>
    </div>
  )
}

/**
 * A5.2 — the index ClickUp shows: Name / Destination list / Created by /
 * Submissions. Every column is a field the list endpoint already returns.
 */
function FormsIndexTable({
  forms,
  workspaceId,
  actionsFor,
}: {
  forms: FormSummary[]
  workspaceId: string
  actionsFor: (form: FormSummary) => {
    onToggle: (enabled: boolean) => void
    onDuplicate: () => void
    onArchive: () => void
    onDelete: () => void
  }
}) {
  const { t } = useTranslation()
  return (
    <Card className="p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
              <th className="text-start font-semibold px-4 py-2.5">{t('forms.colName')}</th>
              <th className="text-start font-semibold px-4 py-2.5">{t('forms.colDestination')}</th>
              <th className="text-start font-semibold px-4 py-2.5">{t('forms.colCreatedBy')}</th>
              <th className="text-end font-semibold px-4 py-2.5">{t('forms.colSubmissions')}</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {forms.map((form) => {
              const actions = actionsFor(form)
              return (
                <tr key={form.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 group">
                  <td className="px-4 py-2.5">
                    <Link
                      to="/app/$workspaceId/forms/$formId"
                      params={{ workspaceId, formId: form.id }}
                      className="font-medium hover:text-accent"
                    >
                      {form.title}
                    </Link>
                    <span
                      className={cn(
                        'ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium',
                        form.isPublic ? 'bg-brand-200 text-accent' : 'bg-surface-100 text-muted-foreground',
                      )}
                    >
                      {form.isPublic ? t('forms.public') : t('forms.internal')}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {form.targetListId && form.targetProjectId && form.targetSpaceId ? (
                      <Link
                        to="/app/$workspaceId/$spaceId/$projectId/$listId"
                        params={{
                          workspaceId,
                          spaceId: form.targetSpaceId,
                          projectId: form.targetProjectId,
                          listId: form.targetListId,
                        }}
                        className="hover:text-foreground hover:underline"
                      >
                        {form.targetListName}
                      </Link>
                    ) : (
                      t('forms.noTargetList')
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {form.createdByName ?? form.createdByEmail ?? t('forms.unknownOwner')}
                  </td>
                  <td className="px-4 py-2.5 text-end tabular-nums">
                    <Link
                      to="/app/$workspaceId/forms/$formId"
                      params={{ workspaceId, formId: form.id }}
                      search={{ tab: 'submissions' }}
                      className="hover:text-accent"
                    >
                      {form.submissionCount}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button
                        onClick={() => actions.onToggle(!form.isEnabled)}
                        className="p-1.5 text-muted-foreground hover:text-foreground"
                        title={form.isEnabled ? t('forms.disableForm') : t('forms.enableForm')}
                      >
                        {form.isEnabled ? (
                          <ToggleRight className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <ToggleLeft className="h-4 w-4" />
                        )}
                      </button>
                      <button onClick={actions.onDuplicate} className="p-1.5 text-muted-foreground hover:text-foreground" title={t('forms.duplicate')}>
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={actions.onArchive} className="p-1.5 text-muted-foreground hover:text-foreground" title={t('forms.archive')}>
                        <Archive className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={actions.onDelete} className="p-1.5 text-muted-foreground hover:text-destructive" title={t('common.delete')}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
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
  const { t, tCount } = useTranslation()
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
          title={form.isEnabled ? t('forms.disableForm') : t('forms.enableForm')}
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
          {form.isPublic ? t('forms.public') : t('forms.internal')}
        </span>
        <Link
          to="/app/$workspaceId/forms/$formId"
          params={{ workspaceId, formId: form.id }}
          search={{ tab: 'submissions' }}
          className="hover:text-foreground hover:underline"
        >
          {tCount('forms.submissions', form.submissionCount)}
        </Link>
      </div>

      {/* A1.10 — a form is only half legible without the list it fills. */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
        <ClipboardList className="h-3.5 w-3.5 shrink-0" />
        {form.targetListId && form.targetProjectId && form.targetSpaceId ? (
          <Link
            to="/app/$workspaceId/$spaceId/$projectId/$listId"
            params={{
              workspaceId,
              spaceId: form.targetSpaceId,
              projectId: form.targetProjectId,
              listId: form.targetListId,
            }}
            className="truncate hover:text-foreground hover:underline"
          >
            {t('forms.feedsList', { list: form.targetListName ?? '' })}
          </Link>
        ) : (
          <span className="truncate">{t('forms.noTargetList')}</span>
        )}
      </div>

      <div className="text-xs text-muted-foreground truncate">
        {t('forms.createdBy', { name: form.createdByName ?? form.createdByEmail ?? t('forms.unknownOwner') })}
      </div>

      {/* Public link */}
      <div
        className="flex items-center gap-1.5 bg-muted rounded px-2 py-1.5 cursor-pointer hover:bg-muted/80"
        onClick={copyLink}
        title={t('forms.copyLink')}
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
            <Settings className="h-3.5 w-3.5" /> {t('forms.edit')}
          </Button>
        </Link>
        <Link
          to="/submit/$slug"
          params={{ slug: form.slug }}
          target="_blank"
        >
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs" title={t('forms.previewForm')}>
            <Eye className="h-3.5 w-3.5" />
          </Button>
        </Link>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={onDuplicate} title={t('forms.duplicate')}>
          <Copy className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={onArchive} title={t('forms.archive')}>
          <Archive className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-xs text-destructive hover:text-destructive"
          onClick={onDelete}
          title={t('common.delete')}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </Card>
  )
}

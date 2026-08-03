import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Input, cn } from '@rundesk/ui'
import { CheckSquare, ClipboardList, Folder, FolderOpen, FileText, Layers, Upload, X } from 'lucide-react'
import { api } from '../lib/api'
import { useTranslation, type TranslationKey } from '../lib/i18n'

type Space = { id: string; name: string }
type Project = { id: string; name: string }
type List = { id: string; name: string }

type Mode = 'task' | 'list' | 'folder' | 'project' | 'space' | 'doc'

// The `value` is the persisted Mode identifier; `labelKey` references an i18n
// catalog entry resolved at render time. A1.9 adds List and Folder: both were
// creatable only by first navigating to the page that owns them.
const MODE_TABS = [
  { value: 'task', icon: CheckSquare, labelKey: 'quickCreate.tab.task' },
  { value: 'list', icon: ClipboardList, labelKey: 'quickCreate.tab.list' },
  { value: 'folder', icon: Folder, labelKey: 'quickCreate.tab.folder' },
  { value: 'project', icon: FolderOpen, labelKey: 'quickCreate.tab.project' },
  { value: 'space', icon: Layers, labelKey: 'quickCreate.tab.space' },
  { value: 'doc', icon: FileText, labelKey: 'quickCreate.tab.doc' },
] as const

export function QuickCreateModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const params = useParams({ strict: false }) as { workspaceId?: string }
  const workspaceId = params.workspaceId
  const [mode, setMode] = useState<Mode>('task')

  if (!workspaceId) {
    return (
      <Backdrop onClose={onClose}>
        <Card>
          <Header onClose={onClose} titleKey="quickCreate.pickWorkspaceTitle" />
          <p className="px-5 py-6 text-sm text-muted-foreground">
            {t('quickCreate.pickWorkspaceBody')}
          </p>
        </Card>
      </Backdrop>
    )
  }

  return (
    <Backdrop onClose={onClose}>
      <Card>
        <Header onClose={onClose} titleKey="quickCreate.title" />
        <div className="px-5 pt-3 pb-2 flex flex-wrap gap-1 border-b border-border">
          {MODE_TABS.map((tab) => (
            <ModeTab key={tab.value} mode={mode} value={tab.value} setMode={setMode} icon={tab.icon} labelKey={tab.labelKey} />
          ))}
        </div>
        {mode === 'task' && <TaskForm workspaceId={workspaceId} onClose={onClose} />}
        {mode === 'list' && <ListForm workspaceId={workspaceId} onClose={onClose} />}
        {mode === 'folder' && <FolderForm workspaceId={workspaceId} onClose={onClose} />}
        {mode === 'project' && <ProjectForm workspaceId={workspaceId} onClose={onClose} />}
        {mode === 'space' && <SpaceForm workspaceId={workspaceId} onClose={onClose} />}
        {mode === 'doc' && <DocForm workspaceId={workspaceId} onClose={onClose} />}
        <Footer workspaceId={workspaceId} onClose={onClose} />
      </Card>
    </Backdrop>
  )
}

function Backdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  if (!mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/55 backdrop-blur-[1px] flex items-start justify-center pt-24 px-4"
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div className="relative z-[10000]" onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>,
    document.body,
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="w-[520px] bg-card rounded-lg shadow-2xl border border-border overflow-hidden">{children}</div>
}

function Header({ titleKey, onClose }: { titleKey: TranslationKey; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="px-5 py-3 border-b border-border flex items-center justify-between">
      <h2 className="font-semibold text-sm">{t(titleKey)}</h2>
      <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

function ModeTab({
  mode,
  value,
  setMode,
  icon: Icon,
  labelKey,
}: {
  mode: Mode
  value: Mode
  setMode: (m: Mode) => void
  icon: React.ElementType
  labelKey: TranslationKey
}) {
  const { t } = useTranslation()
  const active = mode === value
  return (
    <button
      onClick={() => setMode(value)}
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
        active ? 'bg-accent/15 text-foreground' : 'text-muted-foreground hover:bg-surface-50',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {t(labelKey)}
    </button>
  )
}

function TaskForm({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [spaceId, setSpaceId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [listId, setListId] = useState('')

  const spaces = useQuery({
    queryKey: ['spaces', workspaceId],
    queryFn: () => api<Space[]>(`/spaces/workspace/${workspaceId}`),
  }).data ?? []
  const projects = useQuery({
    queryKey: ['projects', spaceId],
    queryFn: () => api<Project[]>(`/projects/space/${spaceId}`),
    enabled: !!spaceId,
  }).data ?? []
  const lists = useQuery({
    queryKey: ['lists', projectId],
    queryFn: () => api<List[]>(`/lists/project/${projectId}`),
    enabled: !!projectId,
  }).data ?? []

  const create = useMutation({
    mutationFn: () =>
      api<{ id: string }>(`/tasks`, {
        method: 'POST',
        // Omit status → backend seeds the list's first/default status.
        body: { listId, title, priority: 'normal' },
      }),
    onSuccess: (task) => {
      qc.invalidateQueries({ queryKey: ['tasks', listId] })
      onClose()
      if (spaceId && projectId && listId) {
        navigate({
          to: '/app/$workspaceId/$spaceId/$projectId/$listId',
          params: { workspaceId, spaceId, projectId, listId },
          search: { task: task.id },
        })
      }
    },
  })

  return (
    <form
      className="px-5 py-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (title.trim() && listId) create.mutate()
      }}
    >
      <Input autoFocus placeholder={t('quickCreate.taskTitlePlaceholder')} value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="grid grid-cols-3 gap-2">
        <Select labelKey="quickCreate.selectSpace" value={spaceId} onChange={(v) => { setSpaceId(v); setProjectId(''); setListId('') }} options={spaces.map((s) => ({ value: s.id, label: s.name }))} />
        <Select labelKey="quickCreate.selectProject" value={projectId} onChange={(v) => { setProjectId(v); setListId('') }} options={projects.map((p) => ({ value: p.id, label: p.name }))} disabled={!spaceId} />
        <Select labelKey="quickCreate.selectList" value={listId} onChange={setListId} options={lists.map((l) => ({ value: l.id, label: l.name }))} disabled={!projectId} />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
        <Button type="submit" size="sm" disabled={!title.trim() || !listId || create.isPending}>
          {create.isPending ? t('quickCreate.creating') : t('quickCreate.createTask')}
        </Button>
      </div>
    </form>
  )
}

function ListForm({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [spaceId, setSpaceId] = useState('')
  const [projectId, setProjectId] = useState('')

  const spaces = useQuery({
    queryKey: ['spaces', workspaceId],
    queryFn: () => api<Space[]>(`/spaces/workspace/${workspaceId}`),
  }).data ?? []
  const projects = useQuery({
    queryKey: ['projects', spaceId],
    queryFn: () => api<Project[]>(`/projects/space/${spaceId}`),
    enabled: !!spaceId,
  }).data ?? []

  const create = useMutation({
    mutationFn: () => api<{ id: string }>(`/lists`, { method: 'POST', body: JSON.stringify({ projectId, name }) }),
    onSuccess: (list) => {
      qc.invalidateQueries({ queryKey: ['lists', projectId] })
      qc.invalidateQueries({ queryKey: ['space-tree', workspaceId] })
      onClose()
      navigate({
        to: '/app/$workspaceId/$spaceId/$projectId/$listId',
        params: { workspaceId, spaceId, projectId, listId: list.id },
      })
    },
  })

  return (
    <form
      className="px-5 py-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim() && projectId) create.mutate()
      }}
    >
      <Input autoFocus placeholder={t('quickCreate.listNamePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <Select labelKey="quickCreate.selectSpace" value={spaceId} onChange={(v) => { setSpaceId(v); setProjectId('') }} options={spaces.map((s) => ({ value: s.id, label: s.name }))} />
        <Select labelKey="quickCreate.selectProject" value={projectId} onChange={setProjectId} options={projects.map((p) => ({ value: p.id, label: p.name }))} disabled={!spaceId} />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
        <Button type="submit" size="sm" disabled={!name.trim() || !projectId || create.isPending}>{t('quickCreate.createList')}</Button>
      </div>
    </form>
  )
}

function FolderForm({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [spaceId, setSpaceId] = useState('')

  const spaces = useQuery({
    queryKey: ['spaces', workspaceId],
    queryFn: () => api<Space[]>(`/spaces/workspace/${workspaceId}`),
  }).data ?? []

  const create = useMutation({
    // Folders have no page of their own — they render on their space, which is
    // also where a just-created one is easiest to see.
    mutationFn: () => api(`/spaces/${spaceId}/folders`, { method: 'POST', body: { name } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['space-tree', workspaceId] })
      qc.invalidateQueries({ queryKey: ['folders', spaceId] })
      onClose()
      navigate({ to: '/app/$workspaceId/$spaceId', params: { workspaceId, spaceId } })
    },
  })

  return (
    <form
      className="px-5 py-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim() && spaceId) create.mutate()
      }}
    >
      <Input autoFocus placeholder={t('quickCreate.folderNamePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
      <Select labelKey="quickCreate.selectSpace" value={spaceId} onChange={setSpaceId} options={spaces.map((s) => ({ value: s.id, label: s.name }))} />
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
        <Button type="submit" size="sm" disabled={!name.trim() || !spaceId || create.isPending}>{t('quickCreate.createFolder')}</Button>
      </div>
    </form>
  )
}

function ProjectForm({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [spaceId, setSpaceId] = useState('')
  const spaces = useQuery({
    queryKey: ['spaces', workspaceId],
    queryFn: () => api<Space[]>(`/spaces/workspace/${workspaceId}`),
  }).data ?? []

  const create = useMutation({
    mutationFn: () => api<{ id: string }>(`/projects`, { method: 'POST', body: JSON.stringify({ spaceId, name }) }),
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: ['projects', spaceId] })
      onClose()
      navigate({
        to: '/app/$workspaceId/$spaceId/$projectId',
        params: { workspaceId, spaceId, projectId: project.id },
      })
    },
  })

  return (
    <form
      className="px-5 py-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim() && spaceId) create.mutate()
      }}
    >
      <Input autoFocus placeholder={t('quickCreate.projectNamePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
      <Select labelKey="quickCreate.selectSpace" value={spaceId} onChange={setSpaceId} options={spaces.map((s) => ({ value: s.id, label: s.name }))} />
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
        <Button type="submit" size="sm" disabled={!name.trim() || !spaceId || create.isPending}>{t('quickCreate.createProject')}</Button>
      </div>
    </form>
  )
}

function SpaceForm({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [name, setName] = useState('')

  const create = useMutation({
    mutationFn: () => api<{ id: string }>(`/spaces`, { method: 'POST', body: JSON.stringify({ workspaceId, name }) }),
    onSuccess: (space) => {
      qc.invalidateQueries({ queryKey: ['spaces', workspaceId] })
      onClose()
      navigate({ to: '/app/$workspaceId/$spaceId', params: { workspaceId, spaceId: space.id } })
    },
  })

  return (
    <form
      className="px-5 py-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim()) create.mutate()
      }}
    >
      <Input autoFocus placeholder={t('quickCreate.spaceNamePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
        <Button type="submit" size="sm" disabled={!name.trim() || create.isPending}>{t('quickCreate.createSpace')}</Button>
      </div>
    </form>
  )
}

function DocForm({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [title, setTitle] = useState('')

  const create = useMutation({
    mutationFn: () =>
      api<{ id: string }>(`/workspaces/${workspaceId}/docs`, {
        method: 'POST',
        body: JSON.stringify({ title: title || 'Untitled' }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['docs', workspaceId] })
      onClose()
      navigate({ to: '/app/$workspaceId/docs', params: { workspaceId } })
    },
  })

  return (
    <form
      className="px-5 py-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        create.mutate()
      }}
    >
      <Input autoFocus placeholder={t('quickCreate.docTitlePlaceholder')} value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
        <Button type="submit" size="sm" disabled={create.isPending}>{t('quickCreate.createDoc')}</Button>
      </div>
    </form>
  )
}

/**
 * A1.9 — ClickUp's "+" menu ends in Templates and Import. Both pages already
 * exist here; nothing linked to them from the point where you decide to create
 * something, which is the only moment they are useful.
 */
function Footer({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const go = (to: '/app/$workspaceId/templates' | '/app/$workspaceId/import') => {
    onClose()
    navigate({ to, params: { workspaceId } })
  }
  return (
    <div className="px-5 py-2.5 border-t border-border flex items-center gap-3 bg-surface-50/50">
      <button
        type="button"
        onClick={() => go('/app/$workspaceId/templates')}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <Layers className="h-3.5 w-3.5" />
        {t('quickCreate.fromTemplate')}
      </button>
      <button
        type="button"
        onClick={() => go('/app/$workspaceId/import')}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <Upload className="h-3.5 w-3.5" />
        {t('quickCreate.import')}
      </button>
    </div>
  )
}

function Select({
  labelKey,
  value,
  onChange,
  options,
  disabled,
}: {
  labelKey: TranslationKey
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  disabled?: boolean
}) {
  const { t } = useTranslation()
  return (
    <label className="text-xs">
      <span className="text-muted-foreground mb-1 block">{t(labelKey)}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full h-9 px-2 rounded-md border border-border bg-card text-sm disabled:opacity-50"
      >
        <option value="">{t('quickCreate.selectPlaceholder')}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  )
}

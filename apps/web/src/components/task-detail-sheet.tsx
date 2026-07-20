import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  Badge,
  Button,
  Input,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Textarea,
  cn,
  toast,
} from '@rundesk/ui'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ImageIcon,
  Maximize2,
  Minimize2,
  Copy,
  Trash2,
  Sparkles,
  Wand2,
  Paperclip,
  Diamond,
  X as XIcon,
  Github,
  Gitlab,
  GitPullRequest,
  GitCommit,
  CircleDot,
  ExternalLink,
  RefreshCw,
  Link2,
  FileText,
  Box,
  Video,
  Lock,
  Globe,
} from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { FavoriteStar } from '../lib/use-favorites'
import { TaskReminderButton } from './task-reminders'
import { LinkedDocsSection } from './task-linked-docs'
import { useAuthStore } from '../store/auth'
import { getRealtimeSocket } from '../lib/realtime'
import { SaveAsTemplateButton } from './task-templates-section'
import { CoverImagePicker } from './cover-image-picker'
import { MentionText } from './mention-text'
import { RecurringTaskDialog, type RecurrenceRule } from './recurring-task-dialog'
import { Markdown } from './markdown'
import { formatMentionsPlain } from '../lib/mentions'
import { useTranslation, type TranslationKey } from '../lib/i18n'
import { useDateFormat } from '../lib/date-format'

/**
 * Stream a task/project summary from the SSE endpoint (Plan §7.5), invoking
 * `onDelta` with the accumulated text as tokens arrive. Resolves with the full
 * text; throws on transport/model errors so callers can fall back to /ai/summarize.
 */
async function streamAiSummary(
  body: Record<string, unknown>,
  onDelta: (full: string) => void,
): Promise<string> {
  const token = useAuthStore.getState().accessToken
  const res = await fetch('/api/v1/ai/summarize/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  if (!res.ok || !res.body) throw new Error('summary stream failed')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let acc = ''
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6)
      if (data === '[DONE]') continue
      let parsed: { delta?: string; error?: string }
      try {
        parsed = JSON.parse(data)
      } catch {
        continue
      }
      if (parsed.error) throw new Error(parsed.error)
      if (parsed.delta) {
        acc += parsed.delta
        onDelta(acc)
      }
    }
  }
  return acc
}

// Enum → display-label-key maps. The raw identifier stays the persisted/compared
// value; only the shown label is localized. Unknown values fall back to raw text.
const PRIORITY_LABEL_KEYS: Record<string, TranslationKey> = {
  urgent: 'taskDetail.priority.urgent',
  high: 'taskDetail.priority.high',
  normal: 'taskDetail.priority.normal',
  low: 'taskDetail.priority.low',
}
const STATUS_LABEL_KEYS: Record<string, TranslationKey> = {
  backlog: 'taskDetail.status.backlog',
  todo: 'taskDetail.status.todo',
  in_progress: 'taskDetail.status.inProgress',
  in_review: 'taskDetail.status.inReview',
  done: 'taskDetail.status.done',
  cancelled: 'taskDetail.status.cancelled',
}
/** Known task-activity actions (see apps/api tasks.service.ts logActivity calls). */
const ACTIVITY_ACTION_LABEL_KEYS: Record<string, TranslationKey> = {
  created: 'taskDetail.activity.created',
  updated: 'taskDetail.activity.updated',
  archived: 'taskDetail.activity.archived',
  restored: 'taskDetail.activity.restored',
  moved: 'taskDetail.activity.moved',
  assigned: 'taskDetail.activity.assigned',
  unassigned: 'taskDetail.activity.unassigned',
  commented: 'taskDetail.activity.commented',
  subtask_added: 'taskDetail.activity.subtaskAdded',
  attachment_added: 'taskDetail.activity.attachmentAdded',
  attachment_removed: 'taskDetail.activity.attachmentRemoved',
  status_changed: 'taskDetail.activity.statusChanged',
  priority_changed: 'taskDetail.activity.priorityChanged',
  due_date_changed: 'taskDetail.activity.dueDateChanged',
  label_added: 'taskDetail.activity.labelAdded',
  label_removed: 'taskDetail.activity.labelRemoved',
  checklist_item_toggled: 'taskDetail.activity.checklistItemToggled',
  dependency_added: 'taskDetail.activity.dependencyAdded',
  dependency_removed: 'taskDetail.activity.dependencyRemoved',
}
/** Custom-field type identifiers → display labels (the raw type stays canonical). */
const FIELD_TYPE_LABEL_KEYS: Record<string, TranslationKey> = {
  text: 'taskDetail.fieldType.text',
  number: 'taskDetail.fieldType.number',
  dropdown: 'taskDetail.fieldType.dropdown',
  date: 'taskDetail.fieldType.date',
  checkbox: 'taskDetail.fieldType.checkbox',
  url: 'taskDetail.fieldType.url',
  email: 'taskDetail.fieldType.email',
  phone: 'taskDetail.fieldType.phone',
  money: 'taskDetail.fieldType.money',
  rating: 'taskDetail.fieldType.rating',
}

type TaskPriority = 'urgent' | 'high' | 'normal' | 'low'
type TaskStatus =
  | 'backlog'
  | 'todo'
  | 'in_progress'
  | 'in_review'
  | 'done'
  | 'cancelled'

type UserLite = { id: string; displayName?: string | null; email?: string | null }
type WorkspaceMemberLite = { userId: string; displayName: string; email: string; role?: string }
type MentionTaskLite = { id: string; title: string; projectName?: string; listName?: string }
type MentionDocLite = { id: string; title: string; updatedAt?: string }

type Subtask = {
  id: string
  title: string
  priority: TaskPriority
  status: TaskStatus
  isArchived?: boolean
  dueDate?: string | null
  assignees?: Array<{ userId: string; displayName?: string | null; email?: string | null }>
}

type TaskPickerItem = {
  id: string
  title: string
  listName?: string
  projectName?: string
}

type ChecklistItem = { id: string; content: string; isDone: boolean; dueDate?: string | null }
type Checklist = { id: string; title: string; items: ChecklistItem[] }

type Watcher = {
  userId: string
  user?: UserLite | null
}

type Dependency = {
  dep: { id: string; type: 'blocks' | 'blocked_by' | 'related_to'; relatedTaskId: string }
  related: { id: string; title: string; status: TaskStatus; priority: TaskPriority }
}

type Attachment = {
  id: string
  fileName: string
  fileSize?: number | null
  mimeType?: string | null
  uploadedBy?: string | null
  createdAt?: string | null
  url?: string | null
}

/** Keep in sync with MAX_ATTACHMENT_BYTES in apps/api tasks.service.ts (Plan §4). */
const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024 // 100 MB

type TaskDetail = {
  id: string
  listId: string
  title: string
  description: string | null
  coverColor?: string | null
  isMilestone?: boolean
  visibility?: string | null
  status: TaskStatus
  priority: TaskPriority
  dueDate?: string | null
  startDate?: string | null
  timeEstimate?: number | null
  defaultBillable?: boolean
  labels: Array<{ id: string; name: string; color: string }>
  assignees?: Array<{ user: UserLite }>
  subtasks?: Subtask[]
  checklists: Checklist[]
  watchers?: Watcher[]
  dependencies?: Dependency[]
  attachments?: Attachment[]
  recurrence?: { cadenceDays?: number | null; rule?: RecurrenceRule | null } | null
}

type TaskComment = {
  id: string
  body: string
  createdAt: string
  parentCommentId?: string | null
  assignedToUserId?: string | null
  resolvedByUserId?: string | null
  resolvedAt?: string | null
  author?: UserLite | null
  assignee?: UserLite | null
  resolver?: UserLite | null
  reactions?: Array<{ emoji: string; userId: string }>
  attachments?: Array<{ id: string; fileName: string; fileSize?: number | null; mimeType?: string | null; url?: string | null }>
}

type ActivityEntry = {
  id: string
  action: string
  createdAt: string
  actor?: UserLite | null
}

type TimeEntry = {
  id: string
  startedAt: string
  endedAt: string | null
  description?: string | null
  duration?: number | null
  user?: UserLite | null
}

type TabKey =
  | 'overview'
  | 'subtasks'
  | 'checklists'
  | 'watchers'
  | 'dependencies'
  | 'attachments'
  | 'comments'
  | 'activity'
  | 'time'
  | 'fields'

const TABS: Array<{ key: TabKey; labelKey: TranslationKey }> = [
  { key: 'overview', labelKey: 'taskDetail.tab.overview' },
  { key: 'fields', labelKey: 'taskDetail.tab.fields' },
  { key: 'subtasks', labelKey: 'taskDetail.tab.subtasks' },
  { key: 'checklists', labelKey: 'taskDetail.tab.checklists' },
  { key: 'watchers', labelKey: 'taskDetail.tab.watchers' },
  { key: 'dependencies', labelKey: 'taskDetail.tab.dependencies' },
  { key: 'attachments', labelKey: 'taskDetail.tab.attachments' },
  { key: 'comments', labelKey: 'taskDetail.tab.comments' },
  { key: 'activity', labelKey: 'taskDetail.tab.activity' },
  { key: 'time', labelKey: 'taskDetail.tab.time' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isNotWired(err: unknown): boolean {
  if (err instanceof ApiError) {
    return err.status === 404 || err.status === 405 || err.status === 501
  }
  return true
}

function NotWiredNote({ children }: { children?: React.ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
      {children ?? t('taskDetail.notWired')}
    </div>
  )
}

function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border py-10 px-4 text-center">
      <p className="text-sm font-medium">{title}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

/** Build a short, human-readable task ref from a UUID — first 4 hex chars uppercased. */
function shortId(uuid: string): string {
  return uuid.replace(/[^a-f0-9]/gi, '').slice(0, 4).toUpperCase()
}

function priorityColor(p: TaskPriority | undefined): string {
  switch (p) {
    case 'urgent':
      return 'bg-red-100 text-red-700 border-red-200'
    case 'high':
      return 'bg-orange-100 text-orange-700 border-orange-200'
    case 'normal':
      return 'bg-blue-100 text-blue-700 border-blue-200'
    case 'low':
      return 'bg-slate-100 text-slate-700 border-slate-200'
    default:
      return 'bg-muted text-muted-foreground border-border'
  }
}

function formatBytes(bytes?: number | null): string {
  if (!bytes && bytes !== 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDuration(ms?: number | null): string {
  if (!ms) return '—'
  const seconds = Math.floor(ms / 1000)
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

export function TaskDetailSheet({
  taskId,
  open,
  onOpenChange,
  workspaceId,
}: {
  taskId: string | null
  open: boolean
  onOpenChange: (next: boolean) => void
  workspaceId?: string
}) {
  const { t } = useTranslation()
  const { formatDate } = useDateFormat()
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [expanded, setExpanded] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [coverPickerOpen, setCoverPickerOpen] = useState(false)
  const qc = useQueryClient()
  const navigate = useNavigate()
  const fallbackWorkspaceId = useMemo(() => {
    if (workspaceId) return workspaceId
    if (typeof window === 'undefined') return undefined
    const parts = window.location.pathname.split('/')
    const appIdx = parts.findIndex((p) => p === 'app')
    if (appIdx >= 0 && parts[appIdx + 1]) return parts[appIdx + 1]
    return undefined
  }, [workspaceId])

  const enabled = Boolean(taskId && open)
  const detailQuery = useQuery({
    enabled,
    queryKey: ['task', taskId],
    queryFn: () => api<TaskDetail>(`/tasks/${taskId}`),
  })

  const updateTitle = useMutation({
    mutationFn: (title: string) =>
      api(`/tasks/${taskId}`, {
        method: 'PATCH',
        body: { title },
      }),
    onSuccess: async () => {
      setEditingTitle(false)
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : t('taskDetail.couldNotUpdateTitle'))
    },
  })

  const updateCover = useMutation({
    mutationFn: (coverColor: string | null) =>
      api(`/tasks/${taskId}`, {
        method: 'PATCH',
        body: { coverColor },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : t('taskDetail.couldNotUpdateCover'))
    },
  })

  const updateVisibility = useMutation({
    mutationFn: (visibility: 'public' | 'private') =>
      api(`/tasks/${taskId}`, { method: 'PATCH', body: { visibility } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['task', taskId] })
      void qc.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : t('taskDetail.couldNotUpdateVisibility')),
  })

  const updateMilestone = useMutation({
    mutationFn: (isMilestone: boolean) =>
      api(`/tasks/${taskId}`, { method: 'PATCH', body: { isMilestone } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : t('taskDetail.couldNotUpdateMilestone'))
    },
  })

  const duplicateTask = useMutation({
    mutationFn: () =>
      api(`/workspaces/${fallbackWorkspaceId}/task-templates/duplicate/${taskId}`, { method: 'POST' }),
    onSuccess: async () => {
      toast.success(t('taskDetail.taskDuplicated'))
      await qc.invalidateQueries()
      onOpenChange(false)
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : t('taskDetail.couldNotDuplicate'))
    },
  })

  const deleteTask = useMutation({
    mutationFn: () => api(`/tasks/${taskId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success(t('taskDetail.taskDeleted'))
      await qc.invalidateQueries()
      onOpenChange(false)
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : t('taskDetail.couldNotDelete'))
    },
  })

  const commitTitle = () => {
    const next = titleDraft.trim()
    const current = detailQuery.data?.title ?? ''
    // Revert silently when emptied or unchanged — never save an empty title.
    if (!next || next === current) {
      setEditingTitle(false)
      return
    }
    updateTitle.mutate(next)
  }

  // Reset transient edit UI when switching to a different task.
  useEffect(() => {
    setEditingTitle(false)
    setTitleDraft('')
    setCoverPickerOpen(false)
  }, [taskId])

  useEffect(() => {
    if (!enabled || !taskId) return
    const socket = getRealtimeSocket()
    socket.emit('subscribe', { rooms: [`task:${taskId}`] })
    const onEvent = (event: { type: string; taskId?: string }) => {
      if (event.taskId !== taskId) return
      void qc.invalidateQueries({ queryKey: ['task', taskId] })
      if (event.type.startsWith('comment.') || event.type === 'activity.created') {
        void qc.invalidateQueries({ queryKey: ['task', taskId, 'comments'] })
        void qc.invalidateQueries({ queryKey: ['task', taskId, 'activity'] })
      }
    }
    socket.on('event', onEvent)
    return () => {
      socket.off('event', onEvent)
      socket.emit('unsubscribe', { rooms: [`task:${taskId}`] })
    }
  }, [enabled, taskId, qc])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className={cn(
          'w-full overflow-y-auto transition-[max-width] duration-200',
          expanded ? 'sm:max-w-[90vw]' : 'sm:max-w-2xl',
        )}
      >
        {!taskId ? null : detailQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">{t('taskDetail.loadingTask')}</p>
        ) : detailQuery.data ? (
          <>
            {/* Cover band — renders the saved coverColor when set, else the brand gradient. */}
            <div
              className={cn(
                '-mx-6 -mt-6 mb-4 h-24 relative overflow-hidden rounded-t-md group',
                !detailQuery.data.coverColor && 'bg-brand-gradient',
              )}
              style={
                detailQuery.data.coverColor
                  ? { background: detailQuery.data.coverColor }
                  : undefined
              }
            >
              <div className="absolute inset-0 bg-grid-dim opacity-40" aria-hidden />
              <div className="absolute -bottom-12 -right-8 h-40 w-40 rounded-full bg-white/10 blur-2xl" aria-hidden />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => duplicateTask.mutate()}
                disabled={duplicateTask.isPending || !fallbackWorkspaceId}
                className="absolute left-3 top-3 h-7 gap-1.5 px-2.5 text-xs opacity-90 hover:opacity-100"
              >
                <Copy className="h-3.5 w-3.5" />
                {t('taskDetail.duplicate')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  if (window.confirm(t('taskDetail.confirmDeleteTask'))) deleteTask.mutate()
                }}
                disabled={deleteTask.isPending}
                className="absolute left-[7.25rem] top-3 h-7 gap-1.5 px-2.5 text-xs text-red-600 hover:text-red-600 opacity-90 hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t('taskDetail.deleteTask')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setCoverPickerOpen(true)}
                disabled={updateCover.isPending}
                className="absolute right-3 top-3 h-7 gap-1.5 px-2.5 text-xs opacity-90 hover:opacity-100"
              >
                <ImageIcon className="h-3.5 w-3.5" />
                {t('taskDetail.editCover')}
              </Button>
            </div>

            <CoverImagePicker
              open={coverPickerOpen}
              onOpenChange={setCoverPickerOpen}
              onPick={(cover) => updateCover.mutate(cover === '' ? null : cover)}
            />

            <SheetHeader className="pb-3">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="soft" className="font-mono text-[10px] tracking-wider uppercase">
                  RD-{shortId(detailQuery.data.id)}
                </Badge>
                {detailQuery.data.isMilestone && (
                  <Badge variant="soft" className="text-[10px] gap-1 text-amber-600 dark:text-amber-400">
                    <Diamond className="h-3 w-3 fill-amber-400" />
                    {t('taskDetail.milestone')}
                  </Badge>
                )}
                {detailQuery.data.dueDate && (
                  <Badge variant="info" className="text-[10px]">
                    {t('taskDetail.dueShort', { date: formatDate(detailQuery.data.dueDate) })}
                  </Badge>
                )}
              </div>
              <div className="flex items-start justify-between gap-3">
                {editingTitle ? (
                  <Input
                    autoFocus
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onBlur={commitTitle}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        commitTitle()
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        setEditingTitle(false)
                      }
                    }}
                    disabled={updateTitle.isPending}
                    className="flex-1 h-auto text-2xl font-display leading-tight"
                  />
                ) : (
                  <SheetTitle
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setTitleDraft(detailQuery.data.title)
                      setEditingTitle(true)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setTitleDraft(detailQuery.data.title)
                        setEditingTitle(true)
                      }
                    }}
                    className="text-2xl font-display leading-tight flex-1 cursor-text rounded-sm hover:bg-muted/40 transition-colors"
                    title={t('taskDetail.clickToEditTitle')}
                  >
                    {detailQuery.data.title}
                  </SheetTitle>
                )}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    title={detailQuery.data.visibility === 'private' ? t('taskDetail.makePublic') : t('taskDetail.makePrivate')}
                    aria-pressed={detailQuery.data.visibility === 'private'}
                    disabled={updateVisibility.isPending}
                    onClick={() =>
                      updateVisibility.mutate(detailQuery.data.visibility === 'private' ? 'public' : 'private')
                    }
                    className={cn(
                      'h-8 w-8 inline-flex items-center justify-center rounded hover:text-foreground disabled:opacity-50',
                      detailQuery.data.visibility === 'private' ? 'text-amber-500' : 'text-muted-foreground',
                    )}
                  >
                    {detailQuery.data.visibility === 'private' ? <Lock className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    title={detailQuery.data.isMilestone ? t('taskDetail.unmarkMilestone') : t('taskDetail.markMilestone')}
                    aria-pressed={!!detailQuery.data.isMilestone}
                    disabled={updateMilestone.isPending}
                    onClick={() => updateMilestone.mutate(!detailQuery.data.isMilestone)}
                    className={cn(
                      'h-8 w-8 inline-flex items-center justify-center rounded hover:text-foreground disabled:opacity-50',
                      detailQuery.data.isMilestone ? 'text-amber-500' : 'text-muted-foreground',
                    )}
                  >
                    <Diamond className={cn('h-4 w-4', detailQuery.data.isMilestone && 'fill-amber-400')} />
                  </button>
                  <TaskReminderButton
                    workspaceId={fallbackWorkspaceId}
                    taskId={detailQuery.data.id}
                    className="h-8 w-8"
                  />
                  <FavoriteStar
                    workspaceId={fallbackWorkspaceId}
                    entityType="task"
                    entityId={detailQuery.data.id}
                    className="h-8 w-8"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => setExpanded((prev) => !prev)}
                    className="h-8 w-8"
                    title={expanded ? t('taskDetail.collapsePanel') : t('taskDetail.expandPanel')}
                    aria-label={expanded ? t('taskDetail.collapsePanel') : t('taskDetail.expandPanel')}
                  >
                    {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                  </Button>
                  <SaveAsTemplateButton
                    workspaceId={fallbackWorkspaceId}
                    taskId={detailQuery.data.id}
                  />
                </div>
              </div>
              <SheetDescription className="sr-only">{t('taskDetail.srDescription')}</SheetDescription>
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Badge variant="secondary" className="capitalize">
                  {STATUS_LABEL_KEYS[detailQuery.data.status] ? t(STATUS_LABEL_KEYS[detailQuery.data.status]) : detailQuery.data.status.replace('_', ' ')}
                </Badge>
                <Badge
                  variant={detailQuery.data.priority as 'urgent' | 'high' | 'normal' | 'low'}
                  className="capitalize"
                >
                  {PRIORITY_LABEL_KEYS[detailQuery.data.priority] ? t(PRIORITY_LABEL_KEYS[detailQuery.data.priority]) : detailQuery.data.priority}
                </Badge>
                {detailQuery.data.labels?.map((l) => (
                  <Badge
                    key={l.id}
                    variant="outline"
                    className="border-transparent text-white"
                    style={{ backgroundColor: l.color }}
                  >
                    {l.name}
                  </Badge>
                ))}
              </div>
            </SheetHeader>

            {/* Tab strip */}
            <div className="flex gap-4 overflow-x-auto scrollbar-none border-b border-border/60 -mx-6 px-6">
              {TABS.map((tab) => {
                const isActive = activeTab === tab.key
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={cn(
                      'whitespace-nowrap py-2.5 text-sm transition-colors',
                      isActive
                        ? 'border-b-2 border-accent text-foreground font-medium -mb-px'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {t(tab.labelKey)}
                  </button>
                )
              })}
            </div>

            <div className="pt-4">
              {activeTab === 'overview' && (
                <OverviewPanel detail={detailQuery.data} taskId={detailQuery.data.id} workspaceId={fallbackWorkspaceId} />
              )}
              {activeTab === 'fields' && (
                <CustomFieldsPanel taskId={detailQuery.data.id} workspaceId={fallbackWorkspaceId} />
              )}
              {activeTab === 'subtasks' && (
                <SubtasksPanel
                  taskId={detailQuery.data.id}
                  parentListId={detailQuery.data.listId}
                  workspaceId={fallbackWorkspaceId}
                  inline={detailQuery.data.subtasks ?? []}
                />
              )}
              {activeTab === 'checklists' && (
                <ChecklistsPanel taskId={detailQuery.data.id} checklists={detailQuery.data.checklists ?? []} />
              )}
              {activeTab === 'watchers' && (
                <WatchersPanel
                  taskId={detailQuery.data.id}
                  workspaceId={fallbackWorkspaceId}
                  inline={detailQuery.data.watchers ?? []}
                />
              )}
              {activeTab === 'dependencies' && (
                <DependenciesPanel
                  taskId={detailQuery.data.id}
                  workspaceId={fallbackWorkspaceId}
                  inline={detailQuery.data.dependencies ?? []}
                  onOpenTask={(relatedTaskId) =>
                    navigate({
                      to: '.',
                      search: (prev: Record<string, unknown>) => ({ ...prev, task: relatedTaskId }),
                    } as any)
                  }
                />
              )}
              {activeTab === 'attachments' && (
                <AttachmentsPanel taskId={detailQuery.data.id} inline={detailQuery.data.attachments ?? []} />
              )}
              {activeTab === 'comments' && (
                <CommentsPanel taskId={detailQuery.data.id} workspaceId={fallbackWorkspaceId} />
              )}
              {activeTab === 'activity' && <ActivityPanel taskId={detailQuery.data.id} />}
              {activeTab === 'time' && (
                <TimePanel taskId={detailQuery.data.id} estimate={detailQuery.data.timeEstimate} defaultBillable={detailQuery.data.defaultBillable} />
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-destructive">{t('taskDetail.notFound')}</p>
        )}
      </SheetContent>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Mention textarea (shared @-mention dropdown for plain-text fields)
// ---------------------------------------------------------------------------

/**
 * A Textarea with a people-mention dropdown. Typing '@' followed by text shows a
 * filtered list of workspace members; selecting one inserts the member's name at
 * the cursor. Mirrors the people-mention UX of the comments composer. Self-contained
 * — it owns its dropdown state and never mutates anything outside `onChange`.
 */
function MentionTextarea({
  value,
  onChange,
  members,
  textareaRef,
  ...textareaProps
}: {
  value: string
  onChange: (next: string) => void
  members: WorkspaceMemberLite[]
  textareaRef?: React.Ref<HTMLTextAreaElement>
} & Omit<React.ComponentProps<typeof Textarea>, 'value' | 'onChange'>) {
  const [mentionIndex, setMentionIndex] = useState(0)
  const mentionQuery = value.slice(value.lastIndexOf('@') + 1).toLowerCase()
  const candidates = members.filter((m) =>
    (m.displayName || m.email).toLowerCase().includes(mentionQuery),
  )
  const showMentions = value.includes('@') && value[value.length - 1] !== ' ' && candidates.length > 0

  const insertMention = (member: WorkspaceMemberLite) => {
    const at = value.lastIndexOf('@')
    const prefix = at >= 0 ? value.slice(0, at) : value
    const display = member.displayName || member.email
    onChange(`${prefix}@${display} `)
    setMentionIndex(0)
  }

  return (
    <div className="relative">
      <Textarea
        {...textareaProps}
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (showMentions) {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setMentionIndex((prev) => (prev + 1) % candidates.length)
              return
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setMentionIndex((prev) => (prev - 1 + candidates.length) % candidates.length)
              return
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              const member = candidates[mentionIndex]
              if (member) insertMention(member)
              return
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              onChange(value.replace(/@[^ ]*$/, ''))
              setMentionIndex(0)
              return
            }
          }
          textareaProps.onKeyDown?.(e)
        }}
      />
      {showMentions && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-card shadow-lg overflow-hidden">
          <div className="max-h-40 overflow-auto">
            {candidates.slice(0, 8).map((member, idx) => (
              <button
                key={member.userId}
                type="button"
                className={cn(
                  'w-full px-2.5 py-2 text-left text-xs flex items-center gap-2',
                  idx === mentionIndex ? 'bg-muted' : 'hover:bg-muted/70',
                )}
                onMouseEnter={() => setMentionIndex(idx)}
                // Use onMouseDown so the click registers before the textarea blur fires.
                onMouseDown={(e) => {
                  e.preventDefault()
                  insertMention(member)
                }}
              >
                <div className="h-6 w-6 rounded-full bg-brand-100 text-foreground text-[10px] font-semibold flex items-center justify-center">
                  {(member.displayName || member.email)[0]?.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-foreground truncate">{member.displayName || member.email}</div>
                  <div className="text-muted-foreground truncate">{member.email}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function OverviewPanel({
  detail,
  taskId,
  workspaceId,
}: {
  detail: TaskDetail
  taskId: string
  workspaceId?: string
}) {
  const { t, tCount } = useTranslation()
  const qc = useQueryClient()
  const [editingDescription, setEditingDescription] = useState(false)
  const [descriptionDraft, setDescriptionDraft] = useState('')
  const descriptionRef = useRef<HTMLTextAreaElement>(null)
  // Streamed AI task summary (Plan §7.5): null = closed, '' = streaming started.
  const [summaryText, setSummaryText] = useState<string | null>(null)
  const [summarizing, setSummarizing] = useState(false)

  // Wrap the current selection (or insert at the caret) with markdown syntax.
  const applyDescriptionFormat = (kind: 'bold' | 'italic' | 'code' | 'link' | 'h2' | 'ul' | 'ol' | 'quote') => {
    const el = descriptionRef.current
    const text = descriptionDraft
    const start = el?.selectionStart ?? text.length
    const end = el?.selectionEnd ?? text.length
    const selected = text.slice(start, end)

    const wrap = (marker: string, placeholder: string) => {
      const body = selected || placeholder
      const next = text.slice(0, start) + marker + body + marker + text.slice(end)
      setDescriptionDraft(next)
      requestAnimationFrame(() => {
        el?.focus()
        const s = start + marker.length
        el?.setSelectionRange(s, s + body.length)
      })
    }
    const linePrefix = (prefix: string) => {
      const lineStart = text.lastIndexOf('\n', start - 1) + 1
      const next = text.slice(0, lineStart) + prefix + text.slice(lineStart)
      setDescriptionDraft(next)
      requestAnimationFrame(() => {
        el?.focus()
        const c = end + prefix.length
        el?.setSelectionRange(c, c)
      })
    }

    if (kind === 'bold') return wrap('**', 'bold text')
    if (kind === 'italic') return wrap('*', 'italic text')
    if (kind === 'code') return wrap('`', 'code')
    if (kind === 'link') {
      const label = selected || 'link text'
      const next = text.slice(0, start) + `[${label}](https://)` + text.slice(end)
      setDescriptionDraft(next)
      requestAnimationFrame(() => {
        el?.focus()
        const urlPos = start + label.length + 3
        el?.setSelectionRange(urlPos, urlPos + 8) // select the https:// placeholder
      })
      return
    }
    if (kind === 'h2') return linePrefix('## ')
    if (kind === 'ul') return linePrefix('- ')
    if (kind === 'ol') return linePrefix('1. ')
    if (kind === 'quote') return linePrefix('> ')
  }

  const membersQuery = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => api<Array<{ userId: string; displayName: string; email: string }>>(`/workspaces/${workspaceId}/members`),
    enabled: Boolean(workspaceId),
  })

  const updateDescription = useMutation({
    mutationFn: (description: string | null) =>
      api(`/tasks/${taskId}`, {
        method: 'PATCH',
        body: { description },
      }),
    onSuccess: async () => {
      setEditingDescription(false)
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : t('taskDetail.couldNotUpdateDescription'))
    },
  })

  const patchTask = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      api(`/tasks/${taskId}`, { method: 'PATCH', body: patch }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : t('taskDetail.couldNotUpdateTask'))
    },
  })

  const [recurrenceDialogOpen, setRecurrenceDialogOpen] = useState(false)
  const setRecurrence = useMutation({
    mutationFn: (body: Record<string, unknown> | null) =>
      api(`/tasks/${taskId}/recurrence`, { method: 'PUT', body: body ?? {} }),
    onSuccess: async () => {
      setRecurrenceDialogOpen(false)
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : t('taskDetail.couldNotUpdateRepeat'))
    },
  })
  const recurrenceValue = (() => {
    const r = detail.recurrence
    if (!r) return 'off'
    // A bare monthly rule (no interval/dayOfMonth) is the "monthly" preset;
    // any richer rule is a custom schedule set via the dialog.
    if (r.rule) {
      const isPresetMonthly =
        r.rule.mode === 'monthly' && (r.rule.interval ?? 1) === 1 && r.rule.dayOfMonth == null
      return isPresetMonthly ? 'monthly' : 'custom'
    }
    if (r.cadenceDays === 1) return 'daily'
    if (r.cadenceDays === 7) return 'weekly'
    if (r.cadenceDays === 14) return 'biweekly'
    return 'custom'
  })()
  const onRecurrenceChange = (v: string) => {
    if (v === 'off') return setRecurrence.mutate(null)
    if (v === 'daily') return setRecurrence.mutate({ cadenceDays: 1 })
    if (v === 'weekly') return setRecurrence.mutate({ cadenceDays: 7 })
    if (v === 'biweekly') return setRecurrence.mutate({ cadenceDays: 14 })
    if (v === 'monthly') return setRecurrence.mutate({ rule: { mode: 'monthly' } })
    if (v === 'custom') return setRecurrenceDialogOpen(true)
  }

  const statusesQuery = useQuery({
    queryKey: ['list-statuses', detail.listId],
    queryFn: () => api<Array<{ key: string; name: string }>>(`/lists/${detail.listId}/statuses`),
    enabled: Boolean(detail.listId),
  })
  const statusOptions = statusesQuery.data ?? []
  const toDateInput = (d: string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : '')

  const commitDescription = () => {
    const trimmed = descriptionDraft.trim()
    const next = trimmed === '' ? null : descriptionDraft
    const current = detail.description ?? null
    if (next === current) {
      setEditingDescription(false)
      return
    }
    updateDescription.mutate(next)
  }

  // ── AI actions (Plan §7.3 / §7.5 / §7.9) ────────────────────────────────────
  const aiSuggestPriority = useMutation({
    mutationFn: () =>
      api<{ priority: string; reasoning: string }>(`/ai/task/priority`, {
        method: 'POST',
        body: { title: detail.title, description: detail.description ?? undefined, workspaceId },
      }),
    onSuccess: (r) => {
      patchTask.mutate({ priority: r.priority })
      toast.success(t('taskDetail.aiSetPriority', { priority: PRIORITY_LABEL_KEYS[r.priority] ? t(PRIORITY_LABEL_KEYS[r.priority]) : r.priority }), { description: r.reasoning })
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('taskDetail.aiUnavailable')),
  })
  const aiImproveDescription = useMutation({
    mutationFn: (mode: 'improve' | 'format') =>
      api<{ improved: string }>(`/ai/writing/improve`, {
        method: 'POST',
        body: { text: detail.description ?? detail.title, mode, workspaceId },
      }),
    onSuccess: (r) => {
      setDescriptionDraft(r.improved)
      setEditingDescription(true)
      toast.success(t('taskDetail.aiDraftReady'))
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('taskDetail.aiUnavailable')),
  })
  // Stream an enriched task summary (recent activity, open subtasks, blockers,
  // comments — assembled server-side from taskId) into a panel (Plan §7.5), with
  // a non-streaming fallback to /ai/summarize.
  async function runTaskSummary() {
    if (summarizing) return
    setSummarizing(true)
    setSummaryText('')
    try {
      await streamAiSummary({ taskId, type: 'task', workspaceId }, (full) => setSummaryText(full))
    } catch {
      try {
        const r = await api<{ summary: string }>(`/ai/summarize`, {
          method: 'POST',
          body: { taskId, type: 'task', workspaceId },
        })
        setSummaryText(r.summary)
      } catch (err) {
        setSummaryText(null)
        toast.error(err instanceof ApiError ? err.message : t('taskDetail.aiUnavailable'))
      }
    } finally {
      setSummarizing(false)
    }
  }
  const aiSuggestDeadline = useMutation({
    mutationFn: () =>
      api<{ suggestedDate: string; reasoning: string }>(`/ai/task/deadline`, {
        method: 'POST',
        // Pass taskId so the backend factors in current team workload (Plan §7.4)
        // — it derives a per-assignee open-task signal server-side and the
        // returned reasoning reflects it.
        body: { title: detail.title, description: detail.description ?? undefined, taskId, workspaceId },
      }),
    onSuccess: (r) => {
      patchTask.mutate({ dueDate: r.suggestedDate })
      toast.success(t('taskDetail.aiSuggestedDeadline', { date: r.suggestedDate }), { description: r.reasoning })
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('taskDetail.aiUnavailable')),
  })

  // Reset transient edit UI when switching to a different task.
  useEffect(() => {
    setEditingDescription(false)
    setDescriptionDraft('')
    setSummaryText(null)
    setSummarizing(false)
  }, [taskId])
  const pendingInvitesQuery = useQuery({
    queryKey: ['workspace-invitations', workspaceId],
    queryFn: () => api<Array<{ id: string; email: string; role: string; status: string; expiresAt: string }>>(`/invitations/workspace/${workspaceId}`),
    enabled: Boolean(workspaceId),
  })

  const addAssignee = useMutation({
    mutationFn: (userId: string) =>
      api(`/tasks/${taskId}/assignees`, {
        method: 'POST',
        body: { userId },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })

  const removeAssignee = useMutation({
    mutationFn: (userId: string) => api(`/tasks/${taskId}/assignees/${userId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })

  const assignedIds = new Set((detail.assignees ?? []).map((a) => a.user.id))
  const availableMembers = (membersQuery.data ?? []).filter((m) => !assignedIds.has(m.userId))

  return (
    <div className="space-y-4">
      <section>
        <div className="flex items-center justify-between mb-1.5">
          <h4 className="text-xs uppercase tracking-wide text-muted-foreground">{t('taskDetail.description')}</h4>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={aiImproveDescription.isPending}
              onClick={() => aiImproveDescription.mutate('improve')}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent/10 disabled:opacity-50"
              title={t('taskDetail.improveDescriptionAi')}
            >
              <Wand2 className="h-3 w-3" /> {t('taskDetail.improve')}
            </button>
            <button
              type="button"
              disabled={summarizing}
              onClick={() => runTaskSummary()}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent/10 disabled:opacity-50"
              title={t('taskDetail.summarizeTaskAi')}
            >
              <Sparkles className="h-3 w-3" /> {t('taskDetail.summarize')}
            </button>
          </div>
        </div>
        {summaryText !== null && (
          <div className="mb-2 rounded-md border border-accent/30 bg-accent/5 p-3 text-sm whitespace-pre-wrap">
            <div className="mb-1 flex items-center justify-between">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent">
                <Sparkles className="h-3 w-3" /> {t('taskDetail.taskSummary')}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={!summaryText}
                  onClick={() => {
                    if (summaryText) {
                      navigator.clipboard.writeText(summaryText)
                      toast.success(t('taskDetail.summaryCopied'))
                    }
                  }}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                  title={t('taskDetail.copySummary')}
                >
                  <Copy className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setSummaryText(null)}
                  className="text-muted-foreground hover:text-foreground"
                  title={t('common.close')}
                >
                  <XIcon className="h-3 w-3" />
                </button>
              </div>
            </div>
            {summaryText || (summarizing ? t('taskDetail.summarizing') : '')}
            {summarizing && <span className="inline-block w-1 h-3.5 bg-accent ml-0.5 align-middle animate-pulse" />}
          </div>
        )}
        {editingDescription ? (
          <div>
            <div className="mb-1.5 flex flex-wrap items-center gap-0.5">
              {([
                ['bold', 'B', 'taskDetail.format.bold', 'font-bold'],
                ['italic', 'I', 'taskDetail.format.italic', 'italic'],
                ['code', '<>', 'taskDetail.format.code', 'font-mono text-[11px]'],
                ['link', '🔗', 'taskDetail.format.link', ''],
                ['h2', 'H', 'taskDetail.format.heading', 'font-semibold'],
                ['ul', '•', 'taskDetail.format.bulletedList', ''],
                ['ol', '1.', 'taskDetail.format.numberedList', 'text-[11px]'],
                ['quote', '❝', 'taskDetail.format.quote', ''],
              ] as const).map(([kind, glyph, title, cls]) => (
                <button
                  key={kind}
                  type="button"
                  title={t(title)}
                  // preventDefault on mousedown keeps the textarea selection intact
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyDescriptionFormat(kind)}
                  className={cn(
                    'h-6 min-w-6 px-1.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-accent/10',
                    cls,
                  )}
                >
                  {glyph}
                </button>
              ))}
            </div>
            <MentionTextarea
              autoFocus
              rows={5}
              value={descriptionDraft}
              onChange={setDescriptionDraft}
              members={membersQuery.data ?? []}
              textareaRef={descriptionRef}
              onBlur={commitDescription}
              disabled={updateDescription.isPending}
              placeholder={t('taskDetail.descriptionPlaceholder')}
              className="text-sm leading-relaxed font-mono"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">{t('taskDetail.markdownHint')}</p>
          </div>
        ) : detail.description?.trim() ? (
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              setDescriptionDraft(detail.description ?? '')
              setEditingDescription(true)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setDescriptionDraft(detail.description ?? '')
                setEditingDescription(true)
              }
            }}
            className="w-full cursor-text rounded-md px-2 py-1.5 -mx-2 text-sm hover:bg-muted/40 transition-colors"
            title={t('taskDetail.clickToEditDescription')}
          >
            <Markdown source={detail.description} />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setDescriptionDraft('')
              setEditingDescription(true)
            }}
            className="w-full text-left text-sm leading-relaxed rounded-md px-2 py-1.5 -mx-2 hover:bg-muted/40 transition-colors"
            title={t('taskDetail.clickToEditDescription')}
          >
            <span className="text-muted-foreground italic">{t('taskDetail.addDescription')}</span>
          </button>
        )}
      </section>

      <div className="grid grid-cols-2 gap-4">
        <Field label={t('taskDetail.fieldStatus')}>
          <select
            value={detail.status}
            onChange={(e) => patchTask.mutate({ status: e.target.value })}
            disabled={patchTask.isPending}
            className="w-full h-8 rounded-md border border-border bg-card px-2 text-sm capitalize focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          >
            {/* Keep the current value selectable even if statuses are still loading */}
            {statusOptions.length === 0 && <option value={detail.status}>{STATUS_LABEL_KEYS[detail.status] ? t(STATUS_LABEL_KEYS[detail.status]) : detail.status.replace('_', ' ')}</option>}
            {statusOptions.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('taskDetail.fieldPriority')}>
          <div className="flex items-center gap-1">
            <select
              value={detail.priority}
              onChange={(e) => patchTask.mutate({ priority: e.target.value })}
              disabled={patchTask.isPending}
              className={cn(
                'flex-1 h-8 rounded-md border border-border bg-card px-2 text-sm capitalize focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50',
                priorityColor(detail.priority),
              )}
            >
              {(['urgent', 'high', 'normal', 'low'] as const).map((p) => (
                <option key={p} value={p}>
                  {t(PRIORITY_LABEL_KEYS[p])}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={aiSuggestPriority.isPending}
              onClick={() => aiSuggestPriority.mutate()}
              className="h-8 w-8 shrink-0 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/10 disabled:opacity-50"
              title={t('taskDetail.suggestPriorityAi')}
            >
              <Sparkles className="h-3.5 w-3.5" />
            </button>
          </div>
        </Field>
        <Field
          label={
            <span className="flex items-center justify-between">
              {t('taskDetail.fieldDueDate')}
              <button
                type="button"
                disabled={aiSuggestDeadline.isPending}
                onClick={() => aiSuggestDeadline.mutate()}
                className="inline-flex items-center gap-1 rounded px-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-50"
                title={t('taskDetail.suggestDeadlineAi')}
              >
                <Sparkles className="h-2.5 w-2.5" /> {t('taskDetail.aiShort')}
              </button>
            </span>
          }
        >
          <input
            type="date"
            value={toDateInput(detail.dueDate)}
            onChange={(e) => patchTask.mutate({ dueDate: e.target.value || null })}
            disabled={patchTask.isPending}
            className="w-full h-8 rounded-md border border-border bg-card px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          />
        </Field>
        <Field label={t('taskDetail.fieldStartDate')}>
          <input
            type="date"
            value={toDateInput(detail.startDate)}
            onChange={(e) => patchTask.mutate({ startDate: e.target.value || null })}
            disabled={patchTask.isPending}
            className="w-full h-8 rounded-md border border-border bg-card px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          />
        </Field>
        <Field label={t('taskDetail.fieldRepeat')}>
          <select
            value={recurrenceValue}
            onChange={(e) => onRecurrenceChange(e.target.value)}
            disabled={setRecurrence.isPending}
            className="w-full h-8 rounded-md border border-border bg-card px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            title={t('taskDetail.repeatTooltip')}
          >
            <option value="off">{t('taskDetail.repeat.off')}</option>
            <option value="daily">{t('taskDetail.repeat.daily')}</option>
            <option value="weekly">{t('taskDetail.repeat.weekly')}</option>
            <option value="biweekly">{t('taskDetail.repeat.biweekly')}</option>
            <option value="monthly">{t('taskDetail.repeat.monthly')}</option>
            <option value="custom">{t('taskDetail.repeat.custom')}</option>
          </select>
          {recurrenceValue === 'custom' && (
            <button
              type="button"
              onClick={() => setRecurrenceDialogOpen(true)}
              className="mt-1 text-xs text-accent hover:underline"
            >
              {t('taskDetail.editCustomSchedule')}
            </button>
          )}
          <RecurringTaskDialog
            open={recurrenceDialogOpen}
            onOpenChange={setRecurrenceDialogOpen}
            initialRule={detail.recurrence?.rule ?? null}
            saving={setRecurrence.isPending}
            onSubmit={(rule) => setRecurrence.mutate({ rule })}
          />
        </Field>
        <Field label={t('taskDetail.fieldEstimate')}>
          <input
            type="number"
            min={0}
            step={0.25}
            defaultValue={detail.timeEstimate != null ? Math.round((detail.timeEstimate / 3600) * 100) / 100 : ''}
            onBlur={(e) => {
              const v = e.target.value.trim()
              const hrs = v === '' ? null : Number(v)
              const secs = hrs == null || !Number.isFinite(hrs) ? null : Math.round(hrs * 3600)
              if (secs !== (detail.timeEstimate ?? null)) patchTask.mutate({ timeEstimate: secs })
            }}
            disabled={patchTask.isPending}
            placeholder="—"
            className="w-full h-8 rounded-md border border-border bg-card px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          />
        </Field>
      </div>

      <Field label={t('taskDetail.fieldAssignees')}>
        {detail.assignees && detail.assignees.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {detail.assignees.map((a) => (
              <button
                key={a.user.id}
                onClick={() => removeAssignee.mutate(a.user.id)}
                className="inline-flex"
                title={t('taskDetail.removeAssignee')}
              >
                <Badge variant="secondary">
                  {a.user.displayName ?? a.user.email ?? t('taskDetail.userFallback')} ✕
                </Badge>
              </button>
            ))}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">{t('taskDetail.unassigned')}</span>
        )}
        {workspaceId && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {availableMembers.slice(0, 8).map((m) => (
              <button
                key={m.userId}
                onClick={() => addAssignee.mutate(m.userId)}
                className="inline-flex"
                title={t('taskDetail.assignMember', { name: m.displayName || m.email })}
              >
                <Badge variant="outline">+ {m.displayName || m.email}</Badge>
              </button>
            ))}
            {availableMembers.length === 0 && (
              <span className="text-xs text-muted-foreground">{t('taskDetail.noMoreMembers')}</span>
            )}
          </div>
        )}
        {(pendingInvitesQuery.data?.length ?? 0) > 0 && (
          <div className="mt-2 text-xs text-muted-foreground">
            {tCount('taskDetail.pendingInvites', pendingInvitesQuery.data?.length ?? 0)}
          </div>
        )}
      </Field>

      <LinkedDocsSection taskId={taskId} workspaceId={workspaceId} />

      <LinkedWorkSection taskId={taskId} workspaceId={workspaceId} />
    </div>
  )
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{label}</div>
      <div>{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Linked work / Development (Plan §12.8 GitHub/GitLab, §12.2 Google Drive)
// ---------------------------------------------------------------------------

type ExternalLink = {
  id: string
  provider: 'github' | 'gitlab' | 'google_drive' | 'dropbox' | 'zoom' | 'google_meet' | 'link'
  kind: 'commit' | 'pull_request' | 'issue' | 'file' | 'meeting' | 'link'
  url: string
  externalId: string | null
  title: string | null
  status: string | null
  metadata:
    | {
        mimeType?: string | null
        thumbnailLink?: string | null
        previewUrl?: string | null
        iconLink?: string | null
        recordingUrl?: string | null
      }
    | null
  createdAt: string
}

/** Icon for a link, keyed by provider + kind (PR/issue/commit get git glyphs). */
function linkIcon(link: ExternalLink) {
  if (link.kind === 'meeting') return Video
  if (link.kind === 'pull_request') return GitPullRequest
  if (link.kind === 'issue') return CircleDot
  if (link.kind === 'commit') return GitCommit
  if (link.provider === 'github') return Github
  if (link.provider === 'gitlab') return Gitlab
  if (link.provider === 'google_drive') return FileText
  if (link.provider === 'dropbox') return Box
  return Link2
}

/**
 * "Linked work" on a task: paste a GitHub/GitLab URL (commit/PR/issue) or a
 * Google Drive file URL to attach it. Shows provider icon + kind + title, a
 * PR/MR status badge (open=green / merged=purple / closed=red), open-in-new,
 * a status refresh, and unlink. The live status/metadata is populated by the
 * API when the workspace has the provider connected; otherwise links show a
 * neutral "Linked" badge.
 */
function LinkedWorkSection({ taskId, workspaceId }: { taskId: string; workspaceId?: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [url, setUrl] = useState('')

  const linksQuery = useQuery({
    queryKey: ['task-external-links', taskId],
    queryFn: () => api<ExternalLink[]>(`/tasks/${taskId}/links`),
  })
  // Which providers are connected drives whether the meeting buttons are
  // enabled (Zoom = its own connection, Google Meet = the gcal connection).
  const connectionsQuery = useQuery({
    queryKey: ['integration-connections', workspaceId],
    queryFn: () =>
      api<Array<{ provider: string; status: string }>>(
        `/workspaces/${workspaceId}/integrations/connections`,
      ),
    enabled: !!workspaceId,
  })
  const invalidate = () => qc.invalidateQueries({ queryKey: ['task-external-links', taskId] })

  const add = useMutation({
    mutationFn: (u: string) => api(`/tasks/${taskId}/links`, { method: 'POST', body: { url: u } }),
    onSuccess: () => {
      setUrl('')
      invalidate()
    },
    onError: () => toast.error(t('taskDetail.linkedWork.addError')),
  })
  const refresh = useMutation({
    mutationFn: (linkId: string) => api(`/tasks/${taskId}/links/${linkId}/refresh`, { method: 'POST' }),
    onSuccess: invalidate,
  })
  const unlink = useMutation({
    mutationFn: (linkId: string) => api(`/tasks/${taskId}/links/${linkId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
  const createMeeting = useMutation({
    mutationFn: (provider: 'zoom' | 'google_meet') =>
      api(`/tasks/${taskId}/meeting`, { method: 'POST', body: { provider } }),
    onSuccess: invalidate,
    onError: () => toast.error(t('taskDetail.meetings.createError')),
  })
  const attachRecording = useMutation({
    mutationFn: ({ linkId, recordingUrl }: { linkId: string; recordingUrl: string }) =>
      api(`/tasks/${taskId}/meeting/${linkId}/recording`, { method: 'POST', body: { url: recordingUrl } }),
    onSuccess: invalidate,
    onError: () => toast.error(t('taskDetail.meetings.recordingError')),
  })

  const submit = () => {
    const u = url.trim()
    if (!/^https?:\/\//i.test(u)) {
      toast.error(t('taskDetail.linkedWork.invalidUrl'))
      return
    }
    add.mutate(u)
  }

  const connected = useMemo(() => {
    const set = new Set<string>()
    for (const c of connectionsQuery.data ?? []) if (c.status === 'connected') set.add(c.provider)
    return set
  }, [connectionsQuery.data])
  const zoomConnected = connected.has('zoom')
  const meetConnected = connected.has('gcal')

  const links = linksQuery.data ?? []

  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
        {t('taskDetail.linkedWork.heading')}
      </div>
      <div className="flex items-center gap-1.5 mb-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
          }}
          placeholder={t('taskDetail.linkedWork.addPlaceholder')}
          className="h-8 text-[13px]"
        />
        <Button
          size="sm"
          variant="outline"
          className="h-8 shrink-0"
          disabled={add.isPending || !url.trim()}
          onClick={submit}
        >
          {t('taskDetail.linkedWork.add')}
        </Button>
      </div>

      {/* One-click meeting creation (Plan §12.9). Disabled with a hint until
          the matching provider is connected in Integrations. */}
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <Button
          size="sm"
          variant="outline"
          className="h-8 shrink-0"
          disabled={!zoomConnected || createMeeting.isPending}
          title={zoomConnected ? undefined : t('taskDetail.meetings.connectHint')}
          onClick={() => createMeeting.mutate('zoom')}
        >
          <Video className="h-3.5 w-3.5 mr-1" />
          {t('taskDetail.meetings.createZoom')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 shrink-0"
          disabled={!meetConnected || createMeeting.isPending}
          title={meetConnected ? undefined : t('taskDetail.meetings.connectHint')}
          onClick={() => createMeeting.mutate('google_meet')}
        >
          <Video className="h-3.5 w-3.5 mr-1" />
          {t('taskDetail.meetings.createMeet')}
        </Button>
      </div>

      {links.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('taskDetail.linkedWork.empty')}</p>
      ) : (
        <div className="space-y-1">
          {links.map((l) => (
            <LinkedWorkRow
              key={l.id}
              link={l}
              onRefresh={() => refresh.mutate(l.id)}
              onUnlink={() => unlink.mutate(l.id)}
              onAttachRecording={(recordingUrl) => attachRecording.mutate({ linkId: l.id, recordingUrl })}
              busy={refresh.isPending || unlink.isPending || attachRecording.isPending}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function LinkedWorkStatusBadge({ status }: { status: string | null }) {
  const { t } = useTranslation()
  if (status === 'open')
    return (
      <span className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium border border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
        {t('taskDetail.linkedWork.statusOpen')}
      </span>
    )
  if (status === 'merged')
    return (
      <span className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium border border-purple-500/30 bg-purple-500/15 text-purple-600 dark:text-purple-400">
        {t('taskDetail.linkedWork.statusMerged')}
      </span>
    )
  if (status === 'closed')
    return (
      <span className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium border border-rose-500/30 bg-rose-500/15 text-rose-600 dark:text-rose-400">
        {t('taskDetail.linkedWork.statusClosed')}
      </span>
    )
  // No live state (provider not connected, or a plain file/link).
  return (
    <Badge variant="outline" className="shrink-0 text-[11px]">
      {t('taskDetail.linkedWork.linked')}
    </Badge>
  )
}

function LinkedWorkRow({
  link,
  onRefresh,
  onUnlink,
  onAttachRecording,
  busy,
}: {
  link: ExternalLink
  onRefresh: () => void
  onUnlink: () => void
  onAttachRecording: (url: string) => void
  busy: boolean
}) {
  const { t } = useTranslation()
  const [recordingUrl, setRecordingUrl] = useState('')
  const Icon = linkIcon(link)
  const kindKey: TranslationKey =
    link.kind === 'commit'
      ? 'taskDetail.linkedWork.kindCommit'
      : link.kind === 'pull_request'
        ? 'taskDetail.linkedWork.kindPullRequest'
        : link.kind === 'issue'
          ? 'taskDetail.linkedWork.kindIssue'
          : link.kind === 'file'
            ? 'taskDetail.linkedWork.kindFile'
            : link.kind === 'meeting'
              ? 'taskDetail.linkedWork.kindMeeting'
              : 'taskDetail.linkedWork.kindLink'
  const fallbackLabel =
    link.provider === 'google_drive'
      ? t('taskDetail.linkedWork.driveFile')
      : link.provider === 'dropbox'
        ? t('taskDetail.linkedWork.dropboxFile')
        : link.url
  const label = link.title || link.externalId || fallbackLabel
  // Drive files surface their mime type; everything else shows the kind.
  const typeText =
    link.provider === 'google_drive' && link.metadata?.mimeType ? String(link.metadata.mimeType) : t(kindKey)
  const canRefresh =
    ((link.provider === 'github' || link.provider === 'gitlab') &&
      (link.kind === 'pull_request' || link.kind === 'issue')) ||
    ((link.provider === 'google_drive' || link.provider === 'dropbox') && link.kind === 'file')
  const isMeeting = link.kind === 'meeting'
  const recording = link.metadata?.recordingUrl ?? null
  // §12.2 / §12.6 — inline preview for Drive/Dropbox file links when the API has
  // stored a thumbnail/preview URL in the link metadata. When absent (or the
  // image fails to load) the icon + name row above is the graceful fallback.
  const isFilePreview = link.kind === 'file' && (link.provider === 'google_drive' || link.provider === 'dropbox')
  const thumbUrl = isFilePreview ? link.metadata?.thumbnailLink || link.metadata?.previewUrl || null : null

  const submitRecording = () => {
    const u = recordingUrl.trim()
    if (!/^https?:\/\//i.test(u)) {
      toast.error(t('taskDetail.linkedWork.invalidUrl'))
      return
    }
    onAttachRecording(u)
    setRecordingUrl('')
  }

  return (
    <div className="rounded-md border border-border/60 hover:bg-accent/5">
      <div className="group flex items-center gap-2 px-2 py-1.5 text-sm">
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <a
          href={link.url}
          target="_blank"
          rel="noreferrer"
          className="flex min-w-0 flex-1 flex-col hover:underline"
        >
          <span className="truncate">{label}</span>
          <span className="truncate text-[11px] text-muted-foreground no-underline">{typeText}</span>
        </a>
        <LinkedWorkStatusBadge status={link.status} />
        {canRefresh && (
          <button
            type="button"
            title={t('taskDetail.linkedWork.refresh')}
            disabled={busy}
            onClick={onRefresh}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        )}
        <a
          href={link.url}
          target="_blank"
          rel="noreferrer"
          title={isMeeting ? t('taskDetail.meetings.join') : t('taskDetail.linkedWork.open')}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <button
          type="button"
          title={t('taskDetail.linkedWork.unlink')}
          disabled={busy}
          onClick={onUnlink}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground opacity-0 hover:text-rose-500 group-hover:opacity-100"
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Inline Drive/Dropbox thumbnail preview (§12.2 / §12.6). */}
      {thumbUrl && (
        <a
          href={link.url}
          target="_blank"
          rel="noreferrer"
          title={t('taskDetail.linkedWork.open')}
          className="block px-2 pb-2"
        >
          <img
            src={thumbUrl}
            alt={label}
            loading="lazy"
            className="max-h-40 max-w-full rounded border border-border/60 object-contain"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        </a>
      )}

      {/* Recording link — attach after the meeting, or open an attached one. */}
      {isMeeting && (
        <div className="flex items-center gap-1.5 px-2 pb-1.5">
          {recording ? (
            <a
              href={recording}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground hover:underline"
            >
              <Video className="h-3 w-3" />
              {t('taskDetail.meetings.recording')}
            </a>
          ) : (
            <>
              <Input
                value={recordingUrl}
                onChange={(e) => setRecordingUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    submitRecording()
                  }
                }}
                placeholder={t('taskDetail.meetings.recordingPlaceholder')}
                className="h-7 text-[12px]"
              />
              <Button
                size="sm"
                variant="ghost"
                className="h-7 shrink-0 text-[12px]"
                disabled={busy || !recordingUrl.trim()}
                onClick={submitRecording}
              >
                {t('taskDetail.meetings.attachRecording')}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Subtasks
// ---------------------------------------------------------------------------

function SubtasksPanel({
  taskId,
  parentListId,
  workspaceId,
  inline,
}: {
  taskId: string
  parentListId: string
  workspaceId?: string
  inline: Subtask[]
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null)
  const [editingSubtaskTitle, setEditingSubtaskTitle] = useState('')

  const membersQuery = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => api<WorkspaceMemberLite[]>(`/workspaces/${workspaceId}/members`),
    enabled: !!workspaceId,
  })

  // Probe a dedicated endpoint first; fall back to inline subtasks from getTask.
  const probe = useQuery({
    queryKey: ['task', taskId, 'subtasks'],
    queryFn: async () => {
      try {
        return await api<Subtask[]>(`/tasks/${taskId}/subtasks`)
      } catch (err) {
        if (isNotWired(err)) return null
        throw err
      }
    },
  })

  const subtasks = probe.data ?? inline
  const doneCount = subtasks.filter((s) => s.status === 'done').length
  const donePct = subtasks.length ? Math.round((doneCount / subtasks.length) * 100) : 0

  const invalidateSubtasks = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['task', taskId] }),
      qc.invalidateQueries({ queryKey: ['task', taskId, 'subtasks'] }),
    ])

  const toggleDone = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) =>
      api(`/tasks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: done ? 'done' : 'todo' }),
      }),
    onSuccess: invalidateSubtasks,
  })

  const create = useMutation({
    mutationFn: () =>
      api(`/tasks`, {
        method: 'POST',
        body: JSON.stringify({ title, parentTaskId: taskId, listId: parentListId }),
      }),
    onSuccess: async () => {
      setTitle('')
      await invalidateSubtasks()
    },
  })

  const renameSubtask = useMutation({
    mutationFn: ({ id, nextTitle }: { id: string; nextTitle: string }) =>
      api(`/tasks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: nextTitle }),
      }),
    onSuccess: async () => {
      setEditingSubtaskId(null)
      setEditingSubtaskTitle('')
      await invalidateSubtasks()
    },
  })

  const deleteSubtask = useMutation({
    mutationFn: (id: string) => api(`/tasks/${id}`, { method: 'DELETE' }),
    onSuccess: invalidateSubtasks,
  })

  // Single-owner assignment for a subtask row: clear existing then set the pick.
  const setAssignee = useMutation({
    mutationFn: async ({ subtask, userId }: { subtask: Subtask; userId: string | null }) => {
      for (const a of subtask.assignees ?? []) {
        await api(`/tasks/${subtask.id}/assignees/${a.userId}`, { method: 'DELETE' })
      }
      if (userId) {
        await api(`/tasks/${subtask.id}/assignees`, { method: 'POST', body: { userId } })
      }
    },
    onSuccess: invalidateSubtasks,
  })

  const setDueDate = useMutation({
    mutationFn: ({ id, dueDate }: { id: string; dueDate: string | null }) =>
      api(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ dueDate }) }),
    onSuccess: invalidateSubtasks,
  })

  return (
    <div className="space-y-2">
      {subtasks.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {doneCount}/{subtasks.length}
          </span>
          <span>{t('taskDetail.subtasksDone')}</span>
          <div className="ml-auto h-1.5 w-24 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${donePct}%` }}
            />
          </div>
        </div>
      )}
      {subtasks.length === 0 ? (
        <EmptyState title={t('taskDetail.noSubtasks')} hint={t('taskDetail.noSubtasksHint')} />
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {subtasks.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-2 px-3 py-2 hover:bg-muted/40 transition-colors"
            >
              <input
                type="checkbox"
                checked={s.status === 'done'}
                onChange={(e) => toggleDone.mutate({ id: s.id, done: e.target.checked })}
                className="h-4 w-4 rounded border-border"
              />
              {editingSubtaskId === s.id ? (
                <div className="flex-1 flex items-center gap-2">
                  <Input
                    value={editingSubtaskTitle}
                    onChange={(e) => setEditingSubtaskTitle(e.target.value)}
                    className="h-8"
                  />
                  <Button
                    size="sm"
                    onClick={() => renameSubtask.mutate({ id: s.id, nextTitle: editingSubtaskTitle.trim() })}
                    disabled={!editingSubtaskTitle.trim() || renameSubtask.isPending}
                  >
                    {t('common.save')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingSubtaskId(null)}>
                    {t('common.cancel')}
                  </Button>
                </div>
              ) : (
                <span
                  className={cn(
                    'flex-1 text-sm truncate',
                    s.status === 'done' && 'line-through text-muted-foreground',
                  )}
                >
                  {s.title}
                </span>
              )}
              <Badge variant="outline" className={cn('capitalize text-xs', priorityColor(s.priority))}>
                {t(PRIORITY_LABEL_KEYS[s.priority])}
              </Badge>
              {editingSubtaskId !== s.id && workspaceId && (
                <select
                  className="h-7 max-w-[120px] rounded border border-border bg-background px-1 text-[11px]"
                  value={s.assignees?.[0]?.userId ?? ''}
                  onChange={(e) => setAssignee.mutate({ subtask: s, userId: e.target.value || null })}
                  title={t('taskDetail.assigneeTitle')}
                >
                  <option value="">{t('taskDetail.unassigned')}</option>
                  {(membersQuery.data ?? []).map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.displayName || m.email}
                    </option>
                  ))}
                </select>
              )}
              {editingSubtaskId !== s.id && (
                <input
                  type="date"
                  className="h-7 rounded border border-border bg-background px-1 text-[11px] text-muted-foreground"
                  value={s.dueDate ? s.dueDate.slice(0, 10) : ''}
                  onChange={(e) => setDueDate.mutate({ id: s.id, dueDate: e.target.value || null })}
                  title={t('taskDetail.dueDateTitle')}
                />
              )}
              {editingSubtaskId !== s.id && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setEditingSubtaskId(s.id)
                    setEditingSubtaskTitle(s.title)
                  }}
                >
                  {t('taskDetail.edit')}
                </button>
              )}
              <button
                type="button"
                className="text-xs text-rose-500 hover:text-rose-600"
                onClick={() => deleteSubtask.mutate(s.id)}
              >
                {t('common.delete')}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="flex gap-2 pt-1"
        onSubmit={(e) => {
          e.preventDefault()
          if (title.trim()) create.mutate()
        }}
      >
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('taskDetail.addSubtaskPlaceholder')}
        />
        <Button type="submit" disabled={!title.trim() || create.isPending} size="sm">
          {t('taskDetail.add')}
        </Button>
      </form>
      {create.isError ? (
        <NotWiredNote>
          {t('taskDetail.couldNotCreateSubtask')}
        </NotWiredNote>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Checklists
// ---------------------------------------------------------------------------

function ChecklistsPanel({
  taskId,
  checklists,
}: {
  taskId: string
  checklists: Checklist[]
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [itemText, setItemText] = useState('')
  const [itemDueDate, setItemDueDate] = useState('')
  const [editingChecklistId, setEditingChecklistId] = useState<string | null>(null)
  const [editingChecklistTitle, setEditingChecklistTitle] = useState('')
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingItemContent, setEditingItemContent] = useState('')
  const firstChecklist = useMemo(() => checklists[0] ?? null, [checklists])

  const createChecklist = useMutation({
    mutationFn: async () => {
      if (firstChecklist) return firstChecklist
      return api<{ id: string }>(`/tasks/${taskId}/checklists`, {
        method: 'POST',
        body: JSON.stringify({ title: 'Checklist' }),
      })
    },
  })

  const addItem = useMutation({
    mutationFn: async () => {
      const checklist = firstChecklist ?? (await createChecklist.mutateAsync())
      return api(`/tasks/${taskId}/checklists/${checklist.id}/items`, {
        method: 'POST',
        body: JSON.stringify({ content: itemText, dueDate: itemDueDate || null }),
      })
    },
    onSuccess: async () => {
      setItemText('')
      setItemDueDate('')
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })

  const renameChecklist = useMutation({
    mutationFn: ({ checklistId, title }: { checklistId: string; title: string }) =>
      api(`/tasks/${taskId}/checklists/${checklistId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title }),
      }),
    onSuccess: async () => {
      setEditingChecklistId(null)
      setEditingChecklistTitle('')
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })

  const deleteChecklist = useMutation({
    mutationFn: (checklistId: string) => api(`/tasks/${taskId}/checklists/${checklistId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })

  const toggleItem = useMutation({
    mutationFn: ({ itemId, isDone }: { itemId: string; isDone: boolean }) =>
      api(`/tasks/${taskId}/checklists/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ isDone }),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })
  const updateItemMeta = useMutation({
    mutationFn: ({ itemId, dueDate }: { itemId: string; dueDate: string | null }) =>
      api(`/tasks/${taskId}/checklists/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ dueDate }),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })

  const deleteItem = useMutation({
    mutationFn: (itemId: string) => api(`/tasks/${taskId}/checklists/items/${itemId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })

  const editItem = useMutation({
    mutationFn: ({ itemId, content }: { itemId: string; content: string }) =>
      api(`/tasks/${taskId}/checklists/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      }),
    onSuccess: async () => {
      setEditingItemId(null)
      setEditingItemContent('')
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })

  return (
    <div className="space-y-3">
      {checklists.length === 0 ? (
        <EmptyState title={t('taskDetail.noChecklists')} hint={t('taskDetail.noChecklistsHint')} />
      ) : (
        checklists.map((cl) => (
          <div key={cl.id} className="rounded-md border border-border">
            <div className="border-b border-border px-3 py-2 flex items-center gap-2">
              {editingChecklistId === cl.id ? (
                <>
                  <Input
                    value={editingChecklistTitle}
                    onChange={(e) => setEditingChecklistTitle(e.target.value)}
                    className="h-8"
                  />
                  <Button
                    size="sm"
                    onClick={() => renameChecklist.mutate({ checklistId: cl.id, title: editingChecklistTitle.trim() })}
                    disabled={!editingChecklistTitle.trim() || renameChecklist.isPending}
                  >
                    {t('common.save')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingChecklistId(null)}>
                    {t('common.cancel')}
                  </Button>
                </>
              ) : (
                <>
                  <div className="text-sm font-medium flex-1">{cl.title}</div>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setEditingChecklistId(cl.id)
                      setEditingChecklistTitle(cl.title)
                    }}
                  >
                    {t('taskDetail.rename')}
                  </button>
                  <button
                    type="button"
                    className="text-xs text-rose-500 hover:text-rose-600"
                    onClick={() => deleteChecklist.mutate(cl.id)}
                  >
                    {t('common.delete')}
                  </button>
                </>
              )}
            </div>
            <ul className="divide-y divide-border">
              {cl.items.length === 0 ? (
                <li className="px-3 py-2 text-xs text-muted-foreground">{t('taskDetail.noItems')}</li>
              ) : (
                cl.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-muted/40"
                  >
                    <input
                      type="checkbox"
                      checked={item.isDone}
                      onChange={(e) =>
                        toggleItem.mutate({ itemId: item.id, isDone: e.target.checked })
                      }
                      className="h-4 w-4 rounded border-border"
                    />
                    {editingItemId === item.id ? (
                      <div className="flex-1 flex items-center gap-2">
                        <Input
                          value={editingItemContent}
                          onChange={(e) => setEditingItemContent(e.target.value)}
                          className="h-8"
                        />
                        <Button
                          size="sm"
                          onClick={() => editItem.mutate({ itemId: item.id, content: editingItemContent.trim() })}
                          disabled={!editingItemContent.trim() || editItem.isPending}
                        >
                          {t('common.save')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingItemId(null)}
                        >
                          {t('common.cancel')}
                        </Button>
                      </div>
                    ) : (
                      <span
                        className={cn(
                          'text-sm flex-1',
                          item.isDone && 'line-through text-muted-foreground',
                        )}
                      >
                        {item.content}
                      </span>
                    )}
                    {editingItemId !== item.id && (
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setEditingItemId(item.id)
                          setEditingItemContent(item.content)
                        }}
                      >
                        {t('taskDetail.edit')}
                      </button>
                    )}
                    <Input
                      type="date"
                      value={item.dueDate ? item.dueDate.slice(0, 10) : ''}
                      onChange={(e) => updateItemMeta.mutate({ itemId: item.id, dueDate: e.target.value || null })}
                      className="h-7 w-[145px]"
                    />
                    <button
                      type="button"
                      className="text-xs text-rose-500 hover:text-rose-600"
                      onClick={() => deleteItem.mutate(item.id)}
                    >
                      {t('common.delete')}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        ))
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (itemText.trim()) addItem.mutate()
        }}
      >
        <Input
          value={itemText}
          onChange={(e) => setItemText(e.target.value)}
          placeholder={t('taskDetail.addChecklistItemPlaceholder')}
        />
        <Input
          type="date"
          value={itemDueDate}
          onChange={(e) => setItemDueDate(e.target.value)}
          className="w-[155px]"
        />
        <Button type="submit" disabled={!itemText.trim() || addItem.isPending} size="sm">
          {t('taskDetail.add')}
        </Button>
      </form>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Watchers
// ---------------------------------------------------------------------------

function WatchersPanel({
  taskId,
  workspaceId,
  inline,
}: {
  taskId: string
  workspaceId?: string
  inline: Watcher[]
}) {
  const { t, tCount } = useTranslation()
  const qc = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const [selectedUserId, setSelectedUserId] = useState('')
  const membersQuery = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => api<WorkspaceMemberLite[]>(`/workspaces/${workspaceId}/members`),
    enabled: !!workspaceId,
  })
  const isWatching = useMemo(
    () => (currentUser ? inline.some((w) => w.userId === currentUser.id) : false),
    [inline, currentUser],
  )
  const watcherIds = useMemo(() => new Set(inline.map((w) => w.userId)), [inline])
  const addableMembers = useMemo(
    () => (membersQuery.data ?? []).filter((m) => !watcherIds.has(m.userId)),
    [membersQuery.data, watcherIds],
  )

  const toggle = useMutation({
    mutationFn: async () => {
      if (!currentUser) return
      if (isWatching) {
        return api(`/tasks/${taskId}/watchers/${currentUser.id}`, { method: 'DELETE' })
      }
      return api(`/tasks/${taskId}/watchers`, {
        method: 'POST',
        body: JSON.stringify({ userId: currentUser.id }),
      })
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })
  const addWatcher = useMutation({
    mutationFn: (userId: string) =>
      api(`/tasks/${taskId}/watchers`, {
        method: 'POST',
        body: JSON.stringify({ userId }),
      }),
    onSuccess: async () => {
      setSelectedUserId('')
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })
  const removeWatcher = useMutation({
    mutationFn: (userId: string) => api(`/tasks/${taskId}/watchers/${userId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {tCount('taskDetail.watchersCount', inline.length)}
        </p>
        <Button
          size="sm"
          variant={isWatching ? 'outline' : 'default'}
          onClick={() => toggle.mutate()}
          disabled={!currentUser || toggle.isPending}
        >
          {isWatching ? t('taskDetail.unwatch') : t('taskDetail.watchTask')}
        </Button>
      </div>
      {workspaceId && (
        <div className="flex items-center gap-2 rounded-md border border-border p-2">
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="">{t('taskDetail.addWatcherOption')}</option>
            {addableMembers.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.displayName || member.email}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            onClick={() => addWatcher.mutate(selectedUserId)}
            disabled={!selectedUserId || addWatcher.isPending}
          >
            {t('taskDetail.add')}
          </Button>
        </div>
      )}

      {inline.length === 0 ? (
        <EmptyState title={t('taskDetail.noWatchers')} hint={t('taskDetail.noWatchersHint')} />
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {inline.map((w) => (
            <li key={w.userId} className="flex items-center gap-3 px-3 py-2">
              <div className="h-7 w-7 rounded-full bg-brand-100 text-foreground flex items-center justify-center text-xs font-medium">
                {(w.user?.displayName ?? w.user?.email ?? '?').slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-sm truncate">
                  {w.user?.displayName ?? w.user?.email ?? w.userId}
                </div>
                {w.user?.email ? (
                  <div className="text-xs text-muted-foreground truncate">{w.user.email}</div>
                ) : null}
              </div>
              <button
                type="button"
                className="text-xs text-rose-500 hover:text-rose-600"
                onClick={() => removeWatcher.mutate(w.userId)}
              >
                {t('taskDetail.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

function DependenciesPanel({
  taskId,
  workspaceId,
  inline,
  onOpenTask,
}: {
  taskId: string
  workspaceId?: string
  inline: Dependency[]
  onOpenTask: (relatedTaskId: string) => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [relatedId, setRelatedId] = useState('')
  const [type, setType] = useState<'blocks' | 'blocked_by' | 'related_to'>('blocks')
  const [taskSearch, setTaskSearch] = useState('')
  const tasksQuery = useQuery({
    queryKey: ['dependency-task-picker', workspaceId],
    queryFn: () =>
      api<Array<{ id: string; title: string; listName?: string; projectName?: string }>>(
        `/tasks/workspace/${workspaceId}?limit=1000`,
      ),
    enabled: !!workspaceId,
  })
  const graphQuery = useQuery({
    queryKey: ['task', taskId, 'dependency-graph'],
    queryFn: () =>
      api<{
        rootTaskId: string
        nodes: Array<{
          id: string
          title: string
          status: TaskStatus
          priority: TaskPriority
          isArchived: boolean
        }>
        edges: Array<{
          taskId: string
          relatedTaskId: string
          type: 'blocks' | 'blocked_by' | 'related_to'
        }>
        metrics: {
          nodeCount: number
          edgeCount: number
          blockedByOpenCount: number
          blocksOpenCount: number
          longestBlockedByChainDepth: number
          longestBlocksChainDepth: number
        }
      }>(`/tasks/${taskId}/dependencies/graph?depth=3`),
  })
  const graphModel = useMemo(() => {
    if (!graphQuery.data) return null
    const byId = new Map(graphQuery.data.nodes.map((node) => [node.id, node]))
    const upstream = new Set<string>()
    const downstream = new Set<string>()
    const relatedIds = new Set<string>()
    for (const edge of graphQuery.data.edges) {
      if (edge.type === 'related_to') {
        if (edge.taskId === taskId) relatedIds.add(edge.relatedTaskId)
        if (edge.relatedTaskId === taskId) relatedIds.add(edge.taskId)
        continue
      }
      const blocker = edge.type === 'blocks' ? edge.taskId : edge.relatedTaskId
      const blocked = edge.type === 'blocks' ? edge.relatedTaskId : edge.taskId
      if (blocked === taskId) upstream.add(blocker)
      if (blocker === taskId) downstream.add(blocked)
    }
    return {
      byId,
      upstream: [...upstream].map((id) => byId.get(id)).filter(Boolean),
      downstream: [...downstream].map((id) => byId.get(id)).filter(Boolean),
      related: [...relatedIds].map((id) => byId.get(id)).filter(Boolean),
      edges: graphQuery.data.edges,
    }
  }, [graphQuery.data, taskId])
  const taskOptions = useMemo<TaskPickerItem[]>(
    () => (tasksQuery.data ?? []).filter((task) => task.id !== taskId),
    [tasksQuery.data, taskId],
  )
  const filteredTaskOptions = useMemo(() => {
    const q = taskSearch.trim().toLowerCase()
    if (!q) return taskOptions
    return taskOptions.filter(
      (task) =>
        task.title.toLowerCase().includes(q) ||
        task.projectName?.toLowerCase().includes(q) ||
        task.listName?.toLowerCase().includes(q),
    )
  }, [taskOptions, taskSearch])

  const add = useMutation({
    mutationFn: () =>
      api(`/tasks/${taskId}/dependencies`, {
        method: 'POST',
        body: JSON.stringify({ relatedTaskId: relatedId, type }),
      }),
    onSuccess: async () => {
      setRelatedId('')
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })

  const remove = useMutation({
    mutationFn: (depId: string) =>
      api(`/tasks/${taskId}/dependencies/${depId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })

  const blocking = inline.filter((d) => d.dep.type === 'blocks')
  const waitingOn = inline.filter((d) => d.dep.type === 'blocked_by')
  const related = inline.filter((d) => d.dep.type === 'related_to')

  return (
    <div className="space-y-4">
      <DepGroup label={t('taskDetail.dependencies.blocking')} items={blocking} onRemove={(id) => remove.mutate(id)} onOpenTask={onOpenTask} />
      <DepGroup label={t('taskDetail.dependencies.waitingOn')} items={waitingOn} onRemove={(id) => remove.mutate(id)} onOpenTask={onOpenTask} />
      {related.length > 0 ? (
        <DepGroup label={t('taskDetail.dependencies.related')} items={related} onRemove={(id) => remove.mutate(id)} onOpenTask={onOpenTask} />
      ) : null}
      {graphQuery.data ? (
        <div className="rounded-md border border-border bg-card p-3 space-y-3">
          <div className="text-xs font-medium text-muted-foreground mb-2">{t('taskDetail.graphInsights')}</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
            <div>{t('taskDetail.graphNodes')} <span className="font-medium text-foreground">{graphQuery.data.metrics.nodeCount}</span></div>
            <div>{t('taskDetail.graphEdges')} <span className="font-medium text-foreground">{graphQuery.data.metrics.edgeCount}</span></div>
            <div>{t('taskDetail.graphOpenBlockers')} <span className="font-medium text-foreground">{graphQuery.data.metrics.blockedByOpenCount}</span></div>
            <div>{t('taskDetail.graphBlockingOpen')} <span className="font-medium text-foreground">{graphQuery.data.metrics.blocksOpenCount}</span></div>
            <div>{t('taskDetail.graphUpstreamDepth')} <span className="font-medium text-foreground">{graphQuery.data.metrics.longestBlockedByChainDepth}</span></div>
            <div>{t('taskDetail.graphDownstreamDepth')} <span className="font-medium text-foreground">{graphQuery.data.metrics.longestBlocksChainDepth}</span></div>
          </div>
          {graphModel ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <GraphColumn
                title={t('taskDetail.graphBlockingThis')}
                hint={t('taskDetail.graphUpstreamHint')}
                nodes={graphModel.upstream}
                onOpenTask={onOpenTask}
              />
              <div className="rounded-md border border-border/70 bg-muted/20 p-2">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{t('taskDetail.currentTask')}</div>
                <div className="text-sm font-medium">{taskId}</div>
              </div>
              <GraphColumn
                title={t('taskDetail.graphBlockedByThis')}
                hint={t('taskDetail.graphDownstreamHint')}
                nodes={graphModel.downstream}
                onOpenTask={onOpenTask}
              />
              {graphModel.related.length > 0 ? (
                <div className="md:col-span-3">
                  <GraphColumn
                    title={t('taskDetail.graphRelatedLinks')}
                    hint={t('taskDetail.graphRelatedHint')}
                    nodes={graphModel.related}
                    onOpenTask={onOpenTask}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <form
        className="flex gap-2 pt-1 border-t border-border pt-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (relatedId.trim()) add.mutate()
        }}
      >
        <select
          value={type}
          onChange={(e) => setType(e.target.value as typeof type)}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="blocks">{t('taskDetail.depOption.blocks')}</option>
          <option value="blocked_by">{t('taskDetail.depOption.blockedBy')}</option>
          <option value="related_to">{t('taskDetail.depOption.relatedTo')}</option>
        </select>
        <Input
          value={relatedId}
          onChange={(e) => setRelatedId(e.target.value)}
          placeholder={t('taskDetail.relatedTaskIdPlaceholder')}
        />
        {workspaceId && taskOptions.length > 0 && (
          <div className="min-w-[260px] space-y-1">
            <Input
              value={taskSearch}
              onChange={(e) => setTaskSearch(e.target.value)}
              placeholder={t('taskDetail.searchTaskPlaceholder')}
              className="h-8"
            />
            <select
              value={relatedId}
              onChange={(e) => setRelatedId(e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-2 text-sm w-full"
            >
              <option value="">{t('taskDetail.pickTaskOption')}</option>
              {filteredTaskOptions.slice(0, 200).map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title} {task.projectName ? `(${task.projectName})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}
        <Button type="submit" size="sm" disabled={!relatedId.trim() || add.isPending}>
          {t('taskDetail.add')}
        </Button>
      </form>
    </div>
  )
}

function GraphColumn({
  title,
  hint,
  nodes,
  onOpenTask,
}: {
  title: string
  hint: string
  nodes: Array<{
    id: string
    title: string
    status: TaskStatus
    priority: TaskPriority
    isArchived: boolean
  } | undefined>
  onOpenTask: (relatedTaskId: string) => void
}) {
  const { t } = useTranslation()
  const items = nodes.filter((node): node is NonNullable<typeof node> => Boolean(node))
  return (
    <div className="rounded-md border border-border/70 bg-muted/20 p-2">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="text-[11px] text-muted-foreground mb-2">{hint}</div>
      {items.length === 0 ? (
        <div className="text-xs text-muted-foreground">{t('taskDetail.none')}</div>
      ) : (
        <div className="space-y-1.5">
          {items.map((node) => (
            <button
              key={node.id}
              type="button"
              onClick={() => onOpenTask(node.id)}
              className="w-full text-left rounded border border-border bg-card px-2 py-1.5 hover:border-accent/40"
            >
              <div className="text-xs font-medium truncate">{node.title}</div>
              <div className="text-[11px] text-muted-foreground truncate">
                {STATUS_LABEL_KEYS[node.status] ? t(STATUS_LABEL_KEYS[node.status]) : node.status} · {PRIORITY_LABEL_KEYS[node.priority] ? t(PRIORITY_LABEL_KEYS[node.priority]) : node.priority}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function DepGroup({
  label,
  items,
  onRemove,
  onOpenTask,
}: {
  label: string
  items: Dependency[]
  onRemove: (depId: string) => void
  onOpenTask?: (relatedTaskId: string) => void
}) {
  const { t } = useTranslation()
  return (
    <section>
      <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{label}</h4>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('taskDetail.none')}</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {items.map((d) => (
            <li key={d.dep.id} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/40">
              <span className="flex-1 text-sm truncate">{d.related.title}</span>
              <Badge variant="outline" className={cn('capitalize text-xs', priorityColor(d.related.priority))}>
                {PRIORITY_LABEL_KEYS[d.related.priority] ? t(PRIORITY_LABEL_KEYS[d.related.priority]) : d.related.priority}
              </Badge>
              <Badge variant="secondary" className="capitalize">
                {STATUS_LABEL_KEYS[d.related.status] ? t(STATUS_LABEL_KEYS[d.related.status]) : d.related.status.replace('_', ' ')}
              </Badge>
              {onOpenTask && (
                <button
                  type="button"
                  onClick={() => onOpenTask(d.related.id)}
                  className="text-xs text-accent hover:underline"
                >
                  {t('taskDetail.open')}
                </button>
              )}
              <button
                type="button"
                onClick={() => onRemove(d.dep.id)}
                className="text-xs text-muted-foreground hover:text-destructive"
              >
                {t('taskDetail.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

function AttachmentsPanel({
  taskId,
  inline,
}: {
  taskId: string
  inline: Attachment[]
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [linkUrl, setLinkUrl] = useState('')
  const [fileName, setFileName] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  // Probe the dedicated endpoint; fall back to inline list if 404.
  const probe = useQuery({
    queryKey: ['task', taskId, 'attachments'],
    queryFn: async () => {
      try {
        return await api<Attachment[]>(`/tasks/${taskId}/attachments`)
      } catch (err) {
        if (isNotWired(err)) return null
        throw err
      }
    },
  })

  const attachments = probe.data ?? inline
  const uploadWired = probe.data !== null && probe.data !== undefined
  const addAttachment = useMutation({
    mutationFn: () =>
      api(`/tasks/${taskId}/attachments`, {
        method: 'POST',
        body: JSON.stringify({
          fileName: fileName.trim() || linkUrl.trim().split('/').pop() || 'Attachment',
          url: linkUrl.trim(),
          contentType: 'text/url',
          sizeBytes: 0,
        }),
      }),
    onSuccess: async () => {
      setLinkUrl('')
      setFileName('')
      await qc.invalidateQueries({ queryKey: ['task', taskId, 'attachments'] })
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
      await qc.invalidateQueries({ queryKey: ['task', taskId, 'activity'] })
    },
  })
  const uploadAttachment = useMutation({
    mutationFn: async () => {
      if (!selectedFile) return
      if (selectedFile.size > MAX_ATTACHMENT_BYTES) {
        throw new Error(t('taskDetail.fileTooLarge', { limit: MAX_ATTACHMENT_BYTES / (1024 * 1024) }))
      }
      const presign = await api<{ uploadUrl: string; storageKey: string }>(`/tasks/${taskId}/attachments/presign`, {
        method: 'POST',
        body: {
          fileName: selectedFile.name,
          contentType: selectedFile.type || 'application/octet-stream',
          sizeBytes: selectedFile.size,
        },
      })
      const putRes = await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': selectedFile.type || 'application/octet-stream' },
        body: selectedFile,
      })
      // Reject when the storage PUT is blocked/failed so we never record a phantom attachment.
      if (!putRes.ok) throw new Error(t('taskDetail.uploadFailedStatus', { status: putRes.status }))
      await api(`/tasks/${taskId}/attachments`, {
        method: 'POST',
        body: {
          fileName: selectedFile.name,
          storageKey: presign.storageKey,
          contentType: selectedFile.type || 'application/octet-stream',
          sizeBytes: selectedFile.size,
        },
      })
    },
    onSuccess: async () => {
      setSelectedFile(null)
      await qc.invalidateQueries({ queryKey: ['task', taskId, 'attachments'] })
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
      await qc.invalidateQueries({ queryKey: ['task', taskId, 'activity'] })
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : err instanceof Error ? err.message : t('taskDetail.couldNotUpload'))
    },
  })
  const removeAttachment = useMutation({
    mutationFn: (attachmentId: string) => api(`/tasks/${taskId}/attachments/${attachmentId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task', taskId, 'attachments'] })
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
      await qc.invalidateQueries({ queryKey: ['task', taskId, 'activity'] })
    },
  })

  return (
    <div className="space-y-3">
      <div
        className={cn(
          'rounded-md border-2 border-dashed border-border bg-muted/20 px-4 py-8 text-center',
          'text-sm text-muted-foreground',
        )}
      >
        {t('taskDetail.dragDrop')}
        {!uploadWired ? (
          <div className="mt-2 text-xs">{t('taskDetail.uploadsUnavailable')}</div>
        ) : null}
      </div>
      {uploadWired && (
        <div className="rounded-md border border-border bg-card p-3 space-y-2">
          <div className="text-xs font-medium text-muted-foreground">{t('taskDetail.uploadFile')}</div>
          <div className="flex flex-col md:flex-row gap-2 md:items-center">
            <Input
              type="file"
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
              className="h-8"
            />
            <Button
              size="sm"
              onClick={() => uploadAttachment.mutate()}
              disabled={!selectedFile || uploadAttachment.isPending}
            >
              {t('taskDetail.upload')}
            </Button>
          </div>
          <div className="text-xs font-medium text-muted-foreground">{t('taskDetail.attachByLink')}</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <Input
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder={t('taskDetail.fileNamePlaceholder')}
              className="h-8"
            />
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://..."
              className="h-8 md:col-span-2"
            />
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={() => addAttachment.mutate()} disabled={!linkUrl.trim() || addAttachment.isPending}>
              {t('taskDetail.addAttachment')}
            </Button>
          </div>
        </div>
      )}

      {attachments.length === 0 ? (
        <EmptyState title={t('taskDetail.noFiles')} hint={t('taskDetail.noFilesHint')} />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-3 rounded-md border border-border p-3 hover:bg-muted/40 transition-colors"
            >
              {a.mimeType?.startsWith('image/') && a.url ? (
                <a href={a.url} target="_blank" rel="noreferrer" className="shrink-0">
                  <img
                    src={a.url}
                    alt={a.fileName}
                    loading="lazy"
                    className="h-10 w-10 rounded object-cover border border-border"
                  />
                </a>
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded bg-brand-100 text-foreground text-xs font-medium">
                  {(a.mimeType ?? a.fileName.split('.').pop() ?? 'FILE').slice(0, 4).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{a.fileName}</div>
                <div className="text-xs text-muted-foreground">
                  {formatBytes(a.fileSize)}
                  {a.uploadedBy ? ` · ${a.uploadedBy}` : ''}
                </div>
              </div>
              {a.url ? (
                <a href={a.url} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline">
                  {t('taskDetail.open')}
                </a>
              ) : null}
              {uploadWired && (
                <button
                  type="button"
                  className="text-xs text-rose-500 hover:text-rose-600"
                  onClick={() => removeAttachment.mutate(a.id)}
                >
                  {t('taskDetail.remove')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

function CommentAttachments({
  files,
}: {
  files?: Array<{ id: string; fileName: string; fileSize?: number | null; mimeType?: string | null; url?: string | null }>
}) {
  if (!files || files.length === 0) return null
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {files.map((f) =>
        f.mimeType?.startsWith('image/') && f.url ? (
          <a key={f.id} href={f.url} target="_blank" rel="noreferrer" title={f.fileName}>
            <img
              src={f.url}
              alt={f.fileName}
              loading="lazy"
              className="h-16 w-16 rounded-md object-cover border border-border"
            />
          </a>
        ) : (
          <a
            key={f.id}
            href={f.url ?? '#'}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1 text-xs hover:bg-muted/60"
          >
            <Paperclip className="h-3 w-3 text-muted-foreground" />
            <span className="max-w-[160px] truncate">{f.fileName}</span>
          </a>
        ),
      )}
    </div>
  )
}

function CommentsPanel({ taskId, workspaceId }: { taskId: string; workspaceId?: string }) {
  const { t, tCount } = useTranslation()
  const qc = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const [text, setText] = useState('')
  const [commentFiles, setCommentFiles] = useState<File[]>([])
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editingBody, setEditingBody] = useState('')
  const [selectedMentionUserIds, setSelectedMentionUserIds] = useState<string[]>([])
  const [mentionTab, setMentionTab] = useState<'people' | 'tasks' | 'docs'>('people')
  const [mentionIndex, setMentionIndex] = useState(0)
  const mentionQuery = text.slice(text.lastIndexOf('@') + 1).toLowerCase()
  const membersQuery = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => api<WorkspaceMemberLite[]>(`/workspaces/${workspaceId}/members`),
    enabled: !!workspaceId,
  })
  const mentionTasksQuery = useQuery({
    queryKey: ['mention-tasks', workspaceId],
    queryFn: () => api<MentionTaskLite[]>(`/tasks/workspace/${workspaceId}?limit=200`),
    enabled: !!workspaceId && mentionTab === 'tasks',
  })
  const mentionDocsQuery = useQuery({
    queryKey: ['mention-docs', workspaceId],
    queryFn: () => api<MentionDocLite[]>(`/workspaces/${workspaceId}/docs`),
    enabled: !!workspaceId && mentionTab === 'docs',
  })
  const mentionCandidates = (membersQuery.data ?? []).filter((m) =>
    (m.displayName || m.email).toLowerCase().includes(mentionQuery),
  )
  const taskMentionCandidates = (mentionTasksQuery.data ?? []).filter((task) =>
    `${task.title} ${task.projectName ?? ''} ${task.listName ?? ''}`.toLowerCase().includes(mentionQuery),
  )
  const docMentionCandidates = (mentionDocsQuery.data ?? []).filter((d) =>
    d.title.toLowerCase().includes(mentionQuery),
  )
  const showMentions = text.includes('@') && text[text.length - 1] !== ' '
  const namesById = useMemo(
    () => Object.fromEntries((membersQuery.data ?? []).map((m) => [m.userId, m.displayName || m.email])),
    [membersQuery.data],
  )
  // A workspace admin/manager (or super_admin) may delete anyone's comment (Plan §4).
  const canModerate = useMemo(() => {
    if (currentUser?.role === 'super_admin') return true
    const mine = (membersQuery.data ?? []).find((m) => m.userId === currentUser?.id)
    return mine?.role === 'workspace_admin' || mine?.role === 'manager' || mine?.role === 'super_admin'
  }, [membersQuery.data, currentUser?.id, currentUser?.role])
  const isAuthor = (c: { author?: UserLite | null }) => !!currentUser && c.author?.id === currentUser.id
  const canDelete = (c: { author?: UserLite | null }) => isAuthor(c) || canModerate

  const commentsQuery = useQuery({
    queryKey: ['task', taskId, 'comments'],
    queryFn: async () => {
      try {
        return await api<TaskComment[]>(`/tasks/${taskId}/comments`)
      } catch (err) {
        if (isNotWired(err)) return null
        throw err
      }
    },
  })

  const create = useMutation({
    mutationFn: async () => {
      // Upload any attached files first, then post the comment referencing them.
      const attachmentIds: string[] = []
      for (const file of commentFiles) {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          throw new Error(t('taskDetail.fileExceedsLimit', { name: file.name, limit: MAX_ATTACHMENT_BYTES / (1024 * 1024) }))
        }
        const presign = await api<{ uploadUrl: string; storageKey: string }>(`/tasks/${taskId}/attachments/presign`, {
          method: 'POST',
          body: { fileName: file.name, contentType: file.type || 'application/octet-stream', sizeBytes: file.size },
        })
        const putRes = await fetch(presign.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: file,
        })
        if (!putRes.ok) throw new Error(t('taskDetail.uploadFailedFor', { name: file.name, status: putRes.status }))
        const rec = await api<{ id: string }>(`/tasks/${taskId}/attachments`, {
          method: 'POST',
          body: { fileName: file.name, storageKey: presign.storageKey, contentType: file.type || 'application/octet-stream', sizeBytes: file.size },
        })
        attachmentIds.push(rec.id)
      }
      return api(`/tasks/${taskId}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          body: text,
          parentCommentId: replyTo ?? undefined,
          mentions: selectedMentionUserIds.map((userId) => ({ userId, offset: 0, length: 0 })),
          attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
        }),
      })
    },
    onSuccess: async () => {
      setText('')
      setCommentFiles([])
      setReplyTo(null)
      setSelectedMentionUserIds([])
      await qc.invalidateQueries({ queryKey: ['task', taskId, 'comments'] })
      await qc.invalidateQueries({ queryKey: ['task', taskId, 'attachments'] })
      await qc.invalidateQueries({ queryKey: ['task', taskId, 'activity'] })
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : err instanceof Error ? err.message : t('taskDetail.couldNotPostComment'))
    },
  })
  const update = useMutation({
    mutationFn: ({ commentId, body }: { commentId: string; body: string }) =>
      api(`/tasks/${taskId}/comments/${commentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ body }),
      }),
    onSuccess: async () => {
      setEditingCommentId(null)
      setEditingBody('')
      await qc.invalidateQueries({ queryKey: ['task', taskId, 'comments'] })
    },
  })
  const remove = useMutation({
    mutationFn: (commentId: string) => api(`/tasks/${taskId}/comments/${commentId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task', taskId, 'comments'] })
    },
  })

  const react = useMutation({
    mutationFn: ({ commentId, emoji }: { commentId: string; emoji: string }) =>
      api(`/tasks/${taskId}/comments/${commentId}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task', taskId, 'comments'] })
    },
  })
  const assign = useMutation({
    mutationFn: ({ commentId, userId }: { commentId: string; userId: string | null }) =>
      api(`/tasks/${taskId}/comments/${commentId}/assign`, {
        method: 'POST',
        body: JSON.stringify({ userId }),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task', taskId, 'comments'] })
    },
  })
  const resolveComment = useMutation({
    mutationFn: ({ commentId, resolved }: { commentId: string; resolved: boolean }) =>
      api(`/tasks/${taskId}/comments/${commentId}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ resolved }),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task', taskId, 'comments'] })
    },
  })

  if (commentsQuery.data === null) {
    return <NotWiredNote>{t('taskDetail.commentsUnavailable')}</NotWiredNote>
  }

  const comments = commentsQuery.data ?? []
  const roots = comments.filter((c) => !c.parentCommentId)
  const repliesByParent = comments.reduce((acc, comment) => {
    if (!comment.parentCommentId) return acc
    const arr = acc.get(comment.parentCommentId) ?? []
    arr.push(comment)
    acc.set(comment.parentCommentId, arr)
    return acc
  }, new Map<string, TaskComment[]>())
  const parentPreview = replyTo ? comments.find((c) => c.id === replyTo) ?? null : null
  const activeMention = mentionCandidates[mentionIndex] ?? null

  const insertMention = (member: WorkspaceMemberLite) => {
    const at = text.lastIndexOf('@')
    const prefix = at >= 0 ? text.slice(0, at) : text
    const display = member.displayName || member.email
    setText(`${prefix}@${display} `)
    setSelectedMentionUserIds((prev) => (prev.includes(member.userId) ? prev : [...prev, member.userId]))
    setMentionIndex(0)
  }
  const insertTaskMention = (task: MentionTaskLite) => {
    const at = text.lastIndexOf('@')
    const prefix = at >= 0 ? text.slice(0, at) : text
    setText(`${prefix}#${task.title} `)
    setMentionIndex(0)
  }
  const insertDocMention = (doc: MentionDocLite) => {
    const at = text.lastIndexOf('@')
    const prefix = at >= 0 ? text.slice(0, at) : text
    setText(`${prefix}Doc:${doc.title} `)
    setMentionIndex(0)
  }
  const activeCandidates =
    mentionTab === 'people'
      ? mentionCandidates
      : mentionTab === 'tasks'
        ? taskMentionCandidates
        : docMentionCandidates

  return (
    <div className="space-y-3">
      {comments.length === 0 ? (
        <EmptyState title={t('taskDetail.noComments')} hint={t('taskDetail.noCommentsHint')} />
      ) : (
        <ul className="space-y-2">
          {roots.map((c) => {
            const replies = repliesByParent.get(c.id) ?? []
            return (
              <li key={c.id} className="rounded-md border border-border p-3 hover:bg-muted/30 transition-colors space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">
                    {c.author?.displayName ?? c.author?.email ?? t('taskDetail.userFallback')}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(c.createdAt).toLocaleString()}
                  </span>
                </div>
                <MentionText text={c.body} namesById={namesById} className="mt-1 text-sm" />
                <CommentAttachments files={c.attachments} />
                <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                  {c.assignee?.displayName && (
                    <Badge variant="outline" className="text-[10px]">{t('taskDetail.assignedBadge', { name: c.assignee.displayName })}</Badge>
                  )}
                  {c.resolvedAt && (
                    <Badge variant="success" className="text-[10px]">
                      {c.resolver?.displayName ? t('taskDetail.resolvedBy', { name: c.resolver.displayName }) : t('taskDetail.resolved')}
                    </Badge>
                  )}
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setReplyTo(c.id)}
                  >
                    {t('taskDetail.reply')}
                  </button>
                  {isAuthor(c) && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setEditingCommentId(c.id)
                        setEditingBody(c.body)
                      }}
                    >
                      {t('taskDetail.edit')}
                    </button>
                  )}
                  {canDelete(c) && (
                    <button
                      type="button"
                      className="text-xs text-rose-500 hover:text-rose-600"
                      onClick={() => remove.mutate(c.id)}
                    >
                      {t('common.delete')}
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => resolveComment.mutate({ commentId: c.id, resolved: !c.resolvedAt })}
                  >
                    {c.resolvedAt ? t('taskDetail.reopen') : t('taskDetail.resolve')}
                  </button>
                  {workspaceId && (
                    <select
                      className="h-6 rounded border border-border bg-background px-1 text-[10px]"
                      value={c.assignedToUserId ?? ''}
                      onChange={(e) => assign.mutate({ commentId: c.id, userId: e.target.value || null })}
                    >
                      <option value="">{t('taskDetail.assignOption')}</option>
                      {(membersQuery.data ?? []).map((member) => (
                        <option key={member.userId} value={member.userId}>
                          {member.displayName || member.email}
                        </option>
                      ))}
                    </select>
                  )}
                  {replies.length > 0 && (
                    <span className="text-xs text-accent ml-auto">{tCount('taskDetail.repliesCount', replies.length)}</span>
                  )}
                </div>
                {editingCommentId === c.id && (
                  <div className="mt-2 space-y-2">
                    <Textarea rows={2} value={editingBody} onChange={(e) => setEditingBody(e.target.value)} />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditingCommentId(null)}>
                        {t('common.cancel')}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => update.mutate({ commentId: c.id, body: editingBody })}
                        disabled={!editingBody.trim() || update.isPending}
                      >
                        {t('common.save')}
                      </Button>
                    </div>
                  </div>
                )}
                <div className="mt-2 flex gap-1">
                  {['👍', '🎉', '❤️'].map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => react.mutate({ commentId: c.id, emoji })}
                      className="rounded border border-border px-1.5 py-0.5 text-xs hover:bg-muted"
                    >
                      {emoji}
                      {c.reactions?.filter((r) => r.emoji === emoji).length
                        ? ` ${c.reactions.filter((r) => r.emoji === emoji).length}`
                        : ''}
                    </button>
                  ))}
                </div>
                {replies.length > 0 && (
                  <ul className="mt-2 space-y-1.5 border-l border-border pl-3">
                    {replies.map((reply) => (
                      <li key={reply.id} className="rounded border border-border/70 p-2 bg-card/50">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium">
                            {reply.author?.displayName ?? reply.author?.email ?? t('taskDetail.userFallback')}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(reply.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <MentionText text={reply.body} namesById={namesById} className="mt-1 text-sm" />
                        <CommentAttachments files={reply.attachments} />
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            className="text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => setReplyTo(reply.id)}
                          >
                            {t('taskDetail.reply')}
                          </button>
                          {isAuthor(reply) && (
                            <button
                              type="button"
                              className="text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => {
                                setEditingCommentId(reply.id)
                                setEditingBody(reply.body)
                              }}
                            >
                              {t('taskDetail.edit')}
                            </button>
                          )}
                          {canDelete(reply) && (
                            <button
                              type="button"
                              className="text-xs text-rose-500 hover:text-rose-600"
                              onClick={() => remove.mutate(reply.id)}
                            >
                              {t('common.delete')}
                            </button>
                          )}
                        </div>
                        {editingCommentId === reply.id && (
                          <div className="mt-2 space-y-2">
                            <Textarea rows={2} value={editingBody} onChange={(e) => setEditingBody(e.target.value)} />
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="ghost" onClick={() => setEditingCommentId(null)}>
                                {t('common.cancel')}
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => update.mutate({ commentId: reply.id, body: editingBody })}
                                disabled={!editingBody.trim() || update.isPending}
                              >
                                {t('common.save')}
                              </Button>
                            </div>
                          </div>
                        )}
                        <div className="mt-2 flex gap-1">
                          {['👍', '🎉', '❤️'].map((emoji) => (
                            <button
                              key={`${reply.id}-${emoji}`}
                              type="button"
                              onClick={() => react.mutate({ commentId: reply.id, emoji })}
                              className="rounded border border-border px-1.5 py-0.5 text-xs hover:bg-muted"
                            >
                              {emoji}
                              {reply.reactions?.filter((r) => r.emoji === emoji).length
                                ? ` ${reply.reactions.filter((r) => r.emoji === emoji).length}`
                                : ''}
                            </button>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <div className="border-t border-border pt-3">
        {replyTo && (
          <div className="mb-2 flex items-center justify-between rounded border border-border bg-muted/30 px-2 py-1 text-xs">
            <span className="truncate">
              {t('taskDetail.replyingTo', { name: parentPreview?.author?.displayName ?? parentPreview?.author?.email ?? t('taskDetail.commentFallback') })}{' '}
              {parentPreview?.body
                ? formatMentionsPlain(parentPreview.body, namesById)
                : ''}
            </span>
            <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setReplyTo(null)}>
              {t('common.cancel')}
            </button>
          </div>
        )}
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('taskDetail.commentPlaceholder')}
          rows={3}
          onKeyDown={(e) => {
            if (!showMentions || activeCandidates.length === 0) return
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setMentionIndex((prev) => (prev + 1) % activeCandidates.length)
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setMentionIndex((prev) => (prev - 1 + activeCandidates.length) % activeCandidates.length)
            } else if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              if (mentionTab === 'people' && activeMention) insertMention(activeMention)
              if (mentionTab === 'tasks' && taskMentionCandidates[mentionIndex]) insertTaskMention(taskMentionCandidates[mentionIndex])
              if (mentionTab === 'docs' && docMentionCandidates[mentionIndex]) insertDocMention(docMentionCandidates[mentionIndex])
            } else if (e.key === 'Escape') {
              e.preventDefault()
              setText((prev) => prev.replace(/@[^ ]*$/, ''))
              setMentionIndex(0)
            }
          }}
        />
        {showMentions && mentionCandidates.length > 0 && (
          <div className="mt-2 rounded-lg border border-border bg-card shadow-lg overflow-hidden">
            <div className="px-2 pt-2 pb-1 border-b border-border/70 flex items-center gap-1">
              {([
                ['people', 'taskDetail.mentionPeople'],
                ['tasks', 'taskDetail.mentionTasks'],
                ['docs', 'taskDetail.mentionDocs'],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setMentionTab(id)
                    setMentionIndex(0)
                  }}
                  className={cn(
                    'px-2 py-1 rounded text-[11px]',
                    mentionTab === id ? 'bg-accent/15 text-foreground font-medium' : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  {t(label)}
                </button>
              ))}
            </div>
            {mentionTab === 'people' && (
              <div className="max-h-40 overflow-auto">
                {mentionCandidates.slice(0, 8).map((member, idx) => (
                  <button
                    key={member.userId}
                    type="button"
                    className={cn(
                      'w-full px-2.5 py-2 text-left text-xs flex items-center gap-2',
                      idx === mentionIndex ? 'bg-muted' : 'hover:bg-muted/70',
                    )}
                    onMouseEnter={() => setMentionIndex(idx)}
                    onClick={() => insertMention(member)}
                  >
                    <div className="h-6 w-6 rounded-full bg-brand-100 text-foreground text-[10px] font-semibold flex items-center justify-center">
                      {(member.displayName || member.email)[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-foreground truncate">{member.displayName || member.email}</div>
                      <div className="text-muted-foreground truncate">{member.email}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {mentionTab === 'tasks' && (
              <div className="max-h-40 overflow-auto">
                {taskMentionCandidates.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-muted-foreground">{t('taskDetail.noMatchingTasks')}</div>
                ) : (
                  taskMentionCandidates.slice(0, 8).map((task, idx) => (
                    <button
                      key={task.id}
                      type="button"
                      className={cn(
                        'w-full px-2.5 py-2 text-left text-xs',
                        idx === mentionIndex ? 'bg-muted' : 'hover:bg-muted/70',
                      )}
                      onMouseEnter={() => setMentionIndex(idx)}
                      onClick={() => insertTaskMention(task)}
                    >
                      <div className="font-medium text-foreground truncate">#{task.title}</div>
                      <div className="text-muted-foreground truncate">{task.projectName ?? task.listName ?? t('taskDetail.taskFallback')}</div>
                    </button>
                  ))
                )}
              </div>
            )}
            {mentionTab === 'docs' && (
              <div className="max-h-40 overflow-auto">
                {docMentionCandidates.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-muted-foreground">{t('taskDetail.noMatchingDocs')}</div>
                ) : (
                  docMentionCandidates.slice(0, 8).map((doc, idx) => (
                    <button
                      key={doc.id}
                      type="button"
                      className={cn(
                        'w-full px-2.5 py-2 text-left text-xs',
                        idx === mentionIndex ? 'bg-muted' : 'hover:bg-muted/70',
                      )}
                      onMouseEnter={() => setMentionIndex(idx)}
                      onClick={() => insertDocMention(doc)}
                    >
                      <div className="font-medium text-foreground truncate">Doc:{doc.title}</div>
                      <div className="text-muted-foreground truncate">{doc.updatedAt ? new Date(doc.updatedAt).toLocaleDateString() : t('taskDetail.documentFallback')}</div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
        {commentFiles.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {commentFiles.map((file, i) => (
              <span
                key={`${file.name}-${i}`}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs"
              >
                <Paperclip className="h-3 w-3 text-muted-foreground" />
                <span className="max-w-[140px] truncate">{file.name}</span>
                <button
                  type="button"
                  aria-label={t('taskDetail.removeFile', { name: file.name })}
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setCommentFiles((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <XIcon className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="mt-2 flex items-center justify-between gap-2">
          <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer">
            <Paperclip className="h-3.5 w-3.5" />
            {t('taskDetail.attach')}
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? [])
                if (picked.length) setCommentFiles((prev) => [...prev, ...picked])
                e.target.value = ''
              }}
            />
          </label>
          <Button
            size="sm"
            onClick={() => create.mutate()}
            disabled={!text.trim() || create.isPending}
          >
            {create.isPending ? t('taskDetail.posting') : t('taskDetail.comment')}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

function ActivityPanel({ taskId }: { taskId: string }) {
  const { t } = useTranslation()
  const activityQuery = useQuery({
    queryKey: ['task', taskId, 'activity'],
    queryFn: async () => {
      try {
        return await api<ActivityEntry[]>(`/tasks/${taskId}/activity`)
      } catch (err) {
        if (isNotWired(err)) return null
        throw err
      }
    },
  })

  if (activityQuery.data === null) {
    return <NotWiredNote>{t('taskDetail.activityUnavailable')}</NotWiredNote>
  }

  const entries = activityQuery.data ?? []
  // Map known actions to localized phrasing; fall back to a humanized raw string.
  const actionLabel = (action: string) => {
    const key = ACTIVITY_ACTION_LABEL_KEYS[action]
    if (key) return t(key)
    return action
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
  }
  const iconForAction = (action: string) => {
    if (action.includes('assigned')) return '👤'
    if (action.includes('comment')) return '💬'
    if (action.includes('status')) return '🔁'
    if (action.includes('attachment')) return '📎'
    if (action.includes('checklist')) return '☑️'
    if (action.includes('created')) return '✨'
    if (action.includes('deleted')) return '🗑️'
    return '•'
  }

  if (entries.length === 0) {
    return <EmptyState title={t('taskDetail.noActivity')} hint={t('taskDetail.noActivityHint')} />
  }

  return (
    <ol className="relative border-l border-border pl-4 space-y-3">
      {entries.map((a) => (
        <li key={a.id} className="relative">
          <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-brand-700" />
          <div className="text-sm">
            <span className="mr-1">{iconForAction(a.action)}</span>
            <span className="font-medium">
              {a.actor?.displayName ?? a.actor?.email ?? t('taskDetail.system')}
            </span>{' '}
            <span className="text-muted-foreground">{actionLabel(a.action)}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {new Date(a.createdAt).toLocaleString()}
          </div>
        </li>
      ))}
    </ol>
  )
}

// ---------------------------------------------------------------------------
// Time entries
// ---------------------------------------------------------------------------

function TimePanel({ taskId, estimate, defaultBillable = false }: { taskId: string; estimate?: number | null; defaultBillable?: boolean }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [manualStart, setManualStart] = useState('')
  const [manualEnd, setManualEnd] = useState('')
  const [manualDescription, setManualDescription] = useState('')
  const [quickMinutes, setQuickMinutes] = useState('')
  const [startDescription, setStartDescription] = useState('')
  // New entries inherit the project's billable default (§8.3); the user can
  // override per entry before logging.
  const [manualBillable, setManualBillable] = useState(defaultBillable)
  const [nowMs, setNowMs] = useState(() => Date.now())

  const entriesQuery = useQuery({
    queryKey: ['task', taskId, 'time'],
    queryFn: async () => {
      try {
        return await api<TimeEntry[]>(`/tasks/${taskId}/time-entries`)
      } catch (err) {
        if (isNotWired(err)) return null
        throw err
      }
    },
  })

  const running = useMemo(
    () => entriesQuery.data?.find((e) => e.endedAt === null) ?? null,
    [entriesQuery.data],
  )
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [running])

  const start = useMutation({
    mutationFn: () =>
      api(`/tasks/${taskId}/time-entries/start`, {
        method: 'POST',
        body: JSON.stringify({ description: startDescription.trim() || undefined }),
      }),
    onSuccess: async () => {
      setStartDescription('')
      await qc.invalidateQueries({ queryKey: ['task', taskId, 'time'] })
    },
  })

  const stop = useMutation({
    mutationFn: (entryId: string) =>
      api(`/tasks/${taskId}/time-entries/stop/${entryId}`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task', taskId, 'time'] })
    },
  })

  const addManual = useMutation({
    mutationFn: () =>
      api(`/tasks/${taskId}/time-entries/manual`, {
        method: 'POST',
        body: JSON.stringify({
          startedAt: new Date(manualStart).toISOString(),
          endedAt: new Date(manualEnd).toISOString(),
          description: manualDescription.trim() || undefined,
          isBillable: manualBillable,
        }),
      }),
    onSuccess: async () => {
      setManualStart('')
      setManualEnd('')
      setManualDescription('')
      await qc.invalidateQueries({ queryKey: ['task', taskId, 'time'] })
    },
  })

  const addQuickDuration = useMutation({
    mutationFn: () => {
      const mins = Number(quickMinutes)
      const now = Date.now()
      const startedAt = new Date(now - Math.max(1, mins) * 60_000)
      const endedAt = new Date(now)
      return api(`/tasks/${taskId}/time-entries/manual`, {
        method: 'POST',
        body: JSON.stringify({
          startedAt: startedAt.toISOString(),
          endedAt: endedAt.toISOString(),
          description: manualDescription.trim() || `Quick log (${mins}m)`,
          isBillable: manualBillable,
        }),
      })
    },
    onSuccess: async () => {
      setQuickMinutes('')
      await qc.invalidateQueries({ queryKey: ['task', taskId, 'time'] })
    },
  })

  const entries = entriesQuery.data ?? []
  const totalTrackedMs = useMemo(() => {
    return entries.reduce((sum, entry) => {
      if (typeof entry.duration === 'number' && entry.duration > 0) return sum + entry.duration
      if (!entry.endedAt) return sum
      return sum + Math.max(0, new Date(entry.endedAt).getTime() - new Date(entry.startedAt).getTime())
    }, 0)
  }, [entries])
  if (entriesQuery.data === null) {
    return <NotWiredNote>{t('taskDetail.timeTrackingUnavailable')}</NotWiredNote>
  }
  const manualRangeValid =
    !!manualStart &&
    !!manualEnd &&
    !Number.isNaN(new Date(manualStart).getTime()) &&
    !Number.isNaN(new Date(manualEnd).getTime()) &&
    new Date(manualEnd).getTime() > new Date(manualStart).getTime()

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-3">
        <div className="text-sm">
          {running ? (
            <>
              <span className="font-medium">{t('taskDetail.timerRunning')}</span>{' '}
              <span className="text-muted-foreground">
                {t('taskDetail.timerSince', { time: new Date(running.startedAt).toLocaleTimeString(), duration: formatDuration(nowMs - new Date(running.startedAt).getTime()) })}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">{t('taskDetail.noTimer')}</span>
          )}
        </div>
        {running ? (
          <Button size="sm" variant="destructive" onClick={() => stop.mutate(running.id)}>
            {t('taskDetail.stop')}
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Input
              value={startDescription}
              onChange={(e) => setStartDescription(e.target.value)}
              placeholder={t('taskDetail.workingOnPlaceholder')}
              className="h-8 w-[220px]"
            />
            <Button size="sm" onClick={() => start.mutate()} disabled={start.isPending}>
              {t('taskDetail.startTimer')}
            </Button>
          </div>
        )}
      </div>
      <div className="rounded-md border border-border/70 bg-card px-3 py-2 text-sm flex items-center justify-between">
        <span className="text-muted-foreground">{t('taskDetail.totalTracked')}</span>
        <span className="font-mono font-medium">{formatDuration(totalTrackedMs)}</span>
      </div>

      {typeof estimate === 'number' && estimate > 0 && (() => {
        const estMs = estimate * 1000
        const pct = Math.min(100, Math.round((totalTrackedMs / estMs) * 100))
        const over = totalTrackedMs > estMs
        return (
          <div className="rounded-md border border-border/70 bg-card px-3 py-2 text-sm space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('taskDetail.estimatedVsActual')}</span>
              <span className="font-mono text-xs">
                {formatDuration(totalTrackedMs)} / {formatDuration(estMs)}
                {over && (
                  <span className="text-red-500 ml-1">(+{formatDuration(totalTrackedMs - estMs)})</span>
                )}
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', over ? 'bg-red-500' : 'bg-brand-500')}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      })()}

      {entries.length === 0 ? (
        <EmptyState title={t('taskDetail.noTime')} hint={t('taskDetail.noTimeHint')} />
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-3 py-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">
                  {e.description?.trim() ? e.description : t('taskDetail.timeEntryFallback')}
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(e.startedAt).toLocaleString()} →{' '}
                  {e.endedAt ? new Date(e.endedAt).toLocaleTimeString() : t('taskDetail.running')}
                </div>
              </div>
              <div className="text-sm font-mono">
                {formatDuration(
                  e.duration ??
                    (e.endedAt
                      ? new Date(e.endedAt).getTime() - new Date(e.startedAt).getTime()
                      : null),
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="rounded-md border border-border p-3 space-y-2">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{t('taskDetail.addManualEntry')}</div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <div className="text-[11px] text-muted-foreground mb-1">{t('taskDetail.quickLogMinutes')}</div>
            <Input
              type="number"
              min={1}
              value={quickMinutes}
              onChange={(e) => setQuickMinutes(e.target.value)}
              placeholder={t('taskDetail.quickLogPlaceholder')}
            />
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => addQuickDuration.mutate()}
            disabled={!quickMinutes || Number(quickMinutes) <= 0 || addQuickDuration.isPending}
          >
            {t('taskDetail.addMinutes')}
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <Input
            type="datetime-local"
            value={manualStart}
            onChange={(e) => setManualStart(e.target.value)}
          />
          <Input
            type="datetime-local"
            value={manualEnd}
            onChange={(e) => setManualEnd(e.target.value)}
          />
        </div>
        <Input
          value={manualDescription}
          onChange={(e) => setManualDescription(e.target.value)}
          placeholder={t('taskDetail.descriptionOptionalPlaceholder')}
        />
        <label className="flex items-center gap-2 text-xs text-muted-foreground select-none">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 rounded border-border"
            checked={manualBillable}
            onChange={(e) => setManualBillable(e.target.checked)}
          />
          {t('taskDetail.billable')}
        </label>
        {!manualRangeValid && (manualStart || manualEnd) && (
          <div className="text-xs text-amber-600">
            {t('taskDetail.endAfterStart')}
          </div>
        )}
        {addManual.isError && (
          <div className="text-xs text-rose-600">
            {t('taskDetail.couldNotAddManual')}
          </div>
        )}
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => addManual.mutate()}
            disabled={!manualRangeValid || addManual.isPending}
          >
            {t('taskDetail.addTimeEntry')}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Custom fields
// ---------------------------------------------------------------------------

type CustomFieldDef = {
  id: string
  projectId: string
  name: string
  type: 'text' | 'number' | 'dropdown' | 'date' | 'checkbox' | 'url' | 'email' | 'phone' | 'money' | 'rating'
  isRequired: boolean
  options: Array<{ label: string; value: string; color?: string }> | null
}

type CustomFieldRow = {
  definition: CustomFieldDef
  value: string | number | boolean | null
}

function CustomFieldsPanel({
  taskId,
  workspaceId,
}: {
  taskId: string
  workspaceId?: string
}) {
  const { t } = useTranslation()
  if (!workspaceId) {
    return <NotWiredNote>{t('taskDetail.customFieldsNeedWorkspace')}</NotWiredNote>
  }
  return <CustomFieldsPanelInner taskId={taskId} workspaceId={workspaceId} />
}

function CustomFieldsPanelInner({
  taskId,
  workspaceId,
}: {
  taskId: string
  workspaceId: string
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()

  const fieldsQuery = useQuery({
    queryKey: ['custom-fields', workspaceId, taskId],
    queryFn: () =>
      api<CustomFieldRow[]>(`/workspaces/${workspaceId}/tasks/${taskId}/custom-fields`),
  })

  const setValue = useMutation({
    mutationFn: ({ fieldId, value }: { fieldId: string; value: string | number | boolean | null }) =>
      api(`/workspaces/${workspaceId}/tasks/${taskId}/custom-fields/${fieldId}`, {
        method: 'PUT',
        body: { value },
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['custom-fields', workspaceId, taskId] }),
  })

  if (fieldsQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">{t('taskDetail.loadingCustomFields')}</p>
  }

  const fields = fieldsQuery.data ?? []
  if (fields.length === 0) {
    return (
      <EmptyState
        title={t('taskDetail.noCustomFields')}
        hint={t('taskDetail.noCustomFieldsHint')}
      />
    )
  }

  return (
    <div className="space-y-3">
      {fields.map(({ definition, value }) => (
        <div key={definition.id}>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
            {definition.name}
            {definition.isRequired && <span className="text-destructive">*</span>}
            <span className="ml-auto text-[10px] opacity-70">{FIELD_TYPE_LABEL_KEYS[definition.type] ? t(FIELD_TYPE_LABEL_KEYS[definition.type]) : definition.type}</span>
          </div>
          <CustomFieldEditor
            definition={definition}
            value={value}
            disabled={setValue.isPending}
            onCommit={(next) => setValue.mutate({ fieldId: definition.id, value: next })}
          />
        </div>
      ))}
    </div>
  )
}

function CustomFieldEditor({
  definition,
  value,
  disabled,
  onCommit,
}: {
  definition: CustomFieldDef
  value: string | number | boolean | null
  disabled?: boolean
  onCommit: (next: string | number | boolean | null) => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<string>(() => {
    if (value == null) return ''
    if (typeof value === 'boolean') return value ? 'true' : 'false'
    return String(value)
  })

  switch (definition.type) {
    case 'text':
    case 'url':
    case 'email':
    case 'phone':
      return (
        <Input
          type={definition.type === 'email' ? 'email' : definition.type === 'phone' ? 'tel' : 'text'}
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => onCommit(draft.trim() === '' ? null : draft)}
          placeholder={
            definition.type === 'url' ? 'https://...'
              : definition.type === 'email' ? t('taskDetail.emailPlaceholder')
              : definition.type === 'phone' ? t('taskDetail.phonePlaceholder')
              : ''
          }
        />
      )
    case 'number':
      return (
        <Input
          type="number"
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => onCommit(draft === '' ? null : Number(draft))}
        />
      )
    case 'money':
      return (
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
          <Input
            type="number"
            step="0.01"
            className="pl-5"
            value={draft}
            disabled={disabled}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => onCommit(draft === '' ? null : Number(draft))}
            placeholder="0.00"
          />
        </div>
      )
    case 'rating': {
      const current = typeof value === 'number' ? value : 0
      return (
        <div className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              disabled={disabled}
              title={t('taskDetail.ratingStar', { star })}
              onClick={() => onCommit(current === star ? 0 : star)}
              className={cn('text-lg leading-none', star <= current ? 'text-amber-400' : 'text-muted-foreground/30 hover:text-amber-300')}
            >
              ★
            </button>
          ))}
          {current > 0 && <span className="ml-1 text-xs text-muted-foreground">{current}/5</span>}
        </div>
      )
    }
    case 'date':
      return (
        <Input
          type="date"
          value={typeof value === 'string' ? value.slice(0, 10) : ''}
          disabled={disabled}
          onChange={(e) => onCommit(e.target.value || null)}
        />
      )
    case 'checkbox':
      return (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onCommit(!value)}
          className={cn(
            'h-5 w-5 rounded border-2 inline-flex items-center justify-center transition-colors',
            value ? 'bg-primary border-primary text-primary-foreground' : 'border-border',
          )}
        >
          {value ? '✓' : ''}
        </button>
      )
    case 'dropdown': {
      const opts = definition.options ?? []
      return (
        <select
          value={typeof value === 'string' ? value : ''}
          disabled={disabled}
          onChange={(e) => onCommit(e.target.value || null)}
          className="text-sm rounded-md border border-input bg-transparent px-2 py-1.5 w-full"
        >
          <option value="">—</option>
          {opts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )
    }
  }
}

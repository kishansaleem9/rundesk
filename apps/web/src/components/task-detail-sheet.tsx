import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Textarea,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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
  // Frame `15:32` draws Archive with a box-into-tray glyph and Delete with a
  // bin, in red. Two actions, two icons — the menu used one bin for the only
  // row there was, which read as a delete and was not one.
  Archive as ArchiveIcon,
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
  Globe, Share2,
  Bell,
  FolderInput,
  MoveVertical,
  MoreHorizontal,
  Star,
  Plus,
  UserPlus,
  Smile,
  PenTool,
  CheckSquare,
  History,
  Printer,
  Link as LinkIcon,
  Hash,
  ExternalLink as NewTabIcon,
  CornerDownRight,
  Mail,
  Merge as MergeIcon,
  Bookmark,
  PanelRight,
  Loader2,
  // §V2-S07 `15:20` — the Activity header's magnifier and its filter glyph.
  Search,
  SlidersHorizontal,
  // §V2-S17 `15:20` — the ▶ welded to the status pill, and the ✓ beside it.
  ChevronRight,
  Check as CheckIcon,
} from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { offerUndo } from '../lib/undoable-delete'
import { useActivityRail, setActivityRail } from '../lib/activity-rail'
import { parseEstimate, formatEstimate } from '../lib/estimate'
import { FavoriteStar, useFavorites, useToggleFavorite } from '../lib/use-favorites'
import { TaskReminderButton } from './task-reminders'
import { RequestAccessCard } from './request-access-card'
import { TaskTags } from './task-tags'
import { SharePanel } from './share-panel'
import { LinkedDocsSection } from './task-linked-docs'
import { useAuthStore } from '../store/auth'
import { useWorkspaceRole } from '../hooks/use-workspace-role'
import { relativeTime, exactTime } from '../lib/relative-time'
import {
  usePriorities,
  usePriorityActions,
  priorityPromptMuted,
  mutePriorityPrompt,
} from '../lib/use-priorities'
import {
  useCollapseEmptyFields,
  setCollapseEmptyFields,
  isEmptyFieldValue,
} from '../lib/collapse-empty-fields'
import { getRealtimeSocket } from '../lib/realtime'
import { SaveAsTemplateButton } from './task-templates-section'
import { CoverImagePicker, type CoverChoice } from './cover-image-picker'
import { CommentRecorder } from './comment-recorder'
import { TaskDescriptionHistoryDialog } from './task-description-history'
import { TaskPrintView } from './task-print-view'
import { TaskConvertDialog } from './task-convert-dialog'
import { TaskEmailDialog } from './task-email-dialog'
import { TaskMergeDialog } from './task-merge-dialog'
import { presentationFor } from '../lib/composer-recording'
import { MentionText } from './mention-text'
import { RecurringTaskDialog, type RecurrenceRule } from './recurring-task-dialog'
import { MoveDialog } from './move-dialog'
import { QuickCreateModal } from './quick-create-modal'
import { Markdown } from './markdown'
import { formatMentionsPlain } from '../lib/mentions'
import { COMPOSER_BLOCKS, applyBlockAtCaret, matchBlocks } from '../lib/composer-blocks'
import { useTranslation, type TranslationKey } from '../lib/i18n'
import { useDateFormat } from '../lib/date-format'
import {
  toDateInput,
  toDateTimeInput,
  fromDateTimeInput,
  withDatePart,
  presetToIso,
  DATE_PRESETS,
} from '../lib/task-dates'
import { TaskSheetSkeleton } from './loading-skeletons'
import { InlineSkeleton } from './loading-skeletons'

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
  // §V2-08 frame `15:32` — Delete is its own action, so the feed has to be able
  // to say so. `deleted` has been in the activity enum since the beginning and
  // nothing ever wrote it, because nothing ever deleted a task.
  deleted: 'taskDetail.activity.deleted',
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
  checklist_item_added: 'taskDetail.activity.checklistItemAdded',
  dependency_added: 'taskDetail.activity.dependencyAdded',
  dependency_removed: 'taskDetail.activity.dependencyRemoved',
  // §V2-08 — merging leaves an entry on both tasks.
  merged_in: 'taskDetail.activity.mergedIn',
  merged_away: 'taskDetail.activity.mergedAway',
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
  progress_auto: 'taskDetail.fieldType.progressAuto',
  // §V2-01c
  long_text: 'taskDetail.fieldType.longText',
  labels: 'taskDetail.fieldType.labels',
  people: 'taskDetail.fieldType.people',
  location: 'taskDetail.fieldType.location',
  tshirt_size: 'taskDetail.fieldType.tshirtSize',
  progress_manual: 'taskDetail.fieldType.progressManual',
  files: 'taskDetail.fieldType.files',
  voting: 'taskDetail.fieldType.voting',
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
/**
 * §V2-05 frame `04:00` — a mention candidate, and whether they can open the
 * task you are about to point them at. `hasAccess` is decided on the server by
 * the same four steps `ResourceMemberGuard` uses; the client never guesses it.
 */
type MentionCandidate = WorkspaceMemberLite & { hasAccess: boolean }
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

type ChecklistItem = { id: string; content: string; isDone: boolean; dueDate?: string | null; assigneeId?: string | null }
type Checklist = { id: string; title: string; items: ChecklistItem[] }
type ChecklistTemplate = { id: string; name: string; items: Array<{ id: string; content: string }> }

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
  createdById?: string | null
  title: string
  description: string | null
  coverColor?: string | null
  /* §V2-09 — the API resolves a stored key or a linked URL into one field. */
  coverUrl?: string | null
  coverOffsetY?: number | null
  isMilestone?: boolean
  taskTypeId?: string | null
  // Resolved server-side so the header can render the label without a second fetch.
  taskType?: { id: string; name: string; icon: string | null; color: string | null } | null
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
  parentTaskId?: string | null
  parent?: { id: string; title: string } | null
  /**
   * §V2-S04 frame `03:40` — "Created 7 Aug" on the header's right side.
   *
   * The API has always returned this (`getTask` selects the whole row); the
   * header simply never asked for it. Declaring it here is the whole of the
   * server side of that chip.
   */
  createdAt?: string | null
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
  /** §V2-S06 frame `05:55` — whether *I* saved it. Per person, never shared. */
  savedByMe?: boolean
}

type ActivityEntry = {
  id: string
  action: string
  createdAt: string
  actor?: UserLite | null
  // §A2.8 — the transition payload the API has always written
  // ({ from, to } for status/priority/due date). Dropping it here is what left
  // the feed rendering a bare "Status changed".
  meta?: Record<string, unknown> | null
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
  // §V2-10 frame `06:10` — one "Related Items" panel, not a tab for
  // task links and a section further down the page for doc links.
  { key: 'dependencies', labelKey: 'taskDetail.tab.relatedItems' },
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

/**
 * What this task *is* — Task, Campaign, Invoice — beside the task id.
 *
 * Renders nothing at all until the workspace has defined at least one type, so
 * a team that never opts in never sees an empty control.
 */
function TaskTypePicker({
  workspaceId,
  taskId,
  current,
}: {
  workspaceId?: string
  taskId: string
  current: { id: string; name: string; icon: string | null; color: string | null } | null
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const typesQuery = useQuery({
    queryKey: ['task-types', workspaceId],
    queryFn: () =>
      api<Array<{ id: string; name: string; icon: string | null; color: string | null }>>(
        `/workspaces/${workspaceId}/task-types`,
      ),
    enabled: Boolean(workspaceId),
    staleTime: 60_000,
  })

  const apply = useMutation({
    mutationFn: (taskTypeId: string | null) =>
      api(`/tasks/${taskId}/task-type`, { method: 'PATCH', body: { taskTypeId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task', taskId] }),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('taskTypes.failed')),
  })

  const types = typesQuery.data ?? []
  if (types.length === 0) return null

  return (
    <select
      value={current?.id ?? ''}
      onChange={(e) => apply.mutate(e.target.value || null)}
      disabled={apply.isPending}
      aria-label={t('taskTypes.pickerLabel')}
      title={t('taskTypes.pickerLabel')}
      className="h-[22px] rounded border border-border bg-card px-1.5 text-[10px] uppercase tracking-wider disabled:opacity-50"
      style={current?.color ? { color: current.color, borderColor: current.color + '55' } : undefined}
    >
      <option value="">{t('taskTypes.noType')}</option>
      {types.map((tt) => (
        <option key={tt.id} value={tt.id}>
          {tt.icon ? `${tt.icon} ${tt.name}` : tt.name}
        </option>
      ))}
    </select>
  )
}

export function TaskDetailSheet({
  taskId: taskIdProp,
  open,
  onOpenChange,
  workspaceId,
  focusCommentId,
}: {
  taskId: string | null
  open: boolean
  onOpenChange: (next: boolean) => void
  workspaceId?: string
  /**
   * §V2-S06 — arrive on one comment rather than on the task.
   *
   * A saved comment in the Inbox links to `?task=…&comment=…`; without this the
   * link would open the sheet on Overview and leave you to find the sentence
   * you saved, which is most of the way back to not having saved it.
   */
  focusCommentId?: string | null
}) {
  // Which task the sheet is currently showing. Starts at whatever the host
  // opened, then follows a subtask or a dependency the user clicks into.
  const [viewTaskId, setViewTaskId] = useState<string | null>(taskIdProp)
  useEffect(() => { setViewTaskId(taskIdProp) }, [taskIdProp])
  const taskId = viewTaskId
  const goToTask = (nextId: string) => { setViewTaskId(nextId); setActiveTab('overview') }

  const { t } = useTranslation()
  const { formatDate } = useDateFormat()
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  /*
   * §V2-S06 — a `?comment=` in the URL means Comments, not Overview. Keyed on
   * the comment id so following a second saved comment re-opens the tab even if
   * the reader had since wandered off to Fields.
   */
  useEffect(() => {
    if (focusCommentId) setActiveTab('comments')
  }, [focusCommentId])
  /*
   * §V2-S16 frame `15:20` — "Add fields" opens the Fields tab WITH the create
   * form already open.
   *
   * A stamp and not a boolean. The reader can close the form; a boolean would
   * already be `true`, so the second press of "Add fields" would set it to the
   * value it already had and nothing would happen — the dead-on-the-second-press
   * bug this audit has already found once, in "collapse all".
   */
  const [fieldCreateStamp, setFieldCreateStamp] = useState(0)
  // §Share — one panel, shared with every other object type.
  const [shareOpen, setShareOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [convertOpen, setConvertOpen] = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [watchersOpen, setWatchersOpen] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  /*
   * §V2-S04 frame `03:40` — the activity feed as a rail rather than a tab.
   *
   * THREE THINGS FOLLOW FROM IT BEING ON, and they are here rather than spread
   * around so they cannot disagree:
   *  - the sheet is widened, because a 672px sheet split in two leaves neither
   *    half readable. Asking for the rail asks for the room;
   *  - the Activity TAB comes out of the strip. The same feed in two places at
   *    once is the duplicated-list bug with a fresh coat of paint, and a reader
   *    who can see the rail has no use for the tab;
   *  - a reader sitting ON the Activity tab when they turn the rail on is moved
   *    to Overview, which is the point of the rail: the fields and the history
   *    at the same time.
   */
  const activityRail = useActivityRail()
  useEffect(() => {
    if (!activityRail) return
    setExpanded(true)
    setActiveTab((tab) => (tab === 'activity' ? 'overview' : tab))
  }, [activityRail])
  const visibleTabs = activityRail ? TABS.filter((tab) => tab.key !== 'activity') : TABS
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [coverPickerOpen, setCoverPickerOpen] = useState(false)
  /*
   * §V2-09 Reposition — frame `03:10` puts it beside "Change cover" on the
   * banner. Only an IMAGE can be repositioned; a colour has nothing to move.
   * While it is on, dragging up and down changes which band of the picture the
   * banner shows, and letting go saves it.
   */
  const [repositioning, setRepositioning] = useState(false)
  /*
   * The offset while a drag is in flight. Held locally so dragging does not
   * write once per pixel — the band follows the pointer immediately and the
   * value is saved when the drag ends.
   */
  const [offsetPreview, setOffsetPreview] = useState<number | null>(null)
  const draggingCover = useRef(false)
  const updateCoverOffset = useMutation({
    mutationFn: (coverOffsetY: number) =>
      api(`/tasks/${taskId}`, { method: 'PATCH', body: { coverOffsetY } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })
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

  /*
   * §V2-S15 — the menu's Favorite item reads and writes through the SAME hooks
   * the star does, so the two controls in the header cannot end up disagreeing
   * about whether this task is pinned. `useFavorites` shares its cache entry
   * with the star's own read, so this costs no extra request.
   */
  const { data: favorites } = useFavorites(fallbackWorkspaceId)
  const toggleFavorite = useToggleFavorite(fallbackWorkspaceId)
  const isFavorited = !!favorites?.some((f) => f.entityType === 'task' && f.entityId === taskId)

  // "Yeh task mein main main-task bana sakti hoon" — a subtask must be able to
  // become a top-level task without being recreated by hand.
  const promoteToTask = useMutation({
    mutationFn: () => api(`/tasks/${taskId}`, { method: 'PATCH', body: { parentTaskId: null } }),
    onSuccess: async () => {
      toast.success(t('taskDetail.promotedToTask'))
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
      await qc.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : t('taskDetail.couldNotUpdateTitle'))
    },
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

  /*
   * §V2-09 — a cover is a colour or an image, and the two live in different
   * columns. Every choice writes ALL THREE fields so switching kinds actually
   * switches: picking a colour must clear the image, or the banner would keep
   * drawing the old picture over the new colour.
   */
  const updateCover = useMutation({
    mutationFn: (choice: CoverChoice) =>
      api(`/tasks/${taskId}`, {
        method: 'PATCH',
        body:
          choice.kind === 'color'
            ? { coverColor: choice.value, coverStorageKey: null, coverImageUrl: null }
            : choice.kind === 'stored'
              ? { coverColor: null, coverStorageKey: choice.storageKey, coverImageUrl: null, coverOffsetY: 50 }
              : choice.kind === 'link'
                ? { coverColor: null, coverStorageKey: null, coverImageUrl: choice.url, coverOffsetY: 50 }
                : { coverColor: null, coverStorageKey: null, coverImageUrl: null },
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

  /*
   * §V2-S15 frame `15:25` — ARCHIVE, which is what this always did.
   *
   * `DELETE /tasks/:id` sets `isArchived`, stamps `archivedAt`/`archivedById`,
   * logs the activity as `archived`, and the task then appears under
   * `GET /workspaces/:id/archived-tasks` with `POST /tasks/:id/restore` to
   * bring it back. Every layer of the product called that archiving except the
   * button, which called it Delete and warned "This cannot be undone" — the
   * opposite of the truth, about the one action people most need to trust.
   *
   * The frame's OTHER row, Delete, is `deleteTask` below — a real one now, on
   * `POST /tasks/:id/trash`. Archive keeps the task for good under Settings →
   * Archived tasks; Delete puts it in the workspace Trash with thirty days on
   * the clock. Different request, different column, different surface: the two
   * rows are two actions, which is the only reason both are here.
   */
  const archiveTask = useMutation({
    mutationFn: () => api(`/tasks/${taskId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success(t('taskDetail.taskArchived'))
      await qc.invalidateQueries()
      onOpenChange(false)
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : t('taskDetail.couldNotArchive'))
    },
  })
  const confirmArchive = () => {
    if (window.confirm(t('taskDetail.confirmArchiveTask'))) archiveTask.mutate()
  }

  /*
   * §V2-08 frame `15:32` — **DELETE**, the red row under Archive.
   *
   * Moves the task into the workspace Trash, beside the deleted spaces, lists
   * and docs that were already there. Restorable from Settings → Trash for
   * thirty days, then purged by the same nightly job; "Delete forever" on that
   * row removes it at once.
   *
   * The Undo is the same `offerUndo` the sidebar's container deletes use, and
   * it calls the same trash restore endpoint. Reused rather than re-written: a
   * second undo would be a second place for the restore route to drift.
   */
  const deleteTask = useMutation({
    mutationFn: () => api<{ ok: boolean; retentionDays?: number }>(`/tasks/${taskId}/trash`, { method: 'POST' }),
    onSuccess: async () => {
      if (fallbackWorkspaceId && taskId) {
        offerUndo({
          workspaceId: fallbackWorkspaceId,
          type: 'task',
          id: taskId,
          message: t('taskDetail.taskDeleted'),
          undoLabel: t('trash.undo'),
          restoredMessage: t('taskDetail.taskUndeleted'),
          failedMessage: t('taskDetail.couldNotUndelete'),
          onRestored: () => qc.invalidateQueries(),
        })
      } else {
        toast.success(t('taskDetail.taskDeleted'))
      }
      await qc.invalidateQueries()
      onOpenChange(false)
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : t('taskDetail.couldNotDelete'))
    },
  })
  const confirmDelete = () => {
    if (window.confirm(t('taskDetail.confirmDeleteTask'))) deleteTask.mutate()
  }

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
        testId="task-sheet"
        className={cn(
          'w-full overflow-y-auto transition-[max-width] duration-200',
          expanded ? 'sm:max-w-[90vw]' : 'sm:max-w-2xl',
        )}
      >
        {!taskId ? null : detailQuery.isLoading ? (
          // §2.9a — one line of muted text in a full-height sheet was the
          // closest thing to a blank screen left in the app.
          <TaskSheetSkeleton />
        ) : detailQuery.data ? (
          <>
            {/*
              §V2-09 — the cover band: an image if there is one, else a colour,
              else the brand gradient. `coverUrl` is what the API resolved from
              either an uploaded key or a link, so this does not care which.

              An image is drawn as a background rather than an <img> so
              `object-position` and `cover` can crop it to the band, which is
              what Reposition adjusts.
            */}
            <div
              data-testid="task-cover"
              data-cover-kind={detailQuery.data.coverUrl ? 'image' : detailQuery.data.coverColor ? 'color' : 'none'}
              data-cover-offset={offsetPreview ?? detailQuery.data.coverOffsetY ?? 50}
              /*
               * Reposition, as a drag on the band itself. Arrow keys do the
               * same thing a nudge at a time, because a drag is not reachable
               * from a keyboard and the band is the only place this lives.
               */
              tabIndex={repositioning ? 0 : -1}
              onPointerDown={(e) => {
                if (!repositioning) return
                draggingCover.current = true
                ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
              }}
              onPointerMove={(e) => {
                if (!repositioning || !draggingCover.current) return
                const box = (e.currentTarget as HTMLElement).getBoundingClientRect()
                const pct = ((e.clientY - box.top) / box.height) * 100
                setOffsetPreview(Math.max(0, Math.min(100, Math.round(pct))))
              }}
              onPointerUp={() => {
                if (!draggingCover.current) return
                draggingCover.current = false
                if (offsetPreview != null) updateCoverOffset.mutate(offsetPreview)
              }}
              onKeyDown={(e) => {
                if (!repositioning) return
                const current = offsetPreview ?? detailQuery.data?.coverOffsetY ?? 50
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                  e.preventDefault()
                  const next = Math.max(0, Math.min(100, current + (e.key === 'ArrowUp' ? -5 : 5)))
                  setOffsetPreview(next)
                  updateCoverOffset.mutate(next)
                }
              }}
              className={cn(
                '-mx-6 -mt-6 mb-4 h-24 relative overflow-hidden rounded-t-md group',
                !detailQuery.data.coverColor && !detailQuery.data.coverUrl && 'bg-brand-gradient',
                repositioning && 'cursor-ns-resize select-none',
              )}
              style={
                detailQuery.data.coverUrl
                  ? {
                      backgroundImage: `url(${JSON.stringify(detailQuery.data.coverUrl)})`,
                      backgroundSize: 'cover',
                      backgroundPosition: `50% ${offsetPreview ?? detailQuery.data.coverOffsetY ?? 50}%`,
                    }
                  : detailQuery.data.coverColor
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
                data-testid="task-archive"
                onClick={confirmArchive}
                disabled={archiveTask.isPending}
                className="absolute left-[7.25rem] top-3 h-7 gap-1.5 px-2.5 text-xs opacity-90 hover:opacity-100"
              >
                <ArchiveIcon className="h-3.5 w-3.5" />
                {t('taskDetail.archiveTask')}
              </Button>
              {/* Reposition sits beside Change cover, and only for an image. */}
              {detailQuery.data.coverUrl && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  data-testid="cover-reposition"
                  onClick={() => {
                    if (repositioning) updateCoverOffset.mutate(detailQuery.data?.coverOffsetY ?? 50)
                    setRepositioning((v) => !v)
                  }}
                  className="absolute right-[8.5rem] top-3 h-7 gap-1.5 px-2.5 text-xs opacity-90 hover:opacity-100"
                >
                  <MoveVertical className="h-3.5 w-3.5" />
                  {repositioning ? t('taskDetail.savePosition') : t('taskDetail.repositionCover')}
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setCoverPickerOpen(true)}
                disabled={updateCover.isPending}
                data-testid="cover-change"
                className="absolute right-3 top-3 h-7 gap-1.5 px-2.5 text-xs opacity-90 hover:opacity-100"
              >
                <ImageIcon className="h-3.5 w-3.5" />
                {t('taskDetail.changeCover')}
              </Button>
            </div>

            <CoverImagePicker
              open={coverPickerOpen}
              onOpenChange={setCoverPickerOpen}
              taskId={taskId}
              onPick={(choice) => updateCover.mutate(choice)}
            />

            <SheetHeader className="pb-3">
              {/* A subtask opens in this same sheet, so say what it hangs off —
                  and let it be promoted out from here (ClickUp's "Subtask of"). */}
              {detailQuery.data.parent && (
                <div className="mb-1 flex items-center gap-2 text-[12px] text-muted-foreground">
                  <span>{t('taskDetail.subtaskOf')}</span>
                  <button
                    type="button"
                    className="truncate font-medium text-foreground hover:underline"
                    onClick={() => goToTask(detailQuery.data!.parent!.id)}
                  >
                    {detailQuery.data.parent.title}
                  </button>
                  <button
                    type="button"
                    className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[11px] hover:bg-muted/40"
                    disabled={promoteToTask.isPending}
                    onClick={() => promoteToTask.mutate()}
                  >
                    {t('taskDetail.promoteToTask')}
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="soft" className="font-mono text-[10px] tracking-wider uppercase">
                  RD-{shortId(detailQuery.data.id)}
                </Badge>
                <TaskTypePicker
                  workspaceId={fallbackWorkspaceId}
                  taskId={detailQuery.data.id}
                  current={detailQuery.data.taskType ?? null}
                />
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
                  {/*
                    §V2-S04 frame `03:40` — the header's right side reads
                    "Created 7 Aug · Brain² · Share · ⋯", and this is the first
                    of those. The date came back from the API all along; nothing
                    asked for it, so a task could not tell you how old it was
                    without opening the activity feed and scrolling to the end.

                    NOT "Brain²" beside it: that button leads to a hub this
                    product does not have, and a control named after a place
                    that does not exist is the facade this audit keeps removing.

                    `formatDate` rather than the frame's literal "7 Aug", so the
                    chip follows the reader's own date format — the same one the
                    due-date badge above it uses.
                  */}
                  {detailQuery.data.createdAt && (
                    <span
                      className="mr-1 hidden text-[11px] text-muted-foreground sm:inline"
                      title={new Date(detailQuery.data.createdAt).toLocaleString()}
                      data-testid="task-created-chip"
                    >
                      {t('taskDetail.createdOn', { date: formatDate(detailQuery.data.createdAt) })}
                    </span>
                  )}
                  {/*
                    And the button the frame's note names: "Activity panel is
                    toggleable (button top-right of the task)".
                  */}
                  <button
                    type="button"
                    title={t(activityRail ? 'taskDetail.hideActivityRail' : 'taskDetail.showActivityRail')}
                    aria-label={t(activityRail ? 'taskDetail.hideActivityRail' : 'taskDetail.showActivityRail')}
                    aria-pressed={activityRail}
                    onClick={() => setActivityRail(!activityRail)}
                    data-testid="task-activity-rail-toggle"
                    className={cn(
                      'h-8 w-8 inline-flex items-center justify-center rounded hover:text-foreground',
                      activityRail ? 'text-accent' : 'text-muted-foreground',
                    )}
                  >
                    <PanelRight className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    title={t('taskDetail.moveTask')}
                    aria-label={t('taskDetail.moveTask')}
                    onClick={() => setMoveOpen(true)}
                    className="h-8 w-8 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground"
                  >
                    <FolderInput className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    title={t('taskDetail.tab.watchers')}
                    aria-label={t('taskDetail.tab.watchers')}
                    onClick={() => setWatchersOpen(true)}
                    data-testid="task-followers-open"
                    className="relative h-8 w-8 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground"
                  >
                    <Bell className="h-4 w-4" />
                    {(detailQuery.data.watchers?.length ?? 0) > 0 && (
                      <span className="absolute -right-0.5 -top-0.5 min-w-[14px] rounded-full bg-brand-500 px-1 text-[9px] font-semibold leading-[14px] text-white">
                        {detailQuery.data.watchers!.length}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    title={t('share.menuAction')}
                    aria-label={t('share.menuAction')}
                    onClick={() => setShareOpen(true)}
                    className="h-8 w-8 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground"
                  >
                    <Share2 className="h-4 w-4" />
                  </button>
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
                  {/*
                    §V2-08, frame `15:32` — the "..." menu.

                    THE ELEVEN ICONS BESIDE IT STAY WHERE THEY ARE. The frame
                    puts everything in one menu, but those eleven already work
                    and every browser suite clicks them by testid; moving them
                    would be a large, risky change that buys nothing a person
                    can see. This carries the actions that had NO home at all,
                    which is the actual gap.
                  */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        data-testid="task-more-menu"
                        title={t('taskDetail.moreActions')}
                        aria-label={t('taskDetail.moreActions')}
                        className="h-8 w-8 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuItem
                        data-testid="task-menu-description-history"
                        onSelect={() => setHistoryOpen(true)}
                      >
                        <History className="mr-2 h-4 w-4" />
                        {t('descriptionHistory.title')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        data-testid="task-menu-print"
                        onSelect={() => setPrinting(true)}
                      >
                        <Printer className="mr-2 h-4 w-4" />
                        {t('taskPrint.print')}
                      </DropdownMenuItem>
                      {/*
                        §V2-08 `[15:38]` "task ko CONVERT bhi kar sakte ho".
                        Only offered on a task that is not already a subtask —
                        the opposite direction is the "Promote" button on the
                        parent strip, so between them a task can go either way
                        and neither control appears where it would fail.
                      */}
                      {!detailQuery.data.parentTaskId && (
                        <DropdownMenuItem
                          data-testid="task-menu-convert"
                          onSelect={() => setConvertOpen(true)}
                        >
                          <CornerDownRight className="mr-2 h-4 w-4" />
                          {t('taskConvert.menuItem')}
                        </DropdownMenuItem>
                      )}
                      {/*
                        §V2-08 — Merge. In the frame at `15:32` and never
                        narrated, so it is the last thing this item built; but
                        it is also the one that moves the most work, so it
                        reports what it moved rather than saying "done".
                      */}
                      <DropdownMenuItem
                        data-testid="task-menu-merge"
                        onSelect={() => setMergeOpen(true)}
                      >
                        <MergeIcon className="mr-2 h-4 w-4" />
                        {t('taskMerge.menuItem')}
                      </DropdownMenuItem>
                      {/*
                        §V2-S16 frame `15:30` — "Custom Fields" is its own row
                        in this menu, and the frame draws it with NO chevron
                        while Templates, Relationships, Convert to, Add to,
                        Favorite, Remind me and Task Type all have one. So it is
                        an action, not a submenu: it goes straight to the
                        field-defining form, which is the same destination as
                        "Add fields" under the description.
                      */}
                      <DropdownMenuItem
                        data-testid="task-menu-custom-fields"
                        onSelect={() => {
                          setActiveTab('fields')
                          setFieldCreateStamp((n) => n + 1)
                        }}
                      >
                        <SlidersHorizontal className="mr-2 h-4 w-4" />
                        {t('taskDetail.tab.fields')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {/* The frame's header row: Copy link · Copy ID · New tab. */}
                      <DropdownMenuItem
                        data-testid="task-menu-copy-link"
                        onSelect={() => {
                          const url = window.location.href
                          void navigator.clipboard?.writeText(url)
                            .then(() => toast.success(t('taskDetail.copiedLink')))
                            .catch(() => toast.error(t('taskDetail.copyFailed')))
                        }}
                      >
                        <LinkIcon className="mr-2 h-4 w-4" />
                        {t('taskDetail.copyLink')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        data-testid="task-menu-copy-id"
                        onSelect={() => {
                          void navigator.clipboard?.writeText(detailQuery.data!.id)
                            .then(() => toast.success(t('taskDetail.copiedId')))
                            .catch(() => toast.error(t('taskDetail.copyFailed')))
                        }}
                      >
                        <Hash className="mr-2 h-4 w-4" />
                        {t('taskDetail.copyId')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        data-testid="task-menu-new-tab"
                        onSelect={() => window.open(window.location.href, '_blank', 'noopener')}
                      >
                        <NewTabIcon className="mr-2 h-4 w-4" />
                        {t('taskDetail.openNewTab')}
                      </DropdownMenuItem>
                      {/*
                        §V2-S15 frame `15:25` — Favorite sits directly under the
                        Copy row in the menu. The star beside the "..." is easy
                        to miss and easy to hit by accident; the menu is where
                        the walkthrough reaches for it.

                        SAME HOOK AS THE STAR. `useToggleFavorite` is the one
                        implementation, so the two controls cannot disagree
                        about whether this task is pinned — a second
                        `favorited` computed here would be the seventh
                        duplicated-state bug in this codebase.
                      */}
                      <DropdownMenuItem
                        data-testid="task-menu-favorite"
                        onSelect={() =>
                          toggleFavorite.mutate({ entityType: 'task', entityId: detailQuery.data!.id })
                        }
                      >
                        <Star
                          className={cn(
                            'mr-2 h-4 w-4',
                            isFavorited && 'fill-amber-400 text-amber-400',
                          )}
                        />
                        {isFavorited ? t('favorites.remove') : t('favorites.add')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {/*
                        §V2-08 — "Send email to task". The address has routed to
                        a comment on this task since email-to-task was written
                        and nothing has ever shown it to anybody.
                      */}
                      <DropdownMenuItem
                        data-testid="task-menu-email"
                        onSelect={() => setEmailOpen(true)}
                      >
                        <Mail className="mr-2 h-4 w-4" />
                        {t('taskEmail.menuItem')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {/*
                        Archive, second from the bottom in the frame. Same
                        mutation as the banner button — one action, one name, in
                        both of the places the walkthrough reaches for it.

                        Neutral, not red: the frame draws Archive in the plain
                        menu colour and only Delete in red, and it is right to.
                        Archiving is reversible and keeps the task for good; the
                        red one is the row with a clock on it.
                      */}
                      <DropdownMenuItem
                        data-testid="task-menu-archive"
                        onSelect={confirmArchive}
                      >
                        <ArchiveIcon className="mr-2 h-4 w-4" />
                        {t('taskDetail.archiveTask')}
                      </DropdownMenuItem>
                      {/*
                        DELETE — the last row in the frame, red, under Archive.
                        A different request (`POST /tasks/:id/trash`), a
                        different column (`deletedAt`), a different surface
                        (Settings → Trash) and a different ending (purged after
                        thirty days). Two rows only earn their place by being
                        two actions.
                      */}
                      <DropdownMenuItem
                        data-testid="task-menu-delete"
                        onSelect={confirmDelete}
                        disabled={deleteTask.isPending}
                        className="text-red-600 focus:text-red-600"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t('taskDetail.deleteTask')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
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
                {/* §G15 [23:16] — the badges were here already; the way to put
                    one on the task was not. Everything behind it shipped long
                    ago and nothing in the web app ever called it. */}
                <TaskTags
                  taskId={detailQuery.data.id}
                  workspaceId={workspaceId}
                  labels={detailQuery.data.labels ?? []}
                />
              </div>
            </SheetHeader>

            {/* Tab strip */}
            <div className="flex gap-4 overflow-x-auto scrollbar-none border-b border-border/60 -mx-6 px-6">
              {visibleTabs.map((tab) => {
                const isActive = activeTab === tab.key
                return (
                  <button
                    key={tab.key}
                    type="button"
                    data-testid={`task-tab-${tab.key}`}
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

            {/*
              §V2-S04 frame `01:20` — the field grid and the activity feed on
              screen together, which is the whole reason the rail exists: "You
              estimated 12 hours" is worth more beside the estimate than on a
              screen of its own.

              `lg:flex-row` and not a hard split: turning the rail on widens the
              sheet to 90vw, which is past `lg` on any real display, but on a
              phone the rail stacks under the panel instead of squeezing both
              into nothing.
            */}
            <div className={cn('pt-4', activityRail && 'flex flex-col gap-4 lg:flex-row lg:items-start')}>
              <div className={cn(activityRail && 'min-w-0 flex-1')} data-testid="task-tab-panel">
              {activeTab === 'overview' && (
                <OverviewPanel
                  detail={detailQuery.data}
                  taskId={detailQuery.data.id}
                  workspaceId={fallbackWorkspaceId}
                  onAddFields={() => {
                    setActiveTab('fields')
                    setFieldCreateStamp((n) => n + 1)
                  }}
                />
              )}
              {activeTab === 'fields' && (
                <CustomFieldsPanel
                  taskId={detailQuery.data.id}
                  workspaceId={fallbackWorkspaceId}
                  openCreateStamp={fieldCreateStamp}
                />
              )}
              {activeTab === 'subtasks' && (
                <SubtasksPanel
                  taskId={detailQuery.data.id}
                  parentListId={detailQuery.data.listId}
                  workspaceId={fallbackWorkspaceId}
                  inline={detailQuery.data.subtasks ?? []}
                  onOpenTask={(subtaskId) => goToTask(subtaskId)}
                />
              )}
              {activeTab === 'checklists' && (
                <ChecklistsPanel
                  taskId={detailQuery.data.id}
                  listId={detailQuery.data.listId}
                  workspaceId={fallbackWorkspaceId}
                  checklists={detailQuery.data.checklists ?? []}
                />
              )}
              {activeTab === 'dependencies' && (
                <RelatedItemsPanel
                  taskId={detailQuery.data.id}
                  workspaceId={fallbackWorkspaceId}
                  inline={detailQuery.data.dependencies ?? []}
                  onOpenTask={(relatedTaskId) => goToTask(relatedTaskId)}
                />
              )}
              {activeTab === 'attachments' && (
                <AttachmentsPanel taskId={detailQuery.data.id} inline={detailQuery.data.attachments ?? []} />
              )}
              {activeTab === 'comments' && (
                <CommentsPanel
                  taskId={detailQuery.data.id}
                  workspaceId={fallbackWorkspaceId}
                  focusCommentId={focusCommentId}
                  listId={detailQuery.data.listId}
                />
              )}
              {activeTab === 'activity' && (
                <ActivityPanel taskId={detailQuery.data.id} listId={detailQuery.data.listId} />
              )}
              {activeTab === 'time' && (
                <TimePanel taskId={detailQuery.data.id} estimate={detailQuery.data.timeEstimate} defaultBillable={detailQuery.data.defaultBillable} />
              )}
              </div>
              {/*
                ONE ActivityPanel, in whichever place is showing. The tab above
                is filtered out while the rail is on, so this is never a second
                copy of the feed — it is the same component, given a column.
              */}
              {activityRail && (
                <aside
                  className="w-full shrink-0 rounded-md border border-border/70 bg-card/40 p-3 lg:w-[340px]"
                  data-testid="task-activity-rail"
                >
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('taskDetail.tab.activity')}
                  </h3>
                  <ActivityPanel taskId={detailQuery.data.id} listId={detailQuery.data.listId} />
                </aside>
              )}
            </div>
          </>
        ) : (
          /*
           * §G10 — a private task is not a missing one.
           *
           * The resource guard answers 403 for something that exists and 404
           * for something that does not, and this screen used to flatten both
           * into "Task not found." The card renders only on the 403 and offers
           * the ask; on a 404 nothing changes, because confirming that an
           * object exists to somebody who was never told about it is the
           * opposite of what private means.
           */
          <div className="space-y-3">
            <p className="text-sm text-destructive">{t('taskDetail.notFound')}</p>
            <RequestAccessCard
              workspaceId={workspaceId}
              type="task"
              objectId={taskId}
              error={detailQuery.error}
            />
          </div>
        )}
        {detailQuery.data && workspaceId && (
          <MoveDialog
            open={moveOpen}
            onOpenChange={setMoveOpen}
            workspaceId={workspaceId}
            kind="task"
            itemId={detailQuery.data.id}
            itemName={detailQuery.data.title}
            onMoved={() => { void qc.invalidateQueries({ queryKey: ['task', taskId] }); void qc.invalidateQueries({ queryKey: ['tasks'] }) }}
          />
        )}
        <Dialog open={watchersOpen} onOpenChange={setWatchersOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t('taskDetail.tab.watchers')}</DialogTitle>
            </DialogHeader>
            {detailQuery.data && (
              <WatchersPanel
                taskId={detailQuery.data.id}
                workspaceId={fallbackWorkspaceId}
                inline={detailQuery.data.watchers ?? []}
                createdById={detailQuery.data.createdById ?? null}
                assigneeIds={(detailQuery.data.assignees ?? []).map((a) => a.user.id)}
              />
            )}
          </DialogContent>
        </Dialog>
      </SheetContent>
      {taskId && (
        <SharePanel
          open={shareOpen}
          onOpenChange={setShareOpen}
          objectType="task"
          objectId={taskId}
          objectName={detailQuery.data?.title}
        />
      )}
      {/* §V2-08 `[15:27]` — what the description used to say. */}
      {taskId && (
        <TaskDescriptionHistoryDialog taskId={taskId} open={historyOpen} onOpenChange={setHistoryOpen} />
      )}
      {/*
        §V2-08 `[15:32]` — Print. Mounted only while printing: a permanently
        mounted hidden copy of every open task would be read by screen readers
        and found by ctrl-F, which is a second copy of the page nobody asked for.
      */}
      {printing && detailQuery.data && (
        <TaskPrintView task={detailQuery.data} onDone={() => setPrinting(false)} />
      )}
      {/* §V2-08 `[15:38]` — convert this task into a subtask of another. */}
      {taskId && (
        <TaskConvertDialog
          taskId={taskId}
          workspaceId={fallbackWorkspaceId}
          hasSubtasks={(detailQuery.data?.subtasks?.length ?? 0) > 0}
          open={convertOpen}
          onOpenChange={setConvertOpen}
        />
      )}
      {/* §V2-08 — the inbound address that turns an email into a comment here. */}
      {taskId && <TaskEmailDialog taskId={taskId} open={emailOpen} onOpenChange={setEmailOpen} />}
      {/*
        §V2-08 — Merge. On success the sheet follows the survivor: the task it
        was showing is now in the bin, and leaving it on screen would show
        somebody an archived page with their work apparently gone.
      */}
      {taskId && detailQuery.data && (
        <TaskMergeDialog
          taskId={taskId}
          taskTitle={detailQuery.data.title}
          workspaceId={fallbackWorkspaceId}
          open={mergeOpen}
          onOpenChange={setMergeOpen}
          onMerged={(next) => setViewTaskId(next)}
        />
      )}
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
  onAddFields,
}: {
  detail: TaskDetail
  taskId: string
  workspaceId?: string
  /** §V2-S16 frame `15:20` — "Add fields", the first of the five stacked
   *  actions under the description. The other four have homes in the tab strip
   *  already; this one had no destination at all. */
  onAddFields?: () => void
}) {
  const { t, tCount } = useTranslation()
  const qc = useQueryClient()
  const navigate = useNavigate()
  /*
   * §V2-S16 — the priorities half of the assign chain, in the panel that owns
   * the assignee controls. Reads and writes through the same
   * `lib/use-priorities` the Planner rail and the person panel use, so a task
   * added here is in the rail's list without a reload.
   */
  const currentUserId = useAuthStore((s) => s.user?.id) ?? ''
  const { data: myPriorities } = usePriorities(workspaceId, currentUserId)
  const priorityActions = usePriorityActions(workspaceId, currentUserId)
  const [priorityPromptOpen, setPriorityPromptOpen] = useState(false)
  // Offering to add something that is already on the list is noise.
  const isAlreadyPriority = !!myPriorities?.some((p) => p.taskId === taskId && !p.doneAt)
  const [editingDescription, setEditingDescription] = useState(false)
  // §G15 [22:28] — the slash menu on the description, and what has been typed
  // after the slash to narrow it.
  const [slashOpen, setSlashOpen] = useState(false)
  const [slashFilter, setSlashFilter] = useState('')
  const [descriptionDraft, setDescriptionDraft] = useState('')
  const descriptionRef = useRef<HTMLTextAreaElement>(null)
  const descriptionImageInputRef = useRef<HTMLInputElement>(null)
  const [insertingImage, setInsertingImage] = useState(false)
  /*
   * The task's files, for resolving `attachment:<id>` images in the
   * description. Same queryKey as the Files tab's own read, so React Query
   * serves both from one cache entry and this costs no extra request.
   */
  const descriptionAssets = useQuery({
    queryKey: ['task', taskId, 'attachments'],
    queryFn: async () => {
      try {
        return await api<Attachment[]>(`/tasks/${taskId}/attachments`)
      } catch (err) {
        if (isNotWired(err)) return null
        throw err
      }
    },
    enabled: Boolean(taskId),
  })
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

  /**
   * §G15 [22:28] — "main SLASH click karoongi, phir table bana loon, banners
   * rakhoon … jis tarah document ko aap design karte hain, exactly wohi same
   * feature hai."
   *
   * The description stores markdown, and Docs stores tiptap HTML. Rather than
   * migrate every existing task description into a different editor to get one
   * menu, the menu writes markdown — and the renderer learned tables and
   * callouts to receive it. Same gesture, same blocks, no rewrite of data
   * people already have.
   */
  /*
   * §V2-S05c — the blocks come from `lib/composer-blocks`, which the COMMENT
   * composer now shares. They used to be written out here, and a second copy in
   * the comment composer would have drifted the moment either surface gained a
   * block, with nothing failing to compile.
   *
   * `image` stays local: it needs a file uploaded before there is anything to
   * insert, so it is an action rather than a piece of markdown, and it belongs
   * with the uploader that can perform it (§G15 `[22:48]`).
   */
  const DESCRIPTION_BLOCKS = [
    ...COMPOSER_BLOCKS.map((b) => ({ ...b, action: undefined as 'image' | undefined })),
    { id: 'image', labelKey: 'taskDetail.slash.image' as TranslationKey, md: '', action: 'image' as const },
  ]

  /**
   * Replace the `/query` the caret sits in with a block.
   *
   * The slash and everything typed after it is what the person is replacing —
   * leaving it behind would put `/tab` above their new table.
   */
  const insertDescriptionBlock = (md: string) => {
    const el = descriptionRef.current
    const text = descriptionDraft
    const caret = el?.selectionStart ?? text.length
    const lineStart = text.lastIndexOf('\n', caret - 1) + 1
    const before = text.slice(lineStart, caret)
    const slashAt = before.lastIndexOf('/')
    const from = slashAt === -1 ? caret : lineStart + slashAt

    // Blocks need their own line. Starting one mid-sentence produces markdown
    // that renders as the sentence with some punctuation in it.
    const needsBreak = from > 0 && text[from - 1] !== '\n'
    const insert = (needsBreak ? '\n' : '') + md
    const next = text.slice(0, from) + insert + text.slice(caret)
    setDescriptionDraft(next)
    setSlashOpen(false)
    setSlashFilter('')

    requestAnimationFrame(() => {
      el?.focus()
      // Land inside the block, not after it: a fenced code block and a banner
      // both want the caret on the empty line in the middle.
      const firstBreak = insert.indexOf('\n\n')
      const caretAt = firstBreak === -1 ? from + insert.length : from + firstBreak + 1
      el?.setSelectionRange(caretAt, caretAt)
    })
  }

  const slashChoices = DESCRIPTION_BLOCKS.filter((b) =>
    t(b.labelKey as TranslationKey).toLowerCase().includes(slashFilter.toLowerCase()),
  )

  /**
   * §G15 [22:48] — a picked image becomes an attachment, then a reference.
   *
   * The same three steps the Files tab uses (presign, PUT, record), so an image
   * in a description is a real attachment: it appears in Files, it is covered
   * by the same size limit and the same storage-key guard, and deleting it
   * there is a decision someone can actually make.
   *
   * What goes into the text is `attachment:<id>`, never the signed URL that
   * comes back — see the resolver on <Markdown>. Writing the signed URL here
   * would embed something that stops working on its own.
   */
  const onPickDescriptionImage = async (file: File | null | undefined) => {
    if (!file) return
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast.error(t('taskDetail.fileTooLarge', { limit: MAX_ATTACHMENT_BYTES / (1024 * 1024) }))
      return
    }
    setInsertingImage(true)
    try {
      const contentType = file.type || 'application/octet-stream'
      const presign = await api<{ uploadUrl: string; storageKey: string }>(
        `/tasks/${taskId}/attachments/presign`,
        { method: 'POST', body: { fileName: file.name, contentType, sizeBytes: file.size } },
      )
      const put = await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: file,
      })
      if (!put.ok) throw new Error(t('taskDetail.uploadFailedStatus', { status: put.status }))
      const saved = await api<{ id: string }>(`/tasks/${taskId}/attachments`, {
        method: 'POST',
        body: { fileName: file.name, storageKey: presign.storageKey, contentType, sizeBytes: file.size },
      })
      // Alt text is the file name: it is what the person will see if the image
      // ever cannot be shown, and it is the only name they gave it.
      insertDescriptionBlock(`![${file.name}](attachment:${saved.id})\n`)
      // Refresh the files list so the new image resolves on the next render.
      await qc.invalidateQueries({ queryKey: ['task', taskId, 'attachments'] })
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : (err as Error).message)
    } finally {
      setInsertingImage(false)
    }
  }

  /** Run a slash choice: most write markdown, the image one asks for a file. */
  const chooseDescriptionBlock = (block: (typeof DESCRIPTION_BLOCKS)[number]) => {
    if ('action' in block && block.action === 'image') {
      // Close the menu first: the file dialog steals focus, and a menu left
      // open behind it is still listening for the keystrokes that follow.
      setSlashOpen(false)
      setSlashFilter('')
      descriptionImageInputRef.current?.click()
      return
    }
    insertDescriptionBlock((block as { md: string }).md)
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
  /*
   * §V2-S02 frame `01:20` — which of the built-in fields have nothing in them.
   *
   * Status and Priority are absent on purpose: every task has both, so neither
   * can ever be empty and listing them would put two entries in this object
   * that are permanently `false`. `Repeat` counts as empty when it is "off",
   * which is the value the select shows for a task that does not repeat.
   */
  const emptyFields = {
    dueDate: isEmptyFieldValue(detail.dueDate),
    startDate: isEmptyFieldValue(detail.startDate),
    repeat: recurrenceValue === 'off',
    timeEstimate: isEmptyFieldValue(detail.timeEstimate),
    assignees: isEmptyFieldValue(detail.assignees),
  }

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
    // `category` and `position` are what §V2-S17's two one-click controls are
    // computed from; the query already returned them and the type threw them
    // away.
    queryFn: () =>
      api<Array<{ key: string; name: string; category?: string; position?: number }>>(
        `/lists/${detail.listId}/statuses`,
      ),
    enabled: Boolean(detail.listId),
  })
  const statusOptions = statusesQuery.data ?? []

  /*
   * §V2-S17 frames `15:20`, `16:00`, `04:11` — the status pill carries a ▶ on
   * its right edge and a ✓ beside it. Two one-click affordances where Rundesk
   * had one `<select>`.
   *
   * BOTH ANSWERS COME FROM THIS LIST'S OWN PIPELINE. Statuses are per-list
   * here: `GET /lists/:listId/statuses` returns whatever this list was given,
   * with a `category` and a `position`, and a list whose statuses were renamed
   * has no `todo` and no `done` in it at all. A ▶ that advanced to a fixed key,
   * or a ✓ that wrote `done`, would work on the default pipeline and quietly
   * fail — or worse, 400 — on every renamed one. That is the *facade*: a
   * control that can only ever say one thing.
   *
   *   · next     — the status with the smallest position ABOVE the current
   *                one's. The last status has no next, and the button says so
   *                rather than wrapping round to the start.
   *   · complete — the FIRST status in the `closed` category, by position. A
   *                list can have several ("Done", "Cancelled"); ✓ means the
   *                first one, and a list with none disables the control instead
   *                of inventing a key.
   */
  const orderedStatuses = useMemo(
    () => [...statusOptions].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [statusOptions],
  )
  const currentStatusIndex = orderedStatuses.findIndex((s) => s.key === detail.status)
  const nextStatus =
    currentStatusIndex >= 0 && currentStatusIndex < orderedStatuses.length - 1
      ? orderedStatuses[currentStatusIndex + 1]
      : null
  const completeStatus = orderedStatuses.find((s) => s.category === 'closed') ?? null
  const currentIsClosed =
    currentStatusIndex >= 0 && orderedStatuses[currentStatusIndex]?.category === 'closed'

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

  /*
   * §V2-S16 frames `15:50`–`15:55` — assigning offers to put the task on your
   * day, and the toast that follows links to where it landed.
   *
   * ONLY WHEN THE ASSIGNEE IS YOU. The frame's prompt names the assignee
   * ("Add this task to Hamda Tahir's priorities?") and the toast that follows
   * says "your Priorities", because she was assigning to herself. Priorities
   * are written through `POST /workspaces/:id/priorities`, which takes no
   * `:userId` on purpose — see `PrioritiesController`: routing the write under
   * `/people/:userId` "would invite a client to pass somebody else's id and
   * expect it to work". Offering to fill a colleague's day is a permission this
   * product has deliberately not given, so the prompt does not pretend to.
   */
  const addAssignee = useMutation({
    mutationFn: (userId: string) =>
      api(`/tasks/${taskId}/assignees`, {
        method: 'POST',
        body: { userId },
      }),
    onSuccess: async (_data, userId) => {
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
      if (userId === currentUserId && !priorityPromptMuted() && !isAlreadyPriority) {
        setPriorityPromptOpen(true)
      }
    },
  })

  const addToPriorities = () => {
    priorityActions.add.mutate(
      { taskId },
      {
        onSuccess: () => {
          setPriorityPromptOpen(false)
          // The toast links to where the task went. "Added" with no way to look
          // is a claim the reader has to take on trust.
          toast.success(t('planner.addedToPriorities'), {
            action: workspaceId
              ? {
                  label: t('planner.openPriorities'),
                  onClick: () => navigate({ to: `/app/${workspaceId}/calendar` }),
                }
              : undefined,
          })
        },
      },
    )
  }

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
            <div className="relative">
              <MentionTextarea
                autoFocus
                rows={5}
                value={descriptionDraft}
                onChange={(next) => {
                  setDescriptionDraft(next)
                  /*
                   * §G15 [22:28] — "/" opens the block menu.
                   *
                   * Only at the start of a line or after a space, so a URL, a
                   * date, or "and/or" does not open a menu in the middle of a
                   * sentence. Read from the value rather than the keystroke
                   * because a paste is not a keypress and a menu that opens on
                   * pasted text is a menu that opens at random.
                   */
                  const el = descriptionRef.current
                  const caret = el?.selectionStart ?? next.length
                  const lineStart = next.lastIndexOf('\n', caret - 1) + 1
                  const before = next.slice(lineStart, caret)
                  const match = /(?:^|\s)\/([a-z]*)$/i.exec(before)
                  if (match) {
                    setSlashOpen(true)
                    setSlashFilter(match[1])
                  } else {
                    setSlashOpen(false)
                    setSlashFilter('')
                  }
                }}
                members={membersQuery.data ?? []}
                textareaRef={descriptionRef}
                onBlur={() => {
                  // Clicking a menu item blurs the textarea before the click
                  // lands. Committing here would save the draft and close the
                  // editor out from under the block being inserted.
                  if (slashOpen) return
                  commitDescription()
                }}
                onKeyDown={(e) => {
                  if (!slashOpen) return
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    setSlashOpen(false)
                    setSlashFilter('')
                    return
                  }
                  if (e.key === 'Enter' && slashChoices.length > 0) {
                    e.preventDefault()
                    chooseDescriptionBlock(slashChoices[0])
                  }
                }}
                disabled={updateDescription.isPending}
                placeholder={t('taskDetail.descriptionPlaceholder')}
                className="text-sm leading-relaxed font-mono"
              />
              {slashOpen && slashChoices.length > 0 && (
                <div
                  data-testid="description-slash-menu"
                  className="absolute left-0 top-full z-30 mt-1 w-56 rounded-lg border border-border bg-card p-1 shadow-lg"
                >
                  <div className="px-2 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {t('taskDetail.slash.title')}
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                    {slashChoices.map((block) => (
                      <button
                        key={block.id}
                        type="button"
                        data-testid={`description-slash-${block.id}`}
                        // The click has to land before the blur commits.
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => chooseDescriptionBlock(block)}
                        className="w-full rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                      >
                        {t(block.labelKey as TranslationKey)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {/* §G15 [22:48] — the picker the Image block opens. Hidden rather
                than styled away: it is the file input doing the work, and a
                real <input type="file"> is what a screen reader and a keyboard
                both already understand. */}
            <input
              ref={descriptionImageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              data-testid="description-image-input"
              onChange={(e) => {
                const file = e.target.files?.[0]
                // Cleared so picking the SAME file twice fires change again.
                e.target.value = ''
                void onPickDescriptionImage(file)
              }}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              {insertingImage ? t('taskDetail.insertingImage') : t('taskDetail.slashHint')}
            </p>
          </div>
        ) : detail.description?.trim() ? (
          <div
            role="button"
            tabIndex={0}
            data-testid="description-open"
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
            <Markdown
              source={detail.description}
              /*
               * §G15 [22:48] — resolve `attachment:<id>` against the files this
               * task already carries. The API only ever issues SIGNED storage
               * URLs, which expire, so the description stores the id and the
               * URL is looked up per render. An id with no matching file left
               * (deleted, or not loaded yet) resolves to null and the image
               * falls back to its alt text.
               */
              resolveSrc={(raw) => {
                if (!raw.startsWith('attachment:')) return raw
                const id = raw.slice('attachment:'.length)
                return (descriptionAssets.data ?? []).find((f) => f.id === id)?.url ?? null
              }}
            />
          </div>
        ) : (
          <button
            type="button"
            data-testid="description-open"
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

      {/*
        §V2-S02 frame `01:20` — "Collapse empty fields" beside the field grid.
        Which fields are empty is decided HERE, once, so the toggle, the count
        and the hiding cannot disagree: a count computed separately from the
        fields it describes is the same bug in a smaller box.
      */}
      <div className="flex items-center gap-2">
        <CollapseEmptyFieldsToggle
          emptyCount={Object.values(emptyFields).filter(Boolean).length}
        />
        {onAddFields && (
          <button
            type="button"
            data-testid="task-add-fields"
            onClick={onAddFields}
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/10"
          >
            <Plus className="h-3 w-3" />
            {t('taskDetail.addFields')}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label={t('taskDetail.fieldStatus')}>
          <div className="flex items-center gap-1">
            <select
              value={detail.status}
              onChange={(e) => patchTask.mutate({ status: e.target.value })}
              disabled={patchTask.isPending}
              className="min-w-0 flex-1 h-8 rounded-md border border-border bg-card px-2 text-sm capitalize focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            >
              {/* Keep the current value selectable even if statuses are still loading */}
              {statusOptions.length === 0 && <option value={detail.status}>{STATUS_LABEL_KEYS[detail.status] ? t(STATUS_LABEL_KEYS[detail.status]) : detail.status.replace('_', ' ')}</option>}
              {statusOptions.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.name}
                </option>
              ))}
            </select>
            {/*
              `data-next-status` / `data-complete-status` carry the RESOLVED key,
              so what the control will write is measurable without pressing it —
              and a suite can put the question to a list whose statuses were
              renamed, where a hard-coded `todo`/`done` has nothing to match.
            */}
            <button
              type="button"
              data-testid="task-status-next"
              data-next-status={nextStatus?.key ?? ''}
              disabled={patchTask.isPending || !nextStatus}
              onClick={() => nextStatus && patchTask.mutate({ status: nextStatus.key })}
              title={
                nextStatus
                  ? t('taskDetail.nextStatus', { status: nextStatus.name })
                  : t('taskDetail.nextStatusLast')
              }
              aria-label={
                nextStatus
                  ? t('taskDetail.nextStatus', { status: nextStatus.name })
                  : t('taskDetail.nextStatusLast')
              }
              className="h-8 w-7 shrink-0 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/10 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              data-testid="task-status-complete"
              data-complete-status={completeStatus?.key ?? ''}
              data-already-complete={currentIsClosed ? 'true' : 'false'}
              disabled={patchTask.isPending || !completeStatus || currentIsClosed}
              onClick={() => completeStatus && patchTask.mutate({ status: completeStatus.key })}
              title={
                !completeStatus
                  ? t('taskDetail.noClosedStatus')
                  : currentIsClosed
                    ? t('taskDetail.alreadyComplete')
                    : t('taskDetail.markComplete', { status: completeStatus.name })
              }
              aria-label={
                !completeStatus
                  ? t('taskDetail.noClosedStatus')
                  : currentIsClosed
                    ? t('taskDetail.alreadyComplete')
                    : t('taskDetail.markComplete', { status: completeStatus.name })
              }
              className="h-8 w-7 shrink-0 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/10 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <CheckIcon className="h-3.5 w-3.5" />
            </button>
          </div>
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
          empty={emptyFields.dueDate}
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
          {/* §G [21:36] — the deadline is a moment, not a day. See
              lib/task-dates.ts for why this is local-time and what a bare
              `type="date"` here used to do to a time already on the row. */}
          <input
            type="datetime-local"
            data-testid="task-due-date"
            value={toDateTimeInput(detail.dueDate)}
            onChange={(e) => patchTask.mutate({ dueDate: fromDateTimeInput(e.target.value) })}
            disabled={patchTask.isPending}
            className="w-full h-8 rounded-md border border-border bg-card px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          />
          {/*
            §G15 frame #9 — "Today / Tomorrow / This weekend / Next week /
            2 weeks / 4 weeks aur 'Set Recurring' wahin milein."

            Beside the field, because "due next week" was four clicks and a
            mental date calculation. Recurrence is here for the same reason: it
            already existed as a Repeat select further down the sheet, which is
            not where anybody is looking when they are setting a deadline.
          */}
          <div className="mt-1.5 flex flex-wrap gap-1" data-testid="task-due-presets">
            {DATE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                data-testid={`task-due-preset-${preset.id}`}
                disabled={patchTask.isPending}
                onClick={() => patchTask.mutate({ dueDate: presetToIso(preset.id, detail.dueDate) })}
                className="rounded-full border border-border/70 px-2 py-0.5 text-[10px] text-muted-foreground hover:border-accent hover:text-foreground disabled:opacity-50"
              >
                {t(preset.labelKey as TranslationKey)}
              </button>
            ))}
            <button
              type="button"
              data-testid="task-due-set-recurring"
              onClick={() => setRecurrenceDialogOpen(true)}
              className="rounded-full border border-dashed border-border/70 px-2 py-0.5 text-[10px] text-muted-foreground hover:border-accent hover:text-foreground"
            >
              {t('taskDetail.setRecurring')}
            </button>
          </div>
        </Field>
        <Field label={t('taskDetail.fieldStartDate')} empty={emptyFields.startDate}>
          <input
            type="datetime-local"
            data-testid="task-start-date"
            value={toDateTimeInput(detail.startDate)}
            onChange={(e) => patchTask.mutate({ startDate: fromDateTimeInput(e.target.value) })}
            disabled={patchTask.isPending}
            className="w-full h-8 rounded-md border border-border bg-card px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          />
        </Field>
        <Field label={t('taskDetail.fieldRepeat')} empty={emptyFields.repeat}>
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
        <Field label={t('taskDetail.fieldEstimate')} empty={emptyFields.timeEstimate}>
          <EstimateInput
            seconds={detail.timeEstimate ?? null}
            pending={patchTask.isPending}
            onCommit={(secs) => {
              if (secs !== (detail.timeEstimate ?? null)) patchTask.mutate({ timeEstimate: secs })
            }}
          />
        </Field>
      </div>

      <Field label={t('taskDetail.fieldAssignees')} empty={emptyFields.assignees}>
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
          <AssigneePicker
            workspaceId={workspaceId}
            members={availableMembers}
            currentUserId={currentUserId}
            onPick={(userId) => addAssignee.mutate(userId)}
            pending={addAssignee.isPending}
          />
        )}
        {(pendingInvitesQuery.data?.length ?? 0) > 0 && (
          <div className="mt-2 text-xs text-muted-foreground">
            {tCount('taskDetail.pendingInvites', pendingInvitesQuery.data?.length ?? 0)}
          </div>
        )}
        {/*
          §V2-S16 frame `15:50` — the offer, beside the assignee control the
          frame shows it beside. Two ways out, exactly as the frame has them:
          take it, or stop being asked.
        */}
        {priorityPromptOpen && (
          <div
            data-testid="priority-prompt"
            className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-accent/40 bg-accent/5 px-3 py-2"
          >
            <span className="text-[12px]">{t('planner.addToPrioritiesAsk')}</span>
            <div className="ml-auto flex items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                data-testid="priority-prompt-mute"
                onClick={() => {
                  mutePriorityPrompt()
                  setPriorityPromptOpen(false)
                }}
                className="h-7 px-2 text-[11px]"
              >
                {t('planner.dontAskAgain')}
              </Button>
              <Button
                type="button"
                size="sm"
                data-testid="priority-prompt-add"
                disabled={priorityActions.add.isPending}
                onClick={addToPriorities}
                className="h-7 px-2 text-[11px]"
              >
                {t('planner.addToPriorities')} →
              </Button>
            </div>
          </div>
        )}
      </Field>

      {/* §V2-10 — LinkedDocsSection moved into the Related Items panel, where
          frame `06:10` puts it: one place that answers "what is this connected
          to", rather than task links in a tab and doc links down here. */}
      <LinkedWorkSection taskId={taskId} workspaceId={workspaceId} />
    </div>
  )
}

/**
 * §V2-S17 frame `15:45` — the assignee picker.
 *
 * WHAT WAS THERE. A row of chips built from `availableMembers.slice(0, 8)`.
 * Eight. With no search, no email entry and no indication that anybody else
 * existed — so in the fixture workspace, which has accumulated seventy-odd
 * members, sixty-odd of them could not be assigned to a task at all. The
 * control was not slow or awkward; it was incapable, and it looked complete.
 *
 * WHAT THE FRAME SHOWS, and what is here:
 *   · a search box, *"Search or enter email…"*          — built
 *   · **People**, with **Me** first                      — built
 *   · **"Invite people via email"**                      — built, gated
 *   · **Agents**, **+ Create Agent**                     — NOT built, see below
 *   · footer **"⚡ Assign with AI"**                      — NOT built, see below
 *
 * AGENTS DO NOT EXIST IN THIS PRODUCT. `ai.service.ts` already says so in as
 * many words, about the same frame's Agent filter: "Rundesk has no agents, so
 * … offering an 'Agent' filter over a product with no agents would be a
 * control that can only ever return everything." An Agents section with a
 * "+ Create Agent" button would be the same mistake with a bigger promise.
 *
 * "ASSIGN WITH AI" IS NOT BUILT EITHER, and the reason is worth writing down
 * because half of it does exist. The AI can assign: `assign_task` is a real
 * tool, declared, previewed and executed. What it cannot do is CHOOSE the
 * person — that is the whole content of the button — and a button that returns
 * an arbitrary colleague with a confident label is worse than no button. It is
 * recorded as an open gap in the re-audit.
 *
 * The invite row is gated on `isManagerOrAbove` because `POST /invitations`
 * requires workspace_admin or manager. `use-workspace-role.ts` puts the rule
 * plainly: "offering one that 403s is the state this fixes."
 */
function AssigneePicker({
  workspaceId,
  members,
  currentUserId,
  onPick,
  pending,
}: {
  workspaceId: string
  members: WorkspaceMemberLite[]
  currentUserId: string
  onPick: (userId: string) => void
  pending: boolean
}) {
  const { t, tCount } = useTranslation()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const { isManagerOrAbove } = useWorkspaceRole(workspaceId)

  const invite = useMutation({
    mutationFn: (email: string) =>
      api('/invitations', { method: 'POST', body: { email, workspaceId, role: 'member' } }),
    onSuccess: (_res, email) => {
      toast.success(t('taskDetail.assignInvited', { email }))
      setQuery('')
      void qc.invalidateQueries({ queryKey: ['workspace-invitations', workspaceId] })
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : t('taskDetail.assignInviteFailed')),
  })

  const needle = query.trim().toLowerCase()
  const matches = useMemo(() => {
    const scored = members.filter(
      (m) =>
        !needle ||
        (m.displayName ?? '').toLowerCase().includes(needle) ||
        m.email.toLowerCase().includes(needle),
    )
    // Yourself first, which is who most assignments are for and what the frame
    // puts at the top of its People section.
    return scored.sort((a, b) =>
      a.userId === currentUserId ? -1 : b.userId === currentUserId ? 1 : 0,
    )
  }, [members, needle, currentUserId])

  /*
   * A cap on what is DRAWN, with the remainder counted out loud. The old code
   * capped at eight and said nothing, which is the difference between a long
   * list and a short one that lies about its length.
   */
  const SHOWN = 20
  const shown = matches.slice(0, SHOWN)
  const hidden = matches.length - shown.length

  const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(query.trim())
  const alreadyHere = members.some((m) => m.email.toLowerCase() === needle)
  const canInvite = looksLikeEmail && !alreadyHere && isManagerOrAbove

  if (!open) {
    return (
      <div className="mt-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid="assignee-picker-open"
          onClick={() => setOpen(true)}
          className="h-7 px-2 text-[11px]"
        >
          + {t('taskDetail.assignPicker')}
        </Button>
      </div>
    )
  }

  return (
    <div
      className="mt-2 rounded-md border border-border bg-card/60 p-2"
      data-testid="assignee-picker"
    >
      <Input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('taskDetail.assignSearchPlaceholder')}
        aria-label={t('taskDetail.assignSearchPlaceholder')}
        data-testid="assignee-search"
        className="h-8"
      />
      <ul className="mt-2 max-h-56 space-y-0.5 overflow-y-auto">
        {shown.map((m) => (
          <li key={m.userId}>
            <button
              type="button"
              data-testid={`assign-member-${m.userId}`}
              disabled={pending}
              onClick={() => {
                onPick(m.userId)
                setOpen(false)
                setQuery('')
              }}
              title={t('taskDetail.assignMember', { name: m.displayName || m.email })}
              className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[12px] hover:bg-muted/60 disabled:opacity-50"
            >
              <span className="truncate">{m.displayName || m.email}</span>
              {m.userId === currentUserId && (
                <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                  {t('taskDetail.assignMe')}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <p className="px-2 pt-1 text-[10px] text-muted-foreground" data-testid="assignee-more-hidden">
          {tCount('taskDetail.assignMoreHidden', hidden)}
        </p>
      )}
      {shown.length === 0 && !canInvite && (
        <p className="px-2 py-1 text-[11px] text-muted-foreground">
          {needle ? t('taskDetail.assignNoMatches') : t('taskDetail.noMoreMembers')}
        </p>
      )}
      {canInvite && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          data-testid="assignee-invite"
          disabled={invite.isPending}
          onClick={() => invite.mutate(query.trim())}
          className="mt-1 h-7 w-full px-2 text-[11px]"
        >
          {t('taskDetail.assignInvite', { email: query.trim() })}
        </Button>
      )}
    </div>
  )
}

/**
 * One field in the detail grid.
 *
 * `empty` is passed by the caller rather than sniffed from `children`, because
 * only the caller knows: an empty date input and a date input holding a date
 * are the same React element with a different `value`, and the rendered node
 * cannot tell you which. §V2-S02 frame `01:20`.
 */
function Field({
  label,
  empty = false,
  children,
}: {
  label: React.ReactNode
  empty?: boolean
  children: React.ReactNode
}) {
  const collapse = useCollapseEmptyFields()
  if (empty && collapse) return null
  return (
    <div data-testid={empty ? 'task-field-empty' : 'task-field'}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{label}</div>
      <div>{children}</div>
    </div>
  )
}

/**
 * The toggle itself, plus how much it is hiding.
 *
 * SAYING THE COUNT IS NOT DECORATION. Collapsed, an empty field and a field
 * that does not exist look identical, and somebody who forgot they turned this
 * on files a bug about a missing field. The count is the difference between
 * hidden and gone.
 */
function CollapseEmptyFieldsToggle({ emptyCount }: { emptyCount: number }) {
  const { t, tCount } = useTranslation()
  const collapse = useCollapseEmptyFields()
  if (emptyCount === 0 && !collapse) return null
  return (
    <div className="flex items-center gap-2 justify-end">
      {collapse && emptyCount > 0 && (
        <span className="text-[11px] text-muted-foreground" data-testid="empty-fields-hidden">
          {tCount('taskDetail.emptyFieldsHidden', emptyCount)}
        </span>
      )}
      <button
        type="button"
        data-testid="collapse-empty-fields"
        aria-pressed={collapse}
        onClick={() => setCollapseEmptyFields(!collapse)}
        className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
      >
        {collapse ? t('taskDetail.showEmptyFields') : t('taskDetail.collapseEmptyFields')}
      </button>
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
  onOpenTask,
}: {
  taskId: string
  parentListId: string
  workspaceId?: string
  inline: Subtask[]
  onOpenTask: (subtaskId: string) => void
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
                <button
                  type="button"
                  onClick={() => onOpenTask(s.id)}
                  title={t('taskDetail.openSubtask')}
                  className={cn(
                    'flex-1 truncate text-left text-sm hover:underline',
                    s.status === 'done' && 'line-through text-muted-foreground',
                  )}
                >
                  {s.title}
                </button>
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
              {/* Deliberately coarse — a full datetime control would be wider
                  than the subtask row it sits in. Coarse is fine; destroying a
                  time it cannot show is not, hence withDatePart. */}
              {editingSubtaskId !== s.id && (
                <input
                  type="date"
                  className="h-7 rounded border border-border bg-background px-1 text-[11px] text-muted-foreground"
                  value={toDateInput(s.dueDate)}
                  onChange={(e) =>
                    setDueDate.mutate({ id: s.id, dueDate: withDatePart(s.dueDate, e.target.value) })
                  }
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
  listId,
  workspaceId,
  checklists,
}: {
  taskId: string
  listId: string
  workspaceId?: string
  checklists: Checklist[]
}) {
  const { t, tCount } = useTranslation()
  const qc = useQueryClient()
  const [templateId, setTemplateId] = useState('')
  // §V2-S03 frame `02:15` — "Add checklist" is its own button, because a task
  // holds SEVERAL named checklists. The panel used to have no way to make one:
  // the only creation path was implicit, inside "add an item", and it
  // short-circuited on `checklists[0]`, so the second checklist was
  // unreachable from the UI on an API that had supported many all along.
  const [addingChecklist, setAddingChecklist] = useState(false)
  const [newChecklistTitle, setNewChecklistTitle] = useState('')

  // Reusable checklists — "main template se bhi checklist kar sakti hoon".
  const templatesQuery = useQuery({
    queryKey: ['checklist-templates', workspaceId],
    queryFn: () => api<ChecklistTemplate[]>(`/workspaces/${workspaceId}/checklist-templates`),
    enabled: !!workspaceId,
  })
  const templates = templatesQuery.data ?? []

  const applyTemplate = useMutation({
    mutationFn: (id: string) =>
      api(`/tasks/${taskId}/checklists/from-template/${id}`, { method: 'POST' }),
    onSuccess: async () => {
      setTemplateId('')
      toast.success(t('taskDetail.checklistTemplateApplied'))
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('taskDetail.checklistTemplateFailed')),
  })

  const saveAsTemplate = useMutation({
    mutationFn: (checklistId: string) =>
      api(`/checklists/${checklistId}/save-as-template`, { method: 'POST', body: {} }),
    onSuccess: async () => {
      toast.success(t('taskDetail.checklistTemplateSaved'))
      await qc.invalidateQueries({ queryKey: ['checklist-templates', workspaceId] })
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('taskDetail.checklistTemplateFailed')),
  })

  const membersQuery = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => api<WorkspaceMemberLite[]>(`/workspaces/${workspaceId}/members`),
    enabled: !!workspaceId,
  })
  const members = membersQuery.data ?? []
  const [editingChecklistId, setEditingChecklistId] = useState<string | null>(null)
  const [editingChecklistTitle, setEditingChecklistTitle] = useState('')
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingItemContent, setEditingItemContent] = useState('')

  /*
   * Frame `02:15` — the section header carries an open-item count
   * ("Checklists 2 open"). Open, not total: what is left is the number a
   * person opening the tab is looking for.
   */
  const totals = useMemo(() => {
    let open = 0
    let total = 0
    for (const cl of checklists) {
      total += cl.items.length
      open += cl.items.filter((i) => !i.isDone).length
    }
    return { open, total }
  }, [checklists])

  const createChecklist = useMutation({
    mutationFn: (title: string) =>
      api<{ id: string }>(`/tasks/${taskId}/checklists`, { method: 'POST', body: { title } }),
    onSuccess: async () => {
      setAddingChecklist(false)
      setNewChecklistTitle('')
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('taskDetail.checklistCreateFailed')),
  })

  const addItem = useMutation({
    mutationFn: async ({
      checklistId,
      content,
      assigneeId,
    }: { checklistId: string | null; content: string; assigneeId: string | null }) => {
      // `checklistId` is null only from the empty state, where there is no list
      // to choose yet. Every other form belongs to a specific checklist and
      // says so — the old single form at the bottom of the panel always wrote
      // into `checklists[0]` no matter which list you were looking at.
      const id =
        checklistId ??
        (
          await api<{ id: string }>(`/tasks/${taskId}/checklists`, {
            method: 'POST',
            body: { title: t('taskDetail.checklistDefaultTitle') },
          })
        ).id
      return api(`/tasks/${taskId}/checklists/${id}/items`, {
        method: 'POST',
        body: { content, assigneeId },
      })
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('taskDetail.checklistCreateFailed')),
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
    mutationFn: ({ itemId, ...patch }: { itemId: string; dueDate?: string | null; assigneeId?: string | null }) =>
      api(`/tasks/${taskId}/checklists/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })

  const convertItem = useMutation({
    mutationFn: async ({ item, asSubtask }: { item: ChecklistItem; asSubtask: boolean }) => {
      await api('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: item.content,
          listId,
          ...(asSubtask ? { parentTaskId: taskId } : {}),
          ...(item.assigneeId ? { assigneeIds: [item.assigneeId] } : {}),
        }),
      })
      // The item has become the task; leaving it would duplicate the work.
      await api(`/tasks/${taskId}/checklists/items/${item.id}`, { method: 'DELETE' })
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
      await qc.invalidateQueries({ queryKey: ['tasks'] })
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
    <div className="space-y-3" data-testid="checklists-panel">
      {/* Frame `02:15` — heading, open count, and "Add checklist" on the right. */}
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium">{t('taskDetail.tab.checklists')}</h3>
        {totals.total > 0 && (
          <span
            data-testid="checklist-open-count"
            className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
          >
            {totals.open > 0 ? tCount('taskDetail.checklistOpen', totals.open) : t('taskDetail.checklistAllDone')}
          </span>
        )}
        <div className="flex-1" />
        {addingChecklist ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const title = newChecklistTitle.trim()
              if (title) createChecklist.mutate(title)
            }}
          >
            <Input
              autoFocus
              value={newChecklistTitle}
              onChange={(e) => setNewChecklistTitle(e.target.value)}
              placeholder={t('taskDetail.checklistNamePlaceholder')}
              aria-label={t('taskDetail.checklistNamePlaceholder')}
              data-testid="checklist-name-input"
              className="h-8 w-[190px]"
            />
            <Button
              type="submit"
              size="sm"
              data-testid="checklist-create-confirm"
              disabled={!newChecklistTitle.trim() || createChecklist.isPending}
            >
              {t('taskDetail.add')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setAddingChecklist(false)
                setNewChecklistTitle('')
              }}
            >
              {t('common.cancel')}
            </Button>
          </form>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-testid="checklist-add"
            onClick={() => setAddingChecklist(true)}
          >
            + {t('taskDetail.checklistAdd')}
          </Button>
        )}
      </div>
      {templates.length > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-border/70 bg-card/40 px-3 py-2">
          <span className="text-[12px] text-muted-foreground shrink-0">{t('taskDetail.checklistFromTemplate')}</span>
          <select
            value={templateId}
            onChange={(e) => {
              const next = e.target.value
              setTemplateId(next)
              if (next) applyTemplate.mutate(next)
            }}
            aria-label={t('taskDetail.checklistFromTemplate')}
            disabled={applyTemplate.isPending}
            className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-[13px]"
          >
            <option value="">{t('taskDetail.checklistPickTemplate')}</option>
            {templates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name} ({tpl.items.length})
              </option>
            ))}
          </select>
        </div>
      )}
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
                  <div className="text-sm font-medium">{cl.title}</div>
                  {/* Per-list count as well as the section total: with several
                      named checklists, one number for the whole tab cannot say
                      which list still has work left in it. */}
                  <span
                    data-testid="checklist-progress"
                    title={t('taskDetail.checklistProgressLabel', {
                      done: cl.items.filter((i) => i.isDone).length,
                      total: cl.items.length,
                    })}
                    className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
                  >
                    {cl.items.filter((i) => i.isDone).length}/{cl.items.length}
                  </span>
                  <div className="flex-1" />
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
                  {/* Turn a list someone built by hand into something reusable,
                      rather than making them retype it on the next task. */}
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    disabled={saveAsTemplate.isPending}
                    onClick={() => saveAsTemplate.mutate(cl.id)}
                  >
                    {t('taskDetail.checklistSaveTemplate')}
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
                      data-testid="checklist-item-checkbox"
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
                    {/* The client asked for an assignee here rather than a date:
                        a checklist line is work someone owns, not a deadline. */}
                    <select
                      value={item.assigneeId ?? ''}
                      onChange={(e) => updateItemMeta.mutate({ itemId: item.id, assigneeId: e.target.value || null })}
                      aria-label={t('taskDetail.checklistAssignLabel', { item: item.content })}
                      className="h-7 w-[145px] shrink-0 rounded-md border border-border bg-background px-1.5 text-[12px]"
                    >
                      <option value="">{t('taskDetail.checklistUnassigned')}</option>
                      {members.map((m) => (
                        <option key={m.userId} value={m.userId}>{m.displayName || m.email}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                      title={t('taskDetail.checklistConvertTask')}
                      disabled={convertItem.isPending}
                      onClick={() => convertItem.mutate({ item, asSubtask: false })}
                    >
                      {t('taskDetail.checklistConvertTask')}
                    </button>
                    <button
                      type="button"
                      className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                      title={t('taskDetail.checklistConvertSubtask')}
                      disabled={convertItem.isPending}
                      onClick={() => convertItem.mutate({ item, asSubtask: true })}
                    >
                      {t('taskDetail.checklistConvertSubtask')}
                    </button>
                    <button
                      type="button"
                      className="shrink-0 text-xs text-rose-500 hover:text-rose-600"
                      onClick={() => deleteItem.mutate(item.id)}
                    >
                      {t('common.delete')}
                    </button>
                  </li>
                ))
              )}
            </ul>
            {/* Frame `02:15` — "Add item" belongs to the checklist it is under.
                One form at the bottom of the panel could only ever feed the
                first list. */}
            <ChecklistItemForm
              members={members}
              pending={addItem.isPending}
              onAdd={(content, assigneeId) =>
                addItem.mutateAsync({ checklistId: cl.id, content, assigneeId })
              }
            />
          </div>
        ))
      )}

      {/* With no checklist yet there is nothing to add an item to, so this one
          form makes the default list on the way — the behaviour the empty
          state's own hint promises. */}
      {checklists.length === 0 && (
        <ChecklistItemForm
          members={members}
          pending={addItem.isPending}
          onAdd={(content, assigneeId) => addItem.mutateAsync({ checklistId: null, content, assigneeId })}
        />
      )}
    </div>
  )
}

/**
 * The "Add item" row under a single checklist.
 *
 * Its own component so each checklist keeps its own draft: with the state
 * hoisted into the panel, typing into one list's box would have shown the same
 * text under every other list.
 */
function ChecklistItemForm({
  members,
  pending,
  onAdd,
}: {
  members: WorkspaceMemberLite[]
  pending: boolean
  onAdd: (content: string, assigneeId: string | null) => Promise<unknown>
}) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [assignee, setAssignee] = useState('')
  return (
    <form
      data-testid="checklist-item-form"
      className="flex gap-2 border-t border-border px-3 py-2"
      onSubmit={async (e) => {
        e.preventDefault()
        const content = text.trim()
        if (!content) return
        try {
          await onAdd(content, assignee || null)
        } catch {
          // The mutation has already surfaced the failure; keep what was typed
          // so the person can retry rather than retype it.
          return
        }
        setText('')
        setAssignee('')
      }}
    >
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('taskDetail.addChecklistItemPlaceholder')}
        data-testid="checklist-item-input"
        className="h-8"
      />
      <select
        value={assignee}
        onChange={(e) => setAssignee(e.target.value)}
        aria-label={t('taskDetail.checklistAssignNewLabel')}
        className="h-8 w-[155px] shrink-0 rounded-md border border-border bg-background px-2 text-sm"
      >
        <option value="">{t('taskDetail.checklistUnassigned')}</option>
        {members.map((m) => (
          <option key={m.userId} value={m.userId}>{m.displayName || m.email}</option>
        ))}
      </select>
      <Button type="submit" disabled={!text.trim() || pending} size="sm">
        {t('taskDetail.add')}
      </Button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Watchers
// ---------------------------------------------------------------------------

function WatchersPanel({
  taskId,
  workspaceId,
  inline,
  createdById,
  assigneeIds,
}: {
  taskId: string
  workspaceId?: string
  inline: Watcher[]
  createdById: string | null
  assigneeIds: string[]
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
  // §A4.7 — auto-follow is derived from what you did to the task, so the reason
  // is derivable too. Saying it out loud is the difference between "why am I
  // getting this?" and knowing which button stops it.
  const followReason = useMemo(() => {
    if (!currentUser || !isWatching) return null
    if (createdById && createdById === currentUser.id) return t('taskDetail.followBecauseCreated')
    if (assigneeIds.includes(currentUser.id)) return t('taskDetail.followBecauseAssigned')
    return t('taskDetail.followBecauseWatching')
  }, [currentUser, isWatching, createdById, assigneeIds, t])
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
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">
            {tCount('taskDetail.watchersCount', inline.length)}
          </p>
          {followReason && <p className="text-xs text-muted-foreground/80 mt-0.5">{followReason}</p>}
        </div>
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
            aria-label={t('taskDetail.addWatcherOption')}
            data-testid="add-follower-select"
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
            data-testid="add-follower-submit"
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

/**
 * §V2-10 — "Related Items", frame `06:10`.
 *
 * The frame is ONE panel with two tabs, **Relationships | References**, an
 * empty state reading *"No related items — Link related Tasks or Docs to
 * organize and quickly access them here"*, and a single **+ Relate a Task or
 * Doc**.
 *
 * WHAT WAS WRONG. Rundesk had both halves and neither was here. Task↔task
 * dependencies lived in a tab; task↔doc links lived in a section hundreds of
 * lines further down the same sheet, under a different heading, with its own
 * add flow. Two answers to one question — "what is this connected to?" — in
 * two places, and the item that was supposed to build this panel shipped
 * something else entirely (the doc-side backlink) and was marked done.
 *
 * WHICH TAB MEANS WHAT, and this is a READING rather than a certainty. The
 * video never opens either tab. Rundesk has exactly two kinds of relation —
 * task↔task and task↔doc — so Relationships is read as the first and
 * References as the second, which is also what the frame's own empty state
 * says: "Link related **Tasks or Docs**".
 *
 * The alternative reading is that References means BACKLINKS — everywhere this
 * task is mentioned. That is not buildable today and the gap is worth naming:
 * a task mention in a comment is written as `#<title>` PLAIN TEXT
 * (`insertTaskMention`), so nothing records that one thing referred to
 * another, and a rename silently orphans the words. Backlinks need that fixed
 * first.
 */
function RelatedItemsPanel({
  taskId,
  workspaceId,
  inline,
  onOpenTask,
}: {
  taskId: string
  /* Optional for the same reason DependenciesPanel's is: the sheet can be
   * opened from a place that has not resolved the workspace yet. */
  workspaceId?: string
  inline: Dependency[]
  onOpenTask: (relatedTaskId: string) => void
}) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'relationships' | 'references'>('relationships')

  return (
    <div className="space-y-3" data-testid="related-items-panel">
      <div className="flex gap-1 border-b border-border/60">
        {(['relationships', 'references'] as const).map((key) => (
          <button
            key={key}
            type="button"
            data-testid={`related-tab-${key}`}
            aria-current={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              'px-2.5 py-1.5 text-[12px] transition-colors',
              tab === key
                ? '-mb-px border-b-2 border-accent font-medium text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t(`taskDetail.related.${key}` as TranslationKey)}
          </button>
        ))}
      </div>

      {tab === 'relationships' ? (
        <DependenciesPanel
          taskId={taskId}
          workspaceId={workspaceId}
          inline={inline}
          onOpenTask={onOpenTask}
        />
      ) : (
        <LinkedDocsSection taskId={taskId} workspaceId={workspaceId} />
      )}
    </div>
  )
}

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
  const [draggingFiles, setDraggingFiles] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
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
  /*
   * Takes FILES, because a drop is inherently several and the picker was
   * single. One mutation for both routes, so the drop cannot drift from the
   * button — the upload triple (presign, PUT, record) is already written
   * inline in several places in this codebase and a seventh copy is how they
   * get out of step.
   */
  const uploadAttachment = useMutation({
    mutationFn: async (files: File[]) => {
      for (const file of files) {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          // One oversized file must not abort the rest of the drop.
          toast.error(t('taskDetail.fileTooLarge', { limit: MAX_ATTACHMENT_BYTES / (1024 * 1024) }))
          continue
        }
        const contentType = file.type || 'application/octet-stream'
        const presign = await api<{ uploadUrl: string; storageKey: string }>(`/tasks/${taskId}/attachments/presign`, {
          method: 'POST',
          body: { fileName: file.name, contentType, sizeBytes: file.size },
        })
        const putRes = await fetch(presign.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': contentType },
          body: file,
        })
        // Reject when the storage PUT is blocked/failed so we never record a phantom attachment.
        if (!putRes.ok) throw new Error(t('taskDetail.uploadFailedStatus', { status: putRes.status }))
        await api(`/tasks/${taskId}/attachments`, {
          method: 'POST',
          body: { fileName: file.name, storageKey: presign.storageKey, contentType, sizeBytes: file.size },
        })
      }
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
      {/*
        THIS ZONE USED TO BE A PICTURE OF A DROP ZONE.
        It rendered "Drag and drop files here to upload" over a dashed border
        with NO onDrop, onDragOver or onDragEnter anywhere in this file — and
        the empty state said "Drop files above to get started", so the lie was
        told twice. Uploading worked only through the separate file input
        below.

        Frame `01:55` shows one zone that is both: "Drop files here or browse".
        So it takes a drop AND opens the picker on click, and the two go
        through the same mutation — a drop that used its own upload path is a
        second copy waiting to drift.

        `isFileDrag` guards on the dataTransfer TYPES rather than on files,
        because during dragover the file list is deliberately empty; testing
        `files.length` there would reject every real drag. Copied from the chat
        pane, which learned it the same way.
      */}
      <div
        data-testid="task-attachments-dropzone"
        role="button"
        tabIndex={uploadWired ? 0 : -1}
        aria-disabled={!uploadWired}
        onClick={() => uploadWired && fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (!uploadWired) return
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click() }
        }}
        onDragOver={(e) => {
          if (!uploadWired || !Array.from(e.dataTransfer.types).includes('Files')) return
          e.preventDefault()
          setDraggingFiles(true)
        }}
        onDragLeave={(e) => {
          // Ignore the events fired while crossing this zone's own children.
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
          setDraggingFiles(false)
        }}
        onDrop={(e) => {
          if (!uploadWired || !Array.from(e.dataTransfer.types).includes('Files')) return
          e.preventDefault()
          setDraggingFiles(false)
          const files = Array.from(e.dataTransfer.files ?? [])
          if (files.length) uploadAttachment.mutate(files)
        }}
        className={cn(
          'rounded-md border-2 border-dashed px-4 py-8 text-center text-sm transition-colors',
          uploadWired && 'cursor-pointer',
          draggingFiles
            ? 'border-accent bg-accent/10 text-foreground'
            : 'border-border bg-muted/20 text-muted-foreground',
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
              ref={fileInputRef}
              type="file"
              multiple
              data-testid="task-attachments-input"
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? [])
                // Picking several and dropping several now behave identically.
                if (picked.length > 1) uploadAttachment.mutate(picked)
                else setSelectedFile(picked[0] ?? null)
              }}
              className="h-8"
            />
            <Button
              size="sm"
              onClick={() => uploadAttachment.mutate(selectedFile ? [selectedFile] : [])}
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

/**
 * §V2-05 — what a comment's attachments look like.
 *
 * Frame `04:45` renders a voice note as an inline player and frame `05:35`
 * renders a recorded clip as a video with a play button inside the comment. So
 * audio and video are PLAYED here, not linked: a voice note behind a paperclip
 * and a filename is a voice note nobody listens to, which is the whole reason
 * she records one instead of typing.
 *
 * The kind is decided from the MIME type by `presentationFor`, so this applies
 * to an audio file somebody uploaded from their phone exactly as it does to one
 * recorded in the composer — the same rule, not a flag set at record time.
 */
/**
 * §V2-S02 frame `01:35` — the estimate box, and the row that says what it heard.
 *
 * It was `<input type="number">` in hours, so ninety minutes had to be entered
 * as `1.5` and `2h 30m` could not be said at all. Now it takes text and shows
 * the interpretation BEFORE committing it: typing `12` offers "12 hours", which
 * is the frame's own example, and typing nonsense offers nothing rather than
 * recording a number nobody meant.
 *
 * The parsing lives in `lib/estimate.ts` because the quick-create modal needs
 * the same answer — two places that disagreed about what `90m` means would be
 * worse than neither understanding it.
 */
function EstimateInput({
  seconds,
  pending,
  onCommit,
}: {
  seconds: number | null
  pending: boolean
  onCommit: (seconds: number | null) => void
}) {
  const { t, tCount } = useTranslation()
  const [text, setText] = useState(() => formatEstimate(seconds))
  const [focused, setFocused] = useState(false)
  // Follow the server when it changes underneath — but never while somebody is
  // mid-edit, which would rewrite what they are typing.
  useEffect(() => {
    if (!focused) setText(formatEstimate(seconds))
  }, [seconds, focused])

  const parsed = parseEstimate(text)
  const commit = () => {
    const next = text.trim() === '' ? null : parsed?.seconds ?? null
    // Unparseable text is not a reason to wipe an estimate that exists: put
    // back what is actually stored and leave it alone.
    if (text.trim() !== '' && !parsed) {
      setText(formatEstimate(seconds))
      return
    }
    onCommit(next)
  }

  return (
    <div className="relative">
      <input
        type="text"
        inputMode="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          commit()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.currentTarget.blur()
          }
        }}
        disabled={pending}
        placeholder={t('taskDetail.estimatePlaceholder')}
        data-testid="task-estimate-input"
        className="w-full h-8 rounded-md border border-border bg-card px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
      />
      {/*
        The frame's suggestion row. It appears only while the box has focus and
        only when the text means something — a row that said "12 hours" under an
        unparseable box would be the field agreeing with something it did not
        understand.
      */}
      {focused && parsed && formatEstimate(parsed.seconds) !== text.trim() && (
        <button
          type="button"
          data-testid="task-estimate-suggestion"
          // `onMouseDown` rather than `onClick`: blur fires first otherwise and
          // the row is gone before the click lands on it.
          onMouseDown={(e) => {
            e.preventDefault()
            setText(formatEstimate(parsed.seconds))
            onCommit(parsed.seconds)
          }}
          className="absolute left-0 right-0 top-9 z-10 rounded-md border border-border bg-popover px-2 py-1 text-left text-xs shadow-md hover:bg-muted"
        >
          {parsed.hours && parsed.minutes
            ? t('taskDetail.estimateHoursMinutes', { hours: parsed.hours, minutes: parsed.minutes })
            : parsed.hours
              ? tCount('taskDetail.estimateHours', parsed.hours)
              : tCount('taskDetail.estimateMinutes', parsed.minutes)}
        </button>
      )}
    </div>
  )
}

function CommentAttachments({
  files,
}: {
  files?: Array<{ id: string; fileName: string; fileSize?: number | null; mimeType?: string | null; url?: string | null }>
}) {
  if (!files || files.length === 0) return null
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {files.map((f) => {
        // Without a URL there is nothing to play; those fall through to the
        // link, which at least names the file.
        const kind = f.url ? presentationFor(f.mimeType) : 'file'
        if (kind === 'audio') {
          return (
            <div key={f.id} data-testid="comment-audio" className="w-full max-w-sm">
              <audio src={f.url ?? undefined} controls preload="metadata" className="w-full h-9" />
              <div className="mt-0.5 text-[10px] text-muted-foreground truncate">{f.fileName}</div>
            </div>
          )
        }
        if (kind === 'video') {
          /*
           * §V2-S05 frames `05:35`–`05:40` — a clip in a comment is a CARD with
           * its name on it, not a bare player with a caption underneath.
           *
           * WHAT IS DELIBERATELY NOT HERE, because the frame's other card
           * actions already exist by a different route or cannot be honest:
           *
           *  · `00:00 / 00:16`, download and expand are the NATIVE player's own
           *    controls, which this `<video controls>` already carries. ClickUp
           *    draws a custom player and has to rebuild them; rebuilding ours to
           *    match a screenshot would replace working controls with a worse
           *    copy.
           *
           *  · COPY LINK is absent on purpose, and this is the interesting one.
           *    An attachment's URL is signed by `r2.getObjectUrl` for 900
           *    seconds. A "Copy link" here would hand somebody a link that dies
           *    in fifteen minutes — it pastes, it looks right, and it stops
           *    working over lunch. That is a worse failure than not offering it.
           *    The "Clip created!" card CAN offer one because it goes through
           *    `POST /clips/share`, which takes an explicit expiry.
           *
           *  · "More" would be a menu with nothing in it.
           */
          return (
            <div key={f.id} data-testid="comment-video" className="w-full max-w-sm">
              <div
                className="truncate rounded-t-md border border-b-0 border-border bg-muted/40 px-2 py-1 text-[11px] font-medium"
                data-testid="comment-clip-title"
                title={f.fileName}
              >
                {f.fileName}
              </div>
              <video
                src={f.url ?? undefined}
                controls
                preload="metadata"
                className="w-full max-h-64 rounded-b-md border border-border bg-black"
              />
            </div>
          )
        }
        if (kind === 'image') {
          return (
            <a key={f.id} href={f.url ?? undefined} target="_blank" rel="noreferrer" title={f.fileName}>
              <img
                src={f.url ?? undefined}
                alt={f.fileName}
                loading="lazy"
                className="h-16 w-16 rounded-md object-cover border border-border"
              />
            </a>
          )
        }
        /*
         * §V2-S05 frame `05:35` — the processing state, and a REAL DEAD LINK
         * found on the way to it.
         *
         * `kind` is computed as `f.url ? presentationFor(...) : 'file'`, so a
         * RECORDING whose URL has not resolved yet did not just miss its
         * player — it fell through to here and rendered `<a href="#">`: a
         * paperclip link that goes nowhere, on a file that is still arriving.
         * Clicking it did nothing at all.
         *
         * Now it says what is actually happening. Anything else without a URL
         * gets the same treatment, because a link to `#` is never the truth.
         */
        if (!f.url) {
          const stillArriving = presentationFor(f.mimeType) !== 'file'
          return (
            <div
              key={f.id}
              data-testid={stillArriving ? 'comment-clip-processing' : 'comment-file-pending'}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1 text-xs text-muted-foreground"
            >
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="max-w-[160px] truncate">{f.fileName}</span>
            </div>
          )
        }
        return (
          <a
            key={f.id}
            href={f.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1 text-xs hover:bg-muted/60"
          >
            <Paperclip className="h-3 w-3 text-muted-foreground" />
            <span className="max-w-[160px] truncate">{f.fileName}</span>
          </a>
        )
      })}
    </div>
  )
}

function CommentsPanel({
  taskId,
  workspaceId,
  focusCommentId,
  listId,
}: {
  taskId: string
  workspaceId?: string
  /** §V2-S06 — the one comment to scroll to and mark, arriving from a link. */
  focusCommentId?: string | null
  /**
   * §V2-S05 — where "Create a task" from the "Clip created!" card puts it.
   * This task's own list: the list the person is already working in, and the
   * frame offers no picker.
   */
  listId?: string | null
}) {
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
  /*
   * §V2-S05b frame `04:50` — the composer's "+" menu.
   *
   * THE RE-AUDIT SAID "the ten items exist scattered, no menu gathers them".
   * Half true, and checking it was worth the time: Record a Video Clip, Add a
   * file and Mention a task did exist; assigning the comment you are WRITING,
   * an emoji inserter, and the three "New …" entry points did not; and Slash
   * commands and Brain have no engine at all. So this is a menu plus the three
   * pieces that make its entries real, not a menu over ten finished things.
   */
  const [assignTo, setAssignTo] = useState<string>('')
  /*
   * §V2-S05c — slash commands in the COMMENT composer, frame `04:50`.
   *
   * The description has had them since §G15 `[22:28]`; the composer did not,
   * and the "+" menu could not honestly offer them. The prerequisite was that
   * comments RENDER markdown, or a slash command would insert `## ` and leave
   * it on screen as two hashes for ever — see the `markdown` prop on
   * `MentionText`.
   */
  const [commentSlashOpen, setCommentSlashOpen] = useState(false)
  const [commentSlashQuery, setCommentSlashQuery] = useState('')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [quickCreate, setQuickCreate] = useState<'task' | 'doc' | 'whiteboard' | null>(null)
  const commentFileInputRef = useRef<HTMLInputElement | null>(null)
  const commentTextRef = useRef<HTMLTextAreaElement | null>(null)
  const startRecordingRef = useRef<((kind: 'voice' | 'clip') => void) | null>(null)
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
  /*
   * §V2-05 frame `04:00`. The picker's people come from the TASK, not the
   * workspace, because the workspace list cannot say who is locked out of this
   * one. It falls back to the plain member list if the endpoint is missing, so
   * an older API loses the warning rather than the picker.
   */
  const candidatesQuery = useQuery({
    queryKey: ['task', taskId, 'mention-candidates'],
    queryFn: async () => {
      try {
        return await api<MentionCandidate[]>(`/tasks/${taskId}/comments/mention-candidates`)
      } catch (err) {
        if (isNotWired(err)) return null
        throw err
      }
    },
  })
  const members = membersQuery.data ?? []
  const mentionPeople: MentionCandidate[] =
    candidatesQuery.data ?? members.map((m) => ({ ...m, hasAccess: true }))
  const mentionCandidates = mentionPeople.filter((m) =>
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
      const posted = await api<{ id: string }>(`/tasks/${taskId}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          body: text,
          parentCommentId: replyTo ?? undefined,
          mentions: selectedMentionUserIds.map((userId) => ({ userId, offset: 0, length: 0 })),
          attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
        }),
      })
      /*
       * "Assign comment" is chosen BEFORE posting, so the assignment happens
       * here rather than being a second thing to remember afterwards. It is a
       * separate request because the API assigns an existing comment — and if
       * it fails the comment still exists, so the error says so rather than
       * pretending the whole post failed.
       */
      if (assignTo) {
        const name =
          members.find((m) => m.userId === assignTo)?.displayName ||
          members.find((m) => m.userId === assignTo)?.email ||
          assignTo
        try {
          await api(`/tasks/${taskId}/comments/${posted.id}/assign`, {
            method: 'POST',
            body: { userId: assignTo },
          })
          toast.success(t('commentPlus.assignedOnPost', { name }))
        } catch {
          toast.error(t('commentPlus.assignFailed'))
        }
      }
      return posted
    },
    onSuccess: async () => {
      setText('')
      setCommentFiles([])
      setReplyTo(null)
      setSelectedMentionUserIds([])
      setAssignTo('')
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

  /*
   * §V2-S06 frame `05:55` — "reply/thread, assign, save — same like messages".
   *
   * The toast names WHERE it went, because a bookmark you cannot find again is
   * the same as no bookmark: saved comments land in the Inbox's Later tab,
   * beside the saved messages §2.2 put there. `chat-saved-comments` is
   * invalidated too so that tab is right the moment you switch to it rather
   * than after a reload.
   */
  const saveComment = useMutation({
    mutationFn: ({ commentId, saved }: { commentId: string; saved: boolean }) =>
      api(`/tasks/${taskId}/comments/${commentId}/save`, { method: saved ? 'POST' : 'DELETE' }),
    onSuccess: async (_data, vars) => {
      toast.success(t(vars.saved ? 'taskDetail.commentSavedToast' : 'taskDetail.commentUnsavedToast'))
      await qc.invalidateQueries({ queryKey: ['task', taskId, 'comments'] })
      await qc.invalidateQueries({ queryKey: ['saved-comments'] })
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : t('taskDetail.couldNotSaveComment')),
  })

  /**
   * One button, two call sites — the root row and the reply row. The comment
   * action row is already duplicated between those two, and a second copy of
   * the save would be the ninth instance of this codebase's duplicated-logic
   * defect.
   */
  const SaveCommentButton = ({ comment }: { comment: TaskComment }) => (
    <button
      type="button"
      className={
        comment.savedByMe
          ? 'text-xs text-accent hover:text-accent/80 inline-flex items-center gap-1'
          : 'text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1'
      }
      title={t(comment.savedByMe ? 'taskDetail.unsaveComment' : 'taskDetail.saveComment')}
      aria-pressed={comment.savedByMe ? 'true' : 'false'}
      data-testid={`comment-save-${comment.id}`}
      onClick={() => saveComment.mutate({ commentId: comment.id, saved: !comment.savedByMe })}
    >
      <Bookmark className={comment.savedByMe ? 'h-3 w-3 fill-current' : 'h-3 w-3'} />
      {t(comment.savedByMe ? 'taskDetail.unsaveComment' : 'taskDetail.saveComment')}
    </button>
  )

  /*
   * §V2-S06 — scroll the linked comment into view once the list has arrived.
   *
   * Keyed on the loaded length as well as the id: the effect fires while the
   * query is still pending, when the row it is looking for does not exist yet.
   * A DOM query rather than a ref map because the target may be a REPLY, which
   * is rendered by a different branch — one lookup covers both.
   */
  const commentListRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!focusCommentId) return
    const el = commentListRef.current?.querySelector(`[data-comment-id="${focusCommentId}"]`)
    el?.scrollIntoView({ block: 'center' })
  }, [focusCommentId, commentsQuery.data?.length])

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
    <div className="space-y-3" ref={commentListRef}>
      {comments.length === 0 ? (
        <EmptyState title={t('taskDetail.noComments')} hint={t('taskDetail.noCommentsHint')} />
      ) : (
        <ul className="space-y-2">
          {roots.map((c) => {
            const replies = repliesByParent.get(c.id) ?? []
            const focused = c.id === focusCommentId
            return (
              <li
                key={c.id}
                data-comment-id={c.id}
                data-testid={focused ? 'comment-focused' : undefined}
                className={
                  focused
                    ? 'rounded-md border border-accent ring-2 ring-accent/40 bg-accent/5 p-3 transition-colors space-y-2'
                    : 'rounded-md border border-border p-3 hover:bg-muted/30 transition-colors space-y-2'
                }
              >
                {focused && (
                  <p className="text-[11px] text-accent" data-testid="comment-focused-note">
                    {t('taskDetail.savedCommentHighlight')}
                  </p>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">
                    {c.author?.displayName ?? c.author?.email ?? t('taskDetail.userFallback')}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(c.createdAt).toLocaleString()}
                  </span>
                </div>
                {/*
                  §V2-S05c — `markdown` on, so a block the slash menu inserted
                  is laid out rather than shown as its own syntax. A comment
                  with no block markdown renders exactly as it always did; see
                  the `hasBlockMarkdown` note in MentionText.
                */}
                <MentionText markdown text={c.body} namesById={namesById} className="mt-1 text-sm" />
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
                  <SaveCommentButton comment={c} />
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
                      <li
                        key={reply.id}
                        data-comment-id={reply.id}
                        data-testid={reply.id === focusCommentId ? 'comment-focused' : undefined}
                        className={
                          reply.id === focusCommentId
                            ? 'rounded border border-accent ring-2 ring-accent/40 p-2 bg-accent/5'
                            : 'rounded border border-border/70 p-2 bg-card/50'
                        }
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium">
                            {reply.author?.displayName ?? reply.author?.email ?? t('taskDetail.userFallback')}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(reply.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <MentionText markdown text={reply.body} namesById={namesById} className="mt-1 text-sm" />
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
                          {/* A reply is a comment: it saves the same way. */}
                          <SaveCommentButton comment={reply} />
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
          ref={commentTextRef}
          value={text}
          onChange={(e) => {
            const next = e.target.value
            setText(next)
            /*
             * A slash only starts a command at the start of a line or after a
             * space — otherwise "and/or" or a URL would open the menu, which is
             * the behaviour that makes people stop typing slashes.
             */
            const caret = e.target.selectionStart ?? next.length
            const before = next.slice(0, caret)
            const slash = before.lastIndexOf('/')
            const opensCommand =
              slash !== -1 &&
              (slash === 0 || /[\s]/.test(before[slash - 1])) &&
              !/\s/.test(before.slice(slash + 1))
            setCommentSlashOpen(opensCommand)
            setCommentSlashQuery(opensCommand ? before.slice(slash + 1) : '')
          }}
          placeholder={t('taskDetail.commentPlaceholder')}
          data-testid="comment-input"
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
          <div
            data-testid="comment-mention-picker"
            className="mt-2 rounded-lg border border-border bg-card shadow-lg overflow-hidden"
          >
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
                    data-testid="mention-candidate"
                    data-has-access={member.hasAccess ? 'yes' : 'no'}
                    className={cn(
                      'w-full px-2.5 py-2 text-left text-xs flex items-center gap-2',
                      idx === mentionIndex ? 'bg-muted' : 'hover:bg-muted/70',
                    )}
                    onMouseEnter={() => setMentionIndex(idx)}
                    onClick={() => insertMention(member)}
                  >
                    <div
                      className={cn(
                        'h-6 w-6 rounded-full bg-brand-100 text-foreground text-[10px] font-semibold flex items-center justify-center',
                        !member.hasAccess && 'opacity-50',
                      )}
                    >
                      {(member.displayName || member.email)[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className={cn('font-medium truncate', member.hasAccess ? 'text-foreground' : 'text-muted-foreground')}>
                        {member.displayName || member.email}
                      </div>
                      {/*
                       * The warning of frame `04:00`, in place of the email —
                       * the row is one line tall and the thing worth reading
                       * about somebody who cannot open the task is not their
                       * address.
                       *
                       * They are NOT removed from the list. Mentioning
                       * somebody is often how you ask for them to be let in,
                       * and a picker that hides them makes that impossible
                       * while explaining nothing.
                       */}
                      {member.hasAccess ? (
                        <div className="text-muted-foreground truncate">{member.email}</div>
                      ) : (
                        <div data-testid="mention-no-access" className="text-amber-600 dark:text-amber-500 truncate">
                          {t('taskDetail.mentionNoAccess')}
                        </div>
                      )}
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
        {/*
         * §V2-05 — the mic of frame `04:10` and the "+" menu's Record a Video
         * Clip of frame `04:56`. Both hand back a File and go up the same
         * presign/upload path as a picked attachment, so a voice note is an
         * attachment on the comment rather than a fifth kind of thing.
         */}
        <div className="mt-2">
          <CommentRecorder
            startRef={startRecordingRef}
            workspaceId={workspaceId}
            listId={listId ?? undefined}
            onAttach={(file) => setCommentFiles((prev) => [...prev, file])}
            onTranscript={(append) => setText((prev) => append(prev))}
          />
        </div>
        {/*
          §V2-S05c frame `04:50` — the slash menu, and the same blocks the
          description offers because both read `COMPOSER_BLOCKS`.
        */}
        {commentSlashOpen && (
          <div
            data-testid="comment-slash-menu"
            className="mt-1 max-h-48 overflow-auto rounded-lg border border-border bg-card shadow-lg"
          >
            {matchBlocks(COMPOSER_BLOCKS, commentSlashQuery, t).length === 0 ? (
              <div className="px-2.5 py-2 text-xs text-muted-foreground">
                {t('taskDetail.slashNoMatch')}
              </div>
            ) : (
              matchBlocks(COMPOSER_BLOCKS, commentSlashQuery, t).map((block) => (
                <button
                  key={block.id}
                  type="button"
                  data-testid={`comment-slash-${block.id}`}
                  // onMouseDown, so the click lands before the textarea blurs.
                  onMouseDown={(e) => {
                    e.preventDefault()
                    const el = commentTextRef.current
                    const caret = el?.selectionStart ?? text.length
                    const next = applyBlockAtCaret(text, caret, block.md)
                    setText(next.text)
                    setCommentSlashOpen(false)
                    setCommentSlashQuery('')
                    requestAnimationFrame(() => {
                      el?.focus()
                      el?.setSelectionRange(next.caret, next.caret)
                    })
                  }}
                  className="w-full px-2.5 py-1.5 text-left text-xs hover:bg-muted/70"
                >
                  {t(block.labelKey)}
                </button>
              ))
            )}
          </div>
        )}
        {/*
          The hint frame `04:50` prints under the box — the "/" half only.
          ClickUp's reads "Press 'space' for AI or '/' for commands"; there is no
          space-for-AI hook on this composer, and half a hint that works beats a
          whole one that lies about the other half.
        */}
        <p className="mt-1 text-[10px] text-muted-foreground" data-testid="comment-composer-hint">
          {t('taskDetail.composerHint')}
        </p>
        {/* "Add emoji". A short row of the ones people actually use, inserted at
            the caret's end — not a full picker, and not pretending to be. */}
        {emojiOpen && (
          <div className="mt-2 flex flex-wrap gap-1" data-testid="comment-emoji-row">
            {['👍', '🎉', '❤️', '🙏', '😄', '🔥', '👀', '✅'].map((e) => (
              <button
                key={e}
                type="button"
                data-testid={`comment-emoji-${e}`}
                onClick={() => {
                  setText((prev) => prev + e)
                  setEmojiOpen(false)
                  commentTextRef.current?.focus()
                }}
                className="rounded px-1.5 py-0.5 text-base hover:bg-muted/60"
              >
                {e}
              </button>
            ))}
          </div>
        )}
        {assignTo && (
          <p className="mt-2 text-[11px] text-muted-foreground" data-testid="comment-assign-pending">
            {t('commentPlus.assignTo', {
              name:
                members.find((m) => m.userId === assignTo)?.displayName ||
                members.find((m) => m.userId === assignTo)?.email ||
                assignTo,
            })}
          </p>
        )}
        {quickCreate && (
          <QuickCreateModal initialMode={quickCreate} onClose={() => setQuickCreate(null)} />
        )}
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <input
              ref={commentFileInputRef}
              type="file"
              multiple
              className="hidden"
              data-testid="comment-file-input"
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? [])
                if (picked.length) setCommentFiles((prev) => [...prev, ...picked])
                e.target.value = ''
              }}
            />
            <button
              type="button"
              onClick={() => commentFileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <Paperclip className="h-3.5 w-3.5" />
              {t('taskDetail.attach')}
            </button>
            <CommentPlusMenu
              members={members}
              assignTo={assignTo}
              onAssignTo={setAssignTo}
              onAddFile={() => commentFileInputRef.current?.click()}
              onRecordClip={() => startRecordingRef.current?.('clip')}
              onMentionTask={() => {
                setMentionTab('tasks')
                setText((prev) => (prev.endsWith('@') ? prev : `${prev}@`))
                commentTextRef.current?.focus()
              }}
              onEmoji={() => setEmojiOpen((v) => !v)}
              onSlash={() => {
                // Same menu the "/" key opens, reached from the "+" instead.
                setText((prev) => (prev.endsWith('/') ? prev : `${prev}/`))
                setCommentSlashQuery('')
                setCommentSlashOpen(true)
                commentTextRef.current?.focus()
              }}
              onQuickCreate={setQuickCreate}
            />
          </div>
          <Button
            size="sm"
            data-testid="comment-post"
            onClick={() => create.mutate()}
            /*
             * A voice note or a clip with no words typed beside it is a whole
             * comment on its own — frame `04:45` is exactly that. Requiring
             * text would make the mic a control that cannot post what it
             * records.
             */
            disabled={(!text.trim() && commentFiles.length === 0) || create.isPending}
          >
            {create.isPending ? t('taskDetail.posting') : t('taskDetail.comment')}
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * §V2-S05b frame `04:50` — the comment composer's "+" menu.
 *
 * The frame lists ten items. EIGHT are here. The two that are not are absent
 * because there is nothing behind them, and putting them in the menu would be
 * the facade this codebase has spent two videos removing:
 *
 *   · **Slash commands** in the comment composer. The description editor has
 *     them; the composer does not, and it is its own row in the re-audit.
 *   · **Brain**. The Brain² hub does not exist — also its own row.
 *
 * Everything here goes to the SAME code the direct controls use: Add a file
 * clicks the composer's own file input, Record a Video Clip calls the recorder's
 * own `start`, and New Task / New Doc / New Whiteboard open the quick-create
 * modal on the matching tab rather than being three more creators.
 */
function CommentPlusMenu({
  members,
  assignTo,
  onAssignTo,
  onAddFile,
  onRecordClip,
  onMentionTask,
  onEmoji,
  onSlash,
  onQuickCreate,
}: {
  members: WorkspaceMemberLite[]
  assignTo: string
  onAssignTo: (userId: string) => void
  onAddFile: () => void
  onRecordClip: () => void
  onMentionTask: () => void
  onEmoji: () => void
  onSlash: () => void
  onQuickCreate: (mode: 'task' | 'doc' | 'whiteboard') => void
}) {
  const { t } = useTranslation()
  const [assignOpen, setAssignOpen] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            data-testid="comment-plus"
            title={t('commentPlus.menu')}
            aria-label={t('commentPlus.menu')}
            className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {/*
            NO `preventDefault` HERE. Keeping the menu open to show the picker
            leaves Radix's `pointer-events: none` on the body, so the composer
            and the Comment button behind it stop responding — the menu was
            still capturing every click while looking closed enough to use. The
            menu closes and the picker appears beside the "+", which is where it
            can actually be used.
          */}
          <DropdownMenuItem
            data-testid="comment-plus-assign"
            onSelect={() => setAssignOpen(true)}
          >
            <UserPlus className="mr-2 h-4 w-4" />
            {t('commentPlus.assign')}
          </DropdownMenuItem>
          <DropdownMenuItem data-testid="comment-plus-clip" onSelect={onRecordClip}>
            <Video className="mr-2 h-4 w-4" />
            {t('commentPlus.recordClip')}
          </DropdownMenuItem>
          <DropdownMenuItem data-testid="comment-plus-mention-task" onSelect={onMentionTask}>
            <Hash className="mr-2 h-4 w-4" />
            {t('commentPlus.mentionTask')}
          </DropdownMenuItem>
          <DropdownMenuItem data-testid="comment-plus-file" onSelect={onAddFile}>
            <Paperclip className="mr-2 h-4 w-4" />
            {t('commentPlus.addFile')}
          </DropdownMenuItem>
          {/*
            §V2-S05c — Slash commands, which frame `04:50` lists FIRST and which
            were deliberately absent from this menu while the composer had none.
            It has them now, so the item is real: this opens the same menu
            typing "/" opens.
          */}
          <DropdownMenuItem data-testid="comment-plus-slash" onSelect={onSlash}>
            <Hash className="mr-2 h-4 w-4" />
            {t('commentPlus.slashCommands')}
          </DropdownMenuItem>
          <DropdownMenuItem data-testid="comment-plus-emoji" onSelect={onEmoji}>
            <Smile className="mr-2 h-4 w-4" />
            {t('commentPlus.addEmoji')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem data-testid="comment-plus-new-task" onSelect={() => onQuickCreate('task')}>
            <CheckSquare className="mr-2 h-4 w-4" />
            {t('commentPlus.newTask')}
          </DropdownMenuItem>
          <DropdownMenuItem data-testid="comment-plus-new-doc" onSelect={() => onQuickCreate('doc')}>
            <FileText className="mr-2 h-4 w-4" />
            {t('commentPlus.newDoc')}
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="comment-plus-new-whiteboard"
            onSelect={() => onQuickCreate('whiteboard')}
          >
            <PenTool className="mr-2 h-4 w-4" />
            {t('commentPlus.newWhiteboard')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Who the comment will be assigned to when it is posted. A select rather
          than a nested menu: the member list is as long as the workspace. */}
      {assignOpen && (
        <select
          autoFocus
          value={assignTo}
          data-testid="comment-assign-select"
          aria-label={t('commentPlus.assign')}
          onChange={(e) => {
            onAssignTo(e.target.value)
            setAssignOpen(false)
          }}
          className="h-6 max-w-[170px] rounded border border-border bg-background px-1 text-[11px]"
        >
          <option value="">{t('commentPlus.assignNobody')}</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.displayName || m.email}
            </option>
          ))}
        </select>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

function ActivityPanel({ taskId, listId }: { taskId: string; listId?: string | null }) {
  const { t, locale } = useTranslation()
  /*
   * Frame `03:45` — the feed shows relative times and a "Show more". It used
   * to render every entry with an absolute `toLocaleString()`, so a busy task
   * opened onto a wall of identical-looking timestamps and the reader had to
   * do the arithmetic to find out what happened recently.
   */
  const [showAllActivity, setShowAllActivity] = useState(false)
  /*
   * §V2-S07 frames `01:55` / `05:20` / `15:20` — the panel header draws a
   * magnifier, the watcher bell, and a filter. The bell was built; the other
   * two were not, and the feed was one unparameterised request.
   *
   * BOTH NARROW ON THE SERVER. `GET /tasks/:id/activity` answers with the
   * hundred most recent entries, so a filter over the array this component is
   * holding would search the hundred it happens to have and answer "nothing
   * matches" for everything older — a *confident zero*, and the reader has no
   * way to tell it from a real one. `…/activity/search` puts the `WHERE` in
   * front of the `LIMIT`; `…/activity/actions` counts with a `GROUP BY` over
   * every row, so the filter can offer an action whose only occurrence is on
   * the first day of a long-lived task.
   */
  const [searchDraft, setSearchDraft] = useState('')
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchDraft), 200)
    return () => clearTimeout(id)
  }, [searchDraft])
  const filtersOn = search.trim() !== '' || actionFilter !== ''
  // A longer feed than the preview is a different question from a narrowed
  // one; keep "Show more" from carrying over into a three-row result.
  useEffect(() => setShowAllActivity(false), [search, actionFilter])

  const activityQuery = useQuery({
    /*
     * The filters are IN THE KEY, which is what makes each of them a real
     * request. `apps/web/src/lib/query.ts` sets a 30-second `staleTime`, so a
     * key this run has already fetched fires nothing at all; a key that carries
     * the filter can never be the key that was fetched without it.
     */
    queryKey: ['task', taskId, 'activity', search.trim(), actionFilter],
    queryFn: async () => {
      try {
        const params = new URLSearchParams()
        if (search.trim()) params.set('q', search.trim())
        if (actionFilter) params.set('action', actionFilter)
        const qs = params.toString()
        return await api<ActivityEntry[]>(`/tasks/${taskId}/activity/search${qs ? `?${qs}` : ''}`)
      } catch (err) {
        if (isNotWired(err)) return null
        throw err
      }
    },
  })
  const actionsQuery = useQuery({
    queryKey: ['task', taskId, 'activity', 'actions'],
    queryFn: async () => {
      try {
        return await api<Array<{ action: string; count: number }>>(`/tasks/${taskId}/activity/actions`)
      } catch (err) {
        if (isNotWired(err)) return null
        throw err
      }
    },
  })
  // Shares its cache entry with the overview panel's status dropdown, so
  // opening the tab costs no extra request in practice.
  const statusesQuery = useQuery({
    enabled: Boolean(listId),
    queryKey: ['list-statuses', listId],
    queryFn: () => api<Array<{ key: string; name: string; color: string }>>(`/lists/${listId}/statuses`),
  })
  const statusByKey = useMemo(
    () => new Map((statusesQuery.data ?? []).map((s) => [s.key, s] as const)),
    [statusesQuery.data],
  )

  if (activityQuery.data === null) {
    return <NotWiredNote>{t('taskDetail.activityUnavailable')}</NotWiredNote>
  }

  const entries = activityQuery.data ?? []
  /*
   * "Show more", frame `03:45`. Ten is enough to see what just happened; a
   * long-lived task accumulates hundreds and the recent ones are what anybody
   * opening the panel came for. The rest are one click away rather than gone.
   */
  const ACTIVITY_PREVIEW = 10
  const shown = showAllActivity ? entries : entries.slice(0, ACTIVITY_PREVIEW)
  const hidden = entries.length - shown.length
  // Map known actions to localized phrasing; fall back to a humanized raw string.
  //
  // Frame `02:47` — "You added item task required to checklist Checklist". The
  // checklist entries carry the item and the list in their meta, and a task
  // with three checklists cannot use "toggled a checklist item" for any of
  // them. When the meta is there the named phrasing wins; older rows written
  // before the meta existed still fall back to the plain label.
  const actionLabel = (a: ActivityEntry) => {
    const meta = a.meta as { content?: unknown; checklist?: unknown; isDone?: unknown } | null | undefined
    const item = typeof meta?.content === 'string' ? meta.content : null
    const checklist = typeof meta?.checklist === 'string' ? meta.checklist : null
    if (item && checklist) {
      if (a.action === 'checklist_item_added') {
        return t('taskDetail.activity.checklistItemAddedDetail', { item, checklist })
      }
      if (a.action === 'checklist_item_toggled') {
        return t(
          meta?.isDone
            ? 'taskDetail.activity.checklistItemCheckedDetail'
            : 'taskDetail.activity.checklistItemUncheckedDetail',
          { item, checklist },
        )
      }
    }
    const key = ACTIVITY_ACTION_LABEL_KEYS[a.action]
    if (key) return t(key)
    return a.action
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

  // §A2.8 — render the transition the log already recorded. Status values get
  // their list colour so the change reads at a glance; priority and due date
  // fall back to plain text.
  const transitionOf = (a: ActivityEntry): { from: React.ReactNode; to: React.ReactNode } | null => {
    const meta = a.meta
    if (!meta || !('from' in meta || 'to' in meta)) return null
    const statusChip = (raw: unknown) => {
      const key = typeof raw === 'string' ? raw : null
      if (!key) return <span className="text-muted-foreground">{t('taskDetail.activity.none')}</span>
      const status = statusByKey.get(key)
      return (
        <span className="inline-flex items-center gap-1">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: status?.color ?? 'var(--muted-foreground, #94a3b8)' }}
          />
          {status?.name ?? (STATUS_LABEL_KEYS[key] ? t(STATUS_LABEL_KEYS[key]) : key.replace(/_/g, ' '))}
        </span>
      )
    }
    const plain = (raw: unknown) => {
      if (raw === null || raw === undefined || raw === '') {
        return <span className="text-muted-foreground">{t('taskDetail.activity.none')}</span>
      }
      const text = String(raw)
      if (a.action === 'due_date_changed') {
        const d = new Date(text)
        return <span>{Number.isNaN(d.getTime()) ? text : d.toLocaleDateString()}</span>
      }
      const key = PRIORITY_LABEL_KEYS[text]
      return <span>{key ? t(key) : text.replace(/_/g, ' ')}</span>
    }
    const render = a.action === 'status_changed' ? statusChip : plain
    return { from: render(meta.from), to: render(meta.to) }
  }

  const knownActions = actionsQuery.data ?? []
  const actionOptionLabel = (action: string) => {
    const key = ACTIVITY_ACTION_LABEL_KEYS[action]
    return key ? t(key) : action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  }

  /*
   * The header renders WHETHER OR NOT anything matched. A filter you cannot
   * clear from the screen it emptied is worse than no filter at all.
   */
  const header = (
    <div className="mb-3 flex flex-wrap items-center gap-2" data-testid="activity-filter-bar">
      <div className="relative min-w-[8rem] flex-1">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          data-testid="activity-search"
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          placeholder={t('taskDetail.activitySearch')}
          aria-label={t('taskDetail.activitySearch')}
          className="h-8 w-full rounded-md border border-border bg-card pl-7 pr-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <select
        data-testid="activity-action-filter"
        value={actionFilter}
        onChange={(e) => setActionFilter(e.target.value)}
        aria-label={t('taskDetail.activityFilterAction')}
        title={t('taskDetail.activityFilterAction')}
        className="h-8 rounded-md border border-border bg-card px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="">{t('taskDetail.activityFilterAll')}</option>
        {knownActions.map((a) => (
          <option key={a.action} value={a.action}>
            {actionOptionLabel(a.action)} ({a.count})
          </option>
        ))}
        {/* The feed can be narrowed to an action the options list has not
            arrived for yet; keep the current value selectable so the control
            never silently reads "All actions" while filtering. */}
        {actionFilter && !knownActions.some((a) => a.action === actionFilter) && (
          <option value={actionFilter}>{actionOptionLabel(actionFilter)}</option>
        )}
      </select>
      {filtersOn && (
        <button
          type="button"
          data-testid="activity-filter-clear"
          onClick={() => {
            setSearchDraft('')
            setSearch('')
            setActionFilter('')
          }}
          className="h-8 rounded-md border border-border px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          {t('taskDetail.activityFilterClear')}
        </button>
      )}
      {/* The count is the number of rows THIS request came back with, so it
          describes the server's answer rather than what fitted on screen.
          `data-pending` is here so a reader — or a check — can tell an answer
          of nothing from a request still in flight: both draw as 0, and only
          one of them means the search found nothing. */}
      <span
        data-testid="activity-match-count"
        data-count={entries.length}
        data-pending={activityQuery.isFetching ? 'true' : 'false'}
        data-filtered={filtersOn ? 'true' : 'false'}
        className="text-[11px] tabular-nums text-muted-foreground"
      >
        {entries.length}
      </span>
    </div>
  )

  if (entries.length === 0) {
    return (
      <>
        {header}
        {filtersOn ? (
          <EmptyState
            title={t('taskDetail.activityNoMatches')}
            hint={t('taskDetail.activityNoMatchesHint')}
          />
        ) : (
          <EmptyState title={t('taskDetail.noActivity')} hint={t('taskDetail.noActivityHint')} />
        )}
      </>
    )
  }

  return (
    <>
    {header}
    <ol className="relative border-l border-border pl-4 space-y-3">
      {shown.map((a) => {
        const transition = transitionOf(a)
        return (
          <li key={a.id} className="relative" data-testid="activity-entry" data-action={a.action}>
            <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-brand-700" />
            <div className="text-sm">
              <span className="mr-1">{iconForAction(a.action)}</span>
              <span className="font-medium">
                {a.actor?.displayName ?? a.actor?.email ?? t('taskDetail.system')}
              </span>{' '}
              <span className="text-muted-foreground">{actionLabel(a)}</span>
              {transition && (
                <span className="inline-flex items-center gap-1.5 ml-1.5 align-middle">
                  <span className="text-muted-foreground">{t('taskDetail.activity.from')}</span>
                  {transition.from}
                  <span className="text-muted-foreground">{t('taskDetail.activity.to')}</span>
                  {transition.to}
                </span>
              )}
            </div>
            {/* Relative on screen, exact on hover: "3 days ago" is easier to
                read and useless for settling when something actually happened. */}
            <div
              className="text-xs text-muted-foreground"
              data-testid="activity-time"
              title={exactTime(a.createdAt, locale)}
            >
              {relativeTime(a.createdAt, locale)}
            </div>
          </li>
        )
      })}
    </ol>
      {hidden > 0 && (
        <button
          type="button"
          data-testid="activity-show-more"
          onClick={() => setShowAllActivity(true)}
          className="mt-2 text-xs font-medium text-primary hover:underline"
        >
          {t('taskDetail.activityShowMore', { n: hidden })}
        </button>
      )}
    </>
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
  type:
    | 'text' | 'number' | 'dropdown' | 'date' | 'checkbox'
    | 'url' | 'email' | 'phone' | 'money' | 'rating'
    /* §V2-01b — read-only here, because the value is derived. */
    | 'progress_auto'
    /* §V2-01c — storage plus a renderer. */
    | 'long_text' | 'labels' | 'people' | 'location' | 'tshirt_size' | 'progress_manual'
    /* 0145 — attachment ids, and the ids of whoever voted. */
    | 'files' | 'voting'
  isRequired: boolean
  options: Array<{ label: string; value: string; color?: string }> | null
}

/** `string[]` is §V2-01c's `labels` and `people`; the API sends [] when unset,
 *  never null, so nothing here has to treat the two as separate states. */
type CustomFieldValue = string | number | boolean | string[] | null

type CustomFieldRow = {
  definition: CustomFieldDef
  value: CustomFieldValue
}

function CustomFieldsPanel({
  taskId,
  workspaceId,
  openCreateStamp,
}: {
  taskId: string
  workspaceId?: string
  openCreateStamp?: number
}) {
  const { t } = useTranslation()
  if (!workspaceId) {
    return <NotWiredNote>{t('taskDetail.customFieldsNeedWorkspace')}</NotWiredNote>
  }
  return (
    <CustomFieldsPanelInner
      taskId={taskId}
      workspaceId={workspaceId}
      openCreateStamp={openCreateStamp}
    />
  )
}

/**
 * §V2-S16 frames `15:20` ("Add fields") and `15:30` ("Custom Fields" in the
 * task's `···` menu) — the creatable half of this panel.
 *
 * The panel could only ever SET values. Its own empty state said so — "Add
 * fields at the project level — they'll appear here for every task" — which is
 * a signpost to somewhere else, and the three places that could actually make
 * one (the create modal, the project shell, the list route) are all reached
 * before or beside the task rather than from it.
 *
 * THE TYPE LIST IS NOT WRITTEN OUT AGAIN HERE. It is derived from
 * `FIELD_TYPE_LABEL_KEYS`, the map this file already uses to name a field's
 * type on its row, so the picker and the label can never disagree about which
 * types exist. The list route's own picker offers six of the nineteen and
 * nobody noticed, because each picker is individually plausible — that is this
 * audit's *duplicated list*, and a fourth copy is how it happens again.
 */
const CREATABLE_TYPES_FROM_LABELS = Object.keys(FIELD_TYPE_LABEL_KEYS)
/** Types that are a list of choices, and so need options before they mean anything. */
const TYPES_NEEDING_OPTIONS: ReadonlySet<string> = new Set(['dropdown', 'labels'])

function CustomFieldsPanelInner({
  taskId,
  workspaceId,
  openCreateStamp,
}: {
  taskId: string
  workspaceId: string
  openCreateStamp?: number
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()

  const collapse = useCollapseEmptyFields()

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('text')
  const [newScope, setNewScope] = useState<'project' | 'list'>('project')
  const [newOptions, setNewOptions] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  // Keyed on the stamp, so pressing "Add fields" again re-opens a form the
  // reader had closed. See the stamp's declaration in the sheet.
  useEffect(() => {
    if (openCreateStamp) setCreating(true)
  }, [openCreateStamp])

  const fieldsQuery = useQuery({
    queryKey: ['custom-fields', workspaceId, taskId],
    queryFn: () =>
      api<CustomFieldRow[]>(`/workspaces/${workspaceId}/tasks/${taskId}/custom-fields`),
  })

  const setValue = useMutation({
    mutationFn: ({ fieldId, value }: { fieldId: string; value: CustomFieldValue }) =>
      api(`/workspaces/${workspaceId}/tasks/${taskId}/custom-fields/${fieldId}`, {
        method: 'PUT',
        body: { value },
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['custom-fields', workspaceId, taskId] }),
  })

  const createField = useMutation({
    mutationFn: (body: {
      name: string
      type: string
      scope: 'project' | 'list'
      options?: Array<{ label: string; value: string }>
    }) =>
      api<CustomFieldDef>(`/workspaces/${workspaceId}/tasks/${taskId}/custom-fields`, {
        method: 'POST',
        body,
      }),
    onSuccess: async () => {
      setCreating(false)
      setNewName('')
      setNewOptions('')
      setNewType('text')
      setNewScope('project')
      setCreateError(null)
      /*
       * The definition is project- or list-scoped, so it does not only change
       * THIS task: every other task's field list is now stale too. Invalidating
       * the whole `custom-fields` root is deliberate — a narrower key would
       * leave a sibling task showing a field list from before the new field
       * existed until its 30-second `staleTime` ran out.
       */
      await qc.invalidateQueries({ queryKey: ['custom-fields'] })
      toast.success(t('taskDetail.fieldCreated'))
    },
    onError: (err) =>
      setCreateError(err instanceof ApiError ? err.message : t('taskDetail.fieldCreateFailed')),
  })

  const parsedOptions = newOptions
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((label) => ({ label, value: label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') }))
  const needsOptions = TYPES_NEEDING_OPTIONS.has(newType)
  const canSubmit =
    newName.trim() !== '' && (!needsOptions || parsedOptions.length > 0) && !createField.isPending

  const createForm = creating ? (
    <form
      data-testid="task-field-create-form"
      className="rounded-md border border-border bg-card/50 p-3 space-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (!canSubmit) return
        setCreateError(null)
        createField.mutate({
          name: newName.trim(),
          type: newType,
          scope: newScope,
          ...(needsOptions ? { options: parsedOptions } : {}),
        })
      }}
    >
      <input
        data-testid="task-field-create-name"
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        placeholder={t('taskDetail.newFieldName')}
        aria-label={t('taskDetail.newFieldName')}
        className="h-8 w-full rounded-md border border-border bg-card px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <div className="flex gap-2">
        <select
          data-testid="task-field-create-type"
          value={newType}
          onChange={(e) => setNewType(e.target.value)}
          aria-label={t('taskDetail.newFieldType')}
          className="h-8 min-w-0 flex-1 rounded-md border border-border bg-card px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {CREATABLE_TYPES_FROM_LABELS.map((type) => (
            <option key={type} value={type}>
              {t(FIELD_TYPE_LABEL_KEYS[type])}
            </option>
          ))}
        </select>
        <select
          data-testid="task-field-create-scope"
          value={newScope}
          onChange={(e) => setNewScope(e.target.value === 'list' ? 'list' : 'project')}
          aria-label={t('taskDetail.newFieldScope')}
          className="h-8 min-w-0 flex-1 rounded-md border border-border bg-card px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="project">{t('taskDetail.newFieldScopeProject')}</option>
          <option value="list">{t('taskDetail.newFieldScopeList')}</option>
        </select>
      </div>
      {needsOptions && (
        <textarea
          data-testid="task-field-create-options"
          value={newOptions}
          onChange={(e) => setNewOptions(e.target.value)}
          rows={3}
          placeholder={t('taskDetail.newFieldOptions')}
          aria-label={t('taskDetail.newFieldOptions')}
          className="w-full rounded-md border border-border bg-card px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      )}
      {createError && (
        <p data-testid="task-field-create-error" className="text-xs text-destructive">
          {createError}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          data-testid="task-field-create-submit"
          disabled={!canSubmit}
          className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {t('taskDetail.createField')}
        </button>
        <button
          type="button"
          data-testid="task-field-create-cancel"
          onClick={() => {
            setCreating(false)
            setCreateError(null)
          }}
          className="h-8 rounded-md border border-border px-3 text-xs text-muted-foreground hover:text-foreground"
        >
          {t('common.cancel')}
        </button>
      </div>
    </form>
  ) : (
    <button
      type="button"
      data-testid="task-field-create-open"
      onClick={() => setCreating(true)}
      className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/10"
    >
      <Plus className="h-3 w-3" />
      {t('taskDetail.newField')}
    </button>
  )

  if (fieldsQuery.isLoading) {
    return <p className="text-sm text-muted-foreground"><InlineSkeleton /></p>
  }

  const fields = fieldsQuery.data ?? []
  if (fields.length === 0) {
    return (
      <div className="space-y-3">
        {createForm}
        <EmptyState
          title={t('taskDetail.noCustomFields')}
          hint={t('taskDetail.noCustomFieldsHint')}
        />
      </div>
    )
  }

  /*
   * §V2-S02 frame `01:20` — the same "Collapse empty fields" preference the
   * Overview grid uses, from the same module. This is where it earns its keep:
   * every custom field defined on the workspace appears on every task, so a
   * workspace with twenty fields gives every task seventeen empty ones.
   *
   * Required fields are never hidden. An empty required field is the one thing
   * on this panel somebody needs to see.
   */
  const isHideable = ({ definition, value }: CustomFieldRow) =>
    !definition.isRequired && isEmptyFieldValue(value)
  const hiddenCount = fields.filter(isHideable).length
  const shown = collapse ? fields.filter((f) => !isHideable(f)) : fields

  return (
    <div className="space-y-3">
      <CollapseEmptyFieldsToggle emptyCount={hiddenCount} />
      {createForm}
      {shown.map(({ definition, value }) => (
        <div key={definition.id} data-testid="custom-field-row">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
            {definition.name}
            {definition.isRequired && <span className="text-destructive">*</span>}
            <span className="ml-auto text-[10px] opacity-70">{FIELD_TYPE_LABEL_KEYS[definition.type] ? t(FIELD_TYPE_LABEL_KEYS[definition.type]) : definition.type}</span>
          </div>
          {/*
            §V2-01b — Progress (Auto) is SHOWN, not edited.
            The API refuses a write to it, so an editor here would be a control
            that produces an error every time it is used. The number follows the
            subtasks, checklist and assigned comments instead.
          */}
          {definition.type === 'progress_auto' ? (
            <ProgressAutoValue value={typeof value === 'number' ? value : null} />
          ) : (
            <CustomFieldEditor
              definition={definition}
              value={value}
              workspaceId={workspaceId}
              taskId={taskId}
              disabled={setValue.isPending}
              onCommit={(next) => setValue.mutate({ fieldId: definition.id, value: next })}
            />
          )}
        </div>
      ))}
    </div>
  )
}

/**
 * §V2-01b, frame `00:25` — the derived percentage.
 *
 * NULL IS DRAWN AS "NOTHING TO COUNT", NOT AS ZERO. An empty bar at 0% claims
 * none of the work is done; on a task with no subtasks, no checklist and no
 * assigned comments there is no work to make that claim about, and the API
 * sends null to say so.
 */
function ProgressAutoValue({ value }: { value: number | null }) {
  const { t } = useTranslation()
  if (value == null) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="custom-field-progress-empty">
        {t('taskDetail.fieldType.progressNothing')}
      </p>
    )
  }
  return (
    <div className="flex items-center gap-2" data-testid="custom-field-progress">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      <span className="w-10 text-right text-sm tabular-nums" data-testid="custom-field-progress-pct">
        {value}%
      </span>
    </div>
  )
}

function CustomFieldEditor({
  definition,
  value,
  workspaceId,
  taskId,
  disabled,
  onCommit,
}: {
  definition: CustomFieldDef
  value: CustomFieldValue
  /** §V2-01c — `people` asks who is in the workspace; 0145's `files` asks what
   *  is attached to this task. Everything else needs neither. */
  workspaceId: string
  taskId: string
  disabled?: boolean
  onCommit: (next: CustomFieldValue) => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<string>(() => {
    if (value == null) return ''
    if (typeof value === 'boolean') return value ? 'true' : 'false'
    if (Array.isArray(value)) return ''
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

    // ── §V2-01c ──────────────────────────────────────────────────────────
    case 'long_text':
      return (
        <textarea
          data-testid="cf-long-text"
          rows={4}
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => onCommit(draft.trim() === '' ? null : draft)}
          className="text-sm rounded-md border border-input bg-transparent px-2 py-1.5 w-full resize-y"
        />
      )
    case 'location':
      return (
        <Input
          data-testid="cf-location"
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => onCommit(draft.trim() === '' ? null : draft)}
          placeholder={t('taskDetail.locationPlaceholder')}
        />
      )
    case 'tshirt_size': {
      /*
       * A FIXED set, which is the only thing separating this from a dropdown —
       * so the sizes are not read from `options`. A field whose sizes differed
       * per project would just be a dropdown with a different name.
       */
      const current = typeof value === 'string' ? value : ''
      return (
        <div className="flex items-center gap-1" data-testid="cf-tshirt">
          {['xs', 's', 'm', 'l', 'xl'].map((size) => (
            <button
              key={size}
              type="button"
              disabled={disabled}
              data-testid={`cf-tshirt-${size}`}
              aria-pressed={current === size}
              onClick={() => onCommit(current === size ? null : size)}
              className={cn(
                'rounded border px-2 py-0.5 text-xs uppercase transition-colors disabled:opacity-50',
                current === size
                  ? 'border-accent bg-accent/15 text-foreground font-medium'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {size}
            </button>
          ))}
        </div>
      )
    }
    case 'progress_manual': {
      // Drawn as the same bar as the derived one, because to a reader they are
      // the same fact; the difference is only in who is responsible for it.
      const pct = typeof value === 'number' ? value : 0
      return (
        <div className="space-y-1" data-testid="cf-progress-manual">
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={pct}
              disabled={disabled}
              data-testid="cf-progress-manual-input"
              onChange={(e) => setDraft(e.target.value)}
              onMouseUp={() => onCommit(Number(draft || pct))}
              onKeyUp={() => onCommit(Number(draft || pct))}
              className="h-1.5 flex-1 accent-accent"
            />
            <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
              {draft === '' ? pct : draft}%
            </span>
          </div>
        </div>
      )
    }
    case 'labels': {
      const opts = definition.options ?? []
      const chosen = Array.isArray(value) ? value : []
      return (
        <div className="flex flex-wrap items-center gap-1" data-testid="cf-labels">
          {opts.map((o) => {
            const on = chosen.includes(o.value)
            return (
              <button
                key={o.value}
                type="button"
                disabled={disabled}
                data-testid={`cf-label-${o.value}`}
                aria-pressed={on}
                onClick={() =>
                  // Several at once — that is the whole difference from a
                  // dropdown, so the click toggles rather than replaces.
                  onCommit(on ? chosen.filter((v) => v !== o.value) : [...chosen, o.value])
                }
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[11px] transition-colors disabled:opacity-50',
                  on
                    ? 'border-accent/40 bg-accent/10 text-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {o.label}
              </button>
            )
          })}
        </div>
      )
    }
    case 'files':
      return (
        <FilesFieldEditor
          taskId={taskId}
          workspaceId={workspaceId}
          value={Array.isArray(value) ? value : []}
          disabled={disabled}
          onCommit={onCommit}
        />
      )
    case 'voting':
      return <VotingFieldEditor value={Array.isArray(value) ? value : []} disabled={disabled} onCommit={onCommit} />
    case 'people':
      return (
        <PeopleFieldEditor
          value={Array.isArray(value) ? value : []}
          workspaceId={workspaceId}
          disabled={disabled}
          onCommit={onCommit}
        />
      )
  }
}

/**
 * 0145 — FILES, frame `00:20`'s picker.
 *
 * A reference into the attachments that are ALREADY ON THIS TASK, not a second
 * upload path. The API refuses an id that is not attached here, so the choices
 * offered are exactly the choices the write will accept — a picker that could
 * offer more than the server takes is a 400 waiting for a click.
 */
function FilesFieldEditor({
  taskId,
  workspaceId,
  value,
  disabled,
  onCommit,
}: {
  taskId: string
  workspaceId: string
  value: string[]
  disabled?: boolean
  onCommit: (next: CustomFieldValue) => void
}) {
  const { t } = useTranslation()
  const { data: files = [] } = useQuery({
    queryKey: ['task-attachments', workspaceId, taskId],
    queryFn: () =>
      api<Array<{ id: string; fileName: string }>>(`/tasks/${taskId}/attachments`),
  })

  if (files.length === 0) {
    return <span className="text-xs text-muted-foreground">{t('taskDetail.noFilesYet')}</span>
  }
  return (
    <div className="flex flex-wrap items-center gap-1" data-testid="cf-files">
      {files.map((f) => {
        const on = value.includes(f.id)
        return (
          <button
            key={f.id}
            type="button"
            disabled={disabled}
            data-testid={`cf-file-${f.id}`}
            aria-pressed={on}
            onClick={() => onCommit(on ? value.filter((v) => v !== f.id) : [...value, f.id])}
            className={cn(
              'max-w-[12rem] truncate rounded border px-2 py-0.5 text-[11px] transition-colors disabled:opacity-50',
              on
                ? 'border-accent/40 bg-accent/10 text-foreground'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {f.fileName}
          </button>
        )
      })}
    </div>
  )
}

/**
 * 0145 — VOTING.
 *
 * ONE BUTTON, AND IT IS ALWAYS YOUR OWN VOTE. The API ignores whatever value
 * this sends and toggles the caller's vote, so there is deliberately no way to
 * express "add Omar's vote" — a vote you can cast on somebody else's behalf is
 * not a vote. The count is shown because that is the useful part; who voted is
 * not drawn, because a public tally changes how people vote.
 */
function VotingFieldEditor({
  value,
  disabled,
  onCommit,
}: {
  value: string[]
  disabled?: boolean
  onCommit: (next: CustomFieldValue) => void
}) {
  const { t } = useTranslation()
  const me = useAuthStore((s) => s.user?.id) ?? ''
  const mine = value.includes(me)
  return (
    <div className="flex items-center gap-2" data-testid="cf-voting">
      <button
        type="button"
        disabled={disabled}
        data-testid="cf-vote"
        aria-pressed={mine}
        /* The body is ignored by the API; it is sent only because the endpoint
         * takes one. What decides the outcome is who is asking. */
        onClick={() => onCommit(value)}
        className={cn(
          'rounded-full border px-2.5 py-0.5 text-[11px] transition-colors disabled:opacity-50',
          mine
            ? 'border-accent/40 bg-accent/10 text-foreground'
            : 'border-border text-muted-foreground hover:text-foreground',
        )}
      >
        {mine ? t('taskDetail.voted') : t('taskDetail.vote')}
      </button>
      <span className="text-[11px] tabular-nums text-muted-foreground" data-testid="cf-vote-count">
        {t('taskDetail.voteCount', { n: value.length })}
      </span>
    </div>
  )
}

/**
 * §V2-01c — several workspace members.
 *
 * Its own component because it is the only field type that has to ASK THE
 * SERVER what the choices are; every other one either has its options on the
 * definition or a fixed set. The API refuses ids that are not members of this
 * workspace, so the list here is the same set the write will accept rather than
 * a superset that produces a 400 on click.
 */
function PeopleFieldEditor({
  value,
  workspaceId,
  disabled,
  onCommit,
}: {
  value: string[]
  workspaceId: string
  disabled?: boolean
  onCommit: (next: CustomFieldValue) => void
}) {
  const { t } = useTranslation()
  const { data: members = [] } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () =>
      api<Array<{ userId: string; displayName?: string | null; email: string }>>(
        `/workspaces/${workspaceId}/members`,
      ),
    enabled: !!workspaceId,
  })

  return (
    <div className="flex flex-wrap items-center gap-1" data-testid="cf-people">
      {members.length === 0 ? (
        <span className="text-xs text-muted-foreground">{t('taskDetail.noPeopleYet')}</span>
      ) : (
        members.map((m) => {
          const on = value.includes(m.userId)
          return (
            <button
              key={m.userId}
              type="button"
              disabled={disabled}
              data-testid={`cf-person-${m.userId}`}
              aria-pressed={on}
              onClick={() =>
                onCommit(on ? value.filter((v) => v !== m.userId) : [...value, m.userId])
              }
              className={cn(
                'rounded-full border px-2 py-0.5 text-[11px] transition-colors disabled:opacity-50',
                on
                  ? 'border-accent/40 bg-accent/10 text-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {m.displayName || m.email}
            </button>
          )
        })
      )}
    </div>
  )
}

import { createFileRoute, useNavigate, useRouterState } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input, PersonAvatar, cn } from '@rundesk/ui'
import {
  TaskListChrome,
  WorkFilterSelect,
  WorkViewTabs,
} from '../components/work/work-ui'
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ChevronDown,
  ChevronRight,
  Circle,
  CheckCircle2,
  Plus,
  Flag,
  Diamond,
  Calendar as CalendarIcon,
  X as XIcon,
  Archive,
} from 'lucide-react'
import { api } from '../lib/api'
import { useTranslation, type TranslationKey } from '../lib/i18n'
import { criticalPath } from '../lib/gantt'
import { TaskDetailSheet } from '../components/task-detail-sheet'
import { ListStatusesManager } from '../components/list-statuses-manager'
import { ListEmailAliasPanel } from '../components/list-email-alias-panel'
import { getRealtimeSocket } from '../lib/realtime'
import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent, useDraggable, useDroppable } from '@dnd-kit/core'
import { addDays, addMonths, differenceInCalendarDays, endOfMonth, endOfWeek, format, isSameMonth, isToday, startOfDay, startOfMonth, startOfWeek } from 'date-fns'

type TaskPriority = 'urgent' | 'high' | 'normal' | 'low'
// Status is now a free-text key validated against the list's list_statuses.
type TaskStatus = string
type StatusCategory = 'open' | 'in_progress' | 'closed'

type ListStatus = {
  id: string
  listId: string
  key: string
  name: string
  color: string
  category: StatusCategory
  position: number
}

type TaskAssignee = {
  userId: string
  user?: { displayName?: string | null }
}
type WorkspaceMember = { userId: string; displayName: string; email: string }

type TaskItem = {
  id: string
  title: string
  description: string | null
  priority: TaskPriority
  status: TaskStatus
  statusCategory?: StatusCategory
  isMilestone?: boolean
  startDate?: string | null
  dueDate?: string | null
  createdAt?: string | null
  assignees?: TaskAssignee[]
  subtasks?: Array<{ id: string; status?: string | null; statusCategory?: StatusCategory | null }>
  openBlockerCount?: number
  blocksOpenCount?: number
  blockedBy?: string[]
}

type CustomFieldType = 'text' | 'number' | 'dropdown' | 'date' | 'checkbox' | 'url'
type CustomFieldDef = {
  id: string
  name: string
  type: CustomFieldType
  options?: Array<{ label: string; value: string }> | null
}
type CustomFieldValue = {
  definition: { id: string }
  value: string | number | boolean | null
}

export const Route = createFileRoute('/app/$workspaceId/$spaceId/$projectId/$listId')({
  component: ListDetail,
})

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  urgent: 'text-red-600',
  high: 'text-orange-500',
  normal: 'text-blue-500',
  low: 'text-gray-400',
}
const PRIORITY_OPTIONS: TaskPriority[] = ['urgent', 'high', 'normal', 'low']

// Enum → display-label-key maps. The raw identifier stays the persisted/compared
// value; only the shown label is localized (mirrors task-detail-sheet.tsx).
const PRIORITY_LABEL_KEYS: Record<TaskPriority, TranslationKey> = {
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

// Resolve a status's display label: a known built-in status key renders its
// localized catalog label; any other (custom/scoped, server-defined) status
// shows its server-provided name verbatim — user data is never translated.
function resolveStatusLabel(
  statusKey: string,
  serverName: string | undefined,
  t: (key: TranslationKey) => string,
): string {
  const labelKey = STATUS_LABEL_KEYS[statusKey]
  if (labelKey) return t(labelKey)
  return serverName ?? statusKey
}

// User-facing short date (e.g. "Mar 4"), localized via Intl so month names
// follow the active locale instead of a fixed English date-fns token.
function shortDate(date: Date, locale: string): string {
  return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
}

const AGE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 31536000],
  ['month', 2592000],
  ['week', 604800],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
]
// Localized "how long ago" for the Created column, replacing date-fns'
// English-only formatDistanceToNowStrict. numeric:'auto' yields idiomatic
// forms like "yesterday" / "ayer" / "أمس".
function formatAge(iso: string, locale: string): string {
  const diffSec = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  const abs = Math.abs(diffSec)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  for (const [unit, secs] of AGE_UNITS) {
    if (abs >= secs) return rtf.format(-Math.round(diffSec / secs), unit)
  }
  return rtf.format(-diffSec, 'second')
}

// Converts a native <input type="date"> value (yyyy-MM-dd, or '') into an ISO
// date string the backend's @IsDateString() accepts, or undefined when blank so
// the field is omitted from the create body entirely.
function dateInputToIso(value: string): string | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = new Date(trimmed)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
}

// Builds the POST /tasks body, defaulting priority to 'normal' and omitting
// blank optional dates (an empty string would fail @IsDateString validation).
function buildCreateTaskBody(input: {
  listId: string
  title: string
  status?: string
  priority?: TaskPriority
  dueDate?: string
  startDate?: string
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    listId: input.listId,
    title: input.title,
    priority: input.priority ?? 'normal',
  }
  if (input.status) body.status = input.status
  const dueDate = dateInputToIso(input.dueDate ?? '')
  if (dueDate) body.dueDate = dueDate
  const startDate = dateInputToIso(input.startDate ?? '')
  if (startDate) body.startDate = startDate
  return body
}

const VIRTUALIZE_THRESHOLD = 120
const TASK_ROW_ESTIMATE_PX = 46
const BOARD_VIRTUALIZE_THRESHOLD = 80
const BOARD_CARD_ESTIMATE_PX = 76
const TABLE_VIRTUALIZE_THRESHOLD = 120
const TABLE_ROW_ESTIMATE_PX = 36

type StatusMeta = { label: string; color: string; dot: string; pill: string }

// Fallback meta for the 6 originally-seeded statuses; used when a list
// hasn't loaded yet or a task references a key that's been deleted.
const DEFAULT_STATUS_META: Record<string, StatusMeta> = {
  backlog: { label: 'Backlog', color: '#94a3b8', dot: 'bg-zinc-400', pill: 'bg-muted/60 text-muted-foreground border-border' },
  todo: { label: 'To do', color: '#64748b', dot: 'bg-slate-500', pill: 'bg-slate-500/15 text-slate-700 dark:text-slate-200 border-slate-400/40' },
  in_progress: { label: 'In progress', color: '#3b82f6', dot: 'bg-blue-500', pill: 'bg-blue-500/15 text-blue-700 dark:text-blue-200 border-blue-400/40' },
  in_review: { label: 'In review', color: '#a855f7', dot: 'bg-purple-500', pill: 'bg-purple-500/15 text-purple-700 dark:text-purple-200 border-purple-400/40' },
  done: { label: 'Done', color: '#10b981', dot: 'bg-emerald-500', pill: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-200 border-emerald-400/40' },
  cancelled: { label: 'Cancelled', color: '#f43f5e', dot: 'bg-rose-500', pill: 'bg-rose-500/15 text-rose-700 dark:text-rose-200 border-rose-400/40' },
}

const ListStatusesContext = createContext<ListStatus[]>([])

function useListStatuses() {
  return useContext(ListStatusesContext)
}

function pillStyleFor(color: string): React.CSSProperties {
  return {
    backgroundColor: `${color}26`,
    color,
    borderColor: `${color}66`,
  }
}

function useStatusMeta(statusKey: string): StatusMeta {
  const { t } = useTranslation()
  const statuses = useListStatuses()
  const dynamic = statuses.find((s) => s.key === statusKey)
  if (dynamic) {
    return {
      label: resolveStatusLabel(statusKey, dynamic.name, t),
      color: dynamic.color,
      // Dynamic colours don't map cleanly to tailwind classes, so we use
      // inline style via pillStyleFor() at the call site instead.
      dot: '',
      pill: '',
    }
  }
  const fallback = DEFAULT_STATUS_META[statusKey]
  if (fallback) {
    return { ...fallback, label: resolveStatusLabel(statusKey, fallback.label, t) }
  }
  return {
    label: resolveStatusLabel(statusKey, statusKey, t),
    color: '#94a3b8',
    dot: 'bg-zinc-400',
    pill: 'bg-muted/60 text-muted-foreground border-border',
  }
}

function TableStatusLegend() {
  const { t } = useTranslation()
  const ordered = useOrderedStatuses()
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 rounded-lg border border-border bg-card/50 text-[11px] text-muted-foreground">
      <span className="font-semibold uppercase tracking-wider text-[10px]">{t('list.table.statusLegend')}</span>
      {ordered.map((s) => (
        <div key={s.key} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
          <span>{resolveStatusLabel(s.key, s.name, t)}</span>
        </div>
      ))}
    </div>
  )
}

function useOrderedStatuses(): ListStatus[] {
  const statuses = useListStatuses()
  if (statuses.length === 0) {
    // Fallback to the legacy default order when the list hasn't loaded yet.
    return Object.entries(DEFAULT_STATUS_META).map(([key, meta], i) => ({
      id: key,
      listId: '',
      key,
      name: meta.label,
      color: meta.color,
      category:
        key === 'done' || key === 'cancelled'
          ? 'closed'
          : key === 'in_progress' || key === 'in_review'
          ? 'in_progress'
          : 'open',
      position: i,
    }))
  }
  return [...statuses].sort((a, b) => a.position - b.position)
}

function ListDetail() {
  const { workspaceId, spaceId, projectId, listId } = Route.useParams()
  const navigate = useNavigate()
  const { t, tCount, locale } = useTranslation()
  const qc = useQueryClient()
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>('normal')
  const [newTaskDueDate, setNewTaskDueDate] = useState('')
  const [newTaskStartDate, setNewTaskStartDate] = useState('')
  const [activeView, setActiveView] = useState<'list' | 'board' | 'calendar' | 'table' | 'gantt'>('list')
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all')
  const [sortBy, setSortBy] = useState<'created' | 'due' | 'priority'>('created')
  const [groupBy, setGroupBy] = useState<'status' | 'priority' | 'assignee'>('status')
  // Custom-field column visibility, persisted per saved view (Plan §4/§5).
  const [hiddenFields, setHiddenFields] = useState<Set<string>>(() => new Set())
  // Board: collapsed columns (ephemeral) + per-status WIP limits (persisted).
  const [collapsedColumns, setCollapsedColumns] = useState<Set<string>>(() => new Set())
  const [wipLimits, setWipLimits] = useState<Record<string, number>>({})
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(() => new Set())
  const [statusManagerOpen, setStatusManagerOpen] = useState(false)
  const [emailAliasOpen, setEmailAliasOpen] = useState(false)
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null)
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()))
  const [calendarView, setCalendarView] = useState<'month' | 'week'>('month')
  const [calendarDragTaskId, setCalendarDragTaskId] = useState<string | null>(null)
  const [calendarQuickAddDay, setCalendarQuickAddDay] = useState<string | null>(null)
  const [calendarQuickAddTitle, setCalendarQuickAddTitle] = useState('')
  const [saveAsName, setSaveAsName] = useState('')
  const [selectedSavedViewId, setSelectedSavedViewId] = useState<string>('')
  const [appliedInitialView, setAppliedInitialView] = useState(false)
  const quickAddRef = useRef<HTMLInputElement | null>(null)
  const locationSearch = useRouterState({ select: (s) => (s.location as any).searchStr as string })

  const { data: tasks = [], isLoading, refetch } = useQuery({
    queryKey: ['tasks', listId],
    queryFn: () => api<TaskItem[]>(`/tasks/list/${listId}`),
  })
  const { data: projectFields = [] } = useQuery({
    queryKey: ['project-fields', workspaceId, projectId],
    queryFn: () =>
      api<CustomFieldDef[]>(`/workspaces/${workspaceId}/projects/${projectId}/custom-fields`),
  })
  const { data: savedViews = [] } = useQuery({
    queryKey: ['list-views', listId],
    queryFn: () => api<Array<{ id: string; name: string; type: 'list' | 'board' | 'calendar' | 'gantt' | 'table'; isDefault?: boolean; config?: any }>>(`/lists/${listId}/views`),
  })
  const { data: workspaceMembers = [] } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => api<WorkspaceMember[]>(`/workspaces/${workspaceId}/members`),
  })
  const { data: listStatuses = [] } = useQuery({
    queryKey: ['list-statuses', listId],
    queryFn: () => api<ListStatus[]>(`/lists/${listId}/statuses`),
  })
  const { data: listMeta } = useQuery({
    queryKey: ['list-meta', listId],
    queryFn: () => api<{ id: string; name: string; description?: string | null }>(`/lists/${listId}`),
  })

  useEffect(() => {
    const socket = getRealtimeSocket()
    socket.emit('subscribe', { rooms: [`list:${listId}`] })
    const onEvent = (event: { type: string; listId?: string; taskId?: string }) => {
      if (event.listId === listId || event.type.startsWith('task.')) {
        void qc.invalidateQueries({ queryKey: ['tasks', listId] })
        if (event.taskId) {
          void qc.invalidateQueries({ queryKey: ['task', event.taskId] })
          void qc.invalidateQueries({ queryKey: ['task', event.taskId, 'comments'] })
          void qc.invalidateQueries({ queryKey: ['task', event.taskId, 'activity'] })
        }
      }
    }
    socket.on('event', onEvent)
    return () => {
      socket.off('event', onEvent)
      socket.emit('unsubscribe', { rooms: [`list:${listId}`] })
    }
  }, [listId, qc])

  const handleCreateTask = async () => {
    if (!newTaskTitle.trim()) return

    try {
      await api('/tasks', {
        method: 'POST',
        // Status intentionally omitted: backend picks the list's first
        // open status, which may differ from the legacy "todo" default.
        body: JSON.stringify(
          buildCreateTaskBody({
            listId,
            title: newTaskTitle,
            priority: newTaskPriority,
            dueDate: newTaskDueDate,
            startDate: newTaskStartDate,
          }),
        ),
      })

      setNewTaskTitle('')
      setNewTaskPriority('normal')
      setNewTaskDueDate('')
      setNewTaskStartDate('')
      await refetch()
    } catch (error) {
      console.error('Failed to create task', error)
    }
  }

  const visibleTasks = useMemo(() => {
    let next = [...tasks]
    if (statusFilter !== 'all') {
      next = next.filter((task) => task.status === statusFilter)
    }
    next.sort((a, b) => {
      if (sortBy === 'due') {
        const aDate = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER
        const bDate = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER
        return aDate - bDate
      }
      if (sortBy === 'priority') {
        const weight: Record<TaskPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 }
        return weight[a.priority] - weight[b.priority]
      }
      const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return bDate - aDate
    })
    return next
  }, [tasks, statusFilter, sortBy])

  const tasksByStatus = useMemo(() => {
    const map: Record<string, TaskItem[]> = {}
    for (const s of listStatuses) map[s.key] = []
    for (const task of visibleTasks) {
      if (!map[task.status]) map[task.status] = []
      map[task.status].push(task)
    }
    return map
  }, [visibleTasks, listStatuses])

  const tasksByDate = useMemo(() => {
    const map = new Map<string, TaskItem[]>()
    for (const task of visibleTasks) {
      const key = task.dueDate ? format(new Date(task.dueDate), 'yyyy-MM-dd') : 'No due date'
      const arr = map.get(key) ?? []
      arr.push(task)
      map.set(key, arr)
    }
    return Array.from(map.entries())
  }, [visibleTasks])

  useEffect(() => {
    const nextTaskId = new URLSearchParams(locationSearch ?? '').get('task')
    if (nextTaskId) setSelectedTaskId(nextTaskId)
  }, [locationSearch])

  const applyView = (viewId: string) => {
    const view = savedViews.find((v) => v.id === viewId)
    if (!view) return
    const cfg = view.config ?? {}
    setSelectedSavedViewId(view.id)
    setActiveView(view.type)
    setStatusFilter((cfg.statusFilter as 'all' | TaskStatus) ?? 'all')
    setSortBy((cfg.sortBy as 'created' | 'due' | 'priority') ?? 'created')
    setGroupBy((cfg.groupBy as 'status' | 'priority' | 'assignee') ?? 'status')
    setHiddenFields(new Set(Array.isArray(cfg.hiddenFields) ? (cfg.hiddenFields as string[]) : []))
    setWipLimits(cfg.wipLimits && typeof cfg.wipLimits === 'object' ? (cfg.wipLimits as Record<string, number>) : {})
  }

  useEffect(() => {
    if (appliedInitialView || savedViews.length === 0) return
    const defaultView = savedViews.find((v) => v.isDefault) ?? savedViews[0]
    if (defaultView) applyView(defaultView.id)
    setAppliedInitialView(true)
  }, [appliedInitialView, savedViews])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (event.key.toLowerCase() === 'c') {
        event.preventDefault()
        quickAddRef.current?.focus()
      }
      if (event.key.toLowerCase() === 'v') {
        event.preventDefault()
        const nextOrder: Array<typeof activeView> = ['list', 'board', 'table', 'calendar', 'gantt']
        const idx = nextOrder.indexOf(activeView)
        setActiveView(nextOrder[(idx + 1) % nextOrder.length])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeView])

  const calendarDays = useMemo(() => {
    const days: Date[] = []
    if (calendarView === 'week') {
      const weekStart = startOfWeek(calendarMonth, { weekStartsOn: 1 })
      for (let i = 0; i < 7; i++) days.push(addDays(weekStart, i))
      return days
    }
    const monthStart = startOfMonth(calendarMonth)
    const monthEnd = endOfMonth(calendarMonth)
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
    let cur = gridStart
    while (cur <= gridEnd) {
      days.push(cur)
      cur = addDays(cur, 1)
    }
    return days
  }, [calendarMonth, calendarView])

  // Reschedule a task's due date onto a calendar day (drag-drop / click-create).
  const rescheduleTask = async (taskId: string, day: Date) => {
    await api(`/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify({ dueDate: format(day, 'yyyy-MM-dd') }),
    })
    await refetch()
  }
  const createTaskOnDay = async (day: Date, title: string) => {
    await api('/tasks', {
      method: 'POST',
      body: JSON.stringify(buildCreateTaskBody({ listId, title, dueDate: format(day, 'yyyy-MM-dd') })),
    })
    await refetch()
  }

  const draggingTask = useMemo(
    () => tasks.find((task) => task.id === draggingTaskId) ?? null,
    [tasks, draggingTaskId],
  )

  const moveTaskStatus = async (taskId: string, status: TaskStatus) => {
    await api(`/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
    await refetch()
  }

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id)
    if (id.startsWith('task:')) {
      setDraggingTaskId(id.replace('task:', ''))
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const overId = event.over?.id ? String(event.over.id) : null
    const activeId = String(event.active.id)
    setDraggingTaskId(null)
    if (!overId || !activeId.startsWith('task:') || !overId.startsWith('status:')) return
    const taskId = activeId.replace('task:', '')
    const nextStatus = overId.replace('status:', '') as TaskStatus
    const task = tasks.find((task) => task.id === taskId)
    if (!task || task.status === nextStatus) return
    try {
      await moveTaskStatus(taskId, nextStatus)
    } catch (error) {
      console.error('Failed to move task status', error)
    }
  }

  const viewTabs: { id: typeof activeView; label: string }[] = [
    { id: 'list', label: t('list.viewList') },
    { id: 'board', label: t('list.viewBoard') },
    { id: 'table', label: t('list.viewTable') },
    { id: 'calendar', label: t('list.viewCalendar') },
    { id: 'gantt', label: t('list.viewGantt') },
  ]

  const statusOptions = listStatuses.length
    ? listStatuses
    : Object.entries(DEFAULT_STATUS_META).map(([k, m]) => ({ key: k, name: m.label }))

  // The Board renders one column per list status; a list with no status rows
  // (e.g. seeded outside the API) must still get the default columns.
  const boardStatuses: ListStatus[] = listStatuses.length
    ? listStatuses
    : Object.entries(DEFAULT_STATUS_META).map(([k, m], i) => ({
        id: k,
        listId,
        key: k,
        name: m.label,
        color: m.color,
        category:
          k === 'done' || k === 'cancelled'
            ? 'closed'
            : k === 'in_progress' || k === 'in_review'
              ? 'in_progress'
              : 'open',
        position: i,
      }))

  return (
    <ListStatusesContext.Provider value={listStatuses}>
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-[#0f1114]">
      <TaskListChrome
        listName={listMeta?.name ?? t('list.defaultListName')}
        taskCount={visibleTasks.length}
        quickAdd={
          <>
            <Input
              ref={quickAddRef}
              placeholder={t('list.quickAdd')}
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleCreateTask()}
              className="h-8 w-full sm:w-64 text-[13px] border-border/80 focus-visible:ring-violet-500/25"
            />
            <WorkFilterSelect
              value={newTaskPriority}
              onChange={(v) => setNewTaskPriority(v as TaskPriority)}
              className="h-8 capitalize"
            >
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p} value={p} className="capitalize">
                  {t(PRIORITY_LABEL_KEYS[p])}
                </option>
              ))}
            </WorkFilterSelect>
            <Input
              type="date"
              value={newTaskDueDate}
              onChange={(e) => setNewTaskDueDate(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleCreateTask()}
              title={t('list.sortDueDate')}
              className="h-8 w-[9.5rem] text-[13px] border-border/80 focus-visible:ring-violet-500/25"
            />
            <Button size="sm" className="h-8 bg-violet-600 hover:bg-violet-700 text-white" onClick={handleCreateTask}>
              {t('list.addTask')}
            </Button>
          </>
        }
        viewTabs={
          <WorkViewTabs tabs={viewTabs} active={activeView} onChange={setActiveView} />
        }
        toolbar={
          <>
            <WorkFilterSelect
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as 'all' | TaskStatus)}
            >
              <option value="all">{t('list.allStatuses')}</option>
              {statusOptions.map((status) => (
                <option key={status.key} value={status.key}>
                  {resolveStatusLabel(status.key, status.name, t)}
                </option>
              ))}
            </WorkFilterSelect>
            <WorkFilterSelect value={sortBy} onChange={(v) => setSortBy(v as typeof sortBy)}>
              <option value="created">{t('list.sortNewest')}</option>
              <option value="due">{t('list.sortDueDate')}</option>
              <option value="priority">{t('list.sortPriority')}</option>
            </WorkFilterSelect>
            <WorkFilterSelect value={groupBy} onChange={(v) => setGroupBy(v as typeof groupBy)}>
              <option value="status">{t('list.groupByStatus')}</option>
              <option value="priority">{t('list.groupByPriority')}</option>
              <option value="assignee">{t('list.groupByAssignee')}</option>
            </WorkFilterSelect>
            {activeView === 'table' && projectFields.length > 0 && (
              <details className="relative">
                <summary className="list-none h-8 px-2.5 flex items-center rounded-md border border-border/80 bg-card text-[12px] cursor-pointer select-none hover:bg-muted/40">
                  {t('list.table.fields', { shown: projectFields.length - hiddenFields.size, total: projectFields.length })}
                </summary>
                <div className="absolute z-20 mt-1 w-52 rounded-md border border-border bg-card p-1.5 shadow-lg">
                  {projectFields.map((f) => (
                    <label
                      key={f.id}
                      className="flex items-center gap-2 rounded px-2 py-1.5 text-[13px] hover:bg-muted/40 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={!hiddenFields.has(f.id)}
                        onChange={(e) =>
                          setHiddenFields((prev) => {
                            const next = new Set(prev)
                            if (e.target.checked) next.delete(f.id)
                            else next.add(f.id)
                            return next
                          })
                        }
                      />
                      <span className="truncate">{f.name}</span>
                    </label>
                  ))}
                  <p className="px-2 pt-1 text-[11px] text-muted-foreground">{t('list.saveToPersist')}</p>
                </div>
              </details>
            )}
            <WorkFilterSelect
              value={selectedSavedViewId}
              onChange={(v) => {
                if (!v) return
                applyView(v)
              }}
            >
              <option value="">{t('list.savedViews')}</option>
              {savedViews.map((view) => (
                <option key={view.id} value={view.id}>
                  {view.name}
                </option>
              ))}
            </WorkFilterSelect>
            <Input
              value={saveAsName}
              onChange={(e) => setSaveAsName(e.target.value)}
              placeholder={t('list.viewName')}
              className="h-8 w-28 text-[12px] border-border/80"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-[12px]"
              onClick={async () => {
                const name = saveAsName.trim()
                if (!name) return
                await api(`/lists/${listId}/views`, {
                  method: 'POST',
                  body: JSON.stringify({
                    name,
                    type: activeView,
                    config: { activeView, statusFilter, sortBy, groupBy, hiddenFields: Array.from(hiddenFields), wipLimits },
                  }),
                })
                setSaveAsName('')
                await qc.invalidateQueries({ queryKey: ['list-views', listId] })
              }}
            >
              {t('common.save')}
            </Button>
            {selectedSavedViewId ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-[12px]"
                  onClick={async () => {
                    await api(`/views/${selectedSavedViewId}`, {
                      method: 'PATCH',
                      body: { config: { activeView, statusFilter, sortBy, groupBy, hiddenFields: Array.from(hiddenFields), wipLimits } },
                    })
                    await qc.invalidateQueries({ queryKey: ['list-views', listId] })
                  }}
                >
                  {t('list.viewUpdate')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-[12px]"
                  onClick={async () => {
                    await api(`/views/${selectedSavedViewId}`, {
                      method: 'PATCH',
                      body: { isDefault: true },
                    })
                    await qc.invalidateQueries({ queryKey: ['list-views', listId] })
                  }}
                >
                  {t('list.viewDefault')}
                </Button>
              </>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-[12px]"
              onClick={() => setStatusManagerOpen(true)}
              title={t('list.manageStatusesTitle')}
            >
              {t('list.statusesButton')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-[12px]"
              onClick={() => setEmailAliasOpen(true)}
              title={t('list.emailAliasTitle')}
            >
              {t('list.emailButton')}
            </Button>
          </>
        }
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="rounded-lg border border-border/80 p-8 text-center text-[13px] text-muted-foreground">
            {t('list.loadingTasks')}
          </div>
        ) : visibleTasks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/80 bg-[#fbfbfc]/60 dark:bg-[#16181d]/40 p-12 text-center">
            <p className="text-[15px] font-medium text-foreground mb-1">{t('list.noTasksYet')}</p>
            <p className="text-[13px] text-muted-foreground mb-4">
              {t('list.empty.addFirstHintBefore')}{' '}
              <kbd className="px-1.5 py-0.5 rounded bg-muted text-[11px] font-mono">C</kbd> {t('list.empty.addFirstHintAfter')}
            </p>
            <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white" onClick={() => quickAddRef.current?.focus()}>
              {t('list.createTask')}
            </Button>
          </div>
        ) : activeView === 'list' ? (
          <GroupedListView
            tasks={visibleTasks}
            groupBy={groupBy}
            selectedTaskIds={selectedTaskIds}
            onPatchTask={async (taskId, patch) => {
              await api(`/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(patch) })
              await refetch()
            }}
            onToggleSelect={(taskId, additive) => {
              setSelectedTaskIds((prev) => {
                const next = new Set(prev)
                if (additive) {
                  if (next.has(taskId)) next.delete(taskId)
                  else next.add(taskId)
                } else if (next.size === 1 && next.has(taskId)) {
                  next.clear()
                } else {
                  next.clear()
                  next.add(taskId)
                }
                return next
              })
            }}
            onOpenTask={(id) => setSelectedTaskId(id)}
            onToggleDone={async (task) => {
              // Pick the list's first "closed" status when completing,
              // and the first "open" status when re-opening, so the toggle
              // works regardless of how the user has renamed things.
              const isClosed = task.statusCategory === 'closed' || task.status === 'done'
              const target = isClosed
                ? listStatuses.find((s) => s.category === 'open') ?? listStatuses[0]
                : listStatuses.find((s) => s.category === 'closed') ?? listStatuses[listStatuses.length - 1]
              const nextStatus = target?.key ?? (isClosed ? 'todo' : 'done')
              await api(`/tasks/${task.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ status: nextStatus }),
              })
              await refetch()
            }}
            onAddTask={async (status, title, opts) => {
              await api('/tasks', {
                method: 'POST',
                body: JSON.stringify(
                  buildCreateTaskBody({
                    listId,
                    title,
                    status,
                    priority: opts?.priority,
                    dueDate: opts?.dueDate,
                    startDate: opts?.startDate,
                  }),
                ),
              })
              await refetch()
            }}
          />
        ) : activeView === 'board' ? (
          <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {boardStatuses.map((s) => (
                <BoardColumn
                  key={s.key}
                  status={s.key}
                  tasks={tasksByStatus[s.key] ?? []}
                  onOpenTask={(taskId) => setSelectedTaskId(taskId)}
                  collapsed={collapsedColumns.has(s.key)}
                  onToggleCollapse={() =>
                    setCollapsedColumns((prev) => {
                      const next = new Set(prev)
                      if (next.has(s.key)) next.delete(s.key)
                      else next.add(s.key)
                      return next
                    })
                  }
                  wipLimit={wipLimits[s.key]}
                  onSetWipLimit={(n) =>
                    setWipLimits((prev) => {
                      const next = { ...prev }
                      if (n == null) delete next[s.key]
                      else next[s.key] = n
                      return next
                    })
                  }
                  onAddTask={async (title) => {
                    await api('/tasks', {
                      method: 'POST',
                      body: JSON.stringify({ listId, title, status: s.key, priority: 'normal' }),
                    })
                    await refetch()
                  }}
                />
              ))}
            </div>
            <DragOverlay>
              {draggingTask ? (
                <div className="w-56 rounded border border-border bg-card p-2 shadow-xl">
                  <div className="font-medium text-sm">{draggingTask.title}</div>
                  <div className="text-xs text-muted-foreground">{t(PRIORITY_LABEL_KEYS[draggingTask.priority])}</div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : activeView === 'table' ? (
          <TableView
            tasks={visibleTasks}
            workspaceId={workspaceId}
            projectId={projectId}
            projectFields={projectFields.filter((f) => !hiddenFields.has(f.id))}
            workspaceMembers={workspaceMembers}
            onOpenTask={(id) => setSelectedTaskId(id)}
            onPatchTask={async (id, patch) => {
              await api(`/tasks/${id}`, {
                method: 'PATCH',
                body: JSON.stringify(patch),
              })
              await refetch()
            }}
            onAddTask={async (title) => {
              await api('/tasks', {
                method: 'POST',
                body: JSON.stringify({ listId, title, status: 'todo', priority: 'normal' }),
              })
              await refetch()
            }}
            onRefresh={refetch}
          />
        ) : activeView === 'gantt' ? (
          <GanttView
            tasks={visibleTasks}
            groupBy={groupBy}
            onOpenTask={(id) => setSelectedTaskId(id)}
          />
        ) : (
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setCalendarMonth((d) => (calendarView === 'week' ? addDays(d, -7) : addMonths(d, -1)))
                }
              >
                {t('list.calendar.prev')}
              </Button>
              <div className="flex items-center gap-3">
                <h3 className="font-semibold">
                  {calendarView === 'week'
                    ? `${shortDate(startOfWeek(calendarMonth, { weekStartsOn: 1 }), locale)} – ${endOfWeek(calendarMonth, { weekStartsOn: 1 }).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })}`
                    : calendarMonth.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}
                </h3>
                <div className="flex items-center gap-1 rounded-md border border-border p-0.5 text-xs">
                  {(['month', 'week'] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setCalendarView(v)}
                      className={cn(
                        'px-2 py-0.5 rounded capitalize',
                        calendarView === v ? 'bg-brand-700 text-white' : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {v === 'month' ? t('list.calendar.month') : t('list.calendar.week')}
                    </button>
                  ))}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setCalendarMonth((d) => (calendarView === 'week' ? addDays(d, 7) : addMonths(d, 1)))
                }
              >
                {t('list.calendar.next')}
              </Button>
            </div>
            <div className="grid grid-cols-7 gap-2 text-xs font-medium text-muted-foreground mb-2">
              {Array.from({ length: 7 }, (_, i) => {
                const day = addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), i)
                return (
                  <div key={i} className="px-1">
                    {day.toLocaleDateString(locale, { weekday: 'short' })}
                  </div>
                )
              })}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {calendarDays.map((day) => {
                const key = format(day, 'yyyy-MM-dd')
                const dayTasks = tasksByDate.find(([k]) => k === key)?.[1] ?? []
                const isDragTarget = calendarDragTaskId != null
                return (
                  <div
                    key={key}
                    onDragOver={(e) => {
                      if (calendarDragTaskId) e.preventDefault()
                    }}
                    onDrop={() => {
                      if (calendarDragTaskId) {
                        void rescheduleTask(calendarDragTaskId, day)
                        setCalendarDragTaskId(null)
                      }
                    }}
                    className={cn(
                      calendarView === 'week' ? 'min-h-64' : 'min-h-28',
                      'group/day rounded border border-border p-2 transition-colors',
                      isToday(day) && 'ring-1 ring-ring',
                      isSameMonth(day, calendarMonth) ? 'bg-card' : 'bg-muted/30 text-muted-foreground',
                      isDragTarget && 'hover:ring-2 hover:ring-brand-500 hover:bg-accent/10',
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs">{format(day, 'd')}</span>
                      <button
                        type="button"
                        aria-label={t('list.calendar.addTaskAria')}
                        onClick={() => {
                          setCalendarQuickAddDay(key)
                          setCalendarQuickAddTitle('')
                        }}
                        className="opacity-0 group-hover/day:opacity-100 text-muted-foreground hover:text-foreground"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="space-y-1">
                      {dayTasks.slice(0, calendarView === 'week' ? 12 : 3).map((task) => (
                        <button
                          key={task.id}
                          draggable
                          onDragStart={() => setCalendarDragTaskId(task.id)}
                          onDragEnd={() => setCalendarDragTaskId(null)}
                          className="block w-full text-left rounded bg-muted px-1 py-0.5 text-[11px] hover:bg-secondary cursor-grab active:cursor-grabbing"
                          onClick={() => setSelectedTaskId(task.id)}
                        >
                          {task.title}
                        </button>
                      ))}
                      {dayTasks.length > (calendarView === 'week' ? 12 : 3) ? (
                        <div className="text-[11px] text-muted-foreground">
                          {t('list.calendar.more', { count: dayTasks.length - (calendarView === 'week' ? 12 : 3) })}
                        </div>
                      ) : null}
                      {calendarQuickAddDay === key && (
                        <input
                          autoFocus
                          value={calendarQuickAddTitle}
                          onChange={(e) => setCalendarQuickAddTitle(e.target.value)}
                          onBlur={() => setCalendarQuickAddDay(null)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && calendarQuickAddTitle.trim()) {
                              void createTaskOnDay(day, calendarQuickAddTitle.trim())
                              setCalendarQuickAddDay(null)
                              setCalendarQuickAddTitle('')
                            }
                            if (e.key === 'Escape') setCalendarQuickAddDay(null)
                          }}
                          placeholder={t('list.taskTitle')}
                          className="w-full rounded border border-border bg-background px-1 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        )}
      </div>
      <BulkActionBar
        selectedIds={selectedTaskIds}
        onClear={() => setSelectedTaskIds(new Set())}
        workspaceMembers={workspaceMembers}
        onApplied={async () => {
          setSelectedTaskIds(new Set())
          await refetch()
        }}
      />
      <TaskDetailSheet taskId={selectedTaskId} open={Boolean(selectedTaskId)} onOpenChange={(next) => !next && setSelectedTaskId(null)} workspaceId={workspaceId} />
      <ListStatusesManager listId={listId} open={statusManagerOpen} onOpenChange={setStatusManagerOpen} />
      <ListEmailAliasPanel listId={listId} open={emailAliasOpen} onOpenChange={setEmailAliasOpen} />
    </div>
    </ListStatusesContext.Provider>
  )
}

function GroupedListView({
  tasks,
  groupBy,
  selectedTaskIds,
  onToggleSelect,
  onOpenTask,
  onToggleDone,
  onPatchTask,
  onAddTask,
}: {
  tasks: TaskItem[]
  groupBy: 'status' | 'priority' | 'assignee'
  selectedTaskIds: Set<string>
  onToggleSelect: (taskId: string, additive: boolean) => void
  onOpenTask: (taskId: string) => void
  onToggleDone: (task: TaskItem) => Promise<void> | void
  onPatchTask?: (taskId: string, patch: TaskPatch) => Promise<void> | void
  onAddTask: (
    status: TaskStatus,
    title: string,
    opts?: { priority?: TaskPriority; dueDate?: string; startDate?: string },
  ) => Promise<void> | void
}) {
  const { t } = useTranslation()
  const ordered = useOrderedStatuses()
  const grouped = useMemo(() => {
    const map: Record<string, TaskItem[]> = {}
    for (const s of ordered) map[s.key] = []
    for (const task of tasks) {
      if (!map[task.status]) map[task.status] = []
      map[task.status].push(task)
    }
    return map
  }, [tasks, ordered])

  // Collapse by default: closed-category statuses start collapsed so the
  // active work is visible first.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    for (const s of ordered) initial[s.key] = s.category === 'closed'
    return initial
  })

  if (groupBy === 'assignee') {
    // Group by each task's first assignee; a task with no assignee lands in
    // "Unassigned". Names come from the task's own assignee payload.
    const groups = new Map<string, { name: string; tasks: TaskItem[] }>()
    for (const task of tasks) {
      const first = task.assignees?.[0]
      const gid = first?.userId ?? '__unassigned__'
      const name = first?.user?.displayName ?? t('list.group.unassigned')
      if (!groups.has(gid)) groups.set(gid, { name, tasks: [] })
      groups.get(gid)!.tasks.push(task)
    }
    const ordered = [...groups.entries()].sort((a, b) => {
      if (a[0] === '__unassigned__') return 1
      if (b[0] === '__unassigned__') return -1
      return a[1].name.localeCompare(b[1].name)
    })
    return (
      <div className="space-y-4">
        {ordered.map(([gid, group]) => (
          <Card key={gid} className="p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              {gid === '__unassigned__' ? (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground">?</span>
              ) : (
                <PersonAvatar name={group.name} size="xs" />
              )}
              {group.name} ({group.tasks.length})
            </div>
            <div className="space-y-2">
              {group.tasks.length >= VIRTUALIZE_THRESHOLD ? (
                <VirtualizedTaskRows
                  virtualKey={`assignee:${gid}`}
                  tasks={group.tasks}
                  selectedTaskIds={selectedTaskIds}
                  onToggleSelect={onToggleSelect}
                  onOpenTask={onOpenTask}
                  onToggleDone={onToggleDone}
                />
              ) : (
                group.tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    selected={selectedTaskIds.has(task.id)}
                    onToggleSelect={(additive) => onToggleSelect(task.id, additive)}
                    onOpenTask={onOpenTask}
                    onToggleDone={onToggleDone}
                  />
                ))
              )}
            </div>
          </Card>
        ))}
      </div>
    )
  }

  if (groupBy === 'priority') {
    const priorityGroups: TaskPriority[] = ['urgent', 'high', 'normal', 'low']
    return (
      <div className="space-y-4">
        {priorityGroups.map((priority) => {
          const groupTasks = tasks.filter((task) => task.priority === priority)
          return (
            <Card key={priority} className="p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium capitalize">
                <Flag className={cn('h-4 w-4', PRIORITY_COLORS[priority])} />
                {t(PRIORITY_LABEL_KEYS[priority])} ({groupTasks.length})
              </div>
              <div className="space-y-2">
                {groupTasks.length >= VIRTUALIZE_THRESHOLD ? (
                  <VirtualizedTaskRows
                    virtualKey={`priority:${priority}`}
                    tasks={groupTasks}
                    selectedTaskIds={selectedTaskIds}
                    onToggleSelect={onToggleSelect}
                    onOpenTask={onOpenTask}
                    onToggleDone={onToggleDone}
                    onPatchTask={onPatchTask}
                  />
                ) : (
                  groupTasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      selected={selectedTaskIds.has(task.id)}
                      onToggleSelect={(additive) => onToggleSelect(task.id, additive)}
                      onOpenTask={onOpenTask}
                      onToggleDone={onToggleDone}
                      onPatchTask={onPatchTask}
                    />
                  ))
                )}
                {groupTasks.length === 0 && <div className="text-xs text-muted-foreground">{t('list.noTasks')}</div>}
              </div>
            </Card>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {ordered
        .filter((s) => (grouped[s.key]?.length ?? 0) > 0 || s.category === 'open' || s.category === 'in_progress')
        .map((statusDef) => {
          const status = statusDef.key
          const groupTasks = grouped[status] ?? []
          const isCollapsed = collapsed[status]
          return (
          <section key={status} className="rounded-lg border border-border bg-card overflow-hidden">
            <header
              className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/40 cursor-pointer select-none"
              onClick={() => setCollapsed((c) => ({ ...c, [status]: !c[status] }))}
            >
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: statusDef.color }}
              />
              <h3 className="font-semibold text-sm text-foreground">{resolveStatusLabel(statusDef.key, statusDef.name, t)}</h3>
              <span className="text-xs text-muted-foreground tabular-nums">{groupTasks.length}</span>
            </header>
            {!isCollapsed && (
              <div className="divide-y divide-border">
                {groupTasks.length >= VIRTUALIZE_THRESHOLD ? (
                  <VirtualizedTaskRows
                    virtualKey={`status:${status}`}
                    tasks={groupTasks}
                    selectedTaskIds={selectedTaskIds}
                    onToggleSelect={onToggleSelect}
                    onOpenTask={onOpenTask}
                    onToggleDone={onToggleDone}
                    onPatchTask={onPatchTask}
                  />
                ) : (
                  groupTasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      selected={selectedTaskIds.has(task.id)}
                      onToggleSelect={(additive) => onToggleSelect(task.id, additive)}
                      onOpenTask={onOpenTask}
                      onToggleDone={onToggleDone}
                      onPatchTask={onPatchTask}
                    />
                  ))
                )}
                <InlineAddTask status={status} onAdd={(title, opts) => onAddTask(status, title, opts)} />
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

function VirtualizedTaskRows({
  virtualKey,
  tasks,
  selectedTaskIds,
  onToggleSelect,
  onOpenTask,
  onToggleDone,
  onPatchTask,
}: {
  virtualKey: string
  tasks: TaskItem[]
  selectedTaskIds: Set<string>
  onToggleSelect: (taskId: string, additive: boolean) => void
  onOpenTask: (taskId: string) => void
  onToggleDone: (task: TaskItem) => Promise<void> | void
  onPatchTask?: (taskId: string, patch: TaskPatch) => Promise<void> | void
}) {
  const parentRef = useRef<HTMLDivElement | null>(null)
  const rowVirtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => TASK_ROW_ESTIMATE_PX,
    overscan: 8,
  })

  return (
    <div key={virtualKey} ref={parentRef} className="max-h-[60vh] overflow-auto">
      <div className="relative w-full" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
        {rowVirtualizer.getVirtualItems().map((row) => {
          const task = tasks[row.index]
          return (
            <div
              key={task.id}
              ref={rowVirtualizer.measureElement}
              data-index={row.index}
              className={cn(
                'absolute left-0 top-0 w-full border-b border-border',
                row.index === tasks.length - 1 && 'border-b-0',
              )}
              style={{ transform: `translateY(${row.start}px)` }}
            >
              <TaskRow
                task={task}
                selected={selectedTaskIds.has(task.id)}
                onToggleSelect={(additive) => onToggleSelect(task.id, additive)}
                onOpenTask={onOpenTask}
                onToggleDone={onToggleDone}
                onPatchTask={onPatchTask}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TaskRow({
  task,
  selected,
  onToggleSelect,
  onOpenTask,
  onToggleDone,
  onPatchTask,
}: {
  task: TaskItem
  selected: boolean
  onToggleSelect: (additive: boolean) => void
  onOpenTask: (taskId: string) => void
  onToggleDone: (task: TaskItem) => Promise<void> | void
  onPatchTask?: (taskId: string, patch: TaskPatch) => Promise<void> | void
}) {
  const { t, locale } = useTranslation()
  // statusCategory ('closed') is the post-custom-statuses signal; falling
  // back to the literal 'done' key keeps existing tasks rendering correctly
  // while the API/list-statuses caches warm up.
  const isDone = task.statusCategory === 'closed' || task.status === 'done'
  const assignees = task.assignees ?? []
  // Inline edits (Plan §5): cycle priority on click; edit due date in place.
  const cyclePriority = () => {
    const order: TaskPriority[] = ['low', 'normal', 'high', 'urgent']
    const next = order[(order.indexOf(task.priority) + 1) % order.length]
    void onPatchTask?.(task.id, { priority: next })
  }

  return (
    <div
      className={cn(
        'group flex items-center gap-3 px-3 py-2 hover:bg-muted/60 cursor-pointer transition-colors',
        selected && 'bg-accent/10 hover:bg-accent/15',
      )}
      onClick={(e) => {
        if (e.shiftKey || e.metaKey || e.ctrlKey) {
          e.preventDefault()
          onToggleSelect(true)
          return
        }
        onOpenTask(task.id)
      }}
    >
      <input
        type="checkbox"
        checked={selected}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onToggleSelect(e.target.checked ? true : false)}
        className={cn(
          'h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-border accent-accent',
          'opacity-0 group-hover:opacity-100 transition-opacity',
          selected && 'opacity-100',
        )}
        aria-label={selected ? t('list.deselectTaskAria') : t('list.selectTaskAria')}
      />
      <button
        className="shrink-0 text-muted-foreground hover:text-accent transition-colors"
        onClick={(e) => {
          e.stopPropagation()
          void onToggleDone(task)
        }}
        aria-label={isDone ? t('list.markIncompleteAria') : t('list.markDoneAria')}
      >
        {isDone ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        ) : (
          <Circle className="h-4 w-4" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div
          className={cn(
            'text-sm font-medium truncate',
            isDone && 'line-through text-muted-foreground',
          )}
        >
          {task.title}
        </div>
        {(task.openBlockerCount ?? 0) > 0 || (task.blocksOpenCount ?? 0) > 0 ? (
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {(task.openBlockerCount ?? 0) > 0 ? (
              <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-1.5 py-0.5 text-amber-700 dark:text-amber-300">
                {t('list.blockedBy', { count: task.openBlockerCount ?? 0 })}
              </span>
            ) : null}
            {(task.blocksOpenCount ?? 0) > 0 ? (
              <span className="rounded-full border border-blue-400/40 bg-blue-500/10 px-1.5 py-0.5 text-blue-700 dark:text-blue-300">
                {t('list.blocks', { count: task.blocksOpenCount ?? 0 })}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {onPatchTask ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            cyclePriority()
          }}
          className="shrink-0 rounded p-0.5 hover:bg-muted"
          title={t('list.priorityTitle', { priority: t(PRIORITY_LABEL_KEYS[task.priority]) })}
          aria-label={t('list.changePriorityAria')}
        >
          <Flag className={cn('h-3.5 w-3.5', PRIORITY_COLORS[task.priority])} />
        </button>
      ) : (
        <Flag className={cn('h-3.5 w-3.5 shrink-0', PRIORITY_COLORS[task.priority])} />
      )}

      {onPatchTask ? (
        <input
          type="date"
          value={task.dueDate ? format(new Date(task.dueDate), 'yyyy-MM-dd') : ''}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => void onPatchTask(task.id, { dueDate: e.target.value || null })}
          title={t('list.setDueDateTitle')}
          className="h-6 w-[7.5rem] shrink-0 rounded border border-transparent bg-transparent px-1 text-xs text-muted-foreground hover:border-border focus:border-border focus:bg-card focus:outline-none"
        />
      ) : (
        task.dueDate && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
            <CalendarIcon className="h-3 w-3" />
            {shortDate(new Date(task.dueDate), locale)}
          </div>
        )
      )}

      <div className="flex -space-x-1 shrink-0 min-w-[40px] justify-end">
        {assignees.slice(0, 3).map((a) => {
          const label = a.user?.displayName?.[0]?.toUpperCase() ?? '?'
          return (
            <div
              key={a.userId}
              className="h-6 w-6 rounded-full bg-brand-300 text-foreground text-[10px] font-semibold flex items-center justify-center ring-2 ring-card"
              title={a.user?.displayName ?? ''}
            >
              {label}
            </div>
          )
        })}
        {assignees.length > 3 && (
          <div className="h-6 w-6 rounded-full bg-muted text-muted-foreground text-[10px] font-semibold flex items-center justify-center ring-2 ring-card">
            +{assignees.length - 3}
          </div>
        )}
      </div>
    </div>
  )
}

function InlineAddTask({
  status,
  onAdd,
}: {
  status: TaskStatus
  onAdd: (
    title: string,
    opts?: { priority?: TaskPriority; dueDate?: string; startDate?: string },
  ) => Promise<void> | void
}) {
  const { t } = useTranslation()
  const meta = useStatusMeta(status)
  const [value, setValue] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('normal')
  const [dueDate, setDueDate] = useState('')
  const [active, setActive] = useState(false)
  // Guards the field-level onBlur from collapsing the composer while focus is
  // simply moving between the title/priority/date controls in the same row.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const reset = () => {
    setValue('')
    setPriority('normal')
    setDueDate('')
  }

  const submit = async () => {
    const trimmed = value.trim()
    if (!trimmed) {
      setActive(false)
      reset()
      return
    }
    await onAdd(trimmed, { priority, dueDate })
    reset()
  }

  const onFieldBlur = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => {
      void submit()
    }, 120)
  }
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
  }

  if (!active) {
    return (
      <button
        className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
        onClick={() => setActive(true)}
      >
        <Plus className="h-4 w-4" />
        {t('list.addTask')}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
      <Input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={cancelClose}
        onBlur={onFieldBlur}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            cancelClose()
            void submit()
          } else if (e.key === 'Escape') {
            cancelClose()
            reset()
            setActive(false)
          }
        }}
        placeholder={t('list.newStatusTaskPlaceholder', { status: meta.label.toLowerCase() })}
        className="h-7 flex-1 text-sm border-0 shadow-none focus-visible:ring-0 px-0"
      />
      <WorkFilterSelect
        value={priority}
        onChange={(v) => setPriority(v as TaskPriority)}
        className="h-7 capitalize shrink-0"
      >
        {PRIORITY_OPTIONS.map((p) => (
          <option key={p} value={p} className="capitalize">
            {t(PRIORITY_LABEL_KEYS[p])}
          </option>
        ))}
      </WorkFilterSelect>
      <Input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        onFocus={cancelClose}
        onBlur={onFieldBlur}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            cancelClose()
            void submit()
          } else if (e.key === 'Escape') {
            cancelClose()
            reset()
            setActive(false)
          }
        }}
        title={t('list.sortDueDate')}
        className="h-7 w-[9rem] shrink-0 text-xs border-border/80 focus-visible:ring-0"
      />
    </div>
  )
}

type TaskPatch = Partial<Pick<TaskItem, 'title' | 'status' | 'priority' | 'dueDate'>> & {
  dueDate?: string | null
}

const PRIORITY_ORDER: TaskPriority[] = ['urgent', 'high', 'normal', 'low']

function TableView({
  tasks,
  workspaceId,
  projectId,
  projectFields,
  workspaceMembers,
  onOpenTask,
  onPatchTask,
  onAddTask,
  onRefresh,
}: {
  tasks: TaskItem[]
  workspaceId: string
  projectId: string
  projectFields: CustomFieldDef[]
  workspaceMembers: WorkspaceMember[]
  onOpenTask: (taskId: string) => void
  onPatchTask: (taskId: string, patch: TaskPatch) => Promise<void> | void
  onAddTask: (title: string) => Promise<void> | void
  onRefresh: () => Promise<unknown>
}) {
  const { t, tCount, locale } = useTranslation()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null)
  const [titleDraft, setTitleDraft] = useState('')
  const [statusOpenFor, setStatusOpenFor] = useState<string | null>(null)
  const [priorityOpenFor, setPriorityOpenFor] = useState<string | null>(null)
  const [dateOpenFor, setDateOpenFor] = useState<string | null>(null)
  const [assigneeOpenFor, setAssigneeOpenFor] = useState<string | null>(null)
  const [customOpen, setCustomOpen] = useState<{ taskId: string; fieldId: string } | null>(null)
  const [addActive, setAddActive] = useState(false)
  const [addDraft, setAddDraft] = useState('')
  const tableParentRef = useRef<HTMLDivElement | null>(null)
  const qc = useQueryClient()

  const { data: customFieldByTask = {} } = useQuery({
    queryKey: ['task-custom-fields-batch', workspaceId, projectId, tasks.map((task) => task.id).join(',')],
    enabled: tasks.length > 0 && projectFields.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(
        tasks.map(async (task) => {
          const rows = await api<CustomFieldValue[]>(
            `/workspaces/${workspaceId}/tasks/${task.id}/custom-fields`,
          )
          const rowMap = Object.fromEntries(rows.map((r) => [r.definition.id, r.value]))
          return [task.id, rowMap] as const
        }),
      )
      return Object.fromEntries(entries)
    },
  })

  const listStatusList = useListStatuses()
  const listStatusByKey = useMemo(
    () => Object.fromEntries(listStatusList.map((s) => [s.key, s])),
    [listStatusList],
  )

  const allSelected = tasks.length > 0 && tasks.every((task) => selected.has(task.id))
  const toggleAll = () => {
    setSelected((prev) => {
      if (allSelected) return new Set()
      return new Set(tasks.map((task) => task.id))
    })
  }
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const commitTitle = async (task: TaskItem) => {
    const trimmed = titleDraft.trim()
    setEditingTitleId(null)
    if (!trimmed || trimmed === task.title) return
    await onPatchTask(task.id, { title: trimmed })
  }

  const submitAdd = async () => {
    const trimmed = addDraft.trim()
    if (!trimmed) {
      setAddActive(false)
      return
    }
    await onAddTask(trimmed)
    setAddDraft('')
  }

  const columns = [
    { key: 'checkbox', label: '', width: 'w-9' },
    { key: 'title', label: t('list.table.colTitle'), width: 'flex-1 min-w-[240px]' },
    { key: 'status', label: t('taskDetail.fieldStatus'), width: 'w-36' },
    { key: 'priority', label: t('taskDetail.fieldPriority'), width: 'w-28' },
    { key: 'assignees', label: t('taskDetail.fieldAssignees'), width: 'w-28' },
    { key: 'due', label: t('taskDetail.fieldDueDate'), width: 'w-28' },
    { key: 'created', label: t('list.table.colCreated'), width: 'w-24' },
  ] as const
  // Visibility is controlled upstream by the view's Fields picker; render all
  // that were passed in (Plan §4/§5 per-view custom-field visibility).
  const customColumns = projectFields
  const selectedIds = Array.from(selected)
  const useTableVirtualization = tasks.length >= TABLE_VIRTUALIZE_THRESHOLD
  const tableRowVirtualizer = useVirtualizer({
    count: useTableVirtualization ? tasks.length : 0,
    getScrollElement: () => tableParentRef.current,
    estimateSize: () => TABLE_ROW_ESTIMATE_PX,
    overscan: 14,
  })
  const tableVirtualItems = useTableVirtualization ? tableRowVirtualizer.getVirtualItems() : []
  const tableTopPadding = useTableVirtualization && tableVirtualItems.length > 0 ? tableVirtualItems[0]!.start : 0
  const tableBottomPadding =
    useTableVirtualization && tableVirtualItems.length > 0
      ? tableRowVirtualizer.getTotalSize() - tableVirtualItems[tableVirtualItems.length - 1]!.end
      : 0
  const applyBulkPatch = async (patch: TaskPatch) => {
    await Promise.all(selectedIds.map((id) => onPatchTask(id, patch)))
    setSelected(new Set())
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Legend */}
      <TableStatusLegend />

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {selectedIds.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-accent/10 text-xs">
          <span className="font-medium text-foreground">{tCount('list.bulk.selected', selectedIds.length)}</span>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void applyBulkPatch({ status: 'done' })}>
            {t('list.table.markDone')}
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void applyBulkPatch({ priority: 'high' })}>
            {t('list.table.highPriority')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => void applyBulkPatch({ dueDate: new Date().toISOString() })}
          >
            {t('list.table.dueToday')}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs ml-auto" onClick={() => setSelected(new Set())}>
            {t('list.clear')}
          </Button>
        </div>
      )}
      <div className="overflow-x-auto">
        <div className="min-w-[980px]">
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-center bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {columns.map((col) => (
              <div
                key={col.key}
                className={cn('px-3 py-2 flex items-center gap-2', col.width)}
              >
                {col.key === 'checkbox' ? (
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="h-3.5 w-3.5 rounded border-border accent-brand-700 cursor-pointer"
                    aria-label={t('list.table.selectAllAria')}
                  />
                ) : (
                  col.label
                )}
              </div>
            ))}
            {customColumns.map((field) => (
              <div key={field.id} className="px-3 py-2 w-36 flex items-center gap-2">
                {field.name}
              </div>
            ))}
          </div>

          {/* Rows */}
          <div
            ref={useTableVirtualization ? tableParentRef : undefined}
            className={cn(useTableVirtualization && 'max-h-[70vh] overflow-auto')}
          >
          <div className="divide-y divide-border">
            {useTableVirtualization && tableTopPadding > 0 ? (
              <div style={{ height: tableTopPadding }} aria-hidden="true" />
            ) : null}
            {(useTableVirtualization
              ? tableVirtualItems.map((vi) => ({ task: tasks[vi.index]!, key: `virt-${vi.key}` }))
              : tasks.map((task) => ({ task, key: task.id }))
            ).map(({ task, key }) => {
              const dynamicStatus = listStatusByKey[task.status]
              const fallback = DEFAULT_STATUS_META[task.status]
              const meta: StatusMeta = dynamicStatus
                ? { label: dynamicStatus.name, color: dynamicStatus.color, dot: '', pill: '' }
                : fallback ?? { label: task.status, color: '#94a3b8', dot: 'bg-zinc-400', pill: 'bg-muted/60 text-muted-foreground border-border' }
              const isSelected = selected.has(task.id)
              const isEditing = editingTitleId === task.id
              const assignees = task.assignees ?? []
              const taskCustom = customFieldByTask[task.id] ?? {}
              return (
                <div
                  key={key}
                  className={cn(
                    'group flex items-stretch h-9 text-sm transition-colors hover:bg-muted/60 even:bg-muted/30',
                    isSelected && 'bg-accent/10',
                  )}
                >
                  {/* Checkbox */}
                  <div className="w-9 px-3 flex items-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleOne(task.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-3.5 w-3.5 rounded border-border accent-brand-700 cursor-pointer"
                      aria-label={t('list.table.selectTaskAria', { title: task.title })}
                    />
                  </div>

                  {/* Title */}
                  <div
                    className="flex-1 min-w-[240px] px-3 flex items-center cursor-pointer"
                    onClick={() => {
                      if (!isEditing) onOpenTask(task.id)
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      setTitleDraft(task.title)
                      setEditingTitleId(task.id)
                    }}
                  >
                    {isEditing ? (
                      <input
                        autoFocus
                        value={titleDraft}
                        onChange={(e) => setTitleDraft(e.target.value)}
                        onBlur={() => void commitTitle(task)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            void commitTitle(task)
                          } else if (e.key === 'Escape') {
                            setEditingTitleId(null)
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full h-7 bg-card border border-border rounded px-2 text-sm outline-none focus:ring-1 focus:ring-brand-500"
                      />
                    ) : (
                      <span
                        className={cn(
                          'truncate font-medium inline-flex items-center gap-1',
                          (task.statusCategory === 'closed' || task.status === 'done') && 'line-through text-muted-foreground',
                        )}
                      >
                        {task.isMilestone && <Diamond className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" />}
                        {task.title}
                      </span>
                    )}
                  </div>

                  {/* Status */}
                  <div className="w-36 px-3 flex items-center relative">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setStatusOpenFor((cur) => (cur === task.id ? null : task.id))
                        setPriorityOpenFor(null)
                        setDateOpenFor(null)
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium border"
                      style={pillStyleFor(meta.color)}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
                      {resolveStatusLabel(task.status, dynamicStatus?.name, t)}
                    </button>
                    {statusOpenFor === task.id && (
                      <div
                        className="absolute top-full left-3 mt-1 z-20 w-44 rounded-md border border-border bg-card shadow-lg py-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {(listStatusList.length > 0
                          ? listStatusList
                          : Object.entries(DEFAULT_STATUS_META).map(([k, m], i) => ({
                              id: k,
                              key: k,
                              name: m.label,
                              color: m.color,
                              position: i,
                            }))
                        ).map((s) => (
                          <button
                            key={s.key}
                            type="button"
                            className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted text-left"
                            onClick={async () => {
                              setStatusOpenFor(null)
                              if (task.status !== s.key) {
                                await onPatchTask(task.id, { status: s.key })
                              }
                            }}
                          >
                            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                            {resolveStatusLabel(s.key, s.name, t)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Priority */}
                  <div className="w-28 px-3 flex items-center relative">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setPriorityOpenFor((cur) => (cur === task.id ? null : task.id))
                        setStatusOpenFor(null)
                        setDateOpenFor(null)
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground hover:text-foreground"
                    >
                      <Flag className={cn('h-3.5 w-3.5', PRIORITY_COLORS[task.priority])} />
                      <span className="capitalize">{t(PRIORITY_LABEL_KEYS[task.priority])}</span>
                    </button>
                    {priorityOpenFor === task.id && (
                      <div
                        className="absolute top-full left-3 mt-1 z-20 w-36 rounded-md border border-border bg-card shadow-lg py-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {PRIORITY_ORDER.map((p) => (
                          <button
                            key={p}
                            type="button"
                            className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted text-left capitalize"
                            onClick={async () => {
                              setPriorityOpenFor(null)
                              if (task.priority !== p) {
                                await onPatchTask(task.id, { priority: p })
                              }
                            }}
                          >
                            <Flag className={cn('h-3.5 w-3.5', PRIORITY_COLORS[p])} />
                            {t(PRIORITY_LABEL_KEYS[p])}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Assignees */}
                  <div className="w-28 px-3 flex items-center relative">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setAssigneeOpenFor((cur) => (cur === task.id ? null : task.id))
                        setStatusOpenFor(null)
                        setPriorityOpenFor(null)
                        setDateOpenFor(null)
                      }}
                      className="w-full text-left"
                    >
                      {assignees.length === 0 ? (
                        <span className="text-muted-foreground text-xs">{t('list.table.assign')}</span>
                      ) : (
                        <div className="flex -space-x-1">
                          {assignees.slice(0, 3).map((a) => {
                            const label = a.user?.displayName?.[0]?.toUpperCase() ?? '?'
                            return (
                              <div
                                key={a.userId}
                                className="h-5 w-5 rounded-full bg-brand-300 text-foreground text-[10px] font-semibold flex items-center justify-center ring-2 ring-card"
                                title={a.user?.displayName ?? ''}
                              >
                                {label}
                              </div>
                            )
                          })}
                          {assignees.length > 3 && (
                            <div className="h-5 w-5 rounded-full bg-muted text-muted-foreground text-[10px] font-semibold flex items-center justify-center ring-2 ring-card">
                              +{assignees.length - 3}
                            </div>
                          )}
                        </div>
                      )}
                    </button>
                    {assigneeOpenFor === task.id && (
                      <div
                        className="absolute top-full left-3 mt-1 z-20 w-56 rounded-md border border-border bg-card shadow-lg py-1 max-h-56 overflow-auto"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {workspaceMembers.map((member) => {
                          const isAssigned = assignees.some((a) => a.userId === member.userId)
                          return (
                            <button
                              key={member.userId}
                              type="button"
                              className="w-full flex items-center justify-between px-2 py-1.5 text-xs hover:bg-muted text-left"
                              onClick={async () => {
                                if (isAssigned) {
                                  await api(`/tasks/${task.id}/assignees/${member.userId}`, { method: 'DELETE' })
                                } else {
                                  await api(`/tasks/${task.id}/assignees`, {
                                    method: 'POST',
                                    body: JSON.stringify({ userId: member.userId }),
                                  })
                                }
                                await onRefresh()
                              }}
                            >
                              <span className="truncate">{member.displayName || member.email}</span>
                              <span className={cn('text-[10px]', isAssigned ? 'text-emerald-600' : 'text-muted-foreground')}>
                                {isAssigned ? t('list.table.assigned') : t('list.table.add')}
                              </span>
                            </button>
                          )
                        })}
                        {workspaceMembers.length === 0 && (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">{t('list.table.noMembers')}</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Due date */}
                  <div className="w-28 px-3 flex items-center relative">
                    {dateOpenFor === task.id ? (
                      <input
                        autoFocus
                        type="date"
                        defaultValue={task.dueDate ? format(new Date(task.dueDate), 'yyyy-MM-dd') : ''}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={() => setDateOpenFor(null)}
                        onChange={async (e) => {
                          const val = e.target.value
                          setDateOpenFor(null)
                          await onPatchTask(task.id, {
                            dueDate: val ? new Date(val).toISOString() : null,
                          })
                        }}
                        className="h-6 text-xs bg-card border border-border rounded px-1 outline-none focus:ring-1 focus:ring-brand-500 tabular-nums"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDateOpenFor(task.id)
                          setStatusOpenFor(null)
                          setPriorityOpenFor(null)
                        }}
                        className="inline-flex items-center gap-1 text-xs tabular-nums hover:text-foreground"
                      >
                        {task.dueDate ? (
                          <>
                            <CalendarIcon className="h-3 w-3 text-muted-foreground" />
                            <span>{shortDate(new Date(task.dueDate), locale)}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Created */}
                  <div className="w-24 px-3 flex items-center text-xs text-muted-foreground tabular-nums">
                    {task.createdAt ? formatAge(task.createdAt, locale) : '—'}
                  </div>

                  {customColumns.map((field) => {
                    const open = customOpen?.taskId === task.id && customOpen.fieldId === field.id
                    const current = taskCustom[field.id]
                    const valueLabel =
                      current === null || current === undefined || current === ''
                        ? '—'
                        : String(current)

                    return (
                      <div key={field.id} className="w-36 px-3 flex items-center relative">
                        {open ? (
                          <CustomFieldEditor
                            field={field}
                            currentValue={current}
                            onCancel={() => setCustomOpen(null)}
                            onSave={async (nextValue) => {
                              setCustomOpen(null)
                              await api(`/workspaces/${workspaceId}/tasks/${task.id}/custom-fields/${field.id}`, {
                                method: 'PUT',
                                body: { value: nextValue },
                              })
                              await qc.invalidateQueries({
                                queryKey: ['task-custom-fields-batch', workspaceId, projectId],
                              })
                            }}
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setCustomOpen({ taskId: task.id, fieldId: field.id })
                            }}
                            className="text-xs truncate text-left hover:text-foreground w-full"
                          >
                            {valueLabel}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
            {useTableVirtualization && tableBottomPadding > 0 ? (
              <div style={{ height: tableBottomPadding }} aria-hidden="true" />
            ) : null}

            {/* Add task row */}
            <div className="flex items-center h-9">
              {addActive ? (
                <div className="flex-1 px-3 flex items-center gap-2">
                  <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                  <input
                    autoFocus
                    value={addDraft}
                    onChange={(e) => setAddDraft(e.target.value)}
                    onBlur={() => void submitAdd()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void submitAdd()
                      } else if (e.key === 'Escape') {
                        setAddDraft('')
                        setAddActive(false)
                      }
                    }}
                    placeholder={t('list.newTaskPlaceholder')}
                    className="flex-1 h-7 bg-transparent text-sm outline-none"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddActive(true)}
                  className="w-full h-full flex items-center gap-2 px-3 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors text-left"
                >
                  <Plus className="h-4 w-4" />
                  {t('list.addTask')}
                </button>
              )}
            </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  )
}

function CustomFieldEditor({
  field,
  currentValue,
  onSave,
  onCancel,
}: {
  field: CustomFieldDef
  currentValue: unknown
  onSave: (nextValue: string | number | boolean | null) => Promise<void> | void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<string>(currentValue == null ? '' : String(currentValue))
  const [checked, setChecked] = useState(Boolean(currentValue))
  if (field.type === 'checkbox') {
    return (
      <label className="inline-flex items-center gap-2 text-xs">
        <input
          autoFocus
          type="checkbox"
          checked={checked}
          onChange={(e) => {
            const next = e.target.checked
            setChecked(next)
            void onSave(next)
          }}
        />
      </label>
    )
  }
  if (field.type === 'dropdown') {
    return (
      <select
        autoFocus
        className="h-6 w-full text-xs bg-card border border-border rounded px-1"
        value={draft}
        onBlur={onCancel}
        onChange={(e) => {
          const next = e.target.value
          setDraft(next)
          void onSave(next || null)
        }}
      >
        <option value="">{t('list.none')}</option>
        {(field.options ?? []).map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    )
  }
  const inputType = field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'
  return (
    <input
      autoFocus
      type={inputType}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (field.type === 'number') {
          const asNum = draft.trim() ? Number(draft) : null
          void onSave(Number.isFinite(asNum as number) ? asNum : null)
        } else {
          void onSave(draft.trim() || null)
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel()
      }}
      className="h-6 w-full text-xs bg-card border border-border rounded px-1"
    />
  )
}

function BoardColumn({
  status,
  tasks,
  onOpenTask,
  collapsed,
  onToggleCollapse,
  wipLimit,
  onSetWipLimit,
  onAddTask,
}: {
  status: TaskStatus
  tasks: TaskItem[]
  onOpenTask: (taskId: string) => void
  collapsed: boolean
  onToggleCollapse: () => void
  wipLimit?: number
  onSetWipLimit: (n: number | null) => void
  onAddTask: (title: string) => Promise<void> | void
}) {
  const { t } = useTranslation()
  const { isOver, setNodeRef } = useDroppable({
    id: `status:${status}`,
  })
  const meta = useStatusMeta(status)
  const [addTitle, setAddTitle] = useState('')
  const [editingWip, setEditingWip] = useState(false)
  const overWip = wipLimit != null && tasks.length > wipLimit

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-lg border border-border bg-muted/30 flex flex-col min-h-40 transition-colors',
        isOver && 'ring-2 ring-brand-500 bg-accent/10',
        overWip && 'ring-1 ring-red-400/60',
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="text-muted-foreground hover:text-foreground"
          aria-label={collapsed ? t('list.board.expandColumnAria') : t('list.board.collapseColumnAria')}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} />
        <h3 className="font-medium text-sm">{meta.label}</h3>
        <span className={cn('text-xs tabular-nums', overWip ? 'text-red-500 font-semibold' : 'text-muted-foreground')}>
          {tasks.length}
          {wipLimit != null ? `/${wipLimit}` : ''}
        </span>
        {editingWip ? (
          <input
            type="number"
            min={0}
            autoFocus
            defaultValue={wipLimit ?? ''}
            onBlur={(e) => {
              const v = e.target.value.trim()
              onSetWipLimit(v === '' ? null : Math.max(0, parseInt(v, 10) || 0))
              setEditingWip(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              if (e.key === 'Escape') setEditingWip(false)
            }}
            placeholder={t('list.board.wipPlaceholder')}
            className="ml-auto h-6 w-14 rounded border border-border bg-background px-1 text-[11px]"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingWip(true)}
            className="ml-auto text-[10px] text-muted-foreground hover:text-foreground"
            title={t('list.board.setWipTitle')}
          >
            {wipLimit != null ? t('list.board.wipEdit') : t('list.board.setWip')}
          </button>
        )}
      </div>
      {!collapsed && (
        <>
          <div className="p-2 space-y-2 flex-1">
            {tasks.length >= BOARD_VIRTUALIZE_THRESHOLD ? (
              <VirtualizedBoardCards tasks={tasks} onOpenTask={onOpenTask} />
            ) : (
              tasks.map((task) => (
                <BoardTaskCard key={task.id} task={task} onOpenTask={onOpenTask} />
              ))
            )}
            {tasks.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-4">{t('list.board.dropHere')}</div>
            )}
          </div>
          <form
            className="p-2 pt-0"
            onSubmit={async (e) => {
              e.preventDefault()
              const trimmed = addTitle.trim()
              if (!trimmed) return
              setAddTitle('')
              await onAddTask(trimmed)
            }}
          >
            <input
              value={addTitle}
              onChange={(e) => setAddTitle(e.target.value)}
              placeholder={t('list.board.addTaskPlaceholder')}
              className="w-full h-8 rounded border border-transparent bg-transparent px-2 text-sm placeholder:text-muted-foreground hover:border-border focus:border-border focus:bg-card focus:outline-none"
            />
          </form>
        </>
      )}
    </div>
  )
}

function BoardTaskCard({
  task,
  onOpenTask,
}: {
  task: TaskItem
  onOpenTask: (taskId: string) => void
}) {
  const { t, locale } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `task:${task.id}`,
  })
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined

  const assignees = task.assignees ?? []
  const subtasks = task.subtasks ?? []
  const subtasksDone = subtasks.filter((s) => s.statusCategory === 'closed' || s.status === 'done').length
  const due = task.dueDate ? new Date(task.dueDate) : null
  const overdue = due ? due.getTime() < Date.now() && !(task.statusCategory === 'closed' || task.status === 'done') : false

  return (
    <button
      ref={setNodeRef}
      style={style}
      className={`w-full text-left rounded border border-border bg-card p-2 hover:bg-muted ${isDragging ? 'opacity-50' : ''}`}
      onClick={() => onOpenTask(task.id)}
      {...listeners}
      {...attributes}
    >
      <div className="flex items-start gap-2">
        {task.isMilestone
          ? <Diamond className="h-3 w-3 mt-0.5 shrink-0 fill-amber-400 text-amber-500" />
          : <Flag className={cn('h-3 w-3 mt-0.5 shrink-0', PRIORITY_COLORS[task.priority])} />}
        <div className="font-medium text-sm leading-snug">{task.title}</div>
      </div>
      {(due || subtasks.length > 0 || (task.openBlockerCount ?? 0) > 0 || assignees.length > 0) && (
        <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
          {due && (
            <span className={cn('inline-flex items-center gap-1', overdue && 'text-red-500 font-medium')}>
              <CalendarIcon className="h-3 w-3" />
              {shortDate(due, locale)}
            </span>
          )}
          {subtasks.length > 0 && (
            <span className="inline-flex items-center gap-1" title={t('list.board.subtasksDoneTitle')}>
              ☑ {subtasksDone}/{subtasks.length}
            </span>
          )}
          {(task.openBlockerCount ?? 0) > 0 && (
            <span className="text-amber-700 dark:text-amber-300">{t('list.blockedBy', { count: task.openBlockerCount ?? 0 })}</span>
          )}
          {assignees.length > 0 && (
            <span className="ml-auto flex -space-x-1.5">
              {assignees.slice(0, 3).map((a) => (
                <span key={a.userId} className="ring-1 ring-card rounded-full">
                  <PersonAvatar name={a.user?.displayName ?? '?'} size="xs" />
                </span>
              ))}
              {assignees.length > 3 && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[9px] ring-1 ring-card">
                  +{assignees.length - 3}
                </span>
              )}
            </span>
          )}
        </div>
      )}
    </button>
  )
}

function VirtualizedBoardCards({
  tasks,
  onOpenTask,
}: {
  tasks: TaskItem[]
  onOpenTask: (taskId: string) => void
}) {
  const parentRef = useRef<HTMLDivElement | null>(null)
  const cardVirtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => BOARD_CARD_ESTIMATE_PX,
    overscan: 8,
  })

  return (
    <div ref={parentRef} className="max-h-[70vh] overflow-auto">
      <div className="relative w-full" style={{ height: `${cardVirtualizer.getTotalSize()}px` }}>
        {cardVirtualizer.getVirtualItems().map((item) => {
          const task = tasks[item.index]
          return (
            <div
              key={task.id}
              ref={cardVirtualizer.measureElement}
              data-index={item.index}
              className="absolute left-0 top-0 w-full pb-2"
              style={{ transform: `translateY(${item.start}px)` }}
            >
              <BoardTaskCard task={task} onOpenTask={onOpenTask} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

const BULK_PRIORITIES: TaskPriority[] = ['urgent', 'high', 'normal', 'low']

// ---------------------------------------------------------------------------
// Gantt view — timeline bars, dependency arrows, critical-path highlight, and
// group-by swimlanes (Plan §5). Pure layout over the task list; reschedule via
// drag of a bar's whole span onto a new start day.
// ---------------------------------------------------------------------------
const GANTT_DAY_W = 26
const GANTT_ROW_H = 34
const GANTT_LABEL_W = 220
const GANTT_HEADER_H = 44
const GANTT_BAR_H = 18

function GanttView({
  tasks,
  groupBy,
  onOpenTask,
}: {
  tasks: TaskItem[]
  groupBy: 'status' | 'priority' | 'assignee'
  onOpenTask: (taskId: string) => void
}) {
  const { t, locale } = useTranslation()
  const ordered = useOrderedStatuses()

  // Each task's [start,end]; a task needs at least a due or start date to plot.
  const scheduled = useMemo(() => {
    return tasks
      .map((task) => {
        const s = task.startDate ? startOfDay(new Date(task.startDate)) : null
        const d = task.dueDate ? startOfDay(new Date(task.dueDate)) : null
        if (!s && !d) return null
        const start = s ?? d!
        const end = d ?? s!
        return { task, start: start <= end ? start : end, end: start <= end ? end : start }
      })
      .filter((x): x is { task: TaskItem; start: Date; end: Date } => x != null)
  }, [tasks])

  const range = useMemo(() => {
    if (scheduled.length === 0) return null
    let min = scheduled[0].start
    let max = scheduled[0].end
    for (const s of scheduled) {
      if (s.start < min) min = s.start
      if (s.end > max) max = s.end
    }
    const start = addDays(min, -2)
    const end = addDays(max, 2)
    return { start, end, days: differenceInCalendarDays(end, start) + 1 }
  }, [scheduled])

  // Critical path: longest cumulative-duration chain through blockedBy edges.
  const criticalIds = useMemo(() => {
    const ids = new Set(scheduled.map((s) => s.task.id))
    return criticalPath(
      scheduled.map((s) => ({
        id: s.task.id,
        durationDays: differenceInCalendarDays(s.end, s.start) + 1,
        blockedBy: (s.task.blockedBy ?? []).filter((b) => ids.has(b)),
      })),
    )
  }, [scheduled])

  // Build swimlanes + a flat render order; assign each task a row index.
  const { flatRows, layout } = useMemo(() => {
    const groupsMap = new Map<string, { label: string; items: typeof scheduled }>()
    const groupKey = (task: TaskItem): { id: string; label: string } => {
      if (groupBy === 'assignee') {
        const a = task.assignees?.[0]
        return { id: a?.userId ?? '__unassigned__', label: a?.user?.displayName ?? t('list.group.unassigned') }
      }
      if (groupBy === 'priority') return { id: task.priority, label: t(PRIORITY_LABEL_KEYS[task.priority]) }
      const meta = ordered.find((s) => s.key === task.status)
      return { id: task.status, label: resolveStatusLabel(task.status, meta?.name, t) }
    }
    for (const s of scheduled) {
      const g = groupKey(s.task)
      if (!groupsMap.has(g.id)) groupsMap.set(g.id, { label: g.label, items: [] })
      groupsMap.get(g.id)!.items.push(s)
    }
    const rows: Array<{ kind: 'group'; label: string } | { kind: 'task'; s: (typeof scheduled)[number] }> = []
    const lay = new Map<string, { rowIdx: number; x: number; w: number }>()
    let idx = 0
    for (const [, group] of groupsMap) {
      rows.push({ kind: 'group', label: group.label })
      idx++
      const sorted = [...group.items].sort((a, b) => a.start.getTime() - b.start.getTime())
      for (const s of sorted) {
        if (range) {
          const x = differenceInCalendarDays(s.start, range.start) * GANTT_DAY_W
          const w = Math.max(GANTT_DAY_W, (differenceInCalendarDays(s.end, s.start) + 1) * GANTT_DAY_W)
          lay.set(s.task.id, { rowIdx: idx, x, w })
        }
        rows.push({ kind: 'task', s })
        idx++
      }
    }
    return { flatRows: rows, layout: lay }
  }, [scheduled, groupBy, ordered, range, t])

  if (!range) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        {t('list.gantt.noDatedTasks')}
      </Card>
    )
  }

  const timelineW = range.days * GANTT_DAY_W
  const bodyH = flatRows.length * GANTT_ROW_H
  const monthMarkers: Array<{ x: number; label: string }> = []
  for (let i = 0; i < range.days; i++) {
    const day = addDays(range.start, i)
    if (i === 0 || day.getDate() === 1) monthMarkers.push({ x: i * GANTT_DAY_W, label: day.toLocaleDateString(locale, { month: 'short', year: 'numeric' }) })
  }

  // Arrow endpoints from blocker bar right-edge → blocked bar left-edge.
  const arrows: Array<{ id: string; d: string; critical: boolean }> = []
  for (const s of scheduled) {
    const to = layout.get(s.task.id)
    if (!to) continue
    for (const bId of s.task.blockedBy ?? []) {
      const from = layout.get(bId)
      if (!from) continue
      const y1 = GANTT_HEADER_H + from.rowIdx * GANTT_ROW_H + GANTT_ROW_H / 2
      const x1 = from.x + from.w
      const y2 = GANTT_HEADER_H + to.rowIdx * GANTT_ROW_H + GANTT_ROW_H / 2
      const x2 = to.x
      const midX = Math.max(x1 + 8, x2 - 8)
      const critical = criticalIds.has(s.task.id) && criticalIds.has(bId)
      arrows.push({
        id: `${bId}->${s.task.id}`,
        d: `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`,
        critical,
      })
    }
  }

  const todayX =
    differenceInCalendarDays(startOfDay(new Date()), range.start) * GANTT_DAY_W

  return (
    <Card className="overflow-hidden p-0">
      {criticalIds.size > 0 && (
        <div className="border-b border-border bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
          <span className="inline-block h-2 w-2 rounded-sm bg-red-500 align-middle mr-1" /> {t('list.gantt.criticalPath')}
        </div>
      )}
      <div className="flex">
        {/* Label column */}
        <div className="shrink-0 border-r border-border" style={{ width: GANTT_LABEL_W }}>
          <div style={{ height: GANTT_HEADER_H }} className="border-b border-border bg-muted/40" />
          {flatRows.map((row, i) =>
            row.kind === 'group' ? (
              <div
                key={`g-${i}`}
                style={{ height: GANTT_ROW_H }}
                className="flex items-center px-3 text-xs font-semibold text-foreground bg-muted/30 truncate"
              >
                {row.label}
              </div>
            ) : (
              <button
                key={row.s.task.id}
                onClick={() => onOpenTask(row.s.task.id)}
                style={{ height: GANTT_ROW_H }}
                className="flex w-full items-center px-3 text-left text-[13px] hover:bg-muted/40 truncate"
                title={row.s.task.title}
              >
                <span className="truncate">{row.s.task.title}</span>
              </button>
            ),
          )}
        </div>

        {/* Timeline */}
        <div className="overflow-x-auto flex-1">
          <div className="relative" style={{ width: timelineW, height: GANTT_HEADER_H + bodyH }}>
            {/* month markers + day grid */}
            <div className="absolute inset-x-0 top-0" style={{ height: GANTT_HEADER_H }}>
              {monthMarkers.map((m) => (
                <div
                  key={m.x}
                  className="absolute top-1 text-[10px] font-medium text-muted-foreground"
                  style={{ left: m.x + 2 }}
                >
                  {m.label}
                </div>
              ))}
            </div>
            {Array.from({ length: range.days }).map((_, i) => {
              const day = addDays(range.start, i)
              const weekend = day.getDay() === 0 || day.getDay() === 6
              return (
                <div
                  key={i}
                  className={cn('absolute top-0 border-l border-border/40', weekend && 'bg-muted/20')}
                  style={{ left: i * GANTT_DAY_W, width: GANTT_DAY_W, height: GANTT_HEADER_H + bodyH }}
                >
                  <div className="text-center text-[9px] text-muted-foreground" style={{ marginTop: GANTT_HEADER_H - 14 }}>
                    {format(day, 'd')}
                  </div>
                </div>
              )
            })}
            {/* today line */}
            {todayX >= 0 && todayX <= timelineW && (
              <div
                className="absolute top-0 w-px bg-red-400/70 z-10"
                style={{ left: todayX, height: GANTT_HEADER_H + bodyH }}
              />
            )}
            {/* dependency arrows */}
            <svg
              className="absolute inset-0 pointer-events-none"
              width={timelineW}
              height={GANTT_HEADER_H + bodyH}
            >
              <defs>
                <marker id="gantt-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" className="fill-muted-foreground" />
                </marker>
                <marker id="gantt-arrow-crit" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" className="fill-red-500" />
                </marker>
              </defs>
              {arrows.map((a) => (
                <path
                  key={a.id}
                  d={a.d}
                  fill="none"
                  className={a.critical ? 'stroke-red-500' : 'stroke-muted-foreground/50'}
                  strokeWidth={a.critical ? 1.6 : 1.2}
                  markerEnd={`url(#${a.critical ? 'gantt-arrow-crit' : 'gantt-arrow'})`}
                />
              ))}
            </svg>
            {/* bars */}
            {flatRows.map((row, i) => {
              if (row.kind !== 'task') return null
              const lay = layout.get(row.s.task.id)
              if (!lay) return null
              const critical = criticalIds.has(row.s.task.id)
              const done = row.s.task.statusCategory === 'closed' || row.s.task.status === 'done'
              return (
                <div
                  key={row.s.task.id}
                  role="button"
                  onClick={() => onOpenTask(row.s.task.id)}
                  className={cn(
                    'absolute rounded cursor-pointer flex items-center px-1.5 text-[10px] text-white truncate shadow-sm',
                    critical ? 'bg-red-500' : done ? 'bg-emerald-500/80' : 'bg-brand-700',
                  )}
                  style={{
                    left: lay.x,
                    top: GANTT_HEADER_H + i * GANTT_ROW_H + (GANTT_ROW_H - GANTT_BAR_H) / 2,
                    width: lay.w,
                    height: GANTT_BAR_H,
                  }}
                  title={`${row.s.task.title} · ${shortDate(row.s.start, locale)} – ${shortDate(row.s.end, locale)}`}
                >
                  <span className="truncate">{row.s.task.title}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </Card>
  )
}

function BulkActionBar({
  selectedIds,
  onClear,
  onApplied,
  workspaceMembers = [],
}: {
  selectedIds: Set<string>
  onClear: () => void
  onApplied: () => Promise<void> | void
  workspaceMembers?: WorkspaceMember[]
}) {
  const { t, tCount } = useTranslation()
  const [busy, setBusy] = useState(false)
  const count = selectedIds.size
  const bulkStatuses = useOrderedStatuses()

  // Clear selection on Escape for a quick keyboard escape hatch.
  useEffect(() => {
    if (count === 0) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClear()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [count, onClear])

  if (count === 0) return null

  const apply = async (patch: Record<string, unknown>) => {
    setBusy(true)
    try {
      await api('/tasks/bulk/update', {
        method: 'PATCH',
        body: JSON.stringify({ taskIds: Array.from(selectedIds), patch }),
      })
      await onApplied()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed bottom-5 left-1/2 z-40 -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-2 shadow-xl backdrop-blur-sm">
        <span className="text-sm font-medium tabular-nums pl-1">{tCount('list.bulk.selected', count)}</span>
        <span className="h-4 w-px bg-border" />

        <select
          disabled={busy}
          value=""
          onChange={(e) => {
            if (!e.target.value) return
            const status = e.target.value as TaskStatus
            void apply({ status })
            e.target.value = ''
          }}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs"
          aria-label={t('list.bulk.setStatusAria')}
        >
          <option value="">{t('list.bulk.setStatus')}</option>
          {bulkStatuses.map((s) => (
            <option key={s.key} value={s.key}>
              {resolveStatusLabel(s.key, s.name, t)}
            </option>
          ))}
        </select>

        <select
          disabled={busy}
          value=""
          onChange={(e) => {
            if (!e.target.value) return
            const priority = e.target.value as TaskPriority
            void apply({ priority })
            e.target.value = ''
          }}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs capitalize"
          aria-label={t('list.bulk.setPriorityAria')}
        >
          <option value="">{t('list.bulk.setPriority')}</option>
          {BULK_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {t(PRIORITY_LABEL_KEYS[p])}
            </option>
          ))}
        </select>

        {workspaceMembers.length > 0 && (
          <select
            disabled={busy}
            value=""
            onChange={(e) => {
              if (!e.target.value) return
              void apply({ assigneeIdsAdd: [e.target.value] })
              e.target.value = ''
            }}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs max-w-[9rem]"
            aria-label={t('list.bulk.assignToAria')}
          >
            <option value="">{t('list.bulk.assign')}</option>
            {workspaceMembers.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.displayName || m.email}
              </option>
            ))}
          </select>
        )}

        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            if (confirm(tCount('list.bulk.archiveConfirm', count))) {
              void apply({ isArchived: true })
            }
          }}
          aria-label={t('list.bulk.archiveAria')}
        >
          <Archive className="h-3.5 w-3.5 text-red-400" />
        </Button>

        <span className="h-4 w-px bg-border" />
        <Button size="sm" variant="ghost" onClick={onClear} aria-label={t('list.bulk.clearSelectionAria')}>
          <XIcon className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

import { createFileRoute, useNavigate, useRouterState } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input, cn } from '@rundesk/ui'
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
  Calendar as CalendarIcon,
  X as XIcon,
  Archive,
} from 'lucide-react'
import { api } from '../lib/api'
import { TaskDetailSheet } from '../components/task-detail-sheet'
import { ListStatusesManager } from '../components/list-statuses-manager'
import { ListEmailAliasPanel } from '../components/list-email-alias-panel'
import { getRealtimeSocket } from '../lib/realtime'
import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent, useDraggable, useDroppable } from '@dnd-kit/core'
import { addDays, addMonths, endOfMonth, endOfWeek, format, formatDistanceToNowStrict, isSameMonth, isToday, startOfMonth, startOfWeek } from 'date-fns'

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
  dueDate?: string | null
  createdAt?: string | null
  assignees?: TaskAssignee[]
  openBlockerCount?: number
  blocksOpenCount?: number
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
  const statuses = useListStatuses()
  const dynamic = statuses.find((s) => s.key === statusKey)
  if (dynamic) {
    return {
      label: dynamic.name,
      color: dynamic.color,
      // Dynamic colours don't map cleanly to tailwind classes, so we use
      // inline style via pillStyleFor() at the call site instead.
      dot: '',
      pill: '',
    }
  }
  return DEFAULT_STATUS_META[statusKey] ?? {
    label: statusKey,
    color: '#94a3b8',
    dot: 'bg-zinc-400',
    pill: 'bg-muted/60 text-muted-foreground border-border',
  }
}

function TableStatusLegend() {
  const ordered = useOrderedStatuses()
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 rounded-lg border border-border bg-card/50 text-[11px] text-muted-foreground">
      <span className="font-semibold uppercase tracking-wider text-[10px]">Status Legend:</span>
      {ordered.map((s) => (
        <div key={s.key} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
          <span>{s.name}</span>
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
  const qc = useQueryClient()
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>('normal')
  const [newTaskDueDate, setNewTaskDueDate] = useState('')
  const [newTaskStartDate, setNewTaskStartDate] = useState('')
  const [activeView, setActiveView] = useState<'list' | 'board' | 'calendar' | 'table'>('list')
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all')
  const [sortBy, setSortBy] = useState<'created' | 'due' | 'priority'>('created')
  const [groupBy, setGroupBy] = useState<'status' | 'priority'>('status')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(() => new Set())
  const [statusManagerOpen, setStatusManagerOpen] = useState(false)
  const [emailAliasOpen, setEmailAliasOpen] = useState(false)
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null)
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()))
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
      next = next.filter((t) => t.status === statusFilter)
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
    setActiveView(view.type === 'gantt' ? 'list' : view.type)
    setStatusFilter((cfg.statusFilter as 'all' | TaskStatus) ?? 'all')
    setSortBy((cfg.sortBy as 'created' | 'due' | 'priority') ?? 'created')
    setGroupBy((cfg.groupBy as 'status' | 'priority') ?? 'status')
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
        const nextOrder: Array<typeof activeView> = ['list', 'board', 'table', 'calendar']
        const idx = nextOrder.indexOf(activeView)
        setActiveView(nextOrder[(idx + 1) % nextOrder.length])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeView])

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(calendarMonth)
    const monthEnd = endOfMonth(calendarMonth)
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
    const days: Date[] = []
    let cur = gridStart
    while (cur <= gridEnd) {
      days.push(cur)
      cur = addDays(cur, 1)
    }
    return days
  }, [calendarMonth])

  const draggingTask = useMemo(
    () => tasks.find((t) => t.id === draggingTaskId) ?? null,
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
    const task = tasks.find((t) => t.id === taskId)
    if (!task || task.status === nextStatus) return
    try {
      await moveTaskStatus(taskId, nextStatus)
    } catch (error) {
      console.error('Failed to move task status', error)
    }
  }

  const viewTabs: { id: typeof activeView; label: string }[] = [
    { id: 'list', label: 'List' },
    { id: 'board', label: 'Board' },
    { id: 'table', label: 'Table' },
    { id: 'calendar', label: 'Calendar' },
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
        listName={listMeta?.name ?? 'Tasks'}
        taskCount={visibleTasks.length}
        quickAdd={
          <>
            <Input
              ref={quickAddRef}
              placeholder="Quick add task…"
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
                  {p}
                </option>
              ))}
            </WorkFilterSelect>
            <Input
              type="date"
              value={newTaskDueDate}
              onChange={(e) => setNewTaskDueDate(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleCreateTask()}
              title="Due date"
              className="h-8 w-[9.5rem] text-[13px] border-border/80 focus-visible:ring-violet-500/25"
            />
            <Button size="sm" className="h-8 bg-violet-600 hover:bg-violet-700 text-white" onClick={handleCreateTask}>
              Add task
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
              <option value="all">All statuses</option>
              {statusOptions.map((status) => (
                <option key={status.key} value={status.key}>
                  {status.name}
                </option>
              ))}
            </WorkFilterSelect>
            <WorkFilterSelect value={sortBy} onChange={(v) => setSortBy(v as typeof sortBy)}>
              <option value="created">Newest</option>
              <option value="due">Due date</option>
              <option value="priority">Priority</option>
            </WorkFilterSelect>
            <WorkFilterSelect value={groupBy} onChange={(v) => setGroupBy(v as typeof groupBy)}>
              <option value="status">By status</option>
              <option value="priority">By priority</option>
            </WorkFilterSelect>
            <WorkFilterSelect
              value={selectedSavedViewId}
              onChange={(v) => {
                if (!v) return
                applyView(v)
              }}
            >
              <option value="">Saved views</option>
              {savedViews.map((view) => (
                <option key={view.id} value={view.id}>
                  {view.name}
                </option>
              ))}
            </WorkFilterSelect>
            <Input
              value={saveAsName}
              onChange={(e) => setSaveAsName(e.target.value)}
              placeholder="View name…"
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
                    config: { activeView, statusFilter, sortBy, groupBy },
                  }),
                })
                setSaveAsName('')
                await qc.invalidateQueries({ queryKey: ['list-views', listId] })
              }}
            >
              Save
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
                      body: { config: { activeView, statusFilter, sortBy, groupBy } },
                    })
                    await qc.invalidateQueries({ queryKey: ['list-views', listId] })
                  }}
                >
                  Update
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
                  Default
                </Button>
              </>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-[12px]"
              onClick={() => setStatusManagerOpen(true)}
              title="Manage this list's statuses"
            >
              Statuses
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-[12px]"
              onClick={() => setEmailAliasOpen(true)}
              title="Email-to-task address for this list"
            >
              Email
            </Button>
          </>
        }
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="rounded-lg border border-border/80 p-8 text-center text-[13px] text-muted-foreground">
            Loading tasks…
          </div>
        ) : visibleTasks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/80 bg-[#fbfbfc]/60 dark:bg-[#16181d]/40 p-12 text-center">
            <p className="text-[15px] font-medium text-foreground mb-1">No tasks yet</p>
            <p className="text-[13px] text-muted-foreground mb-4">
              Add your first task with the field above, or press{' '}
              <kbd className="px-1.5 py-0.5 rounded bg-muted text-[11px] font-mono">C</kbd> to quick-add.
            </p>
            <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white" onClick={() => quickAddRef.current?.focus()}>
              Create task
            </Button>
          </div>
        ) : activeView === 'list' ? (
          <GroupedListView
            tasks={visibleTasks}
            groupBy={groupBy}
            selectedTaskIds={selectedTaskIds}
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
                />
              ))}
            </div>
            <DragOverlay>
              {draggingTask ? (
                <div className="w-56 rounded border border-border bg-card p-2 shadow-xl">
                  <div className="font-medium text-sm">{draggingTask.title}</div>
                  <div className="text-xs text-muted-foreground">{draggingTask.priority}</div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : activeView === 'table' ? (
          <TableView
            tasks={visibleTasks}
            workspaceId={workspaceId}
            projectId={projectId}
            projectFields={projectFields}
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
        ) : (
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <Button size="sm" variant="outline" onClick={() => setCalendarMonth((d) => addMonths(d, -1))}>
                Prev
              </Button>
              <h3 className="font-semibold">{format(calendarMonth, 'MMMM yyyy')}</h3>
              <Button size="sm" variant="outline" onClick={() => setCalendarMonth((d) => addMonths(d, 1))}>
                Next
              </Button>
            </div>
            <div className="grid grid-cols-7 gap-2 text-xs font-medium text-muted-foreground mb-2">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                <div key={d} className="px-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {calendarDays.map((day) => {
                const key = format(day, 'yyyy-MM-dd')
                const dayTasks = tasksByDate.find(([k]) => k === key)?.[1] ?? []
                return (
                  <div
                    key={key}
                    className={`min-h-28 rounded border border-border p-2 ${isToday(day) ? 'ring-1 ring-ring' : ''} ${isSameMonth(day, calendarMonth) ? 'bg-card' : 'bg-muted/30 text-muted-foreground'}`}
                  >
                    <div className="text-xs mb-1">{format(day, 'd')}</div>
                    <div className="space-y-1">
                      {dayTasks.slice(0, 3).map((task) => (
                        <button
                          key={task.id}
                          className="block w-full text-left rounded bg-muted px-1 py-0.5 text-[11px] hover:bg-secondary"
                          onClick={() => setSelectedTaskId(task.id)}
                        >
                          {task.title}
                        </button>
                      ))}
                      {dayTasks.length > 3 ? <div className="text-[11px] text-muted-foreground">+{dayTasks.length - 3} more</div> : null}
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
  onAddTask,
}: {
  tasks: TaskItem[]
  groupBy: 'status' | 'priority'
  selectedTaskIds: Set<string>
  onToggleSelect: (taskId: string, additive: boolean) => void
  onOpenTask: (taskId: string) => void
  onToggleDone: (task: TaskItem) => Promise<void> | void
  onAddTask: (
    status: TaskStatus,
    title: string,
    opts?: { priority?: TaskPriority; dueDate?: string; startDate?: string },
  ) => Promise<void> | void
}) {
  const ordered = useOrderedStatuses()
  const grouped = useMemo(() => {
    const map: Record<string, TaskItem[]> = {}
    for (const s of ordered) map[s.key] = []
    for (const t of tasks) {
      if (!map[t.status]) map[t.status] = []
      map[t.status].push(t)
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
                {priority} ({groupTasks.length})
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
                    />
                  ))
                )}
                {groupTasks.length === 0 && <div className="text-xs text-muted-foreground">No tasks</div>}
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
              <h3 className="font-semibold text-sm text-foreground">{statusDef.name}</h3>
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
}: {
  virtualKey: string
  tasks: TaskItem[]
  selectedTaskIds: Set<string>
  onToggleSelect: (taskId: string, additive: boolean) => void
  onOpenTask: (taskId: string) => void
  onToggleDone: (task: TaskItem) => Promise<void> | void
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
}: {
  task: TaskItem
  selected: boolean
  onToggleSelect: (additive: boolean) => void
  onOpenTask: (taskId: string) => void
  onToggleDone: (task: TaskItem) => Promise<void> | void
}) {
  // statusCategory ('closed') is the post-custom-statuses signal; falling
  // back to the literal 'done' key keeps existing tasks rendering correctly
  // while the API/list-statuses caches warm up.
  const isDone = task.statusCategory === 'closed' || task.status === 'done'
  const assignees = task.assignees ?? []

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
        aria-label={selected ? 'Deselect task' : 'Select task'}
      />
      <button
        className="shrink-0 text-muted-foreground hover:text-accent transition-colors"
        onClick={(e) => {
          e.stopPropagation()
          void onToggleDone(task)
        }}
        aria-label={isDone ? 'Mark incomplete' : 'Mark done'}
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
                blocked by {task.openBlockerCount}
              </span>
            ) : null}
            {(task.blocksOpenCount ?? 0) > 0 ? (
              <span className="rounded-full border border-blue-400/40 bg-blue-500/10 px-1.5 py-0.5 text-blue-700 dark:text-blue-300">
                blocks {task.blocksOpenCount}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <Flag className={cn('h-3.5 w-3.5 shrink-0', PRIORITY_COLORS[task.priority])} />

      {task.dueDate && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
          <CalendarIcon className="h-3 w-3" />
          {format(new Date(task.dueDate), 'MMM d')}
        </div>
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
        Add task
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
        placeholder={`New ${meta.label.toLowerCase()} task…`}
        className="h-7 flex-1 text-sm border-0 shadow-none focus-visible:ring-0 px-0"
      />
      <WorkFilterSelect
        value={priority}
        onChange={(v) => setPriority(v as TaskPriority)}
        className="h-7 capitalize shrink-0"
      >
        {PRIORITY_OPTIONS.map((p) => (
          <option key={p} value={p} className="capitalize">
            {p}
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
        title="Due date"
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
    queryKey: ['task-custom-fields-batch', workspaceId, projectId, tasks.map((t) => t.id).join(',')],
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

  const allSelected = tasks.length > 0 && tasks.every((t) => selected.has(t.id))
  const toggleAll = () => {
    setSelected((prev) => {
      if (allSelected) return new Set()
      return new Set(tasks.map((t) => t.id))
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
    { key: 'title', label: 'Title', width: 'flex-1 min-w-[240px]' },
    { key: 'status', label: 'Status', width: 'w-36' },
    { key: 'priority', label: 'Priority', width: 'w-28' },
    { key: 'assignees', label: 'Assignees', width: 'w-28' },
    { key: 'due', label: 'Due date', width: 'w-28' },
    { key: 'created', label: 'Created', width: 'w-24' },
  ] as const
  const customColumns = projectFields.slice(0, 3)
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
          <span className="font-medium text-foreground">{selectedIds.length} selected</span>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void applyBulkPatch({ status: 'done' })}>
            Mark done
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void applyBulkPatch({ priority: 'high' })}>
            High priority
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => void applyBulkPatch({ dueDate: new Date().toISOString() })}
          >
            Due today
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs ml-auto" onClick={() => setSelected(new Set())}>
            Clear
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
                    aria-label="Select all tasks"
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
                      aria-label={`Select ${task.title}`}
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
                          'truncate font-medium',
                          (task.statusCategory === 'closed' || task.status === 'done') && 'line-through text-muted-foreground',
                        )}
                      >
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
                      {meta.label}
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
                            {s.name}
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
                      <span className="capitalize">{task.priority}</span>
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
                            {p}
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
                        <span className="text-muted-foreground text-xs">Assign</span>
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
                                {isAssigned ? 'Assigned' : 'Add'}
                              </span>
                            </button>
                          )
                        })}
                        {workspaceMembers.length === 0 && (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">No members available</div>
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
                            <span>{format(new Date(task.dueDate), 'MMM d')}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Created */}
                  <div className="w-24 px-3 flex items-center text-xs text-muted-foreground tabular-nums">
                    {task.createdAt ? formatDistanceToNowStrict(new Date(task.createdAt), { addSuffix: false }) : '—'}
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
                    placeholder="New task…"
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
                  Add task
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
        <option value="">None</option>
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
}: {
  status: TaskStatus
  tasks: TaskItem[]
  onOpenTask: (taskId: string) => void
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `status:${status}`,
  })
  const meta = useStatusMeta(status)

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-lg border border-border bg-muted/30 flex flex-col min-h-40 transition-colors',
        isOver && 'ring-2 ring-brand-500 bg-accent/10',
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} />
        <h3 className="font-medium text-sm">{meta.label}</h3>
        <span className="text-xs text-muted-foreground tabular-nums">{tasks.length}</span>
      </div>
      <div className="p-2 space-y-2 flex-1">
        {tasks.length >= BOARD_VIRTUALIZE_THRESHOLD ? (
          <VirtualizedBoardCards tasks={tasks} onOpenTask={onOpenTask} />
        ) : (
          tasks.map((task) => (
            <BoardTaskCard key={task.id} task={task} onOpenTask={onOpenTask} />
          ))
        )}
        {tasks.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-4">Drop tasks here</div>
        )}
      </div>
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
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `task:${task.id}`,
  })
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined

  return (
    <button
      ref={setNodeRef}
      style={style}
      className={`w-full text-left rounded border border-border p-2 hover:bg-muted ${isDragging ? 'opacity-50' : ''}`}
      onClick={() => onOpenTask(task.id)}
      {...listeners}
      {...attributes}
    >
      <div className="font-medium text-sm">{task.title}</div>
      <div className="text-xs text-muted-foreground">{task.priority}</div>
      {(task.openBlockerCount ?? 0) > 0 ? (
        <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
          blocked by {task.openBlockerCount}
        </div>
      ) : null}
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

function BulkActionBar({
  selectedIds,
  onClear,
  onApplied,
}: {
  selectedIds: Set<string>
  onClear: () => void
  onApplied: () => Promise<void> | void
}) {
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
        <span className="text-sm font-medium tabular-nums pl-1">{count} selected</span>
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
          aria-label="Set status"
        >
          <option value="">Set status…</option>
          {bulkStatuses.map((s) => (
            <option key={s.key} value={s.key}>
              {s.name}
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
          aria-label="Set priority"
        >
          <option value="">Set priority…</option>
          {BULK_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            if (confirm(`Archive ${count} task${count === 1 ? '' : 's'}?`)) {
              void apply({ isArchived: true })
            }
          }}
          aria-label="Archive selected tasks"
        >
          <Archive className="h-3.5 w-3.5 text-red-400" />
        </Button>

        <span className="h-4 w-px bg-border" />
        <Button size="sm" variant="ghost" onClick={onClear} aria-label="Clear selection">
          <XIcon className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input, cn } from '@rundesk/ui'
import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Circle, CheckCircle2, Plus, Flag, Calendar as CalendarIcon } from 'lucide-react'
import { api } from '../lib/api'
import { TaskDetailSheet } from '../components/task-detail-sheet'
import { getRealtimeSocket } from '../lib/realtime'
import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent, useDraggable, useDroppable } from '@dnd-kit/core'
import { addDays, addMonths, endOfMonth, endOfWeek, format, formatDistanceToNowStrict, isSameMonth, isToday, startOfMonth, startOfWeek } from 'date-fns'

type TaskPriority = 'urgent' | 'high' | 'normal' | 'low'
type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled'

type TaskAssignee = {
  userId: string
  user?: { displayName?: string | null }
}

type TaskItem = {
  id: string
  title: string
  description: string | null
  priority: TaskPriority
  status: TaskStatus
  dueDate?: string | null
  createdAt?: string | null
  assignees?: TaskAssignee[]
}

type CustomFieldType = 'text' | 'number' | 'dropdown' | 'date' | 'checkbox' | 'url'
type CustomFieldDef = {
  id: string
  name: string
  type: CustomFieldType
  options?: Array<{ label: string; value: string }> | null
}
type CustomFieldValue = {
  fieldId: string
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

const STATUS_META: Record<TaskStatus, { label: string; dot: string; pill: string }> = {
  backlog: { label: 'Backlog', dot: 'bg-zinc-400', pill: 'bg-muted/60 text-muted-foreground border-border' },
  todo: { label: 'To do', dot: 'bg-slate-500', pill: 'bg-slate-500/15 text-slate-700 dark:text-slate-200 border-slate-400/40' },
  in_progress: { label: 'In progress', dot: 'bg-blue-500', pill: 'bg-blue-500/15 text-blue-700 dark:text-blue-200 border-blue-400/40' },
  in_review: { label: 'In review', dot: 'bg-purple-500', pill: 'bg-purple-500/15 text-purple-700 dark:text-purple-200 border-purple-400/40' },
  done: { label: 'Done', dot: 'bg-emerald-500', pill: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-200 border-emerald-400/40' },
  cancelled: { label: 'Cancelled', dot: 'bg-rose-500', pill: 'bg-rose-500/15 text-rose-700 dark:text-rose-200 border-rose-400/40' },
}

const STATUS_ORDER: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled']

function ListDetail() {
  const { workspaceId, spaceId, projectId, listId } = Route.useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [activeView, setActiveView] = useState<'list' | 'board' | 'calendar' | 'table'>('list')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null)
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()))

  const { data: tasks = [], isLoading, refetch } = useQuery({
    queryKey: ['tasks', listId],
    queryFn: () => api<TaskItem[]>(`/tasks/list/${listId}`),
  })
  const { data: projectFields = [] } = useQuery({
    queryKey: ['project-fields', workspaceId, projectId],
    queryFn: () =>
      api<CustomFieldDef[]>(`/workspaces/${workspaceId}/projects/${projectId}/custom-fields`),
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
        body: JSON.stringify({
          listId,
          title: newTaskTitle,
          status: 'todo',
          priority: 'normal',
        }),
      })

      setNewTaskTitle('')
      await refetch()
    } catch (error) {
      console.error('Failed to create task', error)
    }
  }

  const tasksByStatus = useMemo(() => {
    const map: Record<TaskStatus, TaskItem[]> = {
      backlog: [],
      todo: [],
      in_progress: [],
      in_review: [],
      done: [],
      cancelled: [],
    }
    for (const task of tasks) map[task.status].push(task)
    return map
  }, [tasks])

  const tasksByDate = useMemo(() => {
    const map = new Map<string, TaskItem[]>()
    for (const task of tasks) {
      const key = task.dueDate ? format(new Date(task.dueDate), 'yyyy-MM-dd') : 'No due date'
      const arr = map.get(key) ?? []
      arr.push(task)
      map.set(key, arr)
    }
    return Array.from(map.entries())
  }, [tasks])

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

  return (
    <div className="flex-1 flex flex-col">
      <div className="border-b border-border bg-card">
        <div className="px-3 sm:px-6 pt-4 pb-0 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <h1 className="font-display text-2xl font-semibold truncate text-foreground">Tasks</h1>
            <span className="text-sm text-muted-foreground">{tasks.length} task{tasks.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Input
              placeholder="Quick add task…"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleCreateTask()}
              className="h-8 w-full sm:w-56"
            />
            <Button size="sm" onClick={handleCreateTask}>Add</Button>
          </div>
        </div>
        <div className="px-3 sm:px-6 mt-3 flex items-center gap-1 border-b-0 overflow-x-auto">
          {viewTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveView(tab.id)}
              className={`relative px-3 py-2 text-sm font-medium transition-colors ${
                activeView === tab.id
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
              {activeView === tab.id && (
                <span className="absolute bottom-[-1px] left-0 right-0 h-0.5 bg-brand-700 rounded-t" />
              )}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 pb-1 text-xs text-muted-foreground">
            <button className="px-2 py-1 hover:text-foreground">Filter</button>
            <button className="px-2 py-1 hover:text-foreground">Sort</button>
            <button className="px-2 py-1 hover:text-foreground">Group</button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3 sm:p-6">
        {isLoading ? (
          <div className="text-muted-foreground">Loading tasks...</div>
        ) : tasks.length === 0 ? (
          <div className="text-muted-foreground">No tasks yet. Create one to get started!</div>
        ) : activeView === 'list' ? (
          <GroupedListView
            tasks={tasks}
            onOpenTask={(id) => setSelectedTaskId(id)}
            onToggleDone={async (task) => {
              const nextStatus: TaskStatus = task.status === 'done' ? 'todo' : 'done'
              await api(`/tasks/${task.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ status: nextStatus }),
              })
              await refetch()
            }}
            onAddTask={async (status, title) => {
              await api('/tasks', {
                method: 'POST',
                body: JSON.stringify({ listId, title, status, priority: 'normal' }),
              })
              await refetch()
            }}
          />
        ) : activeView === 'board' ? (
          <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {(Object.keys(tasksByStatus) as TaskStatus[]).map((status) => (
                <BoardColumn
                  key={status}
                  status={status}
                  tasks={tasksByStatus[status]}
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
            tasks={tasks}
            workspaceId={workspaceId}
            projectId={projectId}
            projectFields={projectFields}
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
      <TaskDetailSheet taskId={selectedTaskId} open={Boolean(selectedTaskId)} onOpenChange={(next) => !next && setSelectedTaskId(null)} workspaceId={workspaceId} />
    </div>
  )
}

function GroupedListView({
  tasks,
  onOpenTask,
  onToggleDone,
  onAddTask,
}: {
  tasks: TaskItem[]
  onOpenTask: (taskId: string) => void
  onToggleDone: (task: TaskItem) => Promise<void> | void
  onAddTask: (status: TaskStatus, title: string) => Promise<void> | void
}) {
  const grouped = useMemo(() => {
    const map: Record<TaskStatus, TaskItem[]> = {
      backlog: [],
      todo: [],
      in_progress: [],
      in_review: [],
      done: [],
      cancelled: [],
    }
    for (const t of tasks) map[t.status].push(t)
    return map
  }, [tasks])

  const [collapsed, setCollapsed] = useState<Record<TaskStatus, boolean>>({
    backlog: false,
    todo: false,
    in_progress: false,
    in_review: false,
    done: true,
    cancelled: true,
  })

  return (
    <div className="space-y-5">
      {STATUS_ORDER.filter((s) => grouped[s].length > 0 || s === 'todo' || s === 'in_progress').map((status) => {
        const meta = STATUS_META[status]
        const groupTasks = grouped[status]
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
              <span className={cn('h-2 w-2 rounded-full', meta.dot)} />
              <h3 className="font-semibold text-sm text-foreground">{meta.label}</h3>
              <span className="text-xs text-muted-foreground tabular-nums">{groupTasks.length}</span>
            </header>
            {!isCollapsed && (
              <div className="divide-y divide-border">
                {groupTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onOpenTask={onOpenTask}
                    onToggleDone={onToggleDone}
                  />
                ))}
                <InlineAddTask status={status} onAdd={(title) => onAddTask(status, title)} />
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

function TaskRow({
  task,
  onOpenTask,
  onToggleDone,
}: {
  task: TaskItem
  onOpenTask: (taskId: string) => void
  onToggleDone: (task: TaskItem) => Promise<void> | void
}) {
  const isDone = task.status === 'done'
  const assignees = task.assignees ?? []

  return (
    <div
      className="group flex items-center gap-3 px-3 py-2 hover:bg-muted/60 cursor-pointer"
      onClick={() => onOpenTask(task.id)}
    >
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
  onAdd: (title: string) => Promise<void> | void
}) {
  const [value, setValue] = useState('')
  const [active, setActive] = useState(false)

  const submit = async () => {
    const trimmed = value.trim()
    if (!trimmed) {
      setActive(false)
      return
    }
    await onAdd(trimmed)
    setValue('')
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
        onBlur={() => {
          void submit()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void submit()
          } else if (e.key === 'Escape') {
            setValue('')
            setActive(false)
          }
        }}
        placeholder={`New ${STATUS_META[status].label.toLowerCase()} task…`}
        className="h-7 text-sm border-0 shadow-none focus-visible:ring-0 px-0"
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
  onOpenTask,
  onPatchTask,
  onAddTask,
}: {
  tasks: TaskItem[]
  workspaceId: string
  projectId: string
  projectFields: CustomFieldDef[]
  onOpenTask: (taskId: string) => void
  onPatchTask: (taskId: string, patch: TaskPatch) => Promise<void> | void
  onAddTask: (title: string) => Promise<void> | void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null)
  const [titleDraft, setTitleDraft] = useState('')
  const [statusOpenFor, setStatusOpenFor] = useState<string | null>(null)
  const [priorityOpenFor, setPriorityOpenFor] = useState<string | null>(null)
  const [dateOpenFor, setDateOpenFor] = useState<string | null>(null)
  const [customOpen, setCustomOpen] = useState<{ taskId: string; fieldId: string } | null>(null)
  const [addActive, setAddActive] = useState(false)
  const [addDraft, setAddDraft] = useState('')
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
          const rowMap = Object.fromEntries(rows.map((r) => [r.fieldId, r.value]))
          return [task.id, rowMap] as const
        }),
      )
      return Object.fromEntries(entries)
    },
  })

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
  const applyBulkPatch = async (patch: TaskPatch) => {
    await Promise.all(selectedIds.map((id) => onPatchTask(id, patch)))
    setSelected(new Set())
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 rounded-lg border border-border bg-card/50 text-[11px] text-muted-foreground">
        <span className="font-semibold uppercase tracking-wider text-[10px]">Status Legend:</span>
        {STATUS_ORDER.map((status) => {
          const meta = STATUS_META[status]
          return (
            <div key={status} className="flex items-center gap-1.5">
              <span className={cn('h-2 w-2 rounded-full', meta.dot)} />
              <span>{meta.label}</span>
            </div>
          )
        })}
      </div>

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
          <div className="divide-y divide-border">
            {tasks.map((task) => {
              const meta = STATUS_META[task.status]
              const isSelected = selected.has(task.id)
              const isEditing = editingTitleId === task.id
              const assignees = task.assignees ?? []
              const taskCustom = customFieldByTask[task.id] ?? {}
              return (
                <div
                  key={task.id}
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
                          task.status === 'done' && 'line-through text-muted-foreground',
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
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium border border-border',
                        meta.pill,
                      )}
                    >
                      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
                      {meta.label}
                    </button>
                    {statusOpenFor === task.id && (
                      <div
                        className="absolute top-full left-3 mt-1 z-20 w-44 rounded-md border border-border bg-card shadow-lg py-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {STATUS_ORDER.map((s) => {
                          const sMeta = STATUS_META[s]
                          return (
                            <button
                              key={s}
                              type="button"
                              className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted text-left"
                              onClick={async () => {
                                setStatusOpenFor(null)
                                if (task.status !== s) {
                                  await onPatchTask(task.id, { status: s })
                                }
                              }}
                            >
                              <span className={cn('h-1.5 w-1.5 rounded-full', sMeta.dot)} />
                              {sMeta.label}
                            </button>
                          )
                        })}
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
                  <div className="w-28 px-3 flex items-center">
                    {assignees.length === 0 ? (
                      <span className="text-muted-foreground text-xs">—</span>
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
  const meta = STATUS_META[status]

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-lg border border-border bg-muted/30 flex flex-col min-h-40 transition-colors',
        isOver && 'ring-2 ring-brand-500 bg-accent/10',
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <span className={cn('h-2 w-2 rounded-full', meta.dot)} />
        <h3 className="font-medium text-sm">{meta.label}</h3>
        <span className="text-xs text-muted-foreground tabular-nums">{tasks.length}</span>
      </div>
      <div className="p-2 space-y-2 flex-1">
        {tasks.map((task) => (
          <BoardTaskCard key={task.id} task={task} onOpenTask={onOpenTask} />
        ))}
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
    </button>
  )
}

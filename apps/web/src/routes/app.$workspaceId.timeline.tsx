import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Card, EmptyState, Badge, cn } from '@rundesk/ui'
import { GanttChart, ZoomIn, ZoomOut } from 'lucide-react'
import { api } from '../lib/api'

export const Route = createFileRoute('/app/$workspaceId/timeline')({
  component: TimelinePage,
})

type TimelineTask = {
  id: string
  title: string
  startDate: string | null
  dueDate: string | null
  status: string
  priority: string
  listId: string
  listName: string
  projectId: string
  projectName: string
  spaceId: string
  spaceName: string
}

type Zoom = 'day' | 'week' | 'month'

const DAY_PX: Record<Zoom, number> = { day: 56, week: 28, month: 14 }
const TASK_COL_WIDTH = 260

const PRIORITY_BG: Record<string, string> = {
  urgent: 'bg-gradient-to-r from-rose-500 to-red-500',
  high: 'bg-gradient-to-r from-orange-500 to-amber-500',
  normal: 'bg-brand-gradient',
  low: 'bg-gradient-to-r from-slate-500 to-slate-600',
}

const STATUS_OPACITY: Record<string, string> = {
  done: 'opacity-50',
  cancelled: 'opacity-30 line-through decoration-white',
  in_progress: 'opacity-100',
  in_review: 'opacity-95',
  todo: 'opacity-90',
  backlog: 'opacity-70',
}

function TimelinePage() {
  const { workspaceId } = Route.useParams()
  const [zoom, setZoom] = useState<Zoom>('week')

  const tasksQuery = useQuery({
    queryKey: ['timeline', workspaceId],
    queryFn: () => api<TimelineTask[]>(`/tasks/workspace/${workspaceId}/timeline`),
  })

  const tasks = tasksQuery.data ?? []
  const dayPx = DAY_PX[zoom]

  const { startMs, days } = useMemo(() => {
    if (tasks.length === 0) {
      const now = Date.now()
      return { startMs: startOfDay(now), days: 30 }
    }
    const allDates: number[] = []
    for (const t of tasks) {
      if (t.startDate) allDates.push(new Date(t.startDate).getTime())
      if (t.dueDate) allDates.push(new Date(t.dueDate).getTime())
    }
    const min = Math.min(...allDates)
    const max = Math.max(...allDates)
    const startMs = startOfDay(min - 3 * 86400_000)
    const endMs = startOfDay(max + 3 * 86400_000)
    const days = Math.max(14, Math.ceil((endMs - startMs) / 86400_000))
    return { startMs, days }
  }, [tasks])

  // Group tasks by space → project for nicer rendering
  const groups = useMemo(() => {
    const m = new Map<string, { title: string; rows: TimelineTask[] }>()
    for (const t of tasks) {
      const key = `${t.spaceId}:${t.projectId}`
      const title = `${t.spaceName} · ${t.projectName}`
      if (!m.has(key)) m.set(key, { title, rows: [] })
      m.get(key)!.rows.push(t)
    }
    return Array.from(m.entries()).map(([key, g]) => ({ key, ...g }))
  }, [tasks])

  const todayOffsetPx = ((startOfDay(Date.now()) - startMs) / 86400_000) * dayPx
  const totalWidth = days * dayPx

  return (
    <div className="p-6 space-y-5 max-w-full">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">
            Workspace timeline
          </div>
          <h1 className="font-display text-3xl font-semibold flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient-soft text-white shadow-glow">
              <GanttChart className="h-4 w-4" />
            </span>
            Timeline
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
            All tasks with start or due dates, grouped by project. Drag the area below to scroll.
          </p>
        </div>
        <div className="flex items-center gap-1 bg-card/40 border border-border/60 rounded-lg p-1 backdrop-blur-sm shrink-0">
          {(['day', 'week', 'month'] as const).map((z) => (
            <button
              key={z}
              onClick={() => setZoom(z)}
              className={cn(
                'text-xs px-3 py-1.5 rounded-md transition-all capitalize font-medium',
                zoom === z
                  ? 'bg-brand-gradient text-white shadow-sm'
                  : 'hover:bg-card/60 text-muted-foreground hover:text-foreground',
              )}
            >
              {z}
            </button>
          ))}
        </div>
      </header>

      {tasksQuery.isLoading ? (
        <Card variant="glass" className="p-12 text-center text-sm text-muted-foreground">
          Loading timeline…
        </Card>
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={<GanttChart className="h-6 w-6" />}
          title="No tasks with dates yet"
          description="Add a start or due date to any task and it'll appear here."
        />
      ) : (
        <Card variant="glass" className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <div
              className="relative"
              style={{ width: TASK_COL_WIDTH + totalWidth, minWidth: '100%' }}
            >
              {/* Sticky header row */}
              <div className="sticky top-0 z-20 flex border-b border-border/60 bg-card/95 backdrop-blur-sm">
                {/* Task column header */}
                <div
                  className="sticky left-0 z-30 shrink-0 border-r border-border/60 bg-card/95 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
                  style={{ width: TASK_COL_WIDTH }}
                >
                  Task
                </div>
                {/* Date axis */}
                <div className="relative" style={{ width: totalWidth, height: 38 }}>
                  <DateHeader startMs={startMs} days={days} dayPx={dayPx} zoom={zoom} />
                </div>
              </div>

              {/* Today line */}
              {todayOffsetPx >= 0 && todayOffsetPx <= totalWidth && (
                <div
                  className="pointer-events-none absolute top-[38px] bottom-0 w-px bg-rose-400/60 shadow-[0_0_6px_hsl(0_70%_70%/0.5)]"
                  style={{ left: TASK_COL_WIDTH + todayOffsetPx }}
                />
              )}

              {/* Task rows */}
              {groups.map((group) => (
                <div key={group.key}>
                  {/* Group header */}
                  <div className="sticky left-0 z-10 flex h-8 items-center bg-muted/40 px-4 text-xs font-medium text-muted-foreground border-b border-border/30">
                    {group.title}
                  </div>
                  {group.rows.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      startMs={startMs}
                      dayPx={dayPx}
                      totalWidth={totalWidth}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

function DateHeader({
  startMs,
  days,
  dayPx,
  zoom,
}: {
  startMs: number
  days: number
  dayPx: number
  zoom: Zoom
}) {
  const cells: { label: string; left: number; width: number }[] = []

  if (zoom === 'day') {
    for (let i = 0; i < days; i++) {
      const d = new Date(startMs + i * 86400_000)
      cells.push({
        label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        left: i * dayPx,
        width: dayPx,
      })
    }
  } else if (zoom === 'week') {
    for (let i = 0; i < days; i += 7) {
      const d = new Date(startMs + i * 86400_000)
      cells.push({
        label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        left: i * dayPx,
        width: 7 * dayPx,
      })
    }
  } else {
    const start = new Date(startMs)
    let cursor = new Date(start.getFullYear(), start.getMonth(), 1).getTime()
    while (cursor < startMs + days * 86400_000) {
      const d = new Date(cursor)
      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime()
      const left = ((cursor - startMs) / 86400_000) * dayPx
      const width = ((next - cursor) / 86400_000) * dayPx
      cells.push({
        label: d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
        left,
        width,
      })
      cursor = next
    }
  }

  return (
    <div className="absolute inset-0">
      {cells.map((c, i) => (
        <div
          key={i}
          className="absolute top-0 bottom-0 flex items-center px-2.5 text-[11px] text-muted-foreground tabular-nums border-r border-border/40 last:border-r-0"
          style={{ left: c.left, width: c.width }}
        >
          {c.label}
        </div>
      ))}
    </div>
  )
}

function TaskRow({
  task,
  startMs,
  dayPx,
  totalWidth,
}: {
  task: TimelineTask
  startMs: number
  dayPx: number
  totalWidth: number
}) {
  const start = task.startDate ? new Date(task.startDate).getTime() : null
  const due = task.dueDate ? new Date(task.dueDate).getTime() : null
  const barStartMs = start ?? due!
  const barEndMs = due ?? start!
  const left = ((startOfDay(barStartMs) - startMs) / 86400_000) * dayPx
  // Min visible width — 14px so a one-day task is still visible at month zoom
  const width = Math.max(
    14,
    ((startOfDay(barEndMs) - startOfDay(barStartMs)) / 86400_000 + 1) * dayPx,
  )

  return (
    <div className="group flex border-b border-border/30 hover:bg-card/40 transition-colors">
      {/* Sticky task column */}
      <div
        className="sticky left-0 z-10 shrink-0 border-r border-border/40 bg-card/80 backdrop-blur-sm px-4 py-2"
        style={{ width: TASK_COL_WIDTH }}
      >
        <div className="text-sm truncate text-foreground">{task.title}</div>
        <div className="text-[10px] text-muted-foreground truncate flex items-center gap-1.5 mt-0.5">
          <Badge variant={task.priority as 'urgent' | 'high' | 'normal' | 'low'} className="px-1.5 py-0 text-[9px] capitalize">
            {task.priority}
          </Badge>
          <span>·</span>
          <span className="truncate">{task.listName}</span>
        </div>
      </div>
      {/* Bar lane */}
      <div className="relative h-12" style={{ width: totalWidth }}>
        <div
          className={cn(
            'absolute top-1/2 -translate-y-1/2 h-7 rounded-md text-[11px] text-white px-2.5 flex items-center font-medium overflow-hidden shadow-md ring-1 ring-white/10',
            PRIORITY_BG[task.priority] ?? 'bg-brand-gradient',
            STATUS_OPACITY[task.status] ?? '',
          )}
          style={{ left, width }}
          title={`${task.title} · ${task.startDate ?? '?'} → ${task.dueDate ?? '?'}`}
        >
          <span className="truncate">{task.title}</span>
        </div>
      </div>
    </div>
  )
}

function startOfDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

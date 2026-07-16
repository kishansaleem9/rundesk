import { useMemo, useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, EmptyState, Badge, cn } from '@rundesk/ui'
import { GanttChart, Diamond } from 'lucide-react'
import { api } from '../lib/api'
import { useTranslation, type TranslationKey } from '../lib/i18n'

type TimelineTask = {
  id: string
  title: string
  startDate: string | null
  dueDate: string | null
  status: string
  priority: string
  isMilestone?: boolean
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

const ZOOM_LABEL: Record<Zoom, TranslationKey> = {
  day: 'timeline.zoomDay',
  week: 'timeline.zoomWeek',
  month: 'timeline.zoomMonth',
}

const PRIORITY_LABEL: Record<string, TranslationKey> = {
  urgent: 'timeline.priorityUrgent',
  high: 'timeline.priorityHigh',
  normal: 'timeline.priorityNormal',
  low: 'timeline.priorityLow',
}

// §5.4 — how the cross-project timeline groups its rows. "project" keeps the
// original space·project header behaviour; the others mirror the per-list Gantt.
type GroupMode = 'project' | 'status' | 'priority' | 'none'

const GROUP_MODES: Array<{ value: GroupMode; labelKey: TranslationKey }> = [
  { value: 'project', labelKey: 'timeline.groupProject' },
  { value: 'status', labelKey: 'timeline.groupStatus' },
  { value: 'priority', labelKey: 'timeline.groupPriority' },
  { value: 'none', labelKey: 'timeline.groupNone' },
]

// Reuse the existing per-status labels; keep a canonical order for headers.
const STATUS_LABEL: Record<string, TranslationKey> = {
  backlog: 'taskDetail.status.backlog',
  todo: 'taskDetail.status.todo',
  in_progress: 'taskDetail.status.inProgress',
  in_review: 'taskDetail.status.inReview',
  done: 'taskDetail.status.done',
  cancelled: 'taskDetail.status.cancelled',
}
const STATUS_ORDER = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled']
const PRIORITY_ORDER = ['urgent', 'high', 'normal', 'low']

/** Title-case a raw enum value as a last-resort header for unexpected values. */
function humanize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : '—'
}

export function TimelinePage() {
  const { t } = useTranslation()
  const { workspaceId } = useParams({ from: '/app/$workspaceId/timeline' })
  const qc = useQueryClient()
  const [zoom, setZoom] = useState<Zoom>('week')
  const [localPatches, setLocalPatches] = useState<Record<string, { startDate?: string | null; dueDate?: string | null }>>({})
  const [projectFilter, setProjectFilter] = useState<string>('all')
  const [groupMode, setGroupMode] = useState<GroupMode>('project')

  const tasksQuery = useQuery({
    queryKey: ['timeline', workspaceId],
    queryFn: () => api<TimelineTask[]>(`/tasks/workspace/${workspaceId}/timeline`),
  })
  const persistDates = useMutation({
    mutationFn: ({ taskId, startDate, dueDate }: { taskId: string; startDate: string | null; dueDate: string | null }) =>
      api(`/tasks/${taskId}`, {
        method: 'PATCH',
        body: { startDate, dueDate },
      }),
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: ['timeline', workspaceId] })
    },
  })

  const allTasks = useMemo(
    () =>
      (tasksQuery.data ?? []).map((task) => {
        const patch = localPatches[task.id]
        return patch ? { ...task, ...patch } : task
      }),
    [tasksQuery.data, localPatches],
  )

  const projectOptions = useMemo(() => {
    const seen = new Map<string, { id: string; label: string }>()
    for (const t of allTasks) {
      if (!seen.has(t.projectId)) {
        seen.set(t.projectId, { id: t.projectId, label: `${t.spaceName} · ${t.projectName}` })
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label))
  }, [allTasks])

  const tasks = useMemo(() => {
    if (projectFilter === 'all') return allTasks
    return allTasks.filter((t) => t.projectId === projectFilter)
  }, [allTasks, projectFilter])
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

  // Group tasks by the selected mode (§5.4). "none" renders one headerless
  // group; the others emit a labelled header row per group. Group order is
  // canonical for status/priority, alphabetical (space·project) for projects.
  const groups = useMemo<Array<{ key: string; title: string | null; rows: TimelineTask[] }>>(() => {
    if (groupMode === 'none') {
      return [{ key: 'all', title: null, rows: tasks }]
    }
    const m = new Map<string, { title: string; rows: TimelineTask[]; sort: number }>()
    for (const task of tasks) {
      let key: string
      let title: string
      let sort: number
      if (groupMode === 'status') {
        key = task.status || 'unknown'
        title = STATUS_LABEL[task.status] ? t(STATUS_LABEL[task.status]) : humanize(task.status)
        sort = STATUS_ORDER.indexOf(task.status)
      } else if (groupMode === 'priority') {
        key = task.priority || 'unknown'
        title = PRIORITY_LABEL[task.priority] ? t(PRIORITY_LABEL[task.priority]) : humanize(task.priority)
        sort = PRIORITY_ORDER.indexOf(task.priority)
      } else {
        // project
        key = `${task.spaceId}:${task.projectId}`
        title = `${task.spaceName} · ${task.projectName}`
        sort = 0
      }
      if (!m.has(key)) m.set(key, { title, rows: [], sort })
      m.get(key)!.rows.push(task)
    }
    const arr = Array.from(m.entries()).map(([key, g]) => ({ key, title: g.title, rows: g.rows, sort: g.sort }))
    if (groupMode === 'project') {
      arr.sort((a, b) => a.title.localeCompare(b.title))
    } else {
      // Known enum values in canonical order; unexpected values fall to the end.
      arr.sort((a, b) => {
        const as = a.sort < 0 ? Number.MAX_SAFE_INTEGER : a.sort
        const bs = b.sort < 0 ? Number.MAX_SAFE_INTEGER : b.sort
        return as !== bs ? as - bs : a.title.localeCompare(b.title)
      })
    }
    return arr.map(({ key, title, rows }) => ({ key, title, rows }))
  }, [tasks, groupMode, t])

  const todayOffsetPx = ((startOfDay(Date.now()) - startMs) / 86400_000) * dayPx
  const totalWidth = days * dayPx

  return (
    <div className="p-6 space-y-5 max-w-full">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">
            {t('timeline.eyebrow')}
          </div>
          <h1 className="font-display text-3xl font-semibold flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient-soft text-white shadow-glow">
              <GanttChart className="h-4 w-4" />
            </span>
            {t('timeline.title')}
            <Badge variant="secondary" className="ml-1">{t('timeline.live')}</Badge>
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
            {t('timeline.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <select
            value={groupMode}
            onChange={(e) => setGroupMode(e.target.value as GroupMode)}
            className="text-xs h-8 px-2.5 rounded-md border border-border/60 bg-card/60 text-foreground backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            title={t('timeline.groupByLabel')}
            aria-label={t('timeline.groupByLabel')}
          >
            {GROUP_MODES.map((g) => (
              <option key={g.value} value={g.value}>
                {t('timeline.groupByLabel')}: {t(g.labelKey)}
              </option>
            ))}
          </select>
          {projectOptions.length > 1 && (
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="text-xs h-8 px-2.5 rounded-md border border-border/60 bg-card/60 text-foreground backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              title={t('timeline.filterByProject')}
            >
              <option value="all">{t('reports.allProjects')}</option>
              {projectOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-1 bg-card/40 border border-border/60 rounded-lg p-1 backdrop-blur-sm">
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
                {t(ZOOM_LABEL[z])}
              </button>
            ))}
          </div>
        </div>
      </header>

      {tasksQuery.isLoading ? (
        <Card variant="glass" className="p-12 text-center text-sm text-muted-foreground">
          {t('timeline.loading')}
        </Card>
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={<GanttChart className="h-6 w-6" />}
          title={t('timeline.emptyTitle')}
          description={t('timeline.emptyDesc')}
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
                  {t('timeline.taskColumn')}
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
                  {/* Group header (hidden when grouping is "None") */}
                  {group.title && (
                    <div className="sticky left-0 z-10 flex h-8 items-center bg-muted/40 px-4 text-xs font-medium text-muted-foreground border-b border-border/30">
                      {group.title}
                    </div>
                  )}
                  {group.rows.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      startMs={startMs}
                      dayPx={dayPx}
                      totalWidth={totalWidth}
                      onPatchDates={(next) => setLocalPatches((prev) => ({ ...prev, [task.id]: next }))}
                      onPersistDates={(next) => {
                        void persistDates.mutateAsync({
                          taskId: task.id,
                          startDate: next.startDate ?? null,
                          dueDate: next.dueDate ?? null,
                        }).finally(() => {
                          setLocalPatches((prev) => {
                            const copy = { ...prev }
                            delete copy[task.id]
                            return copy
                          })
                        })
                      }}
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
  onPatchDates,
  onPersistDates,
}: {
  task: TimelineTask
  startMs: number
  dayPx: number
  totalWidth: number
  onPatchDates: (next: { startDate?: string | null; dueDate?: string | null }) => void
  onPersistDates: (next: { startDate?: string | null; dueDate?: string | null }) => void
}) {
  const { t } = useTranslation()
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
  const [isDragging, setIsDragging] = useState(false)

  return (
    <div className="group flex border-b border-border/30 hover:bg-card/40 transition-colors">
      {/* Sticky task column */}
      <div
        className="sticky left-0 z-10 shrink-0 border-r border-border/40 bg-card/80 backdrop-blur-sm px-4 py-2"
        style={{ width: TASK_COL_WIDTH }}
      >
        <div className="text-sm truncate text-foreground flex items-center gap-1.5">
          {task.isMilestone && <Diamond className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" />}
          <span className="truncate">{task.title}</span>
        </div>
        <div className="text-[10px] text-muted-foreground truncate flex items-center gap-1.5 mt-0.5">
          <Badge variant={task.priority as 'urgent' | 'high' | 'normal' | 'low'} className="px-1.5 py-0 text-[9px] capitalize">
            {PRIORITY_LABEL[task.priority] ? t(PRIORITY_LABEL[task.priority]) : task.priority}
          </Badge>
          <span>·</span>
          <span className="truncate">{task.listName}</span>
        </div>
      </div>
      {/* Bar lane */}
      <div className="relative h-12" style={{ width: totalWidth }}>
        <div
          className={cn(
            'group/bar absolute top-1/2 -translate-y-1/2 h-7 rounded-md text-[11px] text-white px-2.5 flex items-center gap-1 font-medium shadow-md ring-1 ring-white/10',
            task.isMilestone ? 'bg-amber-500' : (PRIORITY_BG[task.priority] ?? 'bg-brand-gradient'),
            STATUS_OPACITY[task.status] ?? '',
            isDragging && 'ring-2 ring-white/70',
          )}
          style={{ left, width }}
          title={`${task.isMilestone ? t('timeline.milestonePrefix') : ''}${task.title} · ${task.startDate ?? '?'} → ${task.dueDate ?? '?'}`}
          onMouseDown={(e) => {
            if (e.button !== 0) return
            const target = e.target as HTMLElement
            if (target.dataset.handle) return
            setIsDragging(true)
            const startX = e.clientX
            const baseStart = startOfDay(barStartMs)
            const baseEnd = startOfDay(barEndMs)
            let finalDiffDays = 0
            const move = (evt: MouseEvent) => {
              const diffDays = Math.round((evt.clientX - startX) / dayPx)
              finalDiffDays = diffDays
              const nextStart = new Date(baseStart + diffDays * 86400_000).toISOString()
              const nextEnd = new Date(baseEnd + diffDays * 86400_000).toISOString()
              onPatchDates({ startDate: nextStart, dueDate: nextEnd })
            }
            const up = () => {
              const finalStart = new Date(baseStart + finalDiffDays * 86400_000).toISOString()
              const finalEnd = new Date(baseEnd + finalDiffDays * 86400_000).toISOString()
              onPersistDates({ startDate: finalStart, dueDate: finalEnd })
              setIsDragging(false)
              window.removeEventListener('mousemove', move)
              window.removeEventListener('mouseup', up)
            }
            window.addEventListener('mousemove', move)
            window.addEventListener('mouseup', up)
          }}
        >
          {/* Left resize handle — adjusts start date */}
          <div
            data-handle="start"
            className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize opacity-0 group-hover/bar:opacity-100 bg-white/30 rounded-l-md transition-opacity"
            onMouseDown={(e) => {
              e.stopPropagation()
              if (e.button !== 0) return
              setIsDragging(true)
              const startX = e.clientX
              const baseStart = startOfDay(barStartMs)
              const baseEnd = startOfDay(barEndMs)
              let finalDiffDays = 0
              const move = (evt: MouseEvent) => {
                const diffDays = Math.round((evt.clientX - startX) / dayPx)
                finalDiffDays = diffDays
                const nextStartMs = Math.min(baseStart + diffDays * 86400_000, baseEnd)
                onPatchDates({ startDate: new Date(nextStartMs).toISOString(), dueDate: task.dueDate })
              }
              const up = () => {
                const finalStartMs = Math.min(baseStart + finalDiffDays * 86400_000, baseEnd)
                onPersistDates({ startDate: new Date(finalStartMs).toISOString(), dueDate: task.dueDate })
                setIsDragging(false)
                window.removeEventListener('mousemove', move)
                window.removeEventListener('mouseup', up)
              }
              window.addEventListener('mousemove', move)
              window.addEventListener('mouseup', up)
            }}
          />
          {task.isMilestone && <Diamond className="h-3 w-3 shrink-0 fill-white/90" />}
          <span className="truncate flex-1">{task.title}</span>
          {/* Right resize handle — adjusts due date */}
          <div
            data-handle="end"
            className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize opacity-0 group-hover/bar:opacity-100 bg-white/30 rounded-r-md transition-opacity"
            onMouseDown={(e) => {
              e.stopPropagation()
              if (e.button !== 0) return
              setIsDragging(true)
              const startX = e.clientX
              const baseStart = startOfDay(barStartMs)
              const baseEnd = startOfDay(barEndMs)
              let finalDiffDays = 0
              const move = (evt: MouseEvent) => {
                const diffDays = Math.round((evt.clientX - startX) / dayPx)
                finalDiffDays = diffDays
                const nextEndMs = Math.max(baseEnd + diffDays * 86400_000, baseStart)
                onPatchDates({ startDate: task.startDate, dueDate: new Date(nextEndMs).toISOString() })
              }
              const up = () => {
                const finalEndMs = Math.max(baseEnd + finalDiffDays * 86400_000, baseStart)
                onPersistDates({ startDate: task.startDate, dueDate: new Date(finalEndMs).toISOString() })
                setIsDragging(false)
                window.removeEventListener('mousemove', move)
                window.removeEventListener('mouseup', up)
              }
              window.addEventListener('mousemove', move)
              window.addEventListener('mouseup', up)
            }}
          />
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

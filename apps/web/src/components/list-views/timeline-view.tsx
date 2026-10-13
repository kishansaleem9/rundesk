import { useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Card, cn, toast } from '@rundesk/ui'
import { addDays, differenceInCalendarDays, format, startOfDay, startOfWeek } from 'date-fns'
import { api, ApiError } from '../../lib/api'
import { useTranslation, type TranslationKey } from '../../lib/i18n'
import { dayAsDateOnly, shiftByDays, shownDay } from '../../lib/task-dates'

/** What a bar needs of a task — the list route's rows carry all of it. */
export type TimelineTask = {
  id: string
  title: string
  status: string
  statusCategory?: string | null
  priority: string
  startDate?: string | null
  dueDate?: string | null
  startDateHasTime?: boolean
  dueDateHasTime?: boolean
  assignees?: Array<{ userId: string; user?: { displayName?: string | null } }>
  mayEdit?: boolean
}

export type TimelineGroupBy = 'assignee' | 'status' | 'priority'

const UNASSIGNED = 'unassigned'
const PRIORITIES = ['urgent', 'high', 'normal', 'low'] as const
const PRIORITY_KEYS: Record<string, TranslationKey> = {
  urgent: 'taskDetail.priority.urgent',
  high: 'taskDetail.priority.high',
  normal: 'taskDetail.priority.normal',
  low: 'taskDetail.priority.low',
}
const SCALES = { week: { days: 14, width: 56 }, month: { days: 42, width: 26 } } as const
const LABEL_W = 180
const LINE_H = 30

type Group = { key: string; label: string; color?: string; userId?: string }
type Line = { task: TimelineTask; group: string; from: Date; to: Date }

/**
 * A LIST'S TIMELINE (`commit-log/log-68bc188-1`, `ledger-rows/row-777`).
 *
 * ClickUp's Timeline draws tasks as bars over time in rows chosen by a
 * Group-by field — what separates it from Gantt, which has none. Grouped by
 * Assignee, a person's time off is labelled across those days; dragging a bar
 * along its row moves its dates, and dragging it into another row changes the
 * value that row stands for (by Assignee, it reassigns the task). A sidebar
 * holds the Unscheduled and Overdue tasks, and dropping one on a day schedules
 * it. A task with two assignees sits on both of their rows.
 */
export function TimelineView({
  workspaceId,
  tasks,
  statuses,
  onOpenTask,
  onChanged,
}: {
  workspaceId: string
  tasks: TimelineTask[]
  statuses: Array<{ key: string; name: string; color: string }>
  onOpenTask: (id: string) => void
  /** Called after a write, so the list reads the server's answer. */
  onChanged: () => Promise<unknown>
}) {
  const { t, locale } = useTranslation()
  const [groupBy, setGroupBy] = useState<TimelineGroupBy>('assignee')
  const [scale, setScale] = useState<keyof typeof SCALES>('week')
  const [anchor, setAnchor] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const { days, width: dayW } = SCALES[scale]
  const from = anchor
  const to = addDays(anchor, days - 1)
  const today = startOfDay(new Date())

  // Time off, labelled on each person's row (by Assignee only).
  const timeOff = useQuery({
    queryKey: ['timeline-time-off', workspaceId, format(from, 'yyyy-MM-dd'), format(to, 'yyyy-MM-dd')],
    queryFn: () =>
      api<Array<{ id: string; userId: string; startsOn: string; endsOn: string }>>(
        `/workspaces/${workspaceId}/time-off?from=${format(from, 'yyyy-MM-dd')}&to=${format(to, 'yyyy-MM-dd')}`,
      ),
    enabled: groupBy === 'assignee',
    retry: false,
  })

  const spanOf = (task: TimelineTask): { from: Date; to: Date } | null => {
    const s = shownDay(task.startDate, task.startDateHasTime)
    const d = shownDay(task.dueDate, task.dueDateHasTime)
    if (!s && !d) return null
    const a = s ?? d!
    const b = d ?? s!
    return a <= b ? { from: a, to: b } : { from: b, to: a }
  }
  const isClosed = (task: TimelineTask) => task.statusCategory === 'closed'

  const groupsOf = (task: TimelineTask): string[] => {
    if (groupBy === 'status') return [task.status]
    if (groupBy === 'priority') return [task.priority]
    const ids = (task.assignees ?? []).map((a) => a.userId)
    return ids.length ? ids : [UNASSIGNED]
  }

  const { groups, lines, unscheduled, overdue } = useMemo(() => {
    const unscheduled: TimelineTask[] = []
    const overdue: TimelineTask[] = []
    const lines: Line[] = []
    const people = new Map<string, string>()
    for (const task of tasks) {
      for (const a of task.assignees ?? []) people.set(a.userId, a.user?.displayName || a.userId.slice(0, 8))
      const span = spanOf(task)
      if (!span) {
        unscheduled.push(task)
        continue
      }
      if (!isClosed(task) && span.to < today) overdue.push(task)
      if (span.to < from || span.from > to) continue
      for (const g of groupsOf(task)) lines.push({ task, group: g, ...span })
    }
    let groups: Group[]
    if (groupBy === 'status') {
      const known = statuses.map((s) => ({ key: s.key, label: s.name, color: s.color }))
      const extra = [...new Set(tasks.map((task) => task.status))].filter((k) => !known.some((g) => g.key === k))
      groups = [...known, ...extra.map((k) => ({ key: k, label: k }))]
    } else if (groupBy === 'priority') {
      groups = PRIORITIES.map((p) => ({ key: p, label: t(PRIORITY_KEYS[p]) }))
    } else {
      groups = [
        ...[...people.entries()]
          .sort((x, y) => x[1].localeCompare(y[1]))
          .map(([id, name]) => ({ key: id, label: name, userId: id })),
        { key: UNASSIGNED, label: t('list.timeline.unassigned') },
      ]
    }
    return { groups, lines, unscheduled, overdue }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, groupBy, statuses, from.getTime(), days])

  const x = (day: Date) => differenceInCalendarDays(day, from) * dayW

  // --- Dragging a bar: along its row moves dates, into another row regroups it.
  const drag = useRef<{ taskId: string; group: string; x0: number; y0: number; moved: boolean } | null>(null)
  const [dragDx, setDragDx] = useState(0)
  const [dragTask, setDragTask] = useState<string | null>(null)
  const [overGroup, setOverGroup] = useState<string | null>(null)

  const groupAt = (clientX: number, clientY: number): string | null => {
    for (const el of document.elementsFromPoint(clientX, clientY)) {
      const key = (el as HTMLElement).dataset?.groupKey
      if (key !== undefined && (el as HTMLElement).dataset.testid === 'timeline-group') return key
    }
    return null
  }

  const say = (err: unknown) => toast.error(err instanceof ApiError ? err.message : t('list.timeline.saveFailed'))

  const regroup = async (task: TimelineTask, fromGroup: string, toGroup: string) => {
    if (groupBy === 'status') {
      await api(`/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ status: toGroup }) })
    } else if (groupBy === 'priority') {
      await api(`/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ priority: toGroup }) })
    } else {
      // The new person first, so a refusal leaves the task with the one it had.
      if (toGroup !== UNASSIGNED && !(task.assignees ?? []).some((a) => a.userId === toGroup)) {
        await api(`/tasks/${task.id}/assignees`, { method: 'POST', body: JSON.stringify({ userId: toGroup }) })
      }
      if (fromGroup !== UNASSIGNED) {
        await api(`/tasks/${task.id}/assignees/${fromGroup}`, { method: 'DELETE' })
      }
    }
  }

  const shift = async (task: TimelineTask, delta: number) => {
    const patch: Record<string, unknown> = {}
    if (task.startDate) patch.startDate = shiftByDays(task.startDate, delta, task.startDateHasTime)
    if (task.dueDate) patch.dueDate = shiftByDays(task.dueDate, delta, task.dueDateHasTime)
    await api(`/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify(patch) })
  }

  /*
   * The drag is followed on the WINDOW, not on the bar. A bar moves only along
   * its row, so a drag to another row leaves the bar behind, and the pointer's
   * moves and its release land on whatever row it is over; pointer capture is
   * meant to hold them to the bar, and did not for every pointer.
   */
  const onBarDown = (e: React.PointerEvent, task: TimelineTask, group: string) => {
    if (e.button !== 0) return
    e.preventDefault()
    drag.current = { taskId: task.id, group, x0: e.clientX, y0: e.clientY, moved: false }
    setDragTask(task.id)
    setDragDx(0)
    const move = (ev: PointerEvent) => {
      const d = drag.current
      if (!d) return
      const dx = ev.clientX - d.x0
      if (!d.moved && Math.abs(dx) < 4 && Math.abs(ev.clientY - d.y0) < 4) return
      d.moved = true
      setDragDx(dx)
      setOverGroup(groupAt(ev.clientX, ev.clientY))
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      void onBarUp(ev, task)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const onBarUp = async (e: { clientX: number; clientY: number }, task: TimelineTask) => {
    const d = drag.current
    drag.current = null
    setDragTask(null)
    setDragDx(0)
    setOverGroup(null)
    if (!d) return
    if (!d.moved) {
      onOpenTask(task.id)
      return
    }
    const delta = Math.round((e.clientX - d.x0) / dayW)
    const target = groupAt(e.clientX, e.clientY)
    if (task.mayEdit === false) {
      toast.error(t('list.timeline.readOnly'))
      return
    }
    try {
      if (delta !== 0) await shift(task, delta)
      if (target !== null && target !== d.group) await regroup(task, d.group, target)
    } catch (err) {
      say(err)
    }
    await onChanged()
  }

  // --- Dropping from the sidebar onto a day schedules the task there.
  const dayAt = (clientX: number, el: HTMLElement) => {
    const left = el.getBoundingClientRect().left
    return addDays(from, Math.max(0, Math.min(days - 1, Math.floor((clientX - left) / dayW))))
  }
  const onGridDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain')
    const task = tasks.find((one) => one.id === id)
    if (!task) return
    const day = dayAt(e.clientX, e.currentTarget)
    try {
      const span = spanOf(task)
      if (span && task.startDate) {
        // An overdue task keeps its length: both ends move by the same days.
        await shift(task, differenceInCalendarDays(day, span.to))
      } else {
        await api(`/tasks/${task.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ dueDate: dayAsDateOnly(day), dueDateHasTime: false }),
        })
      }
    } catch (err) {
      say(err)
    }
    await onChanged()
  }

  const offFor = (userId?: string) =>
    userId ? (timeOff.data ?? []).filter((o) => o.userId === userId) : []

  const gridW = days * dayW
  const dayCells = Array.from({ length: days }, (_, i) => addDays(from, i))

  return (
    <Card className="p-0" data-testid="timeline-view" data-group-by={groupBy}>
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          {t('list.timeline.groupBy')}
          <select
            data-testid="timeline-group-by"
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as TimelineGroupBy)}
            className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground"
          >
            <option value="assignee">{t('list.timeline.byAssignee')}</option>
            <option value="status">{t('list.timeline.byStatus')}</option>
            <option value="priority">{t('list.timeline.byPriority')}</option>
          </select>
        </label>
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5 text-xs" data-testid="timeline-scale">
          {(Object.keys(SCALES) as Array<keyof typeof SCALES>).map((s) => (
            <button
              key={s}
              type="button"
              data-testid={`timeline-scale-${s}`}
              aria-pressed={scale === s}
              onClick={() => setScale(s)}
              className={cn('rounded px-2 py-0.5', scale === s ? 'bg-brand-700 text-white' : 'text-muted-foreground hover:text-foreground')}
            >
              {s === 'week' ? t('list.timeline.twoWeeks') : t('list.timeline.sixWeeks')}
            </button>
          ))}
        </div>
        <Button size="sm" variant="outline" data-testid="timeline-today" onClick={() => setAnchor(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
          {t('list.calendar.today')}
        </Button>
        <Button size="sm" variant="outline" data-testid="timeline-prev" onClick={() => setAnchor((a) => addDays(a, -7))}>
          ‹
        </Button>
        <Button size="sm" variant="outline" data-testid="timeline-next" onClick={() => setAnchor((a) => addDays(a, 7))}>
          ›
        </Button>
        <span className="text-sm font-medium" data-testid="timeline-period" data-from={format(from, 'yyyy-MM-dd')} data-to={format(to, 'yyyy-MM-dd')}>
          {from.toLocaleDateString(locale, { month: 'short', day: 'numeric' })} – {to.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
      </div>
      <div className="flex">
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div style={{ width: LABEL_W + gridW }}>
            <div className="sticky top-0 z-10 flex border-b border-border bg-background">
              <div style={{ width: LABEL_W }} className="shrink-0" />
              {dayCells.map((day) => (
                <div
                  key={day.toISOString()}
                  data-testid="timeline-day"
                  data-day={format(day, 'yyyy-MM-dd')}
                  style={{ width: dayW }}
                  className={cn(
                    'shrink-0 border-l border-border/60 py-1 text-center text-[10px] text-muted-foreground',
                    differenceInCalendarDays(day, today) === 0 && 'bg-brand-50 font-semibold text-brand-700 dark:bg-brand-900/30',
                  )}
                >
                  {scale === 'week' ? day.toLocaleDateString(locale, { weekday: 'short', day: 'numeric' }) : day.getDate()}
                </div>
              ))}
            </div>
            {groups.map((group) => {
              const own = lines.filter((l) => l.group === group.key)
              const off = groupBy === 'assignee' ? offFor(group.userId) : []
              return (
                <div
                  key={group.key}
                  data-testid="timeline-group"
                  data-group-key={group.key}
                  data-drop-over={overGroup === group.key && dragTask ? 'true' : undefined}
                  className={cn('flex border-b border-border', overGroup === group.key && dragTask && 'bg-brand-50/60 dark:bg-brand-900/20')}
                >
                  <div style={{ width: LABEL_W }} className="shrink-0 border-r border-border px-3 py-2 text-sm font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      {group.color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: group.color }} />}
                      <span className="truncate" data-testid="timeline-group-label">{group.label}</span>
                    </span>
                    <span className="ml-1 text-xs text-muted-foreground">{own.length}</span>
                  </div>
                  <div
                    className="relative shrink-0"
                    style={{ width: gridW, minHeight: LINE_H + 8, height: Math.max(1, own.length) * LINE_H + 8 + (off.length ? 18 : 0) }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => void onGridDrop(e)}
                    data-testid="timeline-grid"
                  >
                    {/* Day lines and today, behind the bars. */}
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-0"
                      style={{ backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent ${dayW - 1}px, rgba(148,163,184,0.18) ${dayW - 1}px, rgba(148,163,184,0.18) ${dayW}px)` }}
                    />
                    {today >= from && today <= to && (
                      <div aria-hidden className="pointer-events-none absolute inset-y-0 w-0.5 bg-brand-400/70" style={{ left: x(today) + dayW / 2 }} />
                    )}
                    {off.map((o) => {
                      const a = new Date(`${o.startsOn}T00:00:00`)
                      const b = new Date(`${o.endsOn}T00:00:00`)
                      const left = Math.max(0, x(a))
                      const right = Math.min(gridW, x(b) + dayW)
                      return (
                        <div
                          key={o.id}
                          data-testid="timeline-time-off"
                          data-user-id={o.userId}
                          data-from={o.startsOn}
                          data-to={o.endsOn}
                          className="absolute top-1 h-4 rounded bg-amber-200/70 px-1 text-[10px] leading-4 text-amber-900 dark:bg-amber-500/30 dark:text-amber-100"
                          style={{ left, width: Math.max(dayW, right - left) }}
                        >
                          {t('list.timeline.timeOff')}
                        </div>
                      )
                    })}
                    {own.map((line, i) => {
                      const a = line.from < from ? from : line.from
                      const b = line.to > to ? to : line.to
                      const left = x(a)
                      const w = (differenceInCalendarDays(b, a) + 1) * dayW
                      const moving = dragTask === line.task.id
                      return (
                        <div
                          key={`${line.task.id}:${line.group}`}
                          data-testid="timeline-bar"
                          data-task-id={line.task.id}
                          data-group-key={line.group}
                          data-from={format(line.from, 'yyyy-MM-dd')}
                          data-to={format(line.to, 'yyyy-MM-dd')}
                          role="button"
                          tabIndex={0}
                          title={line.task.title}
                          onPointerDown={(e) => onBarDown(e, line.task, line.group)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') onOpenTask(line.task.id)
                          }}
                          className={cn(
                            'absolute flex cursor-grab touch-none items-center truncate rounded-md px-2 text-xs font-medium text-white shadow-sm',
                            isClosed(line.task) ? 'bg-slate-400' : line.to < today ? 'bg-red-500' : 'bg-brand-600',
                            moving && 'cursor-grabbing opacity-80 ring-2 ring-brand-300',
                          )}
                          style={{
                            left: left + (moving ? dragDx : 0),
                            width: Math.max(w - 4, 12),
                            top: 4 + (off.length ? 18 : 0) + i * LINE_H,
                            height: LINE_H - 6,
                          }}
                        >
                          {line.task.title}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        <aside className="w-60 shrink-0 border-l border-border p-3" data-testid="timeline-sidebar">
          <SidebarSection
            testId="timeline-unscheduled"
            title={t('list.timeline.unscheduled')}
            empty={t('list.timeline.noneUnscheduled')}
            tasks={unscheduled}
            onOpenTask={onOpenTask}
          />
          <SidebarSection
            testId="timeline-overdue"
            title={t('list.timeline.overdue')}
            empty={t('list.timeline.noneOverdue')}
            tasks={overdue}
            onOpenTask={onOpenTask}
          />
          <p className="mt-3 text-[11px] text-muted-foreground">{t('list.timeline.dropHint')}</p>
        </aside>
      </div>
    </Card>
  )
}

function SidebarSection({
  testId,
  title,
  empty,
  tasks,
  onOpenTask,
}: {
  testId: string
  title: string
  empty: string
  tasks: TimelineTask[]
  onOpenTask: (id: string) => void
}) {
  return (
    <section className="mb-4" data-testid={testId} data-count={tasks.length}>
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title} <span className="tabular-nums">{tasks.length}</span>
      </h4>
      {tasks.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {tasks.map((task) => (
            <li
              key={task.id}
              draggable
              data-testid={`${testId}-item`}
              data-task-id={task.id}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', task.id)
              }}
              className="cursor-grab truncate rounded border border-border bg-background px-2 py-1 text-xs hover:bg-muted"
            >
              <button type="button" className="w-full truncate text-left" onClick={() => onOpenTask(task.id)}>
                {task.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

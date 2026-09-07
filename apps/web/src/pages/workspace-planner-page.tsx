import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, cn, toast } from '@rundesk/ui'
import { ChevronLeft, ChevronRight, Flag, Search, Settings2 } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import { useAuthStore } from '../store/auth'

/**
 * §V2-02 — the Planner, frame `13:08`.
 *
 * `[12:40]` "Planner ka matlab — woh basically Google Calendar [jaisa] hai."
 * The route is `/calendar` while the rail is headed "Planner", which is what
 * the video shows: the address bar reads `.../calendar` and the tab title
 * reads "Planner | Leo". The noun is Planner; the thing is a calendar.
 *
 * What the frame carries, and what is here:
 *   · `‹ ›` and the month, with `Week ▾` and a gear on the right
 *   · a header row of days with TODAY'S NUMBER IN A FILLED PILL
 *   · an "All day" row above the hour gutter
 *   · a red now-line with the time in a pill in the gutter
 *   · weekend columns dimmed
 *   · a left rail: Priorities · Meet with · Assigned to me · Today & overdue ·
 *     Backlog
 *
 * The now-line is the one thing here that must not be computed once. A
 * calendar whose "now" was fixed at mount is wrong within the minute, and
 * wrong in a way that looks like the page is stale rather than broken.
 */

type Block = {
  id: string
  taskId: string | null
  label: string | null
  startsAt: string
  endsAt: string
  isAllDay: boolean
  taskStatus?: string | null
  taskPriority?: string | null
}

type PlannerSettings = {
  showWeekends?: boolean
  defaultDurationMinutes?: number
  blockPrefix?: string
}

type PriorityRow = { id: string; taskId: string | null; title: string; doneAt: string | null }
type TaskRow = { id: string; title: string; dueDate?: string | null }

/** The gutter runs the working day and a margin either side of it. */
const FIRST_HOUR = 6
const LAST_HOUR = 23
const HOUR_PX = 48

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

/** Monday-first, because `users.weekStart` defaults there for most teams and
 *  the frame shows `Mon 3` in the first column. */
function startOfWeek(d: Date, weekStartsOn: number) {
  const out = startOfDay(d)
  const diff = (out.getDay() - weekStartsOn + 7) % 7
  out.setDate(out.getDate() - diff)
  return out
}

const addDays = (d: Date, n: number) => {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

export function PlannerPage() {
  const { t, locale } = useTranslation()
  const { workspaceId } = useParams({ strict: false }) as { workspaceId: string }
  const currentUserId = useAuthStore((s) => s.user?.id) ?? ''

  /*
   * `now` ticks. Everything else on this page can be computed once; this
   * cannot, because it is the only thing on screen that is a claim about the
   * present moment. A minute is the resolution the red line is drawn at, so a
   * minute is how often it needs to move.
   */
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const [anchor, setAnchor] = useState(() => new Date())

  const { data: settings } = useQuery({
    queryKey: ['planner-settings', workspaceId],
    queryFn: () => api<PlannerSettings>(`/planner/${workspaceId}/settings`),
    enabled: !!workspaceId,
  })
  const showWeekends = settings?.showWeekends !== false

  const weekStart = useMemo(() => startOfWeek(anchor, 1), [anchor])
  const days = useMemo(() => {
    const all = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
    // Frame `13:08` shows Sat and Sun dimmed rather than absent; hiding them is
    // the setting, dimming them is the default.
    return showWeekends ? all : all.filter((d) => d.getDay() !== 0 && d.getDay() !== 6)
  }, [weekStart, showWeekends])

  const rangeFrom = weekStart
  const rangeTo = addDays(weekStart, 7)

  const { data: blocks = [] } = useQuery({
    queryKey: ['planner-blocks', workspaceId, rangeFrom.toISOString()],
    queryFn: () =>
      api<Block[]>(
        `/planner/${workspaceId}/blocks?from=${rangeFrom.toISOString()}&to=${rangeTo.toISOString()}`,
      ),
    enabled: !!workspaceId,
  })

  const { data: priorities = [] } = useQuery({
    queryKey: ['planner-priorities', workspaceId, currentUserId],
    queryFn: () => api<PriorityRow[]>(`/workspaces/${workspaceId}/people/${currentUserId}/priorities`),
    enabled: !!workspaceId && !!currentUserId,
  })

  /*
   * The Backlog rail: things assigned to me that are not on the grid yet.
   * Frame `13:08` shows the unscheduled task `dbgdh` sitting there, which is
   * what makes the drag in `[14:52]` have somewhere to start from.
   */
  const { data: assigned = [] } = useQuery({
    queryKey: ['planner-assigned', workspaceId, currentUserId],
    queryFn: () => api<TaskRow[]>(`/tasks/workspace/${workspaceId}/member/${currentUserId}`),
    enabled: !!workspaceId && !!currentUserId,
  })
  const scheduledTaskIds = useMemo(
    () => new Set(blocks.map((b) => b.taskId).filter(Boolean) as string[]),
    [blocks],
  )
  const backlog = useMemo(
    () => assigned.filter((task) => !scheduledTaskIds.has(task.id)).slice(0, 25),
    [assigned, scheduledTaskIds],
  )

  const qc = useQueryClient()

  /*
   * §V2-02 frame `14:45` — dragging task `dbgdh` on makes a block called
   * "Work on dbgdh". The prefix is applied at RENDER, not stored: the label
   * already resolves from the task server-side, and baking "Work on" into the
   * row would freeze both the prefix and the task's name at the moment of the
   * drag. Changing the prefix in settings then re-titles every block, which is
   * what a setting should do.
   */
  const prefix = settings?.blockPrefix ?? t('planner.workOn')
  const blockLabel = (b: Block) => (b.taskId && b.label ? `${prefix} ${b.label}` : b.label ?? '')

  /** Which task is currently under the pointer, mid-drag. */
  const [dragging, setDragging] = useState<{ taskId: string; title: string } | null>(null)
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null)

  const createBlock = useMutation({
    mutationFn: (body: { taskId: string; startsAt: string }) =>
      api(`/planner/${workspaceId}/blocks`, { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['planner-blocks', workspaceId] }),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('planner.blockFailed')),
  })

  /*
   * A drag that ends anywhere but a day column has to end. Without this the
   * ghost follows the pointer forever and the next click drops a block
   * somewhere nobody meant.
   */
  useEffect(() => {
    if (!dragging) return
    const move = (e: PointerEvent) => setGhost({ x: e.clientX, y: e.clientY })
    const cancel = () => { setDragging(null); setGhost(null) }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', cancel)
    return () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', cancel)
    }
  }, [dragging])

  /**
   * Where a drop landed, in time. Rounded to the quarter hour, because a
   * calendar that starts a block at 10:07 is recording pointer precision
   * rather than intent.
   */
  const dropTime = (day: Date, offsetY: number) => {
    const hoursIn = offsetY / HOUR_PX + FIRST_HOUR
    const quarter = Math.round(hoursIn * 4) / 4
    const clamped = Math.min(Math.max(quarter, FIRST_HOUR), LAST_HOUR)
    const out = new Date(day)
    out.setHours(Math.floor(clamped), Math.round((clamped % 1) * 60), 0, 0)
    return out
  }

  const onDropInColumn = (day: Date, e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    const rect = e.currentTarget.getBoundingClientRect()
    const startsAt = dropTime(day, e.clientY - rect.top)
    createBlock.mutate({ taskId: dragging.taskId, startsAt: startsAt.toISOString() })
    setDragging(null)
    setGhost(null)
  }

  /*
   * `[16:09]` "is task ka itna time bach gaya" — the tab header of frame
   * `14:45` reads "Work on dbgdh · 2h 55m left". The block being worked on
   * RIGHT NOW, and how much of it is left.
   */
  const current = blocks.find(
    (b) => !b.isAllDay && new Date(b.startsAt) <= now && new Date(b.endsAt) > now,
  )
  const minutesLeft = current
    ? Math.max(0, Math.round((new Date(current.endsAt).getTime() - now.getTime()) / 60_000))
    : null

  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(weekStart)
  const dayName = (d: Date) => new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d)

  const hours = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => FIRST_HOUR + i)
  const gridHeight = hours.length * HOUR_PX

  /** Where the red line sits, or null when now is outside the drawn hours. */
  const nowOffset = useMemo(() => {
    const h = now.getHours() + now.getMinutes() / 60
    if (h < FIRST_HOUR || h > LAST_HOUR + 1) return null
    return (h - FIRST_HOUR) * HOUR_PX
  }, [now])
  const nowColumn = days.findIndex((d) => sameDay(d, now))

  const allDay = blocks.filter((b) => b.isAllDay)
  const timed = blocks.filter((b) => !b.isAllDay)

  return (
    <div className="flex h-full min-h-0" data-testid="planner-page">
      {/* What is being dragged, under the pointer. A drag with no feedback is
          a drag people do not believe is happening. */}
      {dragging && ghost && (
        <div
          data-testid="planner-drag-ghost"
          className="pointer-events-none fixed z-50 rounded border border-accent/50 bg-accent/20 px-2 py-1 text-[11px] text-accent shadow"
          style={{ left: ghost.x + 12, top: ghost.y + 12 }}
        >
          {prefix} {dragging.title}
        </div>
      )}
      {/* ── the rail, frame 13:08 ─────────────────────────────────────── */}
      <aside className="w-64 shrink-0 border-r border-border/60 overflow-y-auto p-3 space-y-4">
        <h1 className="text-[13px] font-semibold">{t('planner.title')}</h1>

        <section data-testid="planner-priorities">
          <h2 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t('planner.priorities')}
          </h2>
          {priorities.filter((p) => !p.doneAt).length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/70 p-4 text-center">
              <Flag className="mx-auto mb-1.5 h-4 w-4 text-muted-foreground" aria-hidden />
              <p className="text-[11px] text-muted-foreground">{t('planner.prioritiesEmpty')}</p>
            </div>
          ) : (
            <ul className="space-y-1">
              {priorities.filter((p) => !p.doneAt).map((p) => (
                <li key={p.id} className="truncate rounded px-2 py-1 text-[12px] hover:bg-muted/40">
                  {p.title}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t('planner.meetWith')}
          </h2>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              placeholder={t('planner.searchPeople')}
              aria-label={t('planner.searchPeople')}
              data-testid="planner-meet-with"
              className="h-8 w-full rounded-md border border-border/80 bg-card pl-7 pr-2 text-[12px]"
            />
          </div>
        </section>

        <section data-testid="planner-backlog">
          <h2 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t('planner.backlog')}
          </h2>
          {backlog.length === 0 ? (
            <p className="px-1 text-[11px] text-muted-foreground">{t('planner.backlogEmpty')}</p>
          ) : (
            <ul className="space-y-1">
              {backlog.map((task) => (
                <li
                  key={task.id}
                  data-testid="planner-backlog-item"
                  data-task-id={task.id}
                  // Pointer events rather than HTML5 drag-and-drop: the drop
                  // target needs the pointer's Y to work out what o'clock the
                  // person meant, and a dragover event does not carry it as
                  // reliably across browsers.
                  onPointerDown={(e) => {
                    e.preventDefault()
                    setDragging({ taskId: task.id, title: task.title })
                    setGhost({ x: e.clientX, y: e.clientY })
                  }}
                  className="cursor-grab truncate rounded px-2 py-1 text-[12px] hover:bg-muted/40 active:cursor-grabbing"
                >
                  {task.title}
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>

      {/* ── the grid ──────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
          <button
            type="button"
            aria-label={t('planner.previousWeek')}
            data-testid="planner-prev"
            onClick={() => setAnchor((d) => addDays(d, -7))}
            className="rounded p-1 hover:bg-muted/60"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={t('planner.nextWeek')}
            data-testid="planner-next"
            onClick={() => setAnchor((d) => addDays(d, 7))}
            className="rounded p-1 hover:bg-muted/60"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="text-[13px] font-medium" data-testid="planner-month">{monthLabel}</span>
          <Button
            size="sm"
            variant="outline"
            className="ml-2 h-7 text-[12px]"
            data-testid="planner-today"
            onClick={() => setAnchor(new Date())}
          >
            {t('planner.today')}
          </Button>
          {/*
            `[16:09]` "is task ka itna time bach gaya" — frame 14:45's header
            reads "Work on dbgdh · 2h 55m left". Only while something is
            actually running; a countdown with nothing to count down is noise.
          */}
          {current && minutesLeft !== null && (
            <span className="ml-3 truncate text-[12px] text-muted-foreground" data-testid="planner-time-left">
              {blockLabel(current)} ·{' '}
              {t('planner.timeLeft', {
                time:
                  minutesLeft >= 60
                    ? `${Math.floor(minutesLeft / 60)}h ${minutesLeft % 60}m`
                    : `${minutesLeft}m`,
              })}
            </span>
          )}
          <span className="flex-1" />
          <Button size="sm" variant="outline" className="h-7 text-[12px]" data-testid="planner-settings">
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto">
          {/* Day header. Today's number sits in a filled pill, as in the frame. */}
          <div
            className="sticky top-0 z-10 grid border-b border-border/60 bg-background"
            style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}
          >
            <div className="px-1 py-2 text-[10px] text-muted-foreground">{t('planner.allDay')}</div>
            {days.map((d) => {
              const isToday = sameDay(d, now)
              const isWeekend = d.getDay() === 0 || d.getDay() === 6
              return (
                <div
                  key={d.toISOString()}
                  data-testid="planner-day-header"
                  data-today={isToday ? 'true' : 'false'}
                  className={cn('px-2 py-1.5 text-center', isWeekend && 'bg-muted/20')}
                >
                  <div className="text-[10px] uppercase text-muted-foreground">{dayName(d)}</div>
                  <div
                    className={cn(
                      'mx-auto mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-[12px]',
                      isToday && 'bg-accent font-semibold text-accent-foreground',
                    )}
                  >
                    {d.getDate()}
                  </div>
                </div>
              )
            })}
          </div>

          {/* The all-day row of frame 13:08, above the gutter. */}
          <div
            className="grid border-b border-border/60"
            style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}
            data-testid="planner-allday-row"
          >
            <div />
            {days.map((d) => (
              <div key={d.toISOString()} className="min-h-[28px] border-l border-border/40 p-1">
                {allDay
                  .filter((b) => sameDay(new Date(b.startsAt), d))
                  .map((b) => (
                    <div
                      key={b.id}
                      data-testid="planner-block"
                      className="truncate rounded bg-accent/15 px-1.5 py-0.5 text-[11px] text-accent"
                    >
                      {blockLabel(b)}
                    </div>
                  ))}
              </div>
            ))}
          </div>

          <div
            className="relative grid"
            style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))`, height: gridHeight }}
          >
            {/* The hour gutter. */}
            <div className="relative">
              {hours.map((h, i) => (
                <div
                  key={h}
                  className="absolute right-1 -translate-y-1/2 text-[10px] text-muted-foreground"
                  style={{ top: i * HOUR_PX }}
                >
                  {new Intl.DateTimeFormat(locale, { hour: 'numeric' }).format(new Date(2026, 0, 1, h))}
                </div>
              ))}
              {nowOffset !== null && (
                <div
                  className="absolute right-1 -translate-y-1/2 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-medium text-white"
                  style={{ top: nowOffset }}
                  data-testid="planner-now-pill"
                >
                  {new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(now)}
                </div>
              )}
            </div>

            {days.map((d, col) => {
              const isWeekend = d.getDay() === 0 || d.getDay() === 6
              return (
                <div
                  key={d.toISOString()}
                  data-testid="planner-day-column"
                  data-day={d.toISOString().slice(0, 10)}
                  data-weekend={isWeekend ? 'true' : 'false'}
                  onPointerUp={(e) => onDropInColumn(d, e)}
                  className={cn(
                    'relative border-l border-border/40',
                    isWeekend && 'bg-muted/20',
                    dragging && 'bg-accent/5',
                  )}
                >
                  {hours.map((h, i) => (
                    <div
                      key={h}
                      className="absolute inset-x-0 border-t border-border/25"
                      style={{ top: i * HOUR_PX, height: HOUR_PX }}
                    />
                  ))}
                  {timed
                    .filter((b) => sameDay(new Date(b.startsAt), d))
                    .map((b) => {
                      const s = new Date(b.startsAt)
                      const e = new Date(b.endsAt)
                      const top = (s.getHours() + s.getMinutes() / 60 - FIRST_HOUR) * HOUR_PX
                      const height = Math.max(18, ((e.getTime() - s.getTime()) / 3_600_000) * HOUR_PX)
                      return (
                        <div
                          key={b.id}
                          data-testid="planner-block"
                          data-block-id={b.id}
                          className="absolute inset-x-1 overflow-hidden rounded border border-accent/40 bg-accent/15 px-1.5 py-0.5 text-[11px] text-accent"
                          style={{ top, height }}
                        >
                          {blockLabel(b)}
                        </div>
                      )
                    })}
                  {/* The red now-line, on today's column only. */}
                  {nowOffset !== null && col === nowColumn && (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-red-500"
                      style={{ top: nowOffset }}
                      data-testid="planner-now-line"
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

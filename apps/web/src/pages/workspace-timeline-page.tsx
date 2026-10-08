import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, EmptyState, Badge, cn, toast } from '@rundesk/ui'
import {
  GanttChart,
  Diamond,
  PanelLeftClose,
  PanelLeftOpen,
  CalendarDays,
  Maximize2,
  Download,
  ChevronDown,
  ChevronRight,
  CalendarRange,
} from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useTranslation, type TranslationKey } from '../lib/i18n'
import { carriesTime, dayAsDateOnly, shiftByDays, shownDay, toDateInput } from '../lib/task-dates'
import { GANTT_DRAG_THRESHOLD } from '../lib/gantt'
import { cellStride, chartDayPx, useDrawnDays, type DrawnDays } from '../lib/drawn-days'
import { InlineSkeleton } from '../components/loading-skeletons'

type TimelineTask = {
  id: string
  title: string
  startDate: string | null
  dueDate: string | null
  /** Whether each date carries a time of day (`found-6-oct/a-time-on-utc-midnight-reads-as-no-time`). */
  startDateHasTime?: boolean
  dueDateHasTime?: boolean
  status: string
  priority: string
  isMilestone?: boolean
  listId: string
  listName: string
  projectId: string
  projectName: string
  spaceId: string
  spaceName: string
  /**
   * May this reader change the task — the write rule's answer, task share
   * first (`TasksService.timelineEditable`); absent from an API that does not
   * say, which offers the drag as it always did.
   */
  mayEdit?: boolean
}

type Zoom = 'day' | 'week' | 'month'

/** What a drag changes: only the dates it moved, each with whether it carries a time. */
type DatePatch = {
  startDate?: string | null
  dueDate?: string | null
  startDateHasTime?: boolean
  dueDateHasTime?: boolean
}

const DAY_PX: Record<Zoom, number> = { day: 56, week: 28, month: 14 }
const TASK_COL_WIDTH = 260
/** The narrowest a header cell is drawn: narrower units share a cell (`cellStride`). */
const MIN_CELL_PX = 24

/** Header geometry. The week band (§S07-S12 frame `09:44`) sits ABOVE the date
 *  row, so turning week numbers on makes the header taller — that is why both
 *  panes read their header height from here rather than hardcoding 38. */
const DATE_ROW_H = 38
const WEEK_ROW_H = 22
const GROUP_ROW_H = 32
const TASK_ROW_H = 48

/** How tall the chart is allowed to get before its rows scroll under the date
 *  header instead of running down the page. Both panes share it so their rows
 *  stay level; see the comment on the chart pane for why it has to be bounded
 *  at all. */
const PANE_MAX_H = '70vh'

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

/*
 * §S07-S12 — WEEK NUMBERS ARE THIS VIEW'S OWN PREFERENCE, DELIBERATELY.
 *
 * `packages/db/src/schema/time-blocks.ts` already declares a `showWeekNumbers`
 * column for the PLANNER. At the time this was written nothing read it — the
 * mirror of a facade: a stored value no reader honours. The fix for that column
 * belongs to the planner and to whoever owns that schema; adding a *second*
 * instance of the same idea here would turn one unread setting into two, and
 * the duplicated-list defect is the one this audit keeps finding.
 *
 * So the timeline's week-number toggle is local on purpose: per-viewer, in
 * `localStorage`, read by exactly one reader — the header band below. No
 * column, no endpoint, nothing for a second reader to drift from.
 */
const LS_WEEK_NUMBERS = 'rundesk.timeline.showWeekNumbers'
const LS_PANEL_COLLAPSED = 'rundesk.timeline.taskPanelCollapsed'

/** Title-case a raw enum value as a last-resort header for unexpected values. */
function humanize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : '—'
}

/** localStorage is a per-viewer convenience and is allowed to be unavailable. */
function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}
function writeFlag(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, value ? '1' : '0')
  } catch {
    /* private window, blocked site data — the view still works */
  }
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** `2026-03-02`, in the viewer's own timezone, matching what the axis draws. */
function localIsoDate(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** ISO-8601 week number — the `W32` the frame draws at `09:44`. */
function isoWeekNumber(ms: number): number {
  const d = new Date(ms)
  const t = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  const probe = new Date(t)
  // Thursday of this week decides which year (and therefore which week) it is.
  const weekday = probe.getUTCDay() || 7
  probe.setUTCDate(probe.getUTCDate() + 4 - weekday)
  const yearStart = Date.UTC(probe.getUTCFullYear(), 0, 1)
  return Math.ceil(((probe.getTime() - yearStart) / 86400_000 + 1) / 7)
}

/** `n` calendar days after the local midnight of `ms` — DST-safe, unlike
 *  `ms + n * 86400_000`, which drifts an hour across a clock change. */
function addDays(ms: number, n: number): number {
  const d = new Date(startOfDay(ms))
  d.setDate(d.getDate() + n)
  return d.getTime()
}

/** Midnight on the Monday on or before `ms`, in local time. */
function mondayOf(ms: number): number {
  const d = new Date(startOfDay(ms))
  const weekday = d.getDay() || 7
  d.setDate(d.getDate() - (weekday - 1))
  return startOfDay(d.getTime())
}

/** Local midnight on the first of a month, in any year: `new Date(y, m, 1)` reads a year below 100 as 19xx. */
function monthStart(year: number, month: number): number {
  const d = new Date(0)
  d.setFullYear(year, month, 1)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * One CSV cell.
 *
 * A cell beginning `=`, `+`, `-` or `@` is a FORMULA to Excel, LibreOffice and
 * Sheets — the same hole `test/e2e/list-export.mjs` exists to keep shut on the
 * server side. This export is built in the browser, so it has to close it here
 * too rather than inherit the server's care.
 */
function csvCell(value: string | null | undefined): string {
  const s = value == null ? '' : String(value)
  const guarded = /^[=+\-@]/.test(s) ? `'${s}` : s
  return `"${guarded.replace(/"/g, '""')}"`
}

/**
 * The days a bar is drawn from and to: each date on the day it is SHOWN as
 * (`shownDay`, `lib/task-dates.ts`), so a date-only day is that day in any zone.
 * This drew `startOfDay` of the instant, the local day of a UTC midnight, and
 * west of UTC every date-only bar sat a day early
 * (`found-5-oct/timeline-press-moves-dates`).
 */
function barSpan(task: TimelineTask): { from: Date; to: Date } {
  const from = shownDay(task.startDate, task.startDateHasTime) ?? shownDay(task.dueDate, task.dueDateHasTime)!
  const to = shownDay(task.dueDate, task.dueDateHasTime) ?? shownDay(task.startDate, task.startDateHasTime)!
  return { from, to }
}

/** Inclusive day span of a bar, the number the Gantt actually draws. */
function barDays(task: TimelineTask): number {
  const { from, to } = barSpan(task)
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400_000) + 1)
}

export function TimelinePage() {
  const { t } = useTranslation()
  const { workspaceId } = useParams({ from: '/app/$workspaceId/timeline' })
  const qc = useQueryClient()
  const [zoom, setZoom] = useState<Zoom>('week')
  const [localPatches, setLocalPatches] = useState<Record<string, DatePatch>>({})
  const [projectFilter, setProjectFilter] = useState<string>('all')
  const [groupMode, setGroupMode] = useState<GroupMode>('project')
  // §S07-S12 frame `09:44` — `Auto fit`. `null` means "use the zoom's px/day";
  // a number is the px/day that makes the whole task span fit the viewport.
  const [fitDayPx, setFitDayPx] = useState<number | null>(null)
  const [showWeekNumbers, setShowWeekNumbers] = useState<boolean>(() => readFlag(LS_WEEK_NUMBERS))
  const [panelCollapsed, setPanelCollapsed] = useState<boolean>(() => readFlag(LS_PANEL_COLLAPSED))
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  // §S07-S12 frame `09:44` — `Today`. The flag widens the range to reach today;
  // the stamp is what makes a second press scroll again. See `goToToday`.
  const [anchorToday, setAnchorToday] = useState(false)
  const [todayStamp, setTodayStamp] = useState(0)
  const handledTodayStamp = useRef(0)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  const tasksQuery = useQuery({
    queryKey: ['timeline', workspaceId],
    queryFn: () => api<TimelineTask[]>(`/tasks/workspace/${workspaceId}/timeline`),
  })
  /*
   * A DRAG'S CHANGE, AND THE SERVER'S WORDS WHEN IT IS REFUSED
   * (`found-30-sep/timeline-drags-refused-silently`). This had a refetch and no
   * `onError`, and its caller dropped the rejection, so a refused drag put the
   * bar back — or, for a task binned meanwhile, took it away — without a word:
   * the reason reached only the console. It is said now in the server's words,
   * as the list page says a refused row edit (`patchTaskSaying`); the rows are
   * read again either way, and only then is the bar's own patch dropped.
   */
  const persistDates = useMutation({
    mutationFn: ({ taskId, patch }: { taskId: string; patch: DatePatch }) =>
      api(`/tasks/${taskId}`, { method: 'PATCH', body: patch }),
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : t('taskDetail.couldNotUpdateTask'))
    },
    onSettled: async (_data, _err, { taskId }) => {
      await qc.invalidateQueries({ queryKey: ['timeline', workspaceId] })
      setLocalPatches((prev) => {
        const copy = { ...prev }
        delete copy[taskId]
        return copy
      })
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

  const { startMs, days } = useMemo(() => {
    if (tasks.length === 0) {
      const now = Date.now()
      return { startMs: startOfDay(now), days: 30 }
    }
    const allDates: number[] = []
    for (const t of tasks) {
      const { from, to } = barSpan(t)
      allDates.push(from.getTime(), to.getTime())
    }
    /*
     * WHAT `Today` DOES WHEN TODAY IS NOWHERE ON THE CHART.
     *
     * The plotted range is derived from the tasks, so a project that finished
     * in June does not include a day in September — the today line is not drawn
     * at all, and "scroll to today" has nothing to scroll to. A button that
     * silently did nothing in that case would be the dead control this audit
     * keeps finding, and disabling it would just move the dead end.
     *
     * So pressing `Today` first makes today part of the range, and only then
     * scrolls. It is opt-in rather than always-on because always-on would drag
     * every chart out to today — a three-week project six months old would
     * render as six months of empty grid, which is worse than the problem.
     */
    if (anchorToday) allDates.push(startOfDay(Date.now()))
    const min = Math.min(...allDates)
    const max = Math.max(...allDates)
    const startMs = startOfDay(min - 3 * 86400_000)
    const endMs = startOfDay(max + 3 * 86400_000)
    const days = Math.max(14, Math.ceil((endMs - startMs) / 86400_000))
    return { startMs, days }
  }, [tasks, anchorToday])

  /*
   * AUTO FIT IS A px-PER-DAY, NOT A ZOOM PRESET.
   *
   * The date range already covers every task — what "Auto fit" changes is how
   * much of that range is ON SCREEN. At `week` (28px/day) a four-month project
   * is ~3300px wide in a ~1200px viewport, so two thirds of it is behind a
   * scrollbar. Fitting divides the viewport by the span, so the last bar's
   * right edge lands inside the viewport instead of past it.
   *
   * A zoom's width is narrowed for a span too long to lay out at it
   * (`chartDayPx`): a task in year 202 made the Day zoom 37 million px wide.
   */
  const dayPx = fitDayPx ?? chartDayPx(DAY_PX[zoom], days)
  const todayOffsetPx = ((startOfDay(Date.now()) - startMs) / 86400_000) * dayPx
  const totalWidth = days * dayPx
  const headerH = showWeekNumbers ? WEEK_ROW_H + DATE_ROW_H : DATE_ROW_H

  /** Any change to WHAT is plotted invalidates a fit computed for the old span. */
  const clearFit = useCallback(() => setFitDayPx(null), [])

  const autoFit = useCallback(() => {
    const el = viewportRef.current
    if (!el) return
    const width = el.clientWidth
    if (!(width > 0) || !(days > 0)) return
    setFitDayPx(width / days)
  }, [days])

  /*
   * A STAMP, NOT A FLAG.
   *
   * `anchorToday` is already true the second time `Today` is pressed, so an
   * effect keyed on it would not re-run and the button would be dead from the
   * second press onward — working once is how this kind of control passes
   * review. The counter changes on every press, so the scroll happens on every
   * press.
   */
  const goToToday = useCallback(() => {
    setAnchorToday(true)
    setTodayStamp((n) => n + 1)
  }, [])

  /*
   * Layout effect, not a plain effect: both state changes above land in one
   * render, so by the time this runs the range already includes today and the
   * chart is already its new width. Scrolling before paint means no visible
   * jump from the old offset to the new one.
   */
  useLayoutEffect(() => {
    if (todayStamp === handledTodayStamp.current) return
    handledTodayStamp.current = todayStamp
    const el = viewportRef.current
    if (!el) return
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth)
    // Centre today where there is room, and settle for "on screen" at the ends.
    el.scrollLeft = Math.max(0, Math.min(todayOffsetPx - el.clientWidth / 2, maxScroll))
  }, [todayStamp, todayOffsetPx])

  /*
   * The two panes scroll vertically as one.
   *
   * They are separate scrollports on purpose (see the header comment on the
   * chart pane), which means nothing keeps their rows lined up unless this
   * does. The equality guard is what stops the echo: assigning `scrollTop`
   * fires a scroll event on the other pane, whose handler finds the two already
   * equal and returns, so there is no ping-pong and no need for a lock.
   */
  const syncPaneScroll = useCallback((from: 'panel' | 'chart') => {
    const source = from === 'panel' ? panelRef.current : viewportRef.current
    const target = from === 'panel' ? viewportRef.current : panelRef.current
    if (!source || !target || source.scrollTop === target.scrollTop) return
    target.scrollTop = source.scrollTop
  }, [])

  const toggleWeekNumbers = useCallback(() => {
    setShowWeekNumbers((prev) => {
      writeFlag(LS_WEEK_NUMBERS, !prev)
      return !prev
    })
  }, [])

  const togglePanel = useCallback(() => {
    setPanelCollapsed((prev) => {
      writeFlag(LS_PANEL_COLLAPSED, !prev)
      return !prev
    })
  }, [])

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

  /** The rows actually on screen — what a collapsed group takes out, and what
   *  the export writes. One source, so the file cannot disagree with the view. */
  const visibleGroups = useMemo(
    () =>
      groups.map((g) => ({
        ...g,
        collapsed: g.title != null && collapsedGroups[g.key] === true,
        rows: g.title != null && collapsedGroups[g.key] === true ? [] : g.rows,
      })),
    [groups, collapsedGroups],
  )

  /*
   * LOCAL EXPORT — the file is written here, in the browser, from the rows on
   * screen. No endpoint, no admin guard (the server's whole-workspace CSV is
   * behind `WorkspaceAdminGuard`, which the person looking at the timeline
   * usually is not), and no network at all.
   *
   * It writes the VISIBLE rows: the project filter, the grouping and any
   * collapsed group all reach the file, because the rows come from the same
   * `visibleGroups` the chart renders. An export that always emitted the same
   * bytes would be the facade this row is looking for.
   */
  const exportCsv = useCallback(() => {
    const rows = visibleGroups.flatMap((g) => g.rows)
    const header = ['Task', 'Group', 'Status', 'Priority', 'Start date', 'Due date', 'Days', 'List', 'Project', 'Space']
    const lines = [header.map(csvCell).join(',')]
    for (const g of visibleGroups) {
      for (const task of g.rows) {
        lines.push(
          [
            csvCell(task.title),
            csvCell(g.title ?? ''),
            csvCell(task.status),
            csvCell(task.priority),
            // The day each date is drawn on (`shownDay`), so the file says what the chart shows.
            csvCell(toDateInput(task.startDate, task.startDateHasTime)),
            csvCell(toDateInput(task.dueDate, task.dueDateHasTime)),
            csvCell(String(barDays(task))),
            csvCell(task.listName),
            csvCell(task.projectName),
            csvCell(task.spaceName),
          ].join(','),
        )
      }
    }
    const csv = `${lines.join('\r\n')}\r\n`
    const filename = `rundesk-timeline-${localIsoDate(Date.now())}.csv`
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.rel = 'noopener'
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    // Revoking immediately can cancel the download that was just started.
    window.setTimeout(() => URL.revokeObjectURL(url), 5_000)
    return rows.length
  }, [visibleGroups])

  const toolbarBtn =
    'inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border/60 bg-card/60 text-xs ' +
    'text-muted-foreground hover:text-foreground hover:bg-card/80 backdrop-blur-sm transition-colors ' +
    'focus:outline-none focus:ring-2 focus:ring-brand-500/40'
  const toolbarBtnOn = 'border-brand-500/60 bg-brand-gradient text-white hover:text-white'

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
            data-testid="timeline-group-mode"
            value={groupMode}
            onChange={(e) => {
              clearFit()
              setGroupMode(e.target.value as GroupMode)
            }}
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
              data-testid="timeline-project-filter"
              value={projectFilter}
              onChange={(e) => {
                clearFit()
                setProjectFilter(e.target.value)
              }}
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
                data-testid={`timeline-zoom-${z}`}
                onClick={() => {
                  clearFit()
                  setZoom(z)
                }}
                className={cn(
                  'text-xs px-3 py-1.5 rounded-md transition-all capitalize font-medium',
                  zoom === z && fitDayPx == null
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
          <InlineSkeleton />
        </Card>
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={<GanttChart className="h-6 w-6" />}
          title={t('timeline.emptyTitle')}
          description={t('timeline.emptyDesc')}
        />
      ) : (
        <>
          {/* §S07-S12 frame `09:44` — the Gantt toolbar, in the frame's order:
              panel toggle · (zoom lives with the other view controls above) ·
              Auto fit · Export. Week numbers is the switch behind the `W32` the
              frame draws in the header band. */}
          <div data-testid="timeline-toolbar" className="flex items-center gap-2">
            <button
              type="button"
              data-testid="timeline-panel-toggle"
              aria-pressed={panelCollapsed}
              onClick={togglePanel}
              className={cn(toolbarBtn, panelCollapsed && toolbarBtnOn)}
              title={t('timeline.togglePanel')}
              aria-label={t('timeline.togglePanel')}
            >
              {panelCollapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{t('timeline.togglePanel')}</span>
            </button>
            <button
              type="button"
              data-testid="timeline-today"
              onClick={goToToday}
              className={toolbarBtn}
              title={t('timeline.todayHint')}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              {t('timeline.today')}
            </button>
            <button
              type="button"
              data-testid="timeline-week-numbers"
              aria-pressed={showWeekNumbers}
              data-on={showWeekNumbers ? 'true' : 'false'}
              onClick={toggleWeekNumbers}
              className={cn(toolbarBtn, showWeekNumbers && toolbarBtnOn)}
              title={t('timeline.weekNumbers')}
            >
              <CalendarRange className="h-3.5 w-3.5" />
              {t('timeline.weekNumbers')}
            </button>
            <button
              type="button"
              data-testid="timeline-autofit"
              data-fit={fitDayPx == null ? 'off' : 'on'}
              onClick={autoFit}
              className={cn(toolbarBtn, fitDayPx != null && toolbarBtnOn)}
              title={t('timeline.autoFitHint')}
            >
              <Maximize2 className="h-3.5 w-3.5" />
              {t('timeline.autoFit')}
            </button>
            <button
              type="button"
              data-testid="timeline-export"
              onClick={() => void exportCsv()}
              className={toolbarBtn}
              title={t('timeline.exportCsv')}
            >
              <Download className="h-3.5 w-3.5" />
              {t('timeline.exportCsv')}
            </button>
          </div>

          {/*
            `overflow-clip`, DELIBERATELY, AND NOT `overflow-hidden`.
            ────────────────────────────────────────────────────────────────
            Both clip to the rounded corner. Only one of them invents a scroll
            container: `overflow: hidden` IS a scrollport — it just never
            scrolls — and `position: sticky` resolves against the nearest
            scrollport, so a sticky header under an `overflow-hidden` ancestor
            sticks to a box that cannot move. That is the bug this replaces:
            both headers below were declared sticky and neither stuck.

            `overflow: clip` clips without becoming a scrollport, so it cannot
            swallow a descendant's stickiness. Note this class is doing real
            work even though `Card variant="glass"` looks like it already
            clips: `.card-glass` itself carries `@apply overflow-hidden`
            (`packages/ui/src/styles.css`), and this utility overrides it
            because Tailwind emits utilities after components. Removing it does
            not remove the clip, it restores the broken one.

            The headers do NOT resolve against this element, though — each pane
            below is its own bounded scrollport, which is what actually makes
            them stick. That is on purpose: `packages/ui` is not ours, so the
            fix must not depend on what `.card-glass` does next week.
          */}
          <Card variant="glass" className="overflow-clip p-0">
            <div className="flex items-stretch">
              {/* ── Task panel (collapsible) ─────────────────────────────────
                  Width goes to 0, and because the chart beside it is the flex
                  child that grows, the grid takes the space back.

                  Scrolls vertically in lockstep with the chart (`syncPaneScroll`)
                  so its header has a scrollport of its own to stick to and the
                  rows stay level with their bars. */}
              <div
                ref={panelRef}
                data-testid="timeline-task-panel"
                data-collapsed={panelCollapsed ? 'true' : 'false'}
                style={{ width: panelCollapsed ? 0 : TASK_COL_WIDTH, maxHeight: PANE_MAX_H }}
                onScroll={() => syncPaneScroll('panel')}
                className={cn(
                  'shrink-0 overflow-y-auto overflow-x-hidden bg-card/60',
                  !panelCollapsed && 'border-r border-border/60',
                )}
              >
                {/*
                  Collapsed means GONE, not merely zero-width. An element with
                  an explicit width inside a clipped parent still reports a
                  260px box to `getBoundingClientRect`, so "the names are
                  hidden" proved that way would pass on a panel that never
                  collapsed. Not rendering them is the state, and counting them
                  is a check that can fail.
                */}
                {!panelCollapsed && (
                  <div
                    data-testid="timeline-panel-header"
                    className="sticky top-0 z-20 flex items-end border-b border-border/60 bg-card/95 px-4 pb-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground backdrop-blur-sm"
                    style={{ height: headerH }}
                  >
                    {t('timeline.taskColumn')}
                  </div>
                )}
                {!panelCollapsed && visibleGroups.map((group) => (
                  <div key={group.key}>
                    {group.title && (
                      <button
                        type="button"
                        data-testid="timeline-group-toggle"
                        data-group={group.key}
                        data-collapsed={group.collapsed ? 'true' : 'false'}
                        aria-expanded={!group.collapsed}
                        onClick={() =>
                          setCollapsedGroups((prev) => ({ ...prev, [group.key]: !prev[group.key] }))
                        }
                        className="flex w-full items-center gap-1 border-b border-border/30 bg-muted/40 px-3 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
                        style={{ height: GROUP_ROW_H }}
                      >
                        {group.collapsed ? (
                          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                        )}
                        <span className="truncate">{group.title}</span>
                      </button>
                    )}
                    {group.rows.map((task) => (
                      <div
                        key={task.id}
                        data-testid="timeline-task-name"
                        data-task-id={task.id}
                        className="flex flex-col justify-center border-b border-border/30 px-4"
                        style={{ height: TASK_ROW_H, width: TASK_COL_WIDTH }}
                      >
                        <div className="text-sm truncate text-foreground flex items-center gap-1.5">
                          {task.isMilestone && (
                            <Diamond className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" />
                          )}
                          <span className="truncate">{task.title}</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate flex items-center gap-1.5 mt-0.5">
                          <Badge
                            variant={task.priority as 'urgent' | 'high' | 'normal' | 'low'}
                            className="px-1.5 py-0 text-[9px] capitalize"
                          >
                            {PRIORITY_LABEL[task.priority] ? t(PRIORITY_LABEL[task.priority]) : task.priority}
                          </Badge>
                          <span>·</span>
                          <span className="truncate">{task.listName}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* ── Chart ──────────────────────────────────────────────────── */}
              {/*
                A BOUNDED SCROLLPORT, WHICH IS WHAT MAKES THE HEADER STICK.
                ──────────────────────────────────────────────────────────────
                This was `overflow-x-auto` with no height, and the date header
                inside it was `sticky top-0` and never stuck to anything. Two
                reasons, and fixing only one would not have helped:

                  · `overflow-x: auto` with `overflow-y: visible` computes the
                    y axis to `auto` as well, so this element was already the
                    nearest scrollport for its header — the page scroll could
                    never reach it. That is unavoidable: the header has to sit
                    inside the horizontal scroller to stay aligned with the
                    bars under it.
                  · and an unbounded element never scrolls vertically, so the
                    scrollport it offered had nothing to offer.

                Giving it a height makes the scrollport real: the rows scroll
                under a header that stays put, which is how the date axis stops
                being lost the moment a project has twenty tasks. The task
                panel is bounded to match and the two are kept level in
                `syncPaneScroll`.
              */}
              <div
                ref={viewportRef}
                data-testid="timeline-chart-viewport"
                style={{ maxHeight: PANE_MAX_H }}
                onScroll={() => syncPaneScroll('chart')}
                className="flex-1 min-w-0 overflow-auto"
              >
                <div className="relative" style={{ width: totalWidth, minWidth: '100%' }}>
                  <div
                    data-testid="timeline-chart-header"
                    className="sticky top-0 z-20 border-b border-border/60 bg-card/95 backdrop-blur-sm"
                    style={{ height: headerH }}
                  >
                    {/*
                      The measured span. `width` here is exactly `days × px/day`
                      — no `minWidth`, so what a suite measures off this element
                      is the rendered span and not the viewport stretching it.
                    */}
                    <div
                      data-testid="timeline-axis"
                      data-day-px={String(dayPx)}
                      data-zoom={zoom}
                      data-span-days={String(days)}
                      data-range-start={localIsoDate(startMs)}
                      data-range-end={localIsoDate(addDays(startMs, days - 1))}
                      data-fit={fitDayPx == null ? 'off' : 'on'}
                      data-anchor-today={anchorToday ? 'true' : 'false'}
                      className="relative h-full"
                      style={{ width: totalWidth }}
                    >
                      <AxisCells
                        scroller={viewportRef}
                        startMs={startMs}
                        days={days}
                        dayPx={dayPx}
                        zoom={zoom}
                        showWeekNumbers={showWeekNumbers}
                      />
                    </div>
                  </div>

                  {/* Today line */}
                  {todayOffsetPx >= 0 && todayOffsetPx <= totalWidth && (
                    <div
                      data-testid="timeline-today-line"
                      className="pointer-events-none absolute bottom-0 w-px bg-rose-400/60 shadow-[0_0_6px_hsl(0_70%_70%/0.5)]"
                      style={{ left: todayOffsetPx, top: headerH }}
                    />
                  )}

                  {visibleGroups.map((group) => (
                    <div key={group.key}>
                      {group.title && (
                        <div
                          className="border-b border-border/30 bg-muted/40"
                          style={{ height: GROUP_ROW_H }}
                        />
                      )}
                      {group.rows.map((task) => (
                        <TaskBar
                          key={task.id}
                          task={task}
                          startMs={startMs}
                          dayPx={dayPx}
                          totalWidth={totalWidth}
                          editable={task.mayEdit !== false}
                          onPreview={(next) =>
                            setLocalPatches((prev) => {
                              const copy = { ...prev }
                              if (next) copy[task.id] = next
                              else delete copy[task.id]
                              return copy
                            })
                          }
                          onCommit={(patch) => persistDates.mutate({ taskId: task.id, patch })}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

/**
 * The header's week band and date row, for the days the chart's scroller shows
 * and its margin (`useDrawnDays`), not the whole span
 * (`found-6-oct/timeline-and-gantt-draw-a-column-per-day`). Its own component,
 * so a scroll that moves the window draws the header again and not every bar.
 */
function AxisCells({
  scroller,
  startMs,
  days,
  dayPx,
  zoom,
  showWeekNumbers,
}: {
  scroller: React.RefObject<HTMLDivElement | null>
  startMs: number
  days: number
  dayPx: number
  zoom: Zoom
  showWeekNumbers: boolean
}) {
  const drawn = useDrawnDays(scroller, dayPx, days)

  const weekCells = useMemo(() => {
    if (!showWeekNumbers) return []
    const out: Array<{ key: string; left: number; width: number; week: number; monday: string }> = []
    /*
     * The weeks are counted from the Monday of the chart's first week, so a
     * cell is the same cell wherever the window stands, and the window's
     * weeks start at a whole stride of them.
     */
    const firstMonday = mondayOf(startMs)
    const lead = Math.round((startMs - firstMonday) / 86400_000)
    const stride = cellStride(7 * dayPx, MIN_CELL_PX)
    const fromWeek = Math.floor((drawn.from + lead) / 7 / stride) * stride
    const toWeek = Math.ceil((drawn.to + lead) / 7)
    for (let week = fromWeek; week < toWeek; week += stride) {
      const monday = addDays(firstMonday, week * 7)
      out.push({
        key: String(monday),
        left: ((monday - startMs) / 86400_000) * dayPx,
        width: 7 * stride * dayPx,
        week: isoWeekNumber(monday),
        monday: localIsoDate(monday),
      })
    }
    return out
  }, [showWeekNumbers, startMs, dayPx, drawn.from, drawn.to])

  return (
    <>
      {showWeekNumbers && (
        <div
          className="absolute left-0 right-0 top-0 overflow-hidden border-b border-border/40"
          style={{ height: WEEK_ROW_H }}
        >
          {weekCells.map((c) => (
            <div
              key={c.key}
              data-testid="timeline-week-number"
              data-week={String(c.week)}
              data-week-start={c.monday}
              className="absolute top-0 flex items-center justify-end border-r border-border/40 px-2 text-[10px] tabular-nums text-muted-foreground"
              style={{ left: c.left, width: c.width, height: WEEK_ROW_H }}
            >
              W{c.week}
            </div>
          ))}
        </div>
      )}
      <div
        className="absolute left-0 right-0"
        style={{ top: showWeekNumbers ? WEEK_ROW_H : 0, height: DATE_ROW_H }}
      >
        <DateHeader startMs={startMs} drawn={drawn} dayPx={dayPx} zoom={zoom} />
      </div>
    </>
  )
}

/**
 * The date row's cells within `drawn`: a day, a week from the chart's first
 * day, or a calendar month a cell, or several where one would be narrower than
 * `MIN_CELL_PX` (`cellStride`).
 *
 * A day's label is the day `addDays` reaches, as the bars' days are. It was the
 * date of `startMs + i × 24 h`, which after the clock goes back is 23:00 of the
 * day before: in Los Angeles every cell from 1 November on read the day before
 * the one it stood for, so a task due on the 10th sat under "Nov 9".
 */
function DateHeader({
  startMs,
  drawn,
  dayPx,
  zoom,
}: {
  startMs: number
  drawn: DrawnDays
  dayPx: number
  zoom: Zoom
}) {
  const cells: { at: number; label: string; left: number; width: number }[] = []

  if (zoom === 'day' || zoom === 'week') {
    const unit = zoom === 'day' ? 1 : 7
    const span = unit * cellStride(unit * dayPx, MIN_CELL_PX)
    for (let i = Math.floor(drawn.from / span) * span; i < drawn.to; i += span) {
      const at = addDays(startMs, i)
      cells.push({
        at,
        label: new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        left: i * dayPx,
        width: span * dayPx,
      })
    }
  } else {
    /*
     * Months counted from year 0, so a cell holding several months holds the
     * same ones wherever the window stands.
     */
    const stride = cellStride(28 * dayPx, MIN_CELL_PX)
    const first = new Date(addDays(startMs, drawn.from))
    const last = addDays(startMs, drawn.to)
    let month = Math.floor((first.getFullYear() * 12 + first.getMonth()) / stride) * stride
    for (let cursor = monthStart(Math.floor(month / 12), month % 12); cursor < last; ) {
      const next = monthStart(Math.floor((month + stride) / 12), (month + stride) % 12)
      cells.push({
        at: cursor,
        label: new Date(cursor).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
        left: ((cursor - startMs) / 86400_000) * dayPx,
        width: ((next - cursor) / 86400_000) * dayPx,
      })
      month += stride
      cursor = next
    }
  }

  return (
    <div className="absolute inset-0 overflow-hidden">
      {cells.map((c) => (
        <div
          key={c.at}
          data-testid="timeline-date-cell"
          data-day={localIsoDate(c.at)}
          className="absolute top-0 bottom-0 flex items-center px-2.5 text-[11px] text-muted-foreground tabular-nums border-r border-border/40 last:border-r-0"
          style={{ left: c.left, width: c.width }}
        >
          {c.label}
        </div>
      ))}
    </div>
  )
}

/** `n` calendar days after a local midnight, DST-safe (see `addDays`). */
function daysAfter(day: Date, n: number): Date {
  const next = new Date(day.getTime())
  next.setDate(next.getDate() + n)
  return next
}

function TaskBar({
  task,
  startMs,
  dayPx,
  totalWidth,
  editable,
  onPreview,
  onCommit,
}: {
  task: TimelineTask
  startMs: number
  dayPx: number
  totalWidth: number
  /** May this reader change the task — the write rule's answer (`TimelineTask.mayEdit`). */
  editable: boolean
  /** The dates to draw while a drag is under way; null draws the task's own. */
  onPreview: (next: DatePatch | null) => void
  /** The dates a finished drag moved, to save. */
  onCommit: (patch: DatePatch) => void
}) {
  const { t } = useTranslation()
  const { from, to } = barSpan(task)
  const left = ((from.getTime() - startMs) / 86400_000) * dayPx
  // Min visible width — 14px so a one-day task is still visible at month zoom
  const width = Math.max(14, ((to.getTime() - from.getTime()) / 86400_000 + 1) * dayPx)
  const spanDays = Math.round((to.getTime() - from.getTime()) / 86400_000)
  const [isDragging, setIsDragging] = useState(false)

  /*
   * A DRAG MOVES DATES BY WHOLE DAYS AND KEEPS THEIR TIME; A PRESS MOVES NOTHING
   * (`found-5-oct/timeline-press-moves-dates`). Every mouseup saved `startOfDay`
   * of each date, moved or not: a press on a task due at 17:30 left it due at
   * midnight, and in Los Angeles a press on a date-only task moved it a day
   * earlier. Now `move(days)` is the change a drag of so many days makes —
   * `shiftByDays`, the day it is drawn on plus `days`, at the time it carried —
   * and a drag that ends where it began (`days` nought) saves nothing.
   *
   * A PRESS IS A PRESS UNTIL THE MOUSE HAS TRAVELLED, as on the list's Gantt
   * (`GANTT_DRAG_THRESHOLD`): every pixel of travel was rounded to days, so at
   * Auto fit, three pixels a day, a press with a two-pixel tremor moved the
   * task a day (measured on lane 5).
   */
  const dragWith = (e: React.MouseEvent, move: (days: number) => DatePatch | null) => {
    if (e.button !== 0) return
    setIsDragging(true)
    const startX = e.clientX
    let moved = false
    let days = 0
    const onMove = (evt: MouseEvent) => {
      const dx = evt.clientX - startX
      if (Math.abs(dx) > GANTT_DRAG_THRESHOLD) moved = true
      if (!moved) return
      const next = Math.round(dx / dayPx)
      if (next === days) return
      days = next
      onPreview(days === 0 ? null : move(days))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      setIsDragging(false)
      const patch = days === 0 ? null : move(days)
      if (patch) onCommit(patch)
      else onPreview(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }
  // The whole bar: each date the task has, and only those.
  // Each date with the time it carried, or its lack of one (`carriesTime`).
  const startMoved = (days: number): DatePatch => ({
    startDate: shiftByDays(task.startDate, days, task.startDateHasTime),
    startDateHasTime: carriesTime(task.startDate, task.startDateHasTime),
  })
  const dueMoved = (days: number): DatePatch => ({
    dueDate: shiftByDays(task.dueDate, days, task.dueDateHasTime),
    dueDateHasTime: carriesTime(task.dueDate, task.dueDateHasTime),
  })
  const moveBar = (days: number): DatePatch => ({
    ...(task.startDate ? startMoved(days) : {}),
    ...(task.dueDate ? dueMoved(days) : {}),
  })
  // The left handle: the start, no later than the day the bar ends on. A task
  // with no start is given one on the day dragged to, with no time.
  const moveStart = (days: number): DatePatch | null => {
    const d = Math.min(days, spanDays)
    if (d === 0) return null
    return task.startDate ? startMoved(d) : { startDate: dayAsDateOnly(daysAfter(from, d)), startDateHasTime: false }
  }
  // The right handle: the due date, no earlier than the day the bar starts on.
  const moveDue = (days: number): DatePatch | null => {
    const d = Math.max(days, -spanDays)
    if (d === 0) return null
    return task.dueDate ? dueMoved(d) : { dueDate: dayAsDateOnly(daysAfter(to, d)), dueDateHasTime: false }
  }
  const mayMove = editable

  return (
    <div
      className="group relative border-b border-border/30 hover:bg-card/40 transition-colors"
      style={{ height: TASK_ROW_H, width: totalWidth }}
    >
      <div
        data-testid="timeline-bar"
        data-task-id={task.id}
        data-may-edit={String(editable)}
        className={cn(
          'group/bar absolute top-1/2 -translate-y-1/2 h-7 rounded-md text-[11px] text-white px-2.5 flex items-center gap-1 font-medium shadow-md ring-1 ring-white/10',
          task.isMilestone ? 'bg-amber-500' : (PRIORITY_BG[task.priority] ?? 'bg-brand-gradient'),
          STATUS_OPACITY[task.status] ?? '',
          isDragging && 'ring-2 ring-white/70',
        )}
        style={{ left, width }}
        title={`${task.isMilestone ? t('timeline.milestonePrefix') : ''}${task.title} · ${task.startDate ?? '?'} → ${task.dueDate ?? '?'}`}
        onMouseDown={
          mayMove
            ? (e) => {
                const target = e.target as HTMLElement
                if (target.dataset.handle) return
                dragWith(e, moveBar)
              }
            : undefined
        }
      >
        {/* Left resize handle — adjusts start date. Offered only where the reader may change the task. */}
        {mayMove && (
          <div
            data-handle="start"
            className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize opacity-0 group-hover/bar:opacity-100 bg-white/30 rounded-l-md transition-opacity"
            onMouseDown={(e) => {
              e.stopPropagation()
              dragWith(e, moveStart)
            }}
          />
        )}
        {task.isMilestone && <Diamond className="h-3 w-3 shrink-0 fill-white/90" />}
        <span className="truncate flex-1">{task.title}</span>
        {/* Right resize handle — adjusts due date */}
        {mayMove && (
          <div
            data-handle="end"
            className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize opacity-0 group-hover/bar:opacity-100 bg-white/30 rounded-r-md transition-opacity"
            onMouseDown={(e) => {
              e.stopPropagation()
              dragWith(e, moveDue)
            }}
          />
        )}
      </div>
    </div>
  )
}

function startOfDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

import { Fragment, Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, cn, toast } from '@rundesk/ui'
import { CalendarDays, ChevronLeft, ChevronRight, Flag, Search, Settings2 } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { calendarAccountsQuery } from '../lib/calendar-accounts'
import { useCalendarConnect } from '../hooks/use-calendar-connect'
import { useTranslation } from '../lib/i18n'
import type { PlannerSettingsPage } from '../lib/planner-settings-pages'
import { localDayKey } from '../lib/local-date'
import { useAuthStore } from '../store/auth'
import {
  PlannerSettingsDialog,
  railSectionsShown,
  GRID_SIZES,
  type PlannerGridSize,
} from '../components/planner-settings-dialog'
import { usePriorities, usePriorityActions } from '../lib/use-priorities'
import {
  plannerRange,
  plannerStep,
  readPlannerView,
  writePlannerView,
  PLANNER_VIEWS,
  PLANNER_VIEW_KEYS,
  type PlannerView,
} from '../lib/planner-view'

/*
 * §V2-15d — the palette is lazy, exactly as `routes/app.tsx` loads it. The
 * planner is a page most people open every morning and the palette is a large
 * chunk; making the calendar wait for a search box nobody has pressed yet
 * would be paying for the bar on every visit.
 */
const CommandPalette = lazy(async () => {
  const mod = await import('../components/command-palette')
  return { default: mod.CommandPalette }
})

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
  /** For "Colour tasks by → List", the fourth value the picker never offered. */
  taskListId?: string | null
  /**
   * §V2-02e — the cadence of the task this block is about, when it has one.
   * `listBlocks` sends the task's stored recurrence rather than pre-computed
   * dates, because the horizon is whatever span the grid is drawing.
   */
  taskRecurrence?: { cadenceDays?: number | null; rule?: { mode?: string; interval?: number } | null } | null
}

/**
 * §V2-02e — one projected future occurrence of a recurring block.
 *
 * NOT A BLOCK. It has no id in `task_time_blocks` and nothing in the database
 * corresponds to it; it is what the grid can say about a task that recurs. Kept
 * a separate shape, and drawn under a separate testid, so that nothing can
 * accidentally drag, resize or delete a row that does not exist yet.
 */
type Projection = { key: string; label: string; startsAt: Date; endsAt: Date }

type PlannerSettings = {
  showWeekends?: boolean
  defaultDurationMinutes?: number
  blockPrefix?: string
  /** Frame `14:10`: Subtle | Solid. */
  eventStyle?: 'subtle' | 'solid'
  /** FOUR values. The dialog's copy of this union had three and the server had
   *  always accepted four — see `planner-settings-dialog.tsx`. */
  colorTasksBy?: 'none' | 'priority' | 'status' | 'list'
  /** Which rail sections are shown, in the order the rail draws them — the
   *  Sidebar page. Reader: `railSectionsShown`, below. */
  railSections?: string[]
  /** A `users` column, surfaced here because the Appearance page edits it. */
  weekStart?: string
  /*
   * §V2-02e, frame `14:10`'s **Others** group — the five keys that were stored
   * and read by nothing, and the same omission that killed `showAssigned` and
   * `showOverdue` before them: this page's private copy of the settings type
   * did not list them, so it could not read them, and no compiler ever noticed
   * because the two hand-written types never meet. THE FIX IS THE READER, not
   * the switch. Each line below points at the code that honours it.
   */
  /** Week number beside the month — week view only, per the frame's own text. */
  showWeekNumbers?: boolean
  /** Land on the week's first day instead of today when the planner opens. */
  alwaysOpenAtStartOfWeek?: boolean
  /** Dim the columns the workspace's schedule says are not working days. */
  darkenNonWorkingHours?: boolean
  /** Typed personal events save on Enter instead of asking to confirm. */
  savePersonalEventsQuickly?: boolean
  /** Draw the next occurrences of a block whose task recurs. */
  showRecurring?: boolean
  /*
   * §V2-02d, frame `14:20` — and THIS OMISSION IS WHY THEY WERE DEAD.
   *
   * The settings dialog declared, drew and saved `showAssigned` and
   * `showOverdue`. This page — the only thing that could act on them — never
   * listed them in its own copy of the settings type, so it could not read
   * them, and nothing anywhere failed to compile. Two hand-written types for
   * one payload, disagreeing quietly.
   */
  showAssigned?: boolean
  showOverdue?: boolean
  /*
   * §V2-15a / §V2-14d / §V2-15b / §V2-15c — the four added this pass, each
   * listed here BECAUSE of the paragraph above: a key the page cannot see is a
   * key the page cannot honour, and nothing fails to compile when it is
   * missing. Every one names its reader.
   */
  /** Frame `14:05` — hour-row height. Reader: `hourPx`, below. */
  gridSize?: PlannerGridSize
  /** Frame `13:28` — workspace calendars turned off in the picker.
   *  Readers: `planner-holiday-chip`, `planner-timeoff-chip`. */
  hiddenCalendarIds?: string[]
  /** Frame `12:48` — whose columns the side-by-side grid draws.
   *  Reader: the `planner-team-column` grid. */
  teamScheduleUserIds?: string[]
  /** Frames `12:40`–`12:50` — the onboarding panel has been dismissed.
   *  Reader: `planner-onboarding`. */
  plannerOnboardingDismissed?: boolean
}

type PriorityRow = { id: string; taskId: string | null; title: string; doneAt: string | null }
type MemberRow = { userId: string; displayName?: string | null; email: string }
/**
 * What `GET /workspaces/:id/people/:userId/calendar` returns, narrowed to the
 * half this page draws.
 *
 * `meetings` are Rundesk's own, with titles a colleague in this workspace is
 * entitled to read. `busy` is §V2-14c's: those same meetings UNIONED with any
 * external calendar the person marked as counting, carrying start, end and
 * source — and NO TITLE, because a personal calendar says things like "MRI
 * results". The two are separate fields rather than one enriched list exactly
 * so that the titles cannot ride along with the external time by accident.
 */
type BusyWindow = { startsAt: string; endsAt: string; source: 'rundesk' | 'external' }
type PersonCalendar = {
  meetings: Array<{ id: string; title: string; startsAt: string; endsAt: string }>
  busy?: BusyWindow[]
}
type TaskRow = {
  id: string
  title: string
  dueDate?: string | null
  /** 'open' | 'closed' — a per-list status key can be renamed; this cannot. */
  statusCategory?: string | null
}

/**
 * The gutter runs the WHOLE day, and the grid scrolls.
 *
 * It used to run 6am–11pm — "the working day and a margin either side" — which
 * is a shortcut that fails twice. Anyone working before six had no row to put
 * their work on. And `nowOffset` returns null outside the drawn hours, so for
 * six hours of every night the calendar drew no now-line at all: at 2am it
 * showed a grid starting at 6am with nothing marking where you were.
 *
 * CI found it, not by reasoning — a run that crossed midnight failed the
 * "exactly one now-line" check that had passed every daytime run before it. A
 * grid that is only correct during office hours is a grid whose tests are only
 * correct during office hours.
 *
 * Twenty-four rows is taller than the viewport, so the grid scrolls and jumps
 * to the current hour on arrival — which is what every calendar people already
 * use does, and what frame `13:08` shows with its own scrollbar.
 */
const FIRST_HOUR = 0
const LAST_HOUR = 23

/*
 * §V2-15a — `GRID_SIZES` is imported from the settings dialog rather than
 * declared here, the same direction `RAIL_SECTIONS` already travels. The
 * control and its reader agreeing about what "Large" means is the whole
 * requirement; two hand-written copies of `{ default: 48, large: 72 }` is the
 * duplicated-list defect with numbers instead of strings, and it would show up
 * as a picker that visibly sets a size the grid does not draw.
 */

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

/*
 * A day as `YYYY-MM-DD` in LOCAL time: `localDayKey`, from lib/local-date.ts.
 * The day column's `data-day` was `d.toISOString().slice(0, 10)` of a local
 * midnight, so east of Greenwich every column was labelled with the day before
 * it (Monday the 3rd carried `2026-08-02` in Asia/Karachi, the frame's own zone).
 */

/**
 * §V2-02e — the ISO-8601 week number, for "Show week numbers".
 *
 * ISO, and therefore ALWAYS MONDAY-BASED, regardless of `users.weekStart`. A
 * "week 34" that meant something different to two colleagues because one of
 * them starts their calendar on Sunday would be worse than no number at all —
 * the number's whole use is saying which week you mean to somebody else.
 *
 * The Thursday trick: week 1 is the one containing the year's first Thursday,
 * so shifting to the Thursday of this week and counting from January 1st gets
 * the year boundary right without a table of special cases.
 */
function isoWeekNumber(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  // getUTCDay: Sunday 0 … Saturday 6. ISO wants Monday 1 … Sunday 7.
  const isoDay = t.getUTCDay() === 0 ? 7 : t.getUTCDay()
  t.setUTCDate(t.getUTCDate() + 4 - isoDay)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
}

/**
 * §V2-02e — the next occurrence of a recurring task, from a given one.
 *
 * Reads the same shape `tasks.recurrence` stores and `tasks.service.ts`
 * applies: either a plain `cadenceDays`, or a `rule` with a mode and an
 * interval. Monthly steps by MONTH rather than by thirty days, because a
 * monthly block that drifts four days a quarter is one nobody trusts; the day
 * is clamped so the 31st of a month recurring into a 30-day one lands on the
 * 30th instead of silently skipping into the next month.
 */
function nextOccurrence(from: Date, rec: Block['taskRecurrence']): Date | null {
  if (!rec) return null
  const mode = rec.rule?.mode
  const interval = Math.max(1, Math.min(52, Math.round(rec.rule?.interval ?? 1)))
  const out = new Date(from)
  if (mode === 'monthly') {
    const day = out.getDate()
    out.setDate(1)
    out.setMonth(out.getMonth() + interval)
    const lastOfMonth = new Date(out.getFullYear(), out.getMonth() + 1, 0).getDate()
    out.setDate(Math.min(day, lastOfMonth))
    return out
  }
  const days =
    mode === 'weekly' ? interval * 7
    : mode === 'daily' ? interval
    : Math.round(rec.cadenceDays ?? 0)
  if (!Number.isFinite(days) || days <= 0) return null
  out.setDate(out.getDate() + days)
  return out
}

/**
 * Which hue a list is drawn in, for "Colour tasks by → List".
 *
 * A stable hash rather than a stored colour: lists have no colour column, and
 * inventing one so the calendar could tint a pill would be a schema change in
 * service of a tint. What matters is only that two blocks on the same list
 * match and two on different lists usually do not, which a hash gives.
 */
const LIST_HUES = ['rose', 'orange', 'emerald', 'slate', 'accent'] as const
function listHue(listId: string): string {
  let h = 0
  for (let i = 0; i < listId.length; i += 1) h = (h * 31 + listId.charCodeAt(i)) % 100_003
  return LIST_HUES[h % LIST_HUES.length]
}

export function PlannerPage() {
  const { t, tCount, locale } = useTranslation()
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

  /*
   * Frame `13:50` prints the shortcut beside each label — `d x w m` — so they
   * are part of the feature rather than a nicety.
   *
   * IGNORED WHILE TYPING. The Planner has a person search and a priority box
   * on it; a bare `d` that jumped the calendar to Day view mid-word would make
   * both unusable. Modifier chords are left alone too, so the browser's own
   * shortcuts still work.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement | null
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return
      const next = PLANNER_VIEW_KEYS[e.key.toLowerCase()]
      if (!next) return
      e.preventDefault()
      chooseViewRef.current?.(next)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const qc = useQueryClient()
  const [anchor, setAnchor] = useState(() => new Date())
  const [settingsOpen, setSettingsOpen] = useState(false)
  /*
   * §V2-14d — which page the settings dialog should land on.
   *
   * `undefined` means "wherever it normally opens", which is Appearance and is
   * what the gear has always done. Frame `13:28`'s **Manage accounts** has to
   * arrive on Accounts, and sending somebody to Appearance and asking them to
   * find it is most of the way to not having the link.
   */
  const [settingsPage, setSettingsPage] = useState<PlannerSettingsPage | undefined>(undefined)
  /*
   * THE DIALOG'S PAGE HAS AN ADDRESS, `?settings=<page>`: the Meetings page's
   * "Connect Calendar" opens Accounts by it, where a calendar is connected
   * (`found-24-sep/meetings-connect-calendar-goes-to-settings`). Arriving on it
   * opens the dialog there; closing the dialog takes it off the address, so a
   * reload or a Back does not open it again.
   */
  const { settings: settingsFromAddress, calendarError } = useSearch({ from: '/app/$workspaceId/calendar' })
  const navigate = useNavigate({ from: '/app/$workspaceId/calendar' })
  useEffect(() => {
    if (!settingsFromAddress) return
    setSettingsPage(settingsFromAddress)
    setSettingsOpen(true)
  }, [settingsFromAddress])
  const changeSettingsOpen = (next: boolean) => {
    setSettingsOpen(next)
    // A failed connect's reason goes with the page it was said on.
    if (!next && (settingsFromAddress || calendarError)) {
      void navigate({ search: (prev) => ({ ...prev, settings: undefined, calendarError: undefined }), replace: true })
    }
  }
  /*
   * §V2-02 `[14:41]` — "yahan se main SEARCH kar sakti hoon [ke] mujhe kis
   * person ke saath milna hai." Until now this was an input with nothing
   * behind it: you could type into it and the page did not so much as read
   * what you typed.
   */
  const [meetQuery, setMeetQuery] = useState('')
  const [meetWith, setMeetWith] = useState<{ id: string; name: string } | null>(null)
  /* §V2-14d, frame `13:28` — the calendar picker popover. */
  const [calendarsOpen, setCalendarsOpen] = useState(false)
  /*
   * ESCAPE CLOSES IT, on the document — like every other overlay in the app.
   *
   * The popover below covers the page with a `fixed inset-0` catcher so that a
   * click anywhere else dismisses it. That catcher is the whole problem when
   * the only way to dismiss it is a click: until one lands ON the catcher, it
   * is a full-screen sheet swallowing every press in the planner header —
   * Settings, the view switcher, the arrows. A keyboard user has no way out of
   * it at all, and a mouse user's first press does nothing and looks like the
   * button is broken.
   *
   * This is the same defect `quick-create-modal.tsx` carries a note about,
   * found the same way: a suite pressed Escape and the backdrop went on
   * swallowing every click behind it. On the DOCUMENT rather than on the
   * catcher div, because a plain `<div>` takes no focus and so receives no key
   * events — an `onKeyDown` there is a handler that can never fire.
   */
  useEffect(() => {
    if (!calendarsOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCalendarsOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [calendarsOpen])
  /* §V2-15d, frame `14:45` — the bottom bar opens the shared palette. */
  const [paletteOpen, setPaletteOpen] = useState(false)
  /* §V2-15b, frame `12:48` — the side-by-side grid's own people search. */
  const [teamQuery, setTeamQuery] = useState('')

  const { data: settings, isError: settingsFailed } = useQuery({
    queryKey: ['planner-settings', workspaceId],
    queryFn: () => api<PlannerSettings>(`/planner/${workspaceId}/settings`),
    enabled: !!workspaceId,
  })
  const showWeekends = settings?.showWeekends !== false
  /*
   * §V2-02e — the four Appearance switches and the one Time-blocking switch
   * that nothing read.
   *
   * The defaults are not uniform and the asymmetry is deliberate. The three
   * that change what an existing planner looks like the moment it loads —
   * week numbers, opening on Monday, dimmed columns — are OPT IN, so nobody's
   * calendar rearranges itself because a reader was added. The two that only
   * ever ADD something (quick save, projected recurrences) follow the frame
   * and are on.
   */
  const showWeekNumbers = settings?.showWeekNumbers === true
  const darkenNonWorking = settings?.darkenNonWorkingHours === true
  const saveQuickly = settings?.savePersonalEventsQuickly !== false
  const showRecurring = settings?.showRecurring !== false
  /*
   * §V2-15a, frame `14:05` — Grid size, read here and nowhere else.
   *
   * `GRID_SIZES[...] ?? GRID_SIZES.default` rather than a bare lookup: a blob
   * written before this setting existed has no `gridSize` at all, and an
   * undefined hour height does not throw — it makes every `top` and `height`
   * on the grid `NaN`, which React renders as no style at all. The grid would
   * come up with every block stacked at the top and nothing in the console.
   */
  const gridSize: PlannerGridSize =
    settings?.gridSize && settings.gridSize in GRID_SIZES ? settings.gridSize : 'default'
  const hourPx = GRID_SIZES[gridSize]
  /*
   * §V2-14d, frame `13:28` — the two workspace calendars' on/off state.
   *
   * Declared up here with the other settings readers because the work-schedule
   * query below is shared with `darkenNonWorkingHours` and needs to know
   * whether EITHER reader wants it. Two `useQuery` calls on one key with
   * different `enabled` flags is a trap: they share a cache entry, so the
   * effective condition becomes the union anyway, decided by whichever
   * rendered last. One query, one condition, stated.
   */
  const hiddenCalendars = new Set(settings?.hiddenCalendarIds ?? [])
  /*
   * Neither calendar is on until the settings say so. Read before they arrive,
   * the hidden list was empty, so a person who had hidden both had their
   * holidays and time off asked for, and drawn, on every load
   * (`ledger-rows/defect-calendar-toggles-before-settings`). Settings that
   * failed to load fall back to the defaults, which show both.
   */
  const settingsKnown = settings !== undefined || settingsFailed
  const holidayCalendarOn = settingsKnown && !hiddenCalendars.has('workspace:holidays')
  const timeOffCalendarOn = settingsKnown && !hiddenCalendars.has('workspace:timeOff')

  /*
   * The account's own week start, not a hard-coded Monday. `users.weekStart`
   * is what every other date in the product honours, and a calendar that
   * disagreed with the rest of the app about which day the week begins on
   * would be the most visible possible place to disagree.
   */
  const weekStartsOn = { sunday: 0, monday: 1, saturday: 6 }[settings?.weekStart ?? 'sunday'] ?? 0
  const weekStart = useMemo(() => startOfWeek(anchor, weekStartsOn), [anchor, weekStartsOn])

  /*
   * §V2-02e — "Always open at the start of the week".
   *
   * ONCE, WHEN THE SETTINGS FIRST ARRIVE, and never again. The anchor has to
   * be initialised before the settings query resolves (the grid draws on the
   * first frame), so this cannot live in `useState`'s initialiser; and an
   * effect that re-ran on every settings change would yank the calendar back
   * to Monday the moment anybody pressed an arrow and then saved any other
   * setting. The ref is the guard, and it is per mount: leaving the planner
   * and coming back is "opening it" again, which is exactly what the switch
   * is about.
   *
   * Only meaningful in the spans that start where the anchor is — Day and
   * 4 days. Week and Month already draw the whole span whatever the anchor is,
   * so moving it changes nothing there, and that is not a bug in the setting.
   */
  const openedAtStart = useRef(false)
  useEffect(() => {
    if (openedAtStart.current || !settings) return
    openedAtStart.current = true
    if (settings.alwaysOpenAtStartOfWeek !== true) return
    setAnchor((current) => startOfWeek(current, weekStartsOn))
  }, [settings, weekStartsOn])

  /*
   * §V2-S14c frame `13:50` — Day (d) · 4 days (x) · Week (w) · Month (m).
   *
   * The grid was a hardcoded seven days and the arrows a hardcoded ±7. The days
   * drawn, how far an arrow moves and which layout is used all come from
   * `lib/planner-view` so they cannot disagree — an arrow that moved a week
   * while the grid showed a month would show the same fortnight twice.
   */
  const [view, setView] = useState<PlannerView>(() => readPlannerView())
  /*
   * "Show weekends" is a stored planner setting, not a local one — the
   * Appearance page edits the same field, so this writes through the same
   * endpoint rather than keeping a second opinion about it.
   */
  const saveSettings = useMutation({
    mutationFn: (patch: PlannerSettings) =>
      api(`/planner/${workspaceId}/settings`, { method: 'PATCH', body: patch }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['planner-settings', workspaceId] })
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('plannerSettings.saveFailed')),
  })
  const chooseView = (next: PlannerView) => {
    setView(next)
    writePlannerView(next)
  }
  // The key listener is bound once; this keeps it calling the current closure
  // rather than the one from first render.
  const chooseViewRef = useRef(chooseView)
  chooseViewRef.current = chooseView
  const days = useMemo(
    () => plannerRange(view, anchor, weekStartsOn, showWeekends),
    [view, anchor, weekStartsOn, showWeekends],
  )
  /*
   * THE FETCH RANGE COMES FROM THE DAYS DRAWN, not from the week.
   *
   * This read `weekStart` to `weekStart + 7` while the grid drew whatever the
   * view asked for — so Month would have drawn thirty days and fetched seven of
   * them, and the other twenty-three would have looked genuinely empty. Same
   * shape as every other bug in this file's history: two places deciding one
   * thing.
   */
  const rangeFrom = days[0] ?? weekStart
  const rangeTo = addDays(days[days.length - 1] ?? weekStart, 1)

  const { data: blocks = [] } = useQuery({
    queryKey: ['planner-blocks', workspaceId, rangeFrom.toISOString()],
    queryFn: () =>
      api<Block[]>(
        `/planner/${workspaceId}/blocks?from=${rangeFrom.toISOString()}&to=${rangeTo.toISOString()}`,
      ),
    enabled: !!workspaceId,
  })

  /*
   * §V2-02e — "Darken non-working hours", and where the work schedule comes
   * from.
   *
   * `GET /workspaces/:id/work-schedule` is the workspace's real one:
   * `work_days` as ISO weekdays plus the dated `workspace_holidays` rows that
   * Workload already honours. NOT the weekend, which the grid has always
   * tinted on its own — a team whose working week is Sunday to Thursday has a
   * Saturday that is a weekend and a working day, and a Thursday that is
   * neither. Reusing the weekend shading here would make the switch look like
   * it worked for the five-day teams and do the wrong thing for everyone else.
   *
   * Fetched only when the switch is on. It also means the request itself is
   * evidence the setting was read, which the suite checks: a reader that never
   * asks for the schedule cannot be honouring it.
   */
  const { data: workSchedule } = useQuery({
    queryKey: ['work-schedule', workspaceId],
    queryFn: () =>
      api<{ workDays: number[]; holidays: Array<{ day: string; name: string }> }>(
        `/workspaces/${workspaceId}/work-schedule`,
      ),
    /* TWO readers now: the dimming switch, and frame `13:28`'s **Holidays**
     * calendar. Asked for when either wants it, and — because each reader
     * checks its own flag below — turning one off does not take the other's
     * data away. */
    enabled: !!workspaceId && (darkenNonWorking || holidayCalendarOn),
  })

  /** ISO weekday, 1 = Monday … 7 = Sunday, matching `workspaces.work_days`. */
  const isoDay = (d: Date) => (d.getDay() === 0 ? 7 : d.getDay())
  const holidays = useMemo(
    () => new Set((workSchedule?.holidays ?? []).map((h) => h.day.slice(0, 10))),
    [workSchedule],
  )
  const nonWorking = (d: Date) => {
    if (!darkenNonWorking || !workSchedule) return false
    if (holidays.has(localDayKey(d))) return true
    return !(workSchedule.workDays ?? []).includes(isoDay(d))
  }

  /* The roster the search filters. Fetched once; the filtering is local,
   * because a workspace's member list is small and a keystroke should not be
   * a round trip. */
  const { data: members = [] } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => api<MemberRow[]>(`/workspaces/${workspaceId}/members`),
    enabled: !!workspaceId,
  })

  /*
   * Their week, for the week ON SCREEN. Re-fetched when you page the calendar,
   * because "when is Sara free" is a question about the days you are looking
   * at, not about the days you happened to be looking at when you picked her.
   */
  const { data: theirWeek } = useQuery({
    queryKey: ['planner-meet-with', workspaceId, meetWith?.id, rangeFrom.toISOString()],
    queryFn: () =>
      api<PersonCalendar>(
        `/workspaces/${workspaceId}/people/${meetWith!.id}/calendar` +
          `?from=${rangeFrom.toISOString()}&to=${rangeTo.toISOString()}`,
      ),
    enabled: !!workspaceId && !!meetWith,
  })
  /*
   * §V2-14c — this line used to read `theirWeek?.meetings`, and that was the
   * bug frame `13:50` describes: somebody blocked out all afternoon in their
   * own Google Calendar read as completely free here, which is worse than
   * showing nothing, because it is confidently wrong.
   *
   * `busy` is the union, so a Rundesk meeting still draws a block — the older
   * checks that only count blocks keep passing for the right reason, not by
   * luck. The fallback to `meetings` is for an API that has not been redeployed
   * yet: losing external time is a smaller failure than losing the whole panel.
   */
  const theirMeetings = theirWeek?.meetings ?? []
  const theirBusy: BusyWindow[] =
    theirWeek?.busy ??
    theirMeetings.map((m) => ({ startsAt: m.startsAt, endsAt: m.endsAt, source: 'rundesk' as const }))

  /*
   * What a hatched block says when you hover it.
   *
   * The window itself carries no title, so the names come from the SEPARATE
   * `meetings` list — Rundesk's own, which this viewer can already read on the
   * task and in the meeting. A window with nothing in that list overlapping it
   * is external time, and it says only that the person is busy. That is the
   * whole privacy rule, and it holds without a `delete` anywhere: there is no
   * title on the window to forget to strip.
   */
  const busyLabel = (w: BusyWindow) => {
    const named = theirMeetings
      .filter((m) => m.startsAt < w.endsAt && w.startsAt < m.endsAt)
      .map((m) => m.title)
    const who = meetWith?.name ?? ''
    return named.length ? `${who}: ${named.join(', ')}` : t('planner.busyPrivate', { name: who })
  }

  /*
   * §V2-14d, frame `13:28` — the picker's contents, assembled by the server.
   *
   * See `planner.service.ts#listCalendars` for why the SET comes from there
   * and only the labels come from here: the workspace's two built-in calendars
   * would otherwise be written out in both places and drift.
   */
  type PickerCalendar = {
    id: string
    label: string | null
    checked: boolean
    isDefault: boolean
    accountId: string | null
    kind: 'account' | 'workspace'
  }
  const { data: calendarPicker } = useQuery({
    queryKey: ['planner-calendars', workspaceId],
    queryFn: () =>
      api<{ groups: Array<{ key: string; title: string; kind: string; calendars: PickerCalendar[] }> }>(
        `/planner/${workspaceId}/calendars`,
      ),
    enabled: !!workspaceId,
  })
  const calendarGroups = calendarPicker?.groups ?? []
  /*
   * The number on the header chip, and it is COUNTED rather than stated.
   *
   * Frame `13:28` has the chip reading `1` beside a popover with four rows, one
   * of them ticked — so it is a count of what is ON, not of what exists. A
   * badge rendering `calendars.length` would show `4` there and would be the
   * facade class exactly: a number that can only ever say one thing.
   */
  const visibleCalendarCount = calendarGroups.reduce(
    (n, g) => n + g.calendars.filter((c) => c.checked).length,
    0,
  )
  /*
   * §V2-14d — the **Time off** calendar's reader.
   *
   * Fetched only while the calendar is ON, so the REQUEST is itself evidence
   * the checkbox was honoured — the same trick `darkenNonWorkingHours` uses,
   * and the thing that makes this a reader rather than a stored value nobody
   * consults.
   */
  const { data: timeOff = [] } = useQuery({
    queryKey: ['planner-time-off', workspaceId, rangeFrom.toISOString(), rangeTo.toISOString()],
    queryFn: () =>
      api<Array<{ id: string; userId: string; startsOn: string; endsOn: string; note?: string | null }>>(
        `/workspaces/${workspaceId}/time-off?from=${rangeFrom.toISOString()}&to=${rangeTo.toISOString()}`,
      ),
    enabled: !!workspaceId && timeOffCalendarOn,
  })

  const setCalendarHidden = useMutation({
    mutationFn: (next: string[]) =>
      api<PlannerSettings>(`/planner/${workspaceId}/settings`, {
        method: 'PATCH',
        body: JSON.stringify({ hiddenCalendarIds: next }),
      }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['planner-settings', workspaceId] }),
        qc.invalidateQueries({ queryKey: ['planner-calendars', workspaceId] }),
      ])
    },
  })
  const setAccountBusy = useMutation({
    /* The account half of the picker writes `counts_as_busy` — the column that
     * already means "this calendar is read" — rather than a second per-user
     * flag saying the same thing. One fact, two doors, like "Show weekends". */
    mutationFn: ({ accountId, checked }: { accountId: string; checked: boolean }) =>
      api(`/workspaces/${workspaceId}/calendar-sync/accounts/${accountId}/busy`, {
        method: 'PATCH',
        body: JSON.stringify({ countsAsBusy: checked }),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['planner-calendars', workspaceId] })
    },
  })

  /*
   * §V2-15b, frame `12:48` — **Team schedules**: "See calendars for anyone in
   * your team, [find a] time, and schedule a call in seconds", over a preview
   * with a ROW OF AVATARS, several of them ticked.
   *
   * THIS IS NOT "MEET WITH" WITH A BIGGER NUMBER. Meet-with overlays ONE
   * person's busy time on YOUR week, and answers "is Sara free on Thursday".
   * The avatars answer a different question — "when are the four of us free" —
   * and it cannot be answered by overlaying four people on one column, because
   * four sets of hatching stacked on each other is a picture of nobody's
   * schedule. Hence a column each, side by side, which is what the card draws.
   *
   * ONE REQUEST FOR ALL THE COLUMNS. See `planner.service.ts#teamSchedules`:
   * a column whose read failed comes back with `error` set rather than an
   * empty `busy`, because "no meetings" and "could not be read" drawn the same
   * way is the confident-zero defect on a calendar.
   */
  const teamUserIds = settings?.teamScheduleUserIds ?? []
  type TeamColumn = {
    userId: string
    meetings: Array<{ id: string; title: string; startsAt: string; endsAt: string }>
    busy?: BusyWindow[]
    error: string | null
  }
  const { data: teamSchedules } = useQuery({
    queryKey: [
      'planner-team-schedules',
      workspaceId,
      /* The ids JOINED, not the array: a fresh array with the same contents is
       * a new key by reference and would refetch on every render. */
      teamUserIds.join(','),
      rangeFrom.toISOString(),
      rangeTo.toISOString(),
    ],
    queryFn: () =>
      api<{ people: TeamColumn[] }>(
        `/planner/${workspaceId}/team-schedules` +
          `?userIds=${encodeURIComponent(teamUserIds.join(','))}` +
          `&from=${rangeFrom.toISOString()}&to=${rangeTo.toISOString()}`,
      ),
    enabled: !!workspaceId && teamUserIds.length > 0,
  })
  const teamColumns = teamSchedules?.people ?? []
  const setTeamPeople = useMutation({
    mutationFn: (next: string[]) =>
      api<PlannerSettings>(`/planner/${workspaceId}/settings`, {
        method: 'PATCH',
        body: JSON.stringify({ teamScheduleUserIds: next }),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['planner-settings', workspaceId] })
    },
  })
  const toggleTeamPerson = (userId: string) => {
    const next = teamUserIds.includes(userId)
      ? teamUserIds.filter((id) => id !== userId)
      : [...teamUserIds, userId]
    setTeamPeople.mutate(next)
  }
  const nameOf = (userId: string) => {
    const m = members.find((x) => x.userId === userId)
    return m ? m.displayName || m.email : userId
  }
  const teamMatches = useMemo(() => {
    const needle = teamQuery.trim().toLowerCase()
    if (!needle) return []
    return members
      .filter((m) => (m.displayName || m.email).toLowerCase().includes(needle))
      .slice(0, 6)
  }, [teamQuery, members])

  /*
   * §V2-15c, frames `12:40`–`12:50` — the onboarding panel.
   *
   * Shown when this person has connected NO calendar account and has not
   * dismissed it. Both halves matter: it is an invitation to connect, so it
   * has no reason to exist once one is connected, and a permanent panel
   * nobody can close is an advertisement.
   *
   * IT DOES NOT REPLACE THE GRID, and that is a deliberate departure from
   * ClickUp, whose planner has nothing to show before a calendar is connected.
   * Rundesk's does: time blocks, priorities, the backlog and the whole
   * `task_time_blocks` feature work with no external calendar at all. Hiding a
   * working calendar behind a connect screen would take a feature away to
   * advertise a different one. So it sits above the grid, and goes when it is
   * answered or dismissed.
   */
  const { data: calendarAccounts = [] } = useQuery({
    ...calendarAccountsQuery(workspaceId),
    enabled: !!workspaceId,
  })
  const showOnboarding =
    settings !== undefined &&
    settings.plannerOnboardingDismissed !== true &&
    calendarAccounts.length === 0
  const dismissOnboarding = useMutation({
    mutationFn: () =>
      api<PlannerSettings>(`/planner/${workspaceId}/settings`, {
        method: 'PATCH',
        body: JSON.stringify({ plannerOnboardingDismissed: true }),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['planner-settings', workspaceId] })
    },
  })
  /*
   * Which calendars this server can connect, and the connect itself: the one
   * flow the Accounts page's "Add account" uses too. The onboarding's buttons
   * posted `oauth/start` whatever the answer, and without a client id the
   * "consent" address was a provider page for no application at all
   * (`ledger-rows/defect-planner-connect-empty-consent`).
   */
  const { canConnect, connect: connectCalendar } = useCalendarConnect(workspaceId)

  const meetMatches = useMemo(() => {
    const needle = meetQuery.trim().toLowerCase()
    if (!needle) return []
    return members
      .filter((m) => (m.displayName || m.email).toLowerCase().includes(needle))
      .slice(0, 6)
  }, [members, meetQuery])

  /*
   * §V2-S14b — one cache entry, shared with the person panel. Both surfaces
   * read the same endpoint and used to keep separate keys for it, so adding a
   * priority in one left the other showing yesterday's list.
   */
  const { data: priorities = [] } = usePriorities(workspaceId, currentUserId)
  const priorityActions = usePriorityActions(workspaceId, currentUserId)
  const [priorityDraft, setPriorityDraft] = useState('')

  /*
   * The Backlog rail: things assigned to me that are not on the grid yet.
   * Frame `13:08` shows the unscheduled task `dbgdh` sitting there, which is
   * what makes the drag in `[14:52]` have somewhere to start from.
   */
  const { data: assigned = [] } = useQuery({
    queryKey: ['planner-assigned', workspaceId, currentUserId],
    /*
     * `/members/`, PLURAL. This read `/member/` and answered 404 on every load,
     * so `assigned` was permanently `[]` — the Backlog rail was always empty,
     * and the two Time-blocking switches that gate this list were gating
     * nothing. The suites did not catch it because they STUBBED the singular
     * path: `if (url.includes('/member/')) return reply(ASSIGNED)` implements a
     * route the API does not have, and a check written against it can never
     * fail on the real product.
     */
    queryFn: () => api<TaskRow[]>(`/tasks/workspace/${workspaceId}/members/${currentUserId}`),
    enabled: !!workspaceId && !!currentUserId,
  })
  const scheduledTaskIds = useMemo(
    () => new Set(blocks.map((b) => b.taskId).filter(Boolean) as string[]),
    [blocks],
  )

  /*
   * §V2-02d, frame `14:20` — the two Time-blocking switches that decide what
   * work reaches this page.
   *
   * BOTH OF THESE USED TO BE DEAD. `showAssigned` and `showOverdue` were
   * declared in the settings type, drawn as switches, written to the database
   * and read by NOTHING — a settings form that saves, reads back and changes
   * nothing, which is the defect this codebase has spent two videos removing,
   * shipped inside the item whose title was "settings pages that change the
   * calendar". Its suite asserted before/after on the other toggles and never
   * touched these two.
   */
  const showAssigned = settings?.showAssigned !== false
  const showOverdue = settings?.showOverdue !== false

  const backlog = useMemo(
    () =>
      showAssigned
        ? assigned.filter((task) => !scheduledTaskIds.has(task.id)).slice(0, 25)
        : [],
    [assigned, scheduledTaskIds, showAssigned],
  )

  /*
   * "Show overdue tasks in the Planner board — roll overdue tasks and reminders
   * into today's column."
   *
   * ROLLED FORWARD, NOT DRAWN WHERE THEY WERE DUE. A task due last Tuesday
   * belongs in the day you can still act on it; drawing it on a Tuesday that
   * has gone is a record rather than a plan. So they land in today's column,
   * which is also why they carry their own testid — the point of the setting is
   * that you can turn this rolling-forward off and see the week as it was.
   */
  const overdue = useMemo(() => {
    if (!showOverdue || !showAssigned) return []
    const startOfToday = startOfDay(new Date()).getTime()
    return assigned
      .filter((task) => {
        if (!task.dueDate) return false
        const due = new Date(task.dueDate).getTime()
        return Number.isFinite(due) && due < startOfToday && !scheduledTaskIds.has(task.id)
      })
      .slice(0, 12)
  }, [assigned, scheduledTaskIds, showOverdue, showAssigned])

  /*
   * §V2-S14 frame `13:05` — the two rail sections the frame lists and the rail
   * did not have: `Assigned to me ›` and `Today & overdue ›`.
   *
   * NOT GATED BY THE TIME-BLOCKING SWITCHES, deliberately. Frame `14:20` words
   * both of those as being about the Planner BOARD — "Show tasks assigned to me
   * with due date", "Show overdue tasks in the Planner **board**" — and the
   * rail has its own show/hide on the Sidebar page. Wiring the board's switches
   * to the rail would invent a coupling the walkthrough does not describe and
   * make the Sidebar checkbox look broken.
   *
   * `todayOverdue` is NOT the same rule as the board's `overdue` above, and the
   * difference is on purpose: the board wants work it can roll into today's
   * column, so it takes only what is strictly late AND not already scheduled;
   * the rail is a reading list, so it takes anything due by the end of today,
   * scheduled or not. Two rules, two expressions — collapsing them into one
   * "shared" helper would silently change one of the two surfaces.
   *
   * FINISHED WORK IS LEFT OUT BY THE SERVER, not here. The member endpoint
   * returns open tasks only (`getTasksForMember`, in SQL, before its limit),
   * as Home and the Backlog already trust. This page filtered closed tasks out
   * a second time, so neither copy of the rule could be tested: a break that
   * removed either one left the other doing its work (`prail-3` reddened
   * nothing, aimed first at this filter, then at the server's).
   */
  const todayOverdue = useMemo(() => {
    const endOfToday = startOfDay(addDays(new Date(), 1)).getTime()
    return assigned
      .filter((task) => {
        if (!task.dueDate) return false
        const due = new Date(task.dueDate).getTime()
        return Number.isFinite(due) && due < endOfToday
      })
      .slice(0, 25)
  }, [assigned])

  /*
   * §V2-02 frame `14:45` — dragging task `dbgdh` on makes a block called
   * "Work on dbgdh". The prefix is applied at RENDER, not stored: the label
   * already resolves from the task server-side, and baking "Work on" into the
   * row would freeze both the prefix and the task's name at the moment of the
   * drag. Changing the prefix in settings then re-titles every block, which is
   * what a setting should do.
   */
  const prefix = settings?.blockPrefix ?? t('planner.workOn')

  /**
   * Frame `14:10`'s "Color tasks by" and event style, applied to a block.
   *
   * The colour comes off the TASK the block points at — its priority or its
   * status — which is why `listBlocks` carries both. A typed block has
   * neither and keeps the neutral accent, rather than being coloured as
   * though it were a task with no priority.
   */
  const blockTone = (b: Block) => {
    const solid = settings?.eventStyle === 'solid'
    const by = settings?.colorTasksBy ?? 'none'
    let hue = 'accent'
    if (by === 'priority' && b.taskPriority) {
      hue = { urgent: 'rose', high: 'orange', normal: 'accent', low: 'slate' }[b.taskPriority] ?? 'accent'
    } else if (by === 'status' && b.taskStatus) {
      hue = b.taskStatus === 'done' ? 'emerald' : 'accent'
    } else if (by === 'list' && b.taskListId) {
      /* §V2-02e — the fourth value. The server has accepted `list` since this
       * setting shipped; the select offered three options and this function
       * knew three, so choosing it (which only the API could do) coloured
       * everything accent — a value that round-tripped and did nothing. */
      hue = listHue(b.taskListId)
    }
    const map: Record<string, { subtle: string; solid: string }> = {
      accent: { subtle: 'border-accent/40 bg-accent/15 text-accent', solid: 'border-accent bg-accent text-accent-foreground' },
      rose: { subtle: 'border-rose-400/40 bg-rose-400/15 text-rose-600 dark:text-rose-300', solid: 'border-rose-500 bg-rose-500 text-white' },
      orange: { subtle: 'border-orange-400/40 bg-orange-400/15 text-orange-600 dark:text-orange-300', solid: 'border-orange-500 bg-orange-500 text-white' },
      slate: { subtle: 'border-slate-400/40 bg-slate-400/15 text-slate-600 dark:text-slate-300', solid: 'border-slate-500 bg-slate-500 text-white' },
      emerald: { subtle: 'border-emerald-400/40 bg-emerald-400/15 text-emerald-600 dark:text-emerald-300', solid: 'border-emerald-500 bg-emerald-500 text-white' },
    }
    return map[hue][solid ? 'solid' : 'subtle']
  }

  /** The Sidebar page. Absent means every section, so an existing planner is unchanged. */
  /*
   * §V2-S14 — the default comes from `RAIL_SECTIONS`, not from a second copy of
   * it written out here.
   *
   * This line used to read `?? ['priorities', 'meetWith', 'backlog']`. It
   * agreed with the constant by luck, and the luck would have run out on this
   * very commit: adding two sections to the constant would have put two new
   * checkboxes on the Sidebar page controlling two sections the rail never drew
   * for anybody who had not saved a preference. Sixth instance of the same
   * shape in this codebase; the compiler cannot see any of them.
   *
   * AND THE ORDER IS READ, frames `14:13`–`14:16` ("Show, hide and reorder").
   * This was `.includes(key)` over a rail drawn in a fixed order, so the
   * array's order was stored and read by nothing (`ledger-rows/row-835-reorder`).
   * The rail now draws `railSectionsShown` in its order — the same function the
   * Sidebar page lists its rows by.
   */
  const railShown = railSectionsShown(settings?.railSections)
  const blockLabel = (b: Block) => (b.taskId && b.label ? `${prefix} ${b.label}` : b.label ?? '')

  /*
   * §V2-02e — "Show recurring", and what it draws.
   *
   * Only FORWARD, and never over the block it came from. A recurring task's
   * block is a real row; the occurrences after it are not, and the grid says
   * so by drawing them differently and by giving them no block id. Walking
   * rather than multiplying, because a monthly rule does not have a fixed
   * length: `nextOccurrence` steps by months when the rule says months.
   *
   * The walk is bounded twice — by the end of the drawn range and by a hard
   * cap — so a task recurring daily inside a month view cannot turn into an
   * unbounded loop if a rule ever arrives with a cadence of zero.
   */
  const projections = useMemo<Projection[]>(() => {
    if (!showRecurring) return []
    const until = rangeTo.getTime()
    const out: Projection[] = []
    for (const b of blocks) {
      if (!b.taskRecurrence) continue
      const length = new Date(b.endsAt).getTime() - new Date(b.startsAt).getTime()
      let cursor: Date | null = new Date(b.startsAt)
      for (let n = 0; n < 60; n += 1) {
        cursor = nextOccurrence(cursor as Date, b.taskRecurrence)
        if (!cursor || cursor.getTime() >= until) break
        out.push({
          key: `${b.id}-${cursor.toISOString()}`,
          label: blockLabel(b),
          startsAt: new Date(cursor),
          endsAt: new Date(cursor.getTime() + length),
        })
      }
    }
    return out
    // `blockLabel` closes over the prefix, which is itself a setting; listing
    // it would re-run this on every render rather than when the data changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, showRecurring, rangeTo, prefix])

  /** Which task is currently under the pointer, mid-drag. */
  const [dragging, setDragging] = useState<{ taskId: string; title: string } | null>(null)
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null)

  /*
   * §V2-02e — "Save personal events quickly", and the thing it needed first:
   * A WAY TO MAKE A PERSONAL EVENT AT ALL.
   *
   * The grid could only receive a task dragged off the Backlog. `[14:10]`'s
   * switch is about "personal events" — lunch, the school run, the things
   * `taskTimeBlocks.title` has been nullable for since §V2-02 — and there was
   * no control anywhere that made one. So the setting could not have been read
   * even by a page that wanted to: there was no confirmation step to skip.
   *
   * Clicking an empty spot in a column opens a draft at that quarter hour.
   * With the switch on, Enter saves it. With it off, Enter shows what is about
   * to be saved and waits — which is the whole difference the switch names.
   */
  const [draft, setDraft] = useState<{ startsAt: Date; title: string; confirming: boolean } | null>(null)

  const createBlock = useMutation({
    mutationFn: (body: { taskId?: string; title?: string; startsAt: string }) =>
      api(`/planner/${workspaceId}/blocks`, { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['planner-blocks', workspaceId] }),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('planner.blockFailed')),
  })

  /** Send the draft as a personal event — a block with a title and no task. */
  const savePersonalEvent = () => {
    const title = draft?.title.trim()
    if (!draft || !title) return
    createBlock.mutate({ title, startsAt: draft.startsAt.toISOString() })
    setDraft(null)
  }

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
    const hoursIn = offsetY / hourPx + FIRST_HOUR
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
   * §V2-02e — a click on empty grid starts a personal event.
   *
   * Anything already drawn there is left alone: clicking a block, a projected
   * occurrence or somebody else's busy window is not "empty grid", and opening
   * a composer on top of one would make the grid impossible to read. A drag in
   * progress is not a click either — the drop handler owns that gesture.
   */
  const onClickColumn = (day: Date, e: React.MouseEvent<HTMLDivElement>) => {
    if (dragging) return
    const el = e.target as HTMLElement | null
    if (el?.closest('[data-testid="planner-block"], [data-testid="planner-recurring-block"], [data-testid="planner-busy-block"], [data-testid="planner-event-draft"]')) {
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    setDraft({ startsAt: dropTime(day, e.clientY - rect.top), title: '', confirming: false })
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

  /*
   * THE LABEL NAMES WHAT IS ON SCREEN, not the week containing the anchor.
   *
   * This formatted `weekStart`, which is the Monday (or Sunday) of the anchor's
   * week — fine for a week view and wrong for every other span. In Day view on
   * the 1st of a month, `weekStart` falls in the PREVIOUS month and the header
   * named it; in Month view, stepping to the 1st of the next month could leave
   * the label unchanged, because that 1st's week began in the month just left.
   * Caught by a check on the arrows, which is not where I expected to find it.
   */
  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
    days[0] ?? weekStart,
  )

  /*
   * §V2-02e — WHICH day the week number is taken from, and why it is not the
   * first one.
   *
   * ISO weeks run Monday to Sunday. On a calendar whose week starts on Sunday
   * — `users.weekStart` allows it, and so does frame `14:10`'s picker — the
   * first column belongs to the ISO week that has just ENDED, so taking the
   * number from `days[0]` would label six days of the week with the previous
   * week's number. The middle of the drawn span is inside the intended week
   * for every start day the product offers (Saturday, Sunday or Monday) and
   * with weekends hidden as well.
   */
  const weekNumberShown = isoWeekNumber(days[Math.floor(days.length / 2)] ?? weekStart)
  const dayName = (d: Date) => new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d)

  const hours = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => FIRST_HOUR + i)
  const gridHeight = hours.length * hourPx

  /** Where the red line sits, or null when now is outside the drawn hours. */
  const nowOffset = useMemo(() => {
    const h = now.getHours() + now.getMinutes() / 60
    if (h < FIRST_HOUR || h > LAST_HOUR + 1) return null
    return (h - FIRST_HOUR) * hourPx
  }, [now])
  const gridScrollRef = useRef<HTMLDivElement | null>(null)
  const nowColumn = days.findIndex((d) => sameDay(d, now))

  /*
   * Arrive at the current hour, not at midnight.
   *
   * A full-day grid opens on 00:00 unless told otherwise, so the first thing
   * everybody would do is scroll down past six empty hours. Positioned an hour
   * earlier than now so the line has context above it rather than sitting on
   * the top edge, and done once on mount — re-running it every minute would
   * yank the view back while somebody was reading a different part of the day.
   */
  useEffect(() => {
    const el = gridScrollRef.current
    if (!el || nowOffset === null) return
    el.scrollTop = Math.max(0, nowOffset - hourPx)
    // Mount only, deliberately: `nowOffset` changes every minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const allDay = blocks.filter((b) => b.isAllDay)
  const timed = blocks.filter((b) => !b.isAllDay)

  /*
   * §V2-15b, frame `12:48` — **Team schedules**, the picker half.
   *
   * A SEPARATE SECTION FROM "MEET WITH", deliberately. They look similar
   * and are not: Meet with overlays one person on your own week to answer
   * "is Sara free on Thursday"; this picks several and gives each their
   * own column, to answer "when are the four of us free". Folding them
   * into one control would have meant either losing the overlay or
   * drawing four people's hatching on top of each other, which is a
   * picture of nobody's schedule. `planner-grid.mjs` asserts the overlay
   * still works, and it does, untouched.
   *
   * Held here rather than written in the rail because the rail draws it in one
   * of two places: under Meet with, wherever the stored order puts Meet with,
   * or at the foot when Meet with is hidden.
   */
  const teamSchedulesSection = (
    <section data-testid="planner-team-schedules">
      <h2 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {t('planner.teamSchedules')}
      </h2>
      {teamUserIds.length > 0 && (
        <ul className="mb-1.5 space-y-0.5" data-testid="planner-team-chips">
          {teamUserIds.map((id) => (
            <li
              key={id}
              data-testid="planner-team-chip"
              data-user-id={id}
              className="flex items-center justify-between gap-2 rounded-md border border-border/70 px-2 py-1 text-[12px]"
            >
              <span className="truncate">{nameOf(id)}</span>
              <button
                type="button"
                aria-label={t('planner.teamRemovePerson')}
                data-testid={`planner-team-remove-${id}`}
                disabled={setTeamPeople.isPending}
                onClick={() => toggleTeamPerson(id)}
                className="rounded px-1 text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={teamQuery}
          onChange={(e) => setTeamQuery(e.target.value)}
          placeholder={t('planner.teamSearchPeople')}
          aria-label={t('planner.teamSearchPeople')}
          data-testid="planner-team-search"
          className="h-8 w-full rounded-md border border-border/80 bg-card pl-7 pr-2 text-[12px]"
        />
        {teamQuery.trim() !== '' && (
          <div className="mt-1 space-y-0.5">
            {teamMatches.length === 0 ? (
              <p className="px-2 py-1 text-[11px] text-muted-foreground" data-testid="planner-team-none">
                {t('planner.noPeople')}
              </p>
            ) : (
              teamMatches.map((m) => (
                <button
                  key={m.userId}
                  type="button"
                  data-testid="planner-team-result"
                  data-user-id={m.userId}
                  disabled={setTeamPeople.isPending}
                  onClick={() => {
                    toggleTeamPerson(m.userId)
                    setTeamQuery('')
                  }}
                  className="block w-full truncate rounded px-2 py-1 text-left text-[12px] hover:bg-muted/40"
                >
                  {m.displayName || m.email}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </section>
  )

  return (
    <div className="flex h-full min-h-0" data-testid="planner-page">
      {/* What is being dragged, under the pointer. A drag with no feedback is
          a drag people do not believe is happening. */}
      <PlannerSettingsDialog
        open={settingsOpen}
        onOpenChange={changeSettingsOpen}
        workspaceId={workspaceId}
        initialPage={settingsPage}
      />

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
      <aside data-testid="planner-rail" className="w-64 shrink-0 border-r border-border/60 overflow-y-auto p-3 space-y-4">
        <h1 className="text-[13px] font-semibold">{t('planner.title')}</h1>

        {/*
          The shown sections, in the order `railSectionsShown` reads them out of
          `railSections`; each pass draws the one section it names. Team
          schedules is not among the five the Sidebar page orders (frame `14:14`
          lists five), so it rides directly under Meet with, and at the foot of
          the rail when Meet with is hidden.
        */}
        {railShown.map((key) => (
        <Fragment key={key}>
        {key === 'priorities' && (
        <section data-testid="planner-priorities" data-rail-section="priorities">
          <h2 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t('planner.priorities')}
            {/* Frame `16:05` — the rail carries a count once something is on it. */}
            {priorities.filter((p) => !p.doneAt).length > 0 && (
              <span
                data-testid="planner-priority-count"
                className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] normal-case tracking-normal"
              >
                {tCount('planner.priorityCount', priorities.filter((p) => !p.doneAt).length)}
              </span>
            )}
          </h2>
          {priorities.filter((p) => !p.doneAt).length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/70 p-4 text-center">
              <Flag className="mx-auto mb-1.5 h-4 w-4 text-muted-foreground" aria-hidden />
              <p className="text-[11px] text-muted-foreground">{t('planner.prioritiesEmpty')}</p>
            </div>
          ) : (
            <ul className="space-y-1">
              {priorities.filter((p) => !p.doneAt).map((p) => (
                <li
                  key={p.id}
                  data-testid="planner-priority-item"
                  data-priority-id={p.id}
                  className="group flex items-center gap-1.5 rounded px-2 py-1 text-[12px] hover:bg-muted/40"
                >
                  {/*
                    Ticking one off is the point of a daily list. The rail could
                    show priorities and do nothing else with them — you had to
                    open the person panel to finish one.
                  */}
                  <button
                    type="button"
                    data-testid={`planner-priority-done-${p.id}`}
                    title={p.doneAt ? t('planner.priorityReopen') : t('planner.priorityDone')}
                    aria-label={p.doneAt ? t('planner.priorityReopen') : t('planner.priorityDone')}
                    disabled={priorityActions.setDone.isPending}
                    onClick={() => priorityActions.setDone.mutate({ id: p.id, done: !p.doneAt })}
                    className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border border-border hover:border-emerald-500"
                  />
                  <span className="flex-1 truncate">{p.title}</span>
                  <button
                    type="button"
                    data-testid={`planner-priority-remove-${p.id}`}
                    title={t('planner.priorityRemove')}
                    aria-label={t('planner.priorityRemove')}
                    disabled={priorityActions.remove.isPending}
                    onClick={() => priorityActions.remove.mutate(p.id)}
                    className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          {/*
            §V2-S14b frame `13:05` — "+ Add priority". The frame puts it under
            the empty state, and it is the reason the empty state's own copy
            ("Prioritize a task to see it appear here") was not a dead end.
          */}
          <form
            className="mt-1.5 flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault()
              const title = priorityDraft.trim()
              if (!title) return
              priorityActions.add.mutate(title, { onSuccess: () => setPriorityDraft('') })
            }}
          >
            <input
              value={priorityDraft}
              onChange={(e) => setPriorityDraft(e.target.value)}
              data-testid="planner-priority-input"
              placeholder={t('planner.priorityPlaceholder')}
              aria-label={t('planner.addPriority')}
              className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-[12px]"
            />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              data-testid="planner-priority-add"
              disabled={!priorityDraft.trim() || priorityActions.add.isPending}
              className="h-7 px-2 text-[11px]"
            >
              + {t('planner.addPriority')}
            </Button>
          </form>
        </section>
        )}

        {key === 'meetWith' && (
        <section data-rail-section="meetWith">
          <h2 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t('planner.meetWith')}
          </h2>
          {meetWith ? (
            /*
             * Who you are comparing against, and a way out. Without the chip
             * the busy blocks on the grid would have no explanation — a row of
             * hatched rectangles nobody put there.
             */
            <div
              className="flex items-center justify-between gap-2 rounded-md border border-border/70 px-2 py-1.5 text-[12px]"
              data-testid="planner-meet-selected"
            >
              <span className="truncate">{meetWith.name}</span>
              <button
                type="button"
                aria-label={t('planner.clearMeetWith')}
                data-testid="planner-meet-clear"
                onClick={() => { setMeetWith(null); setMeetQuery('') }}
                className="rounded px-1 text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={meetQuery}
                onChange={(e) => setMeetQuery(e.target.value)}
                placeholder={t('planner.searchPeople')}
                aria-label={t('planner.searchPeople')}
                data-testid="planner-meet-with"
                className="h-8 w-full rounded-md border border-border/80 bg-card pl-7 pr-2 text-[12px]"
              />
              {meetQuery.trim() !== '' && (
                <div className="mt-1 space-y-0.5">
                  {meetMatches.length === 0 ? (
                    <p className="px-2 py-1 text-[11px] text-muted-foreground" data-testid="planner-meet-none">
                      {t('planner.noPeople')}
                    </p>
                  ) : (
                    meetMatches.map((m) => (
                      <button
                        key={m.userId}
                        type="button"
                        data-testid="planner-meet-result"
                        onClick={() => {
                          setMeetWith({ id: m.userId, name: m.displayName || m.email })
                          setMeetQuery('')
                        }}
                        className="block w-full truncate rounded px-2 py-1 text-left text-[12px] hover:bg-muted/40"
                      >
                        {m.displayName || m.email}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </section>
        )}

        {key === 'meetWith' && teamSchedulesSection}

        {/* Frame `13:05` puts these two between "Meet with" and "Backlog",
            which is where `RAIL_SECTIONS` puts them until an order is stored. */}
        {key === 'assignedToMe' && (
        <section data-testid="planner-assigned" data-rail-section="assignedToMe">
          <h2 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t('planner.assignedToMe')}
          </h2>
          {assigned.length === 0 ? (
            <p className="px-1 text-[11px] text-muted-foreground">{t('planner.assignedToMeEmpty')}</p>
          ) : (
            <ul className="space-y-1">
              {assigned.slice(0, 25).map((task) => (
                <li
                  key={task.id}
                  data-testid="planner-assigned-item"
                  data-task-id={task.id}
                  className="truncate rounded px-2 py-1 text-[12px] hover:bg-muted/40"
                >
                  {task.title}
                </li>
              ))}
            </ul>
          )}
        </section>
        )}

        {key === 'todayOverdue' && (
        <section data-testid="planner-today-overdue" data-rail-section="todayOverdue">
          <h2 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t('planner.todayOverdue')}
          </h2>
          {todayOverdue.length === 0 ? (
            <p className="px-1 text-[11px] text-muted-foreground">{t('planner.todayOverdueEmpty')}</p>
          ) : (
            <ul className="space-y-1">
              {todayOverdue.map((task) => {
                const late = new Date(task.dueDate as string).getTime() < startOfDay(new Date()).getTime()
                return (
                  <li
                    key={task.id}
                    data-testid="planner-today-overdue-item"
                    data-task-id={task.id}
                    data-late={late ? 'true' : 'false'}
                    className="flex items-baseline gap-1.5 rounded px-2 py-1 text-[12px] hover:bg-muted/40"
                  >
                    <span className="truncate">{task.title}</span>
                    {/* Late and due-today are both in this section; which one a
                        row is has to be readable, or the section says "you have
                        six things" and nothing about how much trouble you are
                        in. */}
                    <span
                      className={cn(
                        'ml-auto shrink-0 text-[10px]',
                        late ? 'text-rose-500' : 'text-muted-foreground',
                      )}
                    >
                      {late
                        ? t('planner.overdueSince', {
                            date: new Date(task.dueDate as string).toLocaleDateString(),
                          })
                        : t('planner.dueToday')}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
        )}

        {key === 'backlog' && (
        <section data-testid="planner-backlog" data-rail-section="backlog">
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
        )}
        </Fragment>
        ))}

        {!railShown.includes('meetWith') && teamSchedulesSection}
      </aside>

      {/* ── the grid ──────────────────────────────────────────────────── */}
      {/* `relative` so frame `14:45`'s command bar can float over the grid
          rather than over the whole viewport — it belongs to the calendar
          column, and the rail must stay clickable behind it. */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
          <button
            type="button"
            aria-label={t('planner.previousWeek')}
            data-testid="planner-prev"
            onClick={() => setAnchor((d) => plannerStep(view, d, -1))}
            className="rounded p-1 hover:bg-muted/60"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={t('planner.nextWeek')}
            data-testid="planner-next"
            onClick={() => setAnchor((d) => plannerStep(view, d, 1))}
            className="rounded p-1 hover:bg-muted/60"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="text-[13px] font-medium" data-testid="planner-month">{monthLabel}</span>
          {/*
            §V2-02e, frame `14:10` — "Calendar week number will appear in the
            header beside the month. ONLY VISIBLE FOR THE WEEK VIEW."

            The second sentence is the requirement, not a note about it: a week
            number over a Day column is a different claim ("this day is in week
            34" — true but not what was asked for) and over a Month grid it is
            simply wrong, because the month spans five of them. So the view is
            part of the condition, and the suite checks the other three spans
            draw nothing.
          */}
          {showWeekNumbers && view === 'week' && (
            <span
              className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
              data-testid="planner-week-number"
              data-week={weekNumberShown}
            >
              {t('planner.weekNumber', { n: weekNumberShown })}
            </span>
          )}
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
            Frame `13:50` — the span selector, with the frame's own single-key
            shortcuts under each label.
          */}
          <div className="ml-2 flex items-center gap-0.5" data-testid="planner-view-selector">
            {PLANNER_VIEWS.map((v) => {
              const key = Object.keys(PLANNER_VIEW_KEYS).find((k) => PLANNER_VIEW_KEYS[k] === v)
              return (
                <button
                  key={v}
                  type="button"
                  data-testid={`planner-view-${v}`}
                  aria-pressed={view === v}
                  title={`${t(`planner.view.${v}` as never)} (${key})`}
                  onClick={() => chooseView(v)}
                  className={cn(
                    'rounded px-2 py-1 text-[12px]',
                    view === v
                      ? 'bg-accent/15 font-medium text-accent'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                  )}
                >
                  {t(`planner.view.${v}` as never)}
                </button>
              )
            })}
            {/* "Show weekends" sits with the span in the frame, and writes the
                same setting the Appearance page does — one preference, two
                places to reach it. */}
            <button
              type="button"
              // `planner-weekends-toggle`, not `planner-show-weekends`: the
              // settings dialog already owns that id, and two elements under
              // one testid is a strict-mode failure in every suite that
              // touches either. planner-settings.mjs found it immediately.
              data-testid="planner-weekends-toggle"
              aria-pressed={showWeekends}
              onClick={() => saveSettings.mutate({ showWeekends: !showWeekends })}
              className={cn(
                'ml-1 rounded px-2 py-1 text-[12px]',
                showWeekends
                  ? 'bg-accent/15 font-medium text-accent'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              )}
            >
              {t('planner.showWeekends')}
            </button>
          </div>
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
          {/*
            §V2-14d, frame `13:28` — the calendar chip and its picker.

            The chip reads a COUNT OF WHAT IS ON (the frame shows `1` over a
            popover of four rows with one ticked), not a count of rows. A badge
            that rendered the number of calendars would be the facade class:
            correct-looking, and unable to ever say anything else.
          */}
          <div className="relative">
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-[12px]"
              data-testid="planner-calendars-toggle"
              aria-expanded={calendarsOpen}
              aria-label={t('planner.calendars')}
              onClick={() => setCalendarsOpen((v) => !v)}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              <span data-testid="planner-calendars-count">{visibleCalendarCount}</span>
            </Button>
            {calendarsOpen && (
              <>
                {/* A click anywhere else closes it. Without this the popover
                    stays up behind the next thing you press, which on a
                    calendar means it covers the day you were aiming for. */}
                <div
                  className="fixed inset-0 z-40"
                  aria-hidden
                  onClick={() => setCalendarsOpen(false)}
                />
                <div
                  className="absolute right-0 top-8 z-50 w-72 rounded-md border border-border/70 bg-popover p-1 shadow-md"
                  data-testid="planner-calendars-menu"
                >
                  {calendarGroups.map((group) => (
                    <div key={group.key} data-testid="planner-calendar-group" data-group-kind={group.kind}>
                      <div
                        className="px-2 pb-0.5 pt-1.5 text-[11px] text-muted-foreground"
                        data-testid="planner-calendar-group-title"
                      >
                        {group.title}
                      </div>
                      {group.calendars.map((cal) => (
                        <label
                          key={cal.id}
                          data-testid="planner-calendar-row"
                          data-calendar-id={cal.id}
                          data-checked={cal.checked ? 'true' : 'false'}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[12px] hover:bg-muted/40"
                        >
                          <input
                            type="checkbox"
                            checked={cal.checked}
                            data-testid={`planner-calendar-check-${cal.id}`}
                            disabled={setCalendarHidden.isPending || setAccountBusy.isPending}
                            onChange={(e) => {
                              const next = e.target.checked
                              if (cal.kind === 'account' && cal.accountId) {
                                setAccountBusy.mutate({ accountId: cal.accountId, checked: next })
                                return
                              }
                              const hidden = new Set(settings?.hiddenCalendarIds ?? [])
                              if (next) hidden.delete(cal.id)
                              else hidden.add(cal.id)
                              setCalendarHidden.mutate([...hidden])
                            }}
                            className="h-3.5 w-3.5"
                          />
                          <span className="flex-1 truncate">
                            {/* A workspace calendar's name is translated and
                                keyed on its id; an account's name is the
                                address the provider gave and is not. */}
                            {cal.label ?? t(`planner.calendar.${cal.id}` as never)}
                          </span>
                          {cal.isDefault && (
                            <span
                              className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground"
                              data-testid="planner-calendar-default"
                            >
                              {t('planner.calendarDefault')}
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                  ))}
                  <div className="mt-1 border-t border-border/60 pt-1">
                    <button
                      type="button"
                      data-testid="planner-calendars-manage"
                      onClick={() => {
                        setCalendarsOpen(false)
                        /* Frame `13:28`'s footer goes to the page frame `13:36`
                           draws — the same Accounts page, not a second one. */
                        setSettingsPage('accounts')
                        setSettingsOpen(true)
                      }}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] hover:bg-muted/40"
                    >
                      <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
                      {t('planner.manageAccounts')}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[12px]"
            data-testid="planner-settings"
            aria-label={t('plannerSettings.title')}
            onClick={() => { setSettingsPage(undefined); setSettingsOpen(true) }}
          >
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
        </header>

        {/*
          MONTH GETS ITS OWN LAYOUT. Day, 4 days and Week are the same hour
          gutter with a different column count, so they fall out of the range on
          their own. Thirty columns of hour gutter is not a month view, it is a
          week view nobody can read — a month is a grid of day cells with what is
          on each one.
        */}
        {showOnboarding && (
          <PlannerOnboarding
            onConnect={(p) => connectCalendar.mutate(p)}
            connecting={connectCalendar.isPending}
            canConnect={canConnect}
            onDismiss={() => dismissOnboarding.mutate()}
            dismissing={dismissOnboarding.isPending}
          />
        )}

        {teamUserIds.length > 0 && (
          <TeamSchedules
            day={days[0] ?? now}
            columns={teamColumns}
            order={teamUserIds}
            nameOf={nameOf}
            hours={hours}
            hourPx={hourPx}
            firstHour={FIRST_HOUR}
            locale={locale}
            emptyLabel={t('planner.teamNoBusy')}
          />
        )}

        {view === 'month' ? (
          <MonthGrid
            days={days}
            blocks={blocks}
            now={now}
            weekStartsOn={weekStartsOn}
            label={blockLabel}
            emptyLabel={t('planner.monthNoBlocks')}
            locale={locale}
            onPickDay={(d) => {
              setAnchor(d)
              chooseView('day')
            }}
          />
        ) : (
        <div ref={gridScrollRef} className="min-h-0 flex-1 overflow-auto">
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
                {/*
                  §V2-14d, frame `13:28` — the two WORKSPACE calendars, drawn.
                  These are the readers that make the picker's checkboxes mean
                  something: unticking "Holidays" stops the chip being drawn AND
                  stops the request that fetches it, so the setting is honoured
                  rather than merely stored. A checkbox whose only effect is a
                  row in `plannerSettings` is this ledger's mirror defect, and
                  it is the reason this row was worth more than a popover.
                */}
                {holidayCalendarOn &&
                  (workSchedule?.holidays ?? [])
                    .filter((h) => h.day.slice(0, 10) === localDayKey(d))
                    .map((h) => (
                      <div
                        key={`holiday-${h.day}`}
                        data-testid="planner-holiday-chip"
                        data-day={localDayKey(d)}
                        title={h.name}
                        className="truncate rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] text-emerald-700 dark:text-emerald-300"
                      >
                        {h.name}
                      </div>
                    ))}
                {timeOffCalendarOn &&
                  timeOff
                    .filter((o) => {
                      const key = localDayKey(d)
                      return o.startsOn.slice(0, 10) <= key && key <= o.endsOn.slice(0, 10)
                    })
                    .map((o) => (
                      <div
                        key={`timeoff-${o.id}-${localDayKey(d)}`}
                        data-testid="planner-timeoff-chip"
                        data-day={localDayKey(d)}
                        data-user-id={o.userId}
                        className="truncate rounded bg-violet-500/15 px-1.5 py-0.5 text-[11px] text-violet-700 dark:text-violet-300"
                      >
                        {t('planner.timeOffChip', { name: nameOf(o.userId) })}
                      </div>
                    ))}
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
                {/*
                  §V2-02d, frame `14:20` — overdue work rolled into TODAY, and
                  only into today. Drawn in the all-day row rather than at an
                  hour, because the one thing known about an overdue task is
                  that it did not happen when it was meant to; putting it at
                  10am would invent a time nobody chose.
                */}
                {sameDay(d, now) &&
                  overdue.map((task) => (
                    <div
                      key={`overdue-${task.id}`}
                      data-testid="planner-overdue"
                      title={t('planner.overdueSince', {
                        date: new Date(task.dueDate!).toLocaleDateString(locale),
                      })}
                      className="mt-0.5 truncate rounded border border-rose-500/40 bg-rose-500/10 px-1.5 py-0.5 text-[11px] text-rose-600 dark:text-rose-400"
                    >
                      {task.title}
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
                  data-testid="planner-hour-label"
                  className="absolute right-1 -translate-y-1/2 text-[10px] text-muted-foreground"
                  style={{ top: i * hourPx }}
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
                  data-day={localDayKey(d)}
                  data-weekend={isWeekend ? 'true' : 'false'}
                  onPointerUp={(e) => onDropInColumn(d, e)}
                  onClick={(e) => onClickColumn(d, e)}
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
                      style={{ top: i * hourPx, height: hourPx }}
                    />
                  ))}
                  {/*
                    §V2-02e — "Visually dim the hours outside your work schedule
                    on the calendar grid."

                    A separate overlay rather than a class on the column, for
                    two reasons that both matter: the weekend tint is already a
                    class there and two tints would compound into an unreadable
                    column on a Saturday that is also non-working; and an
                    element that only exists when the setting is on is something
                    a check can count, where a class that is sometimes also
                    applied for another reason is not. `pointer-events-none` so
                    a dimmed day can still be clicked and dropped on — it is
                    outside the schedule, not forbidden.
                  */}
                  {nonWorking(d) && (
                    <div
                      data-testid="planner-nonworking"
                      data-day={localDayKey(d)}
                      className="pointer-events-none absolute inset-0 bg-foreground/[0.10] dark:bg-background/40"
                    />
                  )}
                  {timed
                    .filter((b) => sameDay(new Date(b.startsAt), d))
                    .map((b) => {
                      const s = new Date(b.startsAt)
                      const e = new Date(b.endsAt)
                      const top = (s.getHours() + s.getMinutes() / 60 - FIRST_HOUR) * hourPx
                      const height = Math.max(18, ((e.getTime() - s.getTime()) / 3_600_000) * hourPx)
                      return (
                        <div
                          key={b.id}
                          data-testid="planner-block"
                          data-block-id={b.id}
                          className={cn(
                            'absolute inset-x-1 overflow-hidden rounded border px-1.5 py-0.5 text-[11px]',
                            blockTone(b),
                          )}
                          style={{ top, height }}
                        >
                          {blockLabel(b)}
                        </div>
                      )
                    })}
                  {/*
                    §V2-02 `[14:41]` — the point of searching for a person is
                    seeing when they are NOT free. Their meetings are drawn
                    behind your own blocks, hatched and muted, so the column
                    reads as "their time, not yours" at a glance. Read-only:
                    this is somebody else's calendar.
                  */}
                  {theirBusy
                    .filter((w) => sameDay(new Date(w.startsAt), d))
                    .map((w) => {
                      const s2 = new Date(w.startsAt)
                      const e2 = new Date(w.endsAt)
                      const top = (s2.getHours() + s2.getMinutes() / 60 - FIRST_HOUR) * hourPx
                      const height = Math.max(14, ((e2.getTime() - s2.getTime()) / 3_600_000) * hourPx)
                      return (
                        <div
                          /* Merged windows never overlap, so the pair is unique. */
                          key={`busy-${w.startsAt}-${w.endsAt}`}
                          data-testid="planner-busy-block"
                          data-busy-source={w.source}
                          title={busyLabel(w)}
                          className="pointer-events-none absolute inset-x-0 rounded-sm border border-dashed border-muted-foreground/40 bg-muted-foreground/10"
                          style={{ top, height }}
                        />
                      )
                    })}

                  {/*
                    §V2-02e — the next occurrences of a recurring task.

                    A FORECAST, DRAWN AS ONE: dashed, dimmed, and with no block
                    id, because none of these exist in `task_time_blocks` yet.
                    Under their own testid so that every existing check that
                    counts `planner-block` keeps counting real rows — a
                    projection that joined that count would silently change what
                    four other suites mean by "a block".
                  */}
                  {projections
                    .filter((p) => sameDay(p.startsAt, d))
                    .map((p) => {
                      const top = (p.startsAt.getHours() + p.startsAt.getMinutes() / 60 - FIRST_HOUR) * hourPx
                      const height = Math.max(18, ((p.endsAt.getTime() - p.startsAt.getTime()) / 3_600_000) * hourPx)
                      return (
                        <div
                          key={p.key}
                          data-testid="planner-recurring-block"
                          data-starts-at={p.startsAt.toISOString()}
                          title={t('planner.recurringHint')}
                          className="pointer-events-none absolute inset-x-1 overflow-hidden rounded border border-dashed border-accent/50 bg-accent/5 px-1.5 py-0.5 text-[11px] text-accent/70"
                          style={{ top, height }}
                        >
                          {p.label}
                        </div>
                      )
                    })}

                  {/*
                    §V2-02e — the personal-event draft, at the quarter hour the
                    click landed on. One at a time: a grid of half-written
                    events is a grid nobody would finish.
                  */}
                  {draft && sameDay(draft.startsAt, d) && (
                    <div
                      data-testid="planner-event-draft"
                      className="absolute inset-x-1 z-20 rounded border border-accent bg-card p-1 shadow"
                      style={{
                        top: (draft.startsAt.getHours() + draft.startsAt.getMinutes() / 60 - FIRST_HOUR) * hourPx,
                      }}
                    >
                      <input
                        autoFocus
                        value={draft.title}
                        placeholder={t('planner.personalEventPlaceholder')}
                        aria-label={t('planner.personalEvent')}
                        data-testid="planner-event-title"
                        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') return setDraft(null)
                          if (e.key !== 'Enter') return
                          e.preventDefault()
                          if (!draft.title.trim()) return
                          /*
                            THE SWITCH, AND THE ONLY PLACE IT IS READ. On, this
                            posts. Off, it stops here and asks — which is the
                            difference between "saves quickly" and "saves".
                          */
                          if (saveQuickly) savePersonalEvent()
                          else setDraft({ ...draft, confirming: true })
                        }}
                        className="h-6 w-full rounded border border-border bg-background px-1 text-[11px]"
                      />
                      {draft.confirming && (
                        <div className="mt-1 flex items-center gap-1" data-testid="planner-event-confirm">
                          <span className="flex-1 truncate text-[10px] text-muted-foreground">
                            {new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(draft.startsAt)}
                          </span>
                          <button
                            type="button"
                            data-testid="planner-event-save"
                            onClick={savePersonalEvent}
                            className="rounded bg-accent px-1.5 py-0.5 text-[10px] text-accent-foreground"
                          >
                            {t('common.save')}
                          </button>
                          <button
                            type="button"
                            data-testid="planner-event-cancel"
                            onClick={() => setDraft(null)}
                            className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {t('common.cancel')}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

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
        )}

        {/*
          §V2-15d, frame `14:45` — the bottom command bar, floating over the
          grid and reading "Search events, teammates, commands…".

          IT IS A LAUNCHER, NOT A SECOND PALETTE, and that decision is the
          whole row. Rundesk already has a command palette that searches tasks,
          docs, files, PEOPLE and MEETINGS and takes `/` commands — every one
          of the three things this placeholder promises. Writing a planner-local
          search box beside it would have produced two search surfaces with two
          result lists, two sets of filters and two ideas of what a command is,
          which is the duplicated-list defect at its largest scale: the bug
          that gave this codebase three field-type pickers offering different
          types. So the bar opens the same component the ⌘K palette opens, and
          anything taught to one is true of the other on the same day.

          Mounted only while open, mirroring `routes/app.tsx`: the palette
          registers a window-level ⌘K listener of its own, so an always-mounted
          second copy would make one keypress toggle two palettes.
        */}
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center px-4">
          <button
            type="button"
            data-testid="planner-command-bar"
            onClick={() => setPaletteOpen(true)}
            className="pointer-events-auto flex w-full max-w-xl items-center gap-2 rounded-full border border-border/70 bg-popover px-4 py-2.5 text-left text-[13px] text-muted-foreground shadow-lg hover:bg-muted/40"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate" data-testid="planner-command-bar-placeholder">
              {t('planner.commandBar')}
            </span>
          </button>
        </div>
        {paletteOpen && (
          <Suspense fallback={null}>
            <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
          </Suspense>
        )}
      </div>
    </div>
  )
}

/**
 * §V2-S14c frame `13:50` — the Month span.
 *
 * A calendar month, one cell per day, with what is scheduled on it. Not the
 * hour gutter with thirty columns: at that width every block is a sliver and
 * the labels are unreadable, which is a week view pretending to be a month.
 *
 * Clicking a day jumps to Day view on it. A month is for finding the day; the
 * day is for reading the hours.
 */
function MonthGrid({
  days,
  blocks,
  now,
  weekStartsOn,
  label,
  emptyLabel,
  locale,
  onPickDay,
}: {
  days: Date[]
  blocks: Block[]
  now: Date
  weekStartsOn: number
  label: (b: Block) => string
  emptyLabel: string
  locale: string
  onPickDay: (d: Date) => void
}) {
  /*
   * Leading blanks so the 1st lands under its own weekday. Without them a month
   * beginning on a Thursday would draw every date under the wrong column name —
   * the one thing a month grid exists to get right.
   */
  const lead = days.length > 0 ? (days[0].getDay() - weekStartsOn + 7) % 7 : 0
  const weekdayNames = Array.from({ length: 7 }, (_, i) =>
    new Date(2026, 1, 1 + ((i + weekStartsOn) % 7 || 7)).toLocaleDateString(locale, {
      weekday: 'short',
    }),
  )

  return (
    <div className="min-h-0 flex-1 overflow-auto p-2" data-testid="planner-month-grid">
      <div className="grid grid-cols-7 gap-1">
        {weekdayNames.map((name) => (
          <div key={name} className="px-1 pb-1 text-[10px] uppercase text-muted-foreground">
            {name}
          </div>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <div key={`lead-${i}`} aria-hidden />
        ))}
        {days.map((d) => {
          const onThisDay = blocks.filter((b) => sameDay(new Date(b.startsAt), d))
          const isToday = sameDay(d, now)
          return (
            <button
              key={d.toISOString()}
              type="button"
              data-testid="planner-month-cell"
              data-today={isToday ? 'true' : 'false'}
              onClick={() => onPickDay(d)}
              className={cn(
                'min-h-[72px] rounded border border-border/50 p-1 text-left align-top hover:border-accent/60',
                isToday && 'border-accent/70 bg-accent/5',
              )}
            >
              <div
                className={cn(
                  'mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px]',
                  isToday && 'bg-accent font-medium text-accent-foreground',
                )}
              >
                {d.getDate()}
              </div>
              {onThisDay.length === 0 ? (
                <div className="px-0.5 text-[10px] text-muted-foreground/70">{emptyLabel}</div>
              ) : (
                <ul className="space-y-0.5">
                  {onThisDay.slice(0, 3).map((b) => (
                    <li
                      key={b.id}
                      data-testid="planner-month-block"
                      className="truncate rounded bg-accent/15 px-1 py-0.5 text-[10px] text-accent"
                    >
                      {label(b)}
                    </li>
                  ))}
                  {onThisDay.length > 3 && (
                    <li className="px-1 text-[10px] text-muted-foreground">
                      +{onThisDay.length - 3}
                    </li>
                  )}
                </ul>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * §V2-15c, frames `12:40`–`12:50` — the planner onboarding screen.
 *
 * What the frames draw, in order: the headline **"You, but better organized"**,
 * a line of explanation, **"Get started with"** over **Google Calendar** and
 * **Microsoft Outlook**, and to the right a CAROUSEL of feature cards with
 * `←` `→` paging underneath. The carousel visibly advances between `12:40`
 * and `12:45`, which is how we know the arrows are real rather than decoration.
 *
 * FOUR CARDS, because four is what the frames show: Join your next meeting
 * (`12:40`), Automate your meeting notes (`12:40`/`12:45`), Block time for your
 * tasks (`12:45`/`12:48`) and Team schedules (`12:48`/`12:50`). The last one is
 * the card §V2-15b builds, so the panel is not promising anything this product
 * does not do — which was the risk worth checking before writing it, because a
 * carousel of things you cannot have is worse than no carousel.
 */
function PlannerOnboarding({
  onConnect,
  connecting,
  canConnect,
  onDismiss,
  dismissing,
}: {
  onConnect: (provider: 'gcal' | 'outlook') => void
  connecting: boolean
  /** true / false once the server has said; null while it has not. */
  canConnect: (provider: 'gcal' | 'outlook') => boolean | null
  onDismiss: () => void
  dismissing: boolean
}) {
  const { t } = useTranslation()
  const [card, setCard] = useState(0)
  /*
   * The keys, not the strings. Each card is a title and a body in four
   * locales; holding English here would be the i18n version of the hard-coded
   * list, and the fallback would quietly serve English to Arabic and Urdu
   * readers — which is the defect the ledger's `relativeTime` entry describes.
   */
  const CARDS = ['joinMeeting', 'meetingNotes', 'blockTime', 'teamSchedules'] as const
  /* Wraps both ways: an arrow that stops at the end is an arrow people press
   * twice and conclude is broken. */
  const step = (delta: number) => setCard((c) => (c + delta + CARDS.length) % CARDS.length)
  const key = CARDS[card]

  return (
    <section
      data-testid="planner-onboarding"
      className="border-b border-border/60 bg-muted/20 px-5 py-4"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-md">
          <h2 className="text-[19px] font-semibold leading-tight" data-testid="planner-onboarding-title">
            {t('planner.onboarding.title')}
          </h2>
          <p className="mt-1.5 text-[12px] text-muted-foreground" data-testid="planner-onboarding-subtitle">
            {t('planner.onboarding.subtitle')}
          </p>
          <div className="mt-3 text-[11px] uppercase tracking-wide text-muted-foreground">
            {t('planner.onboarding.getStartedWith')}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {/*
              The SAME `oauth/start` the App Center and the Accounts page use.
              A connect button on a third surface with its own idea of the flow
              is how one of them ends up pointing at a provider key nobody set.
            */}
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-[12px]"
              data-testid="planner-onboarding-connect-gcal"
              disabled={connecting || canConnect('gcal') !== true}
              title={canConnect('gcal') === false ? t('planner.onboarding.notConfigured') : undefined}
              onClick={() => onConnect('gcal')}
            >
              {t('planner.onboarding.google')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-[12px]"
              data-testid="planner-onboarding-connect-outlook"
              disabled={connecting || canConnect('outlook') !== true}
              title={canConnect('outlook') === false ? t('planner.onboarding.notConfigured') : undefined}
              onClick={() => onConnect('outlook')}
            >
              {t('planner.onboarding.outlook')}
            </Button>
          </div>
          {(canConnect('gcal') === false || canConnect('outlook') === false) && (
            <p className="mt-1.5 text-[11px] text-muted-foreground" data-testid="planner-onboarding-not-configured">
              {t('planner.onboarding.notConfigured')}
            </p>
          )}
        </div>

        {/* The carousel. One card at a time, with the frame's own pager. */}
        <div className="w-full max-w-md shrink-0">
          <div
            className="rounded-lg border border-border/70 bg-card p-3"
            data-testid="planner-onboarding-card"
            data-card={key}
            data-card-index={card}
          >
            <div className="text-[13px] font-medium" data-testid="planner-onboarding-card-title">
              {t(`planner.onboarding.card.${key}.title` as never)}
            </div>
            <p className="mt-1 text-[12px] text-muted-foreground" data-testid="planner-onboarding-card-body">
              {t(`planner.onboarding.card.${key}.body` as never)}
            </p>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label={t('planner.onboarding.previous')}
                data-testid="planner-onboarding-prev"
                onClick={() => step(-1)}
                className="rounded border border-border/70 p-1 hover:bg-muted/60"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label={t('planner.onboarding.next')}
                data-testid="planner-onboarding-next"
                onClick={() => step(1)}
                className="rounded border border-border/70 p-1 hover:bg-muted/60"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
              <span className="ml-1 text-[11px] text-muted-foreground" data-testid="planner-onboarding-position">
                {card + 1}/{CARDS.length}
              </span>
            </div>
            {/*
              A way out. The panel exists to ask for something; a request you
              cannot decline is an advertisement, and it would sit on top of
              this person's calendar for as long as they chose not to connect
              a Google account — which some people never will.
            */}
            <button
              type="button"
              data-testid="planner-onboarding-dismiss"
              disabled={dismissing}
              onClick={onDismiss}
              className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              {t('planner.onboarding.dismiss')}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

/**
 * §V2-15b, frame `12:48` — several people's calendars SIDE BY SIDE.
 *
 * ONE DAY, ONE COLUMN PER PERSON. That shape is forced by the question the
 * card asks — "see calendars for anyone in your team, find a time, and
 * schedule a call in seconds" — which is about a moment, not about a fortnight:
 * you are looking for the gap all of you share. A week per person would be
 * seven sub-columns times N people, and at four people that is twenty-eight
 * columns nobody can compare across.
 *
 * EACH COLUMN DRAWS ITS OWN PERSON'S WINDOWS, and the suite asserts exactly
 * that, because the failure worth guarding is the cheap one: a grid that maps
 * every column to `columns[0]` looks completely right until two people have
 * different schedules. `byUser` is keyed rather than indexed so a column can
 * never fall back to a neighbour when the server returns them in another
 * order.
 *
 * Titles are NEVER read here. A window is a start, an end and a source — see
 * `free-busy.ts`, where the absence of a title field is the privacy rule
 * rather than a line somebody has to remember to write.
 */
function TeamSchedules({
  day,
  columns,
  order,
  nameOf,
  hours,
  hourPx,
  firstHour,
  locale,
  emptyLabel,
}: {
  day: Date
  columns: Array<{ userId: string; busy?: BusyWindow[]; error: string | null }>
  order: string[]
  nameOf: (userId: string) => string
  hours: number[]
  hourPx: number
  firstHour: number
  locale: string
  emptyLabel: string
}) {
  const { t } = useTranslation()
  const byUser = new Map(columns.map((c) => [c.userId, c]))
  /*
   * A WINDOW OF HOURS, not the whole 24. The band shares the page with the
   * personal grid below it, and a full day at even the Default hour height is
   * taller than the viewport on its own. Centred on the working day, which is
   * where the gap you are hunting for actually is.
   */
  const shown = hours.filter((h) => h >= 7 && h <= 20)
  const bandHeight = shown.length * Math.round(hourPx / 2)
  const rowPx = Math.round(hourPx / 2)
  const topFor = (iso: string) => {
    const d = new Date(iso)
    return (d.getHours() + d.getMinutes() / 60 - shown[0]) * rowPx
  }

  return (
    <section
      className="border-b border-border/60 px-3 py-2"
      data-testid="planner-team-grid"
      data-people={order.length}
    >
      <div className="mb-1 flex items-baseline gap-2">
        <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {t('planner.teamSchedules')}
        </h2>
        <span className="text-[11px] text-muted-foreground" data-testid="planner-team-day">
          {new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(day)}
        </span>
      </div>
      <div
        className="grid overflow-hidden rounded-md border border-border/60"
        style={{ gridTemplateColumns: `48px repeat(${order.length}, minmax(0, 1fr))` }}
      >
        {/* The shared gutter — one set of hours for every column, which is what
            makes two columns comparable by eye. */}
        <div className="relative border-r border-border/40" style={{ height: bandHeight + 22 }}>
          <div className="h-[22px] border-b border-border/40" />
          {shown.map((h, i) => (
            <div
              key={h}
              data-testid="planner-team-hour"
              className="absolute right-1 -translate-y-1/2 text-[10px] text-muted-foreground"
              style={{ top: 22 + i * rowPx }}
            >
              {new Intl.DateTimeFormat(locale, { hour: 'numeric' }).format(new Date(2026, 0, 1, h))}
            </div>
          ))}
        </div>

        {order.map((userId) => {
          const col = byUser.get(userId)
          const windows = (col?.busy ?? []).filter((w) => sameDay(new Date(w.startsAt), day))
          return (
            <div
              key={userId}
              data-testid="planner-team-column"
              data-user-id={userId}
              data-busy-count={windows.length}
              className="relative border-l border-border/40"
              style={{ height: bandHeight + 22 }}
            >
              <div
                className="flex h-[22px] items-center truncate border-b border-border/40 px-1.5 text-[11px] font-medium"
                data-testid="planner-team-column-name"
              >
                {nameOf(userId)}
              </div>
              {col?.error ? (
                /*
                 * A column that could not be read SAYS SO. Rendering it empty
                 * would draw "could not reach this person's calendar" and "this
                 * person is free all day" identically — the confident zero, on
                 * the one screen where it would get a meeting booked over
                 * somebody's morning.
                 */
                <p className="px-1.5 py-2 text-[10px] text-muted-foreground" data-testid="planner-team-error">
                  {t('planner.teamColumnError')}
                </p>
              ) : windows.length === 0 ? (
                <p className="px-1.5 py-2 text-[10px] text-muted-foreground" data-testid="planner-team-free">
                  {emptyLabel}
                </p>
              ) : (
                windows.map((w) => {
                  const s = new Date(w.startsAt)
                  const e = new Date(w.endsAt)
                  const top = 22 + Math.max(0, topFor(w.startsAt))
                  const height = Math.max(10, ((e.getTime() - s.getTime()) / 3_600_000) * rowPx)
                  return (
                    <div
                      key={`${userId}-${w.startsAt}-${w.endsAt}`}
                      data-testid="planner-team-busy"
                      /* The owning person is on the ELEMENT, so a check can ask
                         "is this window in the right column" rather than
                         inferring it from where the element happens to sit. */
                      data-user-id={userId}
                      data-starts-at={w.startsAt}
                      data-busy-source={w.source}
                      className="absolute inset-x-1 rounded border border-border/60 bg-foreground/10"
                      style={{ top, height }}
                    />
                  )
                })
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

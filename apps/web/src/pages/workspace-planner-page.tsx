import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, cn, toast } from '@rundesk/ui'
import { ChevronLeft, ChevronRight, Flag, Search, Settings2 } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import { useAuthStore } from '../store/auth'
import { PlannerSettingsDialog, RAIL_SECTIONS } from '../components/planner-settings-dialog'
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
  /** Frame `14:10`: Subtle | Solid. */
  eventStyle?: 'subtle' | 'solid'
  colorTasksBy?: 'none' | 'priority' | 'status'
  /** Which rail sections are shown — the Sidebar page. */
  railSections?: string[]
  /** A `users` column, surfaced here because the Appearance page edits it. */
  weekStart?: string
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
   * §V2-02 `[14:41]` — "yahan se main SEARCH kar sakti hoon [ke] mujhe kis
   * person ke saath milna hai." Until now this was an input with nothing
   * behind it: you could type into it and the page did not so much as read
   * what you typed.
   */
  const [meetQuery, setMeetQuery] = useState('')
  const [meetWith, setMeetWith] = useState<{ id: string; name: string } | null>(null)

  const { data: settings } = useQuery({
    queryKey: ['planner-settings', workspaceId],
    queryFn: () => api<PlannerSettings>(`/planner/${workspaceId}/settings`),
    enabled: !!workspaceId,
  })
  const showWeekends = settings?.showWeekends !== false

  /*
   * The account's own week start, not a hard-coded Monday. `users.weekStart`
   * is what every other date in the product honours, and a calendar that
   * disagreed with the rest of the app about which day the week begins on
   * would be the most visible possible place to disagree.
   */
  const weekStartsOn = { sunday: 0, monday: 1, saturday: 6 }[settings?.weekStart ?? 'sunday'] ?? 0
  const weekStart = useMemo(() => startOfWeek(anchor, weekStartsOn), [anchor, weekStartsOn])

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
   */
  const openAssigned = useMemo(
    () => assigned.filter((task) => task.statusCategory !== 'closed'),
    [assigned],
  )
  const todayOverdue = useMemo(() => {
    const endOfToday = startOfDay(addDays(new Date(), 1)).getTime()
    return openAssigned
      .filter((task) => {
        if (!task.dueDate) return false
        const due = new Date(task.dueDate).getTime()
        return Number.isFinite(due) && due < endOfToday
      })
      .slice(0, 25)
  }, [openAssigned])

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
   */
  const railOn = (key: string) => (settings?.railSections ?? [...RAIL_SECTIONS]).includes(key)
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
  const dayName = (d: Date) => new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d)

  const hours = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => FIRST_HOUR + i)
  const gridHeight = hours.length * HOUR_PX

  /** Where the red line sits, or null when now is outside the drawn hours. */
  const nowOffset = useMemo(() => {
    const h = now.getHours() + now.getMinutes() / 60
    if (h < FIRST_HOUR || h > LAST_HOUR + 1) return null
    return (h - FIRST_HOUR) * HOUR_PX
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
    el.scrollTop = Math.max(0, nowOffset - HOUR_PX)
    // Mount only, deliberately: `nowOffset` changes every minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const allDay = blocks.filter((b) => b.isAllDay)
  const timed = blocks.filter((b) => !b.isAllDay)

  return (
    <div className="flex h-full min-h-0" data-testid="planner-page">
      {/* What is being dragged, under the pointer. A drag with no feedback is
          a drag people do not believe is happening. */}
      <PlannerSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        workspaceId={workspaceId}
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
      <aside className="w-64 shrink-0 border-r border-border/60 overflow-y-auto p-3 space-y-4">
        <h1 className="text-[13px] font-semibold">{t('planner.title')}</h1>

        {railOn('priorities') && (
        <section data-testid="planner-priorities">
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

        {railOn('meetWith') && (
        <section>
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

        {/* Frame `13:05` puts these two between "Meet with" and "Backlog". */}
        {railOn('assignedToMe') && (
        <section data-testid="planner-assigned">
          <h2 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t('planner.assignedToMe')}
          </h2>
          {openAssigned.length === 0 ? (
            <p className="px-1 text-[11px] text-muted-foreground">{t('planner.assignedToMeEmpty')}</p>
          ) : (
            <ul className="space-y-1">
              {openAssigned.slice(0, 25).map((task) => (
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

        {railOn('todayOverdue') && (
        <section data-testid="planner-today-overdue">
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

        {railOn('backlog') && (
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
        )}
      </aside>

      {/* ── the grid ──────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
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
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[12px]"
            data-testid="planner-settings"
            aria-label={t('plannerSettings.title')}
            onClick={() => setSettingsOpen(true)}
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
                      const top = (s2.getHours() + s2.getMinutes() / 60 - FIRST_HOUR) * HOUR_PX
                      const height = Math.max(14, ((e2.getTime() - s2.getTime()) / 3_600_000) * HOUR_PX)
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

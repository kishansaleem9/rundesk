import { useMemo, useState } from 'react'
import { useParams, Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Card,
  EmptyState,
  Badge,
  PersonAvatar,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  Popover,
  PopoverContent,
  PopoverTrigger,
  toast,
  cn,
} from '@rundesk/ui'
import { ListSkeleton } from '../components/loading-skeletons'
import { Users, Calendar, AlertTriangle, Download } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import { localDayKey } from '../lib/local-date'
import { useAuthStore } from '../store/auth'
import { useWorkspaceRole } from '../hooks/use-workspace-role'
import { InlineSkeleton } from '../components/loading-skeletons'
import { CapacityBadge, loadColor, useSetsCapacityOf } from '../components/workload-parts'

export function WorkloadPage() {
  const { t } = useTranslation()
  const { workspaceId } = useParams({ from: '/app/$workspaceId/workload' })
  const [view, setView] = useState<'7d' | '14d' | '30d'>('14d')
  const days = view === '7d' ? 7 : view === '14d' ? 14 : 30
  const workloadQuery = useQuery({
    queryKey: ['workload-report', workspaceId, days],
    queryFn: () =>
      api<
        Array<{
          userId?: string
          name: string
          email?: string | null
          role?: string
          capacity: number
          weeklyCapacityHours?: number
          dailyLoads: number[]
          // §A4.10 — per-day capacity, zero on a day off.
          dailyCapacities?: number[]
          daysOff?: string[]
          // A5.14 — actuals, so the view can show over/under-delivery instead
          // of comparing the plan against itself.
          estimatedHours?: number
          trackedHours?: number
          windowCapacityHours?: number
          trackedWindowDays?: number
          // Assigned and open but loading no day: no estimate, or no date.
          unestimatedTasks?: number
          unscheduledTasks?: number
        }>
      >(`/workspaces/${workspaceId}/reports/workload?days=${days}`),
  })

  const dates = useMemo(() => {
    const arr: Date[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    for (let i = 0; i < days; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() + i)
      arr.push(d)
    }
    return arr
  }, [days])
  const people = useMemo(() => {
    if (!workloadQuery.data) return []
    return workloadQuery.data.map((p) => ({
      userId: p.userId,
      name: p.name,
      role: p.role ?? t('workload.defaultRole'),
      capacity: p.capacity || 8,
      weeklyCapacityHours: p.weeklyCapacityHours ?? Math.round((p.capacity || 8) * 5),
      dailyLoads: p.dailyLoads,
      dailyCapacities: p.dailyCapacities ?? p.dailyLoads.map(() => p.capacity || 8),
      daysOff: new Set(p.daysOff ?? []),
      estimatedHours: p.estimatedHours ?? p.dailyLoads.reduce((sum, load) => sum + load, 0),
      trackedHours: p.trackedHours ?? 0,
      windowCapacityHours: p.windowCapacityHours ?? 0,
    }))
  }, [workloadQuery.data, t])
  const trackedWindowDays = workloadQuery.data?.[0]?.trackedWindowDays ?? days
  // Whose capacity this reader sets (`components/workload-parts.tsx`).
  const setsCapacityOf = useSetsCapacityOf(workspaceId)
  // A day off has zero capacity, so any load on it would read as overload; the
  // person is away, which is a scheduling problem, not a capacity one.
  const uncounted = (workloadQuery.data ?? []).reduce(
    (acc, p) => ({ unestimated: acc.unestimated + (p.unestimatedTasks ?? 0), unscheduled: acc.unscheduled + (p.unscheduledTasks ?? 0) }),
    { unestimated: 0, unscheduled: 0 },
  )
  const overloadedCount = people.filter((p) =>
    p.dailyLoads.some((load, i) => (p.dailyCapacities[i] ?? p.capacity) > 0 && load > (p.dailyCapacities[i] ?? p.capacity)),
  ).length

  const exportCsv = () => {
    if (people.length === 0) return
    // The reader's own day: the columns are local midnights, and the UTC date
    // of one is the day before, east of Greenwich.
    const fmtDate = localDayKey
    const header = [t('workload.csvMember'), t('workload.csvRole'), t('workload.csvDailyCapacity'), t('workload.csvWeeklyCapacity'), ...dates.map(fmtDate), t('workload.csvTotal')]
    const rows = people.map((p) => [
      p.name,
      p.role,
      p.capacity,
      p.weeklyCapacityHours,
      ...dates.map((_, i) => Number((p.dailyLoads[i] ?? 0).toFixed(1))),
      Number(p.dailyLoads.reduce((s, v) => s + v, 0).toFixed(1)),
    ])
    const escape = (v: string | number) => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const csv = [header, ...rows].map((row) => row.map(escape).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `workload-${days}d-${localDayKey(new Date())}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-6 space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">
            {t('workload.eyebrow')}
          </div>
          <h1 className="font-display text-3xl font-semibold flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient-soft text-white shadow-glow">
              <Users className="h-4 w-4" />
            </span>
            {t('nav.workload')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
            {t('workload.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="secondary"
            size="sm"
            onClick={exportCsv}
            disabled={people.length === 0}
            className="gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            {t('workload.exportCsv')}
          </Button>
          <div className="flex items-center gap-1 bg-card/40 border border-border/60 rounded-lg p-1 backdrop-blur-sm">
            {(['7d', '14d', '30d'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  'text-xs px-3 py-1.5 rounded-md transition-all font-medium',
                  view === v
                    ? 'bg-brand-gradient text-white shadow-sm'
                    : 'hover:bg-card/60 text-muted-foreground hover:text-foreground',
                )}
              >
                {t('workload.nDays', { count: parseInt(v, 10) })}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Legend */}
      <Card variant="glass" className="flex flex-wrap items-center gap-4 p-3 px-4 text-xs">
        <span className="text-muted-foreground">{t('nav.workload')}</span>
        {[
          { label: t('workload.legendLight'), cls: 'bg-mint/40' },
          { label: t('workload.legendBalanced'), cls: 'bg-mint/70' },
          { label: t('workload.legendFull'), cls: 'bg-warning/70' },
          { label: t('workload.legendOver'), cls: 'bg-destructive/80' },
        ].map((l) => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div className={`h-3 w-5 rounded ${l.cls}`} />
            <span>{l.label}</span>
          </div>
        ))}
        <span className="ml-auto text-muted-foreground flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          {t('workload.overloaded', { count: overloadedCount })}
        </span>
        {/*
          What the heat map does not count, said rather than hidden: a task with
          no estimate adds no hours, and one with no date loads no day — as
          ClickUp's Workload lists them aside. It used to give each four hours.
        */}
        {uncounted.unestimated + uncounted.unscheduled > 0 && (
          <span
            className="basis-full text-muted-foreground"
            data-testid="workload-uncounted"
            data-unestimated={uncounted.unestimated}
            data-unscheduled={uncounted.unscheduled}
          >
            {t('workload.uncounted', { unestimated: uncounted.unestimated, unscheduled: uncounted.unscheduled })}
          </span>
        )}
      </Card>

      <TimeAwayCard
        workspaceId={workspaceId}
        people={people.filter((p): p is typeof p & { userId: string } => Boolean(p.userId))}
      />

      {/* A5.14 — capacity vs estimated vs tracked. The heat map plans forward;
          tracked time is necessarily behind, so its window is named explicitly
          rather than blended into the same numbers. */}
      {people.length > 0 && (
        <Card variant="glass" className="p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-border/60">
            <h2 className="text-sm font-semibold">{t('workload.timeReportingTitle')}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('workload.timeReportingDesc', { days: trackedWindowDays })}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-[10px] uppercase tracking-widest text-muted-foreground">
                  <th className="text-start font-semibold px-4 py-2">{t('workload.teammate')}</th>
                  <th className="text-end font-semibold px-4 py-2">{t('workload.colCapacity')}</th>
                  <th className="text-end font-semibold px-4 py-2">{t('workload.colEstimated')}</th>
                  <th className="text-end font-semibold px-4 py-2">{t('workload.colTracked')}</th>
                  <th className="text-end font-semibold px-4 py-2">{t('workload.colDelta')}</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => {
                  const delta = Math.round((p.trackedHours - p.windowCapacityHours) * 10) / 10
                  return (
                    <tr key={p.userId} className="border-b border-border/40 last:border-0">
                      <td className="px-4 py-2 truncate">{p.name}</td>
                      <td className="px-4 py-2 text-end tabular-nums text-muted-foreground">
                        {p.windowCapacityHours.toFixed(1)}h
                      </td>
                      <td className="px-4 py-2 text-end tabular-nums text-muted-foreground">
                        {p.estimatedHours.toFixed(1)}h
                      </td>
                      <td className="px-4 py-2 text-end tabular-nums">{p.trackedHours.toFixed(1)}h</td>
                      <td
                        className={cn(
                          'px-4 py-2 text-end tabular-nums font-medium',
                          delta > 0 ? 'text-destructive' : delta < 0 ? 'text-muted-foreground' : '',
                        )}
                      >
                        {delta > 0 ? '+' : ''}
                        {delta.toFixed(1)}h
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Heat map */}
      {/*
        The heat map scrolls in a bounded pane, so its header can stick: it was
        `sticky top-0` inside an `overflow-x-auto` box with no height, which was
        its scrollport and never scrolled (`resume-defects/resume-6-workload`).
        The pane is the header's scrollport now, so the card's own overflow
        does not decide it.
      */}
      <Card variant="glass" className="overflow-hidden p-0">
        <div className="max-h-[70vh] overflow-auto">
          <div className="min-w-max">
            {/* Header row */}
            <div className="flex border-b border-border/60 sticky top-0 bg-card/95 backdrop-blur-sm z-10" data-testid="workload-heat-head">
              <div className="w-[200px] shrink-0 px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground border-r border-border/60">
                {t('workload.teammate')}
              </div>
              {dates.map((d, i) => {
                const isWeekend = d.getDay() === 0 || d.getDay() === 6
                const isToday = i === 0
                return (
                  <div
                    key={i}
                    className={cn(
                      'w-12 px-1 py-2 text-center border-r border-border/30 last:border-r-0',
                      isWeekend && 'bg-muted/30',
                      isToday && 'bg-accent/10',
                    )}
                  >
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2)}
                    </div>
                    <div
                      className={cn(
                        'text-xs font-medium tabular-nums',
                        isToday && 'text-accent font-semibold',
                      )}
                    >
                      {d.getDate()}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Person rows */}
            {/* Keyed by userId, not name: two people can share a display name,
                and React silently drops or duplicates rows with the same key. */}
            {people.map((p) => (
              <div key={p.userId} className="flex border-b border-border/30 last:border-b-0 group">
                <div className="w-[200px] shrink-0 flex items-center gap-2.5 px-4 py-2.5 border-r border-border/60 bg-card/50">
                  <PersonAvatar name={p.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{p.role}</div>
                  </div>
                  <CapacityBadge workspaceId={workspaceId} person={p} editable={setsCapacityOf(p.userId)} />
                </div>
                {dates.map((d, i) => (
                  <WorkloadCell
                    key={i}
                    workspaceId={workspaceId}
                    person={p}
                    date={d}
                    index={i}
                    days={days}
                    away={p.daysOff.has(toDateStr(d))}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </Card>

      {workloadQuery.isPending && <ListSkeleton rows={4} rowClassName="h-20" />}

      {!workloadQuery.isPending && people.length === 0 && (
        <EmptyState
          icon={<Calendar className="h-6 w-6" />}
          title={t('workload.noTeammates')}
          description={t('workload.noTeammatesDesc')}
        />
      )}
    </div>
  )
}

type TimeOffEntry = {
  id: string
  userId: string
  startsOn: string
  endsOn: string
  note: string | null
  displayName: string
}

/**
 * §A4.10 — the workload view is where absence changes a decision, so leave is
 * recorded here rather than in a settings screen nobody opens while planning.
 * Anyone may record their own; managers may record anyone's (enforced server
 * side — the picker just stops offering what would be rejected).
 */
function TimeAwayCard({
  workspaceId,
  people,
}: {
  workspaceId: string
  people: Array<{ userId: string; name: string }>
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const { isManagerOrAbove: isManager } = useWorkspaceRole(workspaceId)
  const [expanded, setExpanded] = useState(false)
  const [userId, setUserId] = useState('')
  const [startsOn, setStartsOn] = useState('')
  const [endsOn, setEndsOn] = useState('')

  const from = toDateStr(new Date())
  const entriesQuery = useQuery({
    queryKey: ['time-off', workspaceId, from],
    queryFn: () => api<TimeOffEntry[]>(`/workspaces/${workspaceId}/time-off?from=${from}`),
    enabled: !!workspaceId,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['time-off', workspaceId] })
    qc.invalidateQueries({ queryKey: ['workload-report', workspaceId] })
  }

  const add = useMutation({
    mutationFn: () =>
      api(`/workspaces/${workspaceId}/time-off`, {
        method: 'POST',
        body: { userId: userId || undefined, startsOn, endsOn: endsOn || startsOn },
      }),
    onSuccess: () => {
      setStartsOn('')
      setEndsOn('')
      toast.success(t('workload.timeAwayAdded'))
      invalidate()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api(`/workspaces/${workspaceId}/time-off/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
    onError: (err: Error) => toast.error(err.message),
  })

  const entries = entriesQuery.data ?? []
  const assignable = isManager ? people : people.filter((p) => p.userId === currentUser?.id)

  return (
    <Card variant="glass" className="p-0 overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-start hover:bg-accent/5"
        onClick={() => setExpanded((v) => !v)}
      >
        <div>
          <h2 className="text-sm font-semibold">{t('workload.timeAwayTitle')}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t('workload.timeAwayDesc')}</p>
        </div>
        <Badge variant="soft" className="text-[10px] tabular-nums shrink-0">
          {entries.length}
        </Badge>
      </button>

      {expanded && (
        <div className="border-t border-border/60 p-4 space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="h-9 rounded-md border border-border bg-card px-2 text-sm"
            >
              <option value="">{t('workload.timeAwayMe')}</option>
              {assignable
                .filter((p) => p.userId !== currentUser?.id)
                .map((p) => (
                  <option key={p.userId} value={p.userId}>
                    {p.name}
                  </option>
                ))}
            </select>
            <input
              type="date"
              value={startsOn}
              onChange={(e) => setStartsOn(e.target.value)}
              className="h-9 rounded-md border border-border bg-card px-2 text-sm"
              aria-label={t('workload.timeAwayFrom')}
            />
            <input
              type="date"
              value={endsOn}
              onChange={(e) => setEndsOn(e.target.value)}
              className="h-9 rounded-md border border-border bg-card px-2 text-sm"
              aria-label={t('workload.timeAwayTo')}
            />
            <Button size="sm" disabled={!startsOn || add.isPending} onClick={() => add.mutate()}>
              {t('workload.timeAwayAdd')}
            </Button>
          </div>

          {entries.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('workload.timeAwayEmpty')}</p>
          ) : (
            <ul className="divide-y divide-border/40">
              {entries.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="flex-1 min-w-0 truncate">
                    <span className="font-medium">{entry.displayName}</span>
                    <span className="ml-2 text-muted-foreground tabular-nums">
                      {entry.startsOn === entry.endsOn
                        ? entry.startsOn
                        : `${entry.startsOn} → ${entry.endsOn}`}
                    </span>
                  </span>
                  {(isManager || entry.userId === currentUser?.id) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => remove.mutate(entry.id)}
                      disabled={remove.isPending}
                    >
                      {t('common.remove')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  )
}


type WorkloadDayTask = {
  id: string
  title: string
  status: string
  statusCategory: string
  priority?: 'urgent' | 'high' | 'normal' | 'low' | null
  hours: number
  listId: string
  listName: string
  projectId: string
  projectName: string
  spaceId: string
  spaceName: string
}

function priorityDot(priority?: string | null): string {
  switch (priority) {
    case 'urgent':
      return 'bg-destructive'
    case 'high':
      return 'bg-warning'
    case 'low':
      return 'bg-muted-foreground'
    default:
      return 'bg-accent'
  }
}

/** Local YYYY-MM-DD (avoids the UTC shift toISOString would introduce). */
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * A single workload heat-map cell (§5.6). Empty cells are hover-only; loaded
 * cells become a click target that opens a popover listing the tasks that
 * compose that day's load for that person, each linking to its list.
 */
function WorkloadCell({
  workspaceId,
  person,
  date,
  index,
  days,
  away,
}: {
  workspaceId: string
  person: { userId?: string; name: string; capacity: number; dailyLoads: number[] }
  date: Date
  index: number
  days: number
  /** §A4.10 — the person is on leave this day, so their capacity is zero. */
  away?: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const load = person.dailyLoads[index] ?? 0
  const ratio = Math.min(2, load / person.capacity)
  const isWeekend = date.getDay() === 0 || date.getDay() === 6
  const dateStr = toDateStr(date)
  const canOpen = load > 0 && Boolean(person.userId)

  const dayQuery = useQuery({
    queryKey: ['workload-day', workspaceId, person.userId, dateStr, days],
    queryFn: () =>
      api<WorkloadDayTask[]>(
        `/workspaces/${workspaceId}/reports/workload/day?userId=${person.userId}&date=${dateStr}&days=${days}`,
      ),
    enabled: open && canOpen,
  })

  const cell = (
    <div
      className={cn(
        'w-12 h-[58px] flex items-center justify-center border-r border-border/30 last:border-r-0 transition-colors',
        canOpen && 'cursor-pointer',
        isWeekend && 'opacity-40',
      )}
    >
      <div
        className={cn(
          'h-8 w-8 rounded-md flex items-center justify-center text-[10px] font-semibold tabular-nums transition-transform group-hover:scale-95',
          away
            ? 'bg-[repeating-linear-gradient(45deg,hsl(var(--muted)),hsl(var(--muted))4px,transparent_4px,transparent_8px)] text-muted-foreground'
            : loadColor(ratio),
        )}
        title={away ? t('workload.awayCell') : undefined}
      >
        {away ? t('workload.awayShort') : load > 0 ? load.toFixed(1) : ''}
      </div>
    </div>
  )

  const tooltip = (
    <TooltipContent>
      <div className="space-y-0.5 text-[11px]">
        <div className="font-medium">{person.name}</div>
        <div className="text-muted-foreground">
          {date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
        </div>
        <div>{t('workload.capacityTooltip', { load: load.toFixed(1), capacity: person.capacity })}</div>
        {canOpen && <div className="text-muted-foreground">{t('workload.clickForTasks')}</div>}
      </div>
    </TooltipContent>
  )

  if (!canOpen) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{cell}</TooltipTrigger>
        {tooltip}
      </Tooltip>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>{cell}</PopoverTrigger>
        </TooltipTrigger>
        {tooltip}
      </Tooltip>
      <PopoverContent align="center" className="w-72 p-0">
        <div className="px-3 py-2 border-b border-border/60">
          <div className="text-sm font-medium">{person.name}</div>
          <div className="text-[11px] text-muted-foreground">
            {date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
            {' · '}
            {t('workload.capacityTooltip', { load: load.toFixed(1), capacity: person.capacity })}
          </div>
        </div>
        <div className="max-h-64 overflow-auto p-1.5">
          {dayQuery.isLoading && (
            <div className="px-2 py-3 text-[11px] text-muted-foreground"><InlineSkeleton /></div>
          )}
          {dayQuery.isError && (
            <div className="px-2 py-3 text-[11px] text-muted-foreground">{t('workload.dayLoadError')}</div>
          )}
          {dayQuery.data && dayQuery.data.length === 0 && (
            <div className="px-2 py-3 text-[11px] text-muted-foreground">{t('workload.noDayTasks')}</div>
          )}
          {dayQuery.data?.map((task) => (
            <Link
              key={task.id}
              to="/app/$workspaceId/$spaceId/$projectId/$listId"
              params={{ workspaceId, spaceId: task.spaceId, projectId: task.projectId, listId: task.listId }}
              onClick={() => setOpen(false)}
              className="block rounded-md px-2 py-1.5 hover:bg-card/70 transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', priorityDot(task.priority))} />
                <span className="text-[12px] truncate flex-1">{task.title}</span>
                <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{task.hours}h</span>
              </div>
              <div className="flex items-center gap-1.5 pl-3 mt-0.5">
                <Badge variant="soft" className="text-[9px] capitalize">
                  {task.status.replace(/_/g, ' ')}
                </Badge>
                <span className="text-[10px] text-muted-foreground truncate">{task.projectName}</span>
              </div>
            </Link>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

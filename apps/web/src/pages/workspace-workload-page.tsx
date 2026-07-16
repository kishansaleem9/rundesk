import { useMemo, useState } from 'react'
import { useParams, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
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
  cn,
} from '@rundesk/ui'
import { Users, Calendar, AlertTriangle, Download } from 'lucide-react'
import { api } from '../lib/api'
import { useTranslation } from '../lib/i18n'

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
    }))
  }, [workloadQuery.data, t])
  const overloadedCount = people.filter((p) => p.dailyLoads.some((load) => load > p.capacity)).length

  const exportCsv = () => {
    if (people.length === 0) return
    const fmtDate = (d: Date) => d.toISOString().slice(0, 10)
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
    a.download = `workload-${days}d-${new Date().toISOString().slice(0, 10)}.csv`
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
      </Card>

      {/* Heat map */}
      <Card variant="glass" className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <div className="min-w-max">
            {/* Header row */}
            <div className="flex border-b border-border/60 sticky top-0 bg-card/95 backdrop-blur-sm z-10">
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
            {people.map((p) => (
              <div key={p.name} className="flex border-b border-border/30 last:border-b-0 group">
                <div className="w-[200px] shrink-0 flex items-center gap-2.5 px-4 py-2.5 border-r border-border/60 bg-card/50">
                  <PersonAvatar name={p.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{p.role}</div>
                  </div>
                  <Badge variant="soft" className="text-[10px] tabular-nums">
                    {p.capacity}h
                  </Badge>
                </div>
                {dates.map((d, i) => (
                  <WorkloadCell
                    key={i}
                    workspaceId={workspaceId}
                    person={p}
                    date={d}
                    index={i}
                    days={days}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </Card>

      {people.length === 0 && (
        <EmptyState
          icon={<Calendar className="h-6 w-6" />}
          title={t('workload.noTeammates')}
          description={t('workload.noTeammatesDesc')}
        />
      )}
    </div>
  )
}

function loadColor(ratio: number): string {
  if (ratio === 0) return 'bg-muted/30 text-muted-foreground/50'
  if (ratio < 0.4) return 'bg-mint/30 text-mint'
  if (ratio < 0.7) return 'bg-mint/60 text-white'
  if (ratio <= 1) return 'bg-warning/70 text-warning-foreground'
  if (ratio <= 1.3) return 'bg-destructive/70 text-destructive-foreground'
  return 'bg-destructive text-destructive-foreground shadow-[0_0_12px_hsl(var(--destructive)/0.5)]'
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
}: {
  workspaceId: string
  person: { userId?: string; name: string; capacity: number; dailyLoads: number[] }
  date: Date
  index: number
  days: number
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
          loadColor(ratio),
        )}
      >
        {load > 0 ? load.toFixed(1) : ''}
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
            <div className="px-2 py-3 text-[11px] text-muted-foreground">{t('common.loading')}</div>
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

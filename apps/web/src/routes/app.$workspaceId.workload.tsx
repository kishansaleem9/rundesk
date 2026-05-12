import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  Card,
  EmptyState,
  Badge,
  PersonAvatar,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  cn,
} from '@rundesk/ui'
import { Users, Calendar, AlertTriangle } from 'lucide-react'
import { api } from '../lib/api'

export const Route = createFileRoute('/app/$workspaceId/workload')({
  component: WorkloadPage,
})

function WorkloadPage() {
  const { workspaceId } = Route.useParams()
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
      role: p.role ?? 'Member',
      capacity: p.capacity || 8,
      weeklyCapacityHours: p.weeklyCapacityHours ?? Math.round((p.capacity || 8) * 5),
      dailyLoads: p.dailyLoads,
    }))
  }, [workloadQuery.data])
  const overloadedCount = people.filter((p) => p.dailyLoads.some((load) => load > p.capacity)).length

  return (
    <div className="p-6 space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">
            Workspace workload
          </div>
          <h1 className="font-display text-3xl font-semibold flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient-soft text-white shadow-glow">
              <Users className="h-4 w-4" />
            </span>
            Workload
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
            Capacity heat-map across your team. Cells turn red when someone is overloaded.
          </p>
        </div>
        <div className="flex items-center gap-1 bg-card/40 border border-border/60 rounded-lg p-1 backdrop-blur-sm shrink-0">
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
              {v.replace('d', ' days')}
            </button>
          ))}
        </div>
      </header>

      {/* Legend */}
      <Card variant="glass" className="flex flex-wrap items-center gap-4 p-3 px-4 text-xs">
        <span className="text-muted-foreground">Workload</span>
        {[
          { label: 'Light', cls: 'bg-mint/40' },
          { label: 'Balanced', cls: 'bg-mint/70' },
          { label: 'Full', cls: 'bg-warning/70' },
          { label: 'Over', cls: 'bg-destructive/80' },
        ].map((l) => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div className={`h-3 w-5 rounded ${l.cls}`} />
            <span>{l.label}</span>
          </div>
        ))}
        <span className="ml-auto text-muted-foreground flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          {overloadedCount} people overloaded this period
        </span>
      </Card>

      {/* Heat map */}
      <Card variant="glass" className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <div className="min-w-max">
            {/* Header row */}
            <div className="flex border-b border-border/60 sticky top-0 bg-card/95 backdrop-blur-sm z-10">
              <div className="w-[200px] shrink-0 px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground border-r border-border/60">
                Teammate
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
                {dates.map((d, i) => {
                  const load = p.dailyLoads[i] ?? 0
                  const ratio = Math.min(2, load / p.capacity)
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6
                  return (
                    <Tooltip key={i}>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            'w-12 h-[58px] flex items-center justify-center border-r border-border/30 last:border-r-0 cursor-pointer transition-colors',
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
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="space-y-0.5 text-[11px]">
                          <div className="font-medium">{p.name}</div>
                          <div className="text-muted-foreground">
                            {d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                          </div>
                          <div>
                            {load.toFixed(1)}h / {p.capacity}h capacity
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </Card>

      {people.length === 0 && (
        <EmptyState
          icon={<Calendar className="h-6 w-6" />}
          title="No teammates with assigned tasks"
          description="Once tasks have assignees and time estimates, this view will show capacity per person, per day."
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

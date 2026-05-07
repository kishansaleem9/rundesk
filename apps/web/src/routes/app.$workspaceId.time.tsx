import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Button, Card, Badge, cn } from '@rundesk/ui'
import { Play, Pause, Clock, DollarSign, Download } from 'lucide-react'
import { format, startOfWeek, addDays } from 'date-fns'
import { api } from '../lib/api'

export const Route = createFileRoute('/app/$workspaceId/time')({
  component: TimePage,
})

type TimeEntry = {
  id: string
  taskId: string
  taskTitle?: string
  userId: string
  userName?: string
  description?: string | null
  durationSeconds: number
  billable: boolean
  loggedAt: string
}

function formatHours(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m.toString().padStart(2, '0')}m`
}

function TimePage() {
  const { workspaceId } = Route.useParams()
  const [tab, setTab] = useState<'timer' | 'timesheet' | 'reports'>('timesheet')

  const weekStart = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), [])
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])

  const entriesQuery = useQuery({
    queryKey: ['time-entries', workspaceId],
    queryFn: async () => {
      try {
        return await api<TimeEntry[]>(`/workspaces/${workspaceId}/time-entries`)
      } catch {
        return [] as TimeEntry[]
      }
    },
  })

  const entries = entriesQuery.data ?? []

  const totalBySeconds = entries.reduce((sum, e) => sum + e.durationSeconds, 0)
  const billableSeconds = entries.filter((e) => e.billable).reduce((sum, e) => sum + e.durationSeconds, 0)

  const byDay = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of entries) {
      const key = format(new Date(e.loggedAt), 'yyyy-MM-dd')
      map.set(key, (map.get(key) ?? 0) + e.durationSeconds)
    }
    return map
  }, [entries])

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-0.5">Workspace</div>
            <h1 className="font-display text-2xl font-semibold text-foreground flex items-center gap-2">
              Time tracking
              <Badge variant="secondary">Partial</Badge>
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Log time, build timesheets, invoice billable hours.</p>
          </div>
          <Button variant="outline" size="sm">
            <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
          </Button>
        </div>
        <div className="mt-3 flex items-center gap-1 -mb-[1px]">
          {(['timesheet', 'timer', 'reports'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'relative px-3 py-2 text-sm font-medium capitalize',
                tab === t ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t}
              {tab === t && <span className="absolute bottom-[-1px] left-0 right-0 h-0.5 bg-brand-700 rounded-t" />}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <StatCard icon={Clock} label="Total this week" value={formatHours(totalBySeconds)} />
          <StatCard icon={DollarSign} label="Billable" value={formatHours(billableSeconds)} />
          <StatCard icon={Clock} label="Entries" value={`${entries.length}`} />
        </div>

        {tab === 'timer' && (
          <Card className="p-8 text-center">
            <div className="h-16 w-16 rounded-full bg-brand-700 text-white mx-auto flex items-center justify-center mb-3">
              <Play className="h-7 w-7 ml-1" />
            </div>
            <div className="font-display text-4xl font-semibold text-foreground tabular-nums">00:00:00</div>
            <p className="text-sm text-muted-foreground mt-2">Start a timer from any task to track time here.</p>
          </Card>
        )}

        {tab === 'timesheet' && (
          <Card className="p-4">
            <div className="grid grid-cols-8 gap-2 border-b border-border pb-2 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <div className="col-span-1">Task</div>
              {days.map((d) => (
                <div key={d.toISOString()} className="text-center">
                  {format(d, 'EEE')}
                  <div className="text-[10px] font-normal normal-case">{format(d, 'MMM d')}</div>
                </div>
              ))}
            </div>
            {entries.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No time logged this week. Start a timer on any task to populate your timesheet.
              </div>
            ) : (
              <div className="space-y-1">
                {entries.slice(0, 10).map((e) => (
                  <div key={e.id} className="grid grid-cols-8 gap-2 items-center py-1.5 text-sm border-b border-border/40">
                    <div className="col-span-1 truncate">{e.taskTitle ?? 'Task'}</div>
                    {days.map((d) => {
                      const key = format(d, 'yyyy-MM-dd')
                      const entryKey = format(new Date(e.loggedAt), 'yyyy-MM-dd')
                      const show = key === entryKey
                      return (
                        <div key={key} className="text-center tabular-nums text-muted-foreground">
                          {show ? formatHours(e.durationSeconds) : '—'}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 pt-3 border-t border-border grid grid-cols-8 gap-2 text-sm font-semibold text-foreground">
              <div className="col-span-1">Total</div>
              {days.map((d) => {
                const key = format(d, 'yyyy-MM-dd')
                const sec = byDay.get(key) ?? 0
                return (
                  <div key={key} className="text-center tabular-nums">
                    {sec > 0 ? formatHours(sec) : '—'}
                  </div>
                )
              })}
            </div>
          </Card>
        )}

        {tab === 'reports' && (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            Time reports: billable vs non-billable breakdown, per-project hours, client summaries. Coming soon.
          </Card>
        )}
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <Card className="p-4 flex items-center gap-3">
      <div className="h-10 w-10 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
        <Icon className="h-5 w-5 text-accent" />
      </div>
      <div>
        <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
        <div className="font-display text-xl font-semibold text-foreground tabular-nums">{value}</div>
      </div>
    </Card>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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

type ActiveTimer = {
  id: string
  taskId: string
  description?: string | null
  startedAt: string
}

type TimeReportRow = {
  userId: string
  displayName: string
  totalSeconds: number
  billableSeconds: number
  entryCount: number
  totalHours: number
  billableHours: number
}

function formatHours(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m.toString().padStart(2, '0')}m`
}

function safeCsv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

export function TimePage() {
  const { workspaceId } = Route.useParams()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'timer' | 'timesheet' | 'reports'>('timesheet')
  const [elapsedSec, setElapsedSec] = useState(0)

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
  const activeTimerQuery = useQuery({
    queryKey: ['active-timer'],
    queryFn: async () => {
      try {
        return await api<ActiveTimer | null>('/time-entries/active')
      } catch {
        return null
      }
    },
    refetchInterval: 5000,
  })
  const reportQuery = useQuery({
    queryKey: ['time-report', workspaceId],
    queryFn: async () => {
      try {
        return await api<TimeReportRow[]>(`/workspaces/${workspaceId}/reports/time?days=30`)
      } catch {
        return [] as TimeReportRow[]
      }
    },
    enabled: tab === 'reports',
  })

  const activeTimer = activeTimerQuery.data ?? null
  useEffect(() => {
    if (!activeTimer?.startedAt) {
      setElapsedSec(0)
      return
    }
    const tick = () => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - new Date(activeTimer.startedAt).getTime()) / 1000)))
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [activeTimer?.id, activeTimer?.startedAt])

  const startTimer = useMutation({
    mutationFn: (taskId: string) =>
      api(`/tasks/${taskId}/time-entries/start`, { method: 'POST', body: { description: 'Workspace timer' } }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['active-timer'] }),
        qc.invalidateQueries({ queryKey: ['time-entries', workspaceId] }),
      ])
    },
  })
  const stopTimer = useMutation({
    mutationFn: (entryId: string) => api(`/tasks/${activeTimer?.taskId}/time-entries/stop/${entryId}`, { method: 'POST' }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['active-timer'] }),
        qc.invalidateQueries({ queryKey: ['time-entries', workspaceId] }),
        qc.invalidateQueries({ queryKey: ['time-report', workspaceId] }),
      ])
    },
  })

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
  const quickStartTasks = useMemo(() => {
    const byTask = new Map<string, TimeEntry>()
    for (const entry of entries) {
      if (!entry.taskId || byTask.has(entry.taskId)) continue
      byTask.set(entry.taskId, entry)
    }
    return [...byTask.values()].slice(0, 6)
  }, [entries])
  const exportCsv = () => {
    const header = ['Task', 'User', 'Description', 'DurationSeconds', 'Billable', 'LoggedAt']
    const rows = entries.map((entry) => [
      safeCsv(entry.taskTitle ?? 'Task'),
      safeCsv(entry.userName ?? entry.userId),
      safeCsv(entry.description ?? ''),
      String(entry.durationSeconds),
      entry.billable ? 'true' : 'false',
      safeCsv(entry.loggedAt),
    ])
    const csv = [header.join(','), ...rows.map((row) => row.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `time-entries-${workspaceId}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-0.5">Workspace</div>
            <h1 className="font-display text-2xl font-semibold text-foreground flex items-center gap-2">
              Time tracking
              <Badge variant="secondary">Live</Badge>
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Log time, build timesheets, invoice billable hours.</p>
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={entries.length === 0}>
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
              {activeTimer ? <Pause className="h-7 w-7" /> : <Play className="h-7 w-7 ml-1" />}
            </div>
            <div className="font-display text-4xl font-semibold text-foreground tabular-nums">{formatTimer(elapsedSec)}</div>
            {activeTimer ? (
              <p className="text-sm text-muted-foreground mt-2">Active task: {entries.find((e) => e.taskId === activeTimer.taskId)?.taskTitle ?? 'Task'}</p>
            ) : (
              <p className="text-sm text-muted-foreground mt-2">Start a timer from recent tasks.</p>
            )}
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {activeTimer ? (
                <Button
                  onClick={() => stopTimer.mutate(activeTimer.id)}
                  disabled={stopTimer.isPending}
                  variant="outline"
                >
                  <Pause className="h-4 w-4 mr-1.5" />
                  {stopTimer.isPending ? 'Stopping…' : 'Stop timer'}
                </Button>
              ) : (
                quickStartTasks.map((task) => (
                  <Button
                    key={task.taskId}
                    variant="outline"
                    size="sm"
                    onClick={() => startTimer.mutate(task.taskId)}
                    disabled={startTimer.isPending}
                  >
                    <Play className="h-3.5 w-3.5 mr-1" />
                    {task.taskTitle ?? 'Task'}
                  </Button>
                ))
              )}
            </div>
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
          <Card className="p-4">
            <div className="grid grid-cols-4 gap-2 border-b border-border pb-2 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <div>Member</div>
              <div className="text-center">Entries</div>
              <div className="text-center">Total hours</div>
              <div className="text-center">Billable hours</div>
            </div>
            {(reportQuery.data ?? []).length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">No time report rows yet.</div>
            ) : (
              <div className="space-y-1">
                {(reportQuery.data ?? []).map((row) => (
                  <div key={row.userId} className="grid grid-cols-4 gap-2 py-1.5 text-sm border-b border-border/40">
                    <div className="truncate">{row.displayName || 'Member'}</div>
                    <div className="text-center tabular-nums">{row.entryCount}</div>
                    <div className="text-center tabular-nums">{row.totalHours.toFixed(1)}h</div>
                    <div className="text-center tabular-nums">{row.billableHours.toFixed(1)}h</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  )
}

function formatTimer(seconds: number): string {
  const hh = String(Math.floor(seconds / 3600)).padStart(2, '0')
  const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
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

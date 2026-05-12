import { useCallback, useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Button, Card, cn } from '@rundesk/ui'
import {
  BarChart3,
  Users,
  CheckCircle2,
  Clock,
  Zap,
  Target,
  TrendingUp,
  TrendingDown,
  Minus,
  Download,
} from 'lucide-react'
import { api } from '../lib/api'

export const Route = createFileRoute('/app/$workspaceId/reports')({
  component: ReportsPage,
})

type Tab = 'overview' | 'productivity' | 'completion' | 'time' | 'sprints' | 'goals'

type CsvExport = { filename: string; rows: (string | number)[][] } | null

function csvFor(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((row) => row.map(csvFor).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function ReportsPage() {
  const { workspaceId } = Route.useParams()
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [days, setDays] = useState(30)
  const [exportPayload, setExportPayload] = useState<CsvExport>(null)

  // Reset the export payload whenever the active tab changes — each tab will
  // re-register its export shape as soon as its data is ready.
  useEffect(() => {
    setExportPayload(null)
  }, [activeTab, days])

  const registerExport = useCallback((payload: CsvExport) => {
    setExportPayload(payload)
  }, [])

  const handleExport = () => {
    if (!exportPayload) return
    downloadCsv(exportPayload.filename, exportPayload.rows)
  }

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'productivity', label: 'Productivity', icon: Users },
    { id: 'completion', label: 'Completion', icon: CheckCircle2 },
    { id: 'time', label: 'Time', icon: Clock },
    { id: 'sprints', label: 'Sprints', icon: Zap },
    { id: 'goals', label: 'Goals', icon: Target },
  ]

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-accent" />
            <h1 className="text-lg font-semibold">Reports</h1>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value, 10))}
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleExport}
              disabled={!exportPayload}
              title={exportPayload ? 'Download current report as CSV' : 'No data to export yet'}
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
          </div>
        </div>
      </header>

      {/* Tab bar */}
      <div className="flex border-b border-border px-6 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 py-2.5 px-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors shrink-0',
              activeTab === tab.id
                ? 'border-brand-700 text-accent'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'overview' && <OverviewTab workspaceId={workspaceId} registerExport={registerExport} />}
        {activeTab === 'productivity' && <ProductivityTab workspaceId={workspaceId} days={days} registerExport={registerExport} />}
        {activeTab === 'completion' && <CompletionTab workspaceId={workspaceId} days={days} registerExport={registerExport} />}
        {activeTab === 'time' && <TimeTab workspaceId={workspaceId} days={days} registerExport={registerExport} />}
        {activeTab === 'sprints' && <SprintsTab workspaceId={workspaceId} registerExport={registerExport} />}
        {activeTab === 'goals' && <GoalsTab workspaceId={workspaceId} registerExport={registerExport} />}
      </div>
    </div>
  )
}

type ExportRegistrar = (payload: CsvExport) => void

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  trend,
  icon: Icon,
  color = 'brand',
}: {
  label: string
  value: string | number
  sub?: string
  trend?: 'up' | 'down' | 'neutral'
  icon: React.ElementType
  color?: string
}) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
          <p className="text-3xl font-bold mt-1">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
        <div className="h-10 w-10 rounded-xl bg-accent/15 flex items-center justify-center">
          <Icon className="h-5 w-5 text-accent" />
        </div>
      </div>
      {trend && (
        <div className={cn('flex items-center gap-1 mt-2 text-xs', trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-600' : 'text-muted-foreground')}>
          <TrendIcon className="h-3.5 w-3.5" />
          <span>{trend === 'up' ? 'Improving' : trend === 'down' ? 'Declining' : 'Stable'}</span>
        </div>
      )}
    </Card>
  )
}

// ─── Overview ─────────────────────────────────────────────────────────────────

function OverviewTab({
  workspaceId,
  registerExport,
}: {
  workspaceId: string
  registerExport: ExportRegistrar
}) {
  const query = useQuery({
    queryKey: ['reports-overview', workspaceId],
    queryFn: () =>
      api<{ total: number; completed: number; overdue: number; dueToday: number; completionRate: number }>(
        `/workspaces/${workspaceId}/reports/overview`,
      ),
  })

  const d = query.data
  useEffect(() => {
    if (!d) return registerExport(null)
    registerExport({
      filename: `workspace-overview-${workspaceId}.csv`,
      rows: [
        ['Metric', 'Value'],
        ['Total tasks', d.total],
        ['Completed', d.completed],
        ['Overdue', d.overdue],
        ['Due today', d.dueToday],
        ['Completion rate (%)', d.completionRate],
      ],
    })
  }, [d, workspaceId, registerExport])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total tasks" value={d?.total ?? '—'} icon={BarChart3} />
        <StatCard label="Completed" value={d?.completed ?? '—'} icon={CheckCircle2} trend="up" />
        <StatCard label="Overdue" value={d?.overdue ?? '—'} icon={TrendingDown} trend={d && d.overdue > 5 ? 'down' : 'neutral'} />
        <StatCard label="Due today" value={d?.dueToday ?? '—'} icon={Clock} />
      </div>

      {d && (
        <Card className="p-4">
          <p className="text-sm font-medium mb-3">Completion rate</p>
          <div className="flex items-center gap-4">
            <div className="flex-1 bg-muted rounded-full h-3 overflow-hidden">
              <div
                className="h-full bg-brand-700 rounded-full transition-all"
                style={{ width: `${d.completionRate}%` }}
              />
            </div>
            <span className="text-lg font-bold tabular-nums">{d.completionRate}%</span>
          </div>
        </Card>
      )}
    </div>
  )
}

// ─── Productivity ─────────────────────────────────────────────────────────────

function ProductivityTab({
  workspaceId,
  days,
  registerExport,
}: {
  workspaceId: string
  days: number
  registerExport: ExportRegistrar
}) {
  type Row = {
    userId: string
    displayName: string
    email: string
    avatarUrl?: string | null
    tasksCompleted: number
    tasksCreated: number
    totalAssigned: number
  }

  const query = useQuery({
    queryKey: ['reports-productivity', workspaceId, days],
    queryFn: () => api<Row[]>(`/workspaces/${workspaceId}/reports/productivity?days=${days}`),
  })

  const rows = useMemo(() => query.data ?? [], [query.data])
  useEffect(() => {
    if (rows.length === 0) return registerExport(null)
    registerExport({
      filename: `workspace-productivity-${days}d-${workspaceId}.csv`,
      rows: [
        ['Member', 'Email', 'Assigned', 'Completed', 'Created', 'Completion rate (%)'],
        ...rows.map((row) => [
          row.displayName,
          row.email,
          row.totalAssigned,
          row.tasksCompleted,
          row.tasksCreated,
          row.totalAssigned > 0 ? Math.round((row.tasksCompleted / row.totalAssigned) * 100) : 0,
        ]),
      ],
    })
  }, [rows, days, workspaceId, registerExport])

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Team performance in the last {days} days</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Member</th>
              <th className="text-right py-2 px-4 text-muted-foreground font-medium">Assigned</th>
              <th className="text-right py-2 px-4 text-muted-foreground font-medium">Completed</th>
              <th className="text-right py-2 px-4 text-muted-foreground font-medium">Created</th>
              <th className="text-right py-2 pl-4 text-muted-foreground font-medium">Rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const rate = row.totalAssigned > 0 ? Math.round((row.tasksCompleted / row.totalAssigned) * 100) : 0
              return (
                <tr key={row.userId} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-2">
                      {row.avatarUrl ? (
                        <img src={row.avatarUrl} className="h-6 w-6 rounded-full" />
                      ) : (
                        <div className="h-6 w-6 rounded-full bg-brand-200 flex items-center justify-center text-xs font-bold text-accent">
                          {row.displayName[0]?.toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="font-medium">{row.displayName}</div>
                        <div className="text-xs text-muted-foreground">{row.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="text-right py-2 px-4 tabular-nums">{row.totalAssigned}</td>
                  <td className="text-right py-2 px-4 tabular-nums text-emerald-600 font-medium">{row.tasksCompleted}</td>
                  <td className="text-right py-2 px-4 tabular-nums">{row.tasksCreated}</td>
                  <td className="text-right py-2 pl-4">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 bg-muted rounded-full h-1.5 overflow-hidden">
                        <div className="h-full bg-brand-700 rounded-full" style={{ width: `${rate}%` }} />
                      </div>
                      <span className="tabular-nums">{rate}%</span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 && !query.isLoading && (
          <div className="text-center text-muted-foreground py-8">No data available</div>
        )}
      </div>
    </div>
  )
}

// ─── Completion ───────────────────────────────────────────────────────────────

function CompletionTab({
  workspaceId,
  days,
  registerExport,
}: {
  workspaceId: string
  days: number
  registerExport: ExportRegistrar
}) {
  type Data = {
    total: number
    completed: number
    onTime: number
    late: number
    onTimeRate: number
    trend: { date: string; count: number }[]
    statusBreakdown: Record<string, number>
  }

  const query = useQuery({
    queryKey: ['reports-completion', workspaceId, days],
    queryFn: () => api<Data>(`/workspaces/${workspaceId}/reports/completion?days=${days}`),
  })

  const d = query.data
  useEffect(() => {
    if (!d) return registerExport(null)
    registerExport({
      filename: `workspace-completion-${days}d-${workspaceId}.csv`,
      rows: [
        ['Section', 'Label', 'Value'],
        ['summary', 'Total tasks', d.total],
        ['summary', 'Completed', d.completed],
        ['summary', 'On time', d.onTime],
        ['summary', 'Late', d.late],
        ['summary', 'On-time rate (%)', d.onTimeRate],
        ...d.trend.map((point) => ['trend', point.date, point.count] as (string | number)[]),
        ...Object.entries(d.statusBreakdown).map(
          ([status, count]) => ['status', status, count] as (string | number)[],
        ),
      ],
    })
  }, [d, days, workspaceId, registerExport])

  const STATUS_COLORS: Record<string, string> = {
    todo: 'bg-gray-400',
    in_progress: 'bg-blue-400',
    in_review: 'bg-amber-400',
    done: 'bg-emerald-400',
    cancelled: 'bg-red-400',
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total tasks" value={d?.total ?? '—'} icon={BarChart3} />
        <StatCard label="Completed" value={d?.completed ?? '—'} icon={CheckCircle2} />
        <StatCard label="On time" value={d?.onTime ?? '—'} icon={TrendingUp} />
        <StatCard label="On-time rate" value={d ? `${d.onTimeRate}%` : '—'} icon={Target} trend={d && d.onTimeRate >= 70 ? 'up' : 'down'} />
      </div>

      {d && (
        <Card className="p-4">
          <h3 className="text-sm font-medium mb-3">Completions per day</h3>
          <div className="flex items-end gap-0.5 h-20">
            {d.trend.map((point) => {
              const max = Math.max(...d.trend.map((p) => p.count), 1)
              const height = `${Math.max((point.count / max) * 100, 2)}%`
              return (
                <div key={point.date} className="flex-1 flex flex-col items-center gap-0.5" title={`${point.date}: ${point.count}`}>
                  <div
                    className="w-full bg-brand-700 rounded-t-sm transition-all"
                    style={{ height }}
                  />
                </div>
              )
            })}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>{d.trend[0]?.date}</span>
            <span>{d.trend[d.trend.length - 1]?.date}</span>
          </div>
        </Card>
      )}

      {d && Object.keys(d.statusBreakdown).length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-medium mb-3">Status breakdown</h3>
          <div className="space-y-2">
            {Object.entries(d.statusBreakdown).map(([status, count]) => {
              const pct = d.total > 0 ? Math.round((count / d.total) * 100) : 0
              return (
                <div key={status} className="flex items-center gap-3">
                  <div className={cn('h-2.5 w-2.5 rounded-full shrink-0', STATUS_COLORS[status] ?? 'bg-gray-300')} />
                  <span className="text-sm w-28 capitalize">{status.replace('_', ' ')}</span>
                  <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                    <div className={cn('h-full rounded-full', STATUS_COLORS[status] ?? 'bg-gray-300')} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm tabular-nums w-12 text-right">{count}</span>
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}

// ─── Time ─────────────────────────────────────────────────────────────────────

function TimeTab({
  workspaceId,
  days,
  registerExport,
}: {
  workspaceId: string
  days: number
  registerExport: ExportRegistrar
}) {
  type Row = {
    userId: string
    displayName: string
    email: string
    totalSeconds: number
    billableSeconds: number
    entryCount: number
    totalHours: number
    billableHours: number
  }

  const query = useQuery({
    queryKey: ['reports-time', workspaceId, days],
    queryFn: () => api<Row[]>(`/workspaces/${workspaceId}/reports/time?days=${days}`),
  })

  const rows = useMemo(() => query.data ?? [], [query.data])
  const totalHours = rows.reduce((s, r) => s + r.totalHours, 0)
  const billableHours = rows.reduce((s, r) => s + r.billableHours, 0)
  useEffect(() => {
    if (rows.length === 0) return registerExport(null)
    registerExport({
      filename: `workspace-time-${days}d-${workspaceId}.csv`,
      rows: [
        ['Member', 'Email', 'Total hours', 'Billable hours', 'Entries'],
        ...rows.map((row) => [
          row.displayName,
          row.email,
          row.totalHours,
          row.billableHours,
          row.entryCount,
        ]),
      ],
    })
  }, [rows, days, workspaceId, registerExport])

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total hours" value={totalHours.toFixed(1)} icon={Clock} />
        <StatCard label="Billable hours" value={billableHours.toFixed(1)} icon={CheckCircle2} />
        <StatCard
          label="Billable rate"
          value={totalHours > 0 ? `${Math.round((billableHours / totalHours) * 100)}%` : '—'}
          icon={Target}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Member</th>
              <th className="text-right py-2 px-4 text-muted-foreground font-medium">Total hours</th>
              <th className="text-right py-2 px-4 text-muted-foreground font-medium">Billable</th>
              <th className="text-right py-2 pl-4 text-muted-foreground font-medium">Entries</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.userId} className="border-b border-border/50 hover:bg-muted/30">
                <td className="py-2 pr-4">
                  <div className="font-medium">{row.displayName}</div>
                  <div className="text-xs text-muted-foreground">{row.email}</div>
                </td>
                <td className="text-right py-2 px-4 tabular-nums font-medium">{row.totalHours}h</td>
                <td className="text-right py-2 px-4 tabular-nums text-emerald-600">{row.billableHours}h</td>
                <td className="text-right py-2 pl-4 tabular-nums text-muted-foreground">{row.entryCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && !query.isLoading && (
          <div className="text-center text-muted-foreground py-8">No time entries recorded</div>
        )}
      </div>
    </div>
  )
}

// ─── Sprints ──────────────────────────────────────────────────────────────────

function SprintsTab({
  workspaceId,
  registerExport,
}: {
  workspaceId: string
  registerExport: ExportRegistrar
}) {
  type SprintRow = {
    sprintId: string
    name: string
    startDate?: string | null
    endDate?: string | null
    status: string
    taskCount: number
    plannedPoints: number
  }

  const query = useQuery({
    queryKey: ['reports-sprints', workspaceId],
    queryFn: () => api<SprintRow[]>(`/workspaces/${workspaceId}/reports/sprints`),
  })

  const rows = useMemo(() => query.data ?? [], [query.data])
  useEffect(() => {
    if (rows.length === 0) return registerExport(null)
    registerExport({
      filename: `workspace-sprints-${workspaceId}.csv`,
      rows: [
        ['Sprint', 'Status', 'Start', 'End', 'Tasks', 'Points'],
        ...rows.map((row) => [
          row.name,
          row.status,
          row.startDate ?? '',
          row.endDate ?? '',
          row.taskCount,
          row.plannedPoints,
        ]),
      ],
    })
  }, [rows, workspaceId, registerExport])

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Sprint velocity (last 10 sprints)</p>
      {rows.length === 0 && !query.isLoading && (
        <div className="text-center text-muted-foreground py-8">No sprints found</div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Sprint</th>
              <th className="text-left py-2 px-4 text-muted-foreground font-medium">Status</th>
              <th className="text-right py-2 px-4 text-muted-foreground font-medium">Tasks</th>
              <th className="text-right py-2 pl-4 text-muted-foreground font-medium">Points</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.sprintId} className="border-b border-border/50 hover:bg-muted/30">
                <td className="py-2 pr-4">
                  <div className="font-medium">{row.name}</div>
                  {row.startDate && row.endDate && (
                    <div className="text-xs text-muted-foreground">
                      {new Date(row.startDate).toLocaleDateString()} → {new Date(row.endDate).toLocaleDateString()}
                    </div>
                  )}
                </td>
                <td className="py-2 px-4">
                  <span
                    className={cn(
                      'text-xs px-2 py-0.5 rounded-full font-medium',
                      row.status === 'active' && 'bg-emerald-100 text-emerald-700',
                      row.status === 'completed' && 'bg-blue-100 text-blue-700',
                      row.status === 'planned' && 'bg-gray-100 text-gray-700',
                    )}
                  >
                    {row.status}
                  </span>
                </td>
                <td className="text-right py-2 px-4 tabular-nums">{row.taskCount}</td>
                <td className="text-right py-2 pl-4 tabular-nums font-medium">{row.plannedPoints}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Goals ────────────────────────────────────────────────────────────────────

function GoalsTab({
  workspaceId,
  registerExport,
}: {
  workspaceId: string
  registerExport: ExportRegistrar
}) {
  type GoalsData = {
    byStatus: { on_track: number; at_risk: number; off_track: number; completed: number }
    avgProgress: number
    total: number
    goals: Array<{
      id: string
      title: string
      progress: number
      status: string
      targetType: string
    }>
  }

  const query = useQuery({
    queryKey: ['reports-goals', workspaceId],
    queryFn: () => api<GoalsData>(`/workspaces/${workspaceId}/reports/goals`),
  })

  const d = query.data
  useEffect(() => {
    if (!d) return registerExport(null)
    registerExport({
      filename: `workspace-goals-${workspaceId}.csv`,
      rows: [
        ['Section', 'Label', 'Value'],
        ['summary', 'Total goals', d.total],
        ['summary', 'Average progress (%)', d.avgProgress],
        ['summary', 'On track', d.byStatus.on_track],
        ['summary', 'At risk', d.byStatus.at_risk],
        ['summary', 'Off track', d.byStatus.off_track],
        ['summary', 'Completed', d.byStatus.completed],
        ...d.goals.map(
          (goal) => ['goal', goal.title, `${goal.status} · ${goal.progress}%`] as (string | number)[],
        ),
      ],
    })
  }, [d, workspaceId, registerExport])
  const STATUS_META: Record<string, { label: string; color: string }> = {
    on_track: { label: 'On track', color: 'bg-emerald-100 text-emerald-700' },
    at_risk: { label: 'At risk', color: 'bg-amber-100 text-amber-700' },
    off_track: { label: 'Off track', color: 'bg-red-100 text-red-700' },
    completed: { label: 'Completed', color: 'bg-blue-100 text-blue-700' },
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total goals" value={d?.total ?? '—'} icon={Target} />
        <StatCard label="On track" value={d?.byStatus.on_track ?? '—'} icon={TrendingUp} trend="up" />
        <StatCard label="At risk" value={d?.byStatus.at_risk ?? '—'} icon={TrendingDown} />
        <StatCard label="Avg progress" value={d ? `${d.avgProgress}%` : '—'} icon={BarChart3} />
      </div>

      {d && d.goals.length > 0 && (
        <div className="space-y-2">
          {d.goals.map((goal) => {
            const meta = STATUS_META[goal.status] ?? { label: goal.status, color: 'bg-gray-100 text-gray-700' }
            return (
              <Card key={goal.id} className="p-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{goal.title}</span>
                      <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0', meta.color)}>
                        {meta.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-full bg-brand-700 rounded-full"
                          style={{ width: `${goal.progress}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0">{goal.progress}%</span>
                    </div>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {d && d.goals.length === 0 && (
        <div className="text-center text-muted-foreground py-8">No goals found</div>
      )}
    </div>
  )
}

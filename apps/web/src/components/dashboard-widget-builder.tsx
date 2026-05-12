import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import {
  Card,
  Button,
  Badge,
  Input,
  cn,
} from '@rundesk/ui'
import {
  CheckCircle2,
  Clock,
  TrendingUp,
  BarChart3,
  PieChart,
  Activity,
  Users,
  Target,
  Calendar,
  Plus,
  GripVertical,
  X,
  Sparkles,
  Settings as SettingsIcon,
  Search,
} from 'lucide-react'

type WidgetType =
  | 'tasks-due'
  | 'overdue'
  | 'completion'
  | 'activity'
  | 'team-load'
  | 'sprint-burndown'
  | 'goals'
  | 'time'
  | 'pie-status'
  | 'bar-priority'

const WIDGET_CATALOG: Array<{
  type: WidgetType
  name: string
  description: string
  icon: React.ElementType
  category: 'metrics' | 'lists' | 'charts'
}> = [
  { type: 'tasks-due', name: 'Tasks due today', description: 'Quick number tile.', icon: CheckCircle2, category: 'metrics' },
  { type: 'overdue', name: 'Overdue tasks', description: 'Counter + list.', icon: Clock, category: 'metrics' },
  { type: 'completion', name: 'Completion rate', description: '7- or 30-day completion %.', icon: TrendingUp, category: 'metrics' },
  { type: 'activity', name: 'Activity feed', description: 'Latest workspace updates.', icon: Activity, category: 'lists' },
  { type: 'team-load', name: 'Team capacity', description: 'Per-person workload bars.', icon: Users, category: 'lists' },
  { type: 'sprint-burndown', name: 'Sprint burndown', description: 'Active sprint progress.', icon: BarChart3, category: 'charts' },
  { type: 'goals', name: 'Goals progress', description: 'Active OKRs with rollup.', icon: Target, category: 'lists' },
  { type: 'time', name: 'Hours logged', description: 'Total + billable this week.', icon: Calendar, category: 'metrics' },
  { type: 'pie-status', name: 'Tasks by status', description: 'Pie chart.', icon: PieChart, category: 'charts' },
  { type: 'bar-priority', name: 'Tasks by priority', description: 'Stacked bars.', icon: BarChart3, category: 'charts' },
]

type Widget = { id: string; type: WidgetType; w: 1 | 2 | 3; h: 1 | 2 }

const DEFAULT_LAYOUT: Widget[] = [
  { id: '1', type: 'tasks-due', w: 1, h: 1 },
  { id: '2', type: 'overdue', w: 1, h: 1 },
  { id: '3', type: 'completion', w: 1, h: 1 },
  { id: '4', type: 'time', w: 1, h: 1 },
  { id: '5', type: 'sprint-burndown', w: 2, h: 2 },
  { id: '6', type: 'team-load', w: 2, h: 2 },
  { id: '7', type: 'activity', w: 3, h: 1 },
  { id: '8', type: 'pie-status', w: 1, h: 1 },
]

export function DashboardWidgetBuilder({ preset, workspaceId }: { preset?: any; workspaceId: string }) {
  const [widgets, setWidgets] = useState<Widget[]>(preset?.layout || DEFAULT_LAYOUT)
  const [editing, setEditing] = useState(false)
  const [paletteFilter, setPaletteFilter] = useState('')
  const qc = useQueryClient()

  useEffect(() => {
    if (preset?.layout) {
      setWidgets(preset.layout)
    }
  }, [preset])

  function addWidget(type: WidgetType) {
    setWidgets((arr) => [...arr, { id: crypto.randomUUID(), type, w: 1, h: 1 }])
  }
  function removeWidget(id: string) {
    setWidgets((arr) => arr.filter((w) => w.id !== id))
  }

  const handleSaveLayout = async () => {
    if (preset?.id) {
      await api(`/dashboards/${preset.id}`, {
        method: 'PUT',
        body: JSON.stringify({ layout: widgets }),
      })
      qc.invalidateQueries({ queryKey: ['dashboard-presets', workspaceId] })
    }
    setEditing(false)
  }

  const filtered = WIDGET_CATALOG.filter((c) => c.name.toLowerCase().includes(paletteFilter.toLowerCase()))

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-4">
      <div className="space-y-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="soft" className="text-[10px] uppercase">{widgets.length} widgets</Badge>
            {editing && <Badge variant="gradient" className="text-[10px] uppercase">Edit mode</Badge>}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button variant="outline" size="sm">
              <Sparkles className="h-3.5 w-3.5" /> AI suggest layout
            </Button>
            {editing ? (
              <div className="flex items-center gap-1.5">
                <Button variant="ghost" size="sm" onClick={() => { setWidgets(preset?.layout || DEFAULT_LAYOUT); setEditing(false); }}>Cancel</Button>
                <Button variant="gradient" size="sm" onClick={handleSaveLayout}>Save layout</Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <SettingsIcon className="h-3.5 w-3.5" /> Edit dashboard
              </Button>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-card/40 p-3">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 auto-rows-[140px] gap-3">
          {widgets.map((w) => (
            <WidgetCell
              key={w.id}
              widget={w}
              workspaceId={workspaceId}
              editing={editing}
              onRemove={() => removeWidget(w.id)}
            />
          ))}
          {editing && (
            <button
              onClick={() => addWidget('tasks-due')}
              className="col-span-1 row-span-1 flex items-center justify-center rounded-xl border-2 border-dashed border-border/60 hover:border-accent hover:bg-card/30 transition-colors text-muted-foreground hover:text-foreground gap-2 text-sm"
            >
              <Plus className="h-4 w-4" /> Add widget
            </button>
          )}
        </div>
        </div>
      </div>

      {editing && (
        <Card variant="glass" className="p-0 overflow-hidden flex flex-col h-fit max-h-[640px] xl:sticky xl:top-4">
          <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground flex-1">
              Widget catalog
            </span>
          </div>
          <div className="px-3 py-2 border-b border-border/40">
            <Input
              leadingIcon={<Search className="h-3.5 w-3.5" />}
              placeholder="Search widgets…"
              value={paletteFilter}
              onChange={(e) => setPaletteFilter(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="flex-1 overflow-auto p-2 space-y-1">
            {filtered.map((c) => (
              <button
                key={c.type}
                onClick={() => addWidget(c.type)}
                className="w-full flex items-start gap-2.5 rounded-md px-2 py-2 text-left hover:bg-card/60 transition-colors group"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/15 text-accent shrink-0">
                  <c.icon className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{c.name}</div>
                  <div className="text-[10px] text-muted-foreground line-clamp-1">{c.description}</div>
                </div>
                <Plus className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1.5" />
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

function WidgetCell({
  widget,
  workspaceId,
  editing,
  onRemove,
}: {
  widget: Widget
  workspaceId: string
  editing: boolean
  onRemove: () => void
}) {
  const meta = WIDGET_CATALOG.find((c) => c.type === widget.type)
  const Icon = meta?.icon ?? CheckCircle2
  return (
    <Card
      variant="glass"
      className={cn(
        'group relative p-3 overflow-hidden',
        widget.w === 2 && 'col-span-2',
        widget.w === 3 && 'col-span-3',
        widget.h === 2 && 'row-span-2',
        editing && 'ring-2 ring-accent/30 hover:ring-accent/50',
      )}
    >
      {editing && (
        <>
          <button className="absolute top-1.5 left-1.5 cursor-grab p-1 rounded hover:bg-card/70 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onRemove}
            className="absolute top-1.5 right-1.5 p-1 rounded hover:bg-destructive/15 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      )}
      <WidgetPreview widget={widget} icon={Icon} workspaceId={workspaceId} />
    </Card>
  )
}

function WidgetPreview({
  widget,
  icon: Icon,
  workspaceId,
}: {
  widget: Widget
  icon: React.ElementType
  workspaceId: string
}) {
  if (widget.type === 'tasks-due') return <TasksDueTile Icon={Icon} workspaceId={workspaceId} />
  if (widget.type === 'overdue') return <OverdueTile Icon={Icon} workspaceId={workspaceId} />
  if (widget.type === 'completion') return <CompletionTile Icon={Icon} workspaceId={workspaceId} />
  if (widget.type === 'time') return <TimeTile Icon={Icon} workspaceId={workspaceId} />
  if (widget.type === 'pie-status') return <PieStatusWidget workspaceId={workspaceId} />
  if (widget.type === 'sprint-burndown') return <BurndownMock />
  if (widget.type === 'team-load') return <TeamLoadWidget workspaceId={workspaceId} />
  if (widget.type === 'activity') return <ActivityWidget />
  ;
  if (widget.type === 'goals') return <GoalsWidget workspaceId={workspaceId} />
  if (widget.type === 'bar-priority') return <BarPriorityWidget workspaceId={workspaceId} />
  return null
}

function BarPriorityWidget({ workspaceId }: { workspaceId: string }) {
  type ProjectBreakdown = { byPriority?: Record<string, number> }
  const q = useQuery({
    queryKey: ['reports-priority-breakdown', workspaceId],
    queryFn: () =>
      api<ProjectBreakdown>(`/workspaces/${workspaceId}/reports/overview`).catch(() => ({ byPriority: {} })),
  })
  const breakdown = (q.data?.byPriority ?? {}) as Record<string, number>
  const entries = [
    { l: 'Urgent', v: breakdown.urgent ?? 0, c: 'bg-destructive' },
    { l: 'High', v: breakdown.high ?? 0, c: 'bg-warning' },
    { l: 'Normal', v: breakdown.normal ?? 0, c: 'bg-accent' },
    { l: 'Low', v: breakdown.low ?? 0, c: 'bg-muted-foreground' },
  ]
  const max = Math.max(1, ...entries.map((b) => b.v))
  return (
    <div className="flex flex-col h-full">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">By priority</div>
      <div className="flex items-end gap-2 mt-2 h-16">
        {entries.map((b) => (
          <div key={b.l} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full rounded-t flex items-end h-full">
              <div
                className={cn('w-full rounded-t', b.c)}
                style={{ height: `${Math.max(4, (b.v / max) * 100)}%` }}
              />
            </div>
            <span className="text-[9px] text-muted-foreground">
              {b.l} · {b.v}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function TasksDueTile({ Icon, workspaceId }: { Icon: React.ElementType; workspaceId: string }) {
  const q = useQuery({
    queryKey: ['reports-overview', workspaceId],
    queryFn: () =>
      api<{ dueToday: number; total: number }>(
        `/workspaces/${workspaceId}/reports/overview`,
      ),
  })
  return (
    <Tile
      label="Due today"
      value={q.data?.dueToday ?? '—'}
      hint={q.data ? `of ${q.data.total} total` : 'Loading…'}
      Icon={Icon}
    />
  )
}

function OverdueTile({ Icon, workspaceId }: { Icon: React.ElementType; workspaceId: string }) {
  const q = useQuery({
    queryKey: ['reports-overview', workspaceId],
    queryFn: () =>
      api<{ overdue: number }>(`/workspaces/${workspaceId}/reports/overview`),
  })
  const overdue = q.data?.overdue ?? 0
  return (
    <Tile
      label="Overdue"
      value={overdue}
      hint={overdue === 0 ? 'All caught up' : 'Reschedule them?'}
      Icon={Icon}
      tone={overdue > 0 ? 'warning' : undefined}
    />
  )
}

function CompletionTile({ Icon, workspaceId }: { Icon: React.ElementType; workspaceId: string }) {
  const q = useQuery({
    queryKey: ['reports-overview', workspaceId],
    queryFn: () =>
      api<{ completionRate: number }>(`/workspaces/${workspaceId}/reports/overview`),
  })
  return (
    <Tile
      label="Completion"
      value={q.data ? `${q.data.completionRate}%` : '—'}
      hint="All-time"
      Icon={Icon}
      tone="success"
    />
  )
}

function TimeTile({ Icon, workspaceId }: { Icon: React.ElementType; workspaceId: string }) {
  const q = useQuery({
    queryKey: ['reports-time', workspaceId, 7],
    queryFn: () =>
      api<Array<{ totalHours: number; billableHours: number }>>(
        `/workspaces/${workspaceId}/reports/time?days=7`,
      ),
  })
  const totals = (q.data ?? []).reduce(
    (acc, r) => ({ totalHours: acc.totalHours + r.totalHours, billableHours: acc.billableHours + r.billableHours }),
    { totalHours: 0, billableHours: 0 },
  )
  return (
    <Tile
      label="This week"
      value={`${totals.totalHours.toFixed(0)}h`}
      hint={`${totals.billableHours.toFixed(0)}h billable`}
      Icon={Icon}
    />
  )
}

function TeamLoadWidget({ workspaceId }: { workspaceId: string }) {
  const q = useQuery({
    queryKey: ['workload-report', workspaceId, 7],
    queryFn: () =>
      api<Array<{ name: string; capacity: number; dailyLoads: number[] }>>(
        `/workspaces/${workspaceId}/reports/workload?days=7`,
      ),
  })
  const team = (q.data ?? []).slice(0, 6).map((p) => {
    const avgLoad = p.dailyLoads.reduce((s, v) => s + v, 0) / Math.max(1, p.dailyLoads.length)
    const ratio = Math.round((avgLoad / Math.max(1, p.capacity)) * 100)
    return { name: p.name || 'Unknown', load: ratio }
  })
  return (
    <div className="flex flex-col h-full">
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Team capacity</div>
      <ul className="flex-1 space-y-1.5">
        {team.length === 0 && (
          <li className="text-[11px] text-muted-foreground">No assignments this week</li>
        )}
        {team.map((t) => (
          <li key={t.name} className="flex items-center gap-2 text-[11px]">
            <span className="w-16 truncate">{t.name.split(' ')[0]}</span>
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full',
                  t.load > 100 ? 'bg-destructive' : t.load > 85 ? 'bg-warning' : 'bg-success',
                )}
                style={{ width: `${Math.min(110, t.load)}%` }}
              />
            </div>
            <span className="tabular-nums w-9 text-right">{t.load}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function PieStatusWidget({ workspaceId }: { workspaceId: string }) {
  const q = useQuery({
    queryKey: ['reports-completion', workspaceId, 30],
    queryFn: () =>
      api<{ statusBreakdown: Record<string, number> }>(
        `/workspaces/${workspaceId}/reports/completion?days=30`,
      ),
  })
  const breakdown = q.data?.statusBreakdown ?? {}
  const entries = Object.entries(breakdown).filter(([, v]) => v > 0)
  const total = entries.reduce((s, [, v]) => s + v, 0)
  const COLORS: Record<string, string> = {
    done: 'success',
    in_progress: 'accent-violet',
    in_review: 'accent',
    todo: 'warning',
    backlog: 'muted-foreground',
    cancelled: 'destructive',
  }
  let offset = 0
  return (
    <div className="flex flex-col h-full">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">By status (30d)</div>
      <div className="flex items-center gap-3 flex-1">
        <svg viewBox="0 0 36 36" className="h-20 w-20 -rotate-90">
          <circle cx="18" cy="18" r="14" fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
          {entries.map(([status, count]) => {
            const pct = total > 0 ? (count / total) * 100 : 0
            const dasharray = `${pct} 100`
            const dashoffset = -offset
            offset += pct
            return (
              <circle
                key={status}
                cx="18"
                cy="18"
                r="14"
                fill="none"
                stroke={`hsl(var(--${COLORS[status] ?? 'muted-foreground'}))`}
                strokeWidth="6"
                strokeDasharray={dasharray}
                strokeDashoffset={dashoffset}
              />
            )
          })}
        </svg>
        <ul className="flex-1 text-[10px] space-y-0.5">
          {entries.slice(0, 4).map(([status, count]) => (
            <li key={status} className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: `hsl(var(--${COLORS[status] ?? 'muted-foreground'}))` }}
              />
              <span className="capitalize">{status.replace(/_/g, ' ')}</span>
              <span className="ml-auto tabular-nums">{count}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function GoalsWidget({ workspaceId }: { workspaceId: string }) {
  const q = useQuery({
    queryKey: ['reports-goals', workspaceId],
    queryFn: () =>
      api<{ goals: Array<{ id: string; title: string; progress: number }> }>(
        `/workspaces/${workspaceId}/reports/goals`,
      ),
  })
  const goals = (q.data?.goals ?? []).slice(0, 3)
  return (
    <div className="flex flex-col h-full">
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Goals</div>
      <div className="space-y-2 flex-1">
        {goals.length === 0 && (
          <div className="text-[11px] text-muted-foreground">No goals yet</div>
        )}
        {goals.map((g) => (
          <div key={g.id}>
            <div className="flex items-center justify-between text-[11px]">
              <span className="truncate">{g.title}</span>
              <span className="tabular-nums">{g.progress}%</span>
            </div>
            <div className="h-1 rounded-full bg-muted">
              <div className="h-full rounded-full bg-brand-gradient" style={{ width: `${g.progress}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Tile({ label, value, hint, Icon, tone }: any) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
        {label}
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="font-display text-3xl font-semibold tabular-nums mt-2">{value}</div>
      <div
        className={cn(
          'text-[11px] mt-auto',
          tone === 'success' && 'text-success',
          tone === 'warning' && 'text-warning',
          !tone && 'text-muted-foreground',
        )}
      >
        {hint}
      </div>
    </div>
  )
}

function BurndownMock() {
  const points = [42, 39, 35, 30, 28, 26, 22, 16, 12, 8, 4, 0]
  const max = Math.max(...points)
  return (
    <div className="flex flex-col h-full">
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Sprint burndown</div>
      <div className="flex items-baseline gap-2">
        <div className="font-display text-3xl font-semibold tabular-nums">26</div>
        <div className="text-[10px] text-muted-foreground">/ 42 pts remaining</div>
      </div>
      <svg viewBox="0 0 200 60" className="mt-1 w-full">
        <defs>
          <linearGradient id="bdr" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--accent-violet))" stopOpacity="0.5" />
            <stop offset="100%" stopColor="hsl(var(--accent-violet))" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d={
            'M ' +
            points
              .map((p, i) => `${(i / (points.length - 1)) * 200},${60 - (p / max) * 50}`)
              .join(' L ') +
            ` L 200,60 L 0,60 Z`
          }
          fill="url(#bdr)"
        />
        <path
          d={
            'M ' +
            points
              .map((p, i) => `${(i / (points.length - 1)) * 200},${60 - (p / max) * 50}`)
              .join(' L ')
          }
          fill="none"
          stroke="hsl(var(--accent-violet))"
          strokeWidth="1.5"
        />
      </svg>
    </div>
  )
}

function ActivityWidget() {
  const q = useQuery({
    queryKey: ['notifications', 'feed'],
    queryFn: () =>
      api<Array<{ id: string; title: string; body?: string; createdAt: string }>>(
        `/notifications?unreadOnly=false`,
      ),
  })
  const items = (q.data ?? []).slice(0, 6)
  return (
    <div className="flex flex-col h-full">
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Recent activity</div>
      <ul className="flex-1 space-y-1 text-[11px] overflow-hidden">
        {items.length === 0 && (
          <li className="text-muted-foreground">No recent activity</li>
        )}
        {items.map((n) => {
          const minutes = Math.max(1, Math.round((Date.now() - new Date(n.createdAt).getTime()) / 60000))
          const ts = minutes < 60 ? `${minutes}m` : minutes < 1440 ? `${Math.round(minutes / 60)}h` : `${Math.round(minutes / 1440)}d`
          return (
            <li key={n.id} className="truncate">
              <span className="text-foreground">{n.title}</span>
              <span className="text-muted-foreground"> · {ts}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}


import { useState } from 'react'
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

export function DashboardWidgetBuilder() {
  const [widgets, setWidgets] = useState<Widget[]>(DEFAULT_LAYOUT)
  const [editing, setEditing] = useState(false)
  const [paletteFilter, setPaletteFilter] = useState('')

  function addWidget(type: WidgetType) {
    setWidgets((arr) => [...arr, { id: crypto.randomUUID(), type, w: 1, h: 1 }])
  }
  function removeWidget(id: string) {
    setWidgets((arr) => arr.filter((w) => w.id !== id))
  }

  const filtered = WIDGET_CATALOG.filter((c) => c.name.toLowerCase().includes(paletteFilter.toLowerCase()))

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="soft" className="text-[10px] uppercase">{widgets.length} widgets</Badge>
            {editing && <Badge variant="gradient" className="text-[10px] uppercase">Edit mode</Badge>}
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm">
              <Sparkles className="h-3.5 w-3.5" /> AI suggest layout
            </Button>
            <Button
              variant={editing ? 'gradient' : 'outline'}
              size="sm"
              onClick={() => setEditing(!editing)}
            >
              <SettingsIcon className="h-3.5 w-3.5" />
              {editing ? 'Done' : 'Edit dashboard'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-3 auto-rows-[140px] gap-3">
          {widgets.map((w) => (
            <WidgetCell key={w.id} widget={w} editing={editing} onRemove={() => removeWidget(w.id)} />
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

      {editing && (
        <Card variant="glass" className="p-0 overflow-hidden flex flex-col h-fit max-h-[640px] sticky top-4">
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
  editing,
  onRemove,
}: {
  widget: Widget
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
      <WidgetPreview widget={widget} icon={Icon} />
    </Card>
  )
}

function WidgetPreview({ widget, icon: Icon }: { widget: Widget; icon: React.ElementType }) {
  if (widget.type === 'tasks-due') return <Tile label="Due today" value="5" hint="Across all lists" Icon={Icon} />
  if (widget.type === 'overdue') return <Tile label="Overdue" value="2" hint="Reschedule them?" Icon={Icon} tone="warning" />
  if (widget.type === 'completion') return <Tile label="Completion" value="78%" hint="↑ 12% vs last week" Icon={Icon} tone="success" />
  if (widget.type === 'time') return <Tile label="This week" value="34h" hint="28h billable" Icon={Icon} />
  if (widget.type === 'pie-status') return <PieMock />
  if (widget.type === 'sprint-burndown') return <BurndownMock />
  if (widget.type === 'team-load') return <TeamLoadMock />
  if (widget.type === 'activity') return <ActivityMock />
  if (widget.type === 'goals') return <GoalsMock />
  if (widget.type === 'bar-priority') return <BarMock />
  return null
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

function PieMock() {
  return (
    <div className="flex flex-col h-full">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">By status</div>
      <div className="flex items-center gap-3 flex-1">
        <svg viewBox="0 0 36 36" className="h-20 w-20 -rotate-90">
          <circle cx="18" cy="18" r="14" fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
          <circle cx="18" cy="18" r="14" fill="none" stroke="hsl(var(--success))" strokeWidth="6" strokeDasharray="35 100" />
          <circle cx="18" cy="18" r="14" fill="none" stroke="hsl(var(--accent-violet))" strokeWidth="6" strokeDasharray="28 100" strokeDashoffset="-35" />
          <circle cx="18" cy="18" r="14" fill="none" stroke="hsl(var(--warning))" strokeWidth="6" strokeDasharray="20 100" strokeDashoffset="-63" />
        </svg>
        <ul className="flex-1 text-[10px] space-y-0.5">
          <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-success" /> Done <span className="ml-auto tabular-nums">35</span></li>
          <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent" /> In progress <span className="ml-auto tabular-nums">28</span></li>
          <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-warning" /> To do <span className="ml-auto tabular-nums">20</span></li>
          <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-muted-foreground" /> Backlog <span className="ml-auto tabular-nums">17</span></li>
        </ul>
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

function TeamLoadMock() {
  const team = [
    { name: 'Afzaal Ali', load: 95 },
    { name: 'Hamda Tahir', load: 78 },
    { name: 'Iqra Khalid', load: 110 },
    { name: 'Mali Acme', load: 56 },
    { name: 'Sara Idris', load: 84 },
  ]
  return (
    <div className="flex flex-col h-full">
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Team capacity</div>
      <ul className="flex-1 space-y-1.5">
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

function ActivityMock() {
  return (
    <div className="flex flex-col h-full">
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Recent activity</div>
      <ul className="flex-1 space-y-1 text-[11px] overflow-hidden">
        <li className="truncate"><span className="font-medium">Hamda</span> completed <span className="text-foreground">Workload heat-map</span> · 12m</li>
        <li className="truncate"><span className="font-medium">Afzaal</span> commented on <span className="text-foreground">Sprint plan</span> · 1h</li>
        <li className="truncate"><span className="font-medium">Iqra</span> created <span className="text-foreground">Q3 marketing site</span> · 3h</li>
      </ul>
    </div>
  )
}

function GoalsMock() {
  return (
    <div className="flex flex-col h-full">
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Goals</div>
      <div className="space-y-2 flex-1">
        {[
          { name: 'Ship v1.0', pct: 64 },
          { name: '90% WAU', pct: 72 },
          { name: 'AI answer rate', pct: 38 },
        ].map((g) => (
          <div key={g.name}>
            <div className="flex items-center justify-between text-[11px]">
              <span className="truncate">{g.name}</span>
              <span className="tabular-nums">{g.pct}%</span>
            </div>
            <div className="h-1 rounded-full bg-muted">
              <div className="h-full rounded-full bg-brand-gradient" style={{ width: `${g.pct}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function BarMock() {
  return (
    <div className="flex flex-col h-full">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">By priority</div>
      <div className="flex items-end gap-2 mt-2 h-16">
        {[
          { l: 'Urgent', v: 28, c: 'bg-destructive' },
          { l: 'High', v: 64, c: 'bg-warning' },
          { l: 'Normal', v: 92, c: 'bg-accent' },
          { l: 'Low', v: 40, c: 'bg-muted-foreground' },
        ].map((b) => (
          <div key={b.l} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full rounded-t" style={{ height: `${b.v}%` }}><div className={cn('w-full h-full rounded-t', b.c)} /></div>
            <span className="text-[9px] text-muted-foreground">{b.l}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

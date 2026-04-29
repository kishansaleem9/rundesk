import { useState } from 'react'
import {
  Card,
  Button,
  Badge,
  Input,
  Label,
  Switch,
  cn,
} from '@rundesk/ui'
import {
  Plus,
  X,
  Filter,
  BarChart3,
  PieChart,
  TrendingUp,
  Table as TableIcon,
  Save,
  Sparkles,
  Calendar,
  Layers,
  Users,
  Sigma,
} from 'lucide-react'

type Metric = { id: string; label: string; agg: 'count' | 'sum' | 'avg' | 'rate' }
type Dimension = { id: string; label: string }
type Filter = { field: string; op: string; value: string }

const METRICS: Metric[] = [
  { id: 'tasks-count', label: 'Tasks count', agg: 'count' },
  { id: 'tasks-completed', label: 'Tasks completed', agg: 'count' },
  { id: 'on-time-rate', label: 'On-time completion %', agg: 'rate' },
  { id: 'cycle-time', label: 'Avg cycle time (days)', agg: 'avg' },
  { id: 'time-logged', label: 'Hours logged', agg: 'sum' },
  { id: 'billable-hours', label: 'Billable hours', agg: 'sum' },
  { id: 'sprint-velocity', label: 'Sprint velocity', agg: 'avg' },
]

const DIMENSIONS: Dimension[] = [
  { id: 'assignee', label: 'Assignee' },
  { id: 'status', label: 'Status' },
  { id: 'priority', label: 'Priority' },
  { id: 'project', label: 'Project' },
  { id: 'sprint', label: 'Sprint' },
  { id: 'label', label: 'Label' },
  { id: 'date-week', label: 'Week' },
  { id: 'date-month', label: 'Month' },
]

const VIZ: Array<{ id: 'bar' | 'line' | 'pie' | 'table'; label: string; icon: React.ElementType }> = [
  { id: 'bar', label: 'Bar', icon: BarChart3 },
  { id: 'line', label: 'Line', icon: TrendingUp },
  { id: 'pie', label: 'Pie', icon: PieChart },
  { id: 'table', label: 'Table', icon: TableIcon },
]

export function ReportBuilder() {
  const [name, setName] = useState('Engineering productivity — last 30 days')
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(['tasks-completed', 'on-time-rate'])
  const [selectedDimensions, setSelectedDimensions] = useState<string[]>(['assignee'])
  const [filters, setFilters] = useState<Filter[]>([
    { field: 'project', op: 'is', value: 'v1.0 launch' },
    { field: 'date', op: 'within', value: 'Last 30 days' },
  ])
  const [viz, setViz] = useState<'bar' | 'line' | 'pie' | 'table'>('bar')
  const [scheduled, setScheduled] = useState(true)

  function toggleMetric(id: string) {
    setSelectedMetrics((arr) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]))
  }
  function toggleDimension(id: string) {
    setSelectedDimensions((arr) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]))
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 h-[calc(100vh-180px)]">
      {/* Left: pickers */}
      <Card variant="glass" className="overflow-hidden p-0 flex flex-col">
        <div className="px-4 py-3 border-b border-border/40 space-y-2">
          <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Report name
          </Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
        </div>
        <div className="flex-1 overflow-auto">
          <Section title="Metrics" icon={Sigma}>
            <div className="space-y-1">
              {METRICS.map((m) => (
                <PickRow
                  key={m.id}
                  label={m.label}
                  hint={m.agg.toUpperCase()}
                  active={selectedMetrics.includes(m.id)}
                  onToggle={() => toggleMetric(m.id)}
                />
              ))}
            </div>
          </Section>
          <Section title="Dimensions" icon={Layers}>
            <div className="space-y-1">
              {DIMENSIONS.map((d) => (
                <PickRow
                  key={d.id}
                  label={d.label}
                  active={selectedDimensions.includes(d.id)}
                  onToggle={() => toggleDimension(d.id)}
                />
              ))}
            </div>
          </Section>
          <Section title="Filters" icon={Filter}>
            <ul className="space-y-1.5 mb-2">
              {filters.map((f, i) => (
                <li
                  key={i}
                  className="flex items-center gap-1.5 rounded-md border border-border/40 bg-card/40 px-2 py-1.5 text-xs"
                >
                  <span className="font-medium capitalize">{f.field}</span>
                  <span className="text-muted-foreground">{f.op}</span>
                  <span className="font-mono truncate">{f.value}</span>
                  <button
                    onClick={() => setFilters((arr) => arr.filter((_, idx) => idx !== i))}
                    className="ml-auto text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
            <Button variant="outline" size="sm" className="w-full text-xs h-7">
              <Plus className="h-3 w-3" /> Add filter
            </Button>
          </Section>
        </div>
        <div className="border-t border-border/40 p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <Label className="text-xs">Schedule</Label>
            <Switch checked={scheduled} onCheckedChange={setScheduled} />
          </div>
          {scheduled && (
            <div className="flex items-center gap-2 rounded-md border border-border/40 bg-card/40 px-2 py-1.5 text-[11px]">
              <Calendar className="h-3 w-3 text-accent" />
              Email weekly · Mondays · 9am
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="flex-1">
              Run now
            </Button>
            <Button variant="gradient" size="sm" className="flex-1">
              <Save className="h-3.5 w-3.5" /> Save
            </Button>
          </div>
        </div>
      </Card>

      {/* Right: preview */}
      <Card variant="glass" className="overflow-hidden p-0 flex flex-col">
        <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
          <div className="flex items-center gap-1 bg-card/40 border border-border/60 rounded-lg p-1">
            {VIZ.map((v) => (
              <button
                key={v.id}
                onClick={() => setViz(v.id)}
                className={cn(
                  'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-medium transition-all',
                  viz === v.id
                    ? 'bg-brand-gradient text-white shadow-sm'
                    : 'hover:bg-card/60 text-muted-foreground',
                )}
              >
                <v.icon className="h-3.5 w-3.5" />
                {v.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm">
              <Sparkles className="h-3.5 w-3.5" /> AI summarize
            </Button>
            <Button variant="outline" size="sm">
              Export CSV
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-6 bg-card/10">
          <h2 className="font-display text-2xl font-semibold mb-2">{name}</h2>
          <div className="flex flex-wrap gap-1.5 mb-5">
            {selectedMetrics.map((m) => {
              const meta = METRICS.find((x) => x.id === m)!
              return (
                <Badge key={m} variant="info" className="text-[10px]">
                  <Sigma className="h-3 w-3" /> {meta.label}
                </Badge>
              )
            })}
            {selectedDimensions.map((d) => {
              const meta = DIMENSIONS.find((x) => x.id === d)!
              return (
                <Badge key={d} variant="soft" className="text-[10px]">
                  <Users className="h-3 w-3" /> by {meta.label}
                </Badge>
              )
            })}
          </div>
          <div className="rounded-xl border border-border/40 bg-card/40 p-5">
            {viz === 'bar' && <PreviewBars />}
            {viz === 'line' && <PreviewLine />}
            {viz === 'pie' && <PreviewPie />}
            {viz === 'table' && <PreviewTable />}
          </div>
        </div>
      </Card>
    </div>
  )
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="border-b border-border/40 px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
        <Icon className="h-3 w-3" />
        {title}
      </div>
      {children}
    </div>
  )
}

function PickRow({
  label,
  hint,
  active,
  onToggle,
}: {
  label: string
  hint?: string
  active: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        'group w-full flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition-all text-left',
        active
          ? 'border-accent/50 bg-accent/10 text-foreground'
          : 'border-transparent hover:border-border hover:bg-card/40 text-muted-foreground',
      )}
    >
      <span
        className={cn(
          'h-3 w-3 rounded border transition-all',
          active ? 'border-accent bg-accent' : 'border-border',
        )}
      />
      <span className="flex-1 truncate">{label}</span>
      {hint && <Badge variant="soft" className="text-[9px] uppercase">{hint}</Badge>}
    </button>
  )
}

// ─── Mock previews ─────────────────────────────────────────────────────────

function PreviewBars() {
  const data = [
    { name: 'Afzaal', completed: 18, on_time: 92 },
    { name: 'Hamda', completed: 14, on_time: 100 },
    { name: 'Iqra', completed: 11, on_time: 88 },
    { name: 'Mali', completed: 9, on_time: 86 },
    { name: 'Sara', completed: 12, on_time: 94 },
    { name: 'Bilal', completed: 6, on_time: 100 },
  ]
  const max = Math.max(...data.map((d) => d.completed))
  return (
    <div className="flex items-end gap-2 h-64">
      {data.map((d) => (
        <div key={d.name} className="flex-1 flex flex-col items-center gap-1.5">
          <span className="text-[10px] tabular-nums text-muted-foreground">{d.completed}</span>
          <div
            className="w-full rounded-t-md bg-brand-gradient relative"
            style={{ height: `${(d.completed / max) * 220}px` }}
          >
            <div
              className="absolute inset-x-0 bottom-0 rounded-t-md bg-success/70"
              style={{ height: `${(d.on_time / 100) * (d.completed / max) * 220}px` }}
            />
          </div>
          <span className="text-xs">{d.name}</span>
        </div>
      ))}
    </div>
  )
}

function PreviewLine() {
  const points = [12, 14, 18, 22, 26, 30, 32, 38, 42, 46, 51, 58]
  const max = Math.max(...points)
  return (
    <svg viewBox="0 0 320 200" className="w-full h-64">
      <defs>
        <linearGradient id="r-grad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--accent-violet))" stopOpacity="0.5" />
          <stop offset="100%" stopColor="hsl(var(--accent-violet))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={
          'M ' +
          points.map((p, i) => `${(i / (points.length - 1)) * 320},${200 - (p / max) * 180}`).join(' L ') +
          ' L 320,200 L 0,200 Z'
        }
        fill="url(#r-grad)"
      />
      <path
        d={
          'M ' +
          points.map((p, i) => `${(i / (points.length - 1)) * 320},${200 - (p / max) * 180}`).join(' L ')
        }
        fill="none"
        stroke="hsl(var(--accent-violet))"
        strokeWidth="2"
      />
    </svg>
  )
}

function PreviewPie() {
  return (
    <div className="flex items-center justify-center gap-8">
      <svg viewBox="0 0 36 36" className="h-48 w-48 -rotate-90">
        <circle cx="18" cy="18" r="14" fill="none" stroke="hsl(var(--success))" strokeWidth="6" strokeDasharray="40 100" />
        <circle cx="18" cy="18" r="14" fill="none" stroke="hsl(var(--accent-violet))" strokeWidth="6" strokeDasharray="28 100" strokeDashoffset="-40" />
        <circle cx="18" cy="18" r="14" fill="none" stroke="hsl(var(--warning))" strokeWidth="6" strokeDasharray="20 100" strokeDashoffset="-68" />
        <circle cx="18" cy="18" r="14" fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="6" strokeDasharray="12 100" strokeDashoffset="-88" />
      </svg>
      <ul className="text-sm space-y-1.5">
        <li className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-success" /> Done · 40%</li>
        <li className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-accent" /> In progress · 28%</li>
        <li className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-warning" /> To do · 20%</li>
        <li className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-muted-foreground" /> Backlog · 12%</li>
      </ul>
    </div>
  )
}

function PreviewTable() {
  const rows = [
    { name: 'Afzaal Ali', tasks: 18, on_time: 92, hours: 38 },
    { name: 'Hamda Tahir', tasks: 14, on_time: 100, hours: 41 },
    { name: 'Iqra Khalid', tasks: 11, on_time: 88, hours: 36 },
    { name: 'Mali Acme', tasks: 9, on_time: 86, hours: 32 },
    { name: 'Sara Idris', tasks: 12, on_time: 94, hours: 39 },
  ]
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border/40">
          <th className="px-2 py-2 text-left">Assignee</th>
          <th className="px-2 py-2 text-right">Completed</th>
          <th className="px-2 py-2 text-right">On-time %</th>
          <th className="px-2 py-2 text-right">Hours</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name} className="border-b border-border/20 hover:bg-card/40 transition-colors">
            <td className="px-2 py-2">{r.name}</td>
            <td className="px-2 py-2 text-right tabular-nums">{r.tasks}</td>
            <td className="px-2 py-2 text-right tabular-nums">{r.on_time}%</td>
            <td className="px-2 py-2 text-right tabular-nums">{r.hours}h</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

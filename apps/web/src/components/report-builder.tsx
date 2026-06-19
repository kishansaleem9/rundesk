import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, Button, Badge, Input, Label, cn, toast } from '@rundesk/ui'
import {
  Plus,
  X,
  Filter as FilterIcon,
  BarChart3,
  PieChart,
  TrendingUp,
  Table as TableIcon,
  Save,
  Sparkles,
  Layers,
  Users,
  Sigma,
  Loader2,
  Trash2,
} from 'lucide-react'
import { api } from '../lib/api'

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
  { id: 'sprint-velocity', label: 'Sprint velocity (pts)', agg: 'sum' },
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

const RANGES = [
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
  { days: 365, label: '1y' },
]

const FILTER_FIELDS = ['priority', 'status', 'project', 'assignee'] as const

type ReportRow = { key: string; label: string; values: Record<string, number> }
type ReportResult = { dimension: string; metrics: string[]; generatedAt: string; rows: ReportRow[] }
type SavedReport = { id: string; name: string; definition: any; createdAt: string }

const metricLabel = (id: string) => METRICS.find((m) => m.id === id)?.label ?? id
const dimensionLabel = (id: string) => DIMENSIONS.find((d) => d.id === id)?.label ?? id
const csvCell = (v: string | number) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function ReportBuilder({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient()
  const [name, setName] = useState('Untitled report')
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(['tasks-completed', 'on-time-rate'])
  const [selectedDimensions, setSelectedDimensions] = useState<string[]>(['assignee'])
  const [filters, setFilters] = useState<Filter[]>([])
  const [viz, setViz] = useState<'bar' | 'line' | 'pie' | 'table'>('bar')
  const [days, setDays] = useState(30)
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null)
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [draftFilter, setDraftFilter] = useState<Filter>({ field: 'priority', op: 'is', value: '' })

  const dimension = selectedDimensions[0] ?? 'assignee'
  const definition = useMemo(
    () => ({ metrics: selectedMetrics, dimension, dimensions: selectedDimensions, filters, viz, days }),
    [selectedMetrics, dimension, selectedDimensions, filters, viz, days],
  )

  const runQuery = useQuery({
    queryKey: ['custom-report', workspaceId, JSON.stringify(definition)],
    queryFn: () =>
      api<ReportResult>(`/workspaces/${workspaceId}/reports/custom/run`, { method: 'POST', body: definition }),
    enabled: selectedMetrics.length > 0 && selectedDimensions.length > 0,
  })
  const result = runQuery.data
  const primary = result?.metrics[0] ?? selectedMetrics[0] ?? 'tasks-count'

  const savedQuery = useQuery({
    queryKey: ['custom-reports', workspaceId],
    queryFn: () => api<SavedReport[]>(`/workspaces/${workspaceId}/reports/custom`),
  })

  const saveMutation = useMutation({
    mutationFn: () =>
      activeSavedId
        ? api<SavedReport>(`/workspaces/${workspaceId}/reports/custom/${activeSavedId}`, {
            method: 'PATCH',
            body: { name, definition },
          })
        : api<SavedReport>(`/workspaces/${workspaceId}/reports/custom`, {
            method: 'POST',
            body: { name, definition },
          }),
    onSuccess: (row) => {
      if (row?.id) setActiveSavedId(row.id)
      qc.invalidateQueries({ queryKey: ['custom-reports', workspaceId] })
      toast.success('Report saved')
    },
    onError: () => toast.error('Could not save report'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/workspaces/${workspaceId}/reports/custom/${id}`, { method: 'DELETE' }),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ['custom-reports', workspaceId] })
      if (activeSavedId === id) {
        setActiveSavedId(null)
        setName('Untitled report')
      }
    },
  })

  const aiSummarize = useMutation({
    mutationFn: () =>
      api<{ summary: string }>('/ai/summarize', {
        method: 'POST',
        body: { content: reportAsText(name, result), type: 'project' },
      }),
    onSuccess: (r) => setAiSummary(r.summary),
    onError: () => toast.error('AI summarize is unavailable'),
  })

  function toggleMetric(id: string) {
    setSelectedMetrics((arr) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]))
  }
  function toggleDimension(id: string) {
    // Single grouping dimension drives the chart; selecting one replaces the set.
    setSelectedDimensions([id])
  }
  function loadSaved(r: SavedReport) {
    const d = r.definition || {}
    setName(r.name)
    setSelectedMetrics(Array.isArray(d.metrics) && d.metrics.length ? d.metrics : ['tasks-count'])
    setSelectedDimensions(
      Array.isArray(d.dimensions) && d.dimensions.length ? d.dimensions : [d.dimension ?? 'assignee'],
    )
    setFilters(Array.isArray(d.filters) ? d.filters : [])
    setViz(d.viz ?? 'bar')
    setDays(typeof d.days === 'number' ? d.days : 30)
    setActiveSavedId(r.id)
    setAiSummary(null)
  }
  function newReport() {
    setActiveSavedId(null)
    setName('Untitled report')
    setAiSummary(null)
  }
  function exportCsv() {
    if (!result || result.rows.length === 0) {
      toast.error('Nothing to export yet')
      return
    }
    const header = ['group', ...result.metrics.map(metricLabel)]
    const lines = [header.map(csvCell).join(',')]
    for (const row of result.rows) {
      lines.push([csvCell(row.label), ...result.metrics.map((m) => csvCell(row.values[m] ?? 0))].join(','))
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(name || 'report').replace(/[^a-z0-9-_]+/gi, '-')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4 h-[calc(100vh-200px)]">
      {/* Left: builder */}
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
          <Section title="Group by" icon={Layers}>
            <div className="space-y-1">
              {DIMENSIONS.map((d) => (
                <PickRow
                  key={d.id}
                  label={d.label}
                  active={selectedDimensions[0] === d.id}
                  onToggle={() => toggleDimension(d.id)}
                />
              ))}
            </div>
          </Section>
          <Section title="Filters" icon={FilterIcon}>
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
            <div className="flex items-center gap-1.5">
              <select
                value={draftFilter.field}
                onChange={(e) => setDraftFilter((f) => ({ ...f, field: e.target.value }))}
                className="h-7 rounded-md border border-border/60 bg-card text-xs px-1.5"
              >
                {FILTER_FIELDS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <Input
                value={draftFilter.value}
                onChange={(e) => setDraftFilter((f) => ({ ...f, value: e.target.value }))}
                placeholder="value"
                className="h-7 text-xs"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-7 shrink-0"
                disabled={!draftFilter.value.trim()}
                onClick={() => {
                  setFilters((arr) => [...arr, { ...draftFilter, op: 'is', value: draftFilter.value.trim() }])
                  setDraftFilter((f) => ({ ...f, value: '' }))
                }}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </Section>
          <Section title="Date range" icon={TrendingUp}>
            <div className="flex items-center gap-1 bg-card/40 border border-border/60 rounded-lg p-1">
              {RANGES.map((r) => (
                <button
                  key={r.days}
                  onClick={() => setDays(r.days)}
                  className={cn(
                    'flex-1 text-xs px-2 py-1 rounded-md font-medium transition-all',
                    days === r.days ? 'bg-brand-gradient text-white' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </Section>
          <Section title="Saved reports" icon={Save}>
            {savedQuery.data && savedQuery.data.length > 0 ? (
              <ul className="space-y-1">
                {savedQuery.data.map((r) => (
                  <li key={r.id} className="group flex items-center gap-1.5">
                    <button
                      className={cn(
                        'flex-1 truncate text-left rounded-md px-2 py-1.5 text-xs transition-colors',
                        activeSavedId === r.id
                          ? 'bg-accent/15 text-foreground font-medium'
                          : 'hover:bg-card/60 text-muted-foreground hover:text-foreground',
                      )}
                      onClick={() => loadSaved(r)}
                    >
                      {r.name}
                    </button>
                    <button
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteMutation.mutate(r.id)}
                      title="Delete report"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground px-1">No saved reports yet.</p>
            )}
          </Section>
        </div>
        <div className="border-t border-border/40 p-3 flex items-center gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={newReport}>
            New
          </Button>
          <Button
            variant="gradient"
            size="sm"
            className="flex-1"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            <Save className="h-3.5 w-3.5" /> {activeSavedId ? 'Update' : 'Save'}
          </Button>
        </div>
      </Card>

      {/* Right: live preview */}
      <Card variant="glass" className="overflow-hidden p-0 flex flex-col">
        <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
          <div className="flex items-center gap-1 bg-card/40 border border-border/60 rounded-lg p-1">
            {VIZ.map((v) => (
              <button
                key={v.id}
                onClick={() => setViz(v.id)}
                className={cn(
                  'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-medium transition-all',
                  viz === v.id ? 'bg-brand-gradient text-white shadow-sm' : 'hover:bg-card/60 text-muted-foreground',
                )}
              >
                <v.icon className="h-3.5 w-3.5" />
                {v.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => aiSummarize.mutate()} disabled={aiSummarize.isPending || !result}>
              {aiSummarize.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} AI summarize
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              Export CSV
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-6 bg-card/10">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="font-display text-2xl font-semibold">{name}</h2>
            {runQuery.isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          <div className="flex flex-wrap gap-1.5 mb-5">
            {selectedMetrics.map((m) => (
              <Badge key={m} variant="info" className="text-[10px]">
                <Sigma className="h-3 w-3" /> {metricLabel(m)}
              </Badge>
            ))}
            <Badge variant="soft" className="text-[10px]">
              <Users className="h-3 w-3" /> by {dimensionLabel(dimension)}
            </Badge>
          </div>

          {aiSummary && (
            <div className="mb-5 rounded-lg border border-accent/30 bg-accent/5 p-4 text-sm">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-accent mb-1">
                <Sparkles className="h-3.5 w-3.5" /> AI summary
              </div>
              {aiSummary}
            </div>
          )}

          {runQuery.isError ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5 text-sm text-destructive">
              Could not run this report. Try a different metric or range.
            </div>
          ) : selectedMetrics.length === 0 ? (
            <Empty text="Pick at least one metric to build a report." />
          ) : !result || result.rows.length === 0 ? (
            <Empty text={runQuery.isLoading ? 'Running…' : 'No data for this report yet.'} />
          ) : (
            <div className="rounded-xl border border-border/40 bg-card/40 p-5">
              {viz === 'bar' && <ResultBars result={result} primary={primary} />}
              {viz === 'line' && <ResultLine result={result} primary={primary} />}
              {viz === 'pie' && <ResultPie result={result} primary={primary} />}
              {viz === 'table' && <ResultTable result={result} />}
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}

function reportAsText(name: string, result?: ReportResult): string {
  if (!result) return `Report "${name}" has no data.`
  const header = ['group', ...result.metrics].join(' | ')
  const rows = result.rows
    .slice(0, 40)
    .map((r) => [r.label, ...result.metrics.map((m) => r.values[m] ?? 0)].join(' | '))
    .join('\n')
  return `Report "${name}" grouped by ${result.dimension}.\n${header}\n${rows}`
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
      <span className={cn('h-3 w-3 rounded border transition-all', active ? 'border-accent bg-accent' : 'border-border')} />
      <span className="flex-1 truncate">{label}</span>
      {hint && (
        <Badge variant="soft" className="text-[9px] uppercase">
          {hint}
        </Badge>
      )}
    </button>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border/50 bg-card/20 p-10 text-center text-sm text-muted-foreground">
      {text}
    </div>
  )
}

// ─── Real-data visualizations ───────────────────────────────────────────────

function ResultBars({ result, primary }: { result: ReportResult; primary: string }) {
  const rows = result.rows.slice(0, 12)
  const max = Math.max(1, ...rows.map((r) => r.values[primary] ?? 0))
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-3">{metricLabel(primary)} by {dimensionLabel(result.dimension)}</div>
      <div className="flex items-end gap-2 h-64">
        {rows.map((r) => (
          <div key={r.key} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
            <span className="text-[10px] tabular-nums text-muted-foreground">{r.values[primary] ?? 0}</span>
            <div
              className="w-full rounded-t-md bg-brand-gradient"
              style={{ height: `${((r.values[primary] ?? 0) / max) * 220}px` }}
            />
            <span className="text-xs truncate max-w-full" title={r.label}>
              {r.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ResultLine({ result, primary }: { result: ReportResult; primary: string }) {
  const rows = result.rows.slice(0, 24)
  const points = rows.map((r) => r.values[primary] ?? 0)
  const max = Math.max(1, ...points)
  if (points.length < 2) return <ResultBars result={result} primary={primary} />
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-3">{metricLabel(primary)} by {dimensionLabel(result.dimension)}</div>
      <svg viewBox="0 0 320 200" className="w-full h-64">
        <defs>
          <linearGradient id="rb-grad" x1="0" x2="0" y1="0" y2="1">
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
          fill="url(#rb-grad)"
        />
        <path
          d={'M ' + points.map((p, i) => `${(i / (points.length - 1)) * 320},${200 - (p / max) * 180}`).join(' L ')}
          fill="none"
          stroke="hsl(var(--accent-violet))"
          strokeWidth="2"
        />
      </svg>
    </div>
  )
}

const PIE_COLORS = ['hsl(var(--success))', 'hsl(var(--accent-violet))', 'hsl(var(--warning))', 'hsl(var(--primary))', 'hsl(var(--muted-foreground))']

function ResultPie({ result, primary }: { result: ReportResult; primary: string }) {
  const rows = result.rows.slice(0, 6)
  const total = rows.reduce((a, r) => a + (r.values[primary] ?? 0), 0) || 1
  let offset = 0
  return (
    <div className="flex items-center justify-center gap-8 flex-wrap">
      <svg viewBox="0 0 36 36" className="h-48 w-48 -rotate-90">
        {rows.map((r, i) => {
          const pct = ((r.values[primary] ?? 0) / total) * 100
          const dash = `${pct} 100`
          const circle = (
            <circle
              key={r.key}
              cx="18"
              cy="18"
              r="14"
              fill="none"
              stroke={PIE_COLORS[i % PIE_COLORS.length]}
              strokeWidth="6"
              strokeDasharray={dash}
              strokeDashoffset={-offset}
            />
          )
          offset += pct
          return circle
        })}
      </svg>
      <ul className="text-sm space-y-1.5">
        {rows.map((r, i) => (
          <li key={r.key} className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
            {r.label} · {Math.round(((r.values[primary] ?? 0) / total) * 100)}%
          </li>
        ))}
      </ul>
    </div>
  )
}

function ResultTable({ result }: { result: ReportResult }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border/40">
          <th className="px-2 py-2 text-left">{dimensionLabel(result.dimension)}</th>
          {result.metrics.map((m) => (
            <th key={m} className="px-2 py-2 text-right">
              {metricLabel(m)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {result.rows.map((r) => (
          <tr key={r.key} className="border-b border-border/20 hover:bg-card/40 transition-colors">
            <td className="px-2 py-2">{r.label}</td>
            {result.metrics.map((m) => (
              <td key={m} className="px-2 py-2 text-right tabular-nums">
                {r.values[m] ?? 0}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

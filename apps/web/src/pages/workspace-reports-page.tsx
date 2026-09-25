import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
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
  Printer,
  SlidersHorizontal,
} from 'lucide-react'
import { api } from '../lib/api'
import { useTranslation, type TranslationKey } from '../lib/i18n'
import { ReportBuilder } from '../components/report-builder'
import { usePermissions } from '../hooks/use-permissions'

const TABS = ['overview', 'productivity', 'completion', 'time', 'sprints', 'goals', 'custom'] as const
type Tab = (typeof TABS)[number]

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

function escapeHtml(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string),
  )
}

/**
 * Render the current report's tabular data into a clean, self-contained print
 * window and open the browser print dialog — where "Save as PDF" produces the
 * PDF export. Reuses the same rows each tab registers for CSV.
 */
function printReport(
  title: string,
  rows: (string | number)[][],
  t: ReturnType<typeof useTranslation>['t'],
) {
  if (rows.length === 0) return
  const [header, ...body] = rows
  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) return
  const generatedOn = new Date().toLocaleString()
  const thead = `<tr>${header.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr>`
  const tbody = body
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
    .join('')
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #111827; margin: 32px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .meta { color: #6b7280; font-size: 12px; margin-bottom: 20px; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; }
  th, td { border: 1px solid #e5e7eb; padding: 6px 10px; text-align: left; }
  th { background: #f9fafb; font-weight: 600; }
  tr:nth-child(even) td { background: #fafafa; }
  @media print { body { margin: 12mm; } }
</style></head><body>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">Rundesk · ${escapeHtml(t('reports.printGenerated', { date: generatedOn }))}</div>
  <table><thead>${thead}</thead><tbody>${tbody}</tbody></table>
</body></html>`)
  win.document.close()
  win.focus()
  // Give the new document a tick to lay out before invoking print.
  win.setTimeout(() => win.print(), 250)
}

export function ReportsPage() {
  const { t } = useTranslation()
  const { workspaceId } = useParams({ from: '/app/$workspaceId/reports' })
  /*
   * A5.13 — the dashboard's "Schedule delivery" links at ?tab=custom, so this
   * param was already load-bearing. It used to be read once out of
   * window.location.search and never written back, which made every report but
   * the one you arrived on unaddressable: switch to Time, send the URL, and
   * the recipient gets the overview.
   */
  const { tab: tabFromUrl } = useSearch({ from: '/app/$workspaceId/reports' })
  const navigate = useNavigate()
  const activeTab: Tab = tabFromUrl ?? 'overview'
  const setActiveTab = (next: Tab) =>
    navigate({
      to: '/app/$workspaceId/reports',
      params: { workspaceId },
      search: { tab: next === 'overview' ? undefined : next },
      replace: true,
    })
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
  // Viewing a report asks `report.view.basic`; taking it away asks `report.export`
  // as well, which the API asks of its exports (`role-editor-offers-unenforced-permissions`).
  const mayExport = usePermissions(workspaceId).can('report.export') === true

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: t('reports.tabOverview'), icon: BarChart3 },
    { id: 'productivity', label: t('reports.tabProductivity'), icon: Users },
    { id: 'completion', label: t('reports.tabCompletion'), icon: CheckCircle2 },
    { id: 'time', label: t('reports.tabTime'), icon: Clock },
    { id: 'sprints', label: t('reports.tabSprints'), icon: Zap },
    { id: 'goals', label: t('reports.tabGoals'), icon: Target },
    { id: 'custom', label: t('reports.tabCustom'), icon: SlidersHorizontal },
  ]

  const activeLabel = tabs.find((tab) => tab.id === activeTab)?.label ?? t('reports.reportFallback')
  const handlePrint = () => {
    if (!exportPayload) return
    printReport(t('reports.printTitle', { label: activeLabel, days }), exportPayload.rows, t)
  }

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-accent" />
            <h1 className="text-lg font-semibold">{t('reports.title')}</h1>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value, 10))}
            >
              <option value={7}>{t('reports.last7Days')}</option>
              <option value={30}>{t('reports.last30Days')}</option>
              <option value={90}>{t('reports.last90Days')}</option>
            </select>
            {mayExport && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  data-testid="reports-export-csv"
                  onClick={handleExport}
                  disabled={!exportPayload}
                  title={exportPayload ? t('reports.exportTooltip') : t('reports.noExportTooltip')}
                >
                  <Download className="h-3.5 w-3.5" /> {t('reports.exportCsv')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  data-testid="reports-print-pdf"
                  onClick={handlePrint}
                  disabled={!exportPayload}
                  title={exportPayload ? t('reports.printTooltip') : t('reports.noExportTooltip')}
                >
                  <Printer className="h-3.5 w-3.5" /> {t('reports.printPdf')}
                </Button>
              </>
            )}
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
        {activeTab === 'custom' && <ReportBuilder workspaceId={workspaceId} />}
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
  const { t } = useTranslation()
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
          <span>{trend === 'up' ? t('reports.trendImproving') : trend === 'down' ? t('reports.trendDeclining') : t('reports.trendStable')}</span>
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
  const { t } = useTranslation()
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
        [t('reports.csvMetric'), t('reports.csvValue')],
        [t('reports.totalTasks'), d.total],
        [t('reports.completed'), d.completed],
        [t('reports.overdue'), d.overdue],
        [t('reports.dueToday'), d.dueToday],
        [t('reports.completionRatePct'), d.completionRate],
      ],
    })
  }, [d, workspaceId, registerExport, t])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label={t('reports.totalTasks')} value={d?.total ?? '—'} icon={BarChart3} />
        <StatCard label={t('reports.completed')} value={d?.completed ?? '—'} icon={CheckCircle2} trend="up" />
        <StatCard label={t('reports.overdue')} value={d?.overdue ?? '—'} icon={TrendingDown} trend={d && d.overdue > 5 ? 'down' : 'neutral'} />
        <StatCard label={t('reports.dueToday')} value={d?.dueToday ?? '—'} icon={Clock} />
      </div>

      {d && (
        <Card className="p-4">
          <p className="text-sm font-medium mb-3">{t('reports.completionRate')}</p>
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

/**
 * Self-contained inline SVG line chart for the "completed tasks" trend.
 * Renders a polyline over the time-bucketed data points with a soft gradient
 * area fill, a y-axis (task counts) with gridlines, x-axis time-bucket labels,
 * a dot at every point, and a per-point hover tooltip (native SVG <title>).
 * Responsive via viewBox + w-full/h-auto; no charting dependency.
 */
function ProductivityTrendChart({
  data,
  bucket,
}: {
  data: Array<{ period: string; tasksCompleted: number }>
  bucket: 'week' | 'month'
}) {
  const W = 640
  const H = 200
  const pad = { top: 16, right: 14, bottom: 28, left: 32 }
  const innerW = W - pad.left - pad.right
  const innerH = H - pad.top - pad.bottom
  const max = Math.max(1, ...data.map((d) => d.tasksCompleted))
  const x = (i: number) =>
    pad.left + (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW)
  const y = (v: number) => pad.top + (1 - v / max) * innerH

  const linePoints = data.map((d, i) => `${x(i)},${y(d.tasksCompleted)}`).join(' ')
  const areaPath =
    `M ${x(0)} ${H - pad.bottom} ` +
    data.map((d, i) => `L ${x(i)} ${y(d.tasksCompleted)}`).join(' ') +
    ` L ${x(data.length - 1)} ${H - pad.bottom} Z`

  // Distinct y-axis ticks (0 · midpoint · max), de-duped for tiny ranges.
  const yTicks = Array.from(new Set([0, Math.round(max / 2), max]))
  // Thin the x-axis labels so they never overlap on long ranges.
  const labelStep = Math.max(1, Math.ceil(data.length / 8))

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto"
      role="img"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="prod-trend-grad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--brand-700))" stopOpacity="0.22" />
          <stop offset="100%" stopColor="hsl(var(--brand-700))" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* y-axis gridlines + task-count labels */}
      {yTicks.map((v) => (
        <g key={v}>
          <line
            x1={pad.left}
            x2={W - pad.right}
            y1={y(v)}
            y2={y(v)}
            stroke="hsl(var(--border))"
            strokeWidth="1"
            opacity="0.6"
          />
          <text x={pad.left - 7} y={y(v) + 3} fontSize="9.5" fill="hsl(var(--muted-foreground))" textAnchor="end">
            {v}
          </text>
        </g>
      ))}

      {/* soft area fill under the line */}
      {data.length > 1 && <path d={areaPath} fill="url(#prod-trend-grad)" />}

      {/* the trend line */}
      <polyline
        points={linePoints}
        fill="none"
        stroke="hsl(var(--brand-700))"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* data points, x-axis time-bucket labels, and per-point hover tooltips */}
      {data.map((d, i) => (
        <g key={d.period}>
          <circle
            cx={x(i)}
            cy={y(d.tasksCompleted)}
            r="3.5"
            fill="hsl(var(--brand-700))"
            stroke="hsl(var(--background))"
            strokeWidth="1.5"
          />
          {/* wider invisible hit target makes the tooltip easy to hover */}
          <circle cx={x(i)} cy={y(d.tasksCompleted)} r="11" fill="transparent">
            <title>{`${d.period}: ${d.tasksCompleted}`}</title>
          </circle>
          {(i % labelStep === 0 || i === data.length - 1) && (
            <text x={x(i)} y={H - 8} fontSize="9" fill="hsl(var(--muted-foreground))" textAnchor="middle">
              {bucket === 'month' ? d.period : d.period.slice(5)}
            </text>
          )}
        </g>
      ))}
    </svg>
  )
}

function ProductivityTab({
  workspaceId,
  days,
  registerExport,
}: {
  workspaceId: string
  days: number
  registerExport: ExportRegistrar
}) {
  const { t } = useTranslation()
  type Row = {
    userId: string
    displayName: string
    email: string
    avatarUrl?: string | null
    tasksCompleted: number
    tasksCreated: number
    totalAssigned: number
  }

  const [spaceFilter, setSpaceFilter] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [bucket, setBucket] = useState<'week' | 'month'>('week')
  const BUCKET_LABEL: Record<'week' | 'month', TranslationKey> = {
    week: 'reports.bucketWeek',
    month: 'reports.bucketMonth',
  }

  const spacesQuery = useQuery({
    queryKey: ['spaces', workspaceId],
    queryFn: () => api<Array<{ id: string; name: string }>>(`/spaces/workspace/${workspaceId}`),
  })
  const projectsQuery = useQuery({
    queryKey: ['projects', spaceFilter],
    queryFn: () => api<Array<{ id: string; name: string }>>(`/projects/space/${spaceFilter}`),
    enabled: !!spaceFilter,
  })
  const scopeParams = `${spaceFilter ? `&spaceId=${spaceFilter}` : ''}${projectFilter ? `&projectId=${projectFilter}` : ''}`

  const query = useQuery({
    queryKey: ['reports-productivity', workspaceId, days, spaceFilter, projectFilter],
    queryFn: () => api<Row[]>(`/workspaces/${workspaceId}/reports/productivity?days=${days}${scopeParams}`),
  })
  const trendQuery = useQuery({
    queryKey: ['reports-productivity-trend', workspaceId, bucket, spaceFilter, projectFilter],
    queryFn: () =>
      api<Array<{ period: string; tasksCompleted: number }>>(
        `/workspaces/${workspaceId}/reports/productivity-trend?days=180&bucket=${bucket}${scopeParams}`,
      ),
  })
  const trend = trendQuery.data ?? []

  const rows = useMemo(() => query.data ?? [], [query.data])
  useEffect(() => {
    if (rows.length === 0) return registerExport(null)
    registerExport({
      filename: `workspace-productivity-${days}d-${workspaceId}.csv`,
      rows: [
        [t('reports.member'), t('reports.email'), t('reports.assigned'), t('reports.completed'), t('reports.created'), t('reports.completionRatePct')],
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
  }, [rows, days, workspaceId, registerExport, t])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={spaceFilter}
          onChange={(e) => {
            setSpaceFilter(e.target.value)
            setProjectFilter('')
          }}
          className="h-8 rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="">{t('reports.allSpaces')}</option>
          {(spacesQuery.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          disabled={!spaceFilter}
          className="h-8 rounded-md border border-border bg-background px-2 text-sm disabled:opacity-50"
        >
          <option value="">{t('reports.allProjects')}</option>
          {(projectsQuery.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-1 rounded-md border border-border p-0.5 text-xs">
          {(['week', 'month'] as const).map((b) => (
            <button
              key={b}
              onClick={() => setBucket(b)}
              className={cn('px-2 py-0.5 rounded', bucket === b ? 'bg-brand-700 text-white' : 'text-muted-foreground')}
            >
              {t(BUCKET_LABEL[b])}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-2">{t('reports.completedTasksTrend', { period: t(BUCKET_LABEL[bucket]) })}</h3>
        {trend.length === 0 ? (
          <div className="text-center text-muted-foreground py-6 text-sm">{t('reports.noCompletedTasks')}</div>
        ) : (
          <div className="max-w-3xl">
            <ProductivityTrendChart data={trend} bucket={bucket} />
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 pr-4 text-muted-foreground font-medium">{t('reports.member')}</th>
              <th className="text-right py-2 px-4 text-muted-foreground font-medium">{t('reports.assigned')}</th>
              <th className="text-right py-2 px-4 text-muted-foreground font-medium">{t('reports.completed')}</th>
              <th className="text-right py-2 px-4 text-muted-foreground font-medium">{t('reports.created')}</th>
              <th className="text-right py-2 pl-4 text-muted-foreground font-medium">{t('reports.rate')}</th>
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
          <div className="text-center text-muted-foreground py-8">{t('reports.noData')}</div>
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
  const { t } = useTranslation()
  type Data = {
    total: number
    completed: number
    onTime: number
    late: number
    onTimeRate: number
    trend: { date: string; count: number }[]
    statusBreakdown: Record<string, number>
  }

  // Scope filters — mirror the productivity tab's space/project pickers and add
  // an assignee (member) picker. All three flow through to the completion +
  // status-durations endpoints as query params (and into the react-query keys).
  const [spaceFilter, setSpaceFilter] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [memberFilter, setMemberFilter] = useState('')

  const spacesQuery = useQuery({
    queryKey: ['spaces', workspaceId],
    queryFn: () => api<Array<{ id: string; name: string }>>(`/spaces/workspace/${workspaceId}`),
  })
  const projectsQuery = useQuery({
    queryKey: ['projects', spaceFilter],
    queryFn: () => api<Array<{ id: string; name: string }>>(`/projects/space/${spaceFilter}`),
    enabled: !!spaceFilter,
  })
  const membersQuery = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () =>
      api<Array<{ userId: string; displayName: string; email: string }>>(`/workspaces/${workspaceId}/members`),
  })
  const scopeParams = `${spaceFilter ? `&spaceId=${spaceFilter}` : ''}${projectFilter ? `&projectId=${projectFilter}` : ''}${memberFilter ? `&memberId=${memberFilter}` : ''}`

  const query = useQuery({
    queryKey: ['reports-completion', workspaceId, days, spaceFilter, projectFilter, memberFilter],
    queryFn: () => api<Data>(`/workspaces/${workspaceId}/reports/completion?days=${days}${scopeParams}`),
  })
  const durQuery = useQuery({
    queryKey: ['reports-status-durations', workspaceId, days, spaceFilter, projectFilter, memberFilter],
    queryFn: () =>
      api<Array<{ status: string; avgHours: number; samples: number }>>(
        `/workspaces/${workspaceId}/reports/status-durations?days=${days}${scopeParams}`,
      ),
  })
  const durations = durQuery.data ?? []
  const durMax = Math.max(1, ...durations.map((x) => x.avgHours))

  const d = query.data
  useEffect(() => {
    if (!d) return registerExport(null)
    registerExport({
      filename: `workspace-completion-${days}d-${workspaceId}.csv`,
      rows: [
        [t('reports.csvSection'), t('reports.csvLabel'), t('reports.csvValue')],
        ['summary', t('reports.totalTasks'), d.total],
        ['summary', t('reports.completed'), d.completed],
        ['summary', t('reports.onTime'), d.onTime],
        ['summary', t('reports.late'), d.late],
        ['summary', t('reports.onTimeRatePct'), d.onTimeRate],
        ...d.trend.map((point) => ['trend', point.date, point.count] as (string | number)[]),
        ...Object.entries(d.statusBreakdown).map(
          ([status, count]) => ['status', status, count] as (string | number)[],
        ),
      ],
    })
  }, [d, days, workspaceId, registerExport, t])

  const STATUS_COLORS: Record<string, string> = {
    todo: 'bg-gray-400',
    in_progress: 'bg-blue-400',
    in_review: 'bg-amber-400',
    done: 'bg-emerald-400',
    cancelled: 'bg-red-400',
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={spaceFilter}
          onChange={(e) => {
            setSpaceFilter(e.target.value)
            setProjectFilter('')
          }}
          className="h-8 rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="">{t('reports.allSpaces')}</option>
          {(spacesQuery.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          disabled={!spaceFilter}
          className="h-8 rounded-md border border-border bg-background px-2 text-sm disabled:opacity-50"
        >
          <option value="">{t('reports.allProjects')}</option>
          {(projectsQuery.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          value={memberFilter}
          onChange={(e) => setMemberFilter(e.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="">{t('reports.allMembers')}</option>
          {(membersQuery.data ?? []).map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.displayName || m.email}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label={t('reports.totalTasks')} value={d?.total ?? '—'} icon={BarChart3} />
        <StatCard label={t('reports.completed')} value={d?.completed ?? '—'} icon={CheckCircle2} />
        <StatCard label={t('reports.onTime')} value={d?.onTime ?? '—'} icon={TrendingUp} />
        <StatCard label={t('reports.onTimeRate')} value={d ? `${d.onTimeRate}%` : '—'} icon={Target} trend={d && d.onTimeRate >= 70 ? 'up' : 'down'} />
      </div>

      {d && (
        <Card className="p-4">
          <h3 className="text-sm font-medium mb-3">{t('reports.completionsPerDay')}</h3>
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
          <h3 className="text-sm font-medium mb-3">{t('reports.statusBreakdown')}</h3>
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

      {durations.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-medium mb-1">{t('reports.avgTimeInStatus')}</h3>
          <p className="text-xs text-muted-foreground mb-3">
            {t('reports.bottleneckHint')}
          </p>
          <div className="space-y-2">
            {durations.map((row) => (
              <div key={row.status} className="flex items-center gap-3">
                <span className="text-sm w-28 capitalize truncate">{row.status.replace(/_/g, ' ')}</span>
                <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className={cn('h-full rounded-full', STATUS_COLORS[row.status] ?? 'bg-brand-700')}
                    style={{ width: `${Math.max(2, (row.avgHours / durMax) * 100)}%` }}
                  />
                </div>
                <span className="text-sm tabular-nums w-24 text-right">
                  {row.avgHours >= 48 ? `${(row.avgHours / 24).toFixed(1)}d` : `${row.avgHours}h`}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums w-14 text-right">n={row.samples}</span>
              </div>
            ))}
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
  const { t } = useTranslation()
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

  type ProjectRow = {
    projectId: string
    projectName: string
    clientName: string | null
    totalHours: number
    billableHours: number
    entryCount: number
  }

  const query = useQuery({
    queryKey: ['reports-time', workspaceId, days],
    queryFn: () => api<Row[]>(`/workspaces/${workspaceId}/reports/time?days=${days}`),
  })
  const byProjectQuery = useQuery({
    queryKey: ['reports-time-by-project', workspaceId, days],
    queryFn: () => api<ProjectRow[]>(`/workspaces/${workspaceId}/reports/time-by-project?days=${days}`),
  })
  const projectRows = byProjectQuery.data ?? []

  const rows = useMemo(() => query.data ?? [], [query.data])
  const totalHours = rows.reduce((s, r) => s + r.totalHours, 0)
  const billableHours = rows.reduce((s, r) => s + r.billableHours, 0)
  useEffect(() => {
    if (rows.length === 0) return registerExport(null)
    registerExport({
      filename: `workspace-time-${days}d-${workspaceId}.csv`,
      rows: [
        [t('reports.member'), t('reports.email'), t('reports.totalHours'), t('reports.billableHours'), t('reports.entries')],
        ...rows.map((row) => [
          row.displayName,
          row.email,
          row.totalHours,
          row.billableHours,
          row.entryCount,
        ]),
      ],
    })
  }, [rows, days, workspaceId, registerExport, t])

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        <StatCard label={t('reports.totalHours')} value={totalHours.toFixed(1)} icon={Clock} />
        <StatCard label={t('reports.billableHours')} value={billableHours.toFixed(1)} icon={CheckCircle2} />
        <StatCard
          label={t('reports.billableRate')}
          value={totalHours > 0 ? `${Math.round((billableHours / totalHours) * 100)}%` : '—'}
          icon={Target}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 pr-4 text-muted-foreground font-medium">{t('reports.member')}</th>
              <th className="text-right py-2 px-4 text-muted-foreground font-medium">{t('reports.totalHours')}</th>
              <th className="text-right py-2 px-4 text-muted-foreground font-medium">{t('reports.billable')}</th>
              <th className="text-right py-2 pl-4 text-muted-foreground font-medium">{t('reports.entries')}</th>
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
          <div className="text-center text-muted-foreground py-8">{t('reports.noTimeEntries')}</div>
        )}
      </div>

      {projectRows.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2">{t('reports.billableByProject')}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 text-muted-foreground font-medium">{t('reports.project')}</th>
                  <th className="text-left py-2 px-4 text-muted-foreground font-medium">{t('reports.client')}</th>
                  <th className="text-right py-2 px-4 text-muted-foreground font-medium">{t('reports.totalHours')}</th>
                  <th className="text-right py-2 pl-4 text-muted-foreground font-medium">{t('reports.billable')}</th>
                </tr>
              </thead>
              <tbody>
                {projectRows.map((row) => (
                  <tr key={row.projectId} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2 pr-4 font-medium">{row.projectName}</td>
                    <td className="py-2 px-4 text-muted-foreground">{row.clientName ?? '—'}</td>
                    <td className="text-right py-2 px-4 tabular-nums font-medium">{row.totalHours}h</td>
                    <td className="text-right py-2 pl-4 tabular-nums text-emerald-600">{row.billableHours}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
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
  const { t } = useTranslation()
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
        [t('reports.sprint'), t('reports.status'), t('reports.start'), t('reports.end'), t('reports.tasks'), t('reports.points')],
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
  }, [rows, workspaceId, registerExport, t])

  const SPRINT_STATUS_LABEL: Record<string, TranslationKey> = {
    active: 'reports.statusActive',
    completed: 'reports.completed',
    planned: 'reports.statusPlanned',
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('reports.sprintVelocity')}</p>
      {rows.length === 0 && !query.isLoading && (
        <div className="text-center text-muted-foreground py-8">{t('reports.noSprints')}</div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 pr-4 text-muted-foreground font-medium">{t('reports.sprint')}</th>
              <th className="text-left py-2 px-4 text-muted-foreground font-medium">{t('reports.status')}</th>
              <th className="text-right py-2 px-4 text-muted-foreground font-medium">{t('reports.tasks')}</th>
              <th className="text-right py-2 pl-4 text-muted-foreground font-medium">{t('reports.points')}</th>
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
                    {SPRINT_STATUS_LABEL[row.status] ? t(SPRINT_STATUS_LABEL[row.status]) : row.status}
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
  const { t } = useTranslation()
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
        [t('reports.csvSection'), t('reports.csvLabel'), t('reports.csvValue')],
        ['summary', t('reports.totalGoals'), d.total],
        ['summary', t('reports.avgProgressPct'), d.avgProgress],
        ['summary', t('reports.onTrack'), d.byStatus.on_track],
        ['summary', t('reports.atRisk'), d.byStatus.at_risk],
        ['summary', t('reports.offTrack'), d.byStatus.off_track],
        ['summary', t('reports.completed'), d.byStatus.completed],
        ...d.goals.map(
          (goal) => ['goal', goal.title, `${goal.status} · ${goal.progress}%`] as (string | number)[],
        ),
      ],
    })
  }, [d, workspaceId, registerExport, t])
  const STATUS_META: Record<string, { labelKey: TranslationKey; color: string }> = {
    on_track: { labelKey: 'reports.onTrack', color: 'bg-emerald-100 text-emerald-700' },
    at_risk: { labelKey: 'reports.atRisk', color: 'bg-amber-100 text-amber-700' },
    off_track: { labelKey: 'reports.offTrack', color: 'bg-red-100 text-red-700' },
    completed: { labelKey: 'reports.completed', color: 'bg-blue-100 text-blue-700' },
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label={t('reports.totalGoals')} value={d?.total ?? '—'} icon={Target} />
        <StatCard label={t('reports.onTrack')} value={d?.byStatus.on_track ?? '—'} icon={TrendingUp} trend="up" />
        <StatCard label={t('reports.atRisk')} value={d?.byStatus.at_risk ?? '—'} icon={TrendingDown} />
        <StatCard label={t('reports.avgProgress')} value={d ? `${d.avgProgress}%` : '—'} icon={BarChart3} />
      </div>

      {d && d.goals.length > 0 && (
        <div className="space-y-2">
          {d.goals.map((goal) => {
            const meta = STATUS_META[goal.status]
            const statusLabel = meta ? t(meta.labelKey) : goal.status
            const statusColor = meta?.color ?? 'bg-gray-100 text-gray-700'
            return (
              <Card key={goal.id} className="p-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{goal.title}</span>
                      <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0', statusColor)}>
                        {statusLabel}
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
        <div className="text-center text-muted-foreground py-8">{t('reports.noGoals')}</div>
      )}
    </div>
  )
}

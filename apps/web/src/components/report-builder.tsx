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
  CalendarClock,
  Send,
  GripVertical,
} from 'lucide-react'
import { api, downloadFilePost, refusalMessage } from '../lib/api'
import { useAuthStore } from '../store/auth'
import { useTranslation, type TranslationKey } from '../lib/i18n'
import { usePermissions } from '../hooks/use-permissions'

/**
 * Stream a summary from the SSE endpoint (Plan §7.5), invoking `onDelta` with the
 * accumulated text as tokens arrive. Resolves with the full text. Throws on
 * transport/model errors so callers can fall back to the non-streaming route.
 */
async function streamAiSummary(
  body: Record<string, unknown>,
  onDelta: (full: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const token = useAuthStore.getState().accessToken
  const res = await fetch('/api/v1/ai/summarize/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok || !res.body) throw new Error('summary stream failed')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let acc = ''
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6)
      if (data === '[DONE]') continue
      let parsed: { delta?: string; error?: string }
      try {
        parsed = JSON.parse(data)
      } catch {
        continue
      }
      if (parsed.error) throw new Error(parsed.error)
      if (parsed.delta) {
        acc += parsed.delta
        onDelta(acc)
      }
    }
  }
  return acc
}

type Metric = { id: string; labelKey: TranslationKey; agg: 'count' | 'sum' | 'avg' | 'rate' }
type Dimension = { id: string; labelKey: TranslationKey }
type Filter = { field: string; op: string; value: string }

const METRICS: Metric[] = [
  { id: 'tasks-count', labelKey: 'reportBuilder.metricTasksCount', agg: 'count' },
  { id: 'tasks-completed', labelKey: 'reportBuilder.metricTasksCompleted', agg: 'count' },
  { id: 'on-time-rate', labelKey: 'reportBuilder.metricOnTimeRate', agg: 'rate' },
  { id: 'cycle-time', labelKey: 'reportBuilder.metricCycleTime', agg: 'avg' },
  { id: 'time-logged', labelKey: 'reportBuilder.metricTimeLogged', agg: 'sum' },
  { id: 'billable-hours', labelKey: 'reportBuilder.metricBillableHours', agg: 'sum' },
  { id: 'sprint-velocity', labelKey: 'reportBuilder.metricSprintVelocity', agg: 'sum' },
]

// Aggregation badge labels; keyed by the raw agg identifier (uppercased by CSS).
const AGG_LABEL_KEYS: Record<Metric['agg'], TranslationKey> = {
  count: 'reportBuilder.aggCount',
  sum: 'reportBuilder.aggSum',
  avg: 'reportBuilder.aggAvg',
  rate: 'reportBuilder.aggRate',
}

const DIMENSIONS: Dimension[] = [
  { id: 'assignee', labelKey: 'reportBuilder.dimAssignee' },
  { id: 'status', labelKey: 'reportBuilder.dimStatus' },
  { id: 'priority', labelKey: 'reportBuilder.dimPriority' },
  { id: 'project', labelKey: 'reportBuilder.dimProject' },
  { id: 'sprint', labelKey: 'reportBuilder.dimSprint' },
  { id: 'label', labelKey: 'reportBuilder.dimLabel' },
  { id: 'date-week', labelKey: 'reportBuilder.dimWeek' },
  { id: 'date-month', labelKey: 'reportBuilder.dimMonth' },
]

const VIZ: Array<{ id: 'bar' | 'line' | 'pie' | 'table'; labelKey: TranslationKey; icon: React.ElementType }> = [
  { id: 'bar', labelKey: 'reportBuilder.chartBar', icon: BarChart3 },
  { id: 'line', labelKey: 'reportBuilder.chartLine', icon: TrendingUp },
  { id: 'pie', labelKey: 'reportBuilder.chartPie', icon: PieChart },
  { id: 'table', labelKey: 'reportBuilder.chartTable', icon: TableIcon },
]

const RANGES: Array<{ days: number; labelKey: TranslationKey }> = [
  { days: 7, labelKey: 'reportBuilder.range7d' },
  { days: 30, labelKey: 'reportBuilder.range30d' },
  { days: 90, labelKey: 'reportBuilder.range90d' },
  { days: 365, labelKey: 'reportBuilder.range1y' },
]

const FILTER_FIELDS = ['priority', 'status', 'project', 'assignee'] as const

type ScheduleFrequency = 'none' | 'daily' | 'weekly'

const WEEKDAYS: Array<{ value: number; labelKey: TranslationKey }> = [
  { value: 0, labelKey: 'reportBuilder.weekdaySun' },
  { value: 1, labelKey: 'reportBuilder.weekdayMon' },
  { value: 2, labelKey: 'reportBuilder.weekdayTue' },
  { value: 3, labelKey: 'reportBuilder.weekdayWed' },
  { value: 4, labelKey: 'reportBuilder.weekdayThu' },
  { value: 5, labelKey: 'reportBuilder.weekdayFri' },
  { value: 6, labelKey: 'reportBuilder.weekdaySat' },
]

const hourLabel = (h?: number) => `${String(typeof h === 'number' ? h : 8).padStart(2, '0')}:00`
/** Split a comma/newline-separated recipient string into trimmed, non-empty emails. */
const parseRecipients = (raw: string) =>
  raw
    .split(/[,\n]/)
    .map((e) => e.trim())
    .filter((e) => e.length > 0)

type ReportRow = { key: string; label: string; values: Record<string, number> }
type ReportResult = { dimension: string; metrics: string[]; generatedAt: string; rows: ReportRow[] }
type SavedReport = {
  id: string
  name: string
  definition: any
  createdAt: string
  scheduleFrequency?: ScheduleFrequency
  scheduleHour?: number
  scheduleDayOfWeek?: number | null
  scheduleRecipients?: string[]
  lastSentAt?: string | null
}

/** "Daily 08:00" / "Mon 08:00" badge label for a scheduled saved report. */
const scheduleBadge = (t: (k: TranslationKey, vars?: Record<string, string>) => string, r: SavedReport) => {
  const time = hourLabel(r.scheduleHour)
  if (r.scheduleFrequency === 'weekly') {
    const wd = WEEKDAYS.find((w) => w.value === (r.scheduleDayOfWeek ?? 1)) ?? WEEKDAYS[1]
    return t('reportBuilder.scheduleBadgeWeekly', { day: t(wd.labelKey), time })
  }
  return t('reportBuilder.scheduleBadgeDaily', { time })
}

const metricLabel = (t: (k: TranslationKey) => string, id: string) => {
  const m = METRICS.find((x) => x.id === id)
  return m ? t(m.labelKey) : id
}
const dimensionLabel = (t: (k: TranslationKey) => string, id: string) => {
  const d = DIMENSIONS.find((x) => x.id === id)
  return d ? t(d.labelKey) : id
}
const csvCell = (v: string | number) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function ReportBuilder({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  // Exporting asks `report.export`, as the API does of its exports; running the report does not.
  const mayExport = usePermissions(workspaceId).can('report.export') === true
  const qc = useQueryClient()
  const userEmail = useAuthStore((s) => s.user?.email ?? '')
  const [name, setName] = useState(() => t('reportBuilder.untitledName'))
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(['tasks-completed', 'on-time-rate'])
  const [selectedDimensions, setSelectedDimensions] = useState<string[]>(['assignee'])
  const [filters, setFilters] = useState<Filter[]>([])
  const [viz, setViz] = useState<'bar' | 'line' | 'pie' | 'table'>('bar')
  const [days, setDays] = useState(30)
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null)
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [aiSummarizing, setAiSummarizing] = useState(false)
  const [draftFilter, setDraftFilter] = useState<Filter>({ field: 'priority', op: 'is', value: '' })
  // §9.5 scheduled delivery
  const [scheduleFrequency, setScheduleFrequency] = useState<ScheduleFrequency>('none')
  const [scheduleHour, setScheduleHour] = useState(8)
  const [scheduleDayOfWeek, setScheduleDayOfWeek] = useState(1)
  const [scheduleRecipients, setScheduleRecipients] = useState(() => userEmail)
  const [lastSentAt, setLastSentAt] = useState<string | null>(null)

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

  const buildSchedule = () => ({
    frequency: scheduleFrequency,
    hour: scheduleHour,
    dayOfWeek: scheduleFrequency === 'weekly' ? scheduleDayOfWeek : null,
    recipients: parseRecipients(scheduleRecipients),
  })

  const saveMutation = useMutation({
    mutationFn: () => {
      const schedule = buildSchedule()
      return activeSavedId
        ? api<SavedReport>(`/workspaces/${workspaceId}/reports/custom/${activeSavedId}`, {
            method: 'PATCH',
            body: { name, definition, schedule },
          })
        : api<SavedReport>(`/workspaces/${workspaceId}/reports/custom`, {
            method: 'POST',
            body: { name, definition, schedule },
          })
    },
    onSuccess: (row) => {
      if (row?.id) setActiveSavedId(row.id)
      if (row && 'lastSentAt' in row) setLastSentAt(row.lastSentAt ?? null)
      qc.invalidateQueries({ queryKey: ['custom-reports', workspaceId] })
      toast.success(t('reportBuilder.toastSaved'))
    },
    onError: () => toast.error(t('reportBuilder.toastSaveError')),
  })

  const sendNowMutation = useMutation({
    mutationFn: () =>
      api(`/workspaces/${workspaceId}/reports/custom/${activeSavedId}/send-now`, { method: 'POST' }),
    onSuccess: () => {
      setLastSentAt(new Date().toISOString())
      qc.invalidateQueries({ queryKey: ['custom-reports', workspaceId] })
      toast.success(t('reportBuilder.toastSentNow'))
    },
    onError: () => toast.error(t('reportBuilder.toastSendNowError')),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/workspaces/${workspaceId}/reports/custom/${id}`, { method: 'DELETE' }),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ['custom-reports', workspaceId] })
      if (activeSavedId === id) {
        setActiveSavedId(null)
        setName(t('reportBuilder.untitledName'))
      }
    },
  })

  // Stream the project summary token-by-token into the panel (Plan §7.5), with a
  // non-streaming fallback to /ai/summarize if the stream can't be established.
  async function runAiSummary() {
    if (!result || aiSummarizing) return
    const content = reportAsText(name, result)
    setAiSummarizing(true)
    setAiSummary('')
    try {
      await streamAiSummary({ content, type: 'project', workspaceId }, (full) => setAiSummary(full))
    } catch {
      try {
        const r = await api<{ summary: string }>('/ai/summarize', {
          method: 'POST',
          body: { content, type: 'project', workspaceId },
        })
        setAiSummary(r.summary)
      } catch {
        setAiSummary(null)
        toast.error(t('reportBuilder.toastAiUnavailable'))
      }
    } finally {
      setAiSummarizing(false)
    }
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
    setScheduleFrequency(r.scheduleFrequency ?? 'none')
    setScheduleHour(typeof r.scheduleHour === 'number' ? r.scheduleHour : 8)
    setScheduleDayOfWeek(typeof r.scheduleDayOfWeek === 'number' ? r.scheduleDayOfWeek : 1)
    setScheduleRecipients(
      Array.isArray(r.scheduleRecipients) && r.scheduleRecipients.length
        ? r.scheduleRecipients.join(', ')
        : userEmail,
    )
    setLastSentAt(r.lastSentAt ?? null)
    setActiveSavedId(r.id)
    setAiSummary(null)
  }
  function newReport() {
    setActiveSavedId(null)
    setName(t('reportBuilder.untitledName'))
    setScheduleFrequency('none')
    setScheduleHour(8)
    setScheduleDayOfWeek(1)
    setScheduleRecipients(userEmail)
    setLastSentAt(null)
    setAiSummary(null)
  }
  function exportCsv() {
    if (!result || result.rows.length === 0) {
      toast.error(t('reportBuilder.toastNothingExport'))
      return
    }
    const header = [t('reportBuilder.groupColumn'), ...result.metrics.map((m) => metricLabel(t, m))]
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

  async function exportPdf() {
    if (!result || result.rows.length === 0) {
      toast.error(t('reportBuilder.toastNothingExport'))
      return
    }
    try {
      await downloadFilePost(
        `/workspaces/${workspaceId}/reports/custom/export.pdf`,
        definition,
        `${(name || 'report').replace(/[^a-z0-9-_]+/gi, '-')}.pdf`,
      )
    } catch (e) {
      toast.error(refusalMessage(e, t('reportBuilder.toastPdfError')))
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4 h-[calc(100vh-200px)]">
      {/* Left: builder */}
      <Card variant="glass" className="overflow-hidden p-0 flex flex-col">
        <div className="px-4 py-3 border-b border-border/40 space-y-2">
          <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {t('reportBuilder.reportName')}
          </Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
        </div>
        <div className="flex-1 overflow-auto">
          <Section title={t('reportBuilder.sectionMetrics')} icon={Sigma}>
            <MetricSelector selected={selectedMetrics} onChange={setSelectedMetrics} />
          </Section>
          <Section title={t('reportBuilder.sectionGroupBy')} icon={Layers}>
            <div className="space-y-1">
              {DIMENSIONS.map((d) => (
                <PickRow
                  key={d.id}
                  label={t(d.labelKey)}
                  active={selectedDimensions[0] === d.id}
                  onToggle={() => toggleDimension(d.id)}
                />
              ))}
            </div>
          </Section>
          <Section title={t('reportBuilder.sectionFilters')} icon={FilterIcon}>
            <ul className="space-y-1.5 mb-2">
              {filters.map((f, i) => (
                <li
                  key={i}
                  className="flex items-center gap-1.5 rounded-md border border-border/40 bg-card/40 px-2 py-1.5 text-xs"
                >
                  <span className="font-medium">{dimensionLabel(t, f.field)}</span>
                  <span className="text-muted-foreground">{f.op === 'is' ? t('reportBuilder.filterOpIs') : f.op}</span>
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
                    {dimensionLabel(t, f)}
                  </option>
                ))}
              </select>
              <Input
                value={draftFilter.value}
                onChange={(e) => setDraftFilter((f) => ({ ...f, value: e.target.value }))}
                placeholder={t('reportBuilder.filterValuePlaceholder')}
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
          <Section title={t('reportBuilder.sectionDateRange')} icon={TrendingUp}>
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
                  {t(r.labelKey)}
                </button>
              ))}
            </div>
          </Section>
          <Section title={t('reportBuilder.sectionSchedule')} icon={CalendarClock}>
            <div className="space-y-2.5">
              <select
                value={scheduleFrequency}
                onChange={(e) => setScheduleFrequency(e.target.value as ScheduleFrequency)}
                className="h-8 w-full rounded-md border border-border/60 bg-card text-xs px-2"
              >
                <option value="none">{t('reportBuilder.scheduleOff')}</option>
                <option value="daily">{t('reportBuilder.scheduleDaily')}</option>
                <option value="weekly">{t('reportBuilder.scheduleWeekly')}</option>
              </select>

              {scheduleFrequency !== 'none' && (
                <>
                  <div className="flex gap-2">
                    <label className="flex-1 space-y-1">
                      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                        {t('reportBuilder.scheduleTimeUtc')}
                      </span>
                      <select
                        value={scheduleHour}
                        onChange={(e) => setScheduleHour(parseInt(e.target.value, 10))}
                        className="h-8 w-full rounded-md border border-border/60 bg-card text-xs px-2"
                      >
                        {Array.from({ length: 24 }, (_, h) => (
                          <option key={h} value={h}>
                            {hourLabel(h)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {scheduleFrequency === 'weekly' && (
                      <label className="flex-1 space-y-1">
                        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                          {t('reportBuilder.scheduleWeekday')}
                        </span>
                        <select
                          value={scheduleDayOfWeek}
                          onChange={(e) => setScheduleDayOfWeek(parseInt(e.target.value, 10))}
                          className="h-8 w-full rounded-md border border-border/60 bg-card text-xs px-2"
                        >
                          {WEEKDAYS.map((wd) => (
                            <option key={wd.value} value={wd.value}>
                              {t(wd.labelKey)}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>

                  <label className="block space-y-1">
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      {t('reportBuilder.scheduleRecipients')}
                    </span>
                    <Input
                      value={scheduleRecipients}
                      onChange={(e) => setScheduleRecipients(e.target.value)}
                      placeholder={t('reportBuilder.scheduleRecipientsPlaceholder')}
                      className="h-8 text-xs"
                    />
                    <span className="block text-[10px] text-muted-foreground">
                      {t('reportBuilder.scheduleRecipientsHint')}
                    </span>
                  </label>

                  {activeSavedId ? (
                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      <span className="text-[10px] text-muted-foreground truncate">
                        {lastSentAt
                          ? t('reportBuilder.scheduleLastSent', { when: new Date(lastSentAt).toLocaleString() })
                          : t('reportBuilder.scheduleNeverSent')}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 shrink-0"
                        onClick={() => sendNowMutation.mutate()}
                        disabled={sendNowMutation.isPending}
                      >
                        {sendNowMutation.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Send className="h-3 w-3" />
                        )}{' '}
                        {sendNowMutation.isPending ? t('reportBuilder.sendingNow') : t('reportBuilder.sendNow')}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-[10px] text-muted-foreground">{t('reportBuilder.scheduleSaveFirst')}</p>
                  )}
                </>
              )}
            </div>
          </Section>
          <Section title={t('reportBuilder.sectionSavedReports')} icon={Save}>
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
                    {r.scheduleFrequency && r.scheduleFrequency !== 'none' && (
                      <span
                        className="shrink-0"
                        title={
                          r.lastSentAt
                            ? t('reportBuilder.scheduleLastSent', { when: new Date(r.lastSentAt).toLocaleString() })
                            : t('reportBuilder.scheduleNeverSent')
                        }
                      >
                        <Badge variant="soft" className="text-[9px] gap-0.5">
                          <CalendarClock className="h-2.5 w-2.5" />
                          {scheduleBadge(t, r)}
                        </Badge>
                      </span>
                    )}
                    <button
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteMutation.mutate(r.id)}
                      title={t('reportBuilder.deleteReportTitle')}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground px-1">{t('reportBuilder.noSavedReports')}</p>
            )}
          </Section>
        </div>
        <div className="border-t border-border/40 p-3 flex items-center gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={newReport}>
            {t('reportBuilder.newButton')}
          </Button>
          <Button
            variant="gradient"
            size="sm"
            className="flex-1"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            <Save className="h-3.5 w-3.5" /> {activeSavedId ? t('reportBuilder.update') : t('common.save')}
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
                {t(v.labelKey)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => runAiSummary()} disabled={aiSummarizing || !result}>
              {aiSummarizing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} {t('reportBuilder.aiSummarize')}
            </Button>
            {mayExport && (
              <>
                <Button variant="outline" size="sm" data-testid="report-builder-export-pdf" onClick={exportPdf}>
                  {t('reportBuilder.exportPdf')}
                </Button>
                <Button variant="outline" size="sm" data-testid="report-builder-export-csv" onClick={exportCsv}>
                  {t('reportBuilder.exportCsv')}
                </Button>
              </>
            )}
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
                <Sigma className="h-3 w-3" /> {metricLabel(t, m)}
              </Badge>
            ))}
            <Badge variant="soft" className="text-[10px]">
              <Users className="h-3 w-3" /> {t('reportBuilder.byDimension', { dimension: dimensionLabel(t, dimension) })}
            </Badge>
          </div>

          {aiSummary !== null && (
            <div className="mb-5 rounded-lg border border-accent/30 bg-accent/5 p-4 text-sm whitespace-pre-wrap">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-accent mb-1">
                <Sparkles className="h-3.5 w-3.5" /> {t('reportBuilder.aiSummary')}
              </div>
              {aiSummary}
              {aiSummarizing && (
                <span className="inline-block w-1 h-3.5 bg-accent ml-0.5 align-middle animate-pulse" />
              )}
            </div>
          )}

          {runQuery.isError ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5 text-sm text-destructive">
              {t('reportBuilder.runError')}
            </div>
          ) : selectedMetrics.length === 0 ? (
            <Empty text={t('reportBuilder.emptyNoMetric')} />
          ) : !result || result.rows.length === 0 ? (
            <Empty text={runQuery.isLoading ? t('reportBuilder.running') : t('reportBuilder.noData')} />
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

// §9.5 — genuine drag-and-drop metric selection. Uses the same native HTML5 DnD
// approach as dashboard-widget-builder (setData/effectAllowed + a reorder that
// splices the source into the target's slot). Metrics drag out of "Available"
// into the "Selected" drop zone, reorder within Selected (their order drives the
// report's `metrics` array and thus the primary series), and drag back out /
// click the ✕ to remove. Clicking an available row still adds it (fallback).
function MetricSelector({
  selected,
  onChange,
}: {
  selected: string[]
  onChange: (updater: (arr: string[]) => string[]) => void
}) {
  const { t } = useTranslation()
  const [drag, setDrag] = useState<{ id: string; from: 'available' | 'selected' } | null>(null)
  const [overZone, setOverZone] = useState<'available' | 'selected' | null>(null)

  const selectedMetrics = selected
    .map((id) => METRICS.find((m) => m.id === id))
    .filter((m): m is Metric => Boolean(m))
  const available = METRICS.filter((m) => !selected.includes(m.id))

  function addMetric(id: string, beforeId?: string) {
    onChange((arr) => {
      if (arr.includes(id)) return arr
      const idx = beforeId ? arr.indexOf(beforeId) : -1
      if (idx === -1) return [...arr, id]
      const next = [...arr]
      next.splice(idx, 0, id)
      return next
    })
  }
  // Move `sourceId` into `targetId`'s slot (same splice model as the widget grid).
  function reorder(sourceId: string, targetId: string) {
    if (sourceId === targetId) return
    onChange((arr) => {
      const from = arr.indexOf(sourceId)
      const to = arr.indexOf(targetId)
      if (from === -1 || to === -1) return arr
      const next = [...arr]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }
  function moveToEnd(id: string) {
    onChange((arr) => {
      const from = arr.indexOf(id)
      if (from === -1) return arr
      const next = [...arr]
      const [moved] = next.splice(from, 1)
      next.push(moved)
      return next
    })
  }
  function removeMetric(id: string) {
    onChange((arr) => arr.filter((x) => x !== id))
  }

  function dropOnChip(targetId: string) {
    if (!drag) return
    if (drag.from === 'available') addMetric(drag.id, targetId)
    else reorder(drag.id, targetId)
    setDrag(null)
    setOverZone(null)
  }
  function dropOnSelectedZone() {
    if (!drag) return
    if (drag.from === 'available') addMetric(drag.id)
    else moveToEnd(drag.id)
    setDrag(null)
    setOverZone(null)
  }
  function dropOnAvailableZone() {
    if (drag?.from === 'selected') removeMetric(drag.id)
    setDrag(null)
    setOverZone(null)
  }
  const endDrag = () => {
    setDrag(null)
    setOverZone(null)
  }

  return (
    <div className="space-y-2.5">
      {/* Selected metrics — ordered drop zone */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
          {t('reportBuilder.selectedMetrics')}
        </div>
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setOverZone('selected')
          }}
          onDragLeave={() => setOverZone((z) => (z === 'selected' ? null : z))}
          onDrop={(e) => {
            e.preventDefault()
            dropOnSelectedZone()
          }}
          className={cn(
            'rounded-md border border-dashed p-1.5 min-h-[52px] space-y-1 transition-colors',
            overZone === 'selected' ? 'border-accent bg-accent/5' : 'border-border/60',
          )}
        >
          {selectedMetrics.length === 0 ? (
            <div className="px-1.5 py-2 text-center text-[11px] text-muted-foreground">
              {t('reportBuilder.dropMetricsHere')}
            </div>
          ) : (
            selectedMetrics.map((m) => (
              <div
                key={m.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/plain', m.id)
                  setDrag({ id: m.id, from: 'selected' })
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  dropOnChip(m.id)
                }}
                onDragEnd={endDrag}
                className={cn(
                  'group flex items-center gap-1.5 rounded-md border border-accent/40 bg-card/60 px-2 py-1.5 text-xs cursor-grab active:cursor-grabbing',
                  drag?.id === m.id && 'opacity-40',
                )}
              >
                <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground" aria-label={t('dashboardWidget.dragToReorder')} />
                <span className="flex-1 truncate">{t(m.labelKey)}</span>
                <Badge variant="soft" className="text-[9px] uppercase">
                  {t(AGG_LABEL_KEYS[m.agg])}
                </Badge>
                <button
                  type="button"
                  onClick={() => removeMetric(m.id)}
                  title={t('reportBuilder.removeMetric')}
                  aria-label={t('reportBuilder.removeMetric')}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Available metrics — drag into Selected, or click to add. Dropping a
          selected metric back here removes it. */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
          {t('reportBuilder.availableMetrics')}
        </div>
        <div
          onDragOver={(e) => {
            if (drag?.from === 'selected') {
              e.preventDefault()
              setOverZone('available')
            }
          }}
          onDragLeave={() => setOverZone((z) => (z === 'available' ? null : z))}
          onDrop={(e) => {
            e.preventDefault()
            dropOnAvailableZone()
          }}
          className={cn(
            'rounded-md border border-dashed p-1 space-y-1 transition-colors min-h-[36px]',
            overZone === 'available' ? 'border-destructive/60 bg-destructive/5' : 'border-transparent',
          )}
        >
          {available.length === 0 ? (
            <div className="px-1.5 py-1.5 text-center text-[11px] text-muted-foreground">
              {t('reportBuilder.dropMetricsHere')}
            </div>
          ) : (
            available.map((m) => (
              <div
                key={m.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/plain', m.id)
                  setDrag({ id: m.id, from: 'available' })
                }}
                onDragEnd={endDrag}
                onClick={() => addMetric(m.id)}
                className={cn(
                  'group flex items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-xs text-muted-foreground cursor-grab active:cursor-grabbing hover:border-border hover:bg-card/40 hover:text-foreground',
                  drag?.id === m.id && 'opacity-40',
                )}
              >
                <GripVertical className="h-3 w-3 shrink-0 opacity-60" />
                <span className="flex-1 truncate">{t(m.labelKey)}</span>
                <Badge variant="soft" className="text-[9px] uppercase">
                  {t(AGG_LABEL_KEYS[m.agg])}
                </Badge>
                <Plus className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100" />
              </div>
            ))
          )}
        </div>
      </div>
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
  const { t } = useTranslation()
  const rows = result.rows.slice(0, 12)
  const max = Math.max(1, ...rows.map((r) => r.values[primary] ?? 0))
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-3">{t('reportBuilder.metricByDimension', { metric: metricLabel(t, primary), dimension: dimensionLabel(t, result.dimension) })}</div>
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
  const { t } = useTranslation()
  const rows = result.rows.slice(0, 24)
  const points = rows.map((r) => r.values[primary] ?? 0)
  const max = Math.max(1, ...points)
  if (points.length < 2) return <ResultBars result={result} primary={primary} />
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-3">{t('reportBuilder.metricByDimension', { metric: metricLabel(t, primary), dimension: dimensionLabel(t, result.dimension) })}</div>
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
  const { t } = useTranslation()
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border/40">
          <th className="px-2 py-2 text-left">{dimensionLabel(t, result.dimension)}</th>
          {result.metrics.map((m) => (
            <th key={m} className="px-2 py-2 text-right">
              {metricLabel(t, m)}
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

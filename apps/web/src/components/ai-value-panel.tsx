/**
 * §V2-11 — the AI Analytics surface, frames `19:00` and `19:05`.
 *
 * WHAT WAS ACTUALLY MISSING. Rundesk already renders AI usage — cost, calls,
 * tokens, per-user and per-model — in workspace settings (`AiUsageTab`, §A4.4).
 * The audit said there was no surface; there was. The gap the frames show is a
 * FRAMING one: that panel answers "what did AI cost", and the frames answer
 * "what was it worth", which is the question somebody renewing a subscription
 * actually asks.
 *
 * EVERY NUMBER HERE IS AN ESTIMATE AND THE PAGE SAYS SO. Time saved cannot be
 * measured, only inferred from a benchmark somebody chose — ClickUp admits this
 * by putting "Edit benchmark" on the page, and so does this. The arithmetic is
 * shown next to the result (`N runs × M min`), the benchmark is editable by an
 * admin, and the net figure is allowed to be NEGATIVE. A panel that cannot
 * report a loss is marketing, not analytics.
 *
 * THE UNIT IS A RUN, NOT AN "ACTION". One run is one call to the model. A
 * single thing a person did can be several runs, so the word "actions" would
 * quietly inflate every figure on this page.
 *
 * CREDITS ARE DELIBERATELY ABSENT. The frames show a credit balance and "Add
 * credits"; Rundesk bills in dollars and has no credit concept. Minting an
 * in-app currency to mirror a competitor's packaging would invent a product
 * decision nobody has taken.
 */

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input, cn, toast } from '@rundesk/ui'
import { Clock, DollarSign, Sparkles, SlidersHorizontal } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useTranslation } from '../lib/i18n'

type ValueResponse = {
  runs: number
  costUsd: number
  benchmark: { minutesSavedPerRun: number; hourlyRateCents: number }
  minutesSaved: number
  laborValueUsd: number
  netValueUsd: number
  byFeature: Record<string, { calls: number; costUsd: number }>
}

type RunRow = {
  id: string
  feature: string
  model: string
  inputTokens: number
  outputTokens: number
  createdAt: string
  userId: string | null
  costUsd: number
}

const RANGES = [
  { days: 7, labelKey: 'settings.aiRange7' },
  { days: 30, labelKey: 'settings.aiRange30' },
  { days: 90, labelKey: 'settings.aiRange90' },
] as const

/** "3h 20m" — hours and minutes, because "3.33 hours" is not something people say. */
function formatMinutes(total: number): string {
  const whole = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0
  const h = Math.floor(whole / 60)
  const m = whole % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

const money = (n: number) => `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  testId,
}: {
  icon: typeof Clock
  label: string
  value: string
  hint?: string
  tone?: 'good' | 'bad'
  testId: string
}) {
  return (
    <Card className="p-3" data-testid={testId}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div
        className={cn(
          'mt-1 text-xl font-semibold tabular-nums',
          tone === 'good' && 'text-emerald-600 dark:text-emerald-500',
          tone === 'bad' && 'text-rose-600 dark:text-rose-500',
        )}
      >
        {value}
      </div>
      {/* The working, under the answer. A figure somebody may put in a business
          case has to show where it came from. */}
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </Card>
  )
}

export function AiValuePanel({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [days, setDays] = useState<number>(30)
  const [tab, setTab] = useState<'value' | 'activity'>('value')
  const [editing, setEditing] = useState(false)
  const [minutes, setMinutes] = useState('')
  const [rate, setRate] = useState('')
  const [feature, setFeature] = useState('')

  const from = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - days)
    return d.toISOString()
  }, [days])

  const valueQuery = useQuery({
    queryKey: ['ai-value', workspaceId, days],
    queryFn: () =>
      api<ValueResponse>(`/ai/value?workspaceId=${workspaceId}&from=${encodeURIComponent(from)}`),
  })

  const activityQuery = useQuery({
    enabled: tab === 'activity',
    queryKey: ['ai-activity', workspaceId, days, feature],
    queryFn: () =>
      api<RunRow[]>(
        `/ai/activity?workspaceId=${workspaceId}&from=${encodeURIComponent(from)}` +
          (feature ? `&feature=${encodeURIComponent(feature)}` : ''),
      ),
  })

  const saveBenchmark = useMutation({
    mutationFn: (patch: { minutesSavedPerRun?: number; hourlyRateCents?: number }) =>
      api(`/ai/value/benchmark?workspaceId=${workspaceId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: async () => {
      setEditing(false)
      await qc.invalidateQueries({ queryKey: ['ai-value', workspaceId] })
      toast.success(t('aiValue.benchmarkSaved'))
    },
    onError: (err) => {
      // The API refuses with a sentence ("Minutes saved per run must be…"), so
      // it is shown as written rather than replaced by a generic failure.
      toast.error(err instanceof ApiError ? err.message : t('aiValue.benchmarkFailed'))
    },
  })

  const data = valueQuery.data
  const features = Object.entries(data?.byFeature ?? {}).sort((a, b) => b[1].calls - a[1].calls)
  const runs = activityQuery.data ?? []

  return (
    <div className="h-full overflow-auto p-6 space-y-4" data-testid="ai-value-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1">
          {(['value', 'activity'] as const).map((id) => (
            <button
              key={id}
              type="button"
              data-testid={`ai-analytics-tab-${id}`}
              onClick={() => setTab(id)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm',
                tab === id ? 'bg-accent/15 font-medium text-foreground' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {t(id === 'value' ? 'aiValue.tabValue' : 'aiValue.tabActivity')}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <Button
              key={r.days}
              size="sm"
              variant={days === r.days ? 'default' : 'outline'}
              className="text-xs"
              data-testid={`ai-value-range-${r.days}`}
              onClick={() => setDays(r.days)}
            >
              {t(r.labelKey)}
            </Button>
          ))}
        </div>
      </div>

      {tab === 'value' ? (
        <>
          {valueQuery.isPending ? (
            /* §2.9a — the shape of what is coming, never the word. */
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true" aria-live="polite">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-20 rounded-md border border-border bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                testId="ai-value-runs"
                icon={Sparkles}
                label={t('aiValue.runs')}
                value={String(data?.runs ?? 0)}
              />
              <Stat
                testId="ai-value-time"
                icon={Clock}
                label={t('aiValue.timeSaved')}
                value={formatMinutes(data?.minutesSaved ?? 0)}
                hint={t('aiValue.timeWorking', {
                  runs: String(data?.runs ?? 0),
                  minutes: String(data?.benchmark.minutesSavedPerRun ?? 0),
                })}
              />
              <Stat
                testId="ai-value-labor"
                icon={DollarSign}
                label={t('aiValue.laborValue')}
                value={money(data?.laborValueUsd ?? 0)}
                hint={t('aiValue.laborWorking', {
                  rate: money((data?.benchmark.hourlyRateCents ?? 0) / 100),
                })}
              />
              <Stat
                testId="ai-value-net"
                icon={DollarSign}
                label={t('aiValue.net')}
                value={money(data?.netValueUsd ?? 0)}
                /*
                 * Coloured both ways on purpose. A negative net is a real and
                 * useful answer — usage that costs more than the time it saves
                 * at this benchmark — and a panel that could only ever look
                 * good would not be worth reading.
                 */
                tone={(data?.netValueUsd ?? 0) < 0 ? 'bad' : 'good'}
                hint={t('aiValue.netWorking', { cost: money(data?.costUsd ?? 0) })}
              />
            </div>
          )}

          <Card className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">{t('aiValue.benchmarkTitle')}</h3>
                {/* Said plainly, at the top, not in a footnote: this is an
                    estimate and these are its inputs. */}
                <p className="mt-0.5 text-xs text-muted-foreground">{t('aiValue.benchmarkDesc')}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                data-testid="ai-value-edit-benchmark"
                onClick={() => {
                  setMinutes(String(data?.benchmark.minutesSavedPerRun ?? 0))
                  setRate(((data?.benchmark.hourlyRateCents ?? 0) / 100).toFixed(2))
                  setEditing((v) => !v)
                }}
              >
                <SlidersHorizontal className="mr-1 h-3 w-3" />
                {t('aiValue.editBenchmark')}
              </Button>
            </div>

            {editing && (
              <div className="mt-3 flex flex-wrap items-end gap-3" data-testid="ai-value-benchmark-form">
                <label className="text-xs text-muted-foreground">
                  {t('aiValue.minutesPerRun')}
                  <Input
                    className="mt-1 w-28"
                    data-testid="ai-value-minutes"
                    value={minutes}
                    inputMode="numeric"
                    onChange={(e) => setMinutes(e.target.value)}
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  {t('aiValue.hourlyRate')}
                  <Input
                    className="mt-1 w-32"
                    data-testid="ai-value-rate"
                    value={rate}
                    inputMode="decimal"
                    onChange={(e) => setRate(e.target.value)}
                  />
                </label>
                <Button
                  size="sm"
                  data-testid="ai-value-save-benchmark"
                  disabled={saveBenchmark.isPending}
                  onClick={() =>
                    saveBenchmark.mutate({
                      minutesSavedPerRun: Number(minutes),
                      // Cents, so the rate never rounds through a float.
                      hourlyRateCents: Math.round(Number(rate) * 100),
                    })
                  }
                >
                  {t('common.save')}
                </Button>
              </div>
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold">{t('aiValue.byFeature')}</h3>
            </div>
            {features.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t('aiValue.noRuns')}</p>
            ) : (
              <ul className="divide-y divide-border">
                {features.map(([name, row]) => (
                  <li key={name} className="flex items-center justify-between px-4 py-2 text-sm" data-testid="ai-value-feature">
                    <span className="truncate">{name}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {t('aiValue.featureRuns', { count: String(row.calls) })} · {money(row.costUsd)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      ) : (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold">{t('aiValue.tabActivity')}</h3>
            <select
              className="ml-auto h-7 rounded border border-border bg-background px-2 text-xs"
              data-testid="ai-activity-feature"
              value={feature}
              onChange={(e) => setFeature(e.target.value)}
            >
              <option value="">{t('aiValue.allFeatures')}</option>
              {features.map(([name]) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          {activityQuery.isPending ? (
            <div className="space-y-2 p-4" aria-busy="true" aria-live="polite">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-8 rounded bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : runs.length === 0 ? (
            /*
             * Frame `19:05` — "No activity found … Clear filters". An empty list
             * with a filter applied must say the filter is why, and offer to
             * drop it; without that the person concludes the feature is broken.
             */
            <div className="px-4 py-8 text-center" data-testid="ai-activity-empty">
              <p className="text-sm text-muted-foreground">{t('aiValue.noActivity')}</p>
              {feature && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  data-testid="ai-activity-clear-filters"
                  onClick={() => setFeature('')}
                >
                  {t('aiValue.clearFilters')}
                </Button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {runs.map((run) => (
                <li key={run.id} className="flex items-center gap-3 px-4 py-2 text-sm" data-testid="ai-activity-row">
                  <span className="w-40 shrink-0 truncate text-muted-foreground">{run.feature}</span>
                  <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{run.model}</span>
                  <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
                    {new Date(run.createdAt).toLocaleString()}
                  </span>
                  <span className="w-16 shrink-0 text-right tabular-nums text-[11px]">{money(run.costUsd)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  )
}

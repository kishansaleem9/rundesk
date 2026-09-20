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
 * STILL TRUE AFTER §V2-S18's re-audit, and re-checked rather than assumed.
 * `recordUsage` still fires once per `messages.create`, so the reason this note
 * gives has not expired. Frames `18:53`/`18:56`/`18:59` head their grid
 * "Actions completed" over EIGHT CATEGORIES, and the re-audit closed that row
 * by building the categories — the grouping is the substance of the frame —
 * while keeping the unit. So the tiles carry the frame's eight labels, the
 * heading says what it is counting, and no string renames a run to an action.
 * If image generation or connected-app actions ever land, a run and an action
 * diverge further, not less.
 *
 * THREE OF THE EIGHT CANNOT BE FILLED, AND SAY SO. There is no image
 * generation in `apps/api`, and no tool in `COMMAND_TOOLS` reaches a connected
 * app. Those tiles print the reason rather than a zero, because a zero that
 * means "impossible" and a zero that means "you did none" look identical.
 *
 * CREDITS ARE DELIBERATELY ABSENT. The frames show a credit balance and "Add
 * credits"; Rundesk bills in dollars and has no credit concept. Minting an
 * in-app currency to mirror a competitor's packaging would invent a product
 * decision nobody has taken.
 */

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input, cn, toast } from '@rundesk/ui'
import {
  AlertTriangle,
  CheckCircle2,
  CheckSquare,
  Clock,
  DollarSign,
  FileText,
  Globe,
  Grid2x2,
  // Aliased: the lucide export shadows the global `Image` constructor.
  Image as ImageIcon,
  MessageSquare,
  Search,
  Sparkles,
  SlidersHorizontal,
  TrendingUp,
} from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useTranslation, type TranslationKey } from '../lib/i18n'
import { useAuthStore } from '../store/auth'

/**
 * §V2-11, frames `18:53`/`18:56`/`18:59` — one of the eight "Actions
 * completed" tiles, as the SERVER computes it.
 *
 * The grouping is not done here. Twenty-four raw feature strings roll up into
 * these eight in `ai-categories.ts`, so a second reader of the same numbers
 * gets the same buckets by construction instead of by everybody agreeing to be
 * careful — which is how the same list ends up written out in three places and
 * two of them drift.
 */
type CategoryRow = {
  category: string
  /** Runs, not "actions". See the unit note at the top of this file. */
  runs: number
  costUsd: number
  /** False when no feature in this product can contribute to this bucket. */
  supported: boolean
  reasonKey?: string
  features: string[]
}

type ValueResponse = {
  runs: number
  costUsd: number
  benchmark: { minutesSavedPerRun: number; hourlyRateCents: number }
  minutesSaved: number
  laborValueUsd: number
  netValueUsd: number
  byFeature: Record<string, { calls: number; costUsd: number }>
  byCategory: CategoryRow[]
  uncategorisedFeatures: string[]
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
  /** §V2-11, frame `19:05` — real as of migration 0150. */
  status: 'succeeded' | 'failed'
  errorCode: string | null
  errorMessage: string | null
}

/** The frame's Status dropdown. `''` is "All", which sends no parameter. */
type StatusFilter = '' | 'succeeded' | 'failed'

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

/**
 * §V2-11 — a glyph and a label per category, in the frame's order.
 *
 * ORDER IS FIXED HERE, not derived from the response, and the server returns
 * all eight every time. A grid that grows and shrinks with the data cannot be
 * measured, and a tile that disappears when its count is zero reads as the
 * feature having been removed.
 */
const CATEGORY_META: ReadonlyArray<{
  id: string
  icon: typeof Clock
  labelKey: TranslationKey
}> = [
  { id: 'tasks',            icon: CheckSquare,    labelKey: 'aiValue.catTasks' },
  { id: 'docs',             icon: FileText,       labelKey: 'aiValue.catDocs' },
  { id: 'images',           icon: ImageIcon,      labelKey: 'aiValue.catImages' },
  { id: 'comments',         icon: MessageSquare,  labelKey: 'aiValue.catComments' },
  { id: 'summaries',        icon: TrendingUp,     labelKey: 'aiValue.catSummaries' },
  { id: 'assets',           icon: Search,         labelKey: 'aiValue.catAssets' },
  { id: 'externalActions',  icon: Grid2x2,        labelKey: 'aiValue.catExternalActions' },
  { id: 'externalSearches', icon: Globe,          labelKey: 'aiValue.catExternalSearches' },
]

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
  /*
   * §V2-11, frame `19:05` — the filter row the frame draws is
   * `Date run ▾ · Status ▾ · My agents · Agent ▾`.
   *
   * `status` could not exist before migration 0150: `recordUsage` fired only on
   * the success path, so every row was a success and this dropdown would have
   * had one reachable value.
   *
   * `mineOnly` is the live defect this row found. `GET /ai/activity` has
   * ACCEPTED `userId` since it was written and the client never sent it, so a
   * "mine" toggle would have re-rendered and asked the server for exactly the
   * same rows. It is sent now, and `ai-activity-filters.mjs` captures the
   * request to prove it left the browser rather than trusting the render.
   *
   * "My runs", not "My agents": Rundesk has no agents, and borrowing the word
   * would promise one.
   */
  const [status, setStatus] = useState<StatusFilter>('')
  const [mineOnly, setMineOnly] = useState(false)
  const myUserId = useAuthStore((s) => s.user?.id ?? null)

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

  /*
   * §V2-11 — the query string, built from every filter rather than from one.
   *
   * THE PARAMETER THAT WAS NEVER SENT. `userId` has been a supported query
   * parameter of `GET /ai/activity` since the endpoint was written, and no web
   * code has ever put it in the URL. A "mine only" toggle on top of that
   * re-renders and asks the server for exactly the same rows — the render is
   * right and the reason is wrong, which is the commonest shape of a fake fix.
   *
   * The query KEY carries the same values, or React Query serves the previous
   * answer from cache and the new filter appears to do nothing.
   */
  const activityParams = useMemo(() => {
    const q = new URLSearchParams({ workspaceId, from })
    if (feature) q.set('feature', feature)
    if (status) q.set('status', status)
    if (mineOnly && myUserId) q.set('userId', myUserId)
    return q.toString()
  }, [workspaceId, from, feature, status, mineOnly, myUserId])

  const activityQuery = useQuery({
    enabled: tab === 'activity',
    queryKey: ['ai-activity', activityParams],
    queryFn: () => api<RunRow[]>(`/ai/activity?${activityParams}`),
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

          {/*
            §V2-11, frames `18:53` / `18:56` / `18:59` — the grid the frame
            heads "Actions completed": eight tiles in two rows of four.

            THE HEADING IS NOT "ACTIONS", AND THAT IS DELIBERATE. The note at
            the top of this file and of `ai-value.ts` both refuse the word,
            with a reason that is still true: one row in `ai_usage` is ONE CALL
            TO THE MODEL, a single thing a person did can be several calls, so
            counting runs and calling them actions inflates every figure on the
            page in a way nobody can see from the screen. What the frame is
            really asking for is the GROUPING — twenty-four internal feature
            strings shown as eight readable buckets — and the grouping is what
            is built. The unit stays a run and every tile says so.

            THREE TILES CANNOT BE FILLED AND SAY SO. Nothing in this product
            generates an image, and nothing in `COMMAND_TOOLS` reaches a
            connected app. A tile that can only ever render 0 is
            indistinguishable on screen from a workspace that genuinely did
            none — this audit's "confident zero" — so those three print the
            reason instead of a number. A count of zero is a fact about your
            workspace; "not available" is a fact about the product.
          */}
          <Card className="overflow-hidden">
            <div className="border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold">{t('aiValue.byCategory')}</h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{t('aiValue.byCategoryUnit')}</p>
            </div>
            {/*
              TWO ACROSS, THEN FOUR — and never an odd number, at any width.
              Eight tiles divide evenly by both column counts, so no breakpoint
              can leave a lone tile stranded on a row of its own.

              The four-across breakpoint is `xl` (1280px) rather than `lg`
              (1024px) because these are VIEWPORT breakpoints and the panel's
              width is a container question: the AI page carries a left nav, so
              at a 1024px viewport the panel is a few hundred pixels narrower
              than the breakpoint suggests, and "Summaries or updates
              generated" in a quarter of that wraps to three lines. The frame's
              2×4 arrangement is what a wide window shows; `ai-action-
              categories.mjs` states 1280 as the width it measures at.
            */}
            <div
              className="grid grid-cols-2 gap-px bg-border xl:grid-cols-4"
              data-testid="ai-value-categories"
            >
              {CATEGORY_META.map((meta) => {
                const row = (data?.byCategory ?? []).find((c) => c.category === meta.id)
                const supported = row?.supported ?? false
                const Icon = meta.icon
                return (
                  <div
                    key={meta.id}
                    className="bg-card p-3"
                    data-testid={`ai-value-category-${meta.id}`}
                    data-category={meta.id}
                    data-supported={supported ? 'true' : 'false'}
                    data-runs={supported ? String(row?.runs ?? 0) : ''}
                  >
                    <Icon className={cn('h-4 w-4', supported ? 'text-primary' : 'text-muted-foreground')} />
                    {supported ? (
                      <div className="mt-1.5 text-xl font-semibold tabular-nums">{row?.runs ?? 0}</div>
                    ) : (
                      <div
                        className="mt-1.5 text-xs font-medium text-muted-foreground"
                        data-testid={`ai-value-category-unavailable-${meta.id}`}
                      >
                        {t('aiValue.categoryUnavailable')}
                      </div>
                    )}
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{t(meta.labelKey)}</div>
                    {!supported && row?.reasonKey && (
                      <div
                        className="mt-1 text-[11px] text-muted-foreground/80"
                        data-testid={`ai-value-category-reason-${meta.id}`}
                      >
                        {t(row.reasonKey as TranslationKey)}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {/*
              Runs that happened and appear in no tile. Normally absent; shown
              when it is not, because a feature added without a category is a
              silent under-count and the totals still add up.
            */}
            {(data?.uncategorisedFeatures?.length ?? 0) > 0 && (
              <p
                className="border-t border-border px-4 py-2 text-[11px] text-amber-600 dark:text-amber-500"
                data-testid="ai-value-uncategorised"
              >
                {t('aiValue.uncategorised', { features: (data?.uncategorisedFeatures ?? []).join(', ') })}
              </p>
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
          {/*
            §V2-11, frame `19:05` — the filter row, which the frame draws as
            `Date run ▾ · Status ▾ · My agents · Agent ▾`.

            The range buttons above are Date run. Status and "mine" are below.
            "Agent" is still absent and still deliberate: Rundesk has no agents,
            so a dropdown over them could only ever return everything.
          */}
          <div
            className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3"
            data-testid="ai-activity-filters"
          >
            <h3 className="text-sm font-semibold">{t('aiValue.tabActivity')}</h3>
            <select
              className="ml-auto h-7 rounded border border-border bg-background px-2 text-xs"
              data-testid="ai-activity-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
            >
              <option value="">{t('aiValue.allStatuses')}</option>
              <option value="succeeded">{t('aiValue.statusSucceeded')}</option>
              <option value="failed">{t('aiValue.statusFailed')}</option>
            </select>
            {/*
              A toggle that actually changes the request. `aria-pressed` and
              `data-on` both carry the state, so a check can assert the state
              rather than "a button is present" — and the suite separately
              captures the outgoing URL, because a correct render for the wrong
              reason is the commonest fake fix.
            */}
            <button
              type="button"
              data-testid="ai-activity-mine"
              data-on={mineOnly ? 'true' : 'false'}
              aria-pressed={mineOnly}
              disabled={!myUserId}
              onClick={() => setMineOnly((v) => !v)}
              className={cn(
                'h-7 rounded border px-2 text-xs disabled:opacity-50',
                mineOnly
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground',
              )}
            >
              {t('aiValue.myRuns')}
            </button>
            <select
              className="h-7 rounded border border-border bg-background px-2 text-xs"
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
              {/*
                Offered whenever ANY filter is on, and it clears all of them.
                A "Clear filters" that clears one of three leaves you on an
                empty list having just been told the filters were the reason.
              */}
              {(feature || status || mineOnly) && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  data-testid="ai-activity-clear-filters"
                  onClick={() => {
                    setFeature('')
                    setStatus('')
                    setMineOnly(false)
                  }}
                >
                  {t('aiValue.clearFilters')}
                </Button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {runs.map((run) => (
                <li
                  key={run.id}
                  className="flex items-center gap-3 px-4 py-2 text-sm"
                  data-testid="ai-activity-row"
                  data-run-id={run.id}
                  data-status={run.status}
                >
                  {/*
                    The badge the Status filter filters on. `title` carries the
                    failure's own sentence: "failed" alone tells somebody a
                    thing went wrong and nothing they can act on.
                  */}
                  <span
                    data-testid="ai-activity-row-status"
                    data-status={run.status}
                    title={run.errorMessage ?? ''}
                    className={cn(
                      'inline-flex w-24 shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px]',
                      run.status === 'failed'
                        ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                        : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                    )}
                  >
                    {run.status === 'failed' ? (
                      <AlertTriangle className="h-3 w-3" />
                    ) : (
                      <CheckCircle2 className="h-3 w-3" />
                    )}
                    {t(run.status === 'failed' ? 'aiValue.statusFailed' : 'aiValue.statusSucceeded')}
                  </span>
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

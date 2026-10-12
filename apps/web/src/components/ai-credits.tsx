import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Button, Card, cn } from '@rundesk/ui'
import { api, ApiError } from '../lib/api'
import { useTranslation, type TranslationKey } from '../lib/i18n'
import { usePermissions } from '../hooks/use-permissions'

/**
 * AI CREDITS, AS CLICKUP SHOWS THEM (`commit-log/log-3943965-1`, `ledger-rows/row-869`).
 *
 * ClickUp's AI hub shows every member the workspace's credits — used, left and
 * the share used — warns at 80% and at 100%, and pauses AI past it until the
 * month renews or an admin adds credits: a suggested amount or a custom one,
 * then checkout. What is drawn here is the server's answer (`GET /ai/credits`);
 * the server is what pauses AI and what sells credits.
 */
export type AiCredits = {
  plan: { id: string; label: string }
  perMember: number | null
  members: number
  purchased: number
  allowance: number | null
  used: number
  left: number | null
  percent: number | null
  state: 'unlimited' | 'ok' | 'warning' | 'paused'
  monthStart: string
  renewsAt: string
  days: Array<{ day: string; credits: number; cumulative: number }>
  byCategory: Array<{ category: string; credits: number }>
}

export function useAiCredits(workspaceId?: string | null) {
  return useQuery({
    queryKey: ['ai-credits', workspaceId ?? null],
    queryFn: () => api<AiCredits>(`/ai/credits?workspaceId=${workspaceId}`),
    enabled: !!workspaceId,
    staleTime: 15_000,
  })
}

const fmt = (n: number) => n.toLocaleString('en-US')
const renewDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', timeZone: 'UTC' })

/**
 * The composer's meter, and the banner at 80% and at 100%. Nothing for a
 * workspace whose credits are unlimited: a meter that never moves is noise.
 */
export function AiCreditMeter({ workspaceId }: { workspaceId?: string | null }) {
  const { t } = useTranslation()
  const credits = useAiCredits(workspaceId)
  const c = credits.data
  if (!c || c.state === 'unlimited' || c.left == null) return null
  return (
    <div className="space-y-1">
      {c.state !== 'ok' && (
        <div
          data-testid="ai-credit-banner"
          data-state={c.state}
          className={cn(
            'rounded-md border px-2 py-1 text-[11px]',
            c.state === 'paused' ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
          )}
        >
          {c.state === 'paused'
            ? t('aiCredits.pausedBanner', { date: renewDay(c.renewsAt) })
            : t('aiCredits.warningBanner', { percent: c.percent ?? 0 })}
        </div>
      )}
      <p className="text-[10px] text-muted-foreground" data-testid="ai-credit-meter" data-left={c.left}>
        {t('aiCredits.meter', { left: fmt(c.left), allowance: fmt(c.allowance ?? 0) })}
      </p>
    </div>
  )
}

/** ClickUp's suggested amounts, in its $10 packs of 10,000. */
const SUGGESTED = [10_000, 50_000, 100_000]
const PACK = 10_000

/**
 * THE CREDITS CARD for Settings → AI usage: the month's allowance — the
 * members' share and what was bought — what is used and left, when it renews;
 * each day's running total against the limit line; what each category used;
 * and, for whoever holds `workspace.billing`, Add credits.
 */
export function AiCreditsCard({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const credits = useAiCredits(workspaceId)
  const mayBuy = usePermissions(workspaceId).can('workspace.billing') === true
  const [buying, setBuying] = useState(false)
  const c = credits.data
  if (!c) return null
  const unlimited = c.state === 'unlimited'
  return (
    <Card className="p-4 space-y-4" data-testid="ai-credits-card" data-state={c.state}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-sm mb-1">{t('aiCredits.title')}</h3>
          <p className="text-xs text-muted-foreground" data-testid="ai-credits-renews">
            {unlimited
              ? t('aiCredits.unlimited', { plan: c.plan.label })
              : t('aiCredits.renews', { date: renewDay(c.renewsAt), perMember: fmt(c.perMember ?? 0), members: c.members })}
          </p>
        </div>
        {mayBuy && !unlimited && (
          <Button size="sm" onClick={() => setBuying(true)} data-testid="ai-credits-add">
            {t('aiCredits.add')}
          </Button>
        )}
      </div>
      {!unlimited && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label={t('aiCredits.allowance')} value={fmt(c.allowance ?? 0)} testid="ai-credits-allowance" />
            <Stat label={t('aiCredits.used')} value={fmt(c.used)} testid="ai-credits-used" />
            <Stat label={t('aiCredits.left')} value={fmt(c.left ?? 0)} testid="ai-credits-left" />
            <Stat label={t('aiCredits.bought')} value={fmt(c.purchased)} testid="ai-credits-bought" />
          </div>
          <div>
            <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div
                className={cn('h-full rounded-full', c.state === 'paused' ? 'bg-destructive' : c.state === 'warning' ? 'bg-amber-500' : 'bg-accent')}
                style={{ width: `${c.percent ?? 0}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground" data-testid="ai-credits-percent">
              {t('aiCredits.percent', { percent: c.percent ?? 0 })}
            </p>
          </div>
          <CreditsChart days={c.days} allowance={c.allowance ?? 0} />
        </>
      )}
      {c.byCategory.length > 0 && (
        <table className="w-full text-sm" data-testid="ai-credits-categories">
          <tbody className="divide-y divide-border">
            {c.byCategory.map((row) => (
              <tr key={row.category} data-testid={`ai-credits-category-${row.category}`}>
                <td className="py-1.5">{t(`aiCredits.category.${row.category}` as TranslationKey)}</td>
                <td className="py-1.5 text-right tabular-nums">{fmt(row.credits)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {buying && <AddCreditsDialog workspaceId={workspaceId} onClose={() => setBuying(false)} />}
    </Card>
  )
}

function Stat({ label, value, testid }: { label: string; value: string; testid: string }) {
  return (
    <div className="rounded-lg border border-border/40 bg-card/30 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums mt-0.5" data-testid={testid}>{value}</div>
    </div>
  )
}

/**
 * THE MONTH'S TREND: the running total of credits used, day by day, against a
 * line at the allowance — what crosses it is when AI paused.
 */
function CreditsChart({ days, allowance }: { days: AiCredits['days']; allowance: number }) {
  const { t } = useTranslation()
  const W = 600
  const H = 120
  const top = Math.max(allowance, days[days.length - 1]?.cumulative ?? 0, 1)
  const x = (i: number) => (days.length <= 1 ? 0 : (i / (days.length - 1)) * W)
  const y = (v: number) => H - (v / top) * H
  const points = days.map((d, i) => `${x(i).toFixed(1)},${y(d.cumulative).toFixed(1)}`).join(' ')
  return (
    <figure className="space-y-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-full" data-testid="ai-credits-chart" role="img" aria-label={t('aiCredits.chart')}>
        <line
          x1={0}
          x2={W}
          y1={y(allowance)}
          y2={y(allowance)}
          className="stroke-destructive"
          strokeDasharray="6 4"
          strokeWidth={1.5}
          data-testid="ai-credits-limit-line"
          data-value={allowance}
        />
        <polyline points={points} fill="none" className="stroke-accent" strokeWidth={2} data-testid="ai-credits-trend" data-days={days.length} />
      </svg>
      <figcaption className="text-[10px] text-muted-foreground">{t('aiCredits.chart')}</figcaption>
    </figure>
  )
}

/** Add credits: a suggested amount or a custom number of packs, then checkout. */
function AddCreditsDialog({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const [amount, setAmount] = useState<number>(SUGGESTED[0]!)
  const [custom, setCustom] = useState('')
  const [error, setError] = useState<string | null>(null)
  const credits = custom.trim() ? Number(custom) * PACK : amount
  const checkout = useMutation({
    mutationFn: () =>
      api<{ url: string }>(`/workspaces/${workspaceId}/billing/ai-credits/checkout`, { method: 'POST', body: { credits } }),
    onMutate: () => setError(null),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (err) => setError(err instanceof ApiError ? err.message : t('aiCredits.checkoutFailed')),
  })
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md space-y-3 rounded-2xl border border-border/60 bg-card p-5"
        data-testid="ai-credits-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold">{t('aiCredits.add')}</h3>
        <p className="text-xs text-muted-foreground">{t('aiCredits.packs')}</p>
        <div className="grid grid-cols-3 gap-2">
          {SUGGESTED.map((n) => (
            <button
              key={n}
              type="button"
              data-testid={`ai-credits-amount-${n}`}
              onClick={() => {
                setAmount(n)
                setCustom('')
              }}
              className={cn(
                'rounded-md border px-2 py-2 text-sm',
                !custom && amount === n ? 'border-accent bg-accent/10' : 'border-border hover:bg-muted/40',
              )}
            >
              {fmt(n)}
              <span className="block text-[10px] text-muted-foreground">${(n / PACK) * 10}</span>
            </button>
          ))}
        </div>
        <label className="block text-xs text-muted-foreground">
          {t('aiCredits.customPacks')}
          <input
            data-testid="ai-credits-custom"
            inputMode="numeric"
            value={custom}
            onChange={(e) => setCustom(e.target.value.replace(/[^0-9]/g, ''))}
            className="mt-1 h-8 w-full rounded-md border border-border bg-card px-2 text-sm text-foreground"
          />
        </label>
        {error && (
          <p className="text-xs text-destructive" data-testid="ai-credits-error">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" data-testid="ai-credits-checkout" disabled={checkout.isPending || !(credits > 0)} onClick={() => checkout.mutate()}>
            {t('aiCredits.getCredits', { credits: fmt(credits || 0) })}
          </Button>
        </div>
      </div>
    </div>
  )
}

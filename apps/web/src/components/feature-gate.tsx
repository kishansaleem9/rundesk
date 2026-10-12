import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Button, cn } from '@rundesk/ui'
import { Lock, Loader2, Check, X } from 'lucide-react'
import type { FlagKey } from '@rundesk/feature-flags'
import { api } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import type { TranslationKey } from '../lib/i18n'
import { useResolvedFlags } from '../lib/use-feature-flags'
import { usePermissions } from '../hooks/use-permissions'
import { canAskAgain, gateMessageKey, type GateResult } from '../lib/feature-gate'

/**
 * §2.8 gap 11 / §V2-13 — the modal a locked feature opens.
 *
 * TWO KINDS OF LOCK, one dialog.
 *
 *   · A FLAG the workspace switched off — "back end se on karna parta hai"
 *     `[20:45]`. An admin can turn it on today; nobody has to buy anything.
 *   · A PLAN the workspace has not bought — `[09:26]` "TEAM VIEW … yeh cheez
 *     ke liye humein of course BUY karna parega" and `[10:42]` "agar aap ke
 *     paas woh hai PREMIUM ACCESS".
 *
 * Frame `09:26` is the specification for the second, and the thing it does
 * that makes it worth copying is that it TEACHES. It leads with the plain
 * sentence "That feature isn't available on your current plan", then offers,
 * side by side: the feature named and described, a preview of what it draws,
 * the tier that would unlock it with its free trial spelled out, what else
 * that tier includes — and one button, "Contact your admin", because the
 * person reading it is usually not the person who can buy.
 *
 * WHAT THIS DIALOG CANNOT DO IS ENFORCE ANYTHING. A gate drawn in a browser is
 * a `display:none` with a price on it. The server refuses the gated call for a
 * workspace whose plan lacks the feature (`tasks.controller.ts`
 * `assertPlanFeature`); this is the courtesy that explains the refusal before
 * it happens.
 */

/** The plan features the web can gate on. Mirrors the API's `PLAN_FEATURES`. */
export type PlanFeatureKey =
  | 'ai'
  | 'automations'
  | 'sso'
  | 'customRoles'
  | 'webhooks'
  | 'guests'
  | 'integrations'
  | 'customBranding'
  | 'prioritySupport'
  | 'teamView'
  | 'boardExport'
  | 'ganttExport'

type PlanTierRow = {
  id: string
  label: string
  description: string
  trialDays: number
  features: Record<string, boolean>
}

export type PlanUsage = {
  plan: string
  label: string
  features: Record<string, boolean>
  catalog?: PlanTierRow[]
  /** A plan's free uses of a feature it lacks, and how many are left (`ledger-rows/row-788`). */
  freeUses?: Array<{ feature: string; label: string; allowance: number; used: number; left: number }>
}

/** The free uses this plan has of `feature`, when it has any. */
export function freeUsesOf(plan: PlanUsage | null | undefined, feature?: string) {
  if (!plan || !feature) return null
  return plan.freeUses?.find((u) => u.feature === feature) ?? null
}

export interface GatedFeature {
  /** The workspace switch this feature hangs off, when it has one. */
  flag?: FlagKey
  /**
   * The PLAN capability this feature needs, when it is sold rather than
   * switched. Either key may gate; a feature may carry both.
   */
  planFeature?: PlanFeatureKey
  /** The feature's name as a person would say it. */
  name: string
  /** One line on what it does — the reason to want it. */
  blurb: string
  /*
   * §V2-13, frame `09:26` — the locked feature is PREVIEWED, not just named.
   * Concrete capabilities rather than a picture: a mocked-up screenshot would
   * be a depiction of something that may not match what ships, and this dialog
   * is the one place a person decides whether to go and ask for it.
   */
  highlights?: string[]
}

/**
 * A workspace's commercial plan. Cached under the SAME key the Plan card in
 * Settings uses, so the two never disagree and the gate costs no extra fetch
 * for anyone who has already looked at their plan.
 */
export function useWorkspacePlan(workspaceId?: string | null) {
  const query = useQuery({
    queryKey: ['workspace-plan', workspaceId ?? null],
    queryFn: () => api<PlanUsage>(`/workspaces/${workspaceId}/plan`),
    enabled: !!workspaceId,
    staleTime: 60_000,
  })
  const features = query.data?.features
  /**
   * "On unless the plan explicitly says otherwise", matching `featureEnabled`
   * for flags. While the plan is still loading — or the request failed, or
   * this build asks about a capability an older server has never heard of —
   * everything shows. The server is the gate; a client that guessed "locked"
   * would paywall a paying customer over a slow network.
   */
  const planEnabled = (feature?: PlanFeatureKey): boolean => {
    if (!feature) return true
    if (!features) return true
    if (features[feature] !== false) return true
    // A feature with free uses left is usable: the server counts each use (`ledger-rows/row-788`).
    const free = freeUsesOf(query.data, feature)
    return !!free && free.left > 0
  }
  return { plan: query.data ?? null, planEnabled, isLoading: query.isLoading }
}

/**
 * Gate a feature behind its flag and/or its plan.
 *
 * `requireFeature` returns true when the feature is available and the caller
 * should just proceed; when it is locked it returns false and opens the modal.
 * Render `gateDialog` somewhere in the tree.
 */
export function useFeatureGate(workspaceId?: string | null) {
  const { flags, featureEnabled, isLoading } = useResolvedFlags(workspaceId)
  const { plan, planEnabled, isLoading: planLoading } = useWorkspacePlan(workspaceId)
  const [gated, setGated] = useState<GatedFeature | null>(null)

  const planFeatures = plan?.features

  const available = useCallback(
    (feature: GatedFeature): boolean => featureEnabled(feature.flag) && planEnabled(feature.planFeature),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flags, planFeatures, workspaceId],
  )

  const requireFeature = useCallback(
    (feature: GatedFeature): boolean => {
      if (available(feature)) return true
      setGated(feature)
      return false
    },
    /*
     * `flags` and `planFeatures`, not `isLoading`.
     *
     * featureEnabled is rebuilt every render out of `flags`, so a callback
     * memoised on isLoading closes over whichever one existed when loading
     * last flipped — and isLoading flips exactly once. Every refetch after
     * that changed the flags and not this, so the gate kept a snapshot from
     * the first load for the entire life of the mount. An earlier version of
     * this comment called that "stable", which it is, in the way a stopped
     * clock is.
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flags, planFeatures, workspaceId],
  )

  const gateDialog: ReactNode = gated ? (
    <FeatureGateDialog feature={gated} workspaceId={workspaceId} onClose={() => setGated(null)} />
  ) : null

  return {
    featureEnabled,
    planEnabled,
    /** True when this feature is usable right now — for rendering, not for deciding. */
    available,
    requireFeature,
    gateDialog,
    plan,
    isLoading: isLoading || planLoading,
  }
}

/**
 * The lowest tier in the catalog that includes `feature`.
 *
 * Read out of the catalog the SERVER sent rather than written down here: the
 * tiers, their trial lengths and what each one includes all live in
 * `plans.constants.ts`, and a second copy in the browser would be the
 * duplicated-list defect with money attached to it.
 */
function upgradeTarget(plan: PlanUsage | null, feature?: PlanFeatureKey): PlanTierRow | null {
  if (!feature || !plan?.catalog?.length) return null
  return plan.catalog.find((tier) => tier.features?.[feature] === true) ?? null
}

export function FeatureGateDialog({
  feature,
  workspaceId,
  onClose,
}: {
  feature: GatedFeature
  workspaceId?: string | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { plan } = useWorkspacePlan(workspaceId)
  const [asking, setAsking] = useState(false)
  const [result, setResult] = useState<GateResult | null>(null)
  /*
   * WHOEVER MAY SWITCH IT ON IS TAKEN TO THE SWITCH, not told to ask somebody
   * (`found-25-sep/admin-guard-admits-managers-where-the-web-says-admin`). The
   * ask reaches the holders of `workspace.clickapps.manage` and leads them to
   * this workspace's Settings → Features; a holder meeting the lock goes there.
   */
  const maySwitch = usePermissions(workspaceId ?? undefined).can('workspace.clickapps.manage') === true

  /*
   * A PLAN gate only when the plan is what is actually missing. A feature that
   * carries both keys and is locked by the FLAG must not show a price: "buy
   * Business" is the wrong instruction for something an admin can switch on
   * this afternoon, and following it costs real money.
   */
  const planBlocked = !!feature.planFeature && plan?.features?.[feature.planFeature] === false
  /* ClickUp's free uses, spent (`ledger-rows/row-788`): said as uses used up, nothing lost. */
  const spent = planBlocked ? freeUsesOf(plan, feature.planFeature) : null
  const usesSpent = !!spent && spent.left === 0
  const target = planBlocked ? upgradeTarget(plan, feature.planFeature) : null
  const switchHere = !planBlocked && !!feature.flag && !!workspaceId && maySwitch
  const openFeatures = () => {
    if (!workspaceId) return
    onClose()
    navigate({ to: '/app/$workspaceId/settings', params: { workspaceId }, search: { tab: 'features' } })
  }

  /*
   * What the offered tier adds ON TOP of what this workspace already has — the
   * checklist in frame `09:26` minus the lines that would be news to nobody.
   * Derived from the two feature maps, so a tier that gains a capability next
   * month gains a line here with nothing to remember.
   */
  const includes = useMemo(() => {
    if (!target || !plan) return [] as string[]
    return Object.keys(target.features)
      .filter((key) => target.features[key] === true && plan.features?.[key] !== true)
      .slice(0, 8)
      .map((key) => t(`plan.feature.${key}` as TranslationKey))
  }, [target, plan, t])

  const contactAdmin = async () => {
    setAsking(true)
    try {
      /*
       * Two asks, because they reach different people about different things:
       * a plan feature is a purchase and a flag is a switch. Both answer in the
       * same `{status, notified}` shape, so everything below this line is
       * identical for either.
       */
      const res = planBlocked
        ? await api<GateResult>(`/workspaces/${workspaceId}/plan/request`, {
            method: 'POST',
            body: { feature: feature.planFeature },
          })
        : await api<GateResult>(`/feature-flags/request/${feature.flag}`, {
            method: 'POST',
            body: { workspaceId },
          })
      setResult({ status: res?.status ?? 'failed', notified: res?.notified ?? 0 })
      /*
       * "It has just been turned on — close this and try again" was not true.
       *
       * The server saw the feature as enabled, which means this browser is
       * holding a stale snapshot from before the admin switched it on. Nothing
       * refreshed that snapshot, so trying again re-opened the identical modal
       * — forever, until something else happened to refetch. Telling somebody
       * to retry an action that cannot succeed is worse than saying nothing.
       */
      if (res?.status === 'already_enabled') {
        await qc.invalidateQueries({ queryKey: ['feature-flags', 'resolved'] })
        await qc.invalidateQueries({ queryKey: ['workspace-plan'] })
      }
    } catch {
      // A failed ask must not read as a sent one — the person would stop
      // waiting for an answer that is never coming.
      setResult({ status: 'failed', notified: 0 })
    } finally {
      setAsking(false)
    }
  }

  const title = target
    ? target.trialDays > 0
      ? t('gate.tryPlan', { plan: target.label, feature: feature.name })
      : t('gate.unlockWith', { plan: target.label, feature: feature.name })
    : t('gate.unlock', { feature: feature.name })

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-black/60 p-4"
      data-testid="feature-gate"
      data-gate-kind={planBlocked ? 'plan' : 'flag'}
      data-uses-spent={usesSpent ? 'yes' : 'no'}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl rounded-2xl border border-border/60 bg-card p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          data-testid="feature-gate-dismiss"
          aria-label={t('common.close')}
          className="absolute right-3 top-3 rounded p-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        {/* The plain sentence the frame leads with, before any price. */}
        <p className="pr-8 text-[12px] text-muted-foreground" data-testid="feature-gate-eyebrow">
          {planBlocked ? t('gate.notOnYourPlan') : t('gate.switchedOff')}
        </p>
        {/* And when its free uses are spent, frame `09:30`'s sentence: they are, and nothing is lost. */}
        {usesSpent && (
          <p className="pr-8 text-[12px] font-medium text-foreground" data-testid="feature-gate-uses">
            {t('gate.usesSpent', { count: spent!.allowance, feature: feature.name })}
          </p>
        )}
        <h3 className="flex items-center gap-2 pr-8 text-base font-semibold" data-testid="feature-gate-title">
          <Lock className="h-4 w-4 shrink-0 text-violet-500" />
          {title}
        </h3>

        <div className={cn('grid gap-4', target ? 'md:grid-cols-2' : 'grid-cols-1')}>
          {/* LEFT — the feature, taught. */}
          <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3" data-testid="feature-gate-teach">
            <div className="text-sm font-medium" data-testid="feature-gate-name">{feature.name}</div>
            <p className="text-[13px] text-muted-foreground">{feature.blurb}</p>
            {feature.highlights && feature.highlights.length > 0 && (
              <ul className="space-y-1 pt-1" data-testid="feature-gate-preview">
                {feature.highlights.map((line) => (
                  <li key={line} className="flex items-start gap-2 text-[13px]">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* RIGHT — the offer, but only when there is one to make. */}
          {target && (
            <div className="space-y-2 rounded-lg border border-violet-500/30 bg-violet-500/5 p-3" data-testid="feature-gate-offer">
              <div className="text-sm font-semibold" data-testid="feature-gate-plan" data-plan={target.id}>
                {target.label}
              </div>
              {target.trialDays > 0 && (
                <p className="text-[12px] text-muted-foreground" data-testid="feature-gate-trial">
                  {t('gate.trialDays', { days: target.trialDays })}
                </p>
              )}
              {includes.length > 0 && (
                <ul className="space-y-1 pt-0.5" data-testid="feature-gate-includes">
                  {includes.map((line) => (
                    <li key={line} className="flex items-start gap-2 text-[13px]">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <p className="text-sm">
          {planBlocked
            ? t('gate.contactBodyPlan', { feature: feature.name })
            : switchHere
              ? t('gate.switchBody', { feature: feature.name })
              : t('gate.contactBody', { feature: feature.name })}
        </p>

        {result && (
          <p
            className={cn(
              'rounded-md border px-3 py-2 text-[13px]',
              result.status === 'failed' || (result.status === 'sent' && result.notified === 0)
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
            )}
            data-testid="feature-gate-result"
          >
            {t(gateMessageKey(result))}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} data-testid="feature-gate-close">
            {t('common.close')}
          </Button>
          {switchHere ? (
            <Button onClick={openFeatures} data-testid="feature-gate-open-features">
              {t('gate.openFeatures')}
            </Button>
          ) : (
            <Button
              onClick={contactAdmin}
              disabled={asking || !canAskAgain(result)}
              data-testid="feature-gate-contact"
            >
              {asking && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {t('gate.contact')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

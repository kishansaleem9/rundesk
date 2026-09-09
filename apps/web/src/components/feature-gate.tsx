import { useCallback, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, cn } from '@rundesk/ui'
import { Lock, Loader2, Check } from 'lucide-react'
import type { FlagKey } from '@rundesk/feature-flags'
import { api } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import { useResolvedFlags } from '../lib/use-feature-flags'
import { canAskAgain, gateMessageKey, type GateResult } from '../lib/feature-gate'

/**
 * §2.8 gap 11 — the modal a switched-off feature opens.
 *
 *   "Unlock AI Notetaker: Automatic meeting notes connected to docs and tasks.
 *    Contact your admin to purchase AI Meeting Notetaker for your Workspace."
 *
 * Written once and reusable, because the admin screen already carries fifty
 * flags and every one of them currently fails the same silent way: the feature
 * is absent and nothing says why.
 */

export interface GatedFeature {
  flag: FlagKey
  /** The feature's name as a person would say it. */
  name: string
  /** One line on what it does — the reason to want it turned on. */
  blurb: string
  /*
   * §V2-13, frames `09:25`/`11:00` — the locked feature is PREVIEWED, not just
   * named. Concrete capabilities rather than a picture: a mocked-up screenshot
   * would be a depiction of something that may not match what ships, and this
   * dialog is the one place a person decides whether to go and ask for it.
   */
  highlights?: string[]
}

/**
 * Gate a feature behind its flag.
 *
 * `requireFeature` returns true when the feature is on and the caller should
 * just proceed; when it is off it returns false and opens the modal. Render
 * `gateDialog` somewhere in the tree.
 */
export function useFeatureGate(workspaceId?: string | null) {
  const { flags, featureEnabled, isLoading } = useResolvedFlags(workspaceId)
  const [gated, setGated] = useState<GatedFeature | null>(null)

  const requireFeature = useCallback(
    (feature: GatedFeature): boolean => {
      if (featureEnabled(feature.flag)) return true
      setGated(feature)
      return false
    },
    /*
     * `flags`, not `isLoading`.
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
    [flags, workspaceId],
  )

  const gateDialog: ReactNode = gated ? (
    <FeatureGateDialog feature={gated} workspaceId={workspaceId} onClose={() => setGated(null)} />
  ) : null

  return { featureEnabled, requireFeature, gateDialog, isLoading }
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
  const [asking, setAsking] = useState(false)
  const [result, setResult] = useState<GateResult | null>(null)

  const contactAdmin = async () => {
    setAsking(true)
    try {
      const res = await api<GateResult>(`/feature-flags/request/${feature.flag}`, {
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
      }
    } catch {
      // A failed ask must not read as a sent one — the person would stop
      // waiting for an answer that is never coming.
      setResult({ status: 'failed', notified: 0 })
    } finally {
      setAsking(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-black/60 p-4"
      data-testid="feature-gate"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border/60 bg-card p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Lock className="h-4 w-4 text-violet-500" />
          {t('gate.unlock', { feature: feature.name })}
        </h3>
        <p className="text-sm text-muted-foreground">{feature.blurb}</p>

        {feature.highlights && feature.highlights.length > 0 && (
          <ul className="space-y-1 rounded-lg border border-border/60 bg-muted/30 p-3" data-testid="feature-gate-preview">
            {feature.highlights.map((line) => (
              <li key={line} className="flex items-start gap-2 text-[13px]">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        )}

        <p className="text-sm">{t('gate.contactBody', { feature: feature.name })}</p>

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
          <Button variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button
            onClick={contactAdmin}
            disabled={asking || !canAskAgain(result)}
            data-testid="feature-gate-contact"
          >
            {asking && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {t('gate.contact')}
          </Button>
        </div>
      </div>
    </div>
  )
}

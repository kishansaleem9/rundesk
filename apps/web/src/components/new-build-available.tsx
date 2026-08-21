import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { watchForNewBuild, reloadOntoCurrentBuild } from '../lib/build-version'
import { useTranslation } from '../lib/i18n'

/**
 * "There is a newer Rundesk — reload when you like."
 *
 * The failure this exists for is a quiet one: a tab open across a deploy runs
 * the old build indefinitely, with nothing broken and nothing to click. The
 * person cannot tell, so they never reload, so they keep using a product that
 * has already moved on. That is what happened on 21 Aug 2026, and the only way
 * out was clearing site data.
 *
 * Two decisions worth keeping:
 *
 *   It does not reload for you. A reload discards whatever is in an unsaved
 *   editor, and doing that mid-sentence to hand someone a feature they did not
 *   ask for is not a favour. Persuade, don't preempt.
 *
 *   It does not go away on its own. A toast that fades has told nobody
 *   anything if they were looking elsewhere for four seconds, and this is
 *   precisely the case where they were.
 */
export function NewBuildAvailable() {
  const { t } = useTranslation()
  const [available, setAvailable] = useState(false)
  const [reloading, setReloading] = useState(false)

  useEffect(() => watchForNewBuild(() => setAvailable(true)), [])

  if (!available) return null

  return (
    <div
      // Announced politely: worth hearing at the end of the current sentence,
      // not worth interrupting one for.
      role="status"
      aria-live="polite"
      data-testid="new-build-available"
      className="fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 flex items-center gap-3 rounded-full border border-border/70 bg-card/95 px-4 py-2 shadow-xl backdrop-blur-md"
    >
      <span className="text-[13px] text-foreground">{t('update.available')}</span>
      <button
        type="button"
        onClick={() => {
          setReloading(true)
          void reloadOntoCurrentBuild()
        }}
        disabled={reloading}
        data-testid="new-build-reload"
        className="inline-flex h-7 items-center gap-1.5 rounded-full bg-brand-500 px-3 text-[12px] font-medium text-white hover:bg-brand-600 disabled:opacity-60"
      >
        <RefreshCw className={reloading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
        {t(reloading ? 'update.reloading' : 'update.reload')}
      </button>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Button } from '@rundesk/ui'
import { Cookie } from 'lucide-react'
import { useTranslation } from '../lib/i18n'

// Persisted consent decision (Plan §14.6). The choice — and when it was made —
// lives in localStorage so the banner is shown exactly once and the record can
// be audited/expired later if the policy changes.
const CONSENT_KEY = 'rundesk.cookieConsent'
const CONSENT_AT_KEY = 'rundesk.cookieConsentAt'

type Consent = 'accepted' | 'declined'

function readConsent(): Consent | null {
  try {
    const value = localStorage.getItem(CONSENT_KEY)
    return value === 'accepted' || value === 'declined' ? value : null
  } catch {
    // Storage can throw in private-mode / sandboxed contexts — treat as "not set".
    return null
  }
}

/**
 * Bottom-anchored cookie consent banner. Renders until the visitor Accepts or
 * Declines; the decision is persisted so it never reappears. Mounted once at the
 * app root so it covers every public and in-app route.
 */
export function CookieConsentBanner() {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Resolve after mount so a previously-set decision never flashes the banner.
    if (readConsent() === null) setVisible(true)
  }, [])

  if (!visible) return null

  const decide = (decision: Consent) => {
    try {
      localStorage.setItem(CONSENT_KEY, decision)
      localStorage.setItem(CONSENT_AT_KEY, new Date().toISOString())
    } catch {
      // Ignore storage failures — the banner still dismisses for this session.
    }
    setVisible(false)
  }

  return (
    // Anchored to the bottom-right as a compact card rather than a full-width
    // bottom bar: a centered bar overlapped bottom-anchored inputs (notably the
    // chat composer), intercepting clicks until dismissed. A corner toast never
    // covers centered content. The wrapper keeps `pointer-events-none` so only
    // the card itself is interactive.
    <div
      role="region"
      aria-label={t('cookie.title')}
      className="pointer-events-none fixed bottom-0 right-0 z-50 flex justify-end p-4"
    >
      <div className="card-glass animate-slide-up pointer-events-auto flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-4 rounded-xl border border-border bg-card/95 p-4 shadow-lg backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-gradient text-white">
            <Cookie className="h-5 w-5" aria-hidden />
          </span>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">{t('cookie.title')}</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t('cookie.message')}{' '}
              <a
                href="/privacy"
                className="font-medium text-accent underline underline-offset-2 transition-colors hover:text-accent/80"
              >
                {t('cookie.privacy')}
              </a>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => decide('declined')}
          >
            {t('cookie.decline')}
          </Button>
          <Button
            variant="gradient"
            size="sm"
            onClick={() => decide('accepted')}
          >
            {t('cookie.accept')}
          </Button>
        </div>
      </div>
    </div>
  )
}

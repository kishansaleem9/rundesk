import { Button } from '@rundesk/ui'
import { Clock } from 'lucide-react'
import { useTranslation } from '../lib/i18n'

/**
 * What a public page says when the API refused it for too many requests
 * (`found-30-sep/public-pages-read-429-as-gone`): not that its link is gone,
 * but that it was asked for too often, when it will try again, and a way to
 * try now.
 */
export function PublicBusy({ seconds, onRetry, testId }: { seconds: number; onRetry: () => void; testId: string }) {
  const { t } = useTranslation()
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full rounded-xl border border-border bg-card p-6 text-center space-y-3" data-testid={testId}>
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <Clock className="h-5 w-5" />
        </div>
        <h1 className="text-lg font-display font-semibold">{t('publicPage.busyTitle')}</h1>
        <p className="text-sm text-muted-foreground" data-testid={`${testId}-wait`}>
          {t('publicPage.busyBody', { seconds: String(Math.max(0, seconds)) })}
        </p>
        <Button variant="outline" onClick={onRetry} data-testid={`${testId}-retry`}>
          {t('publicPage.retryNow')}
        </Button>
      </div>
    </div>
  )
}

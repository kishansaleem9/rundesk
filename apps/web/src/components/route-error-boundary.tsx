import { Link, useRouter } from '@tanstack/react-router'
import { Button, Card } from '@rundesk/ui'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from '../lib/i18n'
import { canReloadForStaleChunks, isChunkLoadError, reloadForStaleChunks } from '../lib/chunk-reload'

interface RouteErrorBoundaryProps {
  error: unknown
  /**
   * Provided by TanStack Router's `errorComponent`; calling it tells
   * the router to retry the offending match. We accept `undefined`
   * defensively in case the boundary is ever rendered outside that
   * context (e.g. wrapped manually around an Outlet).
   */
  reset?: () => void
}

/**
 * Top-level error boundary surfaced by TanStack Router's `errorComponent`
 * on the root route. Any uncaught render error inside the app tree —
 * including downstream route components — bubbles up to here instead of
 * blanking the page. We log the error so it shows up in browser tooling
 * (and any wired Sentry/console transport) and offer the user the two
 * recovery actions that matter: retry the current route, or escape to a
 * known-good destination.
 *
 * The boundary deliberately avoids inspecting the error to display
 * stack traces — production users don't need them, and dev tooling
 * already surfaces them. We do show the error's `message` when present
 * because that's usually a useful one-line clue.
 */
export function RouteErrorBoundary({ error, reset }: RouteErrorBoundaryProps) {
  const { t } = useTranslation()
  const router = useRouter()

  // A chunk that 404s means this tab is running a build the server no longer
  // has — it can't be fixed in place, only reloaded (see lib/chunk-reload).
  // Decided once, on mount, so the stamp written by the effect can't flip it.
  const [recovering] = useState(() => isChunkLoadError(error) && canReloadForStaleChunks())

  useEffect(() => {
    if (typeof console !== 'undefined') {
      console.error('[route-error-boundary]', error)
    }
  }, [error])

  useEffect(() => {
    if (recovering) reloadForStaleChunks()
  }, [recovering])

  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : t('routeError.fallbackMessage')

  const handleRetry = () => {
    if (reset) {
      reset()
      return
    }
    router.invalidate()
  }

  // Reloading to the current build isn't an error the user needs to read — it's
  // an update. Say so, and don't offer buttons that fight the reload.
  if (recovering) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-6 bg-background"
        data-testid="route-updating"
      >
        <Card className="max-w-lg w-full p-8 text-center bg-card/80 backdrop-blur">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-muted text-muted-foreground flex items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin" />
          </div>
          <h1 className="font-display text-2xl font-semibold text-foreground mb-2">
            {t('routeError.updatingTitle')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('routeError.updatingBody')}</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="max-w-lg w-full p-8 text-center border-red-200/60 bg-card/80 backdrop-blur">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-red-100 text-red-700 flex items-center justify-center">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="font-display text-2xl font-semibold text-foreground mb-2">
          {t('routeError.title')}
        </h1>
        <p className="text-sm text-muted-foreground mb-6 break-words">
          {message}
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <Button onClick={handleRetry} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            {t('common.retry')}
          </Button>
          <Button variant="outline" asChild className="gap-2">
            <Link to="/">
              <Home className="h-4 w-4" />
              {t('routeError.goHome')}
            </Link>
          </Button>
        </div>
      </Card>
    </div>
  )
}

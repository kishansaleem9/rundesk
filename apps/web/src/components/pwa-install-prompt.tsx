import { useEffect, useState } from 'react'
import { Download, X, WifiOff } from 'lucide-react'
import { Button } from '@rundesk/ui'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_STORAGE_KEY = 'rundesk.pwa.installDismissedAt'
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

/**
 * Renders an install prompt + an offline banner. Both are unobtrusive
 * floaters that disappear when not relevant. The install prompt obeys
 * a 7-day dismiss snooze.
 */
export function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)

  useEffect(() => {
    function handleBeforeInstall(e: Event) {
      e.preventDefault()
      const dismissedAt = Number(localStorage.getItem(DISMISS_STORAGE_KEY) ?? '0')
      if (Date.now() - dismissedAt < DISMISS_DURATION_MS) return
      setInstallEvent(e as BeforeInstallPromptEvent)
    }
    function handleOnline() {
      setIsOnline(true)
    }
    function handleOffline() {
      setIsOnline(false)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  async function install() {
    if (!installEvent) return
    await installEvent.prompt()
    const { outcome } = await installEvent.userChoice
    if (outcome === 'dismissed') {
      localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now()))
    }
    setInstallEvent(null)
  }

  function dismiss() {
    localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now()))
    setInstallEvent(null)
  }

  return (
    <>
      {!isOnline && (
        <div className="fixed top-0 inset-x-0 z-50 bg-amber-500 text-amber-950 text-xs font-medium px-3 py-1.5 flex items-center justify-center gap-2 shadow">
          <WifiOff className="h-3.5 w-3.5" />
          You're offline — recently viewed data still works.
        </div>
      )}

      {installEvent && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border bg-card shadow-lg p-4 flex items-start gap-3 animate-in fade-in slide-in-from-bottom-4">
          <div className="rounded-md bg-primary/10 p-2 shrink-0">
            <Download className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 space-y-2">
            <div>
              <div className="text-sm font-semibold">Install Rundesk</div>
              <div className="text-xs text-muted-foreground">
                Get a faster, offline-capable workspace on your home screen.
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={install}>
                Install
              </Button>
              <Button size="sm" variant="ghost" onClick={dismiss}>
                Not now
              </Button>
            </div>
          </div>
          <button
            onClick={dismiss}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  )
}

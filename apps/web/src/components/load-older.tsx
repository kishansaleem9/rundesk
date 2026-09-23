import { useEffect, useRef } from 'react'
import { useTranslation } from '../lib/i18n'
import { ListSkeleton } from './loading-skeletons'

/** The part of an infinite query this needs — `useNotificationPages` returns it. */
type PagedQuery = {
  fetchNextPage: () => Promise<unknown>
  isFetchingNextPage: boolean
  isFetchNextPageError: boolean
}

/**
 * "Load older", which also loads itself as it scrolls into view — ClickUp's
 * Inbox scrolls on rather than paging. It stays a real button: the next page
 * is then one keypress away, and a page that failed can be asked for again.
 *
 * While a page is on its way the button gives way to row shapes, the way every
 * other list here waits — never to the word "Loading", which `loading-states`
 * refuses on any surface.
 *
 * A failed page is NOT retried on sight. It would be retried the moment it
 * failed, for as long as the button stayed on screen; it says so instead and
 * waits for a click.
 */
export function LoadOlder({
  query,
  testId,
  label,
  failedLabel,
  auto = true,
  onBeforeLoad,
}: {
  query: PagedQuery
  testId: string
  /** What the button says; the Inbox's words when not given. */
  label?: string
  failedLabel?: string
  /**
   * Load on sight. Off where the button is on screen from the start — a
   * thread opens at its top — so opening it does not page back by itself.
   */
  auto?: boolean
  /** Called just before a page is asked for — chat records its scroll here. */
  onBeforeLoad?: () => void
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLButtonElement>(null)
  const loading = query.isFetchingNextPage
  const failed = query.isFetchNextPageError
  // The latest query and whether a page is on its way, read by the observer
  // without re-creating it on every render — and so a second sighting before
  // the first page has started cannot ask for the same page twice.
  const latest = useRef(query)
  latest.current = query
  const before = useRef(onBeforeLoad)
  before.current = onBeforeLoad
  const inFlight = useRef(false)
  inFlight.current = loading
  const load = () => {
    if (inFlight.current) return
    inFlight.current = true
    before.current?.()
    void latest.current.fetchNextPage()
  }
  useEffect(() => {
    const el = ref.current
    if (!el || !auto || failed || loading || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting) || inFlight.current) return
      load()
    })
    observer.observe(el)
    return () => observer.disconnect()
    // `load` reads everything it needs through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, failed, auto])
  if (loading) return <ListSkeleton rows={3} rowClassName="h-14" />
  return (
    <div className="flex flex-col items-center gap-1 pt-1">
      {failed && <p className="text-xs text-destructive">{failedLabel ?? t('inbox.loadOlderFailed')}</p>}
      <button
        ref={ref}
        type="button"
        onClick={load}
        data-testid={testId}
        className="inline-flex h-7 items-center rounded-md border border-border/70 px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      >
        {label ?? t('inbox.loadOlder')}
      </button>
    </div>
  )
}

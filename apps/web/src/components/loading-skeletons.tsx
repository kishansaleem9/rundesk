import { useEffect, useRef, useState } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { Skeleton } from '@rundesk/ui'

/**
 * Waiting states.
 *
 * "Waiting ka jo time period hai woh BLANK SCREEN na ho — woh icons hi hon."
 * That is the first note in the 7 Aug review, at 00:08, and until now the app
 * did the opposite in three separate places: the boot screen was empty until
 * the bundle parsed, all 47 route chunks loaded into nothing because the router
 * had no `defaultPendingComponent`, and pages that read `query.data ?? []`
 * rendered their *empty state* while the request was still in flight — telling
 * you there is nothing there before it knows.
 *
 * These are the shapes the app draws instead. They deliberately mirror the
 * layout that is about to replace them, so the page doesn't jump when the data
 * lands. `Skeleton` (packages/ui) supplies the shimmer; it existed and was
 * imported by nothing.
 */

/** Rows of equal height — lists, inboxes, tables. */
export function ListSkeleton({
  rows = 6,
  className = '',
  rowClassName = 'h-16',
}: {
  rows?: number
  className?: string
  rowClassName?: string
}) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton
          key={i}
          className={rowClassName}
          // Fade down the list so it reads as "more below", not as content.
          style={{ opacity: Math.max(0.25, 1 - i * 0.13) }}
        />
      ))}
    </div>
  )
}

/** Tiles — docs, templates, whiteboards, clips, forms. */
export function CardGridSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      aria-hidden="true"
    >
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border/60 p-4 space-y-3">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <div className="flex items-center gap-2 pt-1">
            <Skeleton className="h-6 w-6 rounded-full" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** A page heading plus its toolbar, above whatever body is passed in. */
export function PageSkeleton({
  children,
  toolbar = true,
}: {
  children?: React.ReactNode
  toolbar?: boolean
}) {
  return (
    <div className="p-6 space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="space-y-3">
        <Skeleton className="h-7 w-56" />
        {toolbar ? (
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-8 w-24 rounded-full" />
            <Skeleton className="h-8 w-20 rounded-full" />
            <Skeleton className="h-8 w-28 rounded-full" />
            <Skeleton className="h-8 w-8 rounded-md ml-auto" />
          </div>
        ) : null}
      </div>
      {children ?? <ListSkeleton />}
    </div>
  )
}

/**
 * The router's `defaultPendingComponent`, used for matches that go through a
 * loader. It is *not* enough on its own — see `useRouteLoading` below.
 */
export function RoutePending() {
  return <PageSkeleton />
}

/**
 * Is the router fetching a route right now, for long enough to be worth saying
 * so?
 *
 * `defaultPendingComponent` alone does not cover this app. Every route is a
 * `.lazy()` chunk with no loader, and the router resolves those without ever
 * putting the match into the pending status the option keys off. Measured: a
 * cold load of /app/:ws/docs with the chunk held for 4s renders an entirely
 * empty `<body>` — not the previous page, not a fallback, nothing. Navigating
 * between routes is the mirror image: the *old* page stays on screen with no
 * sign anything was clicked.
 *
 * Router state is observable whatever the internals do, so the waiting state is
 * driven from that instead. The delay keeps a cached chunk from flashing a
 * skeleton on its way past; the floor keeps a skeleton that does appear on
 * screen long enough to read as deliberate rather than as a glitch.
 */
export function useRouteLoading({ delayMs = 150, minMs = 300 } = {}): boolean {
  const isLoading = useRouterState({ select: (s) => s.isLoading })
  const [visible, setVisible] = useState(false)
  const shownAt = useRef(0)

  useEffect(() => {
    if (isLoading) {
      const timer = setTimeout(() => {
        shownAt.current = Date.now()
        setVisible(true)
      }, delayMs)
      return () => clearTimeout(timer)
    }
    if (!visible) return
    const held = Date.now() - shownAt.current
    const timer = setTimeout(() => setVisible(false), Math.max(0, minMs - held))
    return () => clearTimeout(timer)
  }, [isLoading, visible, delayMs, minMs])

  return visible
}

/**
 * The whole application, as shapes. Shown when a route is loading and there is
 * no shell on screen yet to put a page skeleton inside — a cold load or a deep
 * link, where the router holds back every match including the layout. It
 * deliberately mirrors the boot skeleton in index.html, so handing over from
 * one to the other is not a visible event.
 */
export function AppShellSkeleton() {
  return (
    <div className="h-screen flex bg-background" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="w-14 border-r border-border/60 py-3.5 flex flex-col items-center gap-3.5 shrink-0">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-7 rounded-[9px]" />
        ))}
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="h-14 border-b border-border/60 flex items-center gap-3 px-4">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-8 w-72 ml-auto rounded-lg" />
          <Skeleton className="h-7 w-7 rounded-full" />
        </div>
        <PageSkeleton />
      </div>
    </div>
  )
}

/**
 * A hairline at the top of the window while the router works. Navigations that
 * keep the previous page on screen still need to admit that the click landed.
 */
export function RouteProgressBar() {
  const loading = useRouteLoading({ delayMs: 120, minMs: 240 })
  if (!loading) return null
  return (
    <div
      className="fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden bg-primary/20"
      role="progressbar"
      aria-label="Loading"
      data-testid="route-progress"
    >
      <div className="h-full w-1/3 bg-primary animate-route-progress" />
    </div>
  )
}

/**
 * For a panel that slides in over the page — the command palette and the AI
 * dock, both of which used `<Suspense fallback={null}>` and so showed nothing
 * at all between the click and the chunk arriving.
 */
export function PanelSkeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`p-4 space-y-4 ${className}`}
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-9 w-full rounded-lg" />
      <ListSkeleton rows={5} rowClassName="h-10" />
    </div>
  )
}

/** The palette is a centred dialog, so its waiting state has to be one too. */
export function CommandPaletteSkeleton() {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[10vh]">
      <div className="w-full max-w-2xl rounded-xl border border-border/60 bg-card shadow-2xl">
        <PanelSkeleton />
      </div>
    </div>
  )
}

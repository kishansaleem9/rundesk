import { createRootRouteWithContext, Outlet, useRouterState } from '@tanstack/react-router'
import {
  AppShellSkeleton,
  RouteProgressBar,
  useRouteLoading,
} from '../components/loading-skeletons'
import type { QueryClient } from '@tanstack/react-query'
import { Toaster, TooltipProvider } from '@rundesk/ui'
import type { AuthState } from '../store/auth'
import { RouteErrorBoundary } from '../components/route-error-boundary'
import { NotFound } from '../components/not-found'
import { CookieConsentBanner } from '../components/cookie-consent-banner'

export interface RouterContext {
  auth: AuthState
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  errorComponent: ({ error, reset }) => (
    <RouteErrorBoundary error={error} reset={reset} />
  ),
  notFoundComponent: NotFound,
})

function RootLayout() {
  // A cold load or a deep link holds back every match, layout included, so
  // there is no shell to put a page skeleton inside — the whole app is drawn
  // as shapes instead. Measured before this: an empty <body> for as long as the
  // chunk took. See useRouteLoading for why the router's own
  // defaultPendingComponent does not cover it.
  const loading = useRouteLoading()
  const hasShell = useRouterState({
    select: (s) => s.matches.some((m) => m.routeId !== '__root__' && m.status === 'success'),
  })

  return (
    <TooltipProvider delayDuration={200}>
      <RouteProgressBar />
      <div className="min-h-screen bg-background text-foreground font-sans">
        {loading && !hasShell ? <AppShellSkeleton /> : <Outlet />}
      </div>
      <CookieConsentBanner />
      <Toaster />
    </TooltipProvider>
  )
}

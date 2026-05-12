import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { Toaster, TooltipProvider } from '@rundesk/ui'
import type { AuthState } from '../store/auth'
import { RouteErrorBoundary } from '../components/route-error-boundary'
import { NotFound } from '../components/not-found'

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
  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-screen bg-background text-foreground font-sans">
        <Outlet />
      </div>
      <Toaster />
    </TooltipProvider>
  )
}

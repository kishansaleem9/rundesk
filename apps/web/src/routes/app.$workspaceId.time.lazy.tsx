import { createLazyFileRoute, Outlet } from '@tanstack/react-router'

// Layout route so nested children (e.g. /time/approvals) render via the Outlet
// instead of being shadowed by the time page.
function TimeSectionLayout() {
  return <Outlet />
}

export const Route = createLazyFileRoute('/app/$workspaceId/time')({
  component: TimeSectionLayout,
})

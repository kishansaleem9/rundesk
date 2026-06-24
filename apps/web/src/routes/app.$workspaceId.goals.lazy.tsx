import { createLazyFileRoute, Outlet } from '@tanstack/react-router'

// Layout route so nested children (e.g. /goals/$goalId) render via the Outlet
// instead of being shadowed by the goals list page.
function GoalsSectionLayout() {
  return <Outlet />
}

export const Route = createLazyFileRoute('/app/$workspaceId/goals')({
  component: GoalsSectionLayout,
})

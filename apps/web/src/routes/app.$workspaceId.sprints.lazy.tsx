import { createLazyFileRoute, Outlet } from '@tanstack/react-router'

// Layout route so nested children (e.g. /sprints/$sprintId) render via the
// Outlet instead of being shadowed by the sprints list page.
function SprintsSectionLayout() {
  return <Outlet />
}

export const Route = createLazyFileRoute('/app/$workspaceId/sprints')({
  component: SprintsSectionLayout,
})

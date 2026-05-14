import { createLazyFileRoute, Outlet } from '@tanstack/react-router'

function FormsSectionLayout() {
  return <Outlet />
}

export const Route = createLazyFileRoute('/app/$workspaceId/forms')({
  component: FormsSectionLayout,
})

import { createLazyFileRoute } from '@tanstack/react-router'
import { GoalsPage } from '../pages/workspace-goals-page'

export const Route = createLazyFileRoute('/app/$workspaceId/goals')({
  component: GoalsPage,
})

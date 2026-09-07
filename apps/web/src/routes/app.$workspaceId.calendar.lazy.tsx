import { createLazyFileRoute } from '@tanstack/react-router'
import { PlannerPage } from '../pages/workspace-planner-page'

export const Route = createLazyFileRoute('/app/$workspaceId/calendar')({
  component: PlannerPage,
})

import { createLazyFileRoute } from '@tanstack/react-router'
import { GoalDetailPage } from '../pages/workspace-goal-detail-page'

export const Route = createLazyFileRoute('/app/$workspaceId/goals/$goalId')({
  component: GoalDetailPage,
})

import { createLazyFileRoute } from '@tanstack/react-router'
import { InsightsPage } from '../pages/workspace-insights-page'

export const Route = createLazyFileRoute('/app/$workspaceId/insights')({
  component: InsightsPage,
})

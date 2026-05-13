import { createLazyFileRoute } from '@tanstack/react-router'
import { ReportsPage } from '../pages/workspace-reports-page'

export const Route = createLazyFileRoute('/app/$workspaceId/reports')({
  component: ReportsPage,
})

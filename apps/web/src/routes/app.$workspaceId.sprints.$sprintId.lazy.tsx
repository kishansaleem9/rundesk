import { createLazyFileRoute } from '@tanstack/react-router'
import { SprintDetailPage } from '../pages/workspace-sprint-detail-page'

export const Route = createLazyFileRoute('/app/$workspaceId/sprints/$sprintId')({
  component: SprintDetailPage,
})

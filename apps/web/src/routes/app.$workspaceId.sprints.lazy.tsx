import { createLazyFileRoute } from '@tanstack/react-router'
import { SprintsPage } from '../pages/workspace-sprints-page'

export const Route = createLazyFileRoute('/app/$workspaceId/sprints')({
  component: SprintsPage,
})

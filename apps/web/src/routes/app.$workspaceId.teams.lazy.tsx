import { createLazyFileRoute } from '@tanstack/react-router'
import { TeamsPage } from '../pages/workspace-teams-page'

export const Route = createLazyFileRoute('/app/$workspaceId/teams')({
  component: TeamsPage,
})

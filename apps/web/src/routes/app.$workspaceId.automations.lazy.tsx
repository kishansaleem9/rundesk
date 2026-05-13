import { createLazyFileRoute } from '@tanstack/react-router'
import { AutomationsPage } from '../pages/workspace-automations-page'

export const Route = createLazyFileRoute('/app/$workspaceId/automations')({
  component: AutomationsPage,
})

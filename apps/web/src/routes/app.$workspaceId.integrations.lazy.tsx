import { createLazyFileRoute } from '@tanstack/react-router'
import { IntegrationsMarketplacePage } from '../pages/workspace-integrations-page'

export const Route = createLazyFileRoute('/app/$workspaceId/integrations')({
  component: IntegrationsMarketplacePage,
})

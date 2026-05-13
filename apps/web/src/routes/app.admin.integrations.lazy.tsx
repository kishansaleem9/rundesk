import { createLazyFileRoute } from '@tanstack/react-router'
import { AdminIntegrationsPage } from '../pages/admin-integrations-page'

export const Route = createLazyFileRoute('/app/admin/integrations')({
  component: AdminIntegrationsPage,
})

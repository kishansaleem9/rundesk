import { createLazyFileRoute } from '@tanstack/react-router'
import { AdminWebhooksPage } from '../pages/admin-webhooks-page'

export const Route = createLazyFileRoute('/app/admin/webhooks')({
  component: AdminWebhooksPage,
})

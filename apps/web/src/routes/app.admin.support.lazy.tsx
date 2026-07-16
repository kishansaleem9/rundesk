import { createLazyFileRoute } from '@tanstack/react-router'
import { AdminSupportPage } from '../pages/admin-support-page'

export const Route = createLazyFileRoute('/app/admin/support')({
  component: AdminSupportPage,
})

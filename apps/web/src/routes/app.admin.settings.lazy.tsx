import { createLazyFileRoute } from '@tanstack/react-router'
import { AdminSettingsPage } from '../pages/admin-settings-page'

export const Route = createLazyFileRoute('/app/admin/settings')({
  component: AdminSettingsPage,
})

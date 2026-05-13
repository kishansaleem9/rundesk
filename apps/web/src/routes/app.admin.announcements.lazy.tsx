import { createLazyFileRoute } from '@tanstack/react-router'
import { AnnouncementsAdminPage } from '../pages/admin-announcements-page'

export const Route = createLazyFileRoute('/app/admin/announcements')({
  component: AnnouncementsAdminPage,
})

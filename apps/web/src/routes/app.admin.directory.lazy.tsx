import { createLazyFileRoute } from '@tanstack/react-router'
import { AdminDirectoryPage } from '../pages/admin-directory-page'

export const Route = createLazyFileRoute('/app/admin/directory')({
  component: AdminDirectoryPage,
})

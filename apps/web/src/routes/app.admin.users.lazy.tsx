import { createLazyFileRoute } from '@tanstack/react-router'
import { AdminUsersPage } from '../pages/admin-users-page'

export const Route = createLazyFileRoute('/app/admin/users')({
  component: AdminUsersPage,
})

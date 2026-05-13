import { createLazyFileRoute } from '@tanstack/react-router'
import { AuditLogPage } from '../pages/admin-audit-page'

export const Route = createLazyFileRoute('/app/admin/audit')({
  component: AuditLogPage,
})

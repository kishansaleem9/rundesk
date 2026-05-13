import { createLazyFileRoute } from '@tanstack/react-router'
import { TimeApprovalsPage } from '../pages/workspace-time-approvals-page'

export const Route = createLazyFileRoute('/app/$workspaceId/time/approvals')({
  component: TimeApprovalsPage,
})

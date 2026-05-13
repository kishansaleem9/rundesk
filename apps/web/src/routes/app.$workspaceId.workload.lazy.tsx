import { createLazyFileRoute } from '@tanstack/react-router'
import { WorkloadPage } from '../pages/workspace-workload-page'

export const Route = createLazyFileRoute('/app/$workspaceId/workload')({
  component: WorkloadPage,
})

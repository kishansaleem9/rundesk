import { createLazyFileRoute } from '@tanstack/react-router'
import { SharedWithMePage } from '../pages/workspace-shared-page'

export const Route = createLazyFileRoute('/app/$workspaceId/shared')({
  component: SharedWithMePage,
})

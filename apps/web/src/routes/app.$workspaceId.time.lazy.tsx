import { createLazyFileRoute } from '@tanstack/react-router'
import { TimePage } from '../pages/workspace-time-page'

export const Route = createLazyFileRoute('/app/$workspaceId/time')({
  component: TimePage,
})

import { createLazyFileRoute } from '@tanstack/react-router'
import { TimelinePage } from '../pages/workspace-timeline-page'

export const Route = createLazyFileRoute('/app/$workspaceId/timeline')({
  component: TimelinePage,
})

import { createLazyFileRoute } from '@tanstack/react-router'
import { InboxPage } from '../pages/workspace-inbox-page'

export const Route = createLazyFileRoute('/app/$workspaceId/inbox')({
  component: InboxPage,
})

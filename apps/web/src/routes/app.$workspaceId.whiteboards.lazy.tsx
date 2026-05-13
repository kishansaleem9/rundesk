import { createLazyFileRoute } from '@tanstack/react-router'
import { WhiteboardsPage } from '../pages/workspace-whiteboards-page'

export const Route = createLazyFileRoute('/app/$workspaceId/whiteboards')({
  component: WhiteboardsPage,
})

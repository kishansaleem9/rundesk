import { createLazyFileRoute } from '@tanstack/react-router'
import { RepliesPage } from '../pages/workspace-replies-page'

export const Route = createLazyFileRoute('/app/$workspaceId/replies')({
  component: RepliesPage,
})

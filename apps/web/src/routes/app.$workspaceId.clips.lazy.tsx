import { createLazyFileRoute } from '@tanstack/react-router'
import { ClipsPage } from '../pages/workspace-clips-page'

export const Route = createLazyFileRoute('/app/$workspaceId/clips')({
  component: ClipsPage,
})

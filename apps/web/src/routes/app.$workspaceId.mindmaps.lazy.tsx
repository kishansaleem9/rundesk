import { createLazyFileRoute } from '@tanstack/react-router'
import { MindMapsPage } from '../pages/workspace-mindmaps-page'

export const Route = createLazyFileRoute('/app/$workspaceId/mindmaps')({
  component: MindMapsPage,
})

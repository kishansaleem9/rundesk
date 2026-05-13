import { createLazyFileRoute } from '@tanstack/react-router'
import { AiPage } from '../pages/workspace-ai-page'

export const Route = createLazyFileRoute('/app/$workspaceId/ai')({
  component: AiPage,
})

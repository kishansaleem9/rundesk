import { createLazyFileRoute } from '@tanstack/react-router'
import { DocsPage } from '../pages/workspace-docs-page'

export const Route = createLazyFileRoute('/app/$workspaceId/docs')({
  component: DocsPage,
})

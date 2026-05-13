import { createLazyFileRoute } from '@tanstack/react-router'
import { TemplatesPage } from '../pages/workspace-templates-page'

export const Route = createLazyFileRoute('/app/$workspaceId/templates')({
  component: TemplatesPage,
})

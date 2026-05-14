import { createLazyFileRoute } from '@tanstack/react-router'
import { FormsPage } from '../pages/workspace-forms-page'

export const Route = createLazyFileRoute('/app/$workspaceId/forms/')({
  component: FormsPage,
})

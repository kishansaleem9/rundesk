import { createLazyFileRoute } from '@tanstack/react-router'
import { ImportPage } from '../pages/workspace-import-page'

export const Route = createLazyFileRoute('/app/$workspaceId/import')({
  component: ImportPage,
})

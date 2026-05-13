import { createLazyFileRoute } from '@tanstack/react-router'
import { ProjectShell } from '../pages/workspace-project-shell-page'

export const Route = createLazyFileRoute('/app/$workspaceId/$spaceId/$projectId')({
  component: ProjectShell,
})

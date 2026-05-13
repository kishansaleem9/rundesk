import { createLazyFileRoute } from '@tanstack/react-router'
import { SpaceShell } from '../pages/workspace-space-shell-page'

export const Route = createLazyFileRoute('/app/$workspaceId/$spaceId')({
  component: SpaceShell,
})

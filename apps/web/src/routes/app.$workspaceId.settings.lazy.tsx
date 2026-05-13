import { createLazyFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '../pages/workspace-settings-page'

export const Route = createLazyFileRoute('/app/$workspaceId/settings')({
  component: SettingsPage,
})

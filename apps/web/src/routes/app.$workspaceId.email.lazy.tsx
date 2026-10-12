import { createLazyFileRoute } from '@tanstack/react-router'
import { EmailSettingsPage } from '../pages/email-settings-page'

export const Route = createLazyFileRoute('/app/$workspaceId/email')({
  component: EmailSettingsPage,
})

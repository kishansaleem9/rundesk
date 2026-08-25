import { createLazyFileRoute } from '@tanstack/react-router'
import { MeetingsPage } from '../pages/workspace-meetings-page'

export const Route = createLazyFileRoute('/app/$workspaceId/meetings')({
  component: MeetingsPage,
})

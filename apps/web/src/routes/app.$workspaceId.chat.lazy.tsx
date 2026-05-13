import { createLazyFileRoute } from '@tanstack/react-router'
import { ChatPage } from '../pages/workspace-chat-page'

export const Route = createLazyFileRoute('/app/$workspaceId/chat')({
  component: ChatPage,
})

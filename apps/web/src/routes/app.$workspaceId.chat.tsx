import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/app/$workspaceId/chat')({
  // Deep-link support: /app/:ws/chat?channel=<id>&message=<id> (Plan §6 inbox).
  validateSearch: (search: Record<string, unknown>): { channel?: string; message?: string } => ({
    channel: typeof search.channel === 'string' ? search.channel : undefined,
    message: typeof search.message === 'string' ? search.message : undefined,
  }),
})

import { createFileRoute } from '@tanstack/react-router'

/**
 * ClickUp's Email settings (`found-9-oct/task-email-sends-from-the-server`):
 * where a mailbox's consent comes back to — `connected`, or `connectError`
 * with the provider's words — and which tab is open.
 */
export const Route = createFileRoute('/app/$workspaceId/email')({
  validateSearch: (search: Record<string, unknown>): { tab?: 'accounts' | 'signatures' | 'templates'; connected?: string; connectError?: string } => ({
    tab: search.tab === 'signatures' || search.tab === 'templates' || search.tab === 'accounts' ? search.tab : undefined,
    connected: typeof search.connected === 'string' && /^(gmail|outlook)$/.test(search.connected) ? search.connected : undefined,
    connectError: typeof search.connectError === 'string' ? search.connectError.slice(0, 300) : undefined,
  }),
})

import { createFileRoute } from '@tanstack/react-router'

const FILTERS = ['unread', 'read', 'all'] as const

export const Route = createFileRoute('/app/$workspaceId/replies')({
  // §A2.9 — read replies are only browsable if the sub-tab is addressable.
  validateSearch: (search: Record<string, unknown>): { filter?: (typeof FILTERS)[number] } => ({
    filter: (FILTERS as readonly string[]).includes(search.filter as string)
      ? (search.filter as (typeof FILTERS)[number])
      : undefined,
  }),
})

import { createFileRoute } from '@tanstack/react-router'

const VIEWS = ['inbox', 'later', 'cleared'] as const

export const Route = createFileRoute('/app/$workspaceId/inbox')({
  // §A2.6 — the triage bucket and the mentions filter live in the URL so a tab
  // survives navigation and can be linked to.
  validateSearch: (
    search: Record<string, unknown>,
  ): { view?: (typeof VIEWS)[number]; filter?: 'all' | 'mentions' } => ({
    view: (VIEWS as readonly string[]).includes(search.view as string)
      ? (search.view as (typeof VIEWS)[number])
      : undefined,
    filter: search.filter === 'mentions' ? 'mentions' : undefined,
  }),
})

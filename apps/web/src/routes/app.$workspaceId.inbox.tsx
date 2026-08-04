import { createFileRoute } from '@tanstack/react-router'

const VIEWS = ['inbox', 'later', 'cleared'] as const
const FILTERS = ['all', 'primary', 'other'] as const

export const Route = createFileRoute('/app/$workspaceId/inbox')({
  // §A2.6 — the triage bucket and the Primary/Other filter live in the URL so a
  // tab survives navigation and can be linked to.
  validateSearch: (
    search: Record<string, unknown>,
  ): { view?: (typeof VIEWS)[number]; filter?: (typeof FILTERS)[number] } => {
    // `mentions` was this filter's old name for the same predicate — human
    // traffic, which always included assignments and chat, not literally
    // mentions. Bookmarks from before the rename still resolve.
    const raw = search.filter === 'mentions' ? 'primary' : (search.filter as string)
    return {
      view: (VIEWS as readonly string[]).includes(search.view as string)
        ? (search.view as (typeof VIEWS)[number])
        : undefined,
      filter: (FILTERS as readonly string[]).includes(raw)
        ? (raw as (typeof FILTERS)[number])
        : undefined,
    }
  },
})

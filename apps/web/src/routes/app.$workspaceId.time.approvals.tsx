import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/app/$workspaceId/time/approvals')({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: search.tab === 'history' ? 'history' : 'pending',
    historyFilter:
      search.historyFilter === 'approved' ||
      search.historyFilter === 'rejected' ||
      search.historyFilter === 'this_week'
        ? search.historyFilter
        : 'all',
  }),
})

import { createFileRoute } from '@tanstack/react-router'

const TABS = ['sheet', 'doc', 'clickup'] as const

export const Route = createFileRoute('/app/$workspaceId/import')({
  // Settings › Imports / Exports links straight to the Document and ClickUp importers.
  validateSearch: (search: Record<string, unknown>): { tab?: (typeof TABS)[number] } => ({
    tab: (TABS as readonly string[]).includes(search.tab as string) ? (search.tab as (typeof TABS)[number]) : undefined,
  }),
})

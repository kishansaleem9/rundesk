import { createFileRoute } from '@tanstack/react-router'

const TABS = ['sheet', 'doc', 'confluence', 'basecamp', 'apps', 'slack', 'clickup'] as const

export const Route = createFileRoute('/app/$workspaceId/import')({
  // Settings › Imports / Exports links straight to the Document and ClickUp importers, and an app's
  // sign-in comes back to its own tab. The page reads the address itself (`ImportPage`), so this only
  // types the links: `importError` and `app` pass through as they came.
  validateSearch: (search: Record<string, unknown>): { tab?: (typeof TABS)[number]; importError?: string; app?: string } => ({
    tab: (TABS as readonly string[]).includes(search.tab as string) ? (search.tab as (typeof TABS)[number]) : undefined,
    ...(search.importError !== undefined ? { importError: String(search.importError) } : {}),
    ...(typeof search.app === 'string' ? { app: search.app } : {}),
  }),
})

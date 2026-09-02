import { createFileRoute } from '@tanstack/react-router'

// G08-9 [08:35] — her account settings has a "My Settings" group with a
// Workspaces page in it. Listed here as well as in the page's own TABS,
// because an unrecognised ?tab= is dropped and would land you on General.
const TABS = ['general', 'security', 'notifications', 'workspaces'] as const

export const Route = createFileRoute('/app/profile')({
  // §A2.11 — the inbox links straight at the delivery-preferences tab.
  validateSearch: (search: Record<string, unknown>): { tab?: (typeof TABS)[number] } => ({
    tab: (TABS as readonly string[]).includes(search.tab as string)
      ? (search.tab as (typeof TABS)[number])
      : undefined,
  }),
})

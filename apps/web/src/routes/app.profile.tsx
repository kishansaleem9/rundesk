import { createFileRoute } from '@tanstack/react-router'

const TABS = ['general', 'security', 'notifications'] as const

export const Route = createFileRoute('/app/profile')({
  // §A2.11 — the inbox links straight at the delivery-preferences tab.
  validateSearch: (search: Record<string, unknown>): { tab?: (typeof TABS)[number] } => ({
    tab: (TABS as readonly string[]).includes(search.tab as string)
      ? (search.tab as (typeof TABS)[number])
      : undefined,
  }),
})

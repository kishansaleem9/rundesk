import { createFileRoute } from '@tanstack/react-router'

/** Mirrors TABS in workspace-reports-page.tsx. */
const TABS = ['overview', 'productivity', 'completion', 'time', 'sprints', 'goals', 'custom'] as const

export const Route = createFileRoute('/app/$workspaceId/reports')({
  /*
   * A5.13 — the dashboard's "Schedule delivery" links at ?tab=custom, so the
   * param was already being read; it was pulled straight out of
   * window.location.search once at mount because the route declared nothing.
   * Reading it there also meant it was never written back, so which report you
   * were looking at was not an address.
   */
  validateSearch: (search: Record<string, unknown>): { tab?: (typeof TABS)[number] } => ({
    tab: (TABS as readonly string[]).includes(search.tab as string)
      ? (search.tab as (typeof TABS)[number])
      : undefined,
  }),
})

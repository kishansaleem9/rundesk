import { createFileRoute } from '@tanstack/react-router'
import { PLANNER_SETTINGS_PAGES, type PlannerSettingsPage } from '../lib/planner-settings-pages'

/**
 * §V2-02 — the Planner.
 *
 * `/calendar`, not `/planner`: the video's address bar reads
 * `app.clickup.com/<ws>/calendar` while the rail is headed "Planner" and the
 * tab says "Planner | Leo". The noun and the address disagree on purpose, and
 * the audit's one-line summary said `planner`, which would have put this page
 * at an address the video never shows.
 */
export const Route = createFileRoute('/app/$workspaceId/calendar')({
  // The settings dialog's page, as an address: the Meetings page's "Connect
  // Calendar" leads to Accounts, where a calendar is connected. Whitelisted, so
  // an address naming no page opens nothing.
  validateSearch: (search: Record<string, unknown>): { settings?: PlannerSettingsPage } => ({
    settings: (PLANNER_SETTINGS_PAGES as readonly string[]).includes(search.settings as string)
      ? (search.settings as PlannerSettingsPage)
      : undefined,
  }),
})

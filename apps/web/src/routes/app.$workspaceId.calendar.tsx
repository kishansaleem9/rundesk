import { createFileRoute } from '@tanstack/react-router'

/**
 * §V2-02 — the Planner.
 *
 * `/calendar`, not `/planner`: the video's address bar reads
 * `app.clickup.com/<ws>/calendar` while the rail is headed "Planner" and the
 * tab says "Planner | Leo". The noun and the address disagree on purpose, and
 * the audit's one-line summary said `planner`, which would have put this page
 * at an address the video never shows.
 */
export const Route = createFileRoute('/app/$workspaceId/calendar')({})

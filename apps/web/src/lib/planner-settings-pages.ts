/**
 * THE PLANNER SETTINGS DIALOG'S PAGES, in frame `14:10`'s order.
 *
 * One list for the two things that name them: the dialog's nav, and the
 * planner's address, `/calendar?settings=<page>`, which opens the dialog on
 * that page. The Meetings page's "Connect Calendar" goes to Accounts by it
 * (`found-24-sep/meetings-connect-calendar-goes-to-settings`). Kept out of the
 * dialog's module so the route can read it without loading the dialog.
 */
export const PLANNER_SETTINGS_PAGES = [
  'appearance',
  'accounts',
  'sidebar',
  'upcomingMeeting',
  'timeBlocking',
] as const
export type PlannerSettingsPage = (typeof PLANNER_SETTINGS_PAGES)[number]

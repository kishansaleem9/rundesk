/*
 * Deep-link state of /timesheets: which tab, whose week, which week.
 * Pure string helpers so they can be unit-tested and reused by links from
 * elsewhere in the app (e.g. "View in Timesheets" inside a task).
 */

import { isDayKey, startOfWeekKey, type DayKey } from "./time";

export type TimesheetTab = "mine" | "all" | "approvals";

export interface TimesheetUrlState {
  tab: TimesheetTab;
  /** Member whose week is shown; null means the viewer's own. */
  user: string | null;
  /** Monday key, or null for the current week. */
  week: DayKey | null;
}

const ID_PATTERN = /^[\w-]{1,64}$/;

/** Reads `?tab=&user=&week=` from a search string; anything malformed falls back to the default. */
export function parseTimesheetSearch(search: string): TimesheetUrlState {
  const params = new URLSearchParams(search);
  const tab = params.get("tab");
  const user = params.get("user") ?? "";
  const week = params.get("week") ?? "";

  return {
    tab: tab === "all" || tab === "approvals" ? tab : "mine",
    user: ID_PATTERN.test(user) ? user : null,
    // Any day of the wanted week is accepted and snapped to its Monday.
    week: isDayKey(week) ? startOfWeekKey(week) : null,
  };
}

/** "" or "?tab=…&user=…&week=…". Defaults (mine, self, this week) are left out. */
export function buildTimesheetSearch(state: {
  tab: TimesheetTab;
  user: string | null;
  week: DayKey;
  thisWeek: DayKey;
}): string {
  const params = new URLSearchParams();

  if (state.tab !== "mine") {
    params.set("tab", state.tab);
  }

  if (state.user) {
    params.set("user", state.user);
  }

  if (state.week !== state.thisWeek) {
    params.set("week", state.week);
  }

  const query = params.toString();

  return query ? `?${query}` : "";
}

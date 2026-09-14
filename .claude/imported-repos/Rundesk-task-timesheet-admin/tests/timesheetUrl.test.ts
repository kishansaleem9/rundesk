import { describe, expect, it } from "vitest";

import { buildTimesheetSearch, parseTimesheetSearch } from "@/lib/rundesk/timesheet-url";

describe("parseTimesheetSearch", () => {
  it("falls back to the defaults for an empty or malformed search", () => {
    expect(parseTimesheetSearch("")).toEqual({ tab: "mine", user: null, week: null });
    expect(parseTimesheetSearch("?tab=nope&user=a%20b&week=2026-13-40")).toEqual({
      tab: "mine",
      user: null,
      week: null,
    });
  });

  it("reads the tab, the user and the week, snapping any day to its Monday", () => {
    expect(parseTimesheetSearch("?tab=all")).toEqual({ tab: "all", user: null, week: null });
    expect(parseTimesheetSearch("tab=approvals&user=cmtx673du0000i8l79y1ebpx9")).toEqual({
      tab: "approvals",
      user: "cmtx673du0000i8l79y1ebpx9",
      week: null,
    });
    expect(parseTimesheetSearch("?week=2026-09-09").week).toBe("2026-09-07");
    expect(parseTimesheetSearch("?week=2026-09-07").week).toBe("2026-09-07");
  });
});

describe("buildTimesheetSearch", () => {
  const thisWeek = "2026-09-14";

  it("omits every default", () => {
    expect(buildTimesheetSearch({ tab: "mine", user: null, week: thisWeek, thisWeek })).toBe("");
  });

  it("writes only what differs from the defaults, in a stable order", () => {
    expect(buildTimesheetSearch({ tab: "all", user: null, week: thisWeek, thisWeek })).toBe("?tab=all");
    expect(
      buildTimesheetSearch({ tab: "mine", user: "u1", week: "2026-09-07", thisWeek }),
    ).toBe("?user=u1&week=2026-09-07");
    expect(
      buildTimesheetSearch({ tab: "approvals", user: "u1", week: "2026-08-31", thisWeek }),
    ).toBe("?tab=approvals&user=u1&week=2026-08-31");
  });

  it("round-trips through parseTimesheetSearch", () => {
    const state = { tab: "all" as const, user: "u1", week: "2026-08-31" };
    const search = buildTimesheetSearch({ ...state, thisWeek });

    expect(parseTimesheetSearch(search)).toEqual(state);
  });
});

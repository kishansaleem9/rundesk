import { describe, expect, it } from "vitest";
import {
  addDaysToKey,
  aggregateByUser,
  aggregateEntries,
  findLockingSubmission,
  formatDayHeader,
  formatDuration,
  formatElapsed,
  formatWeekRange,
  isDayKey,
  isFutureWeek,
  isLockedStatus,
  isValidTimeZone,
  isoWeekday,
  lockCandidateRange,
  parseDuration,
  recentWeekStarts,
  secondsBetween,
  startOfWeekKey,
  statusCountsFrom,
  toDayKey,
  weekContainsInstant,
  weekDayKeys,
  weekUtcWindow,
} from "@/lib/rundesk/time";

describe("parseDuration", () => {
  it("accepts hours and minutes in common spellings", () => {
    expect(parseDuration("1h 30m")).toBe(5400);
    expect(parseDuration("1h30m")).toBe(5400);
    expect(parseDuration("2h")).toBe(7200);
    expect(parseDuration("45m")).toBe(2700);
    expect(parseDuration("1.5h")).toBe(5400);
    expect(parseDuration("1 hour 15 mins")).toBe(4500);
  });

  it("accepts h:mm and bare minutes", () => {
    expect(parseDuration("1:30")).toBe(5400);
    expect(parseDuration("0:05")).toBe(300);
    expect(parseDuration("90")).toBe(5400);
  });

  it("rejects garbage, zero and negatives", () => {
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("abc")).toBeNull();
    expect(parseDuration("0m")).toBeNull();
    expect(parseDuration("-1h")).toBeNull();
    expect(parseDuration("1h banana")).toBeNull();
  });
});

describe("formatDuration / formatElapsed", () => {
  it("formats whole hours, minutes and mixes", () => {
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(59)).toBe("<1m");
    expect(formatDuration(60)).toBe("1m");
    expect(formatDuration(2700)).toBe("45m");
    expect(formatDuration(7200)).toBe("2h");
    expect(formatDuration(11700)).toBe("3h 15m");
  });

  it("formats a running clock", () => {
    expect(formatElapsed(0)).toBe("0:00:00");
    expect(formatElapsed(754)).toBe("0:12:34");
    expect(formatElapsed(36_000)).toBe("10:00:00");
  });

  it("never reports negative seconds between instants", () => {
    const start = new Date("2026-09-08T09:00:00Z");
    expect(secondsBetween(start, new Date("2026-09-08T10:30:00Z"))).toBe(5400);
    expect(secondsBetween(start, new Date("2026-09-08T08:00:00Z"))).toBe(0);
  });
});

describe("day keys and weeks", () => {
  it("buckets an instant by calendar date in a time zone", () => {
    const instant = new Date("2026-09-07T23:30:00Z");
    expect(toDayKey(instant, "UTC")).toBe("2026-09-07");
    expect(toDayKey(instant, "Asia/Karachi")).toBe("2026-09-08");
    expect(toDayKey(instant, "America/Los_Angeles")).toBe("2026-09-07");
  });

  it("validates day keys and time zones", () => {
    expect(isDayKey("2026-09-07")).toBe(true);
    expect(isDayKey("2026-02-30")).toBe(false);
    expect(isDayKey("2026-9-7")).toBe(false);
    expect(isValidTimeZone("Europe/London")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });

  it("adds days across month and year boundaries", () => {
    expect(addDaysToKey("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDaysToKey("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDaysToKey("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("finds Monday and lists the week", () => {
    expect(isoWeekday("2026-09-07")).toBe(1);
    expect(isoWeekday("2026-09-13")).toBe(7);
    expect(startOfWeekKey("2026-09-10")).toBe("2026-09-07");
    expect(startOfWeekKey("2026-09-13")).toBe("2026-09-07");
    expect(startOfWeekKey("2026-09-07")).toBe("2026-09-07");
    expect(weekDayKeys("2026-09-07")).toEqual([
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
    ]);
  });

  it("labels a week range", () => {
    expect(formatWeekRange("2026-09-07", "en-US")).toBe("Sep 7 – Sep 13, 2026");
    expect(formatWeekRange("2025-12-29", "en-US")).toBe("Dec 29, 2025 – Jan 4, 2026");
  });
});

describe("aggregateEntries", () => {
  const days = weekDayKeys("2026-09-07");

  it("sums per task per day, per task, per day and for the week", () => {
    const totals = aggregateEntries(
      [
        { taskId: "a", startedAt: "2026-09-07T09:00:00Z", durationSeconds: 3600 },
        { taskId: "a", startedAt: "2026-09-07T13:00:00Z", durationSeconds: 1800 },
        { taskId: "a", startedAt: "2026-09-08T09:00:00Z", durationSeconds: 7200 },
        { taskId: "b", startedAt: "2026-09-08T09:00:00Z", durationSeconds: 900 },
      ],
      days,
      "UTC",
    );

    expect(totals.byTaskDay.a["2026-09-07"]).toBe(5400);
    expect(totals.byTaskDay.a["2026-09-08"]).toBe(7200);
    expect(totals.byTaskDay.b["2026-09-08"]).toBe(900);
    expect(totals.byTask).toEqual({ a: 12600, b: 900 });
    expect(totals.byDay["2026-09-07"]).toBe(5400);
    expect(totals.byDay["2026-09-08"]).toBe(8100);
    expect(totals.byDay["2026-09-09"]).toBe(0);
    expect(totals.week).toBe(13500);
  });

  it("ignores entries outside the week and respects the time zone", () => {
    const totals = aggregateEntries(
      [
        { taskId: "a", startedAt: "2026-09-06T23:30:00Z", durationSeconds: 600 },
        { taskId: "a", startedAt: "2026-09-14T00:00:00Z", durationSeconds: 600 },
      ],
      days,
      "Asia/Karachi",
    );

    // 23:30Z on Sunday the 6th is already Monday the 7th in Karachi (UTC+5).
    expect(totals.byTaskDay.a["2026-09-07"]).toBe(600);
    expect(totals.week).toBe(600);
  });
});

describe("timesheet submissions", () => {
  const monday = "2026-09-07";
  const zones = ["UTC", "Asia/Karachi", "America/Los_Angeles", "Pacific/Kiritimati", "Etc/GMT+12"];

  it("judges week membership by the calendar date in the submission's zone", () => {
    // 23:30Z on Sunday the 6th is already Monday the 7th in Karachi (UTC+5).
    const lateSunday = new Date("2026-09-06T23:30:00Z");
    expect(weekContainsInstant(monday, "Asia/Karachi", lateSunday)).toBe(true);
    expect(weekContainsInstant(monday, "UTC", lateSunday)).toBe(false);
    expect(weekContainsInstant(monday, "America/Los_Angeles", lateSunday)).toBe(false);

    // 03:00Z on Monday the 14th is still Sunday the 13th in Los Angeles (UTC-7).
    const earlyMonday = new Date("2026-09-14T03:00:00Z");
    expect(weekContainsInstant(monday, "America/Los_Angeles", earlyMonday)).toBe(true);
    expect(weekContainsInstant(monday, "UTC", earlyMonday)).toBe(false);

    // The extremes: Kiritimati is UTC+14, Etc/GMT+12 is UTC-12.
    const sundayMorning = new Date("2026-09-06T10:30:00Z");
    expect(weekContainsInstant(monday, "Pacific/Kiritimati", sundayMorning)).toBe(true);
    expect(weekContainsInstant(monday, "Etc/GMT+12", sundayMorning)).toBe(false);
    expect(weekContainsInstant("2026-08-31", "Etc/GMT+12", sundayMorning)).toBe(true);
  });

  it("keeps duration-only entries (local midnight) in the day they were logged for", () => {
    // Local midnight of Sunday the 13th in Los Angeles is 07:00Z.
    const sundayMidnightLa = new Date("2026-09-13T07:00:00Z");
    expect(weekContainsInstant(monday, "America/Los_Angeles", sundayMidnightLa)).toBe(true);

    // Local midnight of Monday the 14th belongs to the next week.
    const mondayMidnightLa = new Date("2026-09-14T07:00:00Z");
    expect(weekContainsInstant(monday, "America/Los_Angeles", mondayMidnightLa)).toBe(false);
    expect(weekContainsInstant("2026-09-14", "America/Los_Angeles", mondayMidnightLa)).toBe(true);

    // Local midnight of Monday the 7th in Karachi is Sunday 19:00Z.
    const mondayMidnightKarachi = new Date("2026-09-06T19:00:00Z");
    expect(weekContainsInstant(monday, "Asia/Karachi", mondayMidnightKarachi)).toBe(true);
  });

  it("handles the week a zone leaves daylight saving time", () => {
    // Los Angeles falls back on Sunday 2026-11-01; the week is Oct 26 – Nov 1.
    const dstWeek = "2026-10-26";
    // Sunday 23:30 PST
    expect(weekContainsInstant(dstWeek, "America/Los_Angeles", new Date("2026-11-02T07:30:00Z"))).toBe(true);
    // Monday 00:30 PST
    expect(weekContainsInstant(dstWeek, "America/Los_Angeles", new Date("2026-11-02T08:30:00Z"))).toBe(false);
    // Sunday 23:30 PDT (the week before)
    expect(weekContainsInstant(dstWeek, "America/Los_Angeles", new Date("2026-10-26T06:30:00Z"))).toBe(false);
    // Monday 00:30 PDT
    expect(weekContainsInstant(dstWeek, "America/Los_Angeles", new Date("2026-10-26T07:30:00Z"))).toBe(true);

    // London falls back on Sunday 2026-10-25; the week is Oct 19 – Oct 25.
    expect(weekContainsInstant("2026-10-19", "Europe/London", new Date("2026-10-25T23:30:00Z"))).toBe(true);
    expect(weekContainsInstant("2026-10-19", "Europe/London", new Date("2026-10-26T00:30:00Z"))).toBe(false);
  });

  it("candidate range always contains the Monday of the instant's week", () => {
    const instants = [
      "2026-09-06T10:30:00Z",
      "2026-09-06T23:30:00Z",
      "2026-09-07T12:00:00Z",
      "2026-09-13T19:00:00Z",
      "2026-09-14T03:00:00Z",
      "2026-12-31T23:59:00Z",
    ];

    for (const iso of instants) {
      const instant = new Date(iso);
      const range = lockCandidateRange(instant);

      for (const zone of zones) {
        const weekStart = startOfWeekKey(toDayKey(instant, zone));
        expect(weekStart >= range.from && weekStart <= range.to).toBe(true);
      }
    }

    expect(lockCandidateRange(new Date("2026-09-10T12:00:00Z"))).toEqual({
      from: "2026-09-03",
      to: "2026-09-11",
    });
  });

  it("finds the locking submission and ignores rejected weeks", () => {
    const submissions = [
      { weekStart: "2026-08-31", timeZone: "UTC", status: "REJECTED" as const },
      { weekStart: monday, timeZone: "Asia/Karachi", status: "SUBMITTED" as const },
      { weekStart: "2026-09-14", timeZone: "UTC", status: "APPROVED" as const },
    ];

    expect(isLockedStatus("SUBMITTED")).toBe(true);
    expect(isLockedStatus("APPROVED")).toBe(true);
    expect(isLockedStatus("REJECTED")).toBe(false);
    expect(isLockedStatus(null)).toBe(false);

    // Inside the rejected week: editable.
    expect(findLockingSubmission(submissions, new Date("2026-09-06T12:00:00Z"))).toBeNull();
    // Monday 04:30 in Karachi: locked by the submitted week.
    expect(findLockingSubmission(submissions, new Date("2026-09-06T23:30:00Z"))?.weekStart).toBe(monday);
    // Sunday 23:59 in Karachi: still locked.
    expect(findLockingSubmission(submissions, new Date("2026-09-13T18:59:00Z"))?.weekStart).toBe(monday);
    // Monday 00:00 in Karachi but still Sunday in UTC: in neither locked week.
    expect(findLockingSubmission(submissions, new Date("2026-09-13T19:00:00Z"))).toBeNull();
    // Inside the approved week: locked.
    expect(findLockingSubmission(submissions, new Date("2026-09-15T12:00:00Z"))?.weekStart).toBe("2026-09-14");
    expect(findLockingSubmission([], new Date())).toBeNull();
  });

  it("detects weeks that have not started yet in the viewer's zone", () => {
    const sundayEvening = new Date("2026-09-13T20:00:00Z");

    expect(isFutureWeek("2026-09-14", sundayEvening, "UTC")).toBe(true);
    expect(isFutureWeek("2026-09-14", sundayEvening, "America/Los_Angeles")).toBe(true);
    // Already Monday 01:00 in Karachi.
    expect(isFutureWeek("2026-09-14", sundayEvening, "Asia/Karachi")).toBe(false);
    expect(isFutureWeek(monday, sundayEvening, "UTC")).toBe(false);
    expect(isFutureWeek("2026-09-21", sundayEvening, "Pacific/Kiritimati")).toBe(true);
  });

  it("lists recent weeks and labels day headers", () => {
    expect(recentWeekStarts("2026-09-10", 3)).toEqual(["2026-09-07", "2026-08-31", "2026-08-24"]);
    expect(recentWeekStarts("2026-09-07", 1)).toEqual(["2026-09-07"]);
    expect(recentWeekStarts("2026-09-07", 0)).toEqual([]);
    expect(formatDayHeader("2026-09-07", "en-US")).toBe("Mon, Sep 7");
    expect(formatDayHeader("2026-12-31", "en-US")).toBe("Thu, Dec 31");
  });
});

describe("weekUtcWindow", () => {
  it("returns the seven days and a ±26h window around the week", () => {
    const { days, from, to } = weekUtcWindow("2026-09-07");

    expect(days).toEqual(weekDayKeys("2026-09-07"));
    expect(from.toISOString()).toBe("2026-09-05T22:00:00.000Z");
    expect(to.toISOString()).toBe("2026-09-15T02:00:00.000Z");
  });

  it("covers the week's first and last instants in the extreme zones", () => {
    const { from, to } = weekUtcWindow("2026-09-07");

    // Monday 00:00 in Kiritimati (UTC+14) is Sunday 10:00Z.
    expect(new Date("2026-09-06T10:00:00Z") >= from).toBe(true);
    // Sunday 23:59:59 in Etc/GMT+12 (UTC-12) is Monday 11:59:59Z.
    expect(new Date("2026-09-14T11:59:59Z") < to).toBe(true);
  });
});

describe("aggregateByUser", () => {
  const days = weekDayKeys("2026-09-07");

  it("sums per user per day and per week, seeding zero rows", () => {
    const totals = aggregateByUser(
      [
        { userId: "u1", startedAt: "2026-09-07T09:00:00Z", durationSeconds: 3600 },
        { userId: "u1", startedAt: "2026-09-07T13:00:00Z", durationSeconds: 1800 },
        { userId: "u2", startedAt: "2026-09-09T09:00:00Z", durationSeconds: 900 },
        // Next week: ignored.
        { userId: "u1", startedAt: "2026-09-14T00:00:00Z", durationSeconds: 999 },
      ],
      days,
      "UTC",
      ["u1", "u2", "u3"],
    );

    expect(totals.u1.byDay["2026-09-07"]).toBe(5400);
    expect(totals.u1.week).toBe(5400);
    expect(totals.u2.byDay["2026-09-09"]).toBe(900);
    expect(totals.u2.week).toBe(900);
    expect(totals.u3.week).toBe(0);
    expect(Object.keys(totals.u3.byDay)).toEqual(days);
    expect(Object.keys(totals).sort()).toEqual(["u1", "u2", "u3"]);
  });

  it("buckets by the given zone and adds rows for unseeded users", () => {
    const totals = aggregateByUser(
      [{ userId: "u9", startedAt: "2026-09-06T23:30:00Z", durationSeconds: 600 }],
      days,
      "Asia/Karachi",
    );

    // 23:30Z on Sunday the 6th is already Monday the 7th in Karachi.
    expect(totals.u9.byDay["2026-09-07"]).toBe(600);
    expect(totals.u9.week).toBe(600);
    expect(aggregateByUser([], days, "UTC")).toEqual({});
  });
});

describe("statusCountsFrom", () => {
  it("fills every status with zero and sums rows", () => {
    expect(statusCountsFrom([])).toEqual({ SUBMITTED: 0, APPROVED: 0, REJECTED: 0 });
    expect(
      statusCountsFrom([
        { status: "SUBMITTED", count: 3 },
        { status: "REJECTED", count: 1 },
        { status: "SUBMITTED", count: 2 },
      ]),
    ).toEqual({ SUBMITTED: 5, APPROVED: 0, REJECTED: 1 });
  });
});

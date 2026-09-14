/*
 * Pure date and duration helpers shared by the Timesheets UI and the
 * time-tracking API. No React, no Prisma, safe on both server and client.
 *
 * Conventions:
 * - A "day key" is a calendar date string "YYYY-MM-DD" in a given IANA time
 *   zone. Entries are bucketed into days by the key of their start instant.
 * - Weeks start on Monday.
 */

export const SECONDS_PER_MINUTE = 60;
export const SECONDS_PER_HOUR = 3600;
export const MAX_ENTRY_SECONDS = 24 * SECONDS_PER_HOUR;

export type DayKey = string;

const DAY_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const CLOCK_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)$/;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function dayKeyFormatter(timeZone: string | undefined) {
  const cacheKey = timeZone ?? "local";
  let formatter = formatterCache.get(cacheKey);

  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formatterCache.set(cacheKey, formatter);
  }

  return formatter;
}

/** True when `timeZone` is an IANA zone the runtime understands. */
export function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Calendar date of `date` in `timeZone` (or the runtime's local zone). */
export function toDayKey(date: Date, timeZone?: string): DayKey {
  const parts = dayKeyFormatter(timeZone).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function isDayKey(value: string): value is DayKey {
  if (!DAY_KEY_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));

  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

/** Adds whole calendar days to a day key without touching time zones. */
export function addDaysToKey(key: DayKey, days: number): DayKey {
  const [year, month, day] = key.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));

  return shifted.toISOString().slice(0, 10);
}

/** ISO weekday of a day key: 1 = Monday … 7 = Sunday. */
export function isoWeekday(key: DayKey) {
  const [year, month, day] = key.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  return weekday === 0 ? 7 : weekday;
}

/** Monday of the week containing `key`. */
export function startOfWeekKey(key: DayKey): DayKey {
  return addDaysToKey(key, 1 - isoWeekday(key));
}

/** The seven day keys of the week starting at `mondayKey`. */
export function weekDayKeys(mondayKey: DayKey): DayKey[] {
  return Array.from({ length: 7 }, (_, index) => addDaysToKey(mondayKey, index));
}

/**
 * The week's day keys plus a UTC instant window that contains every instant
 * whose calendar date in any IANA zone (UTC-12..UTC+14) is one of those days.
 * A database prefilter only: callers still bucket by day key in the viewer's
 * zone, which drops the neighbours the buffer lets through.
 */
export function weekUtcWindow(mondayKey: DayKey) {
  const days = weekDayKeys(mondayKey);
  const buffer = 26 * SECONDS_PER_HOUR * 1000;
  const from = new Date(Date.parse(`${mondayKey}T00:00:00Z`) - buffer);
  const to = new Date(Date.parse(`${addDaysToKey(mondayKey, 7)}T00:00:00Z`) + buffer);

  return { days, from, to };
}

/**
 * Local-time Date for a day key at an optional "HH:mm" clock time.
 * Used in the browser to turn form values into instants.
 */
export function localDateFromKey(key: DayKey, clock?: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  const match = clock ? CLOCK_PATTERN.exec(clock) : null;
  const hours = match ? Number(match[1]) : 0;
  const minutes = match ? Number(match[2]) : 0;

  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

export function isClockTime(value: string) {
  return CLOCK_PATTERN.test(value);
}

/** "HH:mm" (24h) of an instant in the local zone, for time inputs. */
export function toClockInput(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/**
 * Parses a human duration into seconds. Accepts "1h 30m", "1h30m", "90m",
 * "1.5h", "1:30" (h:mm), "2h", and a bare number (minutes). Returns null
 * for anything unrecognised or non-positive.
 */
export function parseDuration(input: string): number | null {
  const text = input.trim().toLowerCase();

  if (!text) {
    return null;
  }

  const clock = /^(\d{1,3}):([0-5]\d)$/.exec(text);

  if (clock) {
    return Number(clock[1]) * SECONDS_PER_HOUR + Number(clock[2]) * SECONDS_PER_MINUTE || null;
  }

  if (/^\d+(\.\d+)?$/.test(text)) {
    const minutes = Number(text);
    return minutes > 0 ? Math.round(minutes * SECONDS_PER_MINUTE) : null;
  }

  const unitPattern = /(\d+(?:\.\d+)?)\s*(hours|hour|hrs|hr|h|minutes|minute|mins|min|m)(?![a-z])/g;
  let total = 0;
  let matchedLength = 0;
  let match: RegExpExecArray | null;

  while ((match = unitPattern.exec(text))) {
    const amount = Number(match[1]);
    const unit = match[2];
    total += unit.startsWith("h") ? amount * SECONDS_PER_HOUR : amount * SECONDS_PER_MINUTE;
    matchedLength += match[0].length;
  }

  const unmatched = text.replace(unitPattern, "").replace(/[\s,]+/g, "");

  if (matchedLength === 0 || unmatched.length > 0) {
    return null;
  }

  const seconds = Math.round(total);

  return seconds > 0 ? seconds : null;
}

/** "1h 30m", "45m", "<1m" for a few seconds, or "0m". Seconds are dropped. */
export function formatDuration(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / SECONDS_PER_HOUR);
  const minutes = Math.floor((total % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);

  if (total > 0 && total < SECONDS_PER_MINUTE) {
    return "<1m";
  }

  if (hours && minutes) {
    return `${hours}h ${minutes}m`;
  }

  if (hours) {
    return `${hours}h`;
  }

  return `${minutes}m`;
}

/** "0:12:34" style elapsed time for a running timer. */
export function formatElapsed(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / SECONDS_PER_HOUR);
  const minutes = Math.floor((total % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const rest = total % SECONDS_PER_MINUTE;

  return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

/** Whole seconds between two instants, never negative. */
export function secondsBetween(start: Date, end: Date) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
}

// ---------------------------------------------------------------------------
// Weekly aggregation
// ---------------------------------------------------------------------------

export interface AggregatableEntry {
  taskId: string;
  startedAt: string | Date;
  durationSeconds: number;
}

export interface TimesheetTotals {
  /** taskId → dayKey → seconds */
  byTaskDay: Record<string, Record<DayKey, number>>;
  /** taskId → seconds */
  byTask: Record<string, number>;
  /** dayKey → seconds */
  byDay: Record<DayKey, number>;
  week: number;
}

/**
 * Sums entry durations per task per day. An entry belongs to the day its
 * start instant falls on in `timeZone`. Entries outside `dayKeys` are ignored.
 */
export function aggregateEntries(
  entries: AggregatableEntry[],
  dayKeys: DayKey[],
  timeZone?: string,
): TimesheetTotals {
  const allowed = new Set(dayKeys);
  const byTaskDay: TimesheetTotals["byTaskDay"] = {};
  const byTask: TimesheetTotals["byTask"] = {};
  const byDay: TimesheetTotals["byDay"] = {};
  let week = 0;

  for (const key of dayKeys) {
    byDay[key] = 0;
  }

  for (const entry of entries) {
    const started = entry.startedAt instanceof Date ? entry.startedAt : new Date(entry.startedAt);
    const key = toDayKey(started, timeZone);

    if (!allowed.has(key)) {
      continue;
    }

    const seconds = Math.max(0, entry.durationSeconds);
    const taskDays = (byTaskDay[entry.taskId] ??= {});

    taskDays[key] = (taskDays[key] ?? 0) + seconds;
    byTask[entry.taskId] = (byTask[entry.taskId] ?? 0) + seconds;
    byDay[key] += seconds;
    week += seconds;
  }

  return { byTaskDay, byTask, byDay, week };
}

export interface UserAggregatableEntry {
  userId: string;
  startedAt: string | Date;
  durationSeconds: number;
}

export interface UserWeekTotals {
  /** dayKey → seconds, every day of the week present */
  byDay: Record<DayKey, number>;
  week: number;
}

/**
 * Per-user day and week totals, bucketed like aggregateEntries. Every id in
 * `userIds` gets a row (all zeros when they logged nothing); users that only
 * appear in `entries` get one too. Entries outside `dayKeys` are ignored.
 */
export function aggregateByUser(
  entries: readonly UserAggregatableEntry[],
  dayKeys: DayKey[],
  timeZone?: string,
  userIds: readonly string[] = [],
): Record<string, UserWeekTotals> {
  const allowed = new Set(dayKeys);
  const totals: Record<string, UserWeekTotals> = {};

  const rowFor = (userId: string) =>
    (totals[userId] ??= {
      byDay: Object.fromEntries(dayKeys.map((key) => [key, 0])),
      week: 0,
    });

  for (const userId of userIds) {
    rowFor(userId);
  }

  for (const entry of entries) {
    const started = entry.startedAt instanceof Date ? entry.startedAt : new Date(entry.startedAt);
    const key = toDayKey(started, timeZone);

    if (!allowed.has(key)) {
      continue;
    }

    const row = rowFor(entry.userId);
    const seconds = Math.max(0, entry.durationSeconds);

    row.byDay[key] += seconds;
    row.week += seconds;
  }

  return totals;
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

function keyToUtcDate(key: DayKey) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** "Sep 7 – Sep 13, 2026" or "Dec 29, 2025 – Jan 4, 2026". */
export function formatWeekRange(mondayKey: DayKey, locale?: string) {
  const start = keyToUtcDate(mondayKey);
  const end = keyToUtcDate(addDaysToKey(mondayKey, 6));
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();

  const monthDay = new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
  const monthDayYear = new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return sameYear
    ? `${monthDay.format(start)} – ${monthDayYear.format(end)}`
    : `${monthDayYear.format(start)} – ${monthDayYear.format(end)}`;
}

/** { weekday: "Mon", day: "7" } for a column header. */
export function dayHeaderParts(key: DayKey, locale?: string) {
  const date = keyToUtcDate(key);

  return {
    weekday: new Intl.DateTimeFormat(locale, { timeZone: "UTC", weekday: "short" }).format(date),
    day: String(date.getUTCDate()),
  };
}

/** "Tuesday, Sep 8" for dialog titles. */
export function formatDayLong(key: DayKey, locale?: string) {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(keyToUtcDate(key));
}

/** "Mon, Sep 7" for grid column headers. */
export function formatDayHeader(key: DayKey, locale?: string) {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(keyToUtcDate(key));
}

// ---------------------------------------------------------------------------
// Timesheet submissions (approval workflow)
// ---------------------------------------------------------------------------

export type TimesheetStatusValue = "SUBMITTED" | "APPROVED" | "REJECTED";

/** Reference working day and week for the capacity bars (no per-user schedule exists). */
export const DAY_CAPACITY_SECONDS = 8 * SECONDS_PER_HOUR;
export const WEEK_CAPACITY_SECONDS = 40 * SECONDS_PER_HOUR;

/** Submitted and approved weeks may not be changed by their owner. */
export function isLockedStatus(status: TimesheetStatusValue | null | undefined) {
  return status === "SUBMITTED" || status === "APPROVED";
}

export type TimesheetStatusCounts = Record<TimesheetStatusValue, number>;

/** Zero-filled per-status counts from grouped rows, so every key always exists. */
export function statusCountsFrom(
  rows: ReadonlyArray<{ status: TimesheetStatusValue; count: number }>,
): TimesheetStatusCounts {
  const counts: TimesheetStatusCounts = { SUBMITTED: 0, APPROVED: 0, REJECTED: 0 };

  for (const row of rows) {
    counts[row.status] += row.count;
  }

  return counts;
}

/**
 * True when `instant` falls on one of the seven days of the week starting at
 * `weekStartKey`, judged by the calendar date in `timeZone`. This is the same
 * rule the timesheet uses to bucket entries into days, so an entry is locked
 * exactly when it would show up inside a locked week.
 */
export function weekContainsInstant(weekStartKey: DayKey, timeZone: string, instant: Date) {
  return startOfWeekKey(toDayKey(instant, timeZone)) === weekStartKey;
}

/**
 * Inclusive day-key range that contains the Monday of `instant`'s week in
 * every time zone. Zones lie within UTC-12..UTC+14, so the local date is at
 * most one day away from the UTC date, and that day's Monday at most six
 * days earlier. Used to narrow the database query before the exact check.
 */
export function lockCandidateRange(instant: Date) {
  const utcKey = toDayKey(instant, "UTC");

  return { from: addDaysToKey(utcKey, -7), to: addDaysToKey(utcKey, 1) };
}

export interface LockCandidate {
  weekStart: DayKey;
  timeZone: string;
  status: TimesheetStatusValue;
}

/** The submitted or approved submission whose week contains `instant`, if any. */
export function findLockingSubmission<T extends LockCandidate>(
  submissions: readonly T[],
  instant: Date,
): T | null {
  for (const submission of submissions) {
    if (
      isLockedStatus(submission.status) &&
      weekContainsInstant(submission.weekStart, submission.timeZone, instant)
    ) {
      return submission;
    }
  }

  return null;
}

/** True when no day of the week has started yet in `timeZone`. */
export function isFutureWeek(weekStartKey: DayKey, now: Date, timeZone: string) {
  return weekStartKey > toDayKey(now, timeZone);
}

/** Mondays of the current week and the `count - 1` weeks before it, newest first. */
export function recentWeekStarts(todayKey: DayKey, count: number): DayKey[] {
  const thisWeek = startOfWeekKey(todayKey);

  return Array.from({ length: Math.max(0, count) }, (_, index) =>
    addDaysToKey(thisWeek, -7 * index),
  );
}

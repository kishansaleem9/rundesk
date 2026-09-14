/*
 * Client helpers for the timer routes, shared by the chat shell (task detail
 * panel, top bar) and /timesheets. Thin fetch wrappers plus pure helpers; no
 * React.
 */

import { ApiError, api } from "./api";
import { startOfWeekKey, toDayKey } from "./time";
import type { Task, TimeEntry } from "./types";

export interface TimerStartResult {
  /** The new timer, or null when another running timer blocked the start. */
  timer: TimeEntry | null;
  /** The previous timer, finished, when `replaceRunning` stopped one. */
  stopped: TimeEntry | null;
  /** The running timer that blocked the start (409 TIMER_RUNNING). */
  conflict: TimeEntry | null;
}

/**
 * POST /api/timer/start. TIMER_RUNNING comes back as `conflict` so the caller
 * can ask and retry with `replaceRunning`; every other failure throws an
 * ApiError (403 not allowed, 404, 409 TIMESHEET_LOCKED with `body.submission`).
 */
export async function requestTimerStart(
  taskId: string,
  replaceRunning = false,
): Promise<TimerStartResult> {
  try {
    const result = await api<{ timer: TimeEntry; stopped: TimeEntry | null }>(
      "/api/timer/start",
      { method: "POST", body: JSON.stringify({ taskId, replaceRunning }) },
    );

    return { timer: result.timer, stopped: result.stopped, conflict: null };
  } catch (reason) {
    if (
      reason instanceof ApiError &&
      reason.status === 409 &&
      reason.body.code === "TIMER_RUNNING" &&
      reason.body.running
    ) {
      return { timer: null, stopped: null, conflict: reason.body.running as TimeEntry };
    }

    throw reason;
  }
}

/** POST /api/timer/stop → the finished entry, or null when nothing was running. */
export async function requestTimerStop(): Promise<TimeEntry | null> {
  const result = await api<{ entry: TimeEntry | null }>("/api/timer/stop", {
    method: "POST",
    body: JSON.stringify({}),
  });

  return result.entry;
}

/** GET /api/timer → the caller's running timer, or null. */
export async function fetchActiveTimer(): Promise<TimeEntry | null> {
  const result = await api<{ timer: TimeEntry | null }>("/api/timer");

  return result.timer;
}

export const TRACK_TIME_FORBIDDEN =
  "Only assignees, the task creator or a workspace admin can track time on this task.";

/** Human message for a failed start or stop. Server 409 messages already explain the lock. */
export function timerErrorMessage(reason: unknown, fallback: string) {
  if (reason instanceof ApiError) {
    if (reason.status === 403) {
      return TRACK_TIME_FORBIDDEN;
    }

    if (reason.status === 404) {
      return "This task no longer exists.";
    }

    return reason.message;
  }

  return reason instanceof Error && reason.message ? reason.message : fallback;
}

/** Mirrors requireTaskTimeAccess on the server: assignee, creator or workspace admin. */
export function canTrackTime(
  task: Pick<Task, "createdById" | "assignees">,
  userId: string,
  canManageWorkspace: boolean,
) {
  return (
    canManageWorkspace ||
    task.createdById === userId ||
    task.assignees.some((assignee) => assignee.userId === userId)
  );
}

/** `/timesheets?week=<Monday of the week containing date>` in the browser's zone. */
export function timesheetsHref(date = new Date()) {
  return `/timesheets?week=${startOfWeekKey(toDayKey(date))}`;
}

import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/rundesk/api";
import {
  TRACK_TIME_FORBIDDEN,
  canTrackTime,
  fetchActiveTimer,
  requestTimerStart,
  requestTimerStop,
  timerErrorMessage,
  timesheetsHref,
} from "@/lib/rundesk/timer";
import type { TimeEntry } from "@/lib/rundesk/types";

const timer = {
  id: "t1",
  taskId: "task-1",
  userId: "u1",
  entryType: "TIMER",
  startedAt: "2026-09-14T09:00:00.000Z",
  endedAt: null,
  durationSeconds: 0,
  task: { id: "task-1", title: "Design review", status: "TODO", channel: null },
} as unknown as TimeEntry;

function respond(status: number, body: unknown) {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestTimerStart", () => {
  it("returns the new timer on success", async () => {
    const fetchMock = respond(201, { timer, stopped: null, serverTime: "x" });
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestTimerStart("task-1");

    expect(result).toEqual({ timer, stopped: null, conflict: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/timer/start");
    expect(JSON.parse(String(init.body))).toEqual({ taskId: "task-1", replaceRunning: false });
  });

  it("reports another running timer as a conflict instead of throwing", async () => {
    vi.stubGlobal(
      "fetch",
      respond(409, { error: "A timer is already running", code: "TIMER_RUNNING", running: timer }),
    );

    const result = await requestTimerStart("task-2");

    expect(result.conflict).toEqual(timer);
    expect(result.timer).toBeNull();
  });

  it("throws an ApiError for a locked week or a forbidden task", async () => {
    vi.stubGlobal(
      "fetch",
      respond(409, {
        error: "This week's timesheet is pending approval. Withdraw it to make changes",
        code: "TIMESHEET_LOCKED",
        submission: { weekStart: "2026-09-14", status: "SUBMITTED" },
      }),
    );

    const locked = await requestTimerStart("task-1").catch((reason: unknown) => reason);
    expect(locked).toBeInstanceOf(ApiError);
    expect((locked as ApiError).status).toBe(409);
    expect((locked as ApiError).body.code).toBe("TIMESHEET_LOCKED");

    vi.stubGlobal("fetch", respond(403, { error: "You can only track time on tasks assigned to you" }));

    const forbidden = await requestTimerStart("task-1").catch((reason: unknown) => reason);
    expect((forbidden as ApiError).status).toBe(403);
  });
});

describe("requestTimerStop / fetchActiveTimer", () => {
  it("returns the finished entry or null", async () => {
    vi.stubGlobal("fetch", respond(200, { entry: { ...timer, durationSeconds: 65 } }));
    expect((await requestTimerStop())?.durationSeconds).toBe(65);

    vi.stubGlobal("fetch", respond(200, { entry: null }));
    expect(await requestTimerStop()).toBeNull();
  });

  it("returns the running timer or null", async () => {
    vi.stubGlobal("fetch", respond(200, { timer, serverTime: "x" }));
    expect(await fetchActiveTimer()).toEqual(timer);

    vi.stubGlobal("fetch", respond(200, { timer: null, serverTime: "x" }));
    expect(await fetchActiveTimer()).toBeNull();
  });
});

describe("timerErrorMessage", () => {
  it("maps statuses to readable messages and keeps server text otherwise", () => {
    expect(timerErrorMessage(new ApiError("nope", 403, {}), "fallback")).toBe(TRACK_TIME_FORBIDDEN);
    expect(timerErrorMessage(new ApiError("nope", 404, {}), "fallback")).toBe(
      "This task no longer exists.",
    );
    expect(timerErrorMessage(new ApiError("Week is locked", 409, {}), "fallback")).toBe(
      "Week is locked",
    );
    expect(timerErrorMessage(new Error("boom"), "fallback")).toBe("boom");
    expect(timerErrorMessage("weird", "fallback")).toBe("fallback");
  });
});

describe("canTrackTime", () => {
  const task = {
    createdById: "creator",
    assignees: [{ userId: "worker" }],
  } as unknown as Parameters<typeof canTrackTime>[0];

  it("allows admins, creators and assignees only", () => {
    expect(canTrackTime(task, "creator", false)).toBe(true);
    expect(canTrackTime(task, "worker", false)).toBe(true);
    expect(canTrackTime(task, "stranger", true)).toBe(true);
    expect(canTrackTime(task, "stranger", false)).toBe(false);
  });
});

describe("timesheetsHref", () => {
  it("links to the Monday of the week containing the date", () => {
    expect(timesheetsHref(new Date(2026, 8, 16, 12))).toBe("/timesheets?week=2026-09-14");
    expect(timesheetsHref(new Date(2026, 8, 14, 0, 30))).toBe("/timesheets?week=2026-09-14");
  });
});

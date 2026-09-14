"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpDown,
  CircleCheck,
  Clock,
  LayoutGrid,
  List,
  LoaderCircle,
  Plus,
  Send,
  Square,
  SquareCheck,
  Timer,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError, api } from "@/lib/rundesk/api";
import { useStoredFlag, useStoredValue, writeStorage } from "@/lib/rundesk/storage";
import {
  formatDuration,
  formatElapsed,
  isFutureWeek,
  secondsBetween,
  startOfWeekKey,
  toDayKey,
  type DayKey,
} from "@/lib/rundesk/time";
import { requestTimerStart } from "@/lib/rundesk/timer";
import {
  buildTimesheetSearch,
  parseTimesheetSearch,
  type TimesheetTab,
} from "@/lib/rundesk/timesheet-url";
import type {
  TimeEntry,
  TimesheetApprovalsResponse,
  TimesheetResponse,
  TimesheetStatusCounts,
  TimesheetTask,
  WorkspaceMembersResponse,
} from "@/lib/rundesk/types";

import AllTimesheetsView from "./AllTimesheetsView";
import ApprovalsView from "./ApprovalsView";
import CellEntriesDialog from "./CellEntriesDialog";
import { SubmissionBanner, SubmissionPill } from "./SubmissionStatus";
import SubmitDialog from "./SubmitDialog";
import TimeEntriesList from "./TimeEntriesList";
import TimeEntryDialog from "./TimeEntryDialog";
import TimesheetGrid from "./TimesheetGrid";
import { useFlash } from "./useFlash";
import WeekNav from "./WeekNav";

type Dialog =
  | { kind: "add"; taskId: string | null; dayKey: DayKey }
  | { kind: "edit"; entry: TimeEntry }
  | { kind: "cell"; taskId: string; dayKey: DayKey }
  | { kind: "submit" }
  | null;

type View = "grid" | "list";
type Sort = "added" | "name";

// Persisted UI preferences (see lib/rundesk/storage.ts).
const VIEW_KEY = "rundesk:timesheets:view";
const TRACKED_KEY = "rundesk:timesheets:tracked-only";
const COMPLETED_KEY = "rundesk:timesheets:show-completed";
const SORT_KEY = "rundesk:timesheets:sort";

function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function fetchTimesheet(weekStart: DayKey, timeZone: string, userId: string | null) {
  const params = new URLSearchParams({ week: weekStart, tz: timeZone });

  if (userId) {
    params.set("userId", userId);
  }

  return api<TimesheetResponse>(`/api/timesheets?${params}`);
}

/**
 * Deep-link state (?tab=&user=&week=), read once on the client. The server
 * render and the first client render both show the loading state, which does
 * not depend on it, so a different value on the client is hydration-safe.
 */
function readInitialUrl() {
  return parseTimesheetSearch(typeof window === "undefined" ? "" : window.location.search);
}

/** Pending submissions in the workspace, for the Approvals badge (admins only). */
async function fetchPendingCount() {
  const result = await api<TimesheetApprovalsResponse>(
    "/api/timesheets/approvals?status=SUBMITTED",
  );

  return result.counts.SUBMITTED;
}

export default function TimesheetsView() {
  const [initialUrl] = useState(readInitialUrl);
  const [timeZone] = useState(browserTimeZone);
  const [weekStart, setWeekStart] = useState<DayKey>(
    () => initialUrl.week ?? startOfWeekKey(toDayKey(new Date())),
  );
  const [viewUserId, setViewUserId] = useState<string | null>(initialUrl.user);
  const [tab, setTab] = useState<TimesheetTab>(initialUrl.tab);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const [data, setData] = useState<TimesheetResponse | null>(null);
  const [members, setMembers] = useState<WorkspaceMembersResponse["members"]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, flash] = useFlash();
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [submitError, setSubmitError] = useState("");
  const [taskFilter, setTaskFilter] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const storedView = useStoredValue(VIEW_KEY);
  const view: View = storedView === "list" ? "list" : "grid";
  const trackedOnly = useStoredFlag(TRACKED_KEY);
  const showCompleted = useStoredFlag(COMPLETED_KEY);
  const sort: Sort = useStoredValue(SORT_KEY) === "name" ? "name" : "added";

  const todayKey = toDayKey(new Date(now), timeZone);
  const thisWeek = startOfWeekKey(todayKey);

  // Initial load and reload whenever the week or viewed user changes.
  useEffect(() => {
    let cancelled = false;

    fetchTimesheet(weekStart, timeZone, viewUserId)
      .then((next) => {
        if (cancelled) {
          return;
        }

        setData(next);
        setError("");

        if (next.viewer.canManageWorkspace) {
          fetchPendingCount()
            .then((count) => {
              if (!cancelled) {
                setPendingCount(count);
              }
            })
            .catch(() => {
              // The badge is a convenience; keep the last known value.
            });
        }
      })
      .catch((reason) => {
        if (cancelled) {
          return;
        }

        if (viewUserId && reason instanceof ApiError && reason.status === 403) {
          // A deep link to someone else's week that this viewer may not open:
          // fall back to their own timesheet instead of a dead end.
          setViewUserId(null);
          flash("Showing your own timesheet");
          return;
        }

        setError(reason instanceof Error ? reason.message : "Could not load the timesheet");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [weekStart, timeZone, viewUserId, flash]);

  /** Refresh after a mutation or when the tab regains focus. */
  const load = useCallback(async () => {
    try {
      const next = await fetchTimesheet(weekStart, timeZone, viewUserId);
      setData(next);
      setError("");

      if (next.viewer.canManageWorkspace) {
        fetchPendingCount()
          .then(setPendingCount)
          .catch(() => {
            // The badge is a convenience; keep the last known value.
          });
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load the timesheet");
    }
  }, [weekStart, timeZone, viewUserId]);

  // Admins can review other members' timesheets.
  const canManageWorkspace = data?.viewer.canManageWorkspace ?? false;
  const workspaceId = data?.workspace.id;
  // Members never see the admin tabs, whatever the URL says.
  const activeTab: TimesheetTab = canManageWorkspace ? tab : "mine";

  useEffect(() => {
    if (!canManageWorkspace || !workspaceId) {
      return;
    }

    let cancelled = false;

    api<WorkspaceMembersResponse>(
      `/api/workspace/members?workspaceId=${encodeURIComponent(workspaceId)}`,
    )
      .then((result) => {
        if (!cancelled) {
          setMembers(result.members);
        }
      })
      .catch(() => {
        // The picker is a convenience; the timesheet still works without it.
      });

    return () => {
      cancelled = true;
    };
  }, [canManageWorkspace, workspaceId]);

  // Tick once a second while a timer runs so elapsed time and totals move.
  const activeTimer = data?.activeTimer ?? null;

  useEffect(() => {
    if (!activeTimer) {
      return;
    }

    const timer = window.setInterval(() => setNow(Date.now()), 1000);

    return () => window.clearInterval(timer);
  }, [activeTimer]);

  // Refresh when the tab regains focus so a timer started elsewhere shows up.
  // The admin sub-views refetch on `focusTick`.
  useEffect(() => {
    const onFocus = () => {
      void load();
      setFocusTick((tick) => tick + 1);
    };

    window.addEventListener("focus", onFocus);

    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const handleCounts = useCallback((counts: TimesheetStatusCounts) => {
    setPendingCount(counts.SUBMITTED);
  }, []);

  // Keep the URL in step with the tab, the viewed member and the week so the
  // view can be shared or reloaded. replaceState: no history entries.
  useEffect(() => {
    if (!data) {
      return;
    }

    const search = buildTimesheetSearch({
      tab: activeTab,
      user: viewUserId,
      week: weekStart,
      thisWeek,
    });
    const next = `${window.location.pathname}${search}`;

    if (`${window.location.pathname}${window.location.search}` !== next) {
      window.history.replaceState(null, "", next);
    }
  }, [data, activeTab, viewUserId, weekStart, thisWeek]);

  function changeWeek(next: DayKey) {
    setWeekStart(next);
    setTaskFilter(null);
  }

  /** "Open" from the people grid or an approval row: jump to that person's week. */
  function openMemberWeek(userId: string, week: DayKey) {
    if (!data) {
      return;
    }

    setViewUserId(userId === data.viewer.id ? null : userId);
    changeWeek(week);
    setTab("mine");
  }

  const isOwnTimesheet = Boolean(data && data.viewer.id === data.user.id);
  const submission = data?.submission ?? null;
  const locked = data?.locked ?? false;
  const futureWeek = isFutureWeek(weekStart, new Date(now), timeZone);

  const runningSeconds = activeTimer
    ? secondsBetween(new Date(activeTimer.startedAt), new Date(now))
    : 0;

  const runningDayKey = activeTimer ? toDayKey(new Date(activeTimer.startedAt), timeZone) : null;
  const timerInWeek = Boolean(runningDayKey && data?.days.includes(runningDayKey));

  /** Server totals plus the live running timer, if it falls inside this week. */
  const totals = useMemo(() => {
    if (!data) {
      return null;
    }

    if (!activeTimer || !runningDayKey || !data.days.includes(runningDayKey)) {
      return data.totals;
    }

    const taskDays = { ...(data.totals.byTaskDay[activeTimer.taskId] ?? {}) };
    taskDays[runningDayKey] = (taskDays[runningDayKey] ?? 0) + runningSeconds;

    return {
      byTaskDay: { ...data.totals.byTaskDay, [activeTimer.taskId]: taskDays },
      byTask: {
        ...data.totals.byTask,
        [activeTimer.taskId]: (data.totals.byTask[activeTimer.taskId] ?? 0) + runningSeconds,
      },
      byDay: {
        ...data.totals.byDay,
        [runningDayKey]: (data.totals.byDay[runningDayKey] ?? 0) + runningSeconds,
      },
      week: data.totals.week + runningSeconds,
    };
  }, [data, activeTimer, runningDayKey, runningSeconds]);

  /**
   * Rows of the grid after the filter chips and sort. A task with time this
   * week (or a running timer) always shows; otherwise completed tasks are
   * hidden unless asked for, and "Tracked time" hides everything without time.
   */
  const visibleTasks = useMemo(() => {
    if (!data || !totals) {
      return [];
    }

    const hasTime = (task: TimesheetTask) =>
      (totals.byTask[task.id] ?? 0) > 0 || (timerInWeek && activeTimer?.taskId === task.id);

    const rows = data.tasks.filter((task) => {
      if (hasTime(task)) {
        return true;
      }

      if (trackedOnly || !task.assigned) {
        return false;
      }

      return task.status !== "COMPLETE" || showCompleted;
    });

    rows.sort(
      sort === "name"
        ? (a, b) => a.title.localeCompare(b.title)
        : (a, b) => b.createdAt.localeCompare(a.createdAt),
    );

    return rows;
  }, [data, totals, timerInWeek, activeTimer, trackedOnly, showCompleted, sort]);

  const entriesByCell = useMemo(() => {
    const map = new Map<string, TimeEntry[]>();

    for (const entry of data?.entries ?? []) {
      const key = `${entry.taskId}:${toDayKey(new Date(entry.startedAt), timeZone)}`;
      const list = map.get(key) ?? [];
      list.push(entry);
      map.set(key, list);
    }

    return map;
  }, [data, timeZone]);

  const taskById = useMemo(() => {
    const map = new Map<string, TimesheetTask>();

    for (const task of data?.tasks ?? []) {
      map.set(task.id, task);
    }

    return map;
  }, [data]);

  const listEntries = useMemo(
    () => (data?.entries ?? []).filter((entry) => !taskFilter || entry.taskId === taskFilter),
    [data, taskFilter],
  );

  async function startTimer(task: TimesheetTask) {
    setBusy(true);

    try {
      const first = await requestTimerStart(task.id, false);

      if (first.conflict) {
        const proceed = confirm(
          `A timer is already running for “${first.conflict.task.title}”. Stop it and start tracking “${task.title}”?`,
        );

        if (!proceed) {
          return;
        }

        await requestTimerStart(task.id, true);
      }

      await load();
      flash(`Tracking “${task.title}”`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not start the timer");
    } finally {
      setBusy(false);
    }
  }

  async function stopTimer() {
    setBusy(true);

    try {
      const result = await api<{ entry: TimeEntry | null }>("/api/timer/stop", {
        method: "POST",
        body: JSON.stringify({}),
      });

      await load();

      if (result.entry) {
        flash(`Saved ${formatDuration(result.entry.durationSeconds)} on “${result.entry.task.title}”`);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not stop the timer");
    } finally {
      setBusy(false);
    }
  }

  async function deleteEntry(entry: TimeEntry) {
    if (!confirm("Delete this time entry?")) {
      return;
    }

    setBusy(true);

    try {
      await api<void>(`/api/time-entries/${entry.id}`, { method: "DELETE" });
      await load();
      flash("Time entry deleted");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not delete the entry");
    } finally {
      setBusy(false);
    }
  }

  async function submitWeek(note: string) {
    setBusy(true);
    setSubmitError("");

    const resubmit = submission?.status === "REJECTED";

    try {
      await api("/api/timesheets/submit", {
        method: "POST",
        body: JSON.stringify({ week: weekStart, tz: timeZone, note: note || null }),
      });

      setDialog(null);
      await load();
      flash(resubmit ? "Resubmitted for approval" : "Submitted for approval");
    } catch (reason) {
      setSubmitError(reason instanceof Error ? reason.message : "Could not submit the week");
    } finally {
      setBusy(false);
    }
  }

  async function withdrawWeek() {
    if (
      !confirm(
        "Withdraw this week's submission? It will no longer be waiting for approval and you can edit it again.",
      )
    ) {
      return;
    }

    setBusy(true);

    try {
      await api<void>("/api/timesheets/withdraw", {
        method: "POST",
        body: JSON.stringify({ week: weekStart }),
      });

      await load();
      flash("Submission withdrawn");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not withdraw the submission");
    } finally {
      setBusy(false);
    }
  }

  function openCell(task: TimesheetTask, dayKey: DayKey) {
    const hasEntries = entriesByCell.has(`${task.id}:${dayKey}`);
    const hasRunning = activeTimer?.taskId === task.id && runningDayKey === dayKey;

    if (hasEntries || hasRunning) {
      setDialog({ kind: "cell", taskId: task.id, dayKey });
    } else if (isOwnTimesheet && !locked) {
      setDialog({ kind: "add", taskId: task.id, dayKey });
    }
  }

  function openAdd(taskId: string | null) {
    if (!data) {
      return;
    }

    setDialog({
      kind: "add",
      taskId,
      dayKey: data.days.includes(todayKey) ? todayKey : data.days[0],
    });
  }

  function viewTaskEntries(task: TimesheetTask) {
    setTaskFilter(task.id);
    writeStorage(VIEW_KEY, "list");
  }

  async function handleSaved(message: string) {
    setDialog(null);
    await load();
    flash(message);
  }

  if (loading && !data) {
    return (
      <div className="timesheets-page">
        <div className="timesheet-center">
          <LoaderCircle className="spin" size={22} />
          <span>Loading timesheet…</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="timesheets-page">
        <div className="timesheet-center">
          <p className="form-error">{error || "Timesheets are unavailable right now."}</p>
          <Link href="/" className="timesheet-back">
            <ArrowLeft size={15} />
            Back to Chat
          </Link>
        </div>
      </div>
    );
  }

  const cellDialogTask = dialog?.kind === "cell" ? taskById.get(dialog.taskId) : undefined;
  const filterTask = taskFilter ? taskById.get(taskFilter) : undefined;
  const filtersActive = trackedOnly || showCompleted;

  function renderPrimaryAction() {
    if (!isOwnTimesheet) {
      return null;
    }

    if (submission?.status === "SUBMITTED") {
      return (
        <button
          type="button"
          className="timesheet-action"
          onClick={withdrawWeek}
          disabled={busy}
          title="Take the week back so you can edit it"
        >
          <Undo2 size={14} aria-hidden="true" />
          Withdraw
        </button>
      );
    }

    if (submission?.status === "APPROVED") {
      return (
        <button type="button" className="timesheet-action is-approved" disabled>
          <CircleCheck size={14} aria-hidden="true" />
          Approved
        </button>
      );
    }

    const reason = futureWeek
      ? "This week hasn't started yet"
      : timerInWeek
        ? "Stop your timer before submitting"
        : undefined;

    return (
      <button
        type="button"
        className="primary-button timesheet-submit"
        onClick={() => {
          setSubmitError("");
          setDialog({ kind: "submit" });
        }}
        disabled={busy || Boolean(reason)}
        title={reason}
      >
        <Send size={13} aria-hidden="true" />
        {submission?.status === "REJECTED" ? "Resubmit" : "Submit for approval"}
      </button>
    );
  }

  return (
    <div className="timesheets-page">
      <header className="timesheet-topbar">
        <div className="timesheet-title">
          <Clock size={16} aria-hidden="true" />
          <b>Timesheets</b>
        </div>

        <nav
          className={canManageWorkspace ? "timesheet-tabs" : "timesheet-tabs is-single"}
          role="tablist"
          aria-label="Timesheet sections"
        >
          <button
            type="button"
            role="tab"
            id="timesheet-tab-mine"
            aria-selected={activeTab === "mine"}
            aria-controls="timesheet-panel-mine"
            className={activeTab === "mine" ? "is-active" : undefined}
            onClick={() => setTab("mine")}
          >
            {isOwnTimesheet ? "My timesheet" : `${data.user.name}’s timesheet`}
          </button>

          {canManageWorkspace && (
            <>
              <button
                type="button"
                role="tab"
                id="timesheet-tab-all"
                aria-selected={activeTab === "all"}
                aria-controls="timesheet-panel-all"
                className={activeTab === "all" ? "is-active" : undefined}
                onClick={() => setTab("all")}
              >
                All timesheets
              </button>
              <button
                type="button"
                role="tab"
                id="timesheet-tab-approvals"
                aria-selected={activeTab === "approvals"}
                aria-controls="timesheet-panel-approvals"
                className={activeTab === "approvals" ? "is-active" : undefined}
                aria-label={pendingCount ? `Approvals, ${pendingCount} pending` : undefined}
                onClick={() => setTab("approvals")}
              >
                Approvals
                {pendingCount ? (
                  <em className="timesheet-tab-badge">{pendingCount > 99 ? "99+" : pendingCount}</em>
                ) : null}
              </button>
            </>
          )}
        </nav>

        <Link href="/" className="timesheet-back">
          <ArrowLeft size={15} />
          <span>Back to Chat</span>
        </Link>

        <div className="timesheet-topbar-right">
          {activeTimer && (
            <div className="timesheet-running-pill" title={activeTimer.task.title}>
              <i aria-hidden="true" />
              <span className="timesheet-running-task">{activeTimer.task.title}</span>
              <strong>{formatElapsed(runningSeconds)}</strong>

              {isOwnTimesheet && (
                <button
                  type="button"
                  className="timesheet-stop"
                  onClick={stopTimer}
                  disabled={busy}
                  title="Stop timer"
                >
                  <Square size={12} />
                  Stop
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {activeTab === "mine" && (
      <div
        role="tabpanel"
        id="timesheet-panel-mine"
        aria-labelledby="timesheet-tab-mine"
        className="timesheet-panel"
      >
      <div className="timesheet-toolbar">
        <WeekNav weekStart={weekStart} todayKey={todayKey} onChange={changeWeek}>
          <SubmissionPill submission={submission} />
        </WeekNav>

        <div className="timesheet-toolbar-right">
          {canManageWorkspace && members.length > 1 && (
            <label className="timesheet-user-pick">
              <span>Viewing</span>
              <select
                value={viewUserId ?? data.viewer.id}
                onChange={(event) =>
                  setViewUserId(event.target.value === data.viewer.id ? null : event.target.value)
                }
              >
                {members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.userId === data.viewer.id ? "Me" : member.user.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="timesheet-week-total">
            <span>Week total</span>
            <strong>{formatDuration(totals?.week ?? 0)}</strong>
          </div>

          {isOwnTimesheet && (
            <button
              type="button"
              className="timesheet-action timesheet-add"
              onClick={() => openAdd(null)}
              disabled={!data.tasks.length || locked}
              title={locked ? "This week is locked" : undefined}
            >
              <Plus size={14} />
              Add time
            </button>
          )}

          {renderPrimaryAction()}
        </div>
      </div>

      <SubmissionBanner
        submission={submission}
        timeZoneMismatch={data.timeZoneMismatch}
        viewerTimeZone={timeZone}
        isOwnTimesheet={isOwnTimesheet}
      />

      {(error || notice) && (
        <p className={error ? "form-error timesheet-message" : "timesheet-message"}>
          {error || notice}
        </p>
      )}

      {!isOwnTimesheet && (
        <p className="timesheet-message">
          Viewing {data.user.name}’s timesheet. Timers can only be started by the person tracking.
        </p>
      )}

      <div className="timesheet-filters">
        {view === "grid" && (
          <div className="timesheet-chips" role="group" aria-label="Filters">
            <button
              type="button"
              className={trackedOnly ? "timesheet-chip is-active" : "timesheet-chip"}
              aria-pressed={trackedOnly}
              title="Only tasks with time this week"
              onClick={() => writeStorage(TRACKED_KEY, trackedOnly ? null : "true")}
            >
              <Timer size={13} aria-hidden="true" />
              Tracked time
            </button>

            <button
              type="button"
              className={showCompleted ? "timesheet-chip is-active" : "timesheet-chip"}
              aria-pressed={showCompleted}
              title="Include completed tasks without time this week"
              onClick={() => writeStorage(COMPLETED_KEY, showCompleted ? null : "true")}
            >
              <SquareCheck size={13} aria-hidden="true" />
              Completed tasks
            </button>

            <div className="timesheet-sort" role="group" aria-label="Sort tasks">
              <ArrowUpDown size={12} aria-hidden="true" />
              <span>Sort</span>
              <button
                type="button"
                aria-pressed={sort === "added"}
                onClick={() => writeStorage(SORT_KEY, "added")}
              >
                Date added
              </button>
              <button
                type="button"
                aria-pressed={sort === "name"}
                onClick={() => writeStorage(SORT_KEY, "name")}
              >
                Name
              </button>
            </div>
          </div>
        )}

        <div className="timesheet-view-toggle" role="tablist" aria-label="View">
          <button
            type="button"
            role="tab"
            aria-selected={view === "grid"}
            className={view === "grid" ? "is-active" : undefined}
            onClick={() => writeStorage(VIEW_KEY, "grid")}
          >
            <LayoutGrid size={13} aria-hidden="true" />
            Timesheet
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "list"}
            className={view === "list" ? "is-active" : undefined}
            onClick={() => writeStorage(VIEW_KEY, "list")}
          >
            <List size={13} aria-hidden="true" />
            Time entries
          </button>
        </div>
      </div>

      {view === "list" ? (
        <TimeEntriesList
          entries={listEntries}
          days={data.days}
          todayKey={todayKey}
          timeZone={timeZone}
          running={timerInWeek && activeTimer ? { entry: activeTimer, seconds: runningSeconds } : null}
          taskFilter={filterTask ? { id: filterTask.id, title: filterTask.title } : null}
          canEdit={(isOwnTimesheet || canManageWorkspace) && !locked}
          canStop={isOwnTimesheet}
          busy={busy}
          onEdit={(entry) => setDialog({ kind: "edit", entry })}
          onDelete={deleteEntry}
          onStop={stopTimer}
          onClearTaskFilter={() => setTaskFilter(null)}
        />
      ) : data.tasks.length === 0 ? (
        <div className="timesheet-empty">
          <strong>No tasks assigned {isOwnTimesheet ? "to you" : `to ${data.user.name}`} yet</strong>
          <p>
            Tasks assigned in Chat appear here automatically. Time can be tracked once a task is
            assigned.
          </p>
        </div>
      ) : visibleTasks.length === 0 ? (
        <div className="timesheet-empty timesheet-empty-filtered">
          <strong>No tasks match these filters</strong>
          <p>
            {trackedOnly
              ? "Nothing has time this week yet. Turn off “Tracked time” to see every assigned task."
              : "Every assigned task is complete. Turn on “Completed tasks” to see them."}
          </p>
          {filtersActive && (
            <button
              type="button"
              className="timesheet-action"
              onClick={() => {
                writeStorage(TRACKED_KEY, null);
                writeStorage(COMPLETED_KEY, null);
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <TimesheetGrid
          tasks={visibleTasks}
          days={data.days}
          todayKey={todayKey}
          totals={totals ?? data.totals}
          activeTimer={activeTimer}
          runningDayKey={runningDayKey}
          canTrack={isOwnTimesheet}
          locked={locked}
          busy={busy}
          onStart={startTimer}
          onStop={stopTimer}
          onCell={openCell}
          onAddTime={(task) => openAdd(task.id)}
          onViewEntries={viewTaskEntries}
        />
      )}
      </div>
      )}

      {activeTab === "all" && (
        <AllTimesheetsView
          weekStart={weekStart}
          todayKey={todayKey}
          timeZone={timeZone}
          viewerId={data.viewer.id}
          refreshKey={focusTick}
          onChangeWeek={changeWeek}
          onOpen={openMemberWeek}
          onPendingCount={setPendingCount}
        />
      )}

      {activeTab === "approvals" && (
        <ApprovalsView
          viewerId={data.viewer.id}
          todayKey={todayKey}
          refreshKey={focusTick}
          onCounts={handleCounts}
          onOpen={openMemberWeek}
        />
      )}

      {dialog?.kind === "add" && (
        <TimeEntryDialog
          tasks={data.tasks.filter((task) => task.assigned || task.id === dialog.taskId)}
          initialTaskId={dialog.taskId}
          initialDay={dialog.dayKey}
          onClose={() => setDialog(null)}
          onSaved={() => handleSaved("Time added")}
        />
      )}

      {dialog?.kind === "edit" && (
        <TimeEntryDialog
          tasks={data.tasks}
          entry={dialog.entry}
          initialTaskId={dialog.entry.taskId}
          initialDay={toDayKey(new Date(dialog.entry.startedAt), timeZone)}
          onClose={() => setDialog(null)}
          onSaved={() => handleSaved("Time entry updated")}
        />
      )}

      {dialog?.kind === "cell" && cellDialogTask && (
        <CellEntriesDialog
          task={cellDialogTask}
          dayKey={dialog.dayKey}
          entries={entriesByCell.get(`${dialog.taskId}:${dialog.dayKey}`) ?? []}
          running={
            activeTimer?.taskId === dialog.taskId && runningDayKey === dialog.dayKey
              ? { entry: activeTimer, seconds: runningSeconds }
              : null
          }
          canEdit={isOwnTimesheet || canManageWorkspace}
          canAdd={isOwnTimesheet && !locked}
          locked={locked}
          busy={busy}
          onAdd={() => setDialog({ kind: "add", taskId: dialog.taskId, dayKey: dialog.dayKey })}
          onEdit={(entry) => setDialog({ kind: "edit", entry })}
          onDelete={deleteEntry}
          onStop={stopTimer}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog?.kind === "submit" && (
        <SubmitDialog
          weekStart={weekStart}
          totalSeconds={data.totals.week}
          isCurrentWeek={weekStart === thisWeek}
          resubmit={submission?.status === "REJECTED"}
          busy={busy}
          error={submitError}
          onClose={() => setDialog(null)}
          onSubmit={submitWeek}
        />
      )}
    </div>
  );
}

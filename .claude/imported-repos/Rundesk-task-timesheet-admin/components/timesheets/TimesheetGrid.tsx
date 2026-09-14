"use client";

import { Ellipsis as MoreHorizontal, List, Lock, Play, Plus, Square } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import {
  DAY_CAPACITY_SECONDS,
  WEEK_CAPACITY_SECONDS,
  formatDayHeader,
  formatDuration,
  formatElapsed,
  type DayKey,
} from "@/lib/rundesk/time";
import type { TimeEntry, TimesheetTask, TimesheetTotals } from "@/lib/rundesk/types";

import { useDismiss } from "./useDismiss";

interface Props {
  tasks: TimesheetTask[];
  days: DayKey[];
  todayKey: DayKey;
  totals: TimesheetTotals;
  activeTimer: TimeEntry | null;
  runningDayKey: DayKey | null;
  /** The viewer owns this timesheet and may track time on it. */
  canTrack: boolean;
  /** The week is pending approval or approved: nothing may change. */
  locked: boolean;
  busy: boolean;
  onStart: (task: TimesheetTask) => void;
  onStop: () => void;
  onCell: (task: TimesheetTask, dayKey: DayKey) => void;
  onAddTime: (task: TimesheetTask) => void;
  onViewEntries: (task: TimesheetTask) => void;
}

const STATUS_LABEL: Record<TimesheetTask["status"], string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  COMPLETE: "Complete",
};

/** Thin progress bar against a reference capacity; fills red past it. */
export function CapacityBar({ seconds, capacity }: { seconds: number; capacity: number }) {
  const ratio = capacity > 0 ? seconds / capacity : 0;
  const width = Math.min(100, Math.round(ratio * 100));

  return (
    <i
      className="timesheet-bar"
      data-over={ratio > 1 ? "true" : undefined}
      aria-hidden="true"
      title={`${formatDuration(seconds)} of ${formatDuration(capacity)}`}
    >
      <i style={{ width: `${width}%` }} />
    </i>
  );
}

interface RowMenuProps {
  task: TimesheetTask;
  canAdd: boolean;
  onAddTime: (task: TimesheetTask) => void;
  onViewEntries: (task: TimesheetTask) => void;
}

/** "…" menu at the end of a task row. */
function RowMenu({ task, canAdd, onAddTime, onViewEntries }: RowMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  useDismiss(rootRef, open, close);

  return (
    <div className="timesheet-row-menu" ref={rootRef}>
      <button
        type="button"
        className="timesheet-row-menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More actions for ${task.title}`}
        title="More actions"
        onClick={() => setOpen((current) => !current)}
      >
        <MoreHorizontal size={15} />
      </button>

      {open && (
        <div className="timesheet-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            disabled={!canAdd}
            title={canAdd ? undefined : "This week is locked"}
            onClick={() => {
              setOpen(false);
              onAddTime(task);
            }}
          >
            <Plus size={14} />
            Add time entry
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onViewEntries(task);
            }}
          >
            <List size={14} />
            View this week&apos;s entries
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Task-by-day weekly grid. Column headers carry the day totals and a bar
 * against an 8h day; the Total column carries the week against 40h. Cells
 * open the entries behind them; the row's play button starts a timer.
 */
export default function TimesheetGrid({
  tasks,
  days,
  todayKey,
  totals,
  activeTimer,
  runningDayKey,
  canTrack,
  locked,
  busy,
  onStart,
  onStop,
  onCell,
  onAddTime,
  onViewEntries,
}: Props) {
  return (
    <div className="timesheet-grid-wrap">
      <table className="timesheet-grid">
        <thead>
          <tr>
            <th scope="col" className="timesheet-task-col">
              <span className="timesheet-day-label">Task</span>
              {locked && (
                <span className="timesheet-grid-locked">
                  <Lock size={11} aria-hidden="true" />
                  Locked
                </span>
              )}
            </th>

            {days.map((day) => {
              const seconds = totals.byDay[day] ?? 0;

              return (
                <th key={day} scope="col" className={day === todayKey ? "is-today" : undefined}>
                  <span className="timesheet-day-label">{formatDayHeader(day)}</span>
                  <b className="timesheet-day-total">{seconds ? formatDuration(seconds) : "0m"}</b>
                  <CapacityBar seconds={seconds} capacity={DAY_CAPACITY_SECONDS} />
                </th>
              );
            })}

            <th scope="col" className="timesheet-total-col">
              <span className="timesheet-day-label">Total</span>
              <b className="timesheet-day-total">{formatDuration(totals.week)}</b>
              <CapacityBar seconds={totals.week} capacity={WEEK_CAPACITY_SECONDS} />
            </th>
          </tr>
        </thead>

        <tbody>
          {tasks.map((task) => {
            const isRunning = activeTimer?.taskId === task.id;
            const taskDays = totals.byTaskDay[task.id] ?? {};
            // Stopping is always allowed; starting is not once the week is locked.
            const showTrack = canTrack && (isRunning || !locked);

            return (
              <tr key={task.id} className={isRunning ? "is-running" : undefined}>
                <th scope="row" className="timesheet-task-col">
                  <div className="timesheet-task">
                    <div className="timesheet-task-copy">
                      <strong title={task.title}>{task.title}</strong>
                      <span>
                        <i className="timesheet-dot" data-status={task.status} />
                        {STATUS_LABEL[task.status]}
                        {task.channel ? ` · #${task.channel.name}` : ""}
                        {!task.assigned ? " · No longer assigned" : ""}
                      </span>
                    </div>

                    <div className="timesheet-task-actions">
                      {showTrack && (
                        <button
                          type="button"
                          className={isRunning ? "timesheet-track is-running" : "timesheet-track"}
                          title={isRunning ? "Stop timer" : "Track time"}
                          aria-label={
                            isRunning ? `Stop timer for ${task.title}` : `Track time on ${task.title}`
                          }
                          disabled={busy}
                          onClick={() => (isRunning ? onStop() : onStart(task))}
                        >
                          {isRunning ? <Square size={12} /> : <Play size={12} />}
                        </button>
                      )}

                      <RowMenu
                        task={task}
                        canAdd={canTrack && !locked}
                        onAddTime={onAddTime}
                        onViewEntries={onViewEntries}
                      />
                    </div>
                  </div>
                </th>

                {days.map((day) => {
                  const seconds = taskDays[day] ?? 0;
                  const cellRunning = isRunning && runningDayKey === day;
                  const empty = !seconds && !cellRunning;

                  return (
                    <td key={day} className={day === todayKey ? "is-today" : undefined}>
                      <button
                        type="button"
                        className={[
                          "timesheet-cell",
                          seconds ? "has-time" : "",
                          cellRunning ? "is-running" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        // A locked week has nothing to add and nothing to show in an empty cell.
                        disabled={(locked || !canTrack) && empty}
                        title={
                          seconds
                            ? `${task.title}: ${formatDuration(seconds)} on ${day}`
                            : locked
                              ? "This week is locked"
                              : `Add time for ${task.title} on ${day}`
                        }
                        onClick={() => onCell(task, day)}
                      >
                        {cellRunning
                          ? formatElapsed(seconds)
                          : seconds
                            ? formatDuration(seconds)
                            : "–"}
                      </button>
                    </td>
                  );
                })}

                <td className="timesheet-total-col">
                  <strong>
                    {(totals.byTask[task.id] ?? 0) > 0
                      ? formatDuration(totals.byTask[task.id] ?? 0)
                      : "–"}
                  </strong>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

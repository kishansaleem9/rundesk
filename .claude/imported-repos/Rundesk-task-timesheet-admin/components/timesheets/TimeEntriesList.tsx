"use client";

import { Lock, Pencil, Square, Trash2, X } from "lucide-react";

import {
  formatDayLong,
  formatDuration,
  formatElapsed,
  toClockInput,
  toDayKey,
  type DayKey,
} from "@/lib/rundesk/time";
import type { TimeEntry } from "@/lib/rundesk/types";

interface Props {
  entries: TimeEntry[];
  days: DayKey[];
  todayKey: DayKey;
  timeZone: string;
  running: { entry: TimeEntry; seconds: number } | null;
  /** Title of the task the list is narrowed to, if any. */
  taskFilter: { id: string; title: string } | null;
  /** The viewer may edit entries that are not individually locked. */
  canEdit: boolean;
  canStop: boolean;
  busy: boolean;
  onEdit: (entry: TimeEntry) => void;
  onDelete: (entry: TimeEntry) => void;
  onStop: () => void;
  onClearTaskFilter: () => void;
}

function entryRange(entry: TimeEntry) {
  if (!entry.endedAt) {
    return entry.entryType === "MANUAL" ? "Manual" : "Timer";
  }

  return `${toClockInput(new Date(entry.startedAt))} – ${toClockInput(new Date(entry.endedAt))}`;
}

/**
 * The week's entries as a flat list grouped by day, newest day first. The
 * running timer, if any, sits at the top. The alternative to the grid for
 * people who think in entries rather than task-by-day cells.
 */
export default function TimeEntriesList({
  entries,
  days,
  todayKey,
  timeZone,
  running,
  taskFilter,
  canEdit,
  canStop,
  busy,
  onEdit,
  onDelete,
  onStop,
  onClearTaskFilter,
}: Props) {
  const byDay = new Map<DayKey, TimeEntry[]>();

  for (const entry of entries) {
    const key = toDayKey(new Date(entry.startedAt), timeZone);
    const list = byDay.get(key) ?? [];
    list.push(entry);
    byDay.set(key, list);
  }

  const orderedDays = [...days].reverse().filter((day) => byDay.has(day));
  const runningVisible =
    running && (!taskFilter || running.entry.taskId === taskFilter.id) ? running : null;

  return (
    <section className="timesheet-list" aria-label="Time entries">
      {taskFilter && (
        <div className="timesheet-list-filter">
          <span>
            Showing entries for <strong>{taskFilter.title}</strong>
          </span>
          <button type="button" onClick={onClearTaskFilter} aria-label="Show all tasks">
            <X size={13} />
            All tasks
          </button>
        </div>
      )}

      {runningVisible && (
        <div className="timesheet-list-day is-running">
          <header>
            <h3>Running now</h3>
            <strong>{formatElapsed(runningVisible.seconds)}</strong>
          </header>
          <ul className="timesheet-entries">
            <li className="is-running">
              <div className="timesheet-entry-main">
                <span className="timesheet-entry-range">
                  <i aria-hidden="true" />
                  <b className="timesheet-entry-task" title={runningVisible.entry.task.title}>
                    {runningVisible.entry.task.title}
                  </b>
                  <em>since {toClockInput(new Date(runningVisible.entry.startedAt))}</em>
                </span>
                <strong>{formatElapsed(runningVisible.seconds)}</strong>
              </div>

              {canStop && (
                <div className="timesheet-entry-actions">
                  <button type="button" className="timesheet-stop" disabled={busy} onClick={onStop}>
                    <Square size={12} />
                    Stop
                  </button>
                </div>
              )}
            </li>
          </ul>
        </div>
      )}

      {orderedDays.map((day) => {
        const dayEntries = byDay.get(day) ?? [];
        const total = dayEntries.reduce((sum, entry) => sum + entry.durationSeconds, 0);

        return (
          <div key={day} className={day === todayKey ? "timesheet-list-day is-today" : "timesheet-list-day"}>
            <header>
              <h3>
                {formatDayLong(day)}
                {day === todayKey && <span className="timesheet-list-today">Today</span>}
              </h3>
              <strong>{formatDuration(total)}</strong>
            </header>

            <ul className="timesheet-entries">
              {dayEntries.map((entry) => {
                const editable = canEdit && !entry.locked;

                return (
                  <li key={entry.id}>
                    <div className="timesheet-entry-main">
                      <span className="timesheet-entry-range">
                        <b className="timesheet-entry-task" title={entry.task.title}>
                          {entry.task.title}
                        </b>
                        {entry.task.channel && (
                          <small className="timesheet-entry-channel">#{entry.task.channel.name}</small>
                        )}
                        <em>{entryRange(entry)}</em>
                      </span>
                      <strong>{formatDuration(entry.durationSeconds)}</strong>
                    </div>

                    {entry.note && <p className="timesheet-entry-note">{entry.note}</p>}

                    {editable ? (
                      <div className="timesheet-entry-actions">
                        <button
                          type="button"
                          title="Edit entry"
                          aria-label="Edit entry"
                          disabled={busy}
                          onClick={() => onEdit(entry)}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          className="danger"
                          title="Delete entry"
                          aria-label="Delete entry"
                          disabled={busy}
                          onClick={() => onDelete(entry)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ) : (
                      entry.locked && (
                        <div className="timesheet-entry-actions">
                          <span className="timesheet-entry-locked" title="This week is locked">
                            <Lock size={12} aria-hidden="true" />
                          </span>
                        </div>
                      )
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      {!orderedDays.length && !runningVisible && (
        <div className="timesheet-empty timesheet-list-empty">
          <strong>No time entries this week{taskFilter ? " for this task" : ""}</strong>
          <p>Start a timer or add time from the timesheet and the entries will show up here.</p>
        </div>
      )}
    </section>
  );
}

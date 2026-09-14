"use client";

import { Lock, Pencil, Plus, Square, Trash2, X } from "lucide-react";

import {
  formatDayLong,
  formatDuration,
  formatElapsed,
  toClockInput,
  type DayKey,
} from "@/lib/rundesk/time";
import type { TimeEntry, TimesheetTask } from "@/lib/rundesk/types";

interface Props {
  task: TimesheetTask;
  dayKey: DayKey;
  entries: TimeEntry[];
  running: { entry: TimeEntry; seconds: number } | null;
  /** The viewer may edit entries here (their own, or any as an admin). */
  canEdit: boolean;
  canAdd: boolean;
  /** The week is pending approval or approved. */
  locked: boolean;
  busy: boolean;
  onAdd: () => void;
  onEdit: (entry: TimeEntry) => void;
  onDelete: (entry: TimeEntry) => void;
  onStop: () => void;
  onClose: () => void;
}

function entryRange(entry: TimeEntry) {
  if (!entry.endedAt) {
    return entry.entryType === "MANUAL" ? "Manual" : "Running";
  }

  return `${toClockInput(new Date(entry.startedAt))} – ${toClockInput(new Date(entry.endedAt))}`;
}

/** The individual entries behind one task/day cell. */
export default function CellEntriesDialog({
  task,
  dayKey,
  entries,
  running,
  canEdit,
  canAdd,
  locked,
  busy,
  onAdd,
  onEdit,
  onDelete,
  onStop,
  onClose,
}: Props) {
  const completed = entries.reduce((sum, entry) => sum + entry.durationSeconds, 0);
  const total = completed + (running?.seconds ?? 0);

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="dialog-card timesheet-dialog" role="dialog" aria-modal="true">
        <header>
          <div>
            <h2>{task.title}</h2>
            <span>{formatDayLong(dayKey)}</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        {locked && (
          <p className="timesheet-dialog-locked">
            <Lock size={12} aria-hidden="true" />
            This week is locked while its timesheet is pending approval or approved.
          </p>
        )}

        <ul className="timesheet-entries">
          {entries.map((entry) => {
            const editable = canEdit && !locked && !entry.locked;

            return (
              <li key={entry.id}>
                <div className="timesheet-entry-main">
                  <span className="timesheet-entry-range">{entryRange(entry)}</span>
                  <strong>{formatDuration(entry.durationSeconds)}</strong>
                </div>

                {entry.note && <p className="timesheet-entry-note">{entry.note}</p>}

                {editable && (
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
                )}
              </li>
            );
          })}

          {running && (
            <li className="is-running">
              <div className="timesheet-entry-main">
                <span className="timesheet-entry-range">
                  <i aria-hidden="true" />
                  Running since {toClockInput(new Date(running.entry.startedAt))}
                </span>
                <strong>{formatElapsed(running.seconds)}</strong>
              </div>

              {canAdd && (
                <div className="timesheet-entry-actions">
                  <button type="button" className="timesheet-stop" disabled={busy} onClick={onStop}>
                    <Square size={12} />
                    Stop
                  </button>
                </div>
              )}
            </li>
          )}

          {!entries.length && !running && (
            <li className="timesheet-entries-empty">No time on this day yet.</li>
          )}
        </ul>

        <div className="timesheet-entries-total">
          <span>Total</span>
          <strong>{formatDuration(total)}</strong>
        </div>

        <footer>
          <button type="button" onClick={onClose}>
            Close
          </button>

          {canAdd && !locked && (
            <button type="button" className="primary-button" onClick={onAdd} disabled={busy}>
              <Plus size={14} />
              Add time
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}

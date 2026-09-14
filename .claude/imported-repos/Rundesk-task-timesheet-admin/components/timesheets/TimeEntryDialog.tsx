"use client";

import { X } from "lucide-react";
import { useState, type FormEvent } from "react";

import { api } from "@/lib/rundesk/api";
import {
  MAX_ENTRY_SECONDS,
  formatDuration,
  isClockTime,
  isDayKey,
  localDateFromKey,
  parseDuration,
  secondsBetween,
  toClockInput,
  type DayKey,
} from "@/lib/rundesk/time";
import type { TimeEntry, TimesheetTask } from "@/lib/rundesk/types";

interface Props {
  /** Tasks offered in the picker; only id and title are used. */
  tasks: Array<Pick<TimesheetTask, "id" | "title">>;
  /** Existing entry to edit; omit to create. */
  entry?: TimeEntry;
  initialTaskId: string | null;
  initialDay: DayKey;
  onClose: () => void;
  onSaved: () => void;
}

type Mode = "duration" | "range";

/** Add or edit one time entry: task, date, duration or start/end, note. */
export default function TimeEntryDialog({
  tasks,
  entry,
  initialTaskId,
  initialDay,
  onClose,
  onSaved,
}: Props) {
  const [taskId, setTaskId] = useState(initialTaskId ?? tasks[0]?.id ?? "");
  const [day, setDay] = useState<string>(initialDay);
  const [mode, setMode] = useState<Mode>(entry?.endedAt ? "range" : "duration");
  const [duration, setDuration] = useState(
    entry && !entry.endedAt ? formatDuration(entry.durationSeconds) : "",
  );
  const [start, setStart] = useState(
    entry?.endedAt ? toClockInput(new Date(entry.startedAt)) : "09:00",
  );
  const [end, setEnd] = useState(entry?.endedAt ? toClockInput(new Date(entry.endedAt)) : "10:00");
  const [note, setNote] = useState(entry?.note ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const rangeSeconds =
    mode === "range" && isClockTime(start) && isClockTime(end)
      ? secondsBetween(localDateFromKey(day, start), localDateFromKey(day, end))
      : 0;

  function buildPayload() {
    if (!taskId) {
      throw new Error("Choose a task");
    }

    if (!isDayKey(day)) {
      throw new Error("Choose a date");
    }

    if (mode === "range") {
      if (!isClockTime(start) || !isClockTime(end)) {
        throw new Error("Enter a start and end time");
      }

      const startedAt = localDateFromKey(day, start);
      const endedAt = localDateFromKey(day, end);

      if (endedAt.getTime() <= startedAt.getTime()) {
        throw new Error("End time must be after start time");
      }

      return {
        taskId,
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        note: note.trim() || null,
      };
    }

    const seconds = parseDuration(duration);

    if (!seconds) {
      throw new Error("Enter a duration such as 30m, 1h or 1h 30m");
    }

    if (seconds > MAX_ENTRY_SECONDS) {
      throw new Error("A single entry cannot be longer than 24 hours");
    }

    return {
      taskId,
      startedAt: localDateFromKey(day).toISOString(),
      endedAt: null,
      durationSeconds: seconds,
      note: note.trim() || null,
    };
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");

    let payload: ReturnType<typeof buildPayload>;

    try {
      payload = buildPayload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Check the form");
      return;
    }

    setSaving(true);

    try {
      if (entry) {
        await api<TimeEntry>(`/api/time-entries/${entry.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await api<TimeEntry>("/api/time-entries", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the entry");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="dialog-card timesheet-dialog" onSubmit={submit}>
        <header>
          <h2>{entry ? "Edit time entry" : "Add time"}</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        {error && <p className="form-error timesheet-dialog-error">{error}</p>}

        <label>
          Task
          <select value={taskId} onChange={(event) => setTaskId(event.target.value)} required>
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.title}
              </option>
            ))}
          </select>
        </label>

        <label>
          Date
          <input type="date" value={day} onChange={(event) => setDay(event.target.value)} required />
        </label>

        <div className="timesheet-mode" role="radiogroup" aria-label="How to enter time">
          <button
            type="button"
            role="radio"
            aria-checked={mode === "duration"}
            className={mode === "duration" ? "active" : undefined}
            onClick={() => setMode("duration")}
          >
            Duration
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === "range"}
            className={mode === "range" ? "active" : undefined}
            onClick={() => setMode("range")}
          >
            Start &amp; end
          </button>
        </div>

        {mode === "duration" ? (
          <label>
            Time
            <input
              type="text"
              inputMode="text"
              placeholder="e.g. 30m, 1h, 1h 30m"
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
              autoFocus
            />
          </label>
        ) : (
          <div className="timesheet-range">
            <label>
              Start time
              <input
                type="time"
                value={start}
                onChange={(event) => setStart(event.target.value)}
                required
              />
            </label>
            <label>
              End time
              <input type="time" value={end} onChange={(event) => setEnd(event.target.value)} required />
            </label>
            <span className="timesheet-range-total">
              {rangeSeconds ? formatDuration(rangeSeconds) : "–"}
            </span>
          </div>
        )}

        <label>
          Note <span className="optional">optional</span>
          <textarea
            value={note}
            maxLength={500}
            placeholder="What did you work on?"
            onChange={(event) => setNote(event.target.value)}
          />
        </label>

        <footer>
          <button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </footer>
      </form>
    </div>
  );
}

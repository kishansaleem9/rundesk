"use client";

import { Send, TriangleAlert as AlertTriangle, X } from "lucide-react";
import { useState, type FormEvent } from "react";

import { formatDuration, formatWeekRange, type DayKey } from "@/lib/rundesk/time";

interface Props {
  weekStart: DayKey;
  totalSeconds: number;
  /** The week is still in progress: submitting locks the days that are left. */
  isCurrentWeek: boolean;
  /** A rejected week being sent again. */
  resubmit: boolean;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (note: string) => void;
}

/** Confirms sending a week for approval, with an optional note to the reviewer. */
export default function SubmitDialog({
  weekStart,
  totalSeconds,
  isCurrentWeek,
  resubmit,
  busy,
  error,
  onClose,
  onSubmit,
}: Props) {
  const [note, setNote] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit(note.trim());
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="dialog-card timesheet-dialog timesheet-submit-dialog" onSubmit={submit}>
        <header>
          <div>
            <h2>{resubmit ? "Resubmit for approval" : "Submit for approval"}</h2>
            <span>{formatWeekRange(weekStart)}</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        {error && <p className="form-error timesheet-dialog-error">{error}</p>}

        <div className="timesheet-submit-summary">
          <span>Total this week</span>
          <strong>{formatDuration(totalSeconds)}</strong>
        </div>

        <p className="timesheet-submit-copy">
          Workspace admins will be asked to approve this week. While it is pending you cannot add,
          edit or delete time in it or start a timer on these days. You can withdraw the submission
          at any time before it is reviewed.
        </p>

        {isCurrentWeek && (
          <p className="timesheet-submit-warning">
            <AlertTriangle size={14} aria-hidden="true" />
            This week is not over yet. Submitting now locks the remaining days too, so time you
            track later this week would have to wait until the submission is withdrawn or rejected.
          </p>
        )}

        <label>
          Note for the reviewer <span className="optional">optional</span>
          <textarea
            value={note}
            maxLength={500}
            placeholder="Anything the reviewer should know?"
            onChange={(event) => setNote(event.target.value)}
            autoFocus
          />
        </label>

        <footer>
          <button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="primary-button" disabled={busy}>
            <Send size={13} aria-hidden="true" />
            {busy ? "Submitting…" : resubmit ? "Resubmit" : "Submit for approval"}
          </button>
        </footer>
      </form>
    </div>
  );
}

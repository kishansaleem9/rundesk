"use client";

import { CircleX, RotateCcw, TriangleAlert, X } from "lucide-react";
import { useState, type FormEvent } from "react";

import { formatDuration, formatWeekRange } from "@/lib/rundesk/time";
import type { TimesheetSubmission } from "@/lib/rundesk/types";

interface Props {
  /** Reject a pending week, or reopen an approved one (which also marks it rejected). */
  kind: "reject" | "reopen";
  submission: TimesheetSubmission;
  busy: boolean;
  error: string;
  onClose: () => void;
  onConfirm: (note: string) => void;
}

/** Confirms a rejection or a reopen, with an optional note for the submitter. */
export default function ReviewDialog({ kind, submission, busy, error, onClose, onConfirm }: Props) {
  const [note, setNote] = useState("");
  const first = submission.user.name.split(/\s+/)[0] || submission.user.name;

  function submit(event: FormEvent) {
    event.preventDefault();
    onConfirm(note.trim());
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="dialog-card timesheet-dialog timesheet-review-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="timesheet-review-title"
        onSubmit={submit}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onClose();
          }
        }}
      >
        <header>
          <div>
            <h2 id="timesheet-review-title">
              {kind === "reject" ? "Reject timesheet" : "Reopen approved week"}
            </h2>
            <span>
              {submission.user.name} · {formatWeekRange(submission.weekStart)}
            </span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        {error && <p className="form-error timesheet-dialog-error">{error}</p>}

        <div className="timesheet-submit-summary">
          <span>Submitted total</span>
          <strong>{formatDuration(submission.totalSeconds)}</strong>
        </div>

        <p className="timesheet-submit-copy">
          {kind === "reject"
            ? `${first} will see your note. The week unlocks so they can fix their entries, and they can resubmit it when it is ready.`
            : `This week is approved and locked. Reopening marks it as rejected so ${first} can edit it again; they will need to resubmit it for approval.`}
        </p>

        {kind === "reopen" && (
          <p className="timesheet-submit-warning">
            <TriangleAlert size={14} aria-hidden="true" />
            This removes the approval. Approve the week again once the changes are made.
          </p>
        )}

        <label>
          Note for {first} <span className="optional">optional</span>
          <textarea
            value={note}
            maxLength={500}
            autoFocus
            placeholder={kind === "reject" ? "What needs to change?" : "Why is the week being reopened?"}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>

        <footer>
          <button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="primary-button is-danger" disabled={busy}>
            {kind === "reject" ? (
              <CircleX size={13} aria-hidden="true" />
            ) : (
              <RotateCcw size={13} aria-hidden="true" />
            )}
            {busy ? "Saving…" : kind === "reject" ? "Reject week" : "Reopen week"}
          </button>
        </footer>
      </form>
    </div>
  );
}

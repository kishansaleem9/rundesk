"use client";

import { ArrowRight, CircleCheck, CircleX, RotateCcw } from "lucide-react";

import Avatar from "@/components/rundesk/Avatar";
import { formatDuration } from "@/lib/rundesk/time";
import type { ApprovalsAdmin, TimesheetSubmission } from "@/lib/rundesk/types";

import AssigneePicker from "./AssigneePicker";
import { SubmissionPill, formatInstant } from "./SubmissionStatus";

interface Props {
  submission: TimesheetSubmission;
  viewerId: string;
  admins: ApprovalsAdmin[];
  /** A request for this row is in flight. */
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onReopen: () => void;
  onAssign: (assigneeId: string | null) => Promise<void>;
  onOpen: () => void;
}

/** One submitted week in the Approvals queue: who, how much, status, assignee, actions. */
export default function ApprovalRow({
  submission,
  viewerId,
  admins,
  busy,
  onApprove,
  onReject,
  onReopen,
  onAssign,
  onOpen,
}: Props) {
  const reviewer = submission.reviewedBy?.name ?? "an admin";

  return (
    <li className="timesheet-approval" data-status={submission.status} aria-busy={busy}>
      <div className="timesheet-approval-who">
        <Avatar user={submission.user} size={30} />

        <div className="timesheet-approval-copy">
          <strong>
            {submission.user.name}
            {submission.userId === viewerId && <small>(you)</small>}
          </strong>
          <span>
            Submitted {formatInstant(submission.submittedAt)}
            {submission.reviewedAt &&
              ` · ${submission.status === "APPROVED" ? "Approved" : "Rejected"} ${formatInstant(
                submission.reviewedAt,
              )} by ${reviewer}`}
          </span>

          {submission.note && <p className="timesheet-entry-note">“{submission.note}”</p>}

          {submission.reviewNote && submission.status !== "SUBMITTED" && (
            <p className="timesheet-entry-note">
              <b>{reviewer}:</b> {submission.reviewNote}
            </p>
          )}
        </div>
      </div>

      <div className="timesheet-approval-total">
        <span>Total</span>
        <strong>{formatDuration(submission.totalSeconds)}</strong>
      </div>

      <SubmissionPill submission={submission} />

      <AssigneePicker
        admins={admins}
        viewerId={viewerId}
        assignee={submission.assignedTo}
        disabled={busy}
        onPick={onAssign}
      />

      <div className="timesheet-approval-actions">
        <button
          type="button"
          className="timesheet-action"
          onClick={onOpen}
          title="Open this week’s timesheet"
        >
          Open
          <ArrowRight size={12} aria-hidden="true" />
        </button>

        {submission.status === "SUBMITTED" && (
          <>
            <button type="button" className="timesheet-action" disabled={busy} onClick={onReject}>
              <CircleX size={13} aria-hidden="true" />
              Reject
            </button>
            <button
              type="button"
              className="primary-button timesheet-submit"
              disabled={busy}
              onClick={onApprove}
            >
              <CircleCheck size={13} aria-hidden="true" />
              {busy ? "Approving…" : "Approve"}
            </button>
          </>
        )}

        {submission.status === "APPROVED" && (
          <button
            type="button"
            className="timesheet-action"
            disabled={busy}
            onClick={onReopen}
            title="Reject again so the week can be edited"
          >
            <RotateCcw size={13} aria-hidden="true" />
            Reopen
          </button>
        )}

        {submission.status === "REJECTED" && (
          <span className="timesheet-approval-hint">Waiting for resubmission</span>
        )}
      </div>
    </li>
  );
}

"use client";

import {
  CircleCheck as CheckCircle2,
  CircleX as XCircle,
  Clock3,
  Globe,
  Lock,
} from "lucide-react";

import { formatDuration } from "@/lib/rundesk/time";
import type { TimesheetSubmission } from "@/lib/rundesk/types";

const PILL_LABEL: Record<TimesheetSubmission["status"] | "NONE", string> = {
  NONE: "Not submitted",
  SUBMITTED: "Pending approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

/** "Sep 12, 12:53 AM" in the viewer's locale and zone. */
export function formatInstant(iso: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Status chip shown next to the week label; `compact` fits inside table rows. */
export function SubmissionPill({
  submission,
  compact = false,
}: {
  submission: TimesheetSubmission | null;
  compact?: boolean;
}) {
  const status = submission?.status ?? "NONE";

  return (
    <span
      className={compact ? "timesheet-status-pill is-compact" : "timesheet-status-pill"}
      data-status={status}
    >
      {status === "SUBMITTED" && <Clock3 size={12} aria-hidden="true" />}
      {status === "APPROVED" && <CheckCircle2 size={12} aria-hidden="true" />}
      {status === "REJECTED" && <XCircle size={12} aria-hidden="true" />}
      {PILL_LABEL[status]}
    </span>
  );
}

interface BannerProps {
  submission: TimesheetSubmission | null;
  timeZoneMismatch: boolean;
  viewerTimeZone: string;
  isOwnTimesheet: boolean;
}

/**
 * Explains the week's approval state under the toolbar: who submitted or
 * reviewed it, when, the reviewer's note, and whether it is locked.
 */
export function SubmissionBanner({
  submission,
  timeZoneMismatch,
  viewerTimeZone,
  isOwnTimesheet,
}: BannerProps) {
  if (!submission) {
    return null;
  }

  const owner = isOwnTimesheet ? "You" : submission.user.name;
  const reviewer = submission.reviewedBy?.name ?? "an admin";
  const reviewedAt = submission.reviewedAt ? formatInstant(submission.reviewedAt) : null;

  return (
    <div className="timesheet-banner" data-status={submission.status} role="status">
      <div className="timesheet-banner-main">
        {submission.status === "SUBMITTED" && (
          <>
            <Lock size={14} aria-hidden="true" />
            <p>
              <strong>Pending approval.</strong> {owner} submitted{" "}
              {formatDuration(submission.totalSeconds)} on {formatInstant(submission.submittedAt)}.
              This week is locked until an admin reviews it
              {isOwnTimesheet ? "; withdraw the submission to make changes." : "."}
            </p>
          </>
        )}

        {submission.status === "APPROVED" && (
          <>
            <CheckCircle2 size={14} aria-hidden="true" />
            <p>
              <strong>Approved</strong> by {reviewer}
              {reviewedAt ? ` on ${reviewedAt}` : ""} · {formatDuration(submission.totalSeconds)}.
              This week is locked; only an admin can reopen it.
            </p>
          </>
        )}

        {submission.status === "REJECTED" && (
          <>
            <XCircle size={14} aria-hidden="true" />
            <p>
              <strong>Rejected</strong> by {reviewer}
              {reviewedAt ? ` on ${reviewedAt}` : ""}.
              {isOwnTimesheet
                ? " Fix the entries and resubmit the week when it's ready."
                : " The week is editable again."}
            </p>
          </>
        )}
      </div>

      {submission.reviewNote && submission.status !== "SUBMITTED" && (
        <blockquote className="timesheet-banner-note">
          <span>{reviewer}:</span> {submission.reviewNote}
        </blockquote>
      )}

      {submission.note && submission.status === "SUBMITTED" && (
        <blockquote className="timesheet-banner-note">
          <span>{owner}:</span> {submission.note}
        </blockquote>
      )}

      {timeZoneMismatch && (
        <p className="timesheet-banner-tz">
          <Globe size={13} aria-hidden="true" />
          Submitted in {submission.timeZone}; you are viewing it in {viewerTimeZone}. Entries near
          midnight may fall on a different day here, and the lock follows the submitted zone.
        </p>
      )}
    </div>
  );
}

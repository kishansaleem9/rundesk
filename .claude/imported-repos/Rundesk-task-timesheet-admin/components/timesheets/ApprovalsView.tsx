"use client";

import { CalendarDays, Inbox, LoaderCircle, UserRoundCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { api } from "@/lib/rundesk/api";
import { useStoredFlag, writeStorage } from "@/lib/rundesk/storage";
import { formatWeekRange, startOfWeekKey, type DayKey } from "@/lib/rundesk/time";
import type {
  TimesheetApprovalsResponse,
  TimesheetStatus,
  TimesheetStatusCounts,
  TimesheetSubmission,
} from "@/lib/rundesk/types";

import ApprovalRow from "./ApprovalRow";
import ReviewDialog from "./ReviewDialog";
import { useFlash } from "./useFlash";

const ASSIGNED_KEY = "rundesk:timesheets:approvals:assigned-to-me";

type StatusFilter = TimesheetStatus | "ALL";
type ReviewDialogState = { kind: "reject" | "reopen"; submission: TimesheetSubmission } | null;

const STATUS_CHIP_LABEL: Record<StatusFilter, string> = {
  SUBMITTED: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  ALL: "All",
};

const EMPTY_TITLE: Record<StatusFilter, string> = {
  SUBMITTED: "Nothing waiting for approval",
  APPROVED: "No approved weeks yet",
  REJECTED: "No rejected weeks",
  ALL: "No submissions yet",
};

interface Props {
  viewerId: string;
  todayKey: DayKey;
  /** Bumped by the shell when the window regains focus; triggers a silent refetch. */
  refreshKey: number;
  /** Must be referentially stable (a useCallback). */
  onCounts: (counts: TimesheetStatusCounts) => void;
  onOpen: (userId: string, weekStart: DayKey) => void;
}

function fetchApprovals(status: StatusFilter) {
  const query = status === "ALL" ? "" : `?status=${status}`;

  return api<TimesheetApprovalsResponse>(`/api/timesheets/approvals${query}`);
}

/**
 * "Approvals": submitted weeks grouped by week, with approve / reject /
 * reopen and the admin responsible for each. Admin-only; the shell never
 * renders it otherwise. Any admin may act regardless of the assignee.
 */
export default function ApprovalsView({ viewerId, todayKey, refreshKey, onCounts, onOpen }: Props) {
  const [status, setStatus] = useState<StatusFilter>("SUBMITTED");
  const assignedToMe = useStoredFlag(ASSIGNED_KEY);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; result: TimesheetApprovalsResponse } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [notice, flash] = useFlash();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<ReviewDialogState>(null);
  const [dialogError, setDialogError] = useState("");
  const openerRef = useRef<HTMLElement | null>(null);

  const requestKey = `${status}|${refreshKey}|${attempt}`;
  const result = loaded?.result ?? null;
  const loading = loaded?.key !== requestKey;
  const thisWeek = startOfWeekKey(todayKey);

  useEffect(() => {
    let cancelled = false;

    fetchApprovals(status)
      .then((next) => {
        if (cancelled) {
          return;
        }

        setLoaded({ key: requestKey, result: next });
        setError("");
        onCounts(next.counts);
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "Could not load approvals");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [status, requestKey, onCounts]);

  /** Refetch quietly (counts, rows that left the active filter). */
  function reload() {
    setAttempt((current) => current + 1);
  }

  function replaceRow(updated: TimesheetSubmission) {
    setLoaded((current) =>
      current && {
        ...current,
        result: {
          ...current.result,
          submissions: current.result.submissions.map((item) =>
            item.id === updated.id ? updated : item,
          ),
        },
      },
    );
  }

  const groups = useMemo(() => {
    const visible = (result?.submissions ?? []).filter(
      (submission) => !assignedToMe || submission.assignedToId === viewerId,
    );
    const byWeek = new Map<string, TimesheetSubmission[]>();

    for (const submission of visible) {
      const list = byWeek.get(submission.weekStart) ?? [];
      list.push(submission);
      byWeek.set(submission.weekStart, list);
    }

    return [...byWeek.entries()]
      .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
      .map(([weekStart, items]) => ({
        weekStart,
        items: [...items].sort((a, b) => a.user.name.localeCompare(b.user.name)),
      }));
  }, [result, assignedToMe, viewerId]);

  function openDialog(kind: "reject" | "reopen", submission: TimesheetSubmission) {
    openerRef.current = document.activeElement as HTMLElement | null;
    setDialogError("");
    setDialog({ kind, submission });
  }

  function closeDialog() {
    setDialog(null);
    setDialogError("");
    openerRef.current?.focus();
  }

  async function review(
    submission: TimesheetSubmission,
    next: "APPROVED" | "REJECTED",
    reviewNote: string | null,
  ) {
    setPendingId(submission.id);

    try {
      const { submission: updated } = await api<{ submission: TimesheetSubmission }>(
        `/api/timesheets/approvals/${submission.id}`,
        { method: "PATCH", body: JSON.stringify({ status: next, reviewNote }) },
      );

      replaceRow(updated);
      setDialog(null);
      setDialogError("");
      flash(
        next === "APPROVED"
          ? `Approved ${updated.user.name}’s week (${formatWeekRange(updated.weekStart)})`
          : submission.status === "APPROVED"
            ? `Reopened ${updated.user.name}’s week for editing`
            : `Rejected — ${updated.user.name} can edit and resubmit`,
      );
      reload();
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : "Could not update the submission";

      if (dialog) {
        setDialogError(message);
      } else {
        setError(message);
      }

      // Someone else acted, or the member withdrew: pick up the current state.
      reload();
    } finally {
      setPendingId(null);
    }
  }

  async function assign(submission: TimesheetSubmission, assigneeId: string | null) {
    const { submission: updated } = await api<{ submission: TimesheetSubmission }>(
      `/api/timesheets/approvals/${submission.id}/assignee`,
      { method: "PATCH", body: JSON.stringify({ assigneeId }) },
    );

    replaceRow(updated);
    flash(
      !assigneeId
        ? "Unassigned"
        : assigneeId === viewerId
          ? "Assigned to you"
          : `Assigned to ${updated.assignedTo?.name ?? "an admin"}`,
    );
  }

  const counts = result?.counts ?? null;

  return (
    <div
      role="tabpanel"
      id="timesheet-panel-approvals"
      aria-labelledby="timesheet-tab-approvals"
      className="timesheet-panel"
    >
      <div className="timesheet-filters timesheet-approvals-filters">
        <div className="timesheet-chips" role="group" aria-label="Status">
          {(["SUBMITTED", "APPROVED", "REJECTED", "ALL"] as StatusFilter[]).map((value) => (
            <button
              key={value}
              type="button"
              className={status === value ? "timesheet-chip is-active" : "timesheet-chip"}
              aria-pressed={status === value}
              onClick={() => setStatus(value)}
            >
              {STATUS_CHIP_LABEL[value]}
              {value !== "ALL" && counts && (
                <em className="timesheet-chip-count">{counts[value]}</em>
              )}
            </button>
          ))}
        </div>

        <button
          type="button"
          className={assignedToMe ? "timesheet-chip is-active" : "timesheet-chip"}
          aria-pressed={assignedToMe}
          title="Only weeks assigned to you"
          onClick={() => writeStorage(ASSIGNED_KEY, assignedToMe ? null : "true")}
        >
          <UserRoundCheck size={13} aria-hidden="true" />
          Assigned to me
        </button>
      </div>

      {(error || notice) && (
        <p className={error ? "form-error timesheet-message" : "timesheet-message"} role="status">
          {error || notice}
        </p>
      )}

      {!result && !error ? (
        <div className="timesheet-center">
          <LoaderCircle className="spin" size={22} />
          <span>Loading approvals…</span>
        </div>
      ) : !result ? (
        <div className="timesheet-empty">
          <strong>Couldn’t load approvals</strong>
          <p>{error}</p>
          <button type="button" className="timesheet-action" onClick={reload}>
            Try again
          </button>
        </div>
      ) : groups.length === 0 ? (
        <div className="timesheet-empty">
          <Inbox size={22} aria-hidden="true" />
          <strong>{EMPTY_TITLE[status]}</strong>
          <p>
            {assignedToMe
              ? "Nothing here is assigned to you. Turn off “Assigned to me” to see the whole queue."
              : "Submitted weeks show up here as soon as people send them."}
          </p>
        </div>
      ) : (
        <section
          className="timesheet-list timesheet-approvals"
          aria-label="Timesheet submissions"
          data-loading={loading ? "true" : undefined}
        >
          {groups.map(({ weekStart, items }) => (
            <div
              key={weekStart}
              className={
                weekStart === thisWeek
                  ? "timesheet-list-day timesheet-approval-week is-today"
                  : "timesheet-list-day timesheet-approval-week"
              }
            >
              <header>
                <h3>
                  <CalendarDays size={13} aria-hidden="true" />
                  {formatWeekRange(weekStart)}
                  {weekStart === thisWeek && <span className="timesheet-list-today">This week</span>}
                </h3>
                <strong>
                  {items.length} {items.length === 1 ? "submission" : "submissions"}
                </strong>
              </header>

              <ul className="timesheet-entries timesheet-approval-rows">
                {items.map((submission) => (
                  <ApprovalRow
                    key={submission.id}
                    submission={submission}
                    viewerId={viewerId}
                    admins={result.admins}
                    busy={pendingId === submission.id}
                    onApprove={() => void review(submission, "APPROVED", null)}
                    onReject={() => openDialog("reject", submission)}
                    onReopen={() => openDialog("reopen", submission)}
                    onAssign={(assigneeId) => assign(submission, assigneeId)}
                    onOpen={() => onOpen(submission.userId, submission.weekStart)}
                  />
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {dialog && (
        <ReviewDialog
          kind={dialog.kind}
          submission={dialog.submission}
          busy={pendingId === dialog.submission.id}
          error={dialogError}
          onClose={closeDialog}
          onConfirm={(note) => void review(dialog.submission, "REJECTED", note || null)}
        />
      )}
    </div>
  );
}

"use client";

import { Check, ChevronDown, Search, UserPlus, X } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

import Avatar from "@/components/rundesk/Avatar";
import type { ApprovalsAdmin } from "@/lib/rundesk/types";

import { useDismiss } from "./useDismiss";

interface Props {
  admins: ApprovalsAdmin[];
  viewerId: string;
  /** The admin currently responsible, if any. */
  assignee: { id: string; name: string; avatar: string | null } | null;
  disabled?: boolean;
  /** Resolves when the server accepted the change; rejects with a message otherwise. */
  onPick: (assigneeId: string | null) => Promise<void>;
}

/**
 * "Assign ▾" / "<name> ▾" button with a searchable list of the workspace's
 * admins. Picking one assigns (or reassigns) the submission; "Unassign"
 * clears it. Assignment only says who is responsible: any admin may act.
 */
export default function AssigneePicker({ admins, viewerId, assignee, disabled, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setError("");
  }, []);

  useDismiss(rootRef, open, close);

  const options = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matching = needle
      ? admins.filter((admin) => admin.name.toLowerCase().includes(needle))
      : admins;

    // The viewer first, then the rest by name as the server ordered them.
    return [...matching].sort((a, b) =>
      a.id === viewerId ? -1 : b.id === viewerId ? 1 : 0,
    );
  }, [admins, query, viewerId]);

  async function pick(next: string | null) {
    if (next === (assignee?.id ?? null)) {
      close();
      return;
    }

    setBusy(next ?? "none");
    setError("");

    try {
      await onPick(next);
      close();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update the assignee");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="timesheet-approval-assignee" ref={rootRef}>
      <button
        type="button"
        className={assignee ? "timesheet-assignee" : "timesheet-assignee is-empty"}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={
          assignee ? `Assigned to ${assignee.name}. Change assignee` : "Unassigned. Assign a reviewer"
        }
        title={assignee ? "Reassign" : "Assign to an admin"}
        disabled={disabled}
        onClick={() => (open ? close() : setOpen(true))}
      >
        {assignee ? <Avatar user={assignee} size={18} /> : <UserPlus size={13} aria-hidden="true" />}
        <span>{assignee ? (assignee.id === viewerId ? "You" : assignee.name) : "Assign"}</span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>

      {open && (
        <div className="timesheet-weekpicker-menu timesheet-assignee-menu">
          <label className="timesheet-picker-search">
            <Search size={13} aria-hidden="true" />
            <input
              autoFocus
              value={query}
              placeholder="Search admins"
              aria-label="Search admins"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <ul role="listbox" aria-label="Assign to an admin">
            {options.map((admin) => {
              const isSelected = admin.id === assignee?.id;

              return (
                <li key={admin.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={isSelected ? "is-selected" : undefined}
                    disabled={busy !== null}
                    onClick={() => void pick(admin.id)}
                  >
                    <span>
                      <strong>
                        <Avatar user={admin} size={20} />
                        {admin.id === viewerId ? `${admin.name} (you)` : admin.name}
                      </strong>
                      <small>{admin.role === "OWNER" ? "Owner" : "Admin"}</small>
                    </span>
                    {isSelected ? (
                      <Check size={14} aria-hidden="true" />
                    ) : busy === admin.id ? (
                      <small>Assigning…</small>
                    ) : null}
                  </button>
                </li>
              );
            })}

            {!options.length && <li className="timesheet-members-empty">No matching admins.</li>}
          </ul>

          {assignee && (
            <div className="timesheet-assignee-unassign">
              <button type="button" disabled={busy !== null} onClick={() => void pick(null)}>
                <X size={13} aria-hidden="true" />
                {busy === "none" ? "Unassigning…" : "Unassign"}
              </button>
            </div>
          )}

          {error && <p className="form-error timesheet-picker-error">{error}</p>}
        </div>
      )}
    </div>
  );
}

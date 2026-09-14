"use client";

import {
  useMemo,
  useState,
} from "react";

import {
  Check,
  Search,
  UserRoundCheck,
  X,
} from "lucide-react";

import type {
  Message,
  User,
} from "@/lib/rundesk/types";

import Avatar from "../Avatar";

interface Props {
  message: Message;
  users: User[];
  onClose: () => void;

  onAssign: (
    user: User,
  ) => Promise<void>;
}

export default function AssignMessagePanel({
  message,
  users,
  onClose,
  onAssign,
}: Props) {
  const [query, setQuery] =
    useState("");

  const [busy, setBusy] =
    useState<string | null>(
      null,
    );

  const [error, setError] =
    useState("");

  const assignedIds =
    useMemo(
      () =>
        new Set(
          (
            message.assignments ??
            []
          )
            .filter(
              (assignment) =>
                !assignment.resolvedAt,
            )
            .map(
              (assignment) =>
                assignment.assigneeId,
            ),
        ),
      [
        message.assignments,
      ],
    );

  const filtered =
    useMemo(
      () => {
        const normalized =
          query
            .trim()
            .toLowerCase();

        return users.filter(
          (user) =>
            !normalized ||
            `${user.name} ${user.email}`
              .toLowerCase()
              .includes(
                normalized,
              ),
        );
      },
      [
        users,
        query,
      ],
    );

  async function assign(
    user: User,
  ) {
    setBusy(user.id);
    setError("");

    try {
      await onAssign(user);

      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not assign message",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <aside className="detail-panel assign-picker-panel">
      <header>
        <div>
          <h2>
            Assign message
          </h2>

          <span>
            Create a follow-up without turning it into a task
          </span>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </header>

      <div className="assign-source">
        <UserRoundCheck
          size={17}
        />

        <p>
          {message.content ||
            "Attachment message"}
        </p>
      </div>

      <label className="panel-search">
        <Search size={16} />

        <input
          autoFocus
          value={query}
          onChange={(
            event,
          ) =>
            setQuery(
              event.target
                .value,
            )
          }
          placeholder="Search workspace members"
        />
      </label>

      <div className="assign-user-list">
        {filtered.map(
          (user) => {
            const alreadyAssigned =
              assignedIds.has(
                user.id,
              );

            return (
              <button
                type="button"
                key={user.id}
                disabled={
                  busy !== null ||
                  alreadyAssigned
                }
                onClick={() =>
                  void assign(
                    user,
                  )
                }
              >
                <Avatar
                  user={user}
                  size={29}
                />

                <span>
                  <strong>
                    {user.name}
                  </strong>

                  <small>
                    {user.email}
                  </small>
                </span>

                {alreadyAssigned ? (
                  <i className="assignment-complete">
                    <Check
                      size={
                        13
                      }
                    />
                    Assigned
                  </i>
                ) : busy ===
                  user.id ? (
                  <i>
                    Assigning…
                  </i>
                ) : null}
              </button>
            );
          },
        )}

        {!filtered.length && (
          <p className="panel-empty-copy">
            No matching people.
          </p>
        )}

        {error && (
          <p className="form-error">
            {error}
          </p>
        )}
      </div>
    </aside>
  );
}

"use client";

import {
  FormEvent,
  useMemo,
  useState,
} from "react";

import {
  Search,
  X,
} from "lucide-react";

import type {
  Channel,
  User,
} from "@/lib/rundesk/types";

interface Props {
  channel?: Channel;
  users: User[];

  onClose: () => void;

  onSave: (input: {
    name: string;
    description: string;
    topic: string;
    isPrivate: boolean;
    memberIds: string[];
  }) => Promise<void>;
}

export default function ChannelModal({
  channel,
  users,
  onClose,
  onSave,
}: Props) {
  const [name, setName] =
    useState(
      channel?.name ?? "",
    );

  const [
    description,
    setDescription,
  ] = useState(
    channel?.description ??
      "",
  );

  const [topic, setTopic] =
    useState(
      channel?.topic ?? "",
    );

  const [
    memberIds,
    setMemberIds,
  ] = useState<string[]>([]);

  const [
    memberQuery,
    setMemberQuery,
  ] = useState("");

  const [
    isPrivate,
    setPrivate,
  ] = useState(
    channel?.isPrivate ??
      false,
  );

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  const filteredUsers =
    useMemo(() => {
      const query =
        memberQuery
          .trim()
          .toLowerCase();

      if (!query) {
        return users;
      }

      return users.filter(
        (user) =>
          `${user.name} ${user.email}`
            .toLowerCase()
            .includes(query),
      );
    }, [
      users,
      memberQuery,
    ]);

  function toggleMember(
    userId: string,
  ) {
    setMemberIds(
      (current) =>
        current.includes(userId)
          ? current.filter(
              (id) =>
                id !== userId,
            )
          : [
              ...current,
              userId,
            ],
    );
  }

  async function submit(
    event: FormEvent,
  ) {
    event.preventDefault();

    setSaving(true);
    setError("");

    try {
      await onSave({
        name:
          name.trim(),

        description:
          description.trim(),

        topic:
          topic.trim(),

        isPrivate,

        memberIds,
      });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not save channel",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
    >
      <form
        className="dialog-card"
        onSubmit={submit}
      >
        <header>
          <div>
            <h2>
              {channel
                ? "Edit Channel"
                : "Create Channel"}
            </h2>

            <span>
              {channel
                ? "Update the channel details."
                : "Create a space for your team to talk and work together."}
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

        {error && (
          <p className="form-error">
            {error}
          </p>
        )}

        <label>
          Channel name

          <input
            autoFocus
            required
            maxLength={80}
            value={name}
            onChange={(
              event,
            ) =>
              setName(
                event.target
                  .value,
              )
            }
            placeholder="e.g. Development"
          />
        </label>

        <label>
          Topic{" "}
          <span className="optional">
            Optional
          </span>

          <input
            maxLength={191}
            value={topic}
            onChange={(
              event,
            ) =>
              setTopic(
                event.target
                  .value,
              )
            }
            placeholder="A short channel topic"
          />
        </label>

        <label>
          Description

          <textarea
            maxLength={500}
            value={
              description
            }
            onChange={(
              event,
            ) =>
              setDescription(
                event.target
                  .value,
              )
            }
            placeholder="What is this channel about?"
          />
        </label>

        {!channel && (
          <fieldset className="member-checks">
            <legend>
              Add members
            </legend>

            <label className="member-check-search">
              <Search
                size={15}
              />

              <input
                value={
                  memberQuery
                }
                onChange={(
                  event,
                ) =>
                  setMemberQuery(
                    event
                      .target
                      .value,
                  )
                }
                placeholder="Search workspace members"
              />
            </label>

            <div className="member-check-actions">
              <button
                type="button"
                onClick={() =>
                  setMemberIds(
                    users.map(
                      (user) =>
                        user.id,
                    ),
                  )
                }
              >
                Select all
              </button>

              <button
                type="button"
                onClick={() =>
                  setMemberIds(
                    [],
                  )
                }
              >
                Clear
              </button>

              <span>
                {
                  memberIds.length
                }{" "}
                selected
              </span>
            </div>

            <div className="member-check-list">
              {filteredUsers.map(
                (user) => (
                  <label
                    key={
                      user.id
                    }
                  >
                    <input
                      type="checkbox"
                      checked={memberIds.includes(
                        user.id,
                      )}
                      onChange={() =>
                        toggleMember(
                          user.id,
                        )
                      }
                    />

                    <span>
                      <strong>
                        {
                          user.name
                        }
                      </strong>

                      <small>
                        {
                          user.email
                        }
                      </small>
                    </span>
                  </label>
                ),
              )}

              {!filteredUsers.length && (
                <p className="panel-empty-copy">
                  No matching workspace members.
                </p>
              )}
            </div>

            <small className="field-help">
              The channel creator is added automatically.
            </small>
          </fieldset>
        )}

        <label className="privacy-field">
          <span>
            <strong>
              Private channel
            </strong>

            <small>
              Only invited members can view it
            </small>
          </span>

          <input
            type="checkbox"
            checked={
              isPrivate
            }
            onChange={(
              event,
            ) =>
              setPrivate(
                event.target
                  .checked,
              )
            }
          />
        </label>

        <footer>
          <button
            type="button"
            onClick={onClose}
          >
            Cancel
          </button>

          <button
            type="submit"
            className="primary-button"
            disabled={
              saving ||
              !name.trim()
            }
          >
            {saving
              ? "Saving…"
              : channel
                ? "Save changes"
                : "Create Channel"}
          </button>
        </footer>
      </form>
    </div>
  );
}

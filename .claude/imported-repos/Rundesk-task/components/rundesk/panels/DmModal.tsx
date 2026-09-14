"use client";

import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import type { User } from "@/lib/rundesk/types";

interface Props {
  users: User[];
  currentUserId: string;
  onClose: () => void;
  onSelect: (users: User[]) => void;
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function DmModal({
  users,
  currentUserId,
  onClose,
  onSelect,
}: Props) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    if (!needle) {
      return users;
    }

    return users.filter((user) =>
      user.name.toLowerCase().includes(needle),
    );
  }, [users, query]);

  const selectedUsers = users.filter((user) =>
    selected.includes(user.id),
  );

  function toggleUser(userId: string) {
    setSelected((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );
  }

  function submit() {
    if (!selectedUsers.length) return;
    onSelect(selectedUsers);
  }

  return (
    <div className="modal-backdrop">
      <section
        className="dialog-card dm-dialog compact-dm-dialog"
        style={{
          width: "min(520px, calc(100vw - 32px))",
          maxHeight: "min(620px, calc(100dvh - 48px))",
          overflow: "hidden",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            minHeight: 64,
            padding: "12px 16px 10px",
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: 16,
                lineHeight: 1.25,
              }}
            >
              New direct message
            </h2>

            <p
              style={{
                margin: "4px 0 0",
                color: "#777d8b",
                fontSize: 11,
                lineHeight: 1.35,
              }}
            >
              Select one person or create a group conversation.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              display: "grid",
              placeItems: "center",
              width: 28,
              height: 28,
              padding: 0,
              borderRadius: 7,
            }}
          >
            <X size={18} />
          </button>
        </header>

        {/* Search icon is intentionally inside the field. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            height: 42,
            gap: 9,
            margin: "12px 14px 8px",
            padding: "0 11px",
            color: "#737985",
            border: "1px solid #d8dbe2",
            borderRadius: 8,
            background: "#fff",
          }}
        >
          <Search
            size={17}
            style={{
              flex: "0 0 auto",
            }}
          />

          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search workspace members"
            aria-label="Search workspace members"
            style={{
              flex: "1 1 auto",
              width: "100%",
              minWidth: 0,
              height: 40,
              margin: 0,
              padding: 0,
              border: 0,
              outline: 0,
              background: "transparent",
              boxShadow: "none",
              fontSize: 11,
            }}
          />
        </div>

        {/* Selected people chips stay compact and appear only after selection. */}
        {selectedUsers.length > 1 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 5,
              padding: "0 14px 7px",
            }}
          >
            {selectedUsers.map((user) => (
              <button
                type="button"
                key={user.id}
                onClick={() => toggleUser(user.id)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  minHeight: 27,
                  padding: "2px 8px",
                  border: "1px solid #e2ddea",
                  borderRadius: 999,
                  background: "#f7f3fa",
                  fontSize: 10,
                }}
              >
                <span>{user.name}</span>
                <X size={12} />
              </button>
            ))}
          </div>
        )}

        <div
          style={{
            minHeight: 132,
            maxHeight: 350,
            overflowY: "auto",
            padding: "3px 12px 10px",
          }}
        >
          {filtered.map((user) => {
            const active = selected.includes(user.id);
            const isCurrentUser = user.id === currentUserId;
            const initials = getInitials(user.name);

            return (
              <button
                type="button"
                key={user.id}
                onClick={() => toggleUser(user.id)}
                aria-pressed={active}
                style={{
                  display: "flex",
                  alignItems: "center",
                  width: "100%",
                  minHeight: 50,
                  gap: 10,
                  margin: 0,
                  padding: "6px 8px",
                  borderRadius: 8,
                  background: active ? "#f3f0fb" : "transparent",
                  textAlign: "left",
                }}
              >
                {/* Local avatar avoids the old .dm-dialog i / avatar CSS collision. */}
                <span
                  aria-hidden="true"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flex: "0 0 34px",
                    width: 34,
                    height: 34,
                    minWidth: 34,
                    minHeight: 34,
                    margin: 0,
                    padding: 0,
                    overflow: "hidden",
                    color: "#fff",
                    borderRadius: "50%",
                    background: user.avatar
                      ? `center / cover no-repeat url("${user.avatar}")`
                      : "linear-gradient(135deg, #7764d8, #ca67ba)",
                    fontSize: 9,
                    fontWeight: 750,
                    lineHeight: 1,
                    textAlign: "center",
                  }}
                >
                  {user.avatar ? null : initials}
                </span>

                <span
                  style={{
                    display: "flex",
                    flex: "1 1 auto",
                    minWidth: 0,
                    flexDirection: "column",
                    justifyContent: "center",
                    gap: 1,
                    margin: 0,
                    padding: 0,
                  }}
                >
                  <strong
                    style={{
                      overflow: "hidden",
                      color: "#2d323b",
                      fontSize: 12,
                      fontWeight: 650,
                      lineHeight: 1.3,
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {user.name}
                    {isCurrentUser ? " (You)" : ""}
                  </strong>
                </span>

                {/* No email and no right-side square/check placeholder. */}
              </button>
            );
          })}

          {!filtered.length && (
            <p
              className="panel-empty-copy"
              style={{
                margin: "28px 0",
                textAlign: "center",
              }}
            >
              No matching workspace members.
            </p>
          )}
        </div>

        <footer
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 8,
            padding: "12px 14px 14px",
          }}
        >
          <button
            type="button"
            onClick={onClose}
          >
            Cancel
          </button>

          <button
            type="button"
            className="primary-button"
            disabled={!selectedUsers.length}
            onClick={submit}
            style={{
              minWidth: 78,
            }}
          >
            {selectedUsers.length > 1
              ? `Message ${selectedUsers.length} people`
              : "Message"}
          </button>
        </footer>
      </section>
    </div>
  );
}

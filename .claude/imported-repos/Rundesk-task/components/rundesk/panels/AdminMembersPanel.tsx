
"use client";

import {
  LoaderCircle,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { api } from "@/lib/rundesk/api";
import type {
  WorkspaceMemberRecord,
  WorkspaceMembersResponse,
  WorkspaceRole,
} from "@/lib/rundesk/types";
import Avatar from "../Avatar";

interface Props {
  workspaceId: string;
  currentUserId: string;
  currentRole: WorkspaceRole;
  onClose: () => void;
  onChanged?: () => Promise<void> | void;
}

export default function AdminMembersPanel({
  workspaceId,
  currentUserId,
  currentRole,
  onClose,
  onChanged,
}: Props) {
  const [members, setMembers] = useState<WorkspaceMemberRecord[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<"MEMBER" | "ADMIN">("MEMBER");

  const isOwner = currentRole === "OWNER";

  async function load() {
    setLoading(true);
    setError("");

    try {
      const result = await api<WorkspaceMembersResponse>(
        `/api/workspace/members?workspaceId=${encodeURIComponent(workspaceId)}`,
      );
      setMembers(result.members);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not load workspace members",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [workspaceId]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    if (!needle) return members;

    return members.filter((member) =>
      `${member.user.name} ${member.user.email} ${member.role}`
        .toLowerCase()
        .includes(needle),
    );
  }, [members, query]);

  async function addMember(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const member = await api<WorkspaceMemberRecord>(
        "/api/workspace/members",
        {
          method: "POST",
          body: JSON.stringify({
            workspaceId,
            name,
            email,
            role: isOwner ? newRole : "MEMBER",
          }),
        },
      );

      setMembers((current) =>
        [...current, member].sort((a, b) =>
          a.user.name.localeCompare(b.user.name),
        ),
      );
      setName("");
      setEmail("");
      setNewRole("MEMBER");
      setAdding(false);
      await onChanged?.();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not add workspace member",
      );
    } finally {
      setSaving(false);
    }
  }

  async function changeRole(
    member: WorkspaceMemberRecord,
    role: "MEMBER" | "ADMIN",
  ) {
    setError("");

    try {
      const updated = await api<WorkspaceMemberRecord>(
        `/api/workspace/members/${member.userId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            workspaceId,
            role,
          }),
        },
      );

      setMembers((current) =>
        current.map((item) =>
          item.userId === updated.userId ? updated : item,
        ),
      );
      await onChanged?.();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not change role",
      );
    }
  }

  async function removeMember(member: WorkspaceMemberRecord) {
    if (
      !confirm(
        `Remove ${member.user.name} from this workspace? They will lose access to Rundesk Chat.`,
      )
    ) {
      return;
    }

    setError("");

    try {
      await api<void>(
        `/api/workspace/members/${member.userId}?workspaceId=${encodeURIComponent(workspaceId)}`,
        { method: "DELETE" },
      );

      setMembers((current) =>
        current.filter((item) => item.userId !== member.userId),
      );
      await onChanged?.();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not remove workspace member",
      );
    }
  }

  return (
    <aside className="detail-panel workspace-admin-panel">
      <header>
        <div>
          <h2>Workspace members</h2>
          <span>Admin access · {members.length} people</span>
        </div>

        <button type="button" onClick={onClose} aria-label="Close workspace members">
          <X size={18} />
        </button>
      </header>

      <div className="workspace-admin-toolbar">
        <label className="panel-search workspace-admin-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search members"
          />
        </label>

        <button
          type="button"
          className="primary-button workspace-add-member"
          onClick={() => setAdding((current) => !current)}
        >
          <Plus size={15} />
          Add member
        </button>
      </div>

      {adding && (
        <form className="workspace-member-form" onSubmit={addMember}>
          <label>
            <span>Name</span>
            <input
              autoFocus
              required
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Member name"
            />
          </label>

          <label>
            <span>Email</span>
            <input
              required
              type="email"
              maxLength={191}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@company.com"
            />
          </label>

          {isOwner && (
            <label>
              <span>Role</span>
              <select
                value={newRole}
                onChange={(event) =>
                  setNewRole(event.target.value as "MEMBER" | "ADMIN")
                }
              >
                <option value="MEMBER">Member</option>
                <option value="ADMIN">Admin</option>
              </select>
            </label>
          )}

          <div className="workspace-member-form-actions">
            <button type="button" onClick={() => setAdding(false)}>
              Cancel
            </button>
            <button className="primary-button" disabled={saving}>
              {saving ? "Adding…" : "Add member"}
            </button>
          </div>
        </form>
      )}

      {error && <p className="form-error workspace-admin-error">{error}</p>}

      <div className="workspace-member-list">
        {loading ? (
          <div className="panel-center">
            <LoaderCircle className="spin" />
          </div>
        ) : filtered.length ? (
          filtered.map((member) => {
            const self = member.userId === currentUserId;
            const targetIsOwner = member.role === "OWNER";
            const canRemove =
              !self &&
              !targetIsOwner &&
              (isOwner || member.role === "MEMBER");

            return (
              <div className="workspace-member-row" key={member.userId}>
                <Avatar user={member.user} size={32} />

                <div className="workspace-member-copy">
                  <strong>{member.user.name}</strong>
                  <small>{member.user.email}</small>
                </div>

                <div className="workspace-member-role">
                  {isOwner && !self && !targetIsOwner ? (
                    <select
                      value={member.role}
                      onChange={(event) =>
                        void changeRole(
                          member,
                          event.target.value as "MEMBER" | "ADMIN",
                        )
                      }
                    >
                      <option value="MEMBER">Member</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  ) : (
                    <span className={`role-badge role-${member.role.toLowerCase()}`}>
                      {member.role === "OWNER" ? (
                        <ShieldCheck size={13} />
                      ) : member.role === "ADMIN" ? (
                        <UserCog size={13} />
                      ) : (
                        <Users size={13} />
                      )}
                      {member.role.charAt(0) + member.role.slice(1).toLowerCase()}
                    </span>
                  )}
                </div>

                {canRemove && (
                  <button
                    type="button"
                    className="workspace-remove-member"
                    title="Remove member"
                    onClick={() => void removeMember(member)}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            );
          })
        ) : (
          <p className="panel-empty-copy">No matching members.</p>
        )}
      </div>
    </aside>
  );
}
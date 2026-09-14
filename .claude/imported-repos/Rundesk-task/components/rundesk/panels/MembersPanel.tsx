
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  LoaderCircle,
  LockKeyhole,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";

import { api } from "@/lib/rundesk/api";
import type { Channel, User, WorkspaceRole } from "@/lib/rundesk/types";
import Avatar from "../Avatar";

type Membership = {
  channelId: string;
  userId: string;
  joinedAt: string;
  notificationsMuted?: boolean;
  user: User;
};

interface Props {
  channel: Channel;
  allUsers: User[];
  currentUserId: string;
  currentRole: WorkspaceRole;
  onClose: () => void;
  onMembershipChange?: (members: User[]) => void;
}

export default function MembersPanel({
  channel,
  allUsers,
  currentUserId,
  currentRole,
  onClose,
  onMembershipChange,
}: Props) {
  const [members, setMembers] = useState<Membership[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [permissions, setPermissions] = useState(false);
  const [error, setError] = useState("");

  const canManage =
    channel.createdById === currentUserId ||
    currentRole === "OWNER" ||
    currentRole === "ADMIN";

  useEffect(() => {
    let active = true;

    api<Membership[]>(`/api/channels/${channel.id}/members`)
      .then((result) => {
        if (!active) return;
        setMembers(result);
        onMembershipChange?.(result.map((item) => item.user));
      })
      .catch((reason) => {
        if (active) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not load members",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [channel.id, onMembershipChange]);

  const filtered = useMemo(() => {
    const needle = query.toLowerCase();

    return members.filter((item) =>
      `${item.user.name} ${item.user.email}`
        .toLowerCase()
        .includes(needle),
    );
  }, [members, query]);

  const available = allUsers.filter(
    (user) => !members.some((member) => member.userId === user.id),
  );

  async function add(userId: string) {
    try {
      const result = await api<Membership[]>(
        `/api/channels/${channel.id}/members`,
        {
          method: "POST",
          body: JSON.stringify({ userIds: [userId] }),
        },
      );

      setMembers(result);
      onMembershipChange?.(result.map((item) => item.user));
      setAdding(false);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not add member",
      );
    }
  }

  async function remove(userId: string) {
    if (userId === channel.createdById) {
      setError("The channel creator cannot be removed.");
      return;
    }

    if (
      !confirm(
        userId === currentUserId
          ? "Leave this channel?"
          : "Remove this member from the channel?",
      )
    ) {
      return;
    }

    try {
      await api(
        `/api/channels/${channel.id}/members?userId=${encodeURIComponent(userId)}`,
        { method: "DELETE" },
      );

      const next = members.filter((item) => item.userId !== userId);
      setMembers(next);
      onMembershipChange?.(next.map((item) => item.user));

      if (userId === currentUserId) onClose();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not remove member",
      );
    }
  }

  return (
    <aside className="detail-panel members-panel">
      <header>
        <div>
          <h2>Followers</h2>
          <span>{members.length} people in this channel</span>
        </div>
        <button type="button" onClick={onClose}>
          <X size={18} />
        </button>
      </header>

      {!permissions ? (
        <>
          <label className="panel-search">
            <Search size={16} />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search people"
            />
          </label>

          <div className="member-panel-list">
            {loading && (
              <div className="panel-center">
                <LoaderCircle className="spin" />
              </div>
            )}

            {canManage && (
              <button
                type="button"
                className="member-add-row"
                onClick={() => setAdding((current) => !current)}
              >
                <span>
                  <Plus size={15} />
                </span>
                <strong>Add People</strong>
              </button>
            )}

            {adding && (
              <div className="member-add-options">
                {available.length ? (
                  available.map((user) => (
                    <button
                      type="button"
                      key={user.id}
                      onClick={() => void add(user.id)}
                    >
                      <Avatar user={user} size={27} />
                      <span>
                        {user.name}
                        {user.email && <small>{user.email}</small>}
                      </span>
                    </button>
                  ))
                ) : (
                  <p>Everyone is already in this channel.</p>
                )}
              </div>
            )}

            {filtered.map((member) => (
              <div className="member-row" key={member.userId}>
                <Avatar user={member.user} size={28} />

                <span>
                  <strong>{member.user.name}</strong>
                  {member.user.email && <small>{member.user.email}</small>}
                  <div className="member-badges">
                    {member.userId === channel.createdById && (
                      <small>Channel Creator</small>
                    )}
                    {member.userId === currentUserId && <small>You</small>}
                  </div>
                </span>

                {(canManage || member.userId === currentUserId) &&
                  member.userId !== channel.createdById && (
                    <button
                      type="button"
                      className="member-remove"
                      title={
                        member.userId === currentUserId
                          ? "Leave channel"
                          : "Remove member"
                      }
                      onClick={() => void remove(member.userId)}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
              </div>
            ))}

            {error && <p className="form-error">{error}</p>}
          </div>

          <footer className="panel-footer">
            <button
              type="button"
              className="primary-button"
              onClick={() => setPermissions(true)}
            >
              Sharing &amp; Permissions
            </button>
          </footer>
        </>
      ) : (
        <div className="permissions-panel">
          <button
            type="button"
            className="permissions-back"
            onClick={() => setPermissions(false)}
          >
            ← Back to followers
          </button>

          <div className="permissions-hero">
            <span>
              <ShieldCheck size={24} />
            </span>
            <h3>Sharing &amp; Permissions</h3>
            <p>Control who can discover and participate in this channel.</p>
          </div>

          <div className="permission-card">
            <div>
              <span className="permission-icon">
                {channel.isPrivate ? (
                  <LockKeyhole size={17} />
                ) : (
                  <Users size={17} />
                )}
              </span>
              <div>
                <strong>
                  {channel.isPrivate ? "Private channel" : "Workspace channel"}
                </strong>
                <p>
                  {channel.isPrivate
                    ? "Only invited members can open this channel."
                    : "Workspace members can discover this channel."}
                </p>
              </div>
            </div>
            <Check size={18} />
          </div>

          <div className="permission-card">
            <div>
              <span className="permission-icon">
                <Users size={17} />
              </span>
              <div>
                <strong>{members.length} members</strong>
                <p>
                  {canManage
                    ? "You can add or remove channel members from the Followers view."
                    : "Only the channel creator or workspace admins can manage other members."}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

"use client";

import {
  Bell,
  BellOff,
  Copy,
  Pencil,
  Settings2,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";

import type { Channel } from "@/lib/rundesk/types";

interface Props {
  channel: Channel;
  muted: boolean;
  canDelete: boolean;

  onClose: () => void;
  onDetails: () => void;
  onEdit: () => void;
  onMembers: () => void;
  onToggleMute: () => void;
  onDelete: () => void;
}

export default function ChannelActionsMenu({
  channel,
  muted,
  canDelete,
  onClose,
  onDetails,
  onEdit,
  onMembers,
  onToggleMute,
  onDelete,
}: Props) {
  const isChannel = channel.type === "CHANNEL";

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(
        location.href,
      );
    } catch {
      // Clipboard access may be unavailable.
    }

    onClose();
  };

  return (
    <div
      className="channel-actions-menu clickup-channel-actions-menu"
      role="menu"
      aria-label={
        isChannel
          ? `Actions for ${channel.name}`
          : `Conversation actions for ${channel.name}`
      }
    >
      <div className="channel-actions-title">
        <strong>
          {isChannel ? "#" : ""}
          {channel.name}
        </strong>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close actions menu"
          title="Close"
        >
          <X size={14} />
        </button>
      </div>

      <button
        type="button"
        role="menuitem"
        onClick={onDetails}
      >
        <Settings2 size={15} />

        <span>
          {isChannel
            ? "Channel details"
            : "Conversation details"}
        </span>
      </button>

      <button
        type="button"
        role="menuitem"
        onClick={onMembers}
      >
        <UserPlus size={15} />
        <span>Members &amp; access</span>
      </button>

      {/* Only real workspace channels should be editable. */}
      {channel.type === "CHANNEL" && (
        <button
          type="button"
          role="menuitem"
          onClick={onEdit}
        >
          <Pencil size={15} />
          <span>Edit channel</span>
        </button>
      )}

      <button
        type="button"
        role="menuitem"
        onClick={onToggleMute}
      >
        {muted ? (
          <Bell size={15} />
        ) : (
          <BellOff size={15} />
        )}

        <span>
          {muted
            ? "Unmute notifications"
            : "Mute notifications"}
        </span>
      </button>

      <button
        type="button"
        role="menuitem"
        onClick={() => void copyLink()}
      >
        <Copy size={15} />
        <span>Copy link</span>
      </button>

      {/* Prevent the normal channel-delete action
          from appearing inside direct conversations. */}
      {canDelete && isChannel && (
        <>
          <div className="menu-separator" />

          <button
            type="button"
            role="menuitem"
            className="danger"
            onClick={onDelete}
          >
            <Trash2 size={15} />
            <span>Delete channel</span>
          </button>
        </>
      )}
    </div>
  );
}
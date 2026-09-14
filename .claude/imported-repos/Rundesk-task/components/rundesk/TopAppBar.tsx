
"use client";

import {
  Bell,
  ChevronDown,
  Command,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import type { User, WorkspaceRole } from "@/lib/rundesk/types";

interface Props {
  user: User;
  role: WorkspaceRole;
  onSearch: () => void;
  onNew: () => void;
  onNotifications: () => void;
  onAi: () => void;
  onAdmin?: () => void;
}

export default function TopAppBar({
  user,
  role,
  onSearch,
  onNew,
  onNotifications,
  onAi,
  onAdmin,
}: Props) {
  const canAdmin = role === "OWNER" || role === "ADMIN";

  return (
    <header className="top-app-bar">
      <div className="top-location">
        <strong>AURA</strong>
        <span>/</span>
        <b>Chat</b>
      </div>

      <div className="top-search-cluster">
        <button className="global-search" onClick={onSearch}>
          <Search size={17} />
          <span>Search or jump to...</span>
          <kbd>
            <Command size={11} />K
          </kbd>
        </button>

        <button className="ai-chats-pill" onClick={onAi}>
          AI Chats
          <Sparkles size={14} />
        </button>
      </div>

      <div className="top-actions">
        <button className="top-ai" title="Rundesk AI" onClick={onAi}>
          <Sparkles size={17} />
        </button>

        <button className="new-button" onClick={onNew}>
          <Plus size={16} />
          New
          <ChevronDown size={13} />
        </button>

        {canAdmin && onAdmin && (
          <button
            className="top-utility workspace-admin-button"
            onClick={onAdmin}
            aria-label="Workspace administration"
            title="Workspace administration"
          >
            <ShieldCheck size={17} />
          </button>
        )}

        <button
          className="top-utility"
          onClick={onNotifications}
          aria-label="Notifications"
        >
          <Bell size={17} />
        </button>

        <button
          className="current-avatar"
          title={`${user.name} · ${role.charAt(0) + role.slice(1).toLowerCase()}`}
        >
          {user.name
            .split(" ")
            .map((part) => part[0])
            .join("")
            .slice(0, 2)}
        </button>
      </div>
    </header>
  );
}

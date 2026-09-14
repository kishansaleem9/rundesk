
"use client";

import {
  Bell,
  ChevronDown,
  Command,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Square,
} from "lucide-react";

import { formatElapsed } from "@/lib/rundesk/time";
import type { TimeEntry, User, WorkspaceRole } from "@/lib/rundesk/types";

interface Props {
  user: User;
  role: WorkspaceRole;
  onSearch: () => void;
  onNew: () => void;
  onNotifications: () => void;
  onAi: () => void;
  onAdmin?: () => void;
  /** The user's running timer, shown as a pill with a live clock and Stop. */
  timer?: TimeEntry | null;
  timerSeconds?: number;
  timerBusy?: boolean;
  /** Transient "Saved 1h 5m on “…”" or error text shown where the pill sits. */
  timerNotice?: { text: string; error?: boolean } | null;
  onStopTimer?: () => void;
  onOpenTimerTask?: (taskId: string) => void;
}

export default function TopAppBar({
  user,
  role,
  onSearch,
  onNew,
  onNotifications,
  onAi,
  onAdmin,
  timer = null,
  timerSeconds = 0,
  timerBusy = false,
  timerNotice = null,
  onStopTimer,
  onOpenTimerTask,
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
        {timer ? (
          <div className="timesheet-running-pill top-timer-pill" title={`Tracking “${timer.task.title}”`}>
            <i aria-hidden="true" />
            <button
              type="button"
              className="timesheet-running-task top-timer-task"
              title="Open task"
              onClick={() => onOpenTimerTask?.(timer.taskId)}
            >
              {timer.task.title}
            </button>
            <strong>{formatElapsed(timerSeconds)}</strong>
            <button
              type="button"
              className="timesheet-stop"
              title="Stop timer"
              disabled={timerBusy}
              onClick={onStopTimer}
            >
              <Square size={12} />
              Stop
            </button>
          </div>
        ) : timerNotice ? (
          <span
            className={timerNotice.error ? "top-timer-notice is-error" : "top-timer-notice"}
            role="status"
          >
            {timerNotice.text}
          </span>
        ) : null}

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

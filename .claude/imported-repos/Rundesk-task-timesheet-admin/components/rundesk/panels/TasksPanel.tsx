"use client";

import { Edit3, Play, Square, Trash2, X } from "lucide-react";

import { canTrackTime } from "@/lib/rundesk/timer";
import type { Task, TimeEntry } from "@/lib/rundesk/types";

interface Props {
  title: string;
  tasks: Task[];
  currentUserId: string;
  canManageWorkspace: boolean;
  activeTimer: TimeEntry | null;
  timerBusy: boolean;
  onClose: () => void;
  /** Opens the task detail panel (title click and the edit icon). */
  onOpen: (task: Task) => void;
  onStatus: (task: Task, status: Task["status"]) => void;
  onDelete: (task: Task) => void;
  onStartTimer: (task: Task) => void;
  onStopTimer: () => void;
}

/** The task list drawer: status, a play/stop button per task, open, delete. */
export default function TasksPanel({
  title,
  tasks,
  currentUserId,
  canManageWorkspace,
  activeTimer,
  timerBusy,
  onClose,
  onOpen,
  onStatus,
  onDelete,
  onStartTimer,
  onStopTimer,
}: Props) {
  return (
    <aside className="detail-panel tasks-panel">
      <header>
        <h2>{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
      </header>

      <div className="tasks-list">
        {tasks.map((task) => {
          const running = activeTimer?.taskId === task.id;

          return (
            <article key={task.id} className={running ? "is-running" : undefined}>
              <i className={`status-${task.status.toLowerCase()}`} />

              <div>
                <button
                  type="button"
                  className="tasks-open"
                  title="Open task"
                  onClick={() => onOpen(task)}
                >
                  <strong>{task.title}</strong>
                </button>
                <span>
                  {task.assignees.map((assignee) => assignee.user.name).join(", ") || "Unassigned"}
                  {task.dueDate ? ` · Due ${new Date(task.dueDate).toLocaleDateString()}` : ""}
                </span>
              </div>

              <select
                value={task.status}
                aria-label="Status"
                onChange={(event) => onStatus(task, event.target.value as Task["status"])}
              >
                <option>TODO</option>
                <option>IN_PROGRESS</option>
                <option>COMPLETE</option>
              </select>

              {canTrackTime(task, currentUserId, canManageWorkspace) && (
                <button
                  type="button"
                  className={running ? "timesheet-track is-running" : "timesheet-track"}
                  title={running ? "Stop timer" : "Track time"}
                  aria-label={running ? `Stop timer for ${task.title}` : `Track time on ${task.title}`}
                  disabled={timerBusy}
                  onClick={() => (running ? onStopTimer() : onStartTimer(task))}
                >
                  {running ? <Square size={12} /> : <Play size={12} />}
                </button>
              )}

              <button type="button" title="Edit task" onClick={() => onOpen(task)}>
                <Edit3 size={14} />
              </button>
              <button
                type="button"
                title="Delete task"
                className="danger"
                onClick={() => onDelete(task)}
              >
                <Trash2 size={14} />
              </button>
            </article>
          );
        })}

        {!tasks.length && <p>No tasks in this view.</p>}
      </div>
    </aside>
  );
}

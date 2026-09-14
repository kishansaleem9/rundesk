"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  CircleDot,
  Clock3,
  FileText,
  Flag,
  LoaderCircle,
  Play,
  Plus,
  Square,
  Timer,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

import Avatar from "@/components/rundesk/Avatar";
import TimeEntryDialog from "@/components/timesheets/TimeEntryDialog";
import { useFlash } from "@/components/timesheets/useFlash";
import { ApiError, api } from "@/lib/rundesk/api";
import { formatDuration, formatElapsed, toDayKey } from "@/lib/rundesk/time";
import { canTrackTime, timesheetsHref } from "@/lib/rundesk/timer";
import type { Task, TaskDetailResponse, TimeEntry, User } from "@/lib/rundesk/types";

const STATUS_LABEL: Record<Task["status"], string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  COMPLETE: "Complete",
};

const PRIORITY_LABEL: Record<Task["priority"], string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
};

type SavingField =
  | "title"
  | "description"
  | "status"
  | "priority"
  | "dueDate"
  | "assigneeIds"
  | "delete"
  | null;

interface Props {
  taskId: string;
  /** Cached copy from the task list or bootstrap, for an instant first paint. */
  initialTask?: Task;
  currentUser: User;
  canManageWorkspace: boolean;
  /** Workspace members, for the assignee picker. */
  users: User[];
  activeTimer: TimeEntry | null;
  runningSeconds: number;
  timerBusy: boolean;
  onClose: () => void;
  /** Shown as a back arrow when the panel was opened from a list. */
  onBack?: () => void;
  /** Resolves with an error message to show inline, or null on success. */
  onStartTimer: (task: Pick<Task, "id" | "title">) => Promise<string | null>;
  /** Resolves with the finished entry, or null. */
  onStopTimer: () => Promise<TimeEntry | null>;
  onUpdated: (task: Task) => void;
  onDeleted: (task: Task) => void;
}

/**
 * Slide-over with one task's details: editable title and description, the
 * Status / Priority / Due date / Assignees rows, and Track time (timer,
 * tracked total, manual entry). Edits save on change or blur through
 * PATCH /api/tasks/:id; the server stays authoritative for permissions.
 */
export default function TaskDetailPanel({
  taskId,
  initialTask,
  currentUser,
  canManageWorkspace,
  users,
  activeTimer,
  runningSeconds,
  timerBusy,
  onClose,
  onBack,
  onStartTimer,
  onStopTimer,
  onUpdated,
  onDeleted,
}: Props) {
  const [detail, setDetail] = useState<TaskDetailResponse | null>(null);
  const [loadError, setLoadError] = useState<{ status: number; message: string } | null>(null);
  const [title, setTitle] = useState(initialTask?.title ?? "");
  const [description, setDescription] = useState(initialTask?.description ?? "");
  const dirty = useRef({ title: false, description: false });
  const [saving, setSaving] = useState<SavingField>(null);
  const [saveError, setSaveError] = useState("");
  const [assigneesOpen, setAssigneesOpen] = useState(false);
  /** Day key the "Add time" dialog opens on; null while closed. */
  const [addingTimeOn, setAddingTimeOn] = useState<string | null>(null);
  const [timeError, setTimeError] = useState("");
  const [timeNotice, flashTime] = useFlash(2600);
  const [reloadKey, setReloadKey] = useState(0);
  const [timesheetsLink] = useState(() => timesheetsHref());

  const task: Task | null = detail ?? initialTask ?? null;
  const activeTimerId = activeTimer?.id ?? null;

  // Load on open and again whenever the running timer changes, so the tracked
  // total picks up a stop from anywhere (top bar, another tab).
  useEffect(() => {
    let cancelled = false;

    api<TaskDetailResponse>(`/api/tasks/${taskId}`)
      .then((next) => {
        if (cancelled) {
          return;
        }

        setDetail(next);
        setLoadError(null);

        if (!dirty.current.title) {
          setTitle(next.title);
        }

        if (!dirty.current.description) {
          setDescription(next.description ?? "");
        }
      })
      .catch((reason) => {
        if (cancelled) {
          return;
        }

        setLoadError({
          status: reason instanceof ApiError ? reason.status : 500,
          message: reason instanceof Error ? reason.message : "Could not load the task",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [taskId, activeTimerId, reloadKey]);

  const canEdit = detail
    ? detail.permissions.canEdit
    : task
      ? canTrackTime(task, currentUser.id, canManageWorkspace)
      : false;
  const canDelete = detail?.permissions.canDelete ?? false;
  const runningHere = Boolean(task && activeTimer?.taskId === task.id);
  const liveRunning = runningHere ? runningSeconds : 0;
  const totalSeconds = (detail?.time.totalSeconds ?? 0) + liveRunning;
  const myTotalSeconds = (detail?.time.myTotalSeconds ?? 0) + liveRunning;
  // "you Xh" only when the viewer has time of their own that is not the whole total.
  const showMine = detail
    ? myTotalSeconds > 0 && detail.time.myTotalSeconds !== detail.time.totalSeconds
    : false;
  const assigned = new Set(task?.assignees.map((assignee) => assignee.userId) ?? []);
  const dueDay = task?.dueDate ? toDayKey(new Date(task.dueDate)) : "";
  const creator = task ? users.find((user) => user.id === task.createdById) : undefined;

  async function patch(field: Exclude<SavingField, null | "delete">, body: Record<string, unknown>) {
    if (!task) {
      return false;
    }

    setSaving(field);
    setSaveError("");

    try {
      const updated = await api<Task>(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });

      setDetail((current) => (current ? { ...current, ...updated } : current));
      onUpdated(updated);

      return true;
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : "Could not save the task");
      // Resync in case the optimistic value on screen is now wrong.
      setReloadKey((current) => current + 1);

      return false;
    } finally {
      setSaving(null);
    }
  }

  // The field's current DOM value is passed in rather than read from state, so
  // a blur that lands in the same tick as the last keystroke still saves.
  async function saveTitle(value: string) {
    if (!task) {
      return;
    }

    const next = value.trim();
    dirty.current.title = false;

    if (!next || next === task.title) {
      setTitle(task.title);
      return;
    }

    if (!(await patch("title", { title: next }))) {
      setTitle(task.title);
    }
  }

  async function saveDescription(value: string) {
    if (!task) {
      return;
    }

    const next = value.trim();
    dirty.current.description = false;

    if (next === (task.description ?? "")) {
      setDescription(task.description ?? "");
      return;
    }

    if (!(await patch("description", { description: next || null }))) {
      setDescription(task.description ?? "");
    }
  }

  function onTitleKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === "Escape" && task) {
      setTitle(task.title);
      dirty.current.title = false;
      event.currentTarget.blur();
    }
  }

  function onDescriptionKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.currentTarget.blur();
    }
  }

  /** Optimistic select change: show the new value, then save it. */
  function changeField(field: "status" | "priority", value: string) {
    setDetail((current) => (current ? { ...current, [field]: value } : current));
    void patch(field, { [field]: value });
  }

  function toggleAssignee(userId: string) {
    const next = new Set(assigned);

    if (next.has(userId)) {
      next.delete(userId);
    } else {
      next.add(userId);
    }

    void patch("assigneeIds", { assigneeIds: [...next] });
  }

  async function start() {
    if (!task) {
      return;
    }

    setTimeError("");
    const message = await onStartTimer({ id: task.id, title: task.title });
    setTimeError(message ?? "");
  }

  async function stop() {
    setTimeError("");
    const entry = await onStopTimer();

    if (entry) {
      flashTime(`Saved ${formatDuration(entry.durationSeconds)} on “${entry.task.title}”`);
      // Keep the total from dipping while the reload is in flight.
      setDetail(
        (current) =>
          current && {
            ...current,
            time: {
              ...current.time,
              totalSeconds: current.time.totalSeconds + entry.durationSeconds,
              myTotalSeconds: current.time.myTotalSeconds + entry.durationSeconds,
              entriesCount: current.time.entriesCount + 1,
              running: null,
            },
          },
      );
    }
  }

  async function remove() {
    if (!task || !confirm(`Delete task “${task.title}”?`)) {
      return;
    }

    setSaving("delete");
    setSaveError("");

    try {
      await api<void>(`/api/tasks/${task.id}`, { method: "DELETE" });
      onDeleted(task);
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : "Could not delete the task");
    } finally {
      setSaving(null);
    }
  }

  return (
    <aside className="detail-panel task-detail" aria-label="Task details">
      <header>
        {onBack && (
          <button type="button" className="task-detail-back" onClick={onBack} aria-label="Back">
            <ArrowLeft size={16} />
          </button>
        )}
        <div>
          <h2>Task</h2>
          <span>
            {task?.channel ? `#${task.channel.name}` : "No channel"}
            {task ? ` · ${STATUS_LABEL[task.status]}` : ""}
          </span>
        </div>
        <span className="task-detail-saving" aria-live="polite">
          {saving && saving !== "delete" && <LoaderCircle className="spin" size={12} />}
        </span>
        <button type="button" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
      </header>

      <div className="details-body task-detail-body">
        {!task && !loadError && (
          <div className="panel-center">
            <LoaderCircle className="spin" />
          </div>
        )}

        {!task && loadError && (
          <div className="panel-empty">
            <span className="empty-icon">
              <FileText size={28} />
            </span>
            <strong>
              {loadError.status === 404
                ? "Task not found"
                : loadError.status === 403
                  ? "You don't have access to this task"
                  : "Couldn't load this task"}
            </strong>
            <p>{loadError.status === 404 ? "It may have been deleted." : loadError.message}</p>
          </div>
        )}

        {task && (
          <>
            <input
              className="task-detail-title"
              aria-label="Task name"
              value={title}
              disabled={!canEdit}
              maxLength={200}
              onChange={(event) => {
                dirty.current.title = true;
                setTitle(event.target.value);
              }}
              onBlur={(event) => void saveTitle(event.currentTarget.value)}
              onKeyDown={onTitleKey}
            />

            {saveError && <p className="form-error task-detail-error">{saveError}</p>}

            <textarea
              className="task-detail-desc"
              aria-label="Description"
              placeholder={canEdit ? "Add a description…" : "No description"}
              value={description}
              disabled={!canEdit}
              maxLength={5000}
              onChange={(event) => {
                dirty.current.description = true;
                setDescription(event.target.value);
              }}
              onBlur={(event) => void saveDescription(event.currentTarget.value)}
              onKeyDown={onDescriptionKey}
            />

            <dl>
              <div>
                <dt>
                  <CircleDot size={14} aria-hidden="true" />
                  Status
                </dt>
                <dd>
                  <select
                    aria-label="Status"
                    value={task.status}
                    disabled={!canEdit}
                    onChange={(event) => changeField("status", event.target.value)}
                  >
                    {(Object.keys(STATUS_LABEL) as Task["status"][]).map((value) => (
                      <option key={value} value={value}>
                        {STATUS_LABEL[value]}
                      </option>
                    ))}
                  </select>
                </dd>
              </div>

              <div>
                <dt>
                  <Flag size={14} aria-hidden="true" />
                  Priority
                </dt>
                <dd>
                  <select
                    aria-label="Priority"
                    value={task.priority}
                    disabled={!canEdit}
                    onChange={(event) => changeField("priority", event.target.value)}
                  >
                    {(Object.keys(PRIORITY_LABEL) as Task["priority"][]).map((value) => (
                      <option key={value} value={value}>
                        {PRIORITY_LABEL[value]}
                      </option>
                    ))}
                  </select>
                </dd>
              </div>

              <div>
                <dt>
                  <Calendar size={14} aria-hidden="true" />
                  Due date
                </dt>
                <dd>
                  <input
                    type="date"
                    aria-label="Due date"
                    value={dueDay}
                    disabled={!canEdit}
                    onChange={(event) => void patch("dueDate", { dueDate: event.target.value || null })}
                  />
                  {dueDay && canEdit && (
                    <button
                      type="button"
                      className="task-time-link"
                      title="Clear due date"
                      aria-label="Clear due date"
                      onClick={() => void patch("dueDate", { dueDate: null })}
                    >
                      <X size={12} aria-hidden="true" />
                    </button>
                  )}
                </dd>
              </div>

              <div>
                <dt>
                  <Users size={14} aria-hidden="true" />
                  Assignees
                </dt>
                <dd className="task-assignees">
                  {task.assignees.slice(0, 4).map((assignee) => (
                    <Avatar key={assignee.userId} user={assignee.user} size={20} />
                  ))}
                  <span>
                    {task.assignees.map((assignee) => assignee.user.name).join(", ") || "Unassigned"}
                  </span>
                  {canEdit && (
                    <button
                      type="button"
                      className="task-assignee-edit"
                      aria-expanded={assigneesOpen}
                      onClick={() => setAssigneesOpen((current) => !current)}
                    >
                      {assigneesOpen ? "Done" : "Edit"}
                    </button>
                  )}
                </dd>
              </div>

              {assigneesOpen && (
                <div className="task-assignee-picker-row">
                  <div className="task-assignee-picker" role="group" aria-label="Assignees">
                    {users.map((user) => (
                      <label key={user.id}>
                        <input
                          type="checkbox"
                          checked={assigned.has(user.id)}
                          disabled={saving === "assigneeIds"}
                          onChange={() => toggleAssignee(user.id)}
                        />
                        <Avatar user={user} size={18} />
                        {user.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="task-time-row">
                <dt>
                  <Timer size={14} aria-hidden="true" />
                  Track time
                </dt>
                <dd>
                  {(canEdit || runningHere) && (
                    <button
                      type="button"
                      className={runningHere ? "timesheet-track is-running" : "timesheet-track"}
                      disabled={timerBusy}
                      title={runningHere ? "Stop timer" : "Start timer"}
                      aria-label={runningHere ? "Stop timer" : `Start timer on ${task.title}`}
                      onClick={() => void (runningHere ? stop() : start())}
                    >
                      {runningHere ? <Square size={12} /> : <Play size={12} />}
                    </button>
                  )}

                  {runningHere && (
                    <strong className="task-time-clock">{formatElapsed(runningSeconds)}</strong>
                  )}

                  <span className="task-time-total" title="Tracked by everyone on this task">
                    {detail ? formatDuration(totalSeconds) : "…"}
                    {showMine ? ` · you ${formatDuration(myTotalSeconds)}` : ""}
                  </span>

                  {canEdit && (
                    <button
                      type="button"
                      className="task-time-link"
                      onClick={() => setAddingTimeOn(toDayKey(new Date()))}
                    >
                      <Plus size={12} aria-hidden="true" />
                      Add time
                    </button>
                  )}
                </dd>
              </div>
            </dl>

            {timeError && <p className="form-error task-detail-error">{timeError}</p>}
            {timeNotice && (
              <p className="task-detail-notice" role="status">
                {timeNotice}
              </p>
            )}

            <Link href={timesheetsLink} className="task-time-link task-time-timesheets">
              <Clock3 size={12} aria-hidden="true" />
              View in Timesheets
            </Link>

            <p className="task-detail-meta">
              Created by {creator?.name ?? "Unknown"} ·{" "}
              {new Date(task.createdAt).toLocaleDateString()}
              {detail
                ? ` · ${detail.time.entriesCount} time ${detail.time.entriesCount === 1 ? "entry" : "entries"}`
                : ""}
            </p>
          </>
        )}
      </div>

      {task && canDelete && (
        <footer className="panel-footer task-detail-footer">
          <span className="task-detail-meta">
            Updated {new Date(task.updatedAt).toLocaleDateString()}
          </span>
          <button
            type="button"
            className="danger task-detail-delete"
            disabled={saving === "delete"}
            onClick={() => void remove()}
          >
            <Trash2 size={14} aria-hidden="true" />
            {saving === "delete" ? "Deleting…" : "Delete task"}
          </button>
        </footer>
      )}

      {addingTimeOn &&
        task &&
        createPortal(
          <TimeEntryDialog
            tasks={[{ id: task.id, title: task.title }]}
            initialTaskId={task.id}
            initialDay={addingTimeOn}
            onClose={() => setAddingTimeOn(null)}
            onSaved={() => {
              setAddingTimeOn(null);
              flashTime("Time added");
              setReloadKey((current) => current + 1);
            }}
          />,
          document.body,
        )}
    </aside>
  );
}

"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Filter,
  Flag,
  LayoutGrid,
  List as ListIcon,
  Plus,
  RefreshCw,
  Search,
  Share2,
  Table2,
  UserPlus,
} from "lucide-react";
import { PRIORITY_META } from "@/lib/store";
import type { Folder, StatusDefinition, Task, TaskPriority, TaskStatus } from "@/lib/types";
import { formatDate } from "@/lib/utils";

interface TaskListViewProps {
  folder: Folder;
  spaceName: string;
  projectName: string;
  listName: string;
  statuses: StatusDefinition[];
  onCreateTask: (title: string, status: TaskStatus) => void;
  onOpenTask: (taskId: string) => void;
  onUpdateTask: (task: Task) => void;
}

type ViewMode = "list" | "board" | "table" | "calendar";
type SortMode = "created" | "updated" | "name" | "due";


function AddTaskInline({
  status,
  onCreate,
}: {
  status: TaskStatus;
  onCreate: (title: string, status: TaskStatus) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");

  if (!editing) {
    return (
      <button
        className="add-task-row"
        onClick={() => setEditing(true)}
      >
        <Plus size={18} />
        Add task
      </button>
    );
  }

  return (
    <form
      className="add-task-form"
      onSubmit={(event) => {
        event.preventDefault();

        const title = value.trim();

        if (!title) return;

        onCreate(title, status);
        setValue("");
        setEditing(false);
      }}
    >
      <Circle size={19} />

      <input
        autoFocus
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setEditing(false);
        }}
        placeholder="Task name"
      />

      <button className="primary-button compact" type="submit">
        Add
      </button>
    </form>
  );
}

function TaskRow({
  task,
  onOpen,
  onUpdate,
  showPriority,
  showDueDate,
}: {
  task: Task;
  onOpen: () => void;
  onUpdate: (task: Task) => void;
  showPriority: boolean;
  showDueDate: boolean;
}) {
  const [editingAssignee, setEditingAssignee] = useState(false);
  const [assigneeDraft, setAssigneeDraft] = useState("");

  const saveAssignee = () => {
    const nextAssignee = assigneeDraft.trim();

    onUpdate({
      ...task,
      assignee: nextAssignee,
      updatedAt: new Date().toISOString(),
    });

    setEditingAssignee(false);
  };

  const updatePriority = (priority: TaskPriority) => {
    onUpdate({
      ...task,
      priority,
      updatedAt: new Date().toISOString(),
    });
  };

  const updateDueDate = (dueDate: string) => {
    onUpdate({
      ...task,
      dueDate,
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <div
      className="task-row"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter") onOpen();
      }}
    >
      {/* The task circle now opens the task details drawer. */}
      <button
        className="complete-toggle task-open-dot"
        title="Open task details"
        aria-label={`Open ${task.title}`}
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
      >
        {task.status === "COMPLETE" ? (
          <CheckCircle2 size={21} />
        ) : (
          <Circle size={21} />
        )}
      </button>

      <div
        className={`task-title ${
          task.status === "COMPLETE" ? "done" : ""
        }`}
      >
        {task.title}
      </div>

      {showPriority && (
        <div
          className={`task-priority-cell inline-priority priority-text-${task.priority.toLowerCase()}`}
          onClick={(event) => event.stopPropagation()}
        >
          <Flag
            size={17}
            className={`priority-${task.priority.toLowerCase()}`}
          />

          <select
            aria-label={`Priority for ${task.title}`}
            value={task.priority}
            onChange={(event) =>
              updatePriority(event.target.value as TaskPriority)
            }
          >
            <option value="NORMAL">Normal</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
            <option value="LOW">Low</option>
          </select>
        </div>
      )}

      {showDueDate && (
        <label
          className="task-date-cell inline-date"
          onClick={(event) => event.stopPropagation()}
        >
          <CalendarDays size={16} />

          <input
            type="date"
            aria-label={`Due date for ${task.title}`}
            value={task.dueDate}
            onChange={(event) => updateDueDate(event.target.value)}
          />
        </label>
      )}

      <div
        className="task-assignee-cell inline-assignee"
        onClick={(event) => event.stopPropagation()}
      >
        {editingAssignee ? (
          <form
            className="assignee-editor"
            onSubmit={(event) => {
              event.preventDefault();
              saveAssignee();
            }}
          >
            <input
              autoFocus
              value={assigneeDraft}
              placeholder="Person name"
              aria-label={`Assignee for ${task.title}`}
              onChange={(event) => setAssigneeDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setEditingAssignee(false);
                }
              }}
            />

            <button type="submit" title="Save assignee">
              <Check size={15} />
            </button>
          </form>
        ) : (
          <button
            className={`assignee-button ${task.assignee ? "has-assignee" : ""}`}
            title={task.assignee ? `Assigned to ${task.assignee}` : "Add assignee"}
            onClick={() => {
              setAssigneeDraft(task.assignee);
              setEditingAssignee(true);
            }}
          >
            {task.assignee ? (
              <>
                <span className="avatar-small">
                  {task.assignee.slice(0, 1).toUpperCase()}
                </span>
                <span className="assignee-name">{task.assignee}</span>
              </>
            ) : (
              <span className="avatar-empty">
                <UserPlus size={14} />
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export default function TaskListView({
  folder,
  spaceName,
  projectName,
  listName,
  statuses,
  onCreateTask,
  onOpenTask,
  onUpdateTask,
}: TaskListViewProps) {
  const statusIds = useMemo(() => statuses.map((status) => status.id), [statuses]);
  const [view, setView] = useState<ViewMode>("list");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    TaskStatus | "ALL"
  >("ALL");
  const [sortMode, setSortMode] = useState<SortMode>("created");
  const [showPriority, setShowPriority] = useState(true);
  const [showDueDate, setShowDueDate] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<TaskStatus>>(new Set());
  const [quickTitle, setQuickTitle] = useState("");

  const filteredTasks = useMemo(() => {
    let tasks = folder.tasks.filter((task) =>
      task.title.toLowerCase().includes(search.trim().toLowerCase())
    );

    if (statusFilter !== "ALL") {
      tasks = tasks.filter((task) => task.status === statusFilter);
    }

    return [...tasks].sort((a, b) => {
      if (sortMode === "name") {
        return a.title.localeCompare(b.title);
      }

      if (sortMode === "due") {
        return (a.dueDate || "9999").localeCompare(
          b.dueDate || "9999"
        );
      }

      if (sortMode === "updated") {
        return b.updatedAt.localeCompare(a.updatedAt);
      }

      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [folder.tasks, search, statusFilter, sortMode]);

  const submitQuickTask = () => {
    const title = quickTitle.trim();

    if (!title) return;

    onCreateTask(title, "TODO");
    setQuickTitle("");
  };

  const shareFolder = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      window.alert("Folder link copied.");
    } catch {
      window.alert("Copy this page URL to share the folder.");
    }
  };

  return (
    <main className="content-shell">
      <div className="breadcrumb-bar">
        <span>{spaceName}</span>
        <ChevronRight size={15} />
        <span>{projectName}</span>
        <ChevronRight size={15} />
        <span>{listName}</span>
        <ChevronRight size={15} />
        <strong>{folder.name}</strong>

        <div className="global-search">
          <Search size={18} />
          <span>Search or jump to...</span>
          <kbd>⌘K</kbd>
        </div>

        <button className="new-top-button">
          <Plus size={17} />
          New
        </button>
      </div>

      <div className="list-title-row">
        <div>
          <h1>{folder.name}</h1>
          <span>
            {folder.tasks.length}{" "}
            {folder.tasks.length === 1 ? "task" : "tasks"}
          </span>
        </div>

        <button className="soft-button" onClick={shareFolder}>
          <Share2 size={16} />
          Share
        </button>

        <div className="quick-task-wrap">
          <input
            value={quickTitle}
            onChange={(event) => setQuickTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submitQuickTask();
            }}
            placeholder="Quick add task..."
          />

          <select
            defaultValue="NORMAL"
            aria-label="Quick task priority"
          >
            <option value="NORMAL">Normal</option>
          </select>

          <input
            className="quick-date"
            type="date"
            aria-label="Quick task due date"
          />

          <button
            className="primary-button"
            onClick={submitQuickTask}
          >
            Add task
          </button>
        </div>
      </div>

      <div className="view-tabs-row">
        <div className="view-tabs">
          <button
            className={view === "list" ? "active" : ""}
            onClick={() => setView("list")}
          >
            <ListIcon size={16} />
            List
          </button>

          <button
            className={view === "board" ? "active" : ""}
            onClick={() => setView("board")}
          >
            <LayoutGrid size={16} />
            Board
          </button>

          <button
            className={view === "table" ? "active" : ""}
            onClick={() => setView("table")}
          >
            <Table2 size={16} />
            Table
          </button>

          <button
            className={view === "calendar" ? "active" : ""}
            onClick={() => setView("calendar")}
          >
            <CalendarDays size={16} />
            Calendar
          </button>
        </div>
      </div>

      <div className="toolbar">
        <label className="toolbar-search">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search tasks..."
          />
        </label>

        <select
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(event.target.value as TaskStatus | "ALL")
          }
        >
          <option value="ALL">All statuses</option>

          {statusIds.map((status) => (
            <option value={status} key={status}>
              {statuses.find((item) => item.id === status)?.label ?? status}
            </option>
          ))}
        </select>

        <button className="toolbar-button">
          <Filter size={17} />
          Filter
        </button>

        <select
          value={sortMode}
          onChange={(event) =>
            setSortMode(event.target.value as SortMode)
          }
        >
          <option value="created">Created</option>
          <option value="updated">Updated</option>
          <option value="name">Name</option>
          <option value="due">Due date</option>
        </select>

        <button className="toolbar-button">
          <ArrowDown size={17} />
        </button>

        <select defaultValue="status">
          <option value="status">By status</option>
        </select>

        <div className="fields-menu">
          <button className="toolbar-button">
            Fields ({Number(showPriority) + Number(showDueDate)}/2)
          </button>

          <div className="fields-popover">
            <label>
              <input
                type="checkbox"
                checked={showPriority}
                onChange={(event) =>
                  setShowPriority(event.target.checked)
                }
              />
              Priority
            </label>

            <label>
              <input
                type="checkbox"
                checked={showDueDate}
                onChange={(event) =>
                  setShowDueDate(event.target.checked)
                }
              />
              Due date
            </label>
          </div>
        </div>

        <div className="toolbar-second-line">
          <button className="toolbar-button">Statuses</button>
          <button className="toolbar-button">Email</button>
          <span className="updated-text">Updated just now</span>

          <select defaultValue="none">
            <option value="none">No auto-refresh</option>
            <option value="30">Every 30 sec</option>
          </select>

          <button className="toolbar-button">
            <RefreshCw size={17} />
          </button>
        </div>
      </div>

      <section className="task-canvas">
        {view === "list" && (
          <>
            <div className="task-table-header">
              <span>Title</span>
              {showPriority && <span>Priority</span>}
              {showDueDate && <span>Due date</span>}
              <span>Assignees</span>
            </div>

            <div className="status-groups">
              {statusIds
                .filter(
                  (status) =>
                    statusFilter === "ALL" || statusFilter === status
                )
                .map((status) => {
                  const tasks = filteredTasks.filter(
                    (task) => task.status === status
                  );
                  const isCollapsed = collapsed.has(status);

                  return (
                    <div className="status-group" key={status}>
                      <button
                        className="status-heading"
                        onClick={() =>
                          setCollapsed((previous) => {
                            const next = new Set(previous);

                            if (next.has(status)) next.delete(status);
                            else next.add(status);

                            return next;
                          })
                        }
                      >
                        {isCollapsed ? (
                          <ChevronRight size={17} />
                        ) : (
                          <ChevronDown size={17} />
                        )}

                        <span
                          className="status-dot"
                          style={{
                            background: statuses.find((item) => item.id === status)?.color ?? "#667085",
                          }}
                        />

                        <strong>{statuses.find((item) => item.id === status)?.label ?? status}</strong>
                        <span>{tasks.length}</span>
                      </button>

                      {!isCollapsed && (
                        <div className="status-body">
                          {tasks.map((task) => (
                            <TaskRow
                              key={task.id}
                              task={task}
                              onOpen={() => onOpenTask(task.id)}
                              onUpdate={onUpdateTask}
                              showPriority={showPriority}
                              showDueDate={showDueDate}
                            />
                          ))}

                          <AddTaskInline
                            status={status}
                            onCreate={onCreateTask}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </>
        )}

        {view === "board" && (
          <div className="board-view">
            {statusIds.map((status) => (
              <div className="board-column" key={status}>
                <div className="board-column-title">
                  <span
                    className="status-dot"
                    style={{
                      background: statuses.find((item) => item.id === status)?.color ?? "#667085",
                    }}
                  />
                  <strong>{statuses.find((item) => item.id === status)?.label ?? status}</strong>
                  <span>
                    {
                      filteredTasks.filter(
                        (task) => task.status === status
                      ).length
                    }
                  </span>
                </div>

                {filteredTasks
                  .filter((task) => task.status === status)
                  .map((task) => (
                    <button
                      className="board-card"
                      key={task.id}
                      onClick={() => onOpenTask(task.id)}
                    >
                      <strong>{task.title}</strong>
                      <span>{PRIORITY_META[task.priority].label}</span>

                      {task.dueDate && (
                        <small>{formatDate(task.dueDate)}</small>
                      )}
                    </button>
                  ))}

                <AddTaskInline
                  status={status}
                  onCreate={onCreateTask}
                />
              </div>
            ))}
          </div>
        )}

        {view === "table" && (
          <div className="flat-table">
            <div className="flat-table-row flat-table-head">
              <span>Task</span>
              <span>Status</span>
              <span>Priority</span>
              <span>Due date</span>
            </div>

            {filteredTasks.map((task) => (
              <button
                className="flat-table-row"
                key={task.id}
                onClick={() => onOpenTask(task.id)}
              >
                <span>{task.title}</span>
                <span>{statuses.find((item) => item.id === task.status)?.label ?? task.status}</span>
                <span>{PRIORITY_META[task.priority].label}</span>
                <span>{formatDate(task.dueDate)}</span>
              </button>
            ))}
          </div>
        )}

        {view === "calendar" && (
          <div className="calendar-view">
            <div className="calendar-hero">
              <CalendarDays size={24} />

              <div>
                <strong>Due-date view</strong>
                <span>
                  Tasks are grouped by the dates you set in the task
                  drawer.
                </span>
              </div>
            </div>

            {filteredTasks.filter((task) => task.dueDate).length ===
            0 ? (
              <div className="calendar-empty">
                No tasks have a due date yet.
              </div>
            ) : (
              Object.entries(
                filteredTasks
                  .filter((task) => task.dueDate)
                  .reduce<Record<string, Task[]>>(
                    (groups, task) => {
                      (groups[task.dueDate] ??= []).push(task);
                      return groups;
                    },
                    {}
                  )
              )
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([date, tasks]) => (
                  <div className="calendar-day" key={date}>
                    <h3>{formatDate(date)}</h3>

                    {tasks.map((task) => (
                      <button
                        key={task.id}
                        onClick={() => onOpenTask(task.id)}
                      >
                        {task.title}
                      </button>
                    ))}
                  </div>
                ))
            )}
          </div>
        )}
      </section>
    </main>
  );
}

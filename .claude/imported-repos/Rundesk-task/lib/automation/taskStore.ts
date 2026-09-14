/**
 * TaskStore — the boundary between the automation engine and Rundesk's task
 * data. Action handlers never touch a database directly; they call this
 * interface. In the prototype an in-memory implementation with seeded tasks is
 * used. For integration, implement `TaskStore` on top of the real Rundesk task
 * service (Prisma models, server actions, etc.) and swap it in `deps.ts`.
 */

import type { NewTaskInput, Notification, Task, TaskComment } from "./types";

export interface TaskStore {
  get(taskId: string): Promise<Task | null>;
  list(workspaceId: string): Promise<Task[]>;
  create(input: NewTaskInput): Promise<Task>;
  update(taskId: string, patch: Partial<Omit<Task, "id" | "comments">>): Promise<Task>;
  addComment(taskId: string, comment: Omit<TaskComment, "id" | "createdAt">): Promise<Task>;
  notify(n: Omit<Notification, "id" | "createdAt">): Promise<Notification>;
  listNotifications(workspaceId: string): Promise<Notification[]>;
  /** Restore seed data (used by tests and the demo "reset" button). */
  reset(): void;
}

/* ------------------------------------------------------------------ */
/* In-memory implementation with mock data                             */
/* ------------------------------------------------------------------ */

export const DEMO_WORKSPACE_ID = "ws_aura";

const nowIso = () => new Date().toISOString();
let counter = 0;
const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}`;

const baseTask = (t: Partial<Task> & Pick<Task, "id" | "listId" | "title">): Task => ({
  workspaceId: DEMO_WORKSPACE_ID,
  status: "todo",
  priority: "normal",
  assigneeId: null,
  tags: [],
  dueDate: null,
  comments: [],
  followers: [],
  aiFields: {},
  updatedAt: nowIso(),
  ...t,
});

/** Fresh copies of the seed tasks so `reset()` truly resets. */
export function seedTasks(): Task[] {
  const inDays = (d: number) => new Date(Date.now() + d * 86400_000).toISOString();
  return [
    baseTask({
      id: "task_1",
      listId: "list_eng",
      title: "Fix login redirect loop",
      status: "in_progress",
      priority: "urgent",
      assigneeId: "u_ali",
      tags: ["bug", "auth"],
      dueDate: inDays(3),
    }),
    baseTask({
      id: "task_2",
      listId: "list_eng",
      title: "Write API docs for webhooks",
      status: "todo",
      priority: "normal",
      tags: ["docs"],
    }),
    baseTask({
      id: "task_3",
      listId: "list_eng",
      title: "Crash when uploading large files",
      status: "todo",
      priority: "high",
      tags: ["bug"],
    }),
    baseTask({
      id: "task_4",
      listId: "list_design",
      title: "Redesign onboarding illustrations",
      status: "todo",
      priority: "normal",
      tags: ["design"],
      dueDate: inDays(10),
    }),
    baseTask({
      id: "task_5",
      listId: "list_design",
      title: "Dark mode color audit",
      status: "review",
      priority: "low",
      assigneeId: "u_sara",
      tags: ["design"],
    }),
    baseTask({
      id: "task_6",
      listId: "list_marketing",
      title: "Q4 launch announcement",
      status: "todo",
      priority: "high",
      assigneeId: "u_hamda",
      dueDate: inDays(-1), // overdue
    }),
  ];
}

export function createMemoryTaskStore(initial: Task[] = seedTasks()): TaskStore {
  let tasks = new Map(initial.map((t) => [t.id, structuredClone(t)]));
  let notifications: Notification[] = [];

  const mustGet = (id: string): Task => {
    const t = tasks.get(id);
    if (!t) throw new Error(`Task ${id} not found`);
    return t;
  };

  /** Fill defaults for fields added after a task was stored (survives hot reloads). */
  const normalize = (t: Task): Task => ({
    ...t,
    tags: t.tags ?? [],
    comments: t.comments ?? [],
    followers: t.followers ?? [],
    aiFields: t.aiFields ?? {},
  });

  return {
    async get(id) {
      const t = tasks.get(id);
      return t ? structuredClone(normalize(t)) : null;
    },
    async list(workspaceId) {
      return [...tasks.values()]
        .filter((t) => t.workspaceId === workspaceId)
        .map((t) => structuredClone(normalize(t)));
    },
    async create(input) {
      const task = baseTask({
        id: newId("task"),
        workspaceId: input.workspaceId,
        listId: input.listId,
        title: input.title,
        status: input.status ?? "todo",
        priority: input.priority ?? "normal",
        assigneeId: input.assigneeId ?? null,
        tags: input.tags ?? [],
        dueDate: input.dueDate ?? null,
      });
      tasks.set(task.id, task);
      return structuredClone(task);
    },
    async update(id, patch) {
      const t = mustGet(id);
      const next = { ...t, ...patch, updatedAt: nowIso() };
      tasks.set(id, next);
      return structuredClone(next);
    },
    async addComment(id, comment) {
      const t = mustGet(id);
      t.comments.push({ ...comment, id: newId("c"), createdAt: nowIso() });
      t.updatedAt = nowIso();
      return structuredClone(t);
    },
    async notify(n) {
      const created: Notification = { ...n, id: newId("n"), createdAt: nowIso() };
      notifications.unshift(created);
      return created;
    },
    async listNotifications(workspaceId) {
      return notifications.filter((n) => n.workspaceId === workspaceId);
    },
    reset() {
      tasks = new Map(seedTasks().map((t) => [t.id, t]));
      notifications = [];
    },
  };
}

/**
 * Process-wide singleton so Next.js dev hot-reloads and separate API routes
 * share the same mock data.
 */
// Bump the suffix whenever the Task shape changes so a dev server that was
// already running discards its stale store instead of serving old objects.
const g = globalThis as unknown as { __rundeskTaskStore_v2?: TaskStore };
export function getMemoryTaskStore(): TaskStore {
  if (!g.__rundeskTaskStore_v2) g.__rundeskTaskStore_v2 = createMemoryTaskStore();
  return g.__rundeskTaskStore_v2;
}

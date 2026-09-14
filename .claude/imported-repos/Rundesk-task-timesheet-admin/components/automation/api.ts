/**
 * Thin fetch wrappers around the automation API routes, used by the demo
 * UI. When embedding into Rundesk you may replace these with server actions;
 * the components only need the function signatures.
 */

import type { PresetPanelState, PresetState } from "@/lib/automation/presetService";
import type {
  AutomationEvent,
  AutomationRun,
  NewTaskInput,
  Notification,
  RunReport,
  Task,
  TaskPatch,
  Workflow,
  WorkflowInput,
  WorkflowPatch,
} from "@/lib/automation/types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Surface zod issues in a readable way.
    const details = Array.isArray(body.details)
      ? body.details.map((d: { path?: unknown[]; message?: string }) => `${(d.path ?? []).join(".")}: ${d.message}`).join("; ")
      : "";
    throw new Error(details ? `${body.error}: ${details}` : body.error ?? res.statusText);
  }
  return body as T;
}

export const api = {
  /* workflows */
  listWorkflows: (workspaceId: string) =>
    request<{ workflows: Workflow[] }>(`/api/automations/workflows?workspaceId=${workspaceId}`),

  createWorkflow: (input: WorkflowInput) =>
    request<{ workflow: Workflow }>("/api/automations/workflows", { method: "POST", body: JSON.stringify(input) }),

  updateWorkflow: (id: string, patch: WorkflowPatch) =>
    request<{ workflow: Workflow }>(`/api/automations/workflows/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  deleteWorkflow: (id: string) =>
    request<{ deleted: boolean }>(`/api/automations/workflows/${id}`, { method: "DELETE" }),

  /* presets */
  listPresets: (workspaceId: string, listId: string) =>
    request<PresetPanelState>(`/api/automations/presets?workspaceId=${workspaceId}&listId=${listId}`),

  togglePreset: (key: string, body: { workspaceId: string; listId: string; enabled: boolean; params?: Record<string, string> }) =>
    request<{ preset: PresetState }>(`/api/automations/presets/${key}`, { method: "POST", body: JSON.stringify(body) }),

  /* events & runs */
  fireEvent: (event: AutomationEvent) =>
    request<{ reports: RunReport[]; task: Task | null }>("/api/automations/events", { method: "POST", body: JSON.stringify(event) }),

  listRuns: (workspaceId: string, limit = 10) =>
    request<{ runs: AutomationRun[] }>(`/api/automations/runs?workspaceId=${workspaceId}&limit=${limit}`),

  /* tasks (demo) */
  listTasks: (workspaceId: string, listId?: string) =>
    request<{ tasks: Task[]; notifications: Notification[] }>(
      `/api/automations/tasks?workspaceId=${workspaceId}${listId ? `&listId=${listId}` : ""}`,
    ),

  createTask: (input: NewTaskInput) =>
    request<{ task: Task; reports: RunReport[] }>("/api/automations/tasks", { method: "POST", body: JSON.stringify(input) }),

  updateTask: (id: string, patch: TaskPatch) =>
    request<{ task: Task; reports: RunReport[] }>(`/api/automations/tasks/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  resetTasks: () => request<{ reset: boolean }>("/api/automations/tasks/reset", { method: "POST" }),
};

"use client";

/**
 * ProjectView — ClickUp-style project screen for the prototype:
 * breadcrumb + view tabs, an "Automations" toolbar button that opens the
 * automation panel, and a task list whose inline edits fire automations.
 */

import { useCallback, useEffect, useState } from "react";
import { AI_FIELD_KEYS, type AiFieldKey, type TaskPatch, type Task, type WorkflowInput } from "@/lib/automation/types";
import { CATALOG, OPTIONS } from "@/lib/automation/catalog";
import type { PresetPanelState } from "@/lib/automation/presetService";
import { api } from "../automation/api";
import { AutomationBuilder } from "../automation/AutomationBuilder";
import { AutomationPanel } from "../automation/panel/AutomationPanel";
import { ManageAutomationsModal } from "../automation/panel/ManageAutomationsModal";
import { Button, Modal, cx } from "../automation/ui";
import { TaskTable } from "./TaskTable";
import { ToastStack, type ToastItem } from "./Toast";

type ModalKind = null | "create" | "createAi" | "manage";

export function ProjectView({ workspaceId }: { workspaceId: string }) {
  const [listId, setListId] = useState(OPTIONS.lists[0].value);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [presets, setPresets] = useState<PresetPanelState | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [modal, setModal] = useState<ModalKind>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const listLabel = OPTIONS.lists.find((l) => l.value === listId)?.label ?? listId;

  /* ---------- data loading ---------- */

  const refreshTasks = useCallback(async () => {
    const { tasks } = await api.listTasks(workspaceId, listId);
    setTasks(tasks);
  }, [workspaceId, listId]);

  const refreshPresets = useCallback(async () => {
    setPresets(await api.listPresets(workspaceId, listId));
  }, [workspaceId, listId]);

  const refreshAll = useCallback(async () => {
    try {
      await Promise.all([refreshTasks(), refreshPresets()]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [refreshTasks, refreshPresets]);

  // Initial load + reload when the project changes. State is set in promise
  // callbacks only, and stale responses are ignored.
  useEffect(() => {
    let active = true;
    Promise.all([api.listTasks(workspaceId, listId), api.listPresets(workspaceId, listId)])
      .then(([t, p]) => {
        if (!active) return;
        setTasks(t.tasks);
        setPresets(p);
        setError(null);
      })
      .catch((e) => active && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      active = false;
    };
  }, [workspaceId, listId]);

  /* ---------- toasts ---------- */

  const pushToast = (title: string, reports: ToastItem["reports"]) =>
    setToasts((t) => [...t, { id: Date.now() + Math.random(), title, reports }]);
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  /* ---------- task mutations (these fire automations) ---------- */

  const updateTask = async (id: string, patch: TaskPatch) => {
    try {
      const { reports } = await api.updateTask(id, patch);
      pushToast(`Updated task · ${reports.filter((r) => r.status !== "SKIPPED").length} automation(s) ran`, reports);
      await refreshTasks();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const createTask = async (title: string) => {
    try {
      const { reports } = await api.createTask({ workspaceId, listId, title });
      pushToast(`Created "${title}" · ${reports.filter((r) => r.status !== "SKIPPED").length} automation(s) ran`, reports);
      await refreshTasks();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  /* ---------- automations ---------- */

  const togglePreset = async (key: string, enabled: boolean, params?: Record<string, string>) => {
    await api.togglePreset(key, { workspaceId, listId, enabled, params });
    await refreshPresets();
  };

  const saveWorkflow = async (input: WorkflowInput) => {
    await api.createWorkflow({ ...input, listId });
    await refreshPresets();
    setModal(null);
  };

  const closeManage = useCallback(() => setModal(null), []);
  const closeModal = useCallback(() => setModal(null), []);
  const closePanel = useCallback(() => setPanelOpen(false), []);

  // AI columns = fields whose preset is on for this project.
  const aiColumns: AiFieldKey[] = AI_FIELD_KEYS.filter((k) =>
    presets?.presets.some((p) => p.active && p.section === "ai_fields" && p.key === `ai_${k.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase())}`),
  );

  const resetDemo = async () => {
    await api.resetTasks();
    await refreshAll();
  };

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top bar */}
      <div className="border-b border-line bg-panel/60 px-6 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav className="flex items-center gap-2 text-sm text-muted">
            <span>🏠 Team Space</span>
            <span>/</span>
            <span>📁 Projects</span>
            <span>/</span>
            <select
              className="cursor-pointer rounded bg-transparent font-semibold text-fg hover:bg-panel-2 focus:outline-none"
              value={listId}
              onChange={(e) => setListId(e.target.value)}
            >
              {OPTIONS.lists.map((l) => (
                <option key={l.value} value={l.value}>
                  ☰ {l.label}
                </option>
              ))}
            </select>
            <span className="text-muted/60">☆</span>
          </nav>

          <div className="relative flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={resetDemo} title="Restore seed tasks">
              ↺ Reset demo
            </Button>
            <Button
              variant={panelOpen ? "primary" : "subtle"}
              size="sm"
              onClick={() => setPanelOpen((o) => !o)}
              aria-expanded={panelOpen}
            >
              🤖 Automations
              <span className="rounded-full bg-black/30 px-1.5 text-[10px]">{presets?.totalActive ?? "…"}</span>
            </Button>

            {panelOpen && (
              <AutomationPanel
                listLabel={listLabel}
                state={presets}
                onToggle={togglePreset}
                onCreateAutomation={() => {
                  setPanelOpen(false);
                  setModal("create");
                }}
                onCreateAiField={() => {
                  setPanelOpen(false);
                  setModal("createAi");
                }}
                onManage={() => {
                  setPanelOpen(false);
                  setModal("manage");
                }}
                onClose={closePanel}
              />
            )}
          </div>
        </div>

        {/* View tabs (decorative except List) */}
        <div className="mt-3 flex items-center gap-1 text-xs">
          {["Board", "List", "Calendar", "Gantt", "Table"].map((v) => (
            <span
              key={v}
              className={cx(
                "rounded-md px-2.5 py-1",
                v === "List" ? "border-b-2 border-accent font-semibold text-fg" : "text-muted",
              )}
            >
              {v}
            </span>
          ))}
          <span className="px-2.5 py-1 text-muted">+ View</span>
        </div>
      </div>

      {/* Body */}
      <main className="flex-1 px-6 py-5">
        {error && (
          <p className="mb-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
        )}
        <TaskTable tasks={tasks} aiColumns={aiColumns} onUpdate={updateTask} onCreate={createTask} />
        <p className="mt-3 text-xs text-muted">
          Edit any cell or add a task — matching automations run immediately and appear as toasts. Open{" "}
          <span className="text-fg">🤖 Automations</span> to turn presets on for <span className="text-fg">{listLabel}</span>.
        </p>
      </main>

      {/* Modals */}
      {(modal === "create" || modal === "createAi") && (
        <Modal
          title={modal === "createAi" ? "Create AI Field" : "Create Automation"}
          subtitle={`Applies to tasks in ${listLabel}`}
          onClose={closeModal}
        >
          <AutomationBuilder
            catalog={CATALOG}
            workspaceId={workspaceId}
            listId={listId}
            onSave={saveWorkflow}
            initial={
              modal === "createAi"
                ? {
                    name: "AI field",
                    trigger: { type: "task_updated", config: {} },
                    actions: [{ position: 0, type: "update_ai_field", payload: { field: "summary" } }],
                  }
                : undefined
            }
          />
        </Modal>
      )}
      {modal === "manage" && (
        <ManageAutomationsModal workspaceId={workspaceId} listId={listId} onClose={closeManage} onChanged={refreshAll} />
      )}

      <ToastStack items={toasts} onDismiss={dismissToast} />
    </div>
  );
}

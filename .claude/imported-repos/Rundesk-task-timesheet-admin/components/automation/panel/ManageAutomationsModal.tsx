"use client";

/**
 * "Manage automations" dialog: lists every rule (presets + custom) with
 * pause/delete, and a second tab with the event test console for debugging.
 */

import { useCallback, useEffect, useState } from "react";
import { CATALOG } from "@/lib/automation/catalog";
import type { Workflow } from "@/lib/automation/types";
import { api } from "../api";
import { EventTestConsole } from "../EventTestConsole";
import { Modal, cx } from "../ui";
import { WorkflowList } from "../WorkflowList";

interface Props {
  workspaceId: string;
  listId: string;
  onClose: () => void;
  /** Called after any change so the panel/task view can refresh. */
  onChanged: () => void;
}

export function ManageAutomationsModal({ workspaceId, listId, onClose, onChanged }: Props) {
  const [tab, setTab] = useState<"rules" | "test">("rules");
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { workflows } = await api.listWorkflows(workspaceId);
    setWorkflows(workflows.filter((w) => !w.listId || w.listId === listId));
    setLoading(false);
  }, [workspaceId, listId]);

  useEffect(() => {
    let active = true;
    api.listWorkflows(workspaceId).then(({ workflows }) => {
      if (!active) return;
      setWorkflows(workflows.filter((w) => !w.listId || w.listId === listId));
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [workspaceId, listId]);

  const toggle = async (id: string, isActive: boolean) => {
    await api.updateWorkflow(id, { isActive });
    await refresh();
    onChanged();
  };

  const remove = async (id: string) => {
    await api.deleteWorkflow(id);
    await refresh();
    onChanged();
  };

  const tabBtn = (key: typeof tab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(key)}
      className={cx(
        "rounded-lg px-3 py-1.5 text-xs font-medium transition",
        tab === key ? "bg-accent/20 text-accent-2" : "text-muted hover:text-fg",
      )}
    >
      {label}
    </button>
  );

  return (
    <Modal title="Manage automations" subtitle="Rules created from presets and the builder" onClose={onClose} width="max-w-4xl">
      <div className="mb-4 flex gap-1">
        {tabBtn("rules", `Rules (${workflows.length})`)}
        {tabBtn("test", "Test & logs")}
      </div>

      {tab === "rules" ? (
        <WorkflowList catalog={CATALOG} workflows={workflows} loading={loading} onToggle={toggle} onDelete={remove} />
      ) : (
        <EventTestConsole catalog={CATALOG} workspaceId={workspaceId} onFired={onChanged} />
      )}
    </Modal>
  );
}

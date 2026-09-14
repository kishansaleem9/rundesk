"use client";

/** Lists saved automations with an active toggle and delete button. */

import { optionLabel, type Catalog } from "@/lib/automation/catalog";
import type { Workflow } from "@/lib/automation/types";
import { RuleSummary } from "./RuleSummary";
import { Badge, Button, Card } from "./ui";

interface Props {
  catalog: Catalog;
  workflows: Workflow[];
  loading?: boolean;
  onToggle: (id: string, isActive: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function WorkflowList({ catalog, workflows, loading, onToggle, onDelete }: Props) {
  return (
    <Card title="Automations" subtitle={`${workflows.length} rule${workflows.length === 1 ? "" : "s"} in this workspace`}>
      {loading && workflows.length === 0 && <p className="text-sm text-muted">Loading…</p>}
      {!loading && workflows.length === 0 && (
        <p className="text-sm text-muted">No automations yet. Create one on the left.</p>
      )}

      <ul className="space-y-3">
        {workflows.map((w) => (
          <li key={w.id} className="rounded-xl border border-line bg-panel-2/40 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-sm font-semibold text-fg">{w.name}</h3>
                  <Badge tone={w.isActive ? "ok" : "neutral"}>{w.isActive ? "Active" : "Paused"}</Badge>
                  <Badge tone="accent">
                    {w.conditions.length} cond · {w.actions.length} act
                  </Badge>
                  {w.templateKey && <Badge tone="neutral">Preset</Badge>}
                  {w.listId && <Badge tone="neutral">{optionLabel("lists", w.listId)}</Badge>}
                </div>
                {w.description && <p className="mt-1 text-xs text-muted">{w.description}</p>}
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Button variant="subtle" size="sm" onClick={() => onToggle(w.id, !w.isActive)}>
                  {w.isActive ? "Pause" : "Resume"}
                </Button>
                <Button variant="danger" size="sm" onClick={() => onDelete(w.id)}>
                  Delete
                </Button>
              </div>
            </div>
            <div className="mt-3 border-t border-line/60 pt-3">
              <RuleSummary
                catalog={catalog}
                trigger={w.trigger}
                conditions={w.conditions}
                actions={w.actions}
                logic={w.conditionLogic}
              />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

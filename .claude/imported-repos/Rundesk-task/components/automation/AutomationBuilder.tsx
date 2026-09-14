"use client";

/**
 * AutomationBuilder — the visual "Trigger + Conditions + Actions" editor.
 *
 * Self-contained: give it a catalog, a workspaceId and an `onSave` callback
 * that persists the WorkflowInput (the demo posts to /api/automations/workflows,
 * Rundesk can pass a server action instead). It does not fetch anything itself,
 * which keeps it easy to mount inside any dashboard panel or modal.
 */

import { useState } from "react";
import type { Catalog } from "@/lib/automation/catalog";
import type {
  ActionDef,
  ConditionDef,
  ConditionLogic,
  TriggerDef,
  WorkflowInput,
} from "@/lib/automation/types";
import { ActionList } from "./ActionList";
import { ConditionList } from "./ConditionList";
import { RuleSummary } from "./RuleSummary";
import { TriggerSelect } from "./TriggerSelect";
import { Button, Card, Input, Label, Step } from "./ui";

interface Props {
  catalog: Catalog;
  workspaceId: string;
  /** Scope the rule to one list/project (null = whole workspace). */
  listId?: string | null;
  onSave: (input: WorkflowInput) => Promise<void>;
  /** Pre-fill the form (e.g. for "duplicate rule" or "Create AI Field"). */
  initial?: Partial<WorkflowInput>;
}

const emptyState = (catalog: Catalog, initial?: Partial<WorkflowInput>) => ({
  name: initial?.name ?? "",
  description: initial?.description ?? "",
  logic: (initial?.conditionLogic ?? "ALL") as ConditionLogic,
  trigger: (initial?.trigger ?? { type: catalog.triggers[0].type, config: {} }) as TriggerDef,
  conditions: (initial?.conditions ?? []) as ConditionDef[],
  actions: (initial?.actions ?? [
    { position: 0, type: catalog.actions[0].type, payload: {} },
  ]) as ActionDef[],
});

export function AutomationBuilder({ catalog, workspaceId, listId = null, onSave, initial }: Props) {
  const [form, setForm] = useState(() => emptyState(catalog, initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);

  const patch = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  /** Light client-side checks; the API re-validates with zod. */
  const validate = (): string | null => {
    if (!form.name.trim()) return "Give the automation a name.";
    if (form.actions.length === 0) return "Add at least one action.";
    for (const a of form.actions) {
      const def = catalog.actions.find((d) => d.type === a.type)!;
      for (const f of def.payloadFields) {
        if (f.optional) continue;
        const v = a.payload[f.key];
        if (v === undefined || v === null || v === "") return `Action "${def.label}": ${f.label} is required.`;
      }
    }
    for (const c of form.conditions) {
      const unary = c.operator === "is_empty" || c.operator === "is_not_empty";
      const empty = c.value === null || c.value === "" || (Array.isArray(c.value) && c.value.length === 0);
      if (!unary && empty) return `Condition on "${c.field}" needs a value.`;
    }
    return null;
  };

  const submit = async () => {
    const problem = validate();
    if (problem) return setError(problem);

    setSaving(true);
    setError(null);
    try {
      await onSave({
        workspaceId,
        listId,
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        isActive: true,
        conditionLogic: form.logic,
        trigger: form.trigger,
        conditions: form.conditions,
        actions: form.actions,
      });
      setSavedName(form.name.trim());
      setForm(emptyState(catalog));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title="Create automation"
      subtitle="Trigger → Conditions → Actions"
      action={
        <Button variant="ghost" size="sm" onClick={() => setForm(emptyState(catalog))}>
          Reset
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Name */}
        <div className="grid gap-3 sm:grid-cols-[2fr_3fr]">
          <div>
            <Label>Name</Label>
            <Input
              value={form.name}
              placeholder="e.g. Route bugs to QA"
              onChange={(e) => patch("name", e.target.value)}
            />
          </div>
          <div>
            <Label hint="optional">Description</Label>
            <Input
              value={form.description}
              placeholder="What is this rule for?"
              onChange={(e) => patch("description", e.target.value)}
            />
          </div>
        </div>

        {/* Step 1: trigger */}
        <div>
          <Step n={1} title="When (trigger)" />
          <TriggerSelect catalog={catalog} value={form.trigger} onChange={(t) => patch("trigger", t)} />
        </div>

        {/* Step 2: conditions */}
        <ConditionList
          catalog={catalog}
          conditions={form.conditions}
          logic={form.logic}
          onLogicChange={(l) => patch("logic", l)}
          onChange={(c) => patch("conditions", c)}
        />

        {/* Step 3: actions */}
        <ActionList catalog={catalog} actions={form.actions} onChange={(a) => patch("actions", a)} />

        {/* Live preview */}
        <div className="rounded-xl border border-accent/30 bg-accent/5 p-4">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-accent-2">Preview</p>
          <RuleSummary
            catalog={catalog}
            trigger={form.trigger}
            conditions={form.conditions}
            actions={form.actions}
            logic={form.logic}
          />
        </div>

        {error && (
          <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
        )}
        {savedName && !error && (
          <p className="rounded-lg border border-ok/40 bg-ok/10 px-3 py-2 text-sm text-ok">
            Saved “{savedName}”. It is active and will run on the next matching event.
          </p>
        )}

        <div className="flex justify-end">
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Save automation"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

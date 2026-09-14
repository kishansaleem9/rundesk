"use client";

/**
 * Human-readable sentence describing a workflow, e.g.
 * "When status changes to Done, if priority is Urgent, then add comment and notify Hamda."
 * Used both in the builder preview and in the saved-workflow list.
 */

import { optionLabel, type Catalog, type OptionsKey } from "@/lib/automation/catalog";
import type { ActionDef, ConditionDef, ConditionLogic, TriggerDef } from "@/lib/automation/types";

interface Props {
  catalog: Catalog;
  trigger: TriggerDef;
  conditions: ConditionDef[];
  actions: ActionDef[];
  logic: ConditionLogic;
}

const Hi = ({ children }: { children: React.ReactNode }) => (
  <span className="font-semibold text-accent-2">{children}</span>
);

export function RuleSummary({ catalog, trigger, conditions, actions, logic }: Props) {
  const triggerDef = catalog.triggers.find((t) => t.type === trigger.type);

  // Describe trigger config, e.g. "from To Do to Done"
  const triggerBits = (triggerDef?.configFields ?? [])
    .filter((f) => trigger.config[f.key] !== undefined && trigger.config[f.key] !== "")
    .map((f) => {
      const raw = String(trigger.config[f.key]);
      const label = f.optionsKey ? optionLabel(f.optionsKey, raw) : raw;
      return `${f.key === "from" ? "from" : f.key === "to" ? "to" : f.label.toLowerCase()} ${label}`;
    });

  const describeCondition = (c: ConditionDef) => {
    const def = catalog.conditionFields.find((f) => f.field === c.field);
    const op = catalog.operatorLabels[c.operator];
    if (c.operator === "is_empty" || c.operator === "is_not_empty") return `${def?.label} ${op}`;
    const vals = Array.isArray(c.value) ? c.value : [c.value];
    const pretty = vals
      .map((v) => (def?.optionsKey ? optionLabel(def.optionsKey, String(v)) : String(v ?? "")))
      .join(", ");
    return `${def?.label} ${op} ${pretty || "…"}`;
  };

  const describeAction = (a: ActionDef) => {
    const def = catalog.actions.find((d) => d.type === a.type);
    const firstSelect = def?.payloadFields.find((f) => f.input === "select" && a.payload[f.key]);
    if (firstSelect) {
      const v = optionLabel(firstSelect.optionsKey as OptionsKey, String(a.payload[firstSelect.key]));
      return `${def?.label.toLowerCase()} → ${v}`;
    }
    return def?.label.toLowerCase() ?? a.type;
  };

  return (
    <p className="text-sm leading-relaxed text-muted">
      When <Hi>{triggerDef?.label.toLowerCase()}</Hi>
      {triggerBits.length > 0 && <> {triggerBits.join(" ")}</>}
      {conditions.length > 0 && (
        <>
          , if{" "}
          {conditions.map((c, i) => (
            <span key={i}>
              {i > 0 && <span className="text-muted/70"> {logic === "ANY" ? "or" : "and"} </span>}
              <Hi>{describeCondition(c)}</Hi>
            </span>
          ))}
        </>
      )}
      , then{" "}
      {actions.length === 0 ? (
        <span className="italic">…</span>
      ) : (
        actions.map((a, i) => (
          <span key={i}>
            {i > 0 && (i === actions.length - 1 ? " and " : ", ")}
            <Hi>{describeAction(a)}</Hi>
          </span>
        ))
      )}
      .
    </p>
  );
}

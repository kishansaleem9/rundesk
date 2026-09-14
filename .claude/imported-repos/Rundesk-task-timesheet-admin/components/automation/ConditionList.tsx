"use client";

/** Step 2 of the builder: optional filters (max 15) with ALL/ANY logic. */

import type { Catalog } from "@/lib/automation/catalog";
import { MAX_CONDITIONS, type ConditionDef, type ConditionLogic } from "@/lib/automation/types";
import { ConditionRow } from "./ConditionRow";
import { Button, Select, Step } from "./ui";

interface Props {
  catalog: Catalog;
  conditions: ConditionDef[];
  logic: ConditionLogic;
  onLogicChange: (logic: ConditionLogic) => void;
  onChange: (conditions: ConditionDef[]) => void;
}

export function ConditionList({ catalog, conditions, logic, onLogicChange, onChange }: Props) {
  const atLimit = conditions.length >= MAX_CONDITIONS;

  const add = () => {
    if (atLimit) return;
    const first = catalog.conditionFields[0];
    onChange([
      ...conditions,
      { position: conditions.length, field: first.field, operator: first.operators[0], value: null },
    ]);
  };

  const update = (i: number, c: ConditionDef) => onChange(conditions.map((x, idx) => (idx === i ? c : x)));

  /** Re-number positions after a removal so they stay contiguous. */
  const remove = (i: number) =>
    onChange(conditions.filter((_, idx) => idx !== i).map((c, idx) => ({ ...c, position: idx })));

  return (
    <div>
      <Step
        n={2}
        title="If (conditions)"
        right={
          <span className={`text-xs ${atLimit ? "text-warn" : "text-muted"}`}>
            {conditions.length} / {MAX_CONDITIONS}
          </span>
        }
      />

      {conditions.length > 1 && (
        <div className="mb-3 flex items-center gap-2 text-sm text-muted">
          Match
          <Select
            className="w-auto"
            value={logic}
            onChange={(e) => onLogicChange(e.target.value as ConditionLogic)}
          >
            <option value="ALL">all</option>
            <option value="ANY">any</option>
          </Select>
          of the following
        </div>
      )}

      <div className="space-y-2">
        {conditions.length === 0 && (
          <p className="rounded-lg border border-dashed border-line px-3 py-3 text-xs text-muted">
            No conditions — the automation runs every time the trigger fires.
          </p>
        )}
        {conditions.map((c, i) => (
          <ConditionRow
            key={i}
            catalog={catalog}
            condition={c}
            onChange={(next) => update(i, next)}
            onRemove={() => remove(i)}
          />
        ))}
      </div>

      <Button variant="ghost" size="sm" className="mt-3" onClick={add} disabled={atLimit}>
        + Add condition
      </Button>
    </div>
  );
}

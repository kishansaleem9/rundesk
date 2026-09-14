"use client";

/** Step 3 of the builder: what happens (1–6 actions, executed in order). */

import type { Catalog } from "@/lib/automation/catalog";
import { MAX_ACTIONS, type ActionDef } from "@/lib/automation/types";
import { ActionRow } from "./ActionRow";
import { Button, Step } from "./ui";

interface Props {
  catalog: Catalog;
  actions: ActionDef[];
  onChange: (actions: ActionDef[]) => void;
}

export function ActionList({ catalog, actions, onChange }: Props) {
  const atLimit = actions.length >= MAX_ACTIONS;

  const add = () => {
    if (atLimit) return;
    onChange([...actions, { position: actions.length, type: catalog.actions[0].type, payload: {} }]);
  };

  const update = (i: number, a: ActionDef) => onChange(actions.map((x, idx) => (idx === i ? a : x)));

  const remove = (i: number) =>
    onChange(actions.filter((_, idx) => idx !== i).map((a, idx) => ({ ...a, position: idx })));

  return (
    <div>
      <Step
        n={3}
        title="Then (actions)"
        right={
          <span className={`text-xs ${atLimit ? "text-warn" : "text-muted"}`}>
            {actions.length} / {MAX_ACTIONS}
          </span>
        }
      />

      <div className="space-y-2">
        {actions.map((a, i) => (
          <ActionRow
            key={i}
            catalog={catalog}
            action={a}
            index={i}
            onChange={(next) => update(i, next)}
            onRemove={() => remove(i)}
          />
        ))}
      </div>

      <Button variant="ghost" size="sm" className="mt-3" onClick={add} disabled={atLimit}>
        + Add action
      </Button>
    </div>
  );
}

"use client";

/** One action inside the actions list: pick a type, fill its payload fields. */

import type { Catalog } from "@/lib/automation/catalog";
import type { ActionDef, ActionType } from "@/lib/automation/types";
import { FieldControl } from "./FieldControl";
import { Button, Select } from "./ui";

interface Props {
  catalog: Catalog;
  action: ActionDef;
  index: number;
  onChange: (a: ActionDef) => void;
  onRemove: () => void;
}

export function ActionRow({ catalog, action, index, onChange, onRemove }: Props) {
  const def = catalog.actions.find((a) => a.type === action.type)!;

  return (
    <div className="rounded-xl border border-line bg-panel-2/40 p-3">
      <div className="flex items-center gap-2">
        <span className="w-5 text-xs font-semibold text-muted">{index + 1}.</span>
        <Select
          value={action.type}
          // Changing type clears the payload because field keys differ per action.
          onChange={(e) => onChange({ ...action, type: e.target.value as ActionType, payload: {} })}
        >
          {catalog.actions.map((a) => (
            <option key={a.type} value={a.type}>
              {a.label}
            </option>
          ))}
        </Select>
        <Button variant="ghost" size="sm" onClick={onRemove} aria-label="Remove action">
          ✕
        </Button>
      </div>

      {def.payloadFields.length > 0 && (
        <div className="mt-3 grid gap-3 pl-7 sm:grid-cols-2">
          {def.payloadFields.map((f) => (
            <div key={f.key} className={f.input === "textarea" ? "sm:col-span-2" : undefined}>
              <FieldControl
                field={f}
                value={action.payload[f.key]}
                options={catalog.options}
                onChange={(v) => onChange({ ...action, payload: { ...action.payload, [f.key]: v } })}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

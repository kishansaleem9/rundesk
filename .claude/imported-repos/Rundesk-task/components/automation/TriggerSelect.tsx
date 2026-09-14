"use client";

/** Step 1 of the builder: pick WHEN the automation fires and (optionally) narrow it. */

import type { Catalog } from "@/lib/automation/catalog";
import type { TriggerDef, TriggerType } from "@/lib/automation/types";
import { FieldControl } from "./FieldControl";
import { Label, Select } from "./ui";

interface Props {
  catalog: Catalog;
  value: TriggerDef;
  onChange: (trigger: TriggerDef) => void;
}

export function TriggerSelect({ catalog, value, onChange }: Props) {
  const def = catalog.triggers.find((t) => t.type === value.type);

  return (
    <div className="space-y-3">
      <div>
        <Label>When</Label>
        <Select
          value={value.type}
          onChange={(e) =>
            // Changing the trigger type resets its config, since keys differ per type.
            onChange({ type: e.target.value as TriggerType, config: {} })
          }
        >
          {catalog.triggers.map((t) => (
            <option key={t.type} value={t.type}>
              {t.label}
            </option>
          ))}
        </Select>
        {def && <p className="mt-1 text-xs text-muted">{def.description}</p>}
      </div>

      {def && def.configFields.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {def.configFields.map((f) => (
            <FieldControl
              key={f.key}
              field={f}
              value={value.config[f.key]}
              options={catalog.options}
              onChange={(v) => onChange({ ...value, config: { ...value.config, [f.key]: v } })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

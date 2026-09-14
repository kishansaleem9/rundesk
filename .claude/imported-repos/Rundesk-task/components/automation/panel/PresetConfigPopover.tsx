"use client";

/** Small picker shown when a preset that needs parameters (e.g. assignee) is turned on. */

import { useState } from "react";
import { OPTIONS } from "@/lib/automation/catalog";
import type { PresetParam } from "@/lib/automation/presets";
import { Button, Label, Popover, Select } from "../ui";

interface Props {
  title: string;
  params: PresetParam[];
  onConfirm: (values: Record<string, string>) => void;
  onCancel: () => void;
}

export function PresetConfigPopover({ title, params, onConfirm, onCancel }: Props) {
  // Default every param to the first option so "Turn on" works immediately.
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(params.map((p) => [p.key, OPTIONS[p.optionsKey][0]?.value ?? ""])),
  );

  return (
    <Popover onClose={onCancel} className="left-0 top-full mt-2 w-64 p-4">
      <p className="mb-3 text-sm font-semibold text-fg">{title}</p>
      <div className="space-y-3">
        {params.map((p) => (
          <div key={p.key}>
            <Label>{p.label}</Label>
            <Select value={values[p.key]} onChange={(e) => setValues((v) => ({ ...v, [p.key]: e.target.value }))}>
              {OPTIONS[p.optionsKey].map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => onConfirm(values)}>
          Turn on
        </Button>
      </div>
    </Popover>
  );
}

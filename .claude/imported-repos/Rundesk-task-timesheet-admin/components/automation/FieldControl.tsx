"use client";

/**
 * Renders a single input described by a catalog `FieldDef`.
 * Used for trigger config fields, action payload fields and the test console,
 * so adding a new action only requires a catalog entry — no new UI code.
 */

import type { Catalog, FieldDef } from "@/lib/automation/catalog";
import type { JsonValue } from "@/lib/automation/types";
import { Input, Label, Select, Textarea } from "./ui";

interface Props {
  field: FieldDef;
  value: JsonValue | undefined;
  onChange: (value: JsonValue) => void;
  options: Catalog["options"];
  /** Hide the label (compact inline layouts). */
  bare?: boolean;
}

export function FieldControl({ field, value, onChange, options, bare }: Props) {
  const str = value === null || value === undefined ? "" : String(value);

  let control: React.ReactNode;
  switch (field.input) {
    case "select": {
      const opts = field.options ?? (field.optionsKey ? options[field.optionsKey] : []);
      control = (
        <Select value={str} onChange={(e) => onChange(e.target.value)}>
          <option value="">{field.optional ? "Any" : "Select…"}</option>
          {opts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      );
      break;
    }
    case "textarea":
      control = (
        <Textarea value={str} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />
      );
      break;
    case "number":
      control = (
        <Input
          type="number"
          value={str}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        />
      );
      break;
    case "date":
      control = <Input type="date" value={str.slice(0, 10)} onChange={(e) => onChange(e.target.value)} />;
      break;
    default:
      control = (
        <Input type="text" value={str} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />
      );
  }

  if (bare) return <>{control}</>;

  return (
    <div>
      <Label hint={field.optional ? "optional" : undefined}>{field.label}</Label>
      {control}
      {field.help && <p className="mt-1 text-[11px] text-muted/80">{field.help}</p>}
    </div>
  );
}

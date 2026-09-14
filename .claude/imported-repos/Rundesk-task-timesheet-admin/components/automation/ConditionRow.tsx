"use client";

/** One "field · operator · value" row inside the conditions list. */

import { LIST_OPERATORS, UNARY_OPERATORS, type Catalog } from "@/lib/automation/catalog";
import type { ConditionDef, ConditionField, ConditionOperator } from "@/lib/automation/types";
import { Button, Input, Select } from "./ui";

interface Props {
  catalog: Catalog;
  condition: ConditionDef;
  onChange: (c: ConditionDef) => void;
  onRemove: () => void;
}

export function ConditionRow({ catalog, condition, onChange, onRemove }: Props) {
  const fieldDef = catalog.conditionFields.find((f) => f.field === condition.field)!;
  const isUnary = UNARY_OPERATORS.includes(condition.operator);
  const isList = LIST_OPERATORS.includes(condition.operator);
  const selectOptions = fieldDef.optionsKey ? catalog.options[fieldDef.optionsKey] : null;

  const valueStr =
    condition.value === null || condition.value === undefined
      ? ""
      : Array.isArray(condition.value)
        ? condition.value.join(", ")
        : String(condition.value);

  /** Switching field: pick the first valid operator and clear the value. */
  const changeField = (field: ConditionField) => {
    const def = catalog.conditionFields.find((f) => f.field === field)!;
    onChange({ ...condition, field, operator: def.operators[0], value: null });
  };

  const changeOperator = (operator: ConditionOperator) => {
    const unary = UNARY_OPERATORS.includes(operator);
    onChange({ ...condition, operator, value: unary ? null : condition.value });
  };

  return (
    <div className="grid grid-cols-[1fr_1fr_1.4fr_auto] items-center gap-2">
      <Select value={condition.field} onChange={(e) => changeField(e.target.value as ConditionField)}>
        {catalog.conditionFields.map((f) => (
          <option key={f.field} value={f.field}>
            {f.label}
          </option>
        ))}
      </Select>

      <Select value={condition.operator} onChange={(e) => changeOperator(e.target.value as ConditionOperator)}>
        {fieldDef.operators.map((op) => (
          <option key={op} value={op}>
            {catalog.operatorLabels[op]}
          </option>
        ))}
      </Select>

      {isUnary ? (
        <div className="text-xs text-muted">—</div>
      ) : selectOptions && !isList ? (
        <Select value={valueStr} onChange={(e) => onChange({ ...condition, value: e.target.value })}>
          <option value="">Select…</option>
          {selectOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      ) : (
        <Input
          type={fieldDef.input === "date" && !isList ? "date" : "text"}
          value={valueStr}
          placeholder={
            isList
              ? `Comma separated${selectOptions ? ` (${selectOptions.map((o) => o.value).join(", ")})` : ""}`
              : "Value"
          }
          onChange={(e) =>
            onChange({
              ...condition,
              // List operators store an array so the engine gets structured data.
              value: isList ? e.target.value.split(",").map((s) => s.trim()).filter(Boolean) : e.target.value,
            })
          }
        />
      )}

      <Button variant="ghost" size="sm" onClick={onRemove} aria-label="Remove condition">
        ✕
      </Button>
    </div>
  );
}

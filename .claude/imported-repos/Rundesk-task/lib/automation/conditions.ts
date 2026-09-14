/**
 * Condition evaluation.
 *
 * `evaluateConditions` takes the workflow's conditions (max 15), the task the
 * event refers to, and the ALL/ANY logic, and returns a pass/fail verdict plus
 * a per-condition breakdown that is written to the run log so users can see
 * exactly why a workflow did or did not fire.
 *
 * Pure functions: no I/O, easy to unit test.
 */

import {
  MAX_CONDITIONS,
  type ConditionDef,
  type ConditionField,
  type ConditionLogic,
  type ConditionResult,
  type JsonValue,
  type Task,
} from "./types";

/** Read the task field a condition refers to. */
export function getTaskFieldValue(task: Task, field: ConditionField): JsonValue {
  switch (field) {
    case "status":
      return task.status;
    case "priority":
      return task.priority;
    case "assigneeId":
      return task.assigneeId;
    case "listId":
      return task.listId;
    case "tags":
      return task.tags;
    case "dueDate":
      return task.dueDate;
    case "title":
      return task.title;
  }
}

/* ---------- helpers ---------- */

const norm = (v: JsonValue): string =>
  v === null || v === undefined ? "" : String(v).trim().toLowerCase();

/** Coerce the expected value into a list: arrays pass through, strings split on commas. */
const toList = (v: JsonValue): string[] => {
  if (Array.isArray(v)) return v.map(norm).filter(Boolean);
  const s = norm(v);
  return s ? s.split(",").map((x) => x.trim()).filter(Boolean) : [];
};

const isEmpty = (v: JsonValue): boolean =>
  v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

/** For gt/lt: dates compare as timestamps, everything else as numbers. */
const toComparable = (v: JsonValue, field: ConditionField): number | null => {
  if (v === null || v === undefined || v === "") return null;
  if (field === "dueDate") {
    const t = new Date(String(v)).getTime();
    return Number.isNaN(t) ? null : t;
  }
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};

/* ---------- single condition ---------- */

export function evaluateCondition(cond: ConditionDef, task: Task): ConditionResult {
  const actual = getTaskFieldValue(task, cond.field);
  const expected = cond.value;
  let passed = false;

  switch (cond.operator) {
    case "eq":
      // For array fields (tags), "eq" means "includes".
      passed = Array.isArray(actual)
        ? actual.map(norm).includes(norm(expected))
        : norm(actual) === norm(expected);
      break;

    case "neq":
      passed = Array.isArray(actual)
        ? !actual.map(norm).includes(norm(expected))
        : norm(actual) !== norm(expected);
      break;

    case "in": {
      const list = toList(expected);
      passed = Array.isArray(actual)
        ? actual.map(norm).some((a) => list.includes(a)) // any overlap
        : list.includes(norm(actual));
      break;
    }

    case "not_in": {
      const list = toList(expected);
      passed = Array.isArray(actual)
        ? !actual.map(norm).some((a) => list.includes(a))
        : !list.includes(norm(actual));
      break;
    }

    case "contains":
      passed = Array.isArray(actual)
        ? actual.map(norm).includes(norm(expected))
        : norm(actual).includes(norm(expected));
      break;

    case "gt": {
      const a = toComparable(actual, cond.field);
      const e = toComparable(expected, cond.field);
      passed = a !== null && e !== null && a > e;
      break;
    }

    case "lt": {
      const a = toComparable(actual, cond.field);
      const e = toComparable(expected, cond.field);
      passed = a !== null && e !== null && a < e;
      break;
    }

    case "is_empty":
      passed = isEmpty(actual);
      break;

    case "is_not_empty":
      passed = !isEmpty(actual);
      break;
  }

  return {
    position: cond.position,
    field: cond.field,
    operator: cond.operator,
    expected,
    actual,
    passed,
  };
}

/* ---------- all conditions ---------- */

export interface ConditionsVerdict {
  passed: boolean;
  results: ConditionResult[];
}

/**
 * Evaluate a workflow's conditions.
 * - Empty condition list → passes (trigger alone is enough).
 * - Only the first MAX_CONDITIONS are evaluated; extras are ignored defensively.
 * - ALL → every condition must pass; ANY → at least one must pass.
 */
export function evaluateConditions(
  conditions: ConditionDef[],
  task: Task,
  logic: ConditionLogic = "ALL",
): ConditionsVerdict {
  const ordered = [...conditions]
    .sort((a, b) => a.position - b.position)
    .slice(0, MAX_CONDITIONS);

  const results = ordered.map((c) => evaluateCondition(c, task));

  if (results.length === 0) return { passed: true, results };

  const passed =
    logic === "ANY" ? results.some((r) => r.passed) : results.every((r) => r.passed);

  return { passed, results };
}

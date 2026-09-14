import { describe, expect, it } from "vitest";
import { evaluateCondition, evaluateConditions } from "@/lib/automation/conditions";
import { MAX_CONDITIONS, type ConditionDef, type Task } from "@/lib/automation/types";

const task: Task = {
  id: "t1",
  workspaceId: "ws",
  listId: "list_eng",
  title: "Fix Login Redirect",
  status: "in_progress",
  priority: "urgent",
  assigneeId: null,
  tags: ["bug", "auth"],
  dueDate: "2026-09-10T00:00:00.000Z",
  comments: [],
  followers: [],
  aiFields: {},
  updatedAt: new Date().toISOString(),
};

const cond = (partial: Omit<ConditionDef, "position">, position = 0): ConditionDef => ({ position, ...partial });

describe("evaluateCondition", () => {
  it("eq / neq are case-insensitive", () => {
    expect(evaluateCondition(cond({ field: "priority", operator: "eq", value: "URGENT" }), task).passed).toBe(true);
    expect(evaluateCondition(cond({ field: "priority", operator: "neq", value: "urgent" }), task).passed).toBe(false);
  });

  it("in accepts arrays and comma-separated strings", () => {
    expect(evaluateCondition(cond({ field: "status", operator: "in", value: ["todo", "in_progress"] }), task).passed).toBe(true);
    expect(evaluateCondition(cond({ field: "status", operator: "in", value: "todo, review" }), task).passed).toBe(false);
    expect(evaluateCondition(cond({ field: "status", operator: "not_in", value: "todo, review" }), task).passed).toBe(true);
  });

  it("contains works on arrays (tags) and strings (title)", () => {
    expect(evaluateCondition(cond({ field: "tags", operator: "contains", value: "bug" }), task).passed).toBe(true);
    expect(evaluateCondition(cond({ field: "tags", operator: "contains", value: "design" }), task).passed).toBe(false);
    expect(evaluateCondition(cond({ field: "title", operator: "contains", value: "login" }), task).passed).toBe(true);
  });

  it("in on tags checks overlap", () => {
    expect(evaluateCondition(cond({ field: "tags", operator: "in", value: ["design", "auth"] }), task).passed).toBe(true);
  });

  it("gt / lt compare dates for dueDate", () => {
    expect(evaluateCondition(cond({ field: "dueDate", operator: "lt", value: "2026-09-15" }), task).passed).toBe(true);
    expect(evaluateCondition(cond({ field: "dueDate", operator: "gt", value: "2026-09-15" }), task).passed).toBe(false);
  });

  it("is_empty / is_not_empty handle null and arrays", () => {
    expect(evaluateCondition(cond({ field: "assigneeId", operator: "is_empty", value: null }), task).passed).toBe(true);
    expect(evaluateCondition(cond({ field: "tags", operator: "is_empty", value: null }), task).passed).toBe(false);
    expect(evaluateCondition(cond({ field: "tags", operator: "is_not_empty", value: null }), task).passed).toBe(true);
  });

  it("returns actual/expected for the run log", () => {
    const r = evaluateCondition(cond({ field: "status", operator: "eq", value: "done" }), task);
    expect(r).toMatchObject({ field: "status", operator: "eq", expected: "done", actual: "in_progress", passed: false });
  });
});

describe("evaluateConditions", () => {
  const pass = cond({ field: "priority", operator: "eq", value: "urgent" }, 0);
  const failC = cond({ field: "status", operator: "eq", value: "done" }, 1);

  it("passes with no conditions", () => {
    expect(evaluateConditions([], task, "ALL").passed).toBe(true);
  });

  it("ALL requires every condition", () => {
    expect(evaluateConditions([pass, failC], task, "ALL").passed).toBe(false);
    expect(evaluateConditions([pass], task, "ALL").passed).toBe(true);
  });

  it("ANY requires at least one", () => {
    expect(evaluateConditions([pass, failC], task, "ANY").passed).toBe(true);
    expect(evaluateConditions([failC], task, "ANY").passed).toBe(false);
  });

  it(`evaluates at most ${MAX_CONDITIONS} conditions`, () => {
    const many = Array.from({ length: 20 }, (_, i) => cond({ field: "priority", operator: "eq", value: "urgent" }, i));
    const { results } = evaluateConditions(many, task, "ALL");
    expect(results).toHaveLength(MAX_CONDITIONS);
  });

  it("evaluates in position order regardless of array order", () => {
    const { results } = evaluateConditions([failC, pass], task, "ALL");
    expect(results.map((r) => r.position)).toEqual([0, 1]);
  });
});

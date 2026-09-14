/**
 * MySQL-backed WorkflowRepository using Prisma.
 *
 * Activated with AUTOMATION_REPO=prisma. Requires `DATABASE_URL` and a
 * generated client (`npx prisma generate`). Maps between Prisma rows and the
 * engine's plain `Workflow` / `AutomationRun` types so nothing outside this
 * file knows about Prisma.
 */

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { db as defaultClient } from "@/lib/server/db";
import type { NewRun, WorkflowRepository } from "../repository";
import type {
  ActionResult,
  ActionType,
  AutomationRun,
  ConditionField,
  ConditionOperator,
  ConditionResult,
  JsonObject,
  JsonValue,
  TriggerType,
  Workflow,
  WorkflowInput,
} from "../types";

/* ---------- JSON helpers ---------- */

/** Prisma cannot store a bare JS `null` in a Json column; use its JsonNull sentinel. */
const toJson = (v: JsonValue | undefined): Prisma.InputJsonValue | typeof Prisma.JsonNull =>
  v === null || v === undefined ? Prisma.JsonNull : (v as Prisma.InputJsonValue);

const fromJson = <T = JsonValue>(v: Prisma.JsonValue): T => v as unknown as T;

/* ---------- row → domain mapping ---------- */

const workflowInclude = {
  trigger: true,
  conditions: { orderBy: { position: "asc" as const } },
  actions: { orderBy: { position: "asc" as const } },
} satisfies Prisma.WorkflowInclude;

type WorkflowRow = Prisma.WorkflowGetPayload<{ include: typeof workflowInclude }>;

function toWorkflow(row: WorkflowRow): Workflow {
  if (!row.trigger) throw new Error(`Workflow ${row.id} has no trigger row`);
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    description: row.description ?? undefined,
    isActive: row.isActive,
    conditionLogic: row.conditionLogic,
    templateKey: row.templateKey,
    listId: row.listId,
    trigger: {
      id: row.trigger.id,
      type: row.trigger.type as TriggerType,
      config: fromJson<JsonObject>(row.trigger.config) ?? {},
    },
    conditions: row.conditions.map((c) => ({
      id: c.id,
      position: c.position,
      field: c.field as ConditionField,
      operator: c.operator as ConditionOperator,
      value: fromJson(c.value),
    })),
    actions: row.actions.map((a) => ({
      id: a.id,
      position: a.position,
      type: a.type as ActionType,
      payload: fromJson<JsonObject>(a.payload) ?? {},
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

type RunRow = Prisma.AutomationRunGetPayload<{ include: { workflow: { select: { name: true } } } }>;

function toRun(row: RunRow): AutomationRun {
  return {
    id: row.id,
    workflowId: row.workflowId,
    workflowName: row.workflow.name,
    workspaceId: row.workspaceId,
    eventType: row.eventType as TriggerType,
    taskId: row.taskId,
    depth: row.depth,
    status: row.status,
    conditionsPassed: row.conditionsPassed,
    eventPayload: fromJson<JsonObject>(row.eventPayload) ?? {},
    conditionResults: fromJson<ConditionResult[]>(row.conditionResults) ?? [],
    actionResults: fromJson<ActionResult[]>(row.actionResults) ?? [],
    error: row.error ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

/* ---------- repository ---------- */

export function createPrismaRepository(client: PrismaClient = defaultClient): WorkflowRepository {
  return {
    async findActiveWorkflowsByTrigger(type, workspaceId) {
      const rows = await client.workflow.findMany({
        where: { workspaceId, isActive: true, trigger: { type } },
        include: workflowInclude,
        orderBy: { createdAt: "asc" },
      });
      return rows.map(toWorkflow);
    },

    async listWorkflows(workspaceId) {
      const rows = await client.workflow.findMany({
        where: { workspaceId },
        include: workflowInclude,
        orderBy: { createdAt: "asc" },
      });
      return rows.map(toWorkflow);
    },

    async findByTemplate(workspaceId, templateKey, listId) {
      const rows = await client.workflow.findMany({
        where: { workspaceId, templateKey, listId },
        include: workflowInclude,
        orderBy: { createdAt: "asc" },
      });
      return rows.map(toWorkflow);
    },

    async getWorkflow(id) {
      const row = await client.workflow.findUnique({ where: { id }, include: workflowInclude });
      return row ? toWorkflow(row) : null;
    },

    async createWorkflow(input: WorkflowInput) {
      // Nested create writes workflow + trigger + conditions + actions atomically.
      const row = await client.workflow.create({
        data: {
          workspaceId: input.workspaceId,
          name: input.name,
          description: input.description,
          isActive: input.isActive,
          conditionLogic: input.conditionLogic,
          templateKey: input.templateKey ?? null,
          listId: input.listId ?? null,
          trigger: {
            create: { type: input.trigger.type, config: toJson(input.trigger.config) },
          },
          conditions: {
            create: input.conditions.map((c, i) => ({
              position: i,
              field: c.field,
              operator: c.operator,
              value: toJson(c.value),
            })),
          },
          actions: {
            create: input.actions.map((a, i) => ({
              position: i,
              type: a.type,
              payload: toJson(a.payload),
            })),
          },
        },
        include: workflowInclude,
      });
      return toWorkflow(row);
    },

    async updateWorkflow(id, patch) {
      try {
        const row = await client.workflow.update({ where: { id }, data: patch, include: workflowInclude });
        return toWorkflow(row);
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") return null;
        throw err;
      }
    },

    async deleteWorkflow(id) {
      try {
        await client.workflow.delete({ where: { id } }); // cascades to children
        return true;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") return false;
        throw err;
      }
    },

    async logRun(run: NewRun) {
      const row = await client.automationRun.create({
        data: {
          workflowId: run.workflowId,
          workspaceId: run.workspaceId,
          eventType: run.eventType,
          taskId: run.taskId,
          depth: run.depth,
          status: run.status,
          conditionsPassed: run.conditionsPassed,
          eventPayload: toJson(run.eventPayload),
          conditionResults: toJson(run.conditionResults as unknown as JsonValue),
          actionResults: toJson(run.actionResults as unknown as JsonValue),
          error: run.error,
        },
        include: { workflow: { select: { name: true } } },
      });
      return toRun(row);
    },

    async listRuns(workspaceId, limit = 20) {
      const rows = await client.automationRun.findMany({
        where: { workspaceId },
        include: { workflow: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      return rows.map(toRun);
    },
  };
}

let singleton: WorkflowRepository | undefined;
export function getPrismaRepository(): WorkflowRepository {
  if (!singleton) singleton = createPrismaRepository();
  return singleton;
}

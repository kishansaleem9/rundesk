/**
 * WorkflowRepository — persistence boundary for workflows and run logs.
 *
 * The engine and API routes depend only on this interface. Two implementations
 * exist:
 *   - `repositories/memoryRepository.ts` — in-memory + seed data (no MySQL needed)
 *   - `repositories/prismaRepository.ts` — MySQL via Prisma
 *
 * `deps.ts` chooses one based on the AUTOMATION_REPO env var.
 */

import type {
  AutomationRun,
  TriggerType,
  Workflow,
  WorkflowInput,
  WorkflowPatch,
} from "./types";

export type NewRun = Omit<AutomationRun, "id" | "createdAt">;

export interface WorkflowRepository {
  /** Active workflows in a workspace whose trigger type matches the event. */
  findActiveWorkflowsByTrigger(type: TriggerType, workspaceId: string): Promise<Workflow[]>;
  listWorkflows(workspaceId: string): Promise<Workflow[]>;
  /** Workflows created from a preset for a given list (null = workspace-wide). */
  findByTemplate(workspaceId: string, templateKey: string, listId: string | null): Promise<Workflow[]>;
  getWorkflow(id: string): Promise<Workflow | null>;
  createWorkflow(input: WorkflowInput): Promise<Workflow>;
  updateWorkflow(id: string, patch: WorkflowPatch): Promise<Workflow | null>;
  deleteWorkflow(id: string): Promise<boolean>;
  logRun(run: NewRun): Promise<AutomationRun>;
  listRuns(workspaceId: string, limit?: number): Promise<AutomationRun[]>;
}

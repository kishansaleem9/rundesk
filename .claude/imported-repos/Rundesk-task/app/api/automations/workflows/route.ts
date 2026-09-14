/**
 * GET  /api/automations/workflows?workspaceId=ws_aura  → list workflows
 * POST /api/automations/workflows                      → create a workflow
 */

import { getDeps } from "@/lib/automation/deps";
import { workflowInputSchema } from "@/lib/automation/validation";
import { DEMO_WORKSPACE_ID } from "@/lib/automation/taskStore";
import { handleError, ok, readJson } from "../../_utils";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get("workspaceId") ?? DEMO_WORKSPACE_ID;
    const { repo } = await getDeps();
    return ok({ workflows: await repo.listWorkflows(workspaceId) });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const input = workflowInputSchema.parse(await readJson(req));
    const { repo } = await getDeps();
    const workflow = await repo.createWorkflow(input);
    return ok({ workflow }, 201);
  } catch (err) {
    return handleError(err);
  }
}

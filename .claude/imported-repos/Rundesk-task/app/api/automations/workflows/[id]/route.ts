/**
 * GET    /api/automations/workflows/:id → fetch one
 * PATCH  /api/automations/workflows/:id → update name / active flag / logic
 * DELETE /api/automations/workflows/:id → remove (cascades to trigger/conditions/actions)
 */

import { getDeps } from "@/lib/automation/deps";
import { workflowPatchSchema } from "@/lib/automation/validation";
import { fail, handleError, ok, readJson } from "../../../_utils";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { repo } = await getDeps();
    const workflow = await repo.getWorkflow(id);
    return workflow ? ok({ workflow }) : fail("Workflow not found", 404);
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const patch = workflowPatchSchema.parse(await readJson(req));
    const { repo } = await getDeps();
    const workflow = await repo.updateWorkflow(id, patch);
    return workflow ? ok({ workflow }) : fail("Workflow not found", 404);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { repo } = await getDeps();
    const deleted = await repo.deleteWorkflow(id);
    return deleted ? ok({ deleted: true }) : fail("Workflow not found", 404);
  } catch (err) {
    return handleError(err);
  }
}

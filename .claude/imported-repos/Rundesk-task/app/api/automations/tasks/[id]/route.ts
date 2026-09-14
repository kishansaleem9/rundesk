/** PATCH /api/automations/tasks/:id → update fields and run matching automations. */

import { getDeps } from "@/lib/automation/deps";
import { applyTaskChange } from "@/lib/automation/taskMutations";
import { taskPatchSchema } from "@/lib/automation/validation";
import { handleError, ok, readJson } from "../../../_utils";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const patch = taskPatchSchema.parse(await readJson(req));
    const deps = await getDeps();
    const result = await applyTaskChange(id, patch, deps);
    return ok(result);
  } catch (err) {
    return handleError(err);
  }
}

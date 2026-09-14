/** POST /api/automations/tasks/reset → restore the seed tasks (demo only). */

import { getDeps } from "@/lib/automation/deps";
import { handleError, ok } from "../../../_utils";

export async function POST() {
  try {
    const { taskStore } = await getDeps();
    taskStore.reset();
    return ok({ reset: true });
  } catch (err) {
    return handleError(err);
  }
}

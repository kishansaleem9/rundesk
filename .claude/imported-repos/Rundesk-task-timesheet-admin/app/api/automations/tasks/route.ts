/**
 * GET  /api/automations/tasks?workspaceId=ws_aura[&listId=list_eng] → mock tasks + notifications
 * POST /api/automations/tasks                                       → create a task (emits task_created)
 *
 * Demo-only task endpoints. Rundesk already has its own; when integrating,
 * call `createTask` / `applyTaskChange` from your existing mutations instead.
 */

import { getDeps } from "@/lib/automation/deps";
import { createTask } from "@/lib/automation/taskMutations";
import { DEMO_WORKSPACE_ID } from "@/lib/automation/taskStore";
import { taskCreateSchema } from "@/lib/automation/validation";
import { handleError, ok, readJson } from "../../_utils";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get("workspaceId") ?? DEMO_WORKSPACE_ID;
    const listId = url.searchParams.get("listId");
    const { taskStore } = await getDeps();
    const [tasks, notifications] = await Promise.all([
      taskStore.list(workspaceId),
      taskStore.listNotifications(workspaceId),
    ]);
    return ok({ tasks: listId ? tasks.filter((t) => t.listId === listId) : tasks, notifications });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const input = taskCreateSchema.parse(await readJson(req));
    const deps = await getDeps();
    const result = await createTask(input, deps);
    return ok(result, 201);
  } catch (err) {
    return handleError(err);
  }
}

/**
 * POST /api/automations/events
 *
 * Entry point for the host app: send an event such as
 *   { "type": "status_changed", "workspaceId": "ws_aura", "taskId": "task_1",
 *     "payload": { "from": "review", "to": "done" } }
 * and the engine runs every matching workflow, returning one RunReport each.
 *
 * In Rundesk, call this (or `runEvent` directly) from the server action that
 * mutates the task.
 */

import { runEvent } from "@/lib/automation/engine";
import { getDeps } from "@/lib/automation/deps";
import { eventSchema } from "@/lib/automation/validation";
import { handleError, ok, readJson } from "../../_utils";

export async function POST(req: Request) {
  try {
    const event = eventSchema.parse(await readJson(req));
    const deps = await getDeps();
    const reports = await runEvent(event, deps);
    const task = await deps.taskStore.get(event.taskId);
    return ok({ reports, task });
  } catch (err) {
    return handleError(err);
  }
}

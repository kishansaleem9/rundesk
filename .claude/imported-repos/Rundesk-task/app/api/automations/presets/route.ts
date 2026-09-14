/** GET /api/automations/presets?workspaceId=ws_aura&listId=list_eng → preset cards + active state. */

import { getDeps } from "@/lib/automation/deps";
import { getPresetStates } from "@/lib/automation/presetService";
import { DEMO_WORKSPACE_ID } from "@/lib/automation/taskStore";
import { fail, handleError, ok } from "../../_utils";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get("workspaceId") ?? DEMO_WORKSPACE_ID;
    const listId = url.searchParams.get("listId");
    if (!listId) return fail("listId is required");
    const { repo } = await getDeps();
    return ok(await getPresetStates(repo, workspaceId, listId));
  } catch (err) {
    return handleError(err);
  }
}

/** GET /api/automations/runs?workspaceId=ws_aura&limit=20 → recent run log. */

import { getDeps } from "@/lib/automation/deps";
import { DEMO_WORKSPACE_ID } from "@/lib/automation/taskStore";
import { handleError, ok } from "../../_utils";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get("workspaceId") ?? DEMO_WORKSPACE_ID;
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 20) || 20, 100);
    const { repo } = await getDeps();
    return ok({ runs: await repo.listRuns(workspaceId, limit) });
  } catch (err) {
    return handleError(err);
  }
}

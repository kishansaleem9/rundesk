/**
 * POST /api/automations/presets/:key
 * Body: { workspaceId, listId, enabled, params? } → turns a preset on/off for a list.
 */

import { getDeps } from "@/lib/automation/deps";
import { togglePreset } from "@/lib/automation/presetService";
import { presetToggleSchema } from "@/lib/automation/validation";
import { handleError, ok, readJson } from "../../../_utils";

type Params = { params: Promise<{ key: string }> };

export async function POST(req: Request, { params }: Params) {
  try {
    const { key } = await params;
    const body = presetToggleSchema.parse(await readJson(req));
    const { repo } = await getDeps();
    const preset = await togglePreset(repo, key, body);
    return ok({ preset });
  } catch (err) {
    return handleError(err);
  }
}

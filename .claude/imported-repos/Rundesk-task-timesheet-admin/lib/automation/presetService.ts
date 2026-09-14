/**
 * Preset toggling logic shared by the API routes and tests.
 *
 * A preset is "active" for a list when at least one workflow tagged with its
 * `templateKey` and `listId` is active. Turning a preset on creates the
 * template's workflows (or re-activates paused ones); turning it off pauses
 * them so the run history stays visible in Manage automations.
 */

import { getPreset, PRESETS, presetMeta, type PresetMeta } from "./presets";
import type { WorkflowRepository } from "./repository";
import type { Workflow } from "./types";

export interface PresetState extends PresetMeta {
  active: boolean;
  workflowIds: string[];
}

export interface PresetPanelState {
  presets: PresetState[];
  /** Active presets + active hand-built rules visible in this list. */
  totalActive: number;
}

const visibleIn = (w: Workflow, listId: string) => !w.listId || w.listId === listId;

export async function getPresetStates(
  repo: WorkflowRepository,
  workspaceId: string,
  listId: string,
): Promise<PresetPanelState> {
  const all = (await repo.listWorkflows(workspaceId)).filter((w) => visibleIn(w, listId));

  const presets = PRESETS.map((p) => {
    const mine = all.filter((w) => w.templateKey === p.key && w.listId === listId);
    return { ...presetMeta(p), active: mine.some((w) => w.isActive), workflowIds: mine.map((w) => w.id) };
  });

  const customActive = all.filter((w) => !w.templateKey && w.isActive).length;
  const totalActive = presets.filter((p) => p.active).length + customActive;

  return { presets, totalActive };
}

export interface TogglePresetInput {
  workspaceId: string;
  listId: string;
  enabled: boolean;
  params?: Record<string, string>;
}

export async function togglePreset(
  repo: WorkflowRepository,
  key: string,
  input: TogglePresetInput,
): Promise<PresetState> {
  const preset = getPreset(key);
  if (!preset) throw new Error(`Unknown preset "${key}"`);

  const existing = await repo.findByTemplate(input.workspaceId, key, input.listId);
  const params = input.params ?? {};

  if (!input.enabled) {
    for (const w of existing) await repo.updateWorkflow(w.id, { isActive: false });
  } else if (existing.length > 0 && Object.keys(params).length === 0) {
    // Re-enable with the previous configuration.
    for (const w of existing) await repo.updateWorkflow(w.id, { isActive: true });
  } else {
    // Fresh configuration: replace any previous workflows for this template.
    for (const w of existing) await repo.deleteWorkflow(w.id);
    const inputs = preset.build({ workspaceId: input.workspaceId, listId: input.listId }, params);
    for (const wf of inputs) await repo.createWorkflow(wf);
  }

  const after = await repo.findByTemplate(input.workspaceId, key, input.listId);
  return { ...presetMeta(preset), active: after.some((w) => w.isActive), workflowIds: after.map((w) => w.id) };
}

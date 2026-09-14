"use client";

/**
 * The ClickUp-style automation popup:
 *   AI Fields  → Create AI Field + AI presets
 *   Other Automations → Create Automation + rule presets
 *   Footer → Manage automations · N total active
 */

import type { PresetPanelState } from "@/lib/automation/presetService";
import { Popover } from "../ui";
import { CreateCard, PresetCard } from "./PresetCard";

interface Props {
  listLabel: string;
  state: PresetPanelState | null;
  onToggle: (key: string, enabled: boolean, params?: Record<string, string>) => Promise<void>;
  onCreateAutomation: () => void;
  onCreateAiField: () => void;
  onManage: () => void;
  onClose: () => void;
}

export function AutomationPanel({
  listLabel,
  state,
  onToggle,
  onCreateAutomation,
  onCreateAiField,
  onManage,
  onClose,
}: Props) {
  const ai = state?.presets.filter((p) => p.section === "ai_fields") ?? [];
  const other = state?.presets.filter((p) => p.section === "automations") ?? [];

  return (
    <Popover onClose={onClose} className="right-0 top-full mt-2 w-[540px] max-w-[calc(100vw-2rem)] p-4">
      {/* Header */}
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-sm font-semibold text-accent-2">AI Fields</h2>
        <span className="text-xs text-muted">
          for tasks in <span className="text-fg">☰ {listLabel}</span>
        </span>
      </div>

      {/* Banner */}
      <div className="mb-3 flex items-center gap-3 rounded-xl border border-line bg-gradient-to-r from-ai/10 via-panel-2 to-panel-2 px-4 py-3">
        <span className="text-lg">✨</span>
        <div>
          <p className="text-xs font-semibold text-fg">Automatically keep your tasks up-to-date</p>
          <p className="text-[11px] text-muted">
            By autofilling task custom fields with AI.{" "}
            <span className="cursor-help underline decoration-dotted" title="Mock provider in this prototype">
              Learn more
            </span>
          </p>
        </div>
      </div>

      {/* AI field presets */}
      <div className="grid grid-cols-3 gap-2">
        <CreateCard label="Create AI Field" ai onClick={onCreateAiField} />
        {ai.map((p) => (
          <PresetCard key={p.key} preset={p} onToggle={(en, params) => onToggle(p.key, en, params)} />
        ))}
      </div>

      {/* Other automations */}
      <h3 className="mb-2 mt-5 text-sm font-semibold text-fg">Other Automations</h3>
      <div className="grid grid-cols-3 gap-2">
        <CreateCard label="Create Automation" onClick={onCreateAutomation} />
        {other.map((p) => (
          <PresetCard key={p.key} preset={p} onToggle={(en, params) => onToggle(p.key, en, params)} />
        ))}
      </div>

      {/* Footer */}
      <button
        type="button"
        onClick={onManage}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-panel-2/60 px-4 py-2.5 text-xs font-medium text-fg transition hover:bg-panel-2"
      >
        ⚙ Manage automations
        <span className="text-muted">·</span>
        <span className="text-accent-2">{state ? `${state.totalActive} total active` : "…"}</span>
      </button>
    </Popover>
  );
}

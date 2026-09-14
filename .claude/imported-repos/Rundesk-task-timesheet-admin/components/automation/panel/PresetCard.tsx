"use client";

/**
 * One tile in the automation panel: icon, label, optional "Suggested" tag and
 * a toggle. Presets with parameters open a config popover before turning on.
 */

import { useState } from "react";
import type { PresetState } from "@/lib/automation/presetService";
import { cx, Tag, Toggle } from "../ui";
import { PresetConfigPopover } from "./PresetConfigPopover";

interface Props {
  preset: PresetState;
  onToggle: (enabled: boolean, params?: Record<string, string>) => Promise<void>;
}

export function PresetCard({ preset, onToggle }: Props) {
  const [pending, setPending] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAi = preset.section === "ai_fields";

  const run = async (enabled: boolean, params?: Record<string, string>) => {
    setPending(true);
    setError(null);
    try {
      await onToggle(enabled, params);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };

  const handleToggle = (next: boolean) => {
    if (next && preset.params?.length) {
      setConfiguring(true);
      return;
    }
    void run(next);
  };

  return (
    <div
      className={cx(
        "relative flex min-h-[88px] flex-col justify-between rounded-xl border p-3 transition",
        preset.active
          ? "border-accent/50 bg-gradient-to-br from-accent/20 via-panel-2 to-panel-2 shadow-lg shadow-accent/10"
          : "border-line bg-panel-2/40 hover:border-line/80 hover:bg-panel-2/70",
      )}
      title={preset.description}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={cx(
            "flex h-7 w-7 items-center justify-center rounded-md text-sm",
            isAi ? "bg-ai/20" : "bg-line/60",
          )}
        >
          {preset.icon}
        </span>
        <div className="flex items-center gap-1.5">
          {preset.suggested && <Tag>Suggested</Tag>}
          <Toggle checked={preset.active} onChange={handleToggle} disabled={pending} label={preset.label} />
        </div>
      </div>
      <p className="mt-2 text-xs font-semibold leading-snug text-fg">{preset.label}</p>
      {error && <p className="mt-1 text-[10px] text-danger">{error}</p>}

      {configuring && (
        <PresetConfigPopover
          title={preset.label}
          params={preset.params ?? []}
          onCancel={() => setConfiguring(false)}
          onConfirm={(values) => {
            setConfiguring(false);
            void run(true, values);
          }}
        />
      )}
    </div>
  );
}

/** "Create …" tile with a plus icon, used for Create AI Field / Create Automation. */
export function CreateCard({ label, ai, onClick }: { label: string; ai?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[88px] flex-col justify-between rounded-xl border border-line bg-panel-2/40 p-3 text-left transition hover:border-accent/50 hover:bg-panel-2/70"
    >
      <span
        className={cx(
          "flex h-7 w-7 items-center justify-center rounded-md text-base font-bold text-white",
          ai ? "bg-gradient-to-br from-ai to-accent" : "bg-gradient-to-br from-accent to-accent-2",
        )}
      >
        +
      </span>
      <span className="mt-2 text-xs font-semibold text-fg">{label}</span>
    </button>
  );
}

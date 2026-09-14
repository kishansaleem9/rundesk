"use client";

/** Bottom-right toast stack showing which automations ran after a task edit. */

import { useEffect } from "react";
import type { RunReport } from "@/lib/automation/types";
import { Badge } from "../automation/ui";

export interface ToastItem {
  id: number;
  title: string;
  reports: RunReport[];
}

export function ToastStack({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
      {items.map((t) => (
        <Toast key={t.id} item={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDismiss, 6000);
    return () => clearTimeout(id);
  }, [onDismiss]);

  const shown = item.reports.filter((r) => r.status !== "SKIPPED");

  return (
    <div className="pointer-events-auto rounded-xl border border-line bg-panel p-3 text-xs shadow-2xl shadow-black/40">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-fg">{item.title}</p>
        <button type="button" onClick={onDismiss} className="text-muted hover:text-fg" aria-label="Dismiss">
          ✕
        </button>
      </div>
      {shown.length === 0 ? (
        <p className="mt-1 text-muted">No automations ran.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {shown.map((r, i) => (
            <li key={i}>
              <div className="flex items-center gap-1.5">
                <Badge tone={r.status === "SUCCESS" ? "ok" : "danger"}>{r.status}</Badge>
                <span className="truncate text-fg">{r.workflowName}</span>
              </div>
              <ul className="ml-1 mt-0.5 text-muted">
                {r.actionResults.map((a) => (
                  <li key={a.position} className="truncate">
                    → {a.message}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

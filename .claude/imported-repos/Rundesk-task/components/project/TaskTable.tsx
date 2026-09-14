"use client";

/**
 * ClickUp-style list view: tasks grouped by status with inline editors.
 * Every inline change goes through `onUpdate`, which hits the task API and
 * therefore fires automations — that's how presets react to real edits.
 * Active AI fields appear as extra columns.
 */

import { useState } from "react";
import { AI_FIELD_LABELS, OPTIONS } from "@/lib/automation/catalog";
import type { AiFieldKey, Task, TaskPatch } from "@/lib/automation/types";
import { cx } from "../automation/ui";

interface Props {
  tasks: Task[];
  aiColumns: AiFieldKey[];
  onUpdate: (id: string, patch: TaskPatch) => Promise<void>;
  onCreate: (title: string) => Promise<void>;
}

const STATUS_ORDER = OPTIONS.statuses.map((s) => s.value);
const statusLabel = (v: string) => OPTIONS.statuses.find((s) => s.value === v)?.label ?? v;

const priorityColor: Record<string, string> = {
  urgent: "text-danger",
  high: "text-warn",
  normal: "text-accent-2",
  low: "text-muted",
};

const cell = "px-3 py-2 text-xs";
const inline =
  "w-full cursor-pointer rounded bg-transparent px-1 py-0.5 text-xs text-fg hover:bg-panel-2 focus:bg-panel-2 focus:outline-none";

export function TaskTable({ tasks, aiColumns, onUpdate, onCreate }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [newTitle, setNewTitle] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const change = async (id: string, patch: TaskPatch) => {
    setBusy(id);
    try {
      await onUpdate(id, patch);
    } finally {
      setBusy(null);
    }
  };

  const create = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setBusy("new");
    try {
      await onCreate(title);
      setNewTitle("");
    } finally {
      setBusy(null);
    }
  };

  const groups = STATUS_ORDER.map((s) => ({ status: s, tasks: tasks.filter((t) => t.status === s) })).filter(
    (g) => g.tasks.length > 0,
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-panel">
      <table className="w-full min-w-[820px] border-collapse">
        <thead>
          <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
            <th className={cx(cell, "w-[34%]")}>Name</th>
            <th className={cell}>Assignee</th>
            <th className={cell}>Due date</th>
            <th className={cell}>Priority</th>
            <th className={cell}>Status</th>
            <th className={cx(cell, "text-center")}>Comments</th>
            {aiColumns.map((k) => (
              <th key={k} className={cx(cell, "min-w-[220px]")}>
                <span className="text-ai">✨</span> {AI_FIELD_LABELS[k]}
              </th>
            ))}
          </tr>
        </thead>

        {groups.map((g) => (
          <tbody key={g.status}>
            {/* Group header */}
            <tr className="bg-panel-2/40">
              <td colSpan={6 + aiColumns.length} className="px-3 py-1.5">
                <button
                  type="button"
                  onClick={() => setCollapsed((c) => ({ ...c, [g.status]: !c[g.status] }))}
                  className="flex items-center gap-2 text-xs"
                >
                  <span className="text-muted">{collapsed[g.status] ? "▸" : "▾"}</span>
                  <span className="rounded-full border border-line px-2 py-0.5 font-semibold uppercase text-fg">
                    {statusLabel(g.status)}
                  </span>
                  <span className="text-muted">{g.tasks.length}</span>
                </button>
              </td>
            </tr>

            {!collapsed[g.status] &&
              g.tasks.map((t) => (
                <tr
                  key={t.id}
                  className={cx("border-t border-line/60 transition hover:bg-panel-2/30", busy === t.id && "opacity-60")}
                >
                  <td className={cell}>
                    <div className="flex items-center gap-2">
                      <span className={cx("h-2.5 w-2.5 rounded-full", t.status === "done" ? "bg-ok" : "border border-muted")} />
                      <span className="font-medium text-fg">{t.title}</span>
                      {(t.tags ?? []).map((tag) => (
                        <span key={tag} className="rounded bg-line/60 px-1.5 py-0.5 text-[10px] text-muted">
                          {tag}
                        </span>
                      ))}
                      {(t.followers?.length ?? 0) > 0 && (
                        <span className="text-[10px] text-muted" title={`Followers: ${t.followers.join(", ")}`}>
                          👁 {t.followers.length}
                        </span>
                      )}
                    </div>
                  </td>

                  <td className={cell}>
                    <select
                      className={inline}
                      value={t.assigneeId ?? ""}
                      onChange={(e) => change(t.id, { assigneeId: e.target.value || null })}
                    >
                      <option value="">— unassigned</option>
                      {OPTIONS.users.map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td className={cell}>
                    <input
                      type="date"
                      className={inline}
                      value={t.dueDate ? t.dueDate.slice(0, 10) : ""}
                      onChange={(e) =>
                        change(t.id, { dueDate: e.target.value ? new Date(e.target.value).toISOString() : null })
                      }
                    />
                  </td>

                  <td className={cell}>
                    <select
                      className={cx(inline, priorityColor[t.priority])}
                      value={t.priority}
                      onChange={(e) => change(t.id, { priority: e.target.value })}
                    >
                      {OPTIONS.priorities.map((p) => (
                        <option key={p.value} value={p.value}>
                          ⚑ {p.label}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td className={cell}>
                    <select
                      className={cx(inline, "rounded-full border border-line font-semibold uppercase")}
                      value={t.status}
                      onChange={(e) => change(t.id, { status: e.target.value })}
                    >
                      {OPTIONS.statuses.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td className={cx(cell, "text-center text-muted")} title={(t.comments ?? []).map((c) => c.body).join("\n")}>
                    💬 {t.comments?.length || ""}
                  </td>

                  {aiColumns.map((k) => (
                    <td key={k} className={cx(cell, "text-muted")}>
                      {t.aiFields?.[k] ?? <span className="text-muted/50">— will fill on next update</span>}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        ))}

        {/* Add task */}
        <tbody>
          <tr className="border-t border-line">
            <td colSpan={6 + aiColumns.length} className="px-3 py-2">
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void create();
                }}
              >
                <span className="text-muted">+</span>
                <input
                  className="w-full bg-transparent text-xs text-fg placeholder:text-muted focus:outline-none"
                  placeholder="Add Task (press Enter)"
                  value={newTitle}
                  disabled={busy === "new"}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
              </form>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

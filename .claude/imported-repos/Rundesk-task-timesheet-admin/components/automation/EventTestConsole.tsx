"use client";

/**
 * EventTestConsole — simulates the host app emitting an event so you can watch
 * the engine work without a real task mutation. Shows every RunReport
 * (matched workflows, per-condition verdicts, per-action results) and the
 * task's state afterwards.
 *
 * Demo-only; not needed inside Rundesk once real events are wired up.
 */

import { useCallback, useEffect, useState } from "react";
import { optionLabel, type Catalog } from "@/lib/automation/catalog";
import type { JsonObject, Notification, RunReport, Task, TriggerType } from "@/lib/automation/types";
import { api } from "./api";
import { FieldControl } from "./FieldControl";
import { Badge, Button, Card, Label, Select } from "./ui";

interface Props {
  catalog: Catalog;
  workspaceId: string;
  /** Called after an event ran (so the parent can refresh run history etc). */
  onFired?: () => void;
}

export function EventTestConsole({ catalog, workspaceId, onFired }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [taskId, setTaskId] = useState("");
  const [type, setType] = useState<TriggerType>("status_changed");
  const [payload, setPayload] = useState<JsonObject>({});
  const [reports, setReports] = useState<RunReport[] | null>(null);
  const [resultTask, setResultTask] = useState<Task | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const triggerDef = catalog.triggers.find((t) => t.type === type)!;

  /** Push a fresh task/notification snapshot into state. */
  const applyTasks = useCallback((data: { tasks: Task[]; notifications: Notification[] }) => {
    setTasks(data.tasks);
    setNotifications(data.notifications);
    setTaskId((cur) => cur || data.tasks[0]?.id || "");
  }, []);

  const loadTasks = useCallback(
    () => api.listTasks(workspaceId).then(applyTasks),
    [workspaceId, applyTasks],
  );

  // Initial load; state updates happen in promise callbacks only.
  useEffect(() => {
    let active = true;
    api
      .listTasks(workspaceId)
      .then((data) => active && applyTasks(data))
      .catch((e) => active && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      active = false;
    };
  }, [workspaceId, applyTasks]);

  const fire = async () => {
    if (!taskId) return;
    setBusy(true);
    setError(null);
    try {
      const task = tasks.find((t) => t.id === taskId);
      // For task_created the "listId" payload should reflect the task itself.
      const fullPayload: JsonObject =
        type === "task_created" && task ? { listId: task.listId, ...payload } : payload;

      const res = await api.fireEvent({ type, workspaceId, taskId, payload: fullPayload });
      setReports(res.reports);
      setResultTask(res.task);
      await loadTasks();
      onFired?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    await api.resetTasks();
    setReports(null);
    setResultTask(null);
    await loadTasks();
    onFired?.();
  };

  return (
    <Card
      title="Test console"
      subtitle="Simulate an event from the host app"
      action={
        <Button variant="ghost" size="sm" onClick={reset}>
          Reset mock data
        </Button>
      }
    >
      <div className="space-y-3">
        <div>
          <Label>Task</Label>
          <Select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title} · {optionLabel("statuses", t.status)} · {optionLabel("priorities", t.priority)} ·{" "}
                {t.assigneeId ? optionLabel("users", t.assigneeId) : "unassigned"}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label>Event</Label>
          <Select
            value={type}
            onChange={(e) => {
              setType(e.target.value as TriggerType);
              setPayload({});
            }}
          >
            {catalog.triggers.map((t) => (
              <option key={t.type} value={t.type}>
                {t.type}
              </option>
            ))}
          </Select>
        </div>

        {triggerDef.configFields.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {triggerDef.configFields.map((f) => (
              <FieldControl
                key={f.key}
                field={{ ...f, optional: false, label: `payload.${f.key}` }}
                value={payload[f.key]}
                options={catalog.options}
                onChange={(v) => setPayload((p) => ({ ...p, [f.key]: v }))}
              />
            ))}
          </div>
        )}

        <Button onClick={fire} disabled={busy || !taskId} className="w-full">
          {busy ? "Running…" : "Fire event"}
        </Button>

        {error && <p className="text-sm text-danger">{error}</p>}

        {/* Results */}
        {reports && (
          <div className="space-y-3 border-t border-line/60 pt-3">
            {reports.length === 0 && (
              <p className="text-sm text-muted">No active workflow matched this event.</p>
            )}
            {reports.map((r, i) => (
              <ReportCard key={i} report={r} />
            ))}

            {resultTask && (
              <div className="rounded-lg border border-line bg-panel-2/40 p-3 text-xs">
                <p className="mb-1 font-semibold text-fg">Task after run</p>
                <p className="text-muted">
                  {resultTask.title} — {optionLabel("statuses", resultTask.status)} ·{" "}
                  {optionLabel("priorities", resultTask.priority)} ·{" "}
                  {resultTask.assigneeId ? optionLabel("users", resultTask.assigneeId) : "unassigned"} · due{" "}
                  {resultTask.dueDate ? resultTask.dueDate.slice(0, 10) : "—"}
                </p>
                {resultTask.comments.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {resultTask.comments.map((c) => (
                      <li key={c.id} className="text-muted">
                        💬 {c.body}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {notifications.length > 0 && (
          <div className="border-t border-line/60 pt-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Notifications sent</p>
            <ul className="space-y-1 text-xs text-muted">
              {notifications.slice(0, 5).map((n) => (
                <li key={n.id}>
                  🔔 <span className="text-fg">{optionLabel("users", n.recipientId)}</span>: {n.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ---------- one RunReport ---------- */

function ReportCard({ report }: { report: RunReport }) {
  const tone = report.status === "SUCCESS" ? "ok" : report.status === "SKIPPED" ? "warn" : "danger";
  return (
    <div className="rounded-lg border border-line p-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-fg">{report.workflowName}</span>
        <div className="flex items-center gap-1.5">
          {report.depth > 0 && <Badge tone="neutral">chained · depth {report.depth}</Badge>}
          <Badge tone={tone}>{report.status}</Badge>
        </div>
      </div>

      {report.conditionResults.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {report.conditionResults.map((c) => (
            <li key={c.position} className={c.passed ? "text-ok" : "text-danger"}>
              {c.passed ? "✓" : "✗"} {c.field} {c.operator} {JSON.stringify(c.expected)}{" "}
              <span className="text-muted">(actual: {JSON.stringify(c.actual)})</span>
            </li>
          ))}
        </ul>
      )}

      {report.actionResults.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {report.actionResults.map((a) => (
            <li key={a.position} className={a.ok ? "text-fg" : "text-danger"}>
              {a.ok ? "→" : "✗"} <span className="text-muted">{a.type}:</span> {a.message}
            </li>
          ))}
        </ul>
      )}

      {report.error && <p className="mt-2 text-danger">{report.error}</p>}
    </div>
  );
}

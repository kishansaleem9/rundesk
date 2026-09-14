/**
 * AI text provider used by the `update_ai_field` action.
 *
 * The prototype ships a deterministic MOCK that composes sentences from task
 * data, so AI Fields work offline and tests are stable. To use a real model,
 * implement `AiTextProvider` (e.g. call the Claude Messages API with the task
 * as context) and return it from `getAiTextProvider()` when
 * `AI_PROVIDER=claude`.
 */

import { optionLabel } from "../catalog";
import type { AiFieldKey, AutomationEvent, Task } from "../types";

export interface AiTextContext {
  task: Task;
  event: AutomationEvent;
}

export interface AiTextProvider {
  generate(field: AiFieldKey, ctx: AiTextContext): Promise<string>;
}

/* ---------- mock implementation ---------- */

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;

const who = (id: string | null) => (id ? optionLabel("users", id) : "nobody");

export const mockAiTextProvider: AiTextProvider = {
  async generate(field, { task, event }) {
    const status = optionLabel("statuses", task.status);
    const priority = optionLabel("priorities", task.priority);
    const due = fmtDate(task.dueDate);
    const lastComment = task.comments.at(-1);

    switch (field) {
      case "summary":
        return (
          `"${task.title}" is ${status} at ${priority} priority, assigned to ${who(task.assigneeId)}` +
          (due ? `, due ${due}` : ", no due date") +
          `. ${task.comments.length} comment${task.comments.length === 1 ? "" : "s"}` +
          (task.tags.length ? ` · tags: ${task.tags.join(", ")}` : "") +
          "."
        );

      case "progressUpdates": {
        const change =
          event.type === "status_changed"
            ? `Moved from ${optionLabel("statuses", String(event.payload.from ?? ""))} to ${status}.`
            : `Currently ${status}.`;
        const note = lastComment ? ` Latest note: "${lastComment.body}"` : "";
        return `${change}${note}`;
      }

      case "projectMilestone":
        return task.status === "done"
          ? "Milestone reached: delivered."
          : task.status === "review"
            ? "Milestone: awaiting review sign-off."
            : task.status === "in_progress"
              ? "Milestone: implementation underway."
              : "Milestone: not started.";

      case "assignedTeamMember":
        return task.assigneeId
          ? `${who(task.assigneeId)} owns this task (${priority} priority).`
          : "Unassigned — needs an owner.";

      case "completionDeadline": {
        if (!task.dueDate) return "No deadline set.";
        const days = Math.ceil((new Date(task.dueDate).getTime() - Date.now()) / 86400_000);
        if (task.status === "done") return `Completed; deadline was ${due}.`;
        if (days < 0) return `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} (was ${due}).`;
        if (days === 0) return `Due today (${due}).`;
        return `Due in ${days} day${days === 1 ? "" : "s"} (${due}).`;
      }
    }
  },
};

/* ---------- selection ---------- */

export function getAiTextProvider(): AiTextProvider {
  if (process.env.AI_PROVIDER === "claude") {
    // Integration point: return a provider that calls the Claude API here.
    throw new Error("AI_PROVIDER=claude is not configured in this prototype; implement AiTextProvider.");
  }
  return mockAiTextProvider;
}

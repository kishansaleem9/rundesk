-- MY AGENT PERFORMANCE, AS CLICKUP HAS IT (`found-14-oct/agent-performance-carried-and-unbuilt`).
--
-- ClickUp's Credits tab draws a row per Super Agent: the actions it completed,
-- the time they saved at a per-action time benchmark, the value of that time,
-- its cost and its ROI. Rundesk kept an agent's model calls under the person it
-- acted for and no count of what a run did, so none of it could be told.
--
--   · `ai_usage.agent_run_id`: the Super Agent run a call was made in, so an
--     agent's cost is its own and not the cost of whoever started it;
--   · `super_agent_runs.actions_completed`: the actions of a run that were
--     carried out;
--   · `workspaces.ai_minutes_saved_per_agent_action`: the minutes one such
--     action is taken to save, edited beside the hourly rate ("Edit benchmark").
ALTER TABLE "ai_usage" ADD COLUMN IF NOT EXISTS "agent_run_id" uuid REFERENCES "super_agent_runs"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "idx_ai_usage_agent_run" ON "ai_usage" ("agent_run_id");

ALTER TABLE "super_agent_runs" ADD COLUMN IF NOT EXISTS "actions_completed" integer NOT NULL DEFAULT 0;
ALTER TABLE "super_agent_runs" DROP CONSTRAINT IF EXISTS "super_agent_runs_actions_check";
ALTER TABLE "super_agent_runs" ADD CONSTRAINT "super_agent_runs_actions_check" CHECK ("actions_completed" >= 0);

ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "ai_minutes_saved_per_agent_action" integer NOT NULL DEFAULT 6;
ALTER TABLE "workspaces" DROP CONSTRAINT IF EXISTS "workspaces_ai_agent_minutes_sane";
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_ai_agent_minutes_sane" CHECK ("ai_minutes_saved_per_agent_action" >= 0 AND "ai_minutes_saved_per_agent_action" <= 480);

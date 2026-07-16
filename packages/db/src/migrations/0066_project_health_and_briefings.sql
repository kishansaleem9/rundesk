-- §7.13 Project Health Scoring (daily-persisted trend + sentiment) and
-- §7.11 AI Daily Briefings. Additive + idempotent — safe to re-run.
--
-- project_health_scores: one row per active project per calendar day. The daily
-- ProjectHealthService cron reuses ReportsService.getProjectHealth, folds in a
-- comment-sentiment component, and upserts here keyed by (project_id, scored_on)
-- via onConflict so re-runs the same day update in place. The trend endpoint
-- reads these rows back for a 30-day sparkline.
CREATE TABLE IF NOT EXISTS "project_health_scores" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id"   uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "score"        integer NOT NULL,
  "band"         text NOT NULL,
  "components"   jsonb NOT NULL DEFAULT '{"onTime":0,"overdue":0,"blockers":0,"activity":0,"sentiment":0}'::jsonb,
  "sentiment"    jsonb NOT NULL DEFAULT '{"score":50,"label":"neutral","positive":0,"negative":0,"samples":0,"source":"deterministic"}'::jsonb,
  "scored_on"    date NOT NULL,
  "created_at"   timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
-- One score per project per day; ON CONFLICT target for the idempotent upsert.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_project_health_scores_project_day"
  ON "project_health_scores" ("project_id", "scored_on");--> statement-breakpoint
-- Workspace + day lookup so the trend read stays index-friendly.
CREATE INDEX IF NOT EXISTS "idx_project_health_scores_ws_day"
  ON "project_health_scores" ("workspace_id", "scored_on");--> statement-breakpoint
-- §7.11 'ai_briefing' notification type — the daily briefing is delivered as an
-- in-app notification of this type. ADD VALUE IF NOT EXISTS is safe and the new
-- value is not used within this migration.
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'ai_briefing';--> statement-breakpoint
-- §7.11 per-user briefing preference on the notification_preferences jsonb
-- (default: disabled, delivered at 08:00 server time). Backfilled here so
-- existing rows carry the field explicitly; the notifications service also
-- merges the default on read. Only touches rows lacking the key.
UPDATE "users"
SET "notification_preferences" = jsonb_set("notification_preferences", '{briefing}', '{"enabled": false, "hour": 8}'::jsonb, true)
WHERE "notification_preferences" -> 'briefing' IS NULL;

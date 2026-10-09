-- The Teams hub's Analytics, as ClickUp's (formerly Pulse): who may open it — everyone but guests,
-- or owners and admins — and the task views it counts (`ledger-rows/section3-team-analytics`).
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "analytics_audience" text DEFAULT 'members' NOT NULL;
DO $$ BEGIN
  ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_analytics_audience_known" CHECK ("analytics_audience" in ('members', 'admins'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS "task_view_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "task_id" uuid NOT NULL REFERENCES "tasks"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "viewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_task_view_events_workspace" ON "task_view_events" ("workspace_id", "viewed_at");
CREATE INDEX IF NOT EXISTS "idx_task_view_events_person" ON "task_view_events" ("user_id", "task_id", "viewed_at");

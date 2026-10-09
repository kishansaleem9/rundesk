-- ClickUp's "Sync tasks to calendar": a person's syncs of a place to one of their own calendars,
-- and the event each task became there (`ledger-rows/row-1962`). Nothing syncs until a sync is added.
CREATE TABLE IF NOT EXISTS "calendar_sync_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "account_id" uuid NOT NULL REFERENCES "user_calendar_accounts"("id") ON DELETE cascade,
  "scope_type" text NOT NULL,
  "scope_id" uuid NOT NULL,
  "assigned_only" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE "calendar_sync_rules" ADD CONSTRAINT "calendar_sync_rules_scope_type" CHECK ("scope_type" IN ('space', 'folder', 'project', 'list'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "uq_calendar_sync_rules_place" ON "calendar_sync_rules" ("account_id", "scope_type", "scope_id");
CREATE INDEX IF NOT EXISTS "idx_calendar_sync_rules_workspace" ON "calendar_sync_rules" ("workspace_id");
CREATE TABLE IF NOT EXISTS "calendar_sync_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "user_calendar_accounts"("id") ON DELETE cascade,
  "task_id" uuid NOT NULL REFERENCES "tasks"("id") ON DELETE cascade,
  "external_event_id" text NOT NULL,
  "fingerprint" text NOT NULL,
  "synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_calendar_sync_events_account_task" ON "calendar_sync_events" ("account_id", "task_id");
CREATE INDEX IF NOT EXISTS "idx_calendar_sync_events_task" ON "calendar_sync_events" ("task_id");

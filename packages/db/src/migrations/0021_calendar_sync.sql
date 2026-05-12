-- Bidirectional calendar sync: maps tasks <-> external calendar events
-- and stores per-user iCal subscription tokens.

CREATE TABLE IF NOT EXISTS "task_calendar_links" (
  "id"                   uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "task_id"              uuid NOT NULL,
  "user_id"              uuid NOT NULL,
  "workspace_id"         uuid NOT NULL,
  "provider"             text NOT NULL,
  "external_calendar_id" text NOT NULL,
  "external_event_id"    text NOT NULL,
  "etag"                 text,
  "last_synced_at"       timestamp with time zone DEFAULT now() NOT NULL,
  "created_at"           timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"           timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "task_calendar_links"
    ADD CONSTRAINT "task_calendar_links_task_fk"
    FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "task_calendar_links"
    ADD CONSTRAINT "task_calendar_links_user_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "task_calendar_links"
    ADD CONSTRAINT "task_calendar_links_workspace_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "task_calendar_links"
    ADD CONSTRAINT "uq_task_calendar_links_task_provider_user"
    UNIQUE ("task_id", "provider", "user_id");
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "idx_task_calendar_links_event"
  ON "task_calendar_links" ("provider", "external_event_id");
CREATE INDEX IF NOT EXISTS "idx_task_calendar_links_user"
  ON "task_calendar_links" ("user_id", "workspace_id");

CREATE TABLE IF NOT EXISTS "user_ical_tokens" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"      uuid NOT NULL,
  "workspace_id" uuid NOT NULL,
  "token"        text NOT NULL,
  "revoked_at"   timestamp with time zone,
  "last_used_at" timestamp with time zone,
  "created_at"   timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "user_ical_tokens"
    ADD CONSTRAINT "user_ical_tokens_user_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "user_ical_tokens"
    ADD CONSTRAINT "user_ical_tokens_workspace_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "user_ical_tokens"
    ADD CONSTRAINT "uq_user_ical_tokens_token" UNIQUE ("token");
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "user_ical_tokens"
    ADD CONSTRAINT "uq_user_ical_tokens_user_ws" UNIQUE ("user_id", "workspace_id");
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

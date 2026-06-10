-- OKR-style measurable key results under a goal.

CREATE TABLE IF NOT EXISTS "goal_key_results" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "goal_id"       uuid NOT NULL,
  "workspace_id"  uuid NOT NULL,
  "owner_id"      uuid,
  "title"         text NOT NULL,
  "unit"          text,
  "target_value"  double precision NOT NULL DEFAULT 100,
  "current_value" double precision NOT NULL DEFAULT 0,
  "status"        text NOT NULL DEFAULT 'on_track',
  "position"      integer NOT NULL DEFAULT 0,
  "created_at"    timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"    timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "goal_key_results"
    ADD CONSTRAINT "goal_key_results_goal_fk"
    FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "goal_key_results"
    ADD CONSTRAINT "goal_key_results_workspace_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "goal_key_results"
    ADD CONSTRAINT "goal_key_results_owner_fk"
    FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "idx_goal_key_results_goal"
  ON "goal_key_results" ("goal_id", "position");

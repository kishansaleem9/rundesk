-- Saved search filter presets (Plan §11.2 "Save filter combination as named
-- preset"). Per-user, per-workspace. Additive + idempotent.
CREATE TABLE IF NOT EXISTS "saved_searches" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "user_id"     uuid NOT NULL,
  "name"        text NOT NULL,
  "query"       text,
  "filters"     jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at"  timestamptz NOT NULL DEFAULT now(),
  "updated_at"  timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_user_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "saved_searches" ADD CONSTRAINT "uq_saved_searches_user_ws_name" UNIQUE ("user_id","workspace_id","name"); EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "idx_saved_searches_user_ws" ON "saved_searches" ("user_id","workspace_id");

-- AI usage & cost tracking (Plan §7.15 "API cost tracking per user / per org").
-- Additive. Records token usage per Claude API call so admins can see per-user
-- and per-workspace consumption + estimated cost.
CREATE TABLE IF NOT EXISTS "ai_usage" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id"  uuid,
  "user_id"       uuid,
  "feature"       text NOT NULL,
  "model"         text NOT NULL,
  "input_tokens"  integer NOT NULL DEFAULT 0,
  "output_tokens" integer NOT NULL DEFAULT 0,
  "created_at"    timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "idx_ai_usage_workspace_created" ON "ai_usage" ("workspace_id","created_at");
CREATE INDEX IF NOT EXISTS "idx_ai_usage_user" ON "ai_usage" ("user_id");

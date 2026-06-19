-- Saved custom report definitions for the report builder.
CREATE TABLE IF NOT EXISTS "custom_reports" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id"  uuid NOT NULL,
  "name"          text NOT NULL,
  "definition"    jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by_id" uuid,
  "created_at"    timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"    timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE "custom_reports" ADD CONSTRAINT "custom_reports_workspace_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "custom_reports" ADD CONSTRAINT "custom_reports_created_by_fk"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "idx_custom_reports_workspace" ON "custom_reports" ("workspace_id");

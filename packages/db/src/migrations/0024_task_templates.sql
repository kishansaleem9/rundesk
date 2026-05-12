-- Single-task templates per workspace. Distinct from project_templates
-- (which snapshots a whole project) — task_templates snapshots one task
-- including its subtasks, checklists, labels, and custom-field values.

CREATE TABLE IF NOT EXISTS "task_templates" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id"  uuid NOT NULL,
  "name"          text NOT NULL,
  "description"   text,
  "icon"          text,
  "payload"       jsonb NOT NULL,
  "usage_count"   integer NOT NULL DEFAULT 0,
  "created_by_id" uuid,
  "created_at"    timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"    timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "task_templates"
    ADD CONSTRAINT "task_templates_workspace_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "task_templates"
    ADD CONSTRAINT "task_templates_created_by_fk"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "idx_task_templates_workspace"
  ON "task_templates" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_task_templates_workspace_name"
  ON "task_templates" ("workspace_id", "name");

-- Private per-user to-do list (Home → Personal List).
CREATE TABLE IF NOT EXISTS "personal_tasks" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"      uuid NOT NULL,
  "workspace_id" uuid NOT NULL,
  "title"        text NOT NULL,
  "done"         boolean NOT NULL DEFAULT false,
  "position"     integer NOT NULL DEFAULT 0,
  "created_at"   timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"   timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE "personal_tasks" ADD CONSTRAINT "personal_tasks_user_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "personal_tasks" ADD CONSTRAINT "personal_tasks_workspace_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "idx_personal_tasks_user_ws" ON "personal_tasks" ("user_id","workspace_id");

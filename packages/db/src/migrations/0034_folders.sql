-- Folder (Level 4): groups multiple projects inside a space
-- (Org > Workspace > Space > Folder > Project). Optional — a project with a
-- NULL folder_id sits directly under its space, so existing data is unaffected.
CREATE TABLE IF NOT EXISTS "folders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "space_id" uuid NOT NULL,
  "name" text NOT NULL,
  "color" text DEFAULT '#354fb0',
  "position" integer NOT NULL DEFAULT 0,
  "created_by_id" uuid,
  "is_archived" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN
  ALTER TABLE "folders" ADD CONSTRAINT "folders_space_fk"
    FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "folders" ADD CONSTRAINT "folders_created_by_fk"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "idx_folders_space" ON "folders" ("space_id", "position");

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "folder_id" uuid;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "position" integer NOT NULL DEFAULT 0;
DO $$ BEGIN
  ALTER TABLE "projects" ADD CONSTRAINT "projects_folder_fk"
    FOREIGN KEY ("folder_id") REFERENCES "folders"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "idx_projects_folder" ON "projects" ("folder_id");

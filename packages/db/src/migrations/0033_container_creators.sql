-- Track who created each space/project/list so update/delete can be limited to
-- the creator or a workspace admin (members were able to modify others' containers).
ALTER TABLE "spaces"   ADD COLUMN IF NOT EXISTS "created_by_id" uuid;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "created_by_id" uuid;
ALTER TABLE "lists"    ADD COLUMN IF NOT EXISTS "created_by_id" uuid;
DO $$ BEGIN
  ALTER TABLE "spaces" ADD CONSTRAINT "spaces_created_by_fk"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_fk"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "lists" ADD CONSTRAINT "lists_created_by_fk"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

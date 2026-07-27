-- §13.4 Trash — every soft-deletable container/item records WHEN it was
-- deleted and WHO deleted it, so a workspace Trash can show "Deleted on" and
-- "Deleted by", filter by member, and auto-purge after 30 days.
--
-- Additive + idempotent: existing rows get NULLs (unknown deletion metadata),
-- which the Trash renders as "—" rather than hiding the row.
ALTER TABLE "spaces"   ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
ALTER TABLE "spaces"   ADD COLUMN IF NOT EXISTS "archived_by_id" uuid;
ALTER TABLE "folders"  ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
ALTER TABLE "folders"  ADD COLUMN IF NOT EXISTS "archived_by_id" uuid;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "archived_by_id" uuid;
ALTER TABLE "lists"    ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
ALTER TABLE "lists"    ADD COLUMN IF NOT EXISTS "archived_by_id" uuid;
ALTER TABLE "tasks"    ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
ALTER TABLE "tasks"    ADD COLUMN IF NOT EXISTS "archived_by_id" uuid;
ALTER TABLE "docs"     ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
ALTER TABLE "docs"     ADD COLUMN IF NOT EXISTS "archived_by_id" uuid;

-- Deleting the user must not delete the trashed row — keep the item restorable.
DO $$ BEGIN
  ALTER TABLE "spaces"   ADD CONSTRAINT "spaces_archived_by_id_users_id_fk"   FOREIGN KEY ("archived_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "folders"  ADD CONSTRAINT "folders_archived_by_id_users_id_fk"  FOREIGN KEY ("archived_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "projects" ADD CONSTRAINT "projects_archived_by_id_users_id_fk" FOREIGN KEY ("archived_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "lists"    ADD CONSTRAINT "lists_archived_by_id_users_id_fk"    FOREIGN KEY ("archived_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "tasks"    ADD CONSTRAINT "tasks_archived_by_id_users_id_fk"    FOREIGN KEY ("archived_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "docs"     ADD CONSTRAINT "docs_archived_by_id_users_id_fk"     FOREIGN KEY ("archived_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The Trash lists archived rows newest-first and the purge job scans by age.
CREATE INDEX IF NOT EXISTS "idx_spaces_archived"   ON "spaces"   ("is_archived", "archived_at");
CREATE INDEX IF NOT EXISTS "idx_folders_archived"  ON "folders"  ("is_archived", "archived_at");
CREATE INDEX IF NOT EXISTS "idx_projects_archived" ON "projects" ("is_archived", "archived_at");
CREATE INDEX IF NOT EXISTS "idx_lists_archived"    ON "lists"    ("is_archived", "archived_at");
CREATE INDEX IF NOT EXISTS "idx_tasks_archived"    ON "tasks"    ("is_archived", "archived_at");
CREATE INDEX IF NOT EXISTS "idx_docs_archived"     ON "docs"     ("is_archived", "archived_at");

-- Backfill: anything already archived gets its updated_at as a best-effort
-- deletion time so it sorts sensibly and the 30-day purge has a baseline.
UPDATE "spaces"   SET "archived_at" = "updated_at" WHERE "is_archived" = true AND "archived_at" IS NULL;
UPDATE "folders"  SET "archived_at" = "updated_at" WHERE "is_archived" = true AND "archived_at" IS NULL;
UPDATE "projects" SET "archived_at" = "updated_at" WHERE "is_archived" = true AND "archived_at" IS NULL;
UPDATE "lists"    SET "archived_at" = "updated_at" WHERE "is_archived" = true AND "archived_at" IS NULL;
UPDATE "tasks"    SET "archived_at" = "updated_at" WHERE "is_archived" = true AND "archived_at" IS NULL;
UPDATE "docs"     SET "archived_at" = "updated_at" WHERE "is_archived" = true AND "archived_at" IS NULL;

-- Space/project membership + visibility (Area 3). Additive + idempotent.
-- Existing containers default to 'public' so no member loses access; each
-- container's creator is seeded as an explicit 'admin' member so a later
-- private-conversion never orphans it.
DO $$ BEGIN
  CREATE TYPE "container_role" AS ENUM('admin','edit','comment','view');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "container_visibility" AS ENUM('public','private');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "spaces"   ADD COLUMN IF NOT EXISTS "visibility" "container_visibility" NOT NULL DEFAULT 'public';
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "visibility" "container_visibility";

CREATE TABLE IF NOT EXISTS "space_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "space_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role" "container_role" NOT NULL DEFAULT 'edit',
  "added_by_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "project_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role" "container_role" NOT NULL DEFAULT 'edit',
  "added_by_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN ALTER TABLE "space_members" ADD CONSTRAINT "space_members_space_fk" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "space_members" ADD CONSTRAINT "space_members_user_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "space_members" ADD CONSTRAINT "space_members_added_by_fk" FOREIGN KEY ("added_by_id") REFERENCES "users"("id") ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "space_members" ADD CONSTRAINT "uq_space_members_space_user" UNIQUE ("space_id","user_id"); EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "project_members" ADD CONSTRAINT "project_members_added_by_fk" FOREIGN KEY ("added_by_id") REFERENCES "users"("id") ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "project_members" ADD CONSTRAINT "uq_project_members_project_user" UNIQUE ("project_id","user_id"); EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "idx_space_members_space" ON "space_members" ("space_id");
CREATE INDEX IF NOT EXISTS "idx_space_members_user" ON "space_members" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_project_members_project" ON "project_members" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_project_members_user" ON "project_members" ("user_id");

-- Creator seeding (no lockout): every container creator becomes an admin member.
INSERT INTO "space_members" ("space_id","user_id","role","added_by_id")
  SELECT "id","created_by_id",'admin',"created_by_id" FROM "spaces" WHERE "created_by_id" IS NOT NULL
  ON CONFLICT ("space_id","user_id") DO NOTHING;
INSERT INTO "project_members" ("project_id","user_id","role","added_by_id")
  SELECT "id","created_by_id",'admin',"created_by_id" FROM "projects" WHERE "created_by_id" IS NOT NULL
  ON CONFLICT ("project_id","user_id") DO NOTHING;

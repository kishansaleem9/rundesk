-- Scoped status templates (Space + Project level). Additive + idempotent.
--
-- Today every List owns its own `list_statuses` pipeline. This migration adds
-- Space- and Project-scoped status *templates* so a status set can be defined
-- once and shared, matching the plan's status hierarchy. It is a foundation:
--   * `space_statuses` / `project_statuses` mirror `list_statuses`.
--   * `lists.status_scope` records which level a list draws its statuses from;
--     it defaults to 'list', so EVERY existing list keeps its current pipeline
--     and no runtime behaviour changes until a list is explicitly re-scoped.
--   * The templates are backfilled losslessly from the statuses that already
--     exist on each scope's lists, then a guard RAISES EXCEPTION if any status
--     key present in `list_statuses` failed to land in its scope's template.

-- 1. Tables ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "space_statuses" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "space_id"   uuid NOT NULL,
  "key"        text NOT NULL,
  "name"       text NOT NULL,
  "color"      text NOT NULL DEFAULT '#94a3b8',
  "category"   text NOT NULL DEFAULT 'open',
  "position"   integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "project_statuses" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL,
  "key"        text NOT NULL,
  "name"       text NOT NULL,
  "color"      text NOT NULL DEFAULT '#94a3b8',
  "category"   text NOT NULL DEFAULT 'open',
  "position"   integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- 2. Constraints + indexes ---------------------------------------------------
DO $$ BEGIN ALTER TABLE "space_statuses" ADD CONSTRAINT "space_statuses_space_fk" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "space_statuses" ADD CONSTRAINT "uq_space_statuses_space_key" UNIQUE ("space_id","key"); EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "project_statuses" ADD CONSTRAINT "project_statuses_project_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "project_statuses" ADD CONSTRAINT "uq_project_statuses_project_key" UNIQUE ("project_id","key"); EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "idx_space_statuses_space_position" ON "space_statuses" ("space_id","position");
CREATE INDEX IF NOT EXISTS "idx_project_statuses_project_position" ON "project_statuses" ("project_id","position");

-- 3. lists.status_scope ------------------------------------------------------
ALTER TABLE "lists" ADD COLUMN IF NOT EXISTS "status_scope" text NOT NULL DEFAULT 'list';
DO $$ BEGIN
  ALTER TABLE "lists" ADD CONSTRAINT "lists_status_scope_check" CHECK ("status_scope" IN ('list','project','space'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. Lossless backfill -------------------------------------------------------
-- Project template = one row per (project, key), taking the definition from the
-- lowest-ordered list that defines that key. list_statuses is left untouched.
INSERT INTO "project_statuses" ("project_id","key","name","color","category","position")
SELECT DISTINCT ON (l."project_id", ls."key")
  l."project_id", ls."key", ls."name", ls."color", ls."category", ls."position"
FROM "list_statuses" ls
JOIN "lists" l ON l."id" = ls."list_id"
ORDER BY l."project_id", ls."key", l."position", ls."position", ls."id"
ON CONFLICT ("project_id","key") DO NOTHING;

-- Space template = one row per (space, key), taking the definition from the
-- lowest-ordered (project, list) that defines that key.
INSERT INTO "space_statuses" ("space_id","key","name","color","category","position")
SELECT DISTINCT ON (p."space_id", ls."key")
  p."space_id", ls."key", ls."name", ls."color", ls."category", ls."position"
FROM "list_statuses" ls
JOIN "lists" l ON l."id" = ls."list_id"
JOIN "projects" p ON p."id" = l."project_id"
ORDER BY p."space_id", ls."key", p."position", l."position", ls."position", ls."id"
ON CONFLICT ("space_id","key") DO NOTHING;

-- 5. Losslessness guard ------------------------------------------------------
-- Every (scope, key) that exists in list_statuses MUST now exist in the scope's
-- template. If not, the backfill silently dropped a status — abort the txn.
DO $$
DECLARE
  missing_project integer;
  missing_space integer;
BEGIN
  SELECT count(*) INTO missing_project
  FROM (
    SELECT DISTINCT l."project_id" AS project_id, ls."key" AS key
    FROM "list_statuses" ls JOIN "lists" l ON l."id" = ls."list_id"
  ) src
  LEFT JOIN "project_statuses" ps ON ps."project_id" = src.project_id AND ps."key" = src.key
  WHERE ps."id" IS NULL;

  SELECT count(*) INTO missing_space
  FROM (
    SELECT DISTINCT p."space_id" AS space_id, ls."key" AS key
    FROM "list_statuses" ls
    JOIN "lists" l ON l."id" = ls."list_id"
    JOIN "projects" p ON p."id" = l."project_id"
  ) src
  LEFT JOIN "space_statuses" ss ON ss."space_id" = src.space_id AND ss."key" = src.key
  WHERE ss."id" IS NULL;

  IF missing_project > 0 OR missing_space > 0 THEN
    RAISE EXCEPTION 'scoped-status backfill is lossy: % unmapped project keys, % unmapped space keys', missing_project, missing_space;
  END IF;
END $$;

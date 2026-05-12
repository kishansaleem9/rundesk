-- Custom statuses per List: drop the fixed task_status pgEnum, replace it
-- with a free-text key that maps to a per-list `list_statuses` row. Each
-- list gets seeded with the original 6 defaults so existing tasks keep
-- working unchanged.

-- 1. Convert tasks.status from enum -> text (preserves all current values).
ALTER TABLE "tasks" ALTER COLUMN "status" TYPE text USING "status"::text;
ALTER TABLE "tasks" ALTER COLUMN "status" SET DEFAULT 'todo';

-- 2. Drop the now-orphaned enum (no other tables reference it).
DROP TYPE IF EXISTS "task_status";

-- 3. Add the denormalised category bucket so reports / automations / "is
--    this task closed?" checks remain stable when users rename statuses.
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "status_category" text NOT NULL DEFAULT 'open';

UPDATE "tasks" SET "status_category" =
  CASE
    WHEN "status" IN ('done', 'cancelled')       THEN 'closed'
    WHEN "status" IN ('in_progress', 'in_review') THEN 'in_progress'
    ELSE 'open'
  END
WHERE "status_category" = 'open';

CREATE INDEX IF NOT EXISTS "idx_tasks_list_status" ON "tasks" ("list_id", "status");

-- 4. The list_statuses table.
CREATE TABLE IF NOT EXISTS "list_statuses" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "list_id"    uuid NOT NULL,
  "key"        text NOT NULL,
  "name"       text NOT NULL,
  "color"      text NOT NULL DEFAULT '#94a3b8',
  "category"   text NOT NULL DEFAULT 'open',
  "position"   integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "list_statuses"
    ADD CONSTRAINT "list_statuses_list_id_fk"
    FOREIGN KEY ("list_id") REFERENCES "lists"("id") ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "list_statuses"
    ADD CONSTRAINT "uq_list_statuses_list_key" UNIQUE ("list_id", "key");
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "idx_list_statuses_list_position"
  ON "list_statuses" ("list_id", "position");

-- 5. Seed the 6 default statuses for every existing list.
INSERT INTO "list_statuses" ("list_id", "key", "name", "color", "category", "position")
SELECT
  l.id,
  d.key,
  d.name,
  d.color,
  d.category,
  d.position
FROM "lists" l
CROSS JOIN (
  VALUES
    ('backlog',     'Backlog',     '#94a3b8', 'open',         0),
    ('todo',        'To do',       '#64748b', 'open',         1),
    ('in_progress', 'In progress', '#3b82f6', 'in_progress',  2),
    ('in_review',   'In review',   '#a855f7', 'in_progress',  3),
    ('done',        'Done',        '#10b981', 'closed',       4),
    ('cancelled',   'Cancelled',   '#f43f5e', 'closed',       5)
) AS d(key, name, color, category, position)
ON CONFLICT ("list_id", "key") DO NOTHING;

-- §A4 Admin & People — four small additions, each backing one screen that had
-- no column to read from.

-- §A4.3 — a team is only useful daily if you can @-mention it. The handle is
-- separate from `name` so renaming a team ("Design" -> "Brand & Design") does
-- not silently break every message that addressed it.
ALTER TABLE "workspace_groups"
  ADD COLUMN IF NOT EXISTS "alias" text;

-- Handles resolve per workspace, case-insensitively — "@Design" and "@design"
-- must not be two different teams. NULL means the team has no handle yet.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_workspace_groups_alias"
  ON "workspace_groups" ("workspace_id", lower("alias"))
  WHERE "alias" IS NOT NULL;

-- Backfill a handle for every team that already exists, derived from its name
-- the same way the API derives one, so @-mentions work on day one rather than
-- only for teams created after this migration. Collisions inside a workspace
-- get a numeric suffix; a name with no usable characters is left NULL.
UPDATE "workspace_groups" g
SET "alias" = s.candidate
FROM (
  SELECT id,
         CASE WHEN rn = 1 THEN base ELSE left(base, 29) || '-' || rn END AS candidate
  FROM (
    SELECT id,
           base,
           row_number() OVER (PARTITION BY workspace_id, base ORDER BY created_at, id) AS rn
    FROM (
      SELECT id,
             workspace_id,
             created_at,
             nullif(
               trim(both '-_' from left(regexp_replace(lower(name), '[^a-z0-9_-]+', '-', 'g'), 32)),
               ''
             ) AS base
      FROM "workspace_groups"
      WHERE "alias" IS NULL
    ) named
  ) ranked
  WHERE base IS NOT NULL AND length(base) >= 2
) s
WHERE g.id = s.id AND g."alias" IS NULL;

-- §A4.2 — the two sharing policies that matter for an agency holding client
-- data. Both default to the permissive behaviour every existing workspace
-- already has, so enabling them is an explicit act.
ALTER TABLE "workspaces"
  ADD COLUMN IF NOT EXISTS "default_space_private"  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "block_public_sharing"   boolean NOT NULL DEFAULT false;

-- §A4.8 — presence derived from last_seen_at reports activity, never intent.
-- NULL keeps the derived value; a non-null value is the user's own override and
-- wins on the read path. 'auto' is expressed as NULL rather than a sentinel so
-- clearing the override is a single UPDATE ... SET NULL.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "presence_status" text;

ALTER TABLE "users"
  DROP CONSTRAINT IF EXISTS "users_presence_status_check";
ALTER TABLE "users"
  ADD CONSTRAINT "users_presence_status_check"
  CHECK ("presence_status" IS NULL OR "presence_status" IN ('online', 'away', 'busy', 'offline'));

-- §A4.10 — the useful 20% of ClickUp's work-schedule model: a person on leave
-- should stop absorbing planned load in the workload heat-map. Dates are stored
-- as `date`, not timestamps: leave is a calendar concept and must not shift by
-- a timezone when it is read back.
CREATE TABLE IF NOT EXISTS "time_off" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id"  uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "user_id"       uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "starts_on"     date NOT NULL,
  "ends_on"       date NOT NULL,
  "note"          text,
  "created_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "time_off_range_check" CHECK ("ends_on" >= "starts_on")
);

-- The workload report asks one question: which of this workspace's people are
-- away inside this window.
CREATE INDEX IF NOT EXISTS "idx_time_off_workspace_range"
  ON "time_off" ("workspace_id", "starts_on", "ends_on");
CREATE INDEX IF NOT EXISTS "idx_time_off_user"
  ON "time_off" ("user_id");

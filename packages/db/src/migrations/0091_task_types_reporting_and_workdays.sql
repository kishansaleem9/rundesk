-- Three items lifted off the skip list after review.
--
-- 1. Task types — ClickUp's "Task Types" (task / milestone / campaign / …).
--    Renaming what a row *is* changes how a team classifies work, which is
--    worth more to an agency than the settings furniture around it.
-- 2. Reports-to — she assigns managers in the walkthrough (02:38). One column
--    plus a tree, not an org-chart product.
-- 3. Work days + holidays — capacity is already per member
--    (workspace_members.weekly_capacity_hours); what workload could not see was
--    which days actually count. Days off already landed in 0090.

CREATE TABLE IF NOT EXISTS "task_types" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "name"         text NOT NULL,
  -- Emoji or short token, shown beside the task title.
  "icon"         text,
  "color"        text,
  -- The type new tasks get when none is chosen. At most one per workspace.
  "is_default"   boolean NOT NULL DEFAULT false,
  "position"     integer NOT NULL DEFAULT 0,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "task_types_workspace_idx" ON "task_types" ("workspace_id");
-- One default per workspace, enforced rather than merely intended.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_task_types_one_default"
  ON "task_types" ("workspace_id") WHERE "is_default";

-- SET NULL, not CASCADE: deleting a type must never delete the work filed under it.
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "task_type_id" uuid
  REFERENCES "task_types"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "tasks_task_type_idx" ON "tasks" ("task_type_id");

-- Reporting line, per workspace rather than per user: the same person can
-- report to different people in different workspaces.
ALTER TABLE "workspace_members" ADD COLUMN IF NOT EXISTS "manager_id" uuid
  REFERENCES "users"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "workspace_members_manager_idx" ON "workspace_members" ("manager_id");

-- ISO weekday numbers that count as working days: 1 = Monday … 7 = Sunday.
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "work_days" integer[]
  NOT NULL DEFAULT '{1,2,3,4,5}';

CREATE TABLE IF NOT EXISTS "workspace_holidays" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "day"          date NOT NULL,
  "name"         text NOT NULL,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_workspace_holidays_day"
  ON "workspace_holidays" ("workspace_id", "day");

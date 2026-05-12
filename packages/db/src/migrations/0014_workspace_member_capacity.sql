ALTER TABLE "workspace_members"
  ADD COLUMN IF NOT EXISTS "weekly_capacity_hours" integer NOT NULL DEFAULT 40;

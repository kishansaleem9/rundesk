-- Milestone marker on tasks (Plan §5). A key deliverable, shown as a diamond on
-- the timeline and badged in lists. Additive; defaults to false.
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "is_milestone" boolean NOT NULL DEFAULT false;

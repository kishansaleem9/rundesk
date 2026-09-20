-- §V2-08 frame `15:32` — the task context menu draws **Archive** and **Delete**
-- as two separate rows. Rundesk had one soft archive and no delete at all:
-- `DELETE /tasks/:id` set `is_archived`, and the workspace Trash listed tasks
-- by that same flag, so archiving a task and deleting it were literally the
-- same state under two names.
--
-- These two columns split them. From here:
--
--   archive → is_archived = true, archived_at set, deleted_at IS NULL
--             kept for good, listed under /workspaces/:id/archived-tasks
--   delete  → is_archived = true, deleted_at + deleted_by_id set
--             listed in the Trash, restorable for TRASH_RETENTION_DAYS (30),
--             then hard-deleted by the same nightly purge as every other type
--
-- `is_archived` stays true for both because every read path in the product —
-- lists, search, reports, planner, AI, calendar sync — hides a task on that one
-- flag. A delete that left it false would put the task back on screen.
--
-- Additive and idempotent: existing rows get NULL, which means "never deleted",
-- so nothing already archived is retroactively binned or scheduled for purge.
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "deleted_by_id" uuid;

-- Deleting the user must not delete the binned task — keep it restorable.
DO $$ BEGIN
  ALTER TABLE "tasks" ADD CONSTRAINT "tasks_deleted_by_id_users_id_fk"
    FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The Trash lists binned tasks newest-first and the purge job scans by age;
-- both read this column and nothing else.
CREATE INDEX IF NOT EXISTS "idx_tasks_deleted_at" ON "tasks" ("deleted_at");

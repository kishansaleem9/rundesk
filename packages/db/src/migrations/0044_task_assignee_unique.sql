-- Enforce one assignment per (task, user). Additive + idempotent. Existing
-- duplicates (from addAssignee's no-op onConflict without this constraint) are
-- collapsed to a single row before the unique index is created (Plan §5).
DELETE FROM "task_assignees" a
USING "task_assignees" b
WHERE a.task_id = b.task_id
  AND a.user_id = b.user_id
  AND a.ctid > b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS "task_assignees_task_user_unique"
  ON "task_assignees" ("task_id", "user_id");

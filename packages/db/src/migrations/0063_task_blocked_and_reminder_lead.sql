-- §4.4 'task_blocked' notification type — fired when a blocking dependency
-- leaves a task blocked, notifying the blocked task's assignees + watchers.
-- §10.4 per-user reminder lead days on the notification_preferences jsonb
-- (default [1, 2]); backfilled here so existing rows carry the field
-- explicitly (the notifications service also merges the default on read).
-- Additive + idempotent. ADD VALUE IF NOT EXISTS is safe and the new value is
-- not used in this migration; the backfill only touches rows lacking the key.
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'task_blocked';--> statement-breakpoint
UPDATE "users"
SET "notification_preferences" = jsonb_set("notification_preferences", '{reminderLeadDays}', '[1, 2]'::jsonb, true)
WHERE "notification_preferences" -> 'reminderLeadDays' IS NULL;

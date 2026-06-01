-- The `notification_type` enum is normally created by the drizzle-kit push
-- baseline (see packages/db/README.md). Guard its creation here so this
-- migration is self-healing and a from-scratch `drizzle-kit migrate` does not
-- fail with `type "notification_type" does not exist`. On an existing
-- (push-bootstrapped) database the CREATE is a no-op and only the
-- `ADD VALUE IF NOT EXISTS` statements below take effect.
DO $$ BEGIN
 CREATE TYPE "public"."notification_type" AS ENUM (
   'task_assigned',
   'task_mentioned',
   'task_commented',
   'task_due_soon',
   'task_overdue',
   'task_status_changed',
   'task_updated',
   'chat_message',
   'doc_mentioned',
   'doc_commented'
 );
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'task_updated';--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'chat_message';

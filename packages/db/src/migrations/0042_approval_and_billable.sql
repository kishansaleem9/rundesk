-- §10.1 'approval_needed' notification type + §8.3 per-project billable default.
-- Additive + idempotent.
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'approval_needed';
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "default_billable" boolean NOT NULL DEFAULT false;

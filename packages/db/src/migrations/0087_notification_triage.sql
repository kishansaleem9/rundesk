-- Inbox triage (§A2.6): a notification could only be read or unread, so
-- "Cleared" and "Later" had nowhere to live and every tab collapsed back into
-- the same list. Two timestamps carry all three states — cleared rows have
-- dismissed_at, snoozed rows have a snoozed_until in the future, and everything
-- else is the Inbox.
ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "dismissed_at"   timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "snoozed_until"  timestamp with time zone;

-- The inbox list is always scoped to one user and always partitions on these
-- two columns, so they belong in the same index as the owner.
CREATE INDEX IF NOT EXISTS "idx_notifications_user_triage"
  ON "notifications" ("user_id", "dismissed_at", "snoozed_until");

-- §A2.11 — the delivery-preferences test send needs a type of its own; borrowing
-- ai_briefing would have mislabelled it in the inbox and mis-routed its email.
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'test_notification';

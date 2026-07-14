-- Per-channel notification preferences (Plan 6.2 mute + 6.9 per-channel level).
-- Additive + idempotent. 'all' (default) = notify on every message; 'mentions'
-- = only when @mentioned; 'none' = muted. Existing members default to 'all',
-- so no behaviour change.
ALTER TABLE "chat_channel_members" ADD COLUMN IF NOT EXISTS "notification_level" text NOT NULL DEFAULT 'all';
DO $$ BEGIN
  ALTER TABLE "chat_channel_members"
    ADD CONSTRAINT "chat_channel_members_notification_level_check"
    CHECK ("notification_level" IN ('all','mentions','none'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

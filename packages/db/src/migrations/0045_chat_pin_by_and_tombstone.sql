-- Pin attribution + soft-delete tombstone for chat messages (Plan §6).
-- Additive + idempotent. Existing rows: pinned_by_id/deleted_at NULL.
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "pinned_by_id" uuid;
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;

DO $$ BEGIN
  ALTER TABLE "chat_messages"
    ADD CONSTRAINT "chat_messages_pinned_by_id_users_id_fk"
    FOREIGN KEY ("pinned_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

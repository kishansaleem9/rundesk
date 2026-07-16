-- Chat delivery receipts (Plan §6.2) + saved-message tags (Plan §6.7).
-- Additive + idempotent.
--
-- last_delivered_at mirrors last_read_at (read receipts, 0031): the client marks
-- delivery when it receives/opens a channel's messages. A message is then
-- "Delivered" to a member whose last_delivered_at >= the message's created_at,
-- and "Seen" once last_read_at >= created_at (Seen supersedes Delivered).
ALTER TABLE "chat_channel_members" ADD COLUMN IF NOT EXISTS "last_delivered_at" timestamptz;

-- Saved-message tags: a user can tag their bookmarks and filter the Saved panel
-- by tag + free-text search. Defaults to an empty array so existing saves are
-- untouched.
ALTER TABLE "chat_message_saves" ADD COLUMN IF NOT EXISTS "tags" text[] NOT NULL DEFAULT '{}';

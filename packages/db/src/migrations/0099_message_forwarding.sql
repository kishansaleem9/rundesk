-- §12 [15:00] — "aap 'View Message' dekhoge to aap us group mein chale jaoge."
--
-- Forwarding posted the body text as a new message and kept nothing else, so a
-- forwarded message was indistinguishable from one somebody typed, and there
-- was no way back to where it came from.
--
-- ON DELETE SET NULL, not CASCADE: deleting the original must not delete every
-- copy anyone forwarded from it. The copy stays and loses its link, which is
-- honest — the thing it pointed at really is gone.
ALTER TABLE "chat_messages"
  ADD COLUMN IF NOT EXISTS "forwarded_from_id" uuid
  REFERENCES "chat_messages"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_chat_messages_forwarded_from"
  ON "chat_messages" ("forwarded_from_id");

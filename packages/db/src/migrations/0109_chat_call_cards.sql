-- §2.8 gap 9 — the call card in the channel.
--
-- > "You're in the SyncUp / Wait for your team to join!" … "SyncUp Ended /
-- >  Lasted 45s · 1 person joined" … "Join the SyncUp"  [19:25-19:57, 21:10]
--
-- A message that points at a call IS the card. That is why this is one nullable
-- reference rather than a message-kind enum: there is exactly one kind of
-- non-text message today, and a column that answers "which call?" answers
-- "is this a card?" for free.
--
-- SET NULL rather than CASCADE. Deleting a call must not delete the message
-- that announced it — the channel should still read "Hamda started a SyncUp"
-- afterwards, the same way a forwarded message survives its original.

ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "call_id" uuid
  REFERENCES "calls"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "chat_messages_call_idx" ON "chat_messages" ("call_id");

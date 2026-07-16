-- Chat message edit history (Plan §6.3). Editing a message previously overwrote
-- the body in place, discarding earlier text. Each edit now snapshots the PRIOR
-- body here so the full history survives; `edited_at` is when that version was
-- superseded. Additive + idempotent.
CREATE TABLE IF NOT EXISTS "chat_message_edits" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "message_id"    uuid NOT NULL REFERENCES "chat_messages"("id") ON DELETE CASCADE,
  "previous_body" text NOT NULL,
  "edited_at"     timestamptz NOT NULL DEFAULT now()
);

-- Fetch a message's history newest-first without a table scan.
CREATE INDEX IF NOT EXISTS "chat_message_edits_message_idx" ON "chat_message_edits" ("message_id");

-- Files shared in chat (Plan §6.8). Additive.
CREATE TABLE IF NOT EXISTS "chat_message_attachments" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "channel_id"    uuid NOT NULL REFERENCES "chat_channels"("id") ON DELETE CASCADE,
  "message_id"    uuid REFERENCES "chat_messages"("id") ON DELETE CASCADE,
  "file_name"     text NOT NULL,
  "content_type"  text NOT NULL,
  "size_bytes"    integer NOT NULL,
  "storage_key"   text NOT NULL,
  "uploaded_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "chat_message_attachments_message_idx" ON "chat_message_attachments" ("message_id");

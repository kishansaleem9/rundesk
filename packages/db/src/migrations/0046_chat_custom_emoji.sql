-- Workspace custom emoji (Plan §6). Additive + idempotent.
CREATE TABLE IF NOT EXISTS "chat_custom_emoji" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id"  uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "shortcode"     text NOT NULL,
  "image_url"     text NOT NULL,
  "created_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "chat_custom_emoji_workspace_shortcode_unique"
  ON "chat_custom_emoji" ("workspace_id", "shortcode");

-- Channel management gaps (Plan §6.1). All additive + idempotent.
--   space_id   — optional space scoping; null = workspace-level channel. Deleting
--                a space reverts its channels to workspace-level (SET NULL), keeping
--                chat history rather than cascading it away.
--   icon       — optional channel icon (emoji / short token) for the header + sidebar.
--   description — already present via the Drizzle schema; re-asserted defensively so
--                this migration also repairs any DB that predates it.
ALTER TABLE "chat_channels" ADD COLUMN IF NOT EXISTS "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL;
ALTER TABLE "chat_channels" ADD COLUMN IF NOT EXISTS "icon" text;
ALTER TABLE "chat_channels" ADD COLUMN IF NOT EXISTS "description" text;

-- Speeds up sidebar grouping of space-scoped channels.
CREATE INDEX IF NOT EXISTS "chat_channels_space_idx" ON "chat_channels" ("space_id");

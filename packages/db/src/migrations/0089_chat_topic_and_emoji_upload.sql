-- Channel topic (§A3.7). `description` was doing double duty as both the
-- one-line topic under the header and the longer "what this channel is about"
-- blurb; the info panel needs them apart.
ALTER TABLE "chat_channels"
  ADD COLUMN IF NOT EXISTS "topic" text;

-- Custom-emoji upload (§A3.8). Emoji could only be added by pasting an image
-- URL, unlike chat attachments which already presign to R2. Uploaded emoji keep
-- their object key here and the API mints a fresh signed URL on read, so the
-- image never breaks when a signature expires; `image_url` stays the source for
-- emoji added by URL.
ALTER TABLE "chat_custom_emoji"
  ADD COLUMN IF NOT EXISTS "storage_key" text;

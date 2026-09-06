-- §V2-09 — a task cover can be an image, not only a colour.
--
-- Frame `03:10`: the picker offers Gallery | Upload | Link | Search |
-- Attachments with a Remove, and the banner then offers Reposition and Change
-- cover. `cover_color` covered exactly one of those tabs.
--
-- Three columns rather than one, and the separation is the point:
--
--   cover_storage_key  an uploaded file, or one already on the task. A KEY,
--                      presigned on read.
--   cover_image_url    an image elsewhere on the web (the Link tab). Used as-is.
--   cover_offset_y     Reposition, 0-100, for object-position. 50 is centred.
--
-- Task attachments already merged those first two ideas into one column and it
-- broke: a hyperlink attachment is written into `storage_key` and read back
-- through `getObjectUrl`, which either prefixes the CDN host onto an absolute
-- URL or presigns a bucket key named after it. Keeping them apart here is what
-- stops that repeating.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cover_storage_key text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cover_image_url text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cover_offset_y integer NOT NULL DEFAULT 50;

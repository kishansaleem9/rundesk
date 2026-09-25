-- A space's default permission is Full edit, as frame `06:52` shows and the
-- permissions spec says ("public locations default to full edit"), and Full
-- edit is `admin` on this ladder (`found-25-sep/full-edit-enforced-nowhere`).
--
-- The column defaulted to `edit`, and nothing asked for `admin`, so `edit` did
-- everything Full edit does: it made and deleted tasks. Creating and deleting
-- now ask Full edit, and `edit` is ClickUp's Edit. Every space whose default
-- is `edit` has always behaved as Full edit, so it becomes Full edit: what its
-- members may do is unchanged.
ALTER TABLE "spaces" ALTER COLUMN "default_permission" SET DEFAULT 'admin';
UPDATE "spaces" SET "default_permission" = 'admin' WHERE "default_permission" = 'edit';

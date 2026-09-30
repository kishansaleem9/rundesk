-- The public-share lookup had two indexes (`found-30-sep/comment-file-index-only-in-a-migration`).
--
-- 0019 made `docs_public_share_id_unique`, the UNIQUE constraint the viewer's
-- `/d/<slug>` lookup reads, and then `idx_docs_public_share_id` on the same
-- column. The second answers nothing the first does not, and the schema never
-- declared it, so a database built by `drizzle-kit push` (the lanes, CI, a
-- fresh deploy) never had it. Dropped here, so a migrated database and a
-- pushed one hold the same indexes; the constraint and its index stay.
DROP INDEX IF EXISTS "idx_docs_public_share_id";

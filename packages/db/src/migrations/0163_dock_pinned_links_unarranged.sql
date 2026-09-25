-- A dock nobody arranged holds no choice (null) and carries the default tools;
-- one arranged to hold nothing holds `[]` (`found-25-sep/dock-empties-after-the-first-page`).
--
-- The column was NOT NULL DEFAULT '[]', and the first write of anything else to
-- the row — the sidebar's recents, on a person's first page — created it holding
-- `[]`, which the web reads as "chose nothing": every dock emptied itself.
ALTER TABLE "user_dock_configs" ALTER COLUMN "pinned_links" DROP DEFAULT;
ALTER TABLE "user_dock_configs" ALTER COLUMN "pinned_links" DROP NOT NULL;
-- The rows that bug made hold `[]` with nobody having chosen it, and nothing
-- tells them apart from a dock emptied on purpose; the second is one untick
-- away from being made again, the first had no way back. So `[]` becomes "never
-- arranged", and a person who wants an empty dock unticks what it shows.
UPDATE "user_dock_configs" SET "pinned_links" = NULL WHERE "pinned_links" = '[]'::jsonb;

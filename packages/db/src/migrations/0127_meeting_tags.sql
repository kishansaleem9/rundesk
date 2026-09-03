-- §A6 [19:16–19:20], frames 306_1916 / 307_1920 — the meeting-notes toolbar:
-- "funnel icon + 'Filters'; a pill toggle 'My notes' (active by default); the
-- label 'Tags:' followed by chips; a right-aligned 'Search'."
--
-- My notes and Search shipped. Tags did not: `meetings` had no tag column and
-- no label relation, so the one axis her toolbar organises notes by did not
-- exist.
--
-- A text[] on the row rather than a join table, following the precedent this
-- repo already set for exactly this shape of problem — chat_message_saves.tags
-- (0-many free labels somebody applies to their own things, read only to
-- filter). Task LABELS are the other pattern here and are deliberately not
-- reused: those are a shared workspace vocabulary with colours and an admin
-- surface, which is a heavier promise than a meeting note needs.
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "tags" text[] NOT NULL DEFAULT '{}';

-- The only way this is read: "which meetings carry this tag".
CREATE INDEX IF NOT EXISTS "idx_meetings_tags" ON "meetings" USING GIN ("tags");

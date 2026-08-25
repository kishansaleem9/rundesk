-- §15 — thumbs up / thumbs down on an assistant answer (frames 302_1842,
-- 303_1858, the last two icons of the six-icon row).
--
-- A column rather than a table: feedback belongs to exactly one message, is
-- one of three values, and is replaced rather than accumulated. A join table
-- would model a history nobody asked for.
ALTER TABLE "ai_chat_messages" ADD COLUMN IF NOT EXISTS "feedback" text;

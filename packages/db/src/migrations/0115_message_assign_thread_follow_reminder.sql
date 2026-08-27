-- §G11/§G12 — the four chat-message actions that looked built and were not.
--
-- Grouped into one migration because they share a subject: things you can do
-- TO a message, as opposed to things you can do WITH its text. Splitting them
-- would produce four files that only ever get applied together.

-- ---------------------------------------------------------------------------
-- 1. Assign a message  §G11 [15:36]
-- ---------------------------------------------------------------------------
-- "aap us ko ASSIGN bhi kar sakte ho." The button existed and appended a
-- mention to the composer. An assignment is an action item on the message
-- itself — not a task made from it, which we already had and which is a
-- different promise: creating a task moves the work away from the thread that
-- explains it.
CREATE TABLE IF NOT EXISTS "chat_message_assignments" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "message_id"     uuid NOT NULL REFERENCES "chat_messages"("id") ON DELETE CASCADE,
  "assignee_id"    uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "assigned_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "due_at"         timestamptz,
  "resolved_at"    timestamptz,
  "resolved_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"     timestamptz NOT NULL DEFAULT now()
);

-- Assigning the same line to the same person twice is somebody pressing again.
CREATE UNIQUE INDEX IF NOT EXISTS "chat_message_assignments_unique"
  ON "chat_message_assignments" ("message_id", "assignee_id");

-- "What is assigned to me, still open" — the read that makes it worth having.
CREATE INDEX IF NOT EXISTS "chat_message_assignments_assignee_idx"
  ON "chat_message_assignments" ("assignee_id", "resolved_at");

-- ---------------------------------------------------------------------------
-- 2. Mute or follow one thread  §G12 [17:13]
-- ---------------------------------------------------------------------------
-- Muting was channel-wide, which is too blunt to be the answer: silencing a
-- channel to escape one loud thread also silences what you are there for.
--
-- Only the exceptions are stored. The default — you hear about a thread you
-- started or replied to — stays derived, so an untouched thread costs no rows
-- and a row always means somebody deliberately changed their mind about one.
CREATE TABLE IF NOT EXISTS "chat_thread_follows" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "parent_message_id" uuid NOT NULL REFERENCES "chat_messages"("id") ON DELETE CASCADE,
  "user_id"           uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "state"             text NOT NULL,
  "created_at"        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "chat_thread_follows_unique"
  ON "chat_thread_follows" ("parent_message_id", "user_id");

-- ---------------------------------------------------------------------------
-- 3. A reminder can be about a message, or about nothing  §G11 [15:19]
-- ---------------------------------------------------------------------------
-- task_id NOT NULL meant a reminder could only hang off a task, so "remind me
-- about this message" was impossible and `/remind in 2 hours call Ali` had to
-- fabricate a task to carry its own text.
ALTER TABLE "reminders" ALTER COLUMN "task_id" DROP NOT NULL;

ALTER TABLE "reminders"
  ADD COLUMN IF NOT EXISTS "message_id" uuid REFERENCES "chat_messages"("id") ON DELETE CASCADE;

-- Nullable on both sides is not the same as unconstrained: a reminder is about
-- one thing or about nothing. Guarded so re-running is not an error.
DO $$
BEGIN
  ALTER TABLE "reminders"
    ADD CONSTRAINT "reminders_one_subject"
    CHECK ("task_id" IS NULL OR "message_id" IS NULL);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Two notification kinds these need
-- ---------------------------------------------------------------------------
-- Neither fits an existing kind. message_assigned is not task_assigned —
-- nothing was created — and a reminder on a message is not task_due_soon; both
-- have to land on the message, and the Inbox filters by kind, so reusing a
-- near-miss would file them under the wrong chip forever.
--
-- Postgres cannot add an enum value inside a transaction that then uses it, and
-- IF NOT EXISTS makes these safe to re-run.
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'message_assigned';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'message_reminder';

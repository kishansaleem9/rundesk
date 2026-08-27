-- §G06 [05:54] — "meri PRIORITIES kya hain — yaani ke aaj ke din mein mere
-- kaun se important task hain jo karne hain."
--
-- The one thing on the profile panel that is a DECISION rather than a derived
-- list. Assigned-to-me, today-and-overdue, recent activity — those are the app
-- telling you what it already knows. This is the person saying "out of all
-- that, these matter today", and nothing in the product could hold it.
--
-- Favourites are the nearest existing thing and are not it: a favourite pins a
-- task into the sidebar permanently. That is a bookmark. This is a short,
-- ordered, disposable list somebody rewrites most mornings.
CREATE TABLE IF NOT EXISTS "user_priorities" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"      uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  -- A priority points at a task, keeping it live…
  "task_id"      uuid REFERENCES "tasks"("id") ON DELETE CASCADE,
  -- …or it is a line somebody typed. "Call the accountant" is a real priority
  -- that does not deserve a task with a list and a status behind it, and
  -- making the fast case slow is how a daily list stops being used.
  "title"        text,
  "position"     integer NOT NULL DEFAULT 0,
  -- Ticked off rather than deleted, so "I did that today" survives.
  "done_at"      timestamptz,
  "created_at"   timestamptz NOT NULL DEFAULT now()
);

-- The only read: "my priorities in this workspace, in my order".
CREATE INDEX IF NOT EXISTS "user_priorities_owner_idx"
  ON "user_priorities" ("user_id", "workspace_id", "position");

-- The same task cannot be a priority twice. Partial, so it constrains only the
-- rows pointing at a task — typed lines may repeat, because "chase the
-- invoice" twice in a week is somebody doing it twice.
CREATE UNIQUE INDEX IF NOT EXISTS "user_priorities_unique_task"
  ON "user_priorities" ("user_id", "workspace_id", "task_id")
  WHERE "task_id" IS NOT NULL;

-- A priority is a task or a line — never neither.
DO $$
BEGIN
  ALTER TABLE "user_priorities"
    ADD CONSTRAINT "user_priorities_has_subject"
    CHECK ("task_id" IS NOT NULL OR "title" IS NOT NULL);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

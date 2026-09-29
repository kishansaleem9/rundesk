-- Who put a priority on somebody's list (`ledger-rows/row-850`).
--
-- The list was writable by its owner alone, on purpose, and the task sheet's
-- prompt after assigning offered it only when you assigned yourself. ClickUp
-- decides the other way (help centre, "Personal Priorities", formerly LineUp):
-- "Members, Admins, and Owners can add tasks to other people's priorities",
-- assigning asks "Add this task to <name>'s priorities?", and the owner's list
-- shows who added each task and when. `created_at` is the when; this is the
-- who.
--
-- Nullable, as `space_members.added_by_id` is: a row written before this was
-- kept was written by its owner, the only writer there was, and a row keeps
-- its place on the owner's list when the person who added it is deleted.
ALTER TABLE "user_priorities"
  ADD COLUMN IF NOT EXISTS "added_by_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_priorities" ADD CONSTRAINT "user_priorities_added_by_id_users_id_fk" FOREIGN KEY ("added_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- A planner block written to its owner's default calendar keeps the event it
-- became there (`found-25-sep/connected-calendars-read-by-nothing`): moving the
-- block moves that event and deleting it deletes it. The account is set null
-- when it is disconnected; the event stays in their calendar, theirs to keep.
--
-- Named here and in the schema: drizzle's name for this key would be 65
-- characters, and Postgres keeps 63, so a push would read back a name the
-- schema does not say and want to make the key again.
ALTER TABLE "task_time_blocks" ADD COLUMN IF NOT EXISTS "calendar_account_id" uuid;
ALTER TABLE "task_time_blocks" ADD COLUMN IF NOT EXISTS "external_event_id" text;
DO $$ BEGIN
 ALTER TABLE "task_time_blocks" ADD CONSTRAINT "task_time_blocks_calendar_account_fk" FOREIGN KEY ("calendar_account_id") REFERENCES "public"."user_calendar_accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

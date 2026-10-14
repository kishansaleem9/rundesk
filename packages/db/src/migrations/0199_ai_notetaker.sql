-- THE AI NOTETAKER (`commit-log/log-39863ff-1`).
--
--   · `user_calendar_accounts.notetaker_joins`: ClickUp's "Join all meetings for" — the notetaker
--     joins every meeting with a video link on this calendar.
--   · `notetaker_bots`: each visit of the notetaker to a meeting — whose, which meeting, where the
--     visit stands, and the meeting record its notes became.
ALTER TABLE "user_calendar_accounts" ADD COLUMN IF NOT EXISTS "notetaker_joins" boolean DEFAULT false NOT NULL;
CREATE TABLE IF NOT EXISTS "notetaker_bots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"meeting_url" text NOT NULL,
	"platform" text NOT NULL,
	"title" text,
	"join_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"calendar_account_id" uuid,
	"calendar_event_id" text,
	"vendor_bot_id" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"status_detail" text,
	"meeting_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
DO $$ BEGIN
 ALTER TABLE "notetaker_bots" ADD CONSTRAINT "notetaker_bots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "notetaker_bots" ADD CONSTRAINT "notetaker_bots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "notetaker_bots" ADD CONSTRAINT "notetaker_bots_calendar_account_id_user_calendar_accounts_id_fk" FOREIGN KEY ("calendar_account_id") REFERENCES "public"."user_calendar_accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "notetaker_bots" ADD CONSTRAINT "notetaker_bots_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
CREATE INDEX IF NOT EXISTS "idx_notetaker_bots_owner" ON "notetaker_bots" USING btree ("workspace_id","user_id");
CREATE INDEX IF NOT EXISTS "idx_notetaker_bots_status" ON "notetaker_bots" USING btree ("status");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_notetaker_bots_event" ON "notetaker_bots" USING btree ("user_id","calendar_event_id") WHERE calendar_event_id is not null;

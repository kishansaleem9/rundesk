-- Who has seen an announcement, one row per person
-- (`found-28-sep/announcement-views-counted-per-click`). `POST .../view` added
-- 1 to `announcements.views` on every call, and the home page's Mark seen
-- called it on every click, so the count was clicks. A view is now recorded
-- once per person, as a dismissal already was (`announcement_dismissals`),
-- and the counter moves only when a row is new. The counts recorded before
-- this are kept as they are.
CREATE TABLE IF NOT EXISTS "announcement_views" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "announcement_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "viewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "announcement_views" ADD CONSTRAINT "announcement_views_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "announcement_views" ADD CONSTRAINT "announcement_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "announcement_views_unique_announcement_user" ON "announcement_views" USING btree ("announcement_id","user_id");
--> statement-breakpoint
-- The `chat.announcements` feature flag gated nothing and leaves the registry
-- (`found-28-sep/announcements-flag-gates-nothing`); its stored switches and
-- asks go with it.
DELETE FROM "feature_flags" WHERE "flag_key" = 'chat.announcements';
--> statement-breakpoint
DELETE FROM "feature_flag_requests" WHERE "flag_key" = 'chat.announcements';

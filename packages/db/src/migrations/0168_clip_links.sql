-- A clip's stable link (`resume-defects/resume-7`).
--
-- Copy link and New tab on a recorded clip handed out the signed storage URL
-- itself, asked for a day, and nothing said so; the clips page's share dialog
-- signed one for an hour. ClickUp's clip URL is "an unguessable, randomized
-- string of characters" that anyone with the link can open, and a clip is kept
-- until it is deleted (help centre, "Private Attachment Links" and "Clips
-- feature availability and limits"). So a clip gets one token, made the first
-- time somebody asks for its link, and `/clips/<token>` signs the object again
-- on every view. The row goes when the clip is deleted, and with its workspace.
--
-- Keyed by the storage key: a clip is a storage object and nothing else, and
-- section 4's clips table (`resume-defects/s4-clip-link`) is not built yet.
CREATE TABLE IF NOT EXISTS "clip_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "storage_key" text NOT NULL,
  "token" text NOT NULL,
  "created_by_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clip_links" ADD CONSTRAINT "clip_links_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clip_links" ADD CONSTRAINT "clip_links_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "clip_links_token_unique" ON "clip_links" USING btree ("token");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "clip_links_storage_key_unique" ON "clip_links" USING btree ("storage_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clip_links_workspace_idx" ON "clip_links" USING btree ("workspace_id");

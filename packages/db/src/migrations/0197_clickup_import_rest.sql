-- THE REST OF A CLICKUP WORKSPACE THE API GIVES (`found-14-oct/clickup-import-rest-unimported`).
--
--   · `goal_folders`, and `goals.folder_id`: ClickUp's Goal Folders, which its Goals came in without.
--   · `import_pending_channel_members`: a place in an imported channel or direct message held for
--     somebody the import invited, by the address the invitation went to, until they accept it.
CREATE TABLE IF NOT EXISTS "goal_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
 ALTER TABLE "goal_folders" ADD CONSTRAINT "goal_folders_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "goal_folders" ADD CONSTRAINT "goal_folders_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
CREATE INDEX IF NOT EXISTS "idx_goal_folders_workspace" ON "goal_folders" USING btree ("workspace_id","position");
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "folder_id" uuid;
DO $$ BEGIN
 ALTER TABLE "goals" ADD CONSTRAINT "goals_folder_id_goal_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."goal_folders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
CREATE INDEX IF NOT EXISTS "idx_goals_folder" ON "goals" USING btree ("folder_id");
CREATE TABLE IF NOT EXISTS "import_pending_channel_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" text NOT NULL,
	"channel_id" uuid NOT NULL,
	"job_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_import_pending_channel_members" UNIQUE("workspace_id","email","channel_id")
);
DO $$ BEGIN
 ALTER TABLE "import_pending_channel_members" ADD CONSTRAINT "import_pending_channel_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "import_pending_channel_members" ADD CONSTRAINT "import_pending_channel_members_channel_id_chat_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."chat_channels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "import_pending_channel_members" ADD CONSTRAINT "import_pending_channel_members_job_id_clickup_import_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."clickup_import_jobs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
CREATE INDEX IF NOT EXISTS "idx_import_pending_channel_members_email" ON "import_pending_channel_members" USING btree ("workspace_id","email");

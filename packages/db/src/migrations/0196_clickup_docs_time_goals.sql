-- THE REST OF A CLICKUP WORKSPACE: ITS DOCS, ITS TRACKED TIME AND ITS GOALS (`found-14-oct/clickup-docs-time-goals-unimported`).
--
--   · `import_pending_time_entries`: time somebody the import invited tracked on a task, held by the
--     address the invitation went to until they accept it; then a time entry of theirs.
CREATE TABLE IF NOT EXISTS "import_pending_time_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" text NOT NULL,
	"task_id" uuid NOT NULL,
	"job_id" uuid,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"duration_sec" integer NOT NULL,
	"description" text,
	"is_billable" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
 ALTER TABLE "import_pending_time_entries" ADD CONSTRAINT "import_pending_time_entries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "import_pending_time_entries" ADD CONSTRAINT "import_pending_time_entries_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "import_pending_time_entries" ADD CONSTRAINT "import_pending_time_entries_job_id_clickup_import_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."clickup_import_jobs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
CREATE INDEX IF NOT EXISTS "idx_import_pending_time_entries_email" ON "import_pending_time_entries" USING btree ("workspace_id","email");

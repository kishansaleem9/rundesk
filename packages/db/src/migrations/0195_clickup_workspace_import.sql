-- A CLICKUP WORKSPACE, IMPORTED WHOLE, ITS PEOPLE WITH IT (`found-14-oct/clickup-workspace-import-and-people-unbuilt`).
--
--   · `import_grants.provider`: ClickUp beside the other tools signed in to for an import, by its
--     personal API token, kept for the person who pasted it, sealed as every kept token is.
--   · `import_pending_assignees`: a task waiting for somebody the import invited, by the address
--     the invitation went to; made theirs when they accept it.
ALTER TABLE "import_grants" DROP CONSTRAINT IF EXISTS "import_grants_provider_check";
ALTER TABLE "import_grants" ADD CONSTRAINT "import_grants_provider_check" CHECK ("provider" IN ('basecamp', 'asana', 'jira', 'trello', 'todoist', 'wrike', 'monday', 'clickup'));

CREATE TABLE IF NOT EXISTS "import_pending_assignees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" text NOT NULL,
	"task_id" uuid NOT NULL,
	"job_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
 ALTER TABLE "import_pending_assignees" ADD CONSTRAINT "import_pending_assignees_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "import_pending_assignees" ADD CONSTRAINT "import_pending_assignees_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "import_pending_assignees" ADD CONSTRAINT "import_pending_assignees_job_id_clickup_import_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."clickup_import_jobs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "uq_import_pending_assignees" ON "import_pending_assignees" USING btree ("workspace_id","email","task_id");

-- TASKS IN MULTIPLE LISTS, AS CLICKUP'S CLICKAPP (`commit-log/log-713a611-1`).
--
-- A task keeps its home list (`tasks.list_id`) and may be added to other lists
-- of its workspace: the same task in each, read there by whoever may read that
-- list. One row per list it was added to; it goes with the task and with the
-- list, and turning the ClickApp off removes a workspace's rows. The task's
-- activity says when it was added to a list, or taken out of one.

ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'list_added';
--> statement-breakpoint
ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'list_removed';
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "task_lists" (
	"task_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"added_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_lists_pkey" PRIMARY KEY("task_id","list_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_lists" ADD CONSTRAINT "task_lists_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_lists" ADD CONSTRAINT "task_lists_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_lists" ADD CONSTRAINT "task_lists_added_by_id_users_id_fk" FOREIGN KEY ("added_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_lists_list_idx" ON "task_lists" USING btree ("list_id");

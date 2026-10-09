-- "+ Add a new section" in the planner's rail: a person's own sections, as ClickUp's Home Sidebar makes them
-- (a name, an optional emoji, tasks put in by hand, each in one section at a time) — `ledger-rows/row-835`.
CREATE TABLE IF NOT EXISTS "planner_rail_sections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "name" text NOT NULL,
  "emoji" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "planner_rail_sections" ADD CONSTRAINT "planner_rail_sections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "planner_rail_sections" ADD CONSTRAINT "planner_rail_sections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_planner_rail_sections_user_workspace" ON "planner_rail_sections" USING btree ("user_id","workspace_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "planner_rail_section_tasks" (
  "section_id" uuid NOT NULL,
  "task_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "added_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "planner_rail_section_tasks_section_id_task_id_pk" PRIMARY KEY("section_id","task_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "planner_rail_section_tasks" ADD CONSTRAINT "planner_rail_section_tasks_section_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."planner_rail_sections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "planner_rail_section_tasks" ADD CONSTRAINT "planner_rail_section_tasks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "planner_rail_section_tasks" ADD CONSTRAINT "planner_rail_section_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_planner_rail_section_tasks_user_task" ON "planner_rail_section_tasks" USING btree ("user_id","task_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_planner_rail_section_tasks_task" ON "planner_rail_section_tasks" USING btree ("task_id");

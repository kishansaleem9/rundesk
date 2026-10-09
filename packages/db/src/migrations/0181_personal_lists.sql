-- A PERSONAL LIST FOR EVERYBODY, AS CLICKUP'S (`found-24-sep/planner-default-list-read-by-nothing`).
--
-- ClickUp gives each person a Personal List: "the default location for new
-- tasks", a list private to them and not part of the Workspace hierarchy.
-- Here it is a list like any other, so every rule a task answers to reaches
-- it, kept in a space of the workspace's own (`spaces.is_personal`, one per
-- workspace) that no navigation shows, and owned by one person
-- (`lists.personal_of`, one per person in the personal space's container).

ALTER TABLE "spaces" ADD COLUMN IF NOT EXISTS "is_personal" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_spaces_personal_per_workspace" ON "spaces" USING btree ("workspace_id") WHERE "spaces"."is_personal";
--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN IF NOT EXISTS "personal_of" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lists" ADD CONSTRAINT "lists_personal_of_users_id_fk" FOREIGN KEY ("personal_of") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- Every Personal List is called one, side by side in the personal space's
-- container: "List name taken" (0147) is a rule for the lists people name.
DROP INDEX IF EXISTS "uq_lists_project_name_active";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_lists_project_name_active" ON "lists" USING btree ("project_id", lower("name")) WHERE "lists"."is_archived" = false AND "lists"."personal_of" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_lists_personal_per_project" ON "lists" USING btree ("project_id", "personal_of") WHERE "lists"."personal_of" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "workspace_groups" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id"  uuid NOT NULL,
  "name"          text NOT NULL,
  "description"   text,
  "external_id"   text,
  "created_by_id" uuid,
  "created_at"    timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"    timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "workspace_groups" ADD CONSTRAINT "workspace_groups_workspace_id_workspaces_id_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "workspace_groups" ADD CONSTRAINT "workspace_groups_created_by_id_users_id_fk"
    FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "workspace_groups" ADD CONSTRAINT "uq_workspace_groups_workspace_name" UNIQUE ("workspace_id", "name");
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_workspace_groups_workspace" ON "workspace_groups" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_workspace_groups_external" ON "workspace_groups" USING btree ("workspace_id", "external_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "workspace_group_members" (
  "id"       uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "group_id" uuid NOT NULL,
  "user_id"  uuid NOT NULL,
  "added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "workspace_group_members" ADD CONSTRAINT "workspace_group_members_group_id_workspace_groups_id_fk"
    FOREIGN KEY ("group_id") REFERENCES "public"."workspace_groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "workspace_group_members" ADD CONSTRAINT "workspace_group_members_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "workspace_group_members" ADD CONSTRAINT "uq_workspace_group_members_group_user" UNIQUE ("group_id", "user_id");
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_workspace_group_members_user" ON "workspace_group_members" USING btree ("user_id");

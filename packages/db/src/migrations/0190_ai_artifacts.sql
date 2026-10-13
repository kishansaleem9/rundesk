-- WHAT BRAIN MAKES, AS CLICKUP'S ARTIFACTS (`ledger-rows/row-853`, frame `16:50`).
--
--   · `ai_artifacts`: a slide deck Brain made for somebody — theirs until they publish it to a link.
--   · `ai_artifact_versions`: every version of it, kept whole; restoring one writes it again as the newest.
CREATE TABLE IF NOT EXISTS "ai_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by_id" uuid NOT NULL,
	"kind" text DEFAULT 'deck' NOT NULL,
	"title" text NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"publish_token" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_artifacts_kind_check" CHECK ("kind" IN ('deck'))
);
CREATE TABLE IF NOT EXISTS "ai_artifact_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artifact_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"slides" jsonb NOT NULL,
	"prompt" text DEFAULT '' NOT NULL,
	"restored_from" integer,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
 ALTER TABLE "ai_artifacts" ADD CONSTRAINT "ai_artifacts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "ai_artifacts" ADD CONSTRAINT "ai_artifacts_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "ai_artifact_versions" ADD CONSTRAINT "ai_artifact_versions_artifact_id_ai_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."ai_artifacts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "ai_artifact_versions" ADD CONSTRAINT "ai_artifact_versions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
CREATE INDEX IF NOT EXISTS "ai_artifacts_owner_idx" ON "ai_artifacts" USING btree ("created_by_id","workspace_id","updated_at");
CREATE UNIQUE INDEX IF NOT EXISTS "ai_artifacts_publish_token_unique" ON "ai_artifacts" USING btree ("publish_token");
CREATE UNIQUE INDEX IF NOT EXISTS "ai_artifact_versions_unique" ON "ai_artifact_versions" USING btree ("artifact_id","version");

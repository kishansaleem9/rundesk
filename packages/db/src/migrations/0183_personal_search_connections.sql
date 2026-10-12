-- ONE PERSON'S OWN CONNECTED SEARCH (`found-23-sep/connected-search-per-person`).
--
-- ClickUp's Connected Search: a personal connection, made by anybody but a
-- guest for themselves, whose results only they see; and a Workspace one, made
-- by an owner or admin, through which every member finds what the account
-- shares with the whole organization (`workspace_integration_connections`).
-- One row per person, workspace and provider.

CREATE TABLE IF NOT EXISTS "user_search_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"external_account_email" text,
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_user_search_connection" UNIQUE("workspace_id","user_id","provider")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_search_connections" ADD CONSTRAINT "user_search_connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_search_connections" ADD CONSTRAINT "user_search_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
